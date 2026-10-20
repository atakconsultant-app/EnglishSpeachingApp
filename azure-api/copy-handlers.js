// ../api と ../lib をこのフォルダの handlers/ にコピーする（Azure に送られるのはこのフォルダだけのため）。
// サーバー処理の中身は ../api と ../lib の1か所だけで管理し、ここでは複製しない。
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const dest = path.join(__dirname, 'handlers');
fs.rmSync(dest, { recursive: true, force: true });
for (const dir of ['api', 'lib']) {
  fs.cpSync(path.join(root, dir), path.join(dest, dir), { recursive: true });
}
console.log('[azure-api] copied api/ and lib/ into handlers/');
