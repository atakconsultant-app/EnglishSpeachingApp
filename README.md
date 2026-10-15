# EnglishSpeachingApp
Using for English

## 環境変数（Vercel → Project Settings → Environment Variables）

| 変数名 | 用途 | 公開してよいか |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase のURL（ビルド時に `supabase-config.js` へ書き出し） | ○ |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase の公開キー（同上） | ○ |
| `GNEWS_API_KEY` | GNews のAPIキー。`api/news.js` だけが使う | ✕ 絶対にブラウザ側に出さない |
| `ANTHROPIC_API_KEY` | Claude API のキー。`api/chat.js` だけが使う | ✕ 絶対にブラウザ側に出さない |
| `SUPABASE_SERVICE_ROLE_KEY` | AIの1日あたり利用回数を数えるためのサーバー専用キー | ✕ 絶対にブラウザ側に出さない |
| `AI_DAILY_LIMIT`（任意） | 1人1日あたりのAI呼び出し回数の上限。未設定なら60 | ○ |
| `AI_CHAT_MODEL` / `AI_SCORE_MODEL`（任意） | 会話・採点に使うモデル。未設定なら `claude-haiku-5-5` / `claude-sonnet-5-5` | ○ |

## AI（会話・フィードバック・採点）の仕組み

- 公開サイトでは、ブラウザは `/api/chat` を呼ぶ。`api/chat.js` がログイン状態を Supabase で確認し、
  利用回数を数えてから Claude API を呼ぶ。キーはサーバー側にだけ置かれる。
- claude.ai のアーティファクト上で開いたときは、これまでどおり `claude.use('sample')` を使う（自動で切り替わる）。
- 利用回数の上限には Supabase のテーブルと関数が必要。`supabase/ai_usage.sql` を
  Supabase の SQL Editor で一度だけ実行する。`SUPABASE_SERVICE_ROLE_KEY` が未設定なら上限なしで動く。
- 1回の発言・採点がそれぞれ1回と数えられる（1セッション ≒ 8〜10回）。上限は日本時間の0時にリセット。

## ニュース取得の仕組み

- ブラウザは `/api/news?cat=経済` や `/api/news?q=サッカー` を呼ぶだけで、GNews のキーは持たない。
- `api/news.js`（Vercel の関数）が GNews を呼び、結果を Vercel の CDN に1時間キャッシュする。
  同じカテゴリ・同じ検索語へのアクセスは1時間に1回しか GNews に届かない。
- 日本語の検索語は、よく使われる語だけ英語に置き換えて検索する（例: サッカー → soccer OR football）。
- `/api/news` が使えない環境（claude.ai のプレビュー、キー未設定など）では、index.html に内蔵の記事で動く。
