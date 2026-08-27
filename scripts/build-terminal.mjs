/** 将 src/terminal/index.ts（xterm）打包为单个自包含 assets/terminal.html */

import { build } from 'esbuild';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outdir = path.join(root, '.terminal-build');

await rm(outdir, { recursive: true, force: true });
await mkdir(outdir, { recursive: true });

await build({
  entryPoints: [path.join(root, 'src/terminal/index.ts')],
  bundle: true,
  minify: true,
  format: 'iife',
  target: 'safari15',
  outdir,
  loader: { '.css': 'css' },
  logLevel: 'warning',
});

const js = await readFile(path.join(outdir, 'index.js'), 'utf8');
let css = '';
try {
  css = await readFile(path.join(outdir, 'index.css'), 'utf8');
} catch {
  // 无样式输出
}

const html = `<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover" />
<style>
html, body { margin: 0; padding: 0; height: 100%; background: #000; overflow: hidden; }
#terminal { position: absolute; inset: 0; padding: 4px 0 0 6px; box-sizing: border-box; }
.xterm { height: 100%; }
::-webkit-scrollbar { width: 0; height: 0; }
</style>
<style>${css}</style>
</head>
<body>
<div id="terminal"></div>
<script>${js.replace(/<\/script>/gi, '<\\/script>')}</script>
</body>
</html>
`;

await mkdir(path.join(root, 'assets'), { recursive: true });
await writeFile(path.join(root, 'assets', 'terminal.html'), html, 'utf8');
await rm(outdir, { recursive: true, force: true });

console.log(`✔ assets/terminal.html (${(html.length / 1024).toFixed(0)} KB)`);
