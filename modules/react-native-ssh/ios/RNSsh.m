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

// ---------------------------------------------------------------------------
// OpenSSL < 1.1 需要应用层提供线程锁回调；NMSSH 未提供头文件，手工弱引用声明。
// OpenSSL >= 1.1 内建线程安全，符号不存在时（weak import => NULL）直接跳过。
// ---------------------------------------------------------------------------
typedef void (*rnssh_crypto_lock_cb)(int mode, int type, const char *file, int line);
typedef unsigned long (*rnssh_crypto_id_cb)(void);
extern int CRYPTO_num_locks(void) __attribute__((weak_import));
extern void CRYPTO_set_locking_callback(rnssh_crypto_lock_cb cb) __attribute__((weak_import));
extern void CRYPTO_set_id_callback(rnssh_crypto_id_cb cb) __attribute__((weak_import));

#define RNSSH_CRYPTO_LOCK 1
#define RNSSH_CRYPTO_UNLOCK 2
#define RNSSH_CRYPTO_READ 4
#define RNSSH_CRYPTO_WRITE 8

static NSMutableArray<NSLock *> *gCryptoLocks = nil;

static void rnssh_locking_callback(int mode, int type, const char *file, int line) {
  if (type < 0 || type >= (int)gCryptoLocks.count) return;
  NSLock *lock = gCryptoLocks[type];
  if ((mode & RNSSH_CRYPTO_LOCK) || (mode & RNSSH_CRYPTO_READ) || (mode & RNSSH_CRYPTO_WRITE)) {
    [lock lock];
  } else if (mode & RNSSH_CRYPTO_UNLOCK) {
    [lock unlock];
  }
}

static unsigned long rnssh_id_callback(void) {
  return (unsigned long)[NSThread currentThread].hash;
}

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

+ (void)initialize {
  if (self != [RNSsh class]) return;
  // 为多会话并发设置 OpenSSL 线程锁（仅 OpenSSL < 1.1 需要）
  if (CRYPTO_num_locks && CRYPTO_set_locking_callback && CRYPTO_set_id_callback) {
    int n = CRYPTO_num_locks();
    gCryptoLocks = [NSMutableArray arrayWithCapacity:n];
    for (int i = 0; i < n; i++) {
      [gCryptoLocks addObject:[[NSLock alloc] init]];
    }
    CRYPTO_set_locking_callback(rnssh_locking_callback);
    CRYPTO_set_id_callback(rnssh_id_callback);
  }
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
