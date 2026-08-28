/** SSH 抽象层类型定义 */

export type SSHAuth =
  | { type: 'password'; password: string }
  | { type: 'key'; privateKey: string; passphrase?: string };

export interface SSHConnectOptions {
  host: string;
  port: number;
  username: string;
  auth: SSHAuth;
  /** 连接超时，秒 */
  timeout?: number;
}

export interface ExecResult {
  stdout: string;
  stderr: string;
  code: number;
}

/** Shell 数据事件载荷（data 为 base64 编码的原始字节） */
export interface ShellDataEvent {
  sessionId: string;
  data: string; // base64
}

export interface ShellClosedEvent {
  sessionId: string;
}

/** 统一 SSH 客户端接口，原生实现与 Mock 实现都遵循它 */
/** 密钥生成参数 */
export interface KeyGenOptions {
  type: 'ed25519' | 'rsa';
  /** RSA 位数（默认 2048），ed25519 忽略 */
  bits?: number;
  /** 私钥口令（可选） */
  passphrase?: string;
  /** 公钥注释（默认 servercat@iphone） */
  comment?: string;
}

/** 生成的密钥对 */
export interface KeyPair {
  /** PEM/PKCS#8 私钥文本 */
  privateKey: string;
  /** OpenSSH authorized_keys 格式公钥行，如 "ssh-ed25519 AAAA... comment" */
  publicKey: string;
  /** SHA256 指纹，如 "SHA256:abc..." */
  fingerprint: string;
}

export interface SSHClient {
  /** 建立连接并完成认证，返回 sessionId */
  connect(opts: SSHConnectOptions): Promise<string>;
  /** 执行一条命令（非交互），返回 stdout/stderr/退出码 */
  exec(sessionId: string, command: string, timeoutSec?: number): Promise<ExecResult>;
  /** 在当前会话上开启交互式 PTY shell */
  startShell(sessionId: string, cols: number, rows: number): Promise<void>;
  /** 向 shell 写入数据（base64 编码的原始字节） */
  writeShell(sessionId: string, dataBase64: string): void;
  /** 调整 PTY 尺寸 */
  resizeShell(sessionId: string, cols: number, rows: number): void;
  /** 生成密钥对（设备端 OpenSSL） */
  generateKeyPair(opts: KeyGenOptions): Promise<KeyPair>;
  /** 关闭 shell 或整个会话 */
  close(sessionId: string): void;
  /** 订阅 shell 输出 */
  onShellData(cb: (e: ShellDataEvent) => void): () => void;
  /** 订阅 shell 关闭事件 */
  onShellClosed(cb: (e: ShellClosedEvent) => void): () => void;
}
