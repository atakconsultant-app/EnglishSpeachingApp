# EnglishSpeachingApp
Using for English

## 環境変数（Vercel → Project Settings → Environment Variables）

| 変数名 | 用途 | 公開してよいか |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase のURL（ビルド時に `supabase-config.js` へ書き出し） | ○ |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase の公開キー（同上） | ○ |
| `GNEWS_API_KEY` | GNews のAPIキー。`api/news.js` だけが使う | ✕ 絶対にブラウザ側に出さない |
| `ANTHROPIC_API_KEY` | Claude API のキー。`api/chat.js` だけが使う | ✕ 絶対にブラウザ側に出さない |
| `SUPABASE_SECRET_KEY` | AIの1日あたり利用回数を数えるためのサーバー専用キー（Supabaseの Secret key `sb_secret_…`。旧名 `SUPABASE_SERVICE_ROLE_KEY` も可） | ✕ 絶対にブラウザ側に出さない |
| `AI_DAILY_LIMIT`（任意） | 1人1日あたりのAI呼び出し回数の上限。未設定なら60 | ○ |
| `AI_CHAT_MODEL` / `AI_SCORE_MODEL` / `AI_TRANSLATE_MODEL`（任意） | 会話・採点・翻訳に使うモデル。未設定なら `claude-haiku-5-5` / `claude-sonnet-5-5` / `claude-haiku-5-5` | ○ |

## AI（会話・フィードバック・採点）の仕組み

- 公開サイトでは、ブラウザは `/api/chat` を呼ぶ。`api/chat.js` がログイン状態を Supabase で確認し、
  利用回数を数えてから Claude API を呼ぶ。キーはサーバー側にだけ置かれる。
- claude.ai のアーティファクト上で開いたときは、これまでどおり `claude.use('sample')` を使う（自動で切り替わる）。
- 利用回数の上限には Supabase のテーブルと関数が必要。`supabase/ai_usage.sql` を
  Supabase の SQL Editor で一度だけ実行する。`SUPABASE_SECRET_KEY` が未設定なら上限なしで動く。
- 1回の発言・採点・翻訳がそれぞれ1回と数えられる（1セッション ≒ 8〜10回）。上限は日本時間の0時にリセット。
- 翻訳（purpose: 'translate'）は、訳す文章と訳す先の言語だけを受け取り、指示文はサーバー側で組み立てる。

## ニュース取得の仕組み

- ブラウザは `/api/news?cat=経済` や `/api/news?q=サッカー` を呼ぶだけで、GNews のキーは持たない。
- `api/news.js`（Vercel の関数）が GNews を呼び、結果を Vercel の CDN に1時間キャッシュする。
  同じカテゴリ・同じ検索語へのアクセスは1時間に1回しか GNews に届かない。
- 日本語の検索語は、よく使われる語だけ英語に置き換えて検索する（例: サッカー → soccer OR football）。
- `/api/news` が使えない環境（claude.ai のプレビュー、キー未設定など）では、index.html に内蔵の記事で動く。

## 多言語化（日本語・韓国語・繁体字中国語・フランス語・スペイン語）

- 画面の文言は日本語のまま `index.html` に書き、`i18n.js` が表示時に利用者の言語へ置き換える。
  JS が後から差し込む文言も自動で訳される。数値などを含む文は `t('今日練習しないと {n}日の記録が途切れます', {n})` のように書く。
- 言語は「画面右上で選んだ言語（`ns_lang`）→ ブラウザの言語 → 日本語」の順で決まる。
- 訳は `i18n/source/strings_ui.py`（画面・メッセージ）と `i18n/source/strings_pages.py`（紹介・使い方）に
  「日本語｜韓国語｜繁体字｜フランス語｜スペイン語」の表で並べてある。編集後に
  `python3 i18n/source/build.py` を実行すると `i18n/<言語>.js` が作り直される（差し込み位置やタグの食い違いもチェック）。
- 文言を追加・変更したときは、この表にも同じ原文で行を追加する。表にない文言は日本語のまま表示される。
- AI のヒント（💬 の行）・フィードバック・採点コメント・翻訳ボタンの訳先は、利用者の言語になる。
- 「国内」カテゴリは利用者の国のニュース（韓国語→韓国、繁体字→台湾、フランス語→フランス、スペイン語→スペイン）。
