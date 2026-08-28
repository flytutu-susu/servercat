//
//  RNSsh.m
//  SSH 原生模块：基于 NMSSH（libssh2）
//
//  - 每个会话持有独立的 NMSSHSession 与串行队列
//  - exec 会话与 shell 会话分离（NMSSH startShell 后会话进入非阻塞模式）
//  - shell 输出通过事件 RNSshShellData（base64）推送给 JS
//

#import "RNSsh.h"

// NMSSH 源码已 vendor 到 ios/Vendor/NMSSH（底层库升级为 libssh2 1.11.1 + OpenSSL 3.5.1）
#import "NMSSH.h"

// OpenSSL 3.5（设备端密钥生成用）；3.x 内建线程安全
#import <openssl/evp.h>
#import <openssl/pem.h>
#import <openssl/bn.h>
#import <openssl/bio.h>
#import <openssl/core_names.h>

// ---------------------------------------------------------------------------

@interface RNSshSessionHolder : NSObject
@property (nonatomic, strong) NMSSHSession *session;
@property (nonatomic, strong) dispatch_queue_t queue; // 会话级串行队列
@property (nonatomic, assign) BOOL shellActive;
@end

@implementation RNSshSessionHolder
@end

@interface RNSsh () <NMSSHChannelDelegate>
@property (nonatomic, strong) NSMutableDictionary<NSString *, RNSshSessionHolder *> *sessions;
@property (nonatomic, strong) NSMutableDictionary<NSValue *, NSString *> *channelToSession;
@property (nonatomic, strong) NSLock *lock;
@property (nonatomic, assign) BOOL hasListeners;
@property (nonatomic, assign) NSInteger seq;
@end

@implementation RNSsh

RCT_EXPORT_MODULE(RNSsh)

+ (BOOL)requiresMainQueueSetup {
  return NO;
}

- (instancetype)init {
  if ((self = [super init])) {
    _sessions = [NSMutableDictionary new];
    _channelToSession = [NSMutableDictionary new];
    _lock = [[NSLock alloc] init];
  }
  return self;
}

- (NSArray<NSString *> *)supportedEvents {
  return @[ @"RNSshShellData", @"RNSshShellClosed" ];
}

- (void)startObserving {
  self.hasListeners = YES;
}

- (void)stopObserving {
  self.hasListeners = NO;
}

- (dispatch_queue_t)methodQueue {
  return dispatch_get_main_queue(); // 各方法内部自行切到后台队列
}

// ---------------------------------------------------------------------------
#pragma mark - helpers

- (NSString *)nextSessionId {
  self.seq += 1;
  return [NSString stringWithFormat:@"ssh-%ld-%@", (long)self.seq, [[NSUUID UUID] UUIDString]];
}

- (RNSshSessionHolder *)holderFor:(NSString *)sessionId {
  [self.lock lock];
  RNSshSessionHolder *h = self.sessions[sessionId];
  [self.lock unlock];
  return h;
}

- (void)registerHolder:(RNSshSessionHolder *)holder forId:(NSString *)sessionId {
  [self.lock lock];
  self.sessions[sessionId] = holder;
  [self.lock unlock];
}

- (void)removeHolder:(NSString *)sessionId {
  [self.lock lock];
  [self.sessions removeObjectForKey:sessionId];
  // 清理 channel 映射
  NSMutableArray<NSValue *> *toRemove = [NSMutableArray new];
  for (NSValue *key in self.channelToSession) {
    if ([self.channelToSession[key] isEqualToString:sessionId]) {
      [toRemove addObject:key];
    }
  }
  for (NSValue *key in toRemove) {
    [self.channelToSession removeObjectForKey:key];
  }
  [self.lock unlock];
}

// ---------------------------------------------------------------------------
#pragma mark - exported methods

RCT_EXPORT_METHOD(connect:(NSDictionary *)opts
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  NSString *host = opts[@"host"];
  NSNumber *port = opts[@"port"] ?: @(22);
  NSString *username = opts[@"username"];
  NSNumber *timeout = opts[@"timeout"] ?: @(15);
  NSString *password = opts[@"password"];
  NSString *privateKey = opts[@"privateKey"];
  NSString *passphrase = opts[@"passphrase"];

  if (!host.length || !username.length) {
    reject(@"bad_params", @"缺少主机或用户名", nil);
    return;
  }

  dispatch_async(dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0), ^{
    NMSSHSession *session = [[NMSSHSession alloc] initWithHost:host
                                                          port:[port integerValue]
                                                   andUsername:username];
    if (![session connectWithTimeout:timeout]) {
      NSString *msg = session.lastError.localizedDescription ?: @"无法连接到主机";
      reject(@"connect_failed", [NSString stringWithFormat:@"连接失败：%@", msg], session.lastError);
      return;
    }

    BOOL authorized = NO;
    if (password.length) {
      authorized = [session authenticateByPassword:password];
      if (!authorized) {
        // 部分服务器仅开放 keyboard-interactive
        authorized = [session authenticateByKeyboardInteractiveUsingBlock:^NSString *(NSString *request) {
          return password;
        }];
      }
    } else if (privateKey.length) {
      authorized = [session authenticateByInMemoryPublicKey:nil
                                                 privateKey:privateKey
                                                andPassword:passphrase];
    } else {
      [session disconnect];
      reject(@"bad_params", @"缺少认证信息（密码或私钥）", nil);
      return;
    }

    if (!authorized) {
      NSString *msg = session.lastError.localizedDescription ?: @"认证被拒绝";
      [session disconnect];
      reject(@"auth_failed", [NSString stringWithFormat:@"认证失败：%@", msg], session.lastError);
      return;
    }

    RNSshSessionHolder *holder = [[RNSshSessionHolder alloc] init];
    holder.session = session;
    holder.queue = dispatch_queue_create("app.servercat.ssh.session", DISPATCH_QUEUE_SERIAL);

    NSString *sessionId = [self nextSessionId];
    [self registerHolder:holder forId:sessionId];
    resolve(sessionId);
  });
}

RCT_EXPORT_METHOD(exec:(NSString *)sessionId
                  command:(NSString *)command
                  timeoutSec:(nonnull NSNumber *)timeoutSec
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  RNSshSessionHolder *holder = [self holderFor:sessionId];
  if (!holder) {
    reject(@"no_session", @"会话不存在或已关闭", nil);
    return;
  }
  dispatch_async(holder.queue, ^{
    NSError *error = nil;
    NSString *response = [holder.session.channel execute:command
                                                   error:&error
                                                 timeout:timeoutSec];
    if (error) {
      reject(@"exec_failed", error.localizedDescription, error);
      return;
    }
    resolve(@{
      @"stdout": response ?: @"",
      @"stderr": @"",
      @"code": @(0),
    });
  });
}

RCT_EXPORT_METHOD(startShell:(NSString *)sessionId
                  cols:(nonnull NSNumber *)cols
                  rows:(nonnull NSNumber *)rows
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  RNSshSessionHolder *holder = [self holderFor:sessionId];
  if (!holder) {
    reject(@"no_session", @"会话不存在或已关闭", nil);
    return;
  }
  dispatch_async(holder.queue, ^{
    NMSSHChannel *channel = holder.session.channel;
    channel.delegate = self;
    channel.requestPty = YES;
    channel.ptyTerminalType = NMSSHChannelPtyTerminalXterm;
    channel.bufferSize = 0x8000;

    NSError *error = nil;
    if (![channel startShell:&error]) {
      channel.delegate = nil;
      reject(@"shell_failed", error.localizedDescription ?: @"开启 shell 失败", error);
      return;
    }
    [channel requestSizeWidth:[cols unsignedIntegerValue] height:[rows unsignedIntegerValue]];

    [self.lock lock];
    self.channelToSession[[NSValue valueWithPointer:(__bridge const void *)channel]] = sessionId;
    [self.lock unlock];

    holder.shellActive = YES;
    resolve(@(YES));
  });
}

RCT_EXPORT_METHOD(writeShell:(NSString *)sessionId data:(NSString *)dataBase64) {
  RNSshSessionHolder *holder = [self holderFor:sessionId];
  if (!holder || !holder.shellActive) return;
  NSData *data = [[NSData alloc] initWithBase64EncodedString:dataBase64 options:0];
  if (!data) return;
  dispatch_async(holder.queue, ^{
    NSError *error = nil;
    [holder.session.channel writeData:data error:&error];
  });
}

RCT_EXPORT_METHOD(resizeShell:(NSString *)sessionId
                  cols:(nonnull NSNumber *)cols
                  rows:(nonnull NSNumber *)rows) {
  RNSshSessionHolder *holder = [self holderFor:sessionId];
  if (!holder || !holder.shellActive) return;
  dispatch_async(holder.queue, ^{
    [holder.session.channel requestSizeWidth:[cols unsignedIntegerValue]
                                      height:[rows unsignedIntegerValue]];
  });
}

RCT_EXPORT_METHOD(close:(NSString *)sessionId) {
  RNSshSessionHolder *holder = [self holderFor:sessionId];
  if (!holder) return;
  [self removeHolder:sessionId];
  dispatch_async(holder.queue, ^{
    if (holder.shellActive) {
      holder.session.channel.delegate = nil;
      [holder.session.channel closeShell];
      holder.shellActive = NO;
    }
    [holder.session disconnect];
  });
}

// ---------------------------------------------------------------------------
#pragma mark - 密钥生成（OpenSSL EVP）

// 向缓冲区追加 SSH wire-format 字符串（4 字节大端长度 + 内容）
static void rnssh_wire_put_string(NSMutableData *buf, const void *bytes, NSUInteger len) {
  uint32_t n = CFSwapInt32HostToBig((uint32_t)len);
  [buf appendBytes:&n length:4];
  [buf appendBytes:bytes length:len];
}

static void rnssh_wire_put_bignum(NSMutableData *buf, BIGNUM *bn) {
  int bytes = (BN_num_bits(bn) + 7) / 8;
  NSMutableData *raw = [NSMutableData dataWithLength:bytes];
  BN_bn2bin(bn, (unsigned char *)raw.mutableBytes);
  const uint8_t *p = (const uint8_t *)raw.bytes;
  // 最高位置 1 时需要补 0x00（SSH mpint 为正数补码）
  if (bytes > 0 && (p[0] & 0x80)) {
    NSMutableData *padded = [NSMutableData dataWithLength:bytes + 1];
    ((uint8_t *)padded.mutableBytes)[0] = 0;
    memcpy((uint8_t *)padded.mutableBytes + 1, p, bytes);
    rnssh_wire_put_string(buf, padded.bytes, padded.length);
  } else {
    rnssh_wire_put_string(buf, p, bytes);
  }
}

RCT_EXPORT_METHOD(generateKeyPair:(NSDictionary *)opts
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  NSString *type = opts[@"type"] ?: @"ed25519";
  NSInteger bits = [opts[@"bits"] integerValue] ?: 2048;
  NSString *passphrase = opts[@"passphrase"];
  NSString *comment = opts[@"comment"] ?: @"servercat@iphone";

  dispatch_async(dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0), ^{
    EVP_PKEY_CTX *ctx = NULL;
    EVP_PKEY *pkey = NULL;
    NSMutableData *pubBlob = nil;
    NSString *algoName = nil;

    @try {
      // ---- 生成 ----
      if ([type isEqualToString:@"rsa"]) {
        ctx = EVP_PKEY_CTX_new_id(EVP_PKEY_RSA, NULL);
        if (!ctx || EVP_PKEY_keygen_init(ctx) <= 0 ||
            EVP_PKEY_CTX_set_rsa_keygen_bits(ctx, (int)bits) <= 0 ||
            EVP_PKEY_keygen(ctx, &pkey) <= 0) {
          reject(@"keygen_failed", @"RSA 密钥生成失败", nil);
          return;
        }
        algoName = @"ssh-rsa";

        BIGNUM *n = NULL, *e = NULL;
        if (EVP_PKEY_get_bn_param(pkey, OSSL_PKEY_PARAM_RSA_N, &n) != 1 ||
            EVP_PKEY_get_bn_param(pkey, OSSL_PKEY_PARAM_RSA_E, &e) != 1) {
          reject(@"keygen_failed", @"读取 RSA 公钥参数失败", nil);
          return;
        }
        pubBlob = [NSMutableData new];
        rnssh_wire_put_string(pubBlob, algoName.UTF8String, algoName.length);
        rnssh_wire_put_bignum(pubBlob, e);
        rnssh_wire_put_bignum(pubBlob, n);
        BN_free(n);
        BN_free(e);
      } else {
        ctx = EVP_PKEY_CTX_new_id(EVP_PKEY_ED25519, NULL);
        if (!ctx || EVP_PKEY_keygen_init(ctx) <= 0 || EVP_PKEY_keygen(ctx, &pkey) <= 0) {
          reject(@"keygen_failed", @"ED25519 密钥生成失败", nil);
          return;
        }
        algoName = @"ssh-ed25519";

        size_t rawLen = 0;
        if (EVP_PKEY_get_raw_public_key(pkey, NULL, &rawLen) != 1 || rawLen == 0) {
          reject(@"keygen_failed", @"读取 ED25519 公钥失败", nil);
          return;
        }
        NSMutableData *raw = [NSMutableData dataWithLength:rawLen];
        if (EVP_PKEY_get_raw_public_key(pkey, (unsigned char *)raw.mutableBytes, &rawLen) != 1) {
          reject(@"keygen_failed", @"读取 ED25519 公钥失败", nil);
          return;
        }
        pubBlob = [NSMutableData new];
        rnssh_wire_put_string(pubBlob, algoName.UTF8String, algoName.length);
        rnssh_wire_put_string(pubBlob, raw.bytes, raw.length);
      }

      // ---- 私钥导出（PKCS#8 PEM，可带口令加密） ----
      BIO *bio = BIO_new(BIO_s_mem());
      int ok;
      if (passphrase.length > 0) {
        ok = PEM_write_bio_PKCS8PrivateKey(bio, pkey, EVP_aes_256_cbc(),
                                           NULL, 0, NULL, (void *)passphrase.UTF8String);
      } else {
        ok = PEM_write_bio_PKCS8PrivateKey(bio, pkey, NULL, NULL, 0, NULL, NULL);
      }
      if (ok != 1) {
        BIO_free(bio);
        reject(@"keygen_failed", @"私钥导出失败", nil);
        return;
      }
      char *pemData = NULL;
      long pemLen = BIO_get_mem_data(bio, &pemData);
      NSString *privatePem = [[NSString alloc] initWithBytes:pemData length:pemLen encoding:NSUTF8StringEncoding];
      BIO_free(bio);

      // ---- 公钥行 + 指纹 ----
      NSString *pubB64 = [pubBlob base64EncodedStringWithOptions:0];
      NSString *publicLine = [NSString stringWithFormat:@"%@ %@ %@", algoName, pubB64, comment];

      NSMutableData *digest = [NSMutableData dataWithLength:EVP_MAX_MD_SIZE];
      unsigned int digestLen = 0;
      if (EVP_Digest(pubBlob.bytes, pubBlob.length, (unsigned char *)digest.mutableBytes, &digestLen, EVP_sha256(), NULL) != 1) {
        reject(@"keygen_failed", @"指纹计算失败", nil);
        return;
      }
      NSString *fp = [[NSData dataWithBytes:digest.bytes length:digestLen] base64EncodedStringWithOptions:0];
      while ([fp hasSuffix:@"="]) fp = [fp substringToIndex:fp.length - 1];

      resolve(@{
        @"privateKey": privatePem,
        @"publicKey": publicLine,
        @"fingerprint": [NSString stringWithFormat:@"SHA256:%@", fp],
      });
    } @finally {
      if (pkey) EVP_PKEY_free(pkey);
      if (ctx) EVP_PKEY_CTX_free(ctx);
    }
  });
}

// ---------------------------------------------------------------------------
#pragma mark - NMSSHChannelDelegate
- (void)channel:(NMSSHChannel *)channel didReadRawData:(NSData *)data {
  [self emitShellData:data channel:channel];
}

- (void)channel:(NMSSHChannel *)channel didReadRawError:(NSData *)error {
  [self emitShellData:error channel:channel];
}

- (void)emitShellData:(NSData *)data channel:(NMSSHChannel *)channel {
  if (!self.hasListeners || data.length == 0) return;
  [self.lock lock];
  NSString *sessionId = self.channelToSession[[NSValue valueWithPointer:(__bridge const void *)channel]];
  [self.lock unlock];
  if (!sessionId) return;
  [self sendEventWithName:@"RNSshShellData"
                     body:@{
                       @"sessionId": sessionId,
                       @"data": [data base64EncodedStringWithOptions:0],
                     }];
}

- (void)channelShellDidClose:(NMSSHChannel *)channel {
  [self.lock lock];
  NSValue *key = [NSValue valueWithPointer:(__bridge const void *)channel];
  NSString *sessionId = self.channelToSession[key];
  if (sessionId) {
    [self.channelToSession removeObjectForKey:key];
  }
  [self.lock unlock];

  RNSshSessionHolder *holder = sessionId ? [self holderFor:sessionId] : nil;
  if (holder) {
    holder.shellActive = NO;
    channel.delegate = nil;
  }
  if (sessionId && self.hasListeners) {
    [self sendEventWithName:@"RNSshShellClosed" body:@{ @"sessionId": sessionId }];
  }
}

@end
