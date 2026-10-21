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
| `AZURE_SPEECH_KEY` | Azure AI Speech のキー。`api/tts.js` だけが使う | ✕ 絶対にブラウザ側に出さない |
| `AZURE_SPEECH_REGION` | Azure AI Speech のリージョン（例: `japaneast`） | ○ |
| `TTS_DAILY_CHAR_LIMIT`（任意） | 1人1日あたりの Azure 読み上げ文字数の上限。未設定なら20000 | ○ |
| `STRIPE_SECRET_KEY` | Stripe の秘密キー（`sk_test_…` / `sk_live_…`）。`lib/billing.js` だけが使う | ✕ 絶対にブラウザ側に出さない |
| `STRIPE_WEBHOOK_SECRET` | Stripe の Webhook の署名シークレット（`whsec_…`） | ✕ 絶対にブラウザ側に出さない |
| `STRIPE_PRICE_MONTHLY` / `STRIPE_PRICE_YEARLY` | Pro の料金ID（`price_…`）。月額990円・年額9,900円 | ○ |
| `APP_URL`（任意） | サイトのURL（例: `https://xxx.azurestaticapps.net`）。決済後に戻る先に使う | ○ |

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

## 読み上げ（Azure のニューラル音声）

- ログイン中は `/api/tts` 経由で Azure AI Speech のニューラル音声を使う。スピーカー設定の地域（アメリカ・イギリス・インド・オーストラリア）・性別・年齢・速さ・音量が反映される。
- Azure には年齢の設定がないため、年齢は「話者の選び分け（若い声／落ち着いた声）」と「声の高さ・速さ」で表現する。話者の候補は `api/tts.js` の `VOICE_PREFS`。
- `AZURE_SPEECH_KEY` が未設定、1日の上限に達した、通信に失敗した、のいずれかのときは、自動でブラウザの音声に切り替わる。
- 1日の文字数の上限には `supabase/tts_usage.sql` を SQL Editor で一度だけ実行する（未実行なら上限なし）。
- 同じ文章をもう一度読むとき（Shadowing の繰り返しなど）は、取得済みの音声を使うので文字数は増えない。

## 有料プラン（Stripe）

- 無料：1日1往復の会話（AIの最初の質問＋返答）とその翻訳だけ。採点と Azure の読み上げは Pro のみ。
- Pro：月990円／年9,900円。初回のみ3日間の無料お試し（カード入力あり）。上限は `AI_DAILY_LIMIT` と `TTS_DAILY_CHAR_LIMIT`。
- `STRIPE_SECRET_KEY` と2つの料金IDが揃うまでは課金は無効で、全員がこれまでどおり制限なしで使える。
- 申込は Stripe Checkout、解約・カード変更・領収書は Stripe のカスタマーポータル。契約の状態は Webhook（`/api/billing/webhook`）で
  Supabase の `subscriptions` テーブルに書き写す。必要な SQL は `supabase/billing.sql`。
- 規約類：`legal/terms.html`（利用規約）、`legal/privacy.html`（プライバシーポリシー）、`legal/tokushoho.html`（特定商取引法に基づく表記）。
  【屋号】などの黄色い箇所は公開前に埋める。

## 公開先：Azure Static Web Apps

- 画面は `npm run build:azure` で `dist/` にまとめて公開する。サーバー処理は `azure-api/`（Azure Functions）から `api/` と `lib/` をそのまま使う
  （`azure-api/adapter.js` が Vercel 形式の関数を Azure の形式につなぐ）。
- GitHub の main に入ると `.github/workflows/azure-static-web-apps-brave-river-05d4a2f1e.yml`（Azure が作成）が自動で公開する。
  ビルド時に GitHub の Variables `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` を使う。
- サーバー処理のリージョンは米国（West US 2 など）にする。Claude の API は香港（East Asia）からの利用を受け付けないため。
- ニュースは Supabase の `news_cache` テーブルに1時間保存して GNews の呼び出し回数を抑える（Azure は API の応答を CDN に保存しないため）。
- Vercel でもこれまでどおり動く（移行が終わるまでの並行稼働用）。
