// Azure Static Web Apps 用に、公開するファイルだけを dist/ にまとめる。
// （サーバー処理のソースや node_modules などを公開しないため）
import { cpSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import './gen-config.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const dist = join(root, 'dist');
const PUBLIC = [
  'index.html', 'i18n.js', 'auth-client.js', 'supabase-config.js', 'intro.css', 'pages.css',
  'staticwebapp.config.json', 'themes', 'videos', 'auth', 'legal',
];

rmSync(dist, { recursive: true, force: true });
mkdirSync(join(dist, 'i18n'), { recursive: true });
for (const name of PUBLIC) {
  const src = join(root, name);
  if (existsSync(src)) cpSync(src, join(dist, name), { recursive: true });
}
// 訳の辞書（i18n/*.js）だけを公開し、元の翻訳表（i18n/source）は含めない
for (const lang of ['ko', 'zh-TW', 'fr', 'es']) cpSync(join(root, 'i18n', `${lang}.js`), join(dist, 'i18n', `${lang}.js`));
console.log('[build-static] wrote dist/');
