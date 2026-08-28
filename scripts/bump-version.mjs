/** CI 版本同步：tag 构建时把 tag 写入 app.json version，buildNumber 用 run 编号 */

import { readFile, writeFile } from 'node:fs/promises';

const ref = process.env.GITHUB_REF_NAME ?? ''; // 例如 v1.2.0
const runNumber = process.env.GITHUB_RUN_NUMBER ?? '1';

const tagMatch = ref.match(/^v(\d+\.\d+\.\d+)$/);

const appJsonPath = new URL('../app.json', import.meta.url);
const appJson = JSON.parse(await readFile(appJsonPath, 'utf8'));

if (tagMatch) {
  appJson.expo.version = tagMatch[1];
}
appJson.expo.ios = appJson.expo.ios ?? {};
appJson.expo.ios.buildNumber = String(1000 + Number(runNumber));

await writeFile(appJsonPath, JSON.stringify(appJson, null, 2) + '\n');

// 同步 package.json version
const pkgPath = new URL('../package.json', import.meta.url);
const pkg = JSON.parse(await readFile(pkgPath, 'utf8'));
if (tagMatch) pkg.version = tagMatch[1];
await writeFile(pkgPath, JSON.stringify(pkg, null, 2) + '\n');

console.log(`✔ version=${appJson.expo.version} buildNumber=${appJson.expo.ios.buildNumber}`);
