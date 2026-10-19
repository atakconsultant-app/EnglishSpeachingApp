"""翻訳表（strings_*.py）から i18n/<言語>.js を作る。

使い方: python3 i18n/source/build.py
チェック内容: 原文の重複、{n} などの差し込み位置とHTMLタグが原文と訳で一致しているか、空欄。
"""
import json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from strings_ui import ROWS as UI
from strings_pages import ROWS as PAGES

LANGS = ['ko', 'zh-TW', 'fr', 'es']
ALLOW_EMPTY = {'回', '語'}  # 単位を表示しない言語がある

rows = UI + PAGES
errors = []
seen = {}
for r in rows:
    if len(r) != 5:
        errors.append(f'列の数が違います: {r[0]}')
        continue
    ja = r[0]
    if ja in seen:
        errors.append(f'原文が重複しています: {ja}')
    seen[ja] = r
    ph = sorted(re.findall(r'\{\w+\}', ja))
    tags = sorted(re.findall(r'</?\w+>', ja))
    for lang, tr in zip(LANGS, r[1:]):
        if not tr and ja not in ALLOW_EMPTY:
            errors.append(f'[{lang}] 訳が空です: {ja}')
        if sorted(re.findall(r'\{\w+\}', tr)) != ph:
            errors.append(f'[{lang}] 差し込み位置 {{}} が原文と違います: {ja} → {tr}')
        if sorted(re.findall(r'</?\w+>', tr)) != tags:
            errors.append(f'[{lang}] HTMLタグが原文と違います: {ja} → {tr}')

if errors:
    print('\n'.join(errors))
    sys.exit(1)

out_dir = os.path.dirname(HERE)
for i, lang in enumerate(LANGS):
    table = {r[0]: r[i + 1] for r in rows}
    body = json.dumps(table, ensure_ascii=False, indent=1)
    with open(os.path.join(out_dir, f'{lang}.js'), 'w', encoding='utf-8') as f:
        f.write('// このファイルは i18n/source/build.py で自動生成しています。直接編集せず、i18n/source/strings_*.py を編集してください。\n')
        f.write(f"I18N.add('{lang}', {body});\n")
print(f'OK: {len(rows)} 件 × {len(LANGS)} 言語')
