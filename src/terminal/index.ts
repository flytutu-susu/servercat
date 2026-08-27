/** 运行在 WebView 中的 xterm.js 终端，经 esbuild 打包进 assets/terminal.html */

import { FitAddon } from '@xterm/addon-fit';
import { Terminal } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';

declare global {
  interface Window {
    ReactNativeWebView?: { postMessage(msg: string): void };
    __term?: {
      write(b64: string): void;
      clear(): void;
      focus(): void;
    };
  }
}

function post(msg: Record<string, unknown>): void {
  window.ReactNativeWebView?.postMessage(JSON.stringify(msg));
}

function b64encode(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function b64decode(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

const term = new Terminal({
  fontFamily: 'Menlo, monospace',
  fontSize: 13,
  cursorBlink: true,
  cursorStyle: 'block',
  scrollback: 5000,
  theme: {
    background: '#000000',
    foreground: '#E8E8ED',
    cursor: '#30D158',
    cursorAccent: '#000000',
    selectionBackground: '#3A3A3E',
    black: '#1C1C1E',
    red: '#FF453A',
    green: '#30D158',
    yellow: '#FFD60A',
    blue: '#0A84FF',
    magenta: '#BF5AF2',
    cyan: '#64D2FF',
    white: '#E8E8ED',
    brightBlack: '#636366',
    brightRed: '#FF6961',
    brightGreen: '#4BD865',
    brightYellow: '#FFD60A',
    brightBlue: '#409CFF',
    brightMagenta: '#DA8FFF',
    brightCyan: '#70D7FF',
    brightWhite: '#FFFFFF',
  },
});

const fit = new FitAddon();
term.loadAddon(fit);
term.open(document.getElementById('terminal')!);

function doFit(): void {
  try {
    fit.fit();
  } catch {
    // 容器未就绪
  }
}

doFit();
term.focus();

term.onData((data) => {
  post({ type: 'in', data: b64encode(data) });
});

term.onResize(({ cols, rows }) => {
  post({ type: 'resize', cols, rows });
});

window.addEventListener('resize', () => {
  doFit();
});

// WebView 视口变化（键盘弹起等）
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', () => doFit());
}

window.__term = {
  write(b64: string) {
    term.write(b64decode(b64));
  },
  clear() {
    term.clear();
  },
  focus() {
    term.focus();
  },
};

// 通知 RN 端就绪
post({ type: 'ready' });
