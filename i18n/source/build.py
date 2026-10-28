"""翻訳表（strings_*.py）から i18n/<言語>.js を作る。

使い方: python3 i18n/source/build.py
チェック内容: 原文の重複、{n} などの差し込み位置とHTMLタグが原文と訳で一致しているか、空欄。
"""
import json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from strings_ui import ROWS as UI
from strings_pages import ROWS as PAGES
from strings_billing import ROWS as BILLING
from strings_beta import ROWS as BETA
from strings_landing import ROWS as LANDING
from strings_nav import ROWS as NAV
from strings_coach import ROWS as COACH
from strings_history import ROWS as HISTORY

LANGS = ['ko', 'zh-TW', 'fr', 'es']
ALLOW_EMPTY = {'回', '語'}  # 単位を表示しない言語がある

rows = UI + PAGES + BILLING + BETA + LANDING + NAV + COACH + HISTORY
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

# 英語版（en）は strings_en.py に「原文 → 英語」で持つ
from strings_en import EN
for r in rows:
    ja = r[0]
    if ja not in EN:
        errors.append(f'[en] 訳がありません: {ja}')
        continue
    tr = EN[ja]
    if not tr and ja not in ALLOW_EMPTY:
        errors.append(f'[en] 訳が空です: {ja}')
    if sorted(re.findall(r'\{\w+\}', tr)) != sorted(re.findall(r'\{\w+\}', ja)):
        errors.append(f'[en] 差し込み位置 {{}} が原文と違います: {ja} → {tr}')
    if sorted(re.findall(r'</?\w+>', tr)) != sorted(re.findall(r'</?\w+>', ja)):
        errors.append(f'[en] HTMLタグが原文と違います: {ja} → {tr}')
for ja in EN:
    if ja not in seen:
        errors.append(f'[en] 使われていない原文があります（strings_*.py から消えた行）: {ja}')

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
table = {r[0]: EN[r[0]] for r in rows}
with open(os.path.join(out_dir, 'en.js'), 'w', encoding='utf-8') as f:
    f.write('// このファイルは i18n/source/build.py で自動生成しています。直接編集せず、i18n/source/strings_en.py を編集してください。\n')
    f.write("I18N.add('en', " + json.dumps(table, ensure_ascii=False, indent=1) + ");\n")
print(f'OK: {len(rows)} 件 × {len(LANGS) + 1} 言語')
