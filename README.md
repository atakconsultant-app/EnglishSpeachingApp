# EnglishSpeachingApp
Using for English

## 環境変数（Vercel → Project Settings → Environment Variables）

| 変数名 | 用途 | 公開してよいか |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase のURL（ビルド時に `supabase-config.js` へ書き出し） | ○ |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase の公開キー（同上） | ○ |
| `GNEWS_API_KEY` | GNews のAPIキー。`api/news.js` だけが使う | ✕ 絶対にブラウザ側に出さない |

## ニュース取得の仕組み

- ブラウザは `/api/news?cat=経済` や `/api/news?q=サッカー` を呼ぶだけで、GNews のキーは持たない。
- `api/news.js`（Vercel の関数）が GNews を呼び、結果を Vercel の CDN に1時間キャッシュする。
  同じカテゴリ・同じ検索語へのアクセスは1時間に1回しか GNews に届かない。
- 日本語の検索語は、よく使われる語だけ英語に置き換えて検索する（例: サッカー → soccer OR football）。
- `/api/news` が使えない環境（claude.ai のプレビュー、キー未設定など）では、index.html に内蔵の記事で動く。
