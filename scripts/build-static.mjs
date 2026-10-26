// Azure Static Web Apps 用に、公開するファイルだけを dist/ にまとめる。
// （サーバー処理のソースや node_modules などを公開しないため）
import { cpSync, mkdirSync, rmSync, existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import './gen-config.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const dist = join(root, 'dist');
const PUBLIC = [
  'index.html', 'i18n.js', 'auth-client.js', 'supabase-config.js', 'intro.css', 'intro-fx.css', 'intro-fx.js', 'pages.css',
  'staticwebapp.config.json', 'themes', 'videos', 'auth', 'legal',
  'robots.txt', 'sitemap.xml', 'favicon.ico', 'favicon.svg', 'apple-touch-icon.png', 'og-image.png',
];

rmSync(dist, { recursive: true, force: true });
mkdirSync(join(dist, 'i18n'), { recursive: true });
for (const name of PUBLIC) {
  const src = join(root, name);
  if (existsSync(src)) cpSync(src, join(dist, name), { recursive: true });
}
// トップページの画像：軽い .webp を公開する。同じ名前の .webp がある .png（元画像）は公開しない
const imgSrc = join(root, 'images');
if (existsSync(imgSrc)) {
  mkdirSync(join(dist, 'images'), { recursive: true });
  const files = readdirSync(imgSrc);
  for (const f of files) {
    if (f.endsWith('.png') && files.includes(f.replace(/\.png$/, '.webp'))) continue;
    cpSync(join(imgSrc, f), join(dist, 'images', f));
  }
}
// 訳の辞書（i18n/*.js）だけを公開し、元の翻訳表（i18n/source）は含めない
for (const lang of ['ko', 'zh-TW', 'fr', 'es']) cpSync(join(root, 'i18n', `${lang}.js`), join(dist, 'i18n', `${lang}.js`));

// ── 公開前チェック（問題があれば公開を止める）──
const problems = [];
// 1) 文字化け（U+FFFD）を含むファイルがないか
function walk(dir) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(html|js|css|json|xml|txt)$/.test(f) && readFileSync(p, 'utf8').includes('�')) {
      problems.push(`文字化け（�）があります: ${p.slice(dist.length + 1)}`);
    }
  }
}
walk(dist);
// 2) ページが読み込むファイルが公開の一覧から漏れていないか
for (const page of ['index.html']) {
  const html = readFileSync(join(dist, page), 'utf8');
  for (const m of html.matchAll(/(?:src|href)="([^"#?]+)(?:[?#][^"]*)?"/g)) {
    const ref = m[1];
    if (/^(https?:|mailto:|data:|\/\/|\/api\/)/.test(ref) || ref === '/') continue;
    if (!existsSync(join(dist, ref.replace(/^\//, '')))) problems.push(`${page} が読み込む ${ref} が公開されません（scripts/build-static.mjs の PUBLIC に追加してください）`);
  }
}
if (problems.length) {
  console.error('[build-static] 公開を中止しました:\n- ' + problems.join('\n- '));
  process.exit(1);
}
console.log('[build-static] wrote dist/');
