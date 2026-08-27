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
  /** 关闭 shell 或整个会话 */
  close(sessionId: string): void;
  /** 订阅 shell 输出 */
  onShellData(cb: (e: ShellDataEvent) => void): () => void;
  /** 订阅 shell 关闭事件 */
  onShellClosed(cb: (e: ShellClosedEvent) => void): () => void;
}
