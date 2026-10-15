// Vercel Serverless Function: GET /api/news?cat=<カテゴリ> | ?q=<キーワード>
// GNews APIをサーバー側で呼び出す。APIキーは環境変数 GNEWS_API_KEY にだけ置き、ブラウザには出さない。
// 同じURLへの応答はVercelのCDNに1時間キャッシュされるため、GNewsへの呼び出しは
// 「カテゴリ数 × 1時間に1回」＋「検索語ごとに1時間に1回」程度に収まる。

const GNEWS_BASE = 'https://gnews.io/api/v4';
const MAX_ARTICLES = 10;
const CACHE_OK = 'public, s-maxage=3600, stale-while-revalidate=86400';

// アプリのカテゴリ → GNewsのtop-headlinesカテゴリ（国内だけは「日本」の英語記事を検索）
const CATEGORY_MAP = {
  '主要': { category: 'general' },
  '国内': { q: 'Japan' },
  '国際': { category: 'world' },
  '経済': { category: 'business' },
  'エンタメ': { category: 'entertainment' },
  'スポーツ': { category: 'sports' },
  'IT': { category: 'technology' },
  '科学': { category: 'science' },
  'ライフ': { category: 'health' },
};

// 英語記事を検索するため、よく使われる日本語キーワードを英語に置き換える
const JA_KEYWORDS = {
  'サッカー': 'soccer OR football', '野球': 'baseball', 'バスケ': 'basketball', 'バスケットボール': 'basketball',
  'テニス': 'tennis', 'ゴルフ': 'golf', 'オリンピック': 'Olympics', 'ラグビー': 'rugby',
  'AI': 'AI', '人工知能': 'artificial intelligence', '生成AI': 'generative AI', '半導体': 'semiconductor',
  '気候変動': 'climate change', '環境': 'environment', 'エネルギー': 'energy', '再生可能エネルギー': 'renewable energy',
  '経済': 'economy', '株': 'stocks', '株価': 'stock market', '金利': 'interest rates', 'インフレ': 'inflation',
  '円安': 'yen', '為替': 'currency', 'スタートアップ': 'startup', '仮想通貨': 'cryptocurrency', 'ビットコイン': 'bitcoin',
  '選挙': 'election', '戦争': 'war', 'ウクライナ': 'Ukraine', 'ロシア': 'Russia', '中国': 'China', '台湾': 'Taiwan',
  'アメリカ': 'United States', '米国': 'United States', '韓国': 'South Korea', '日本': 'Japan', '東京': 'Tokyo',
  '医療': 'healthcare', '健康': 'health', 'ワクチン': 'vaccine', '宇宙': 'space', '映画': 'film', '音楽': 'music',
  'ゲーム': 'video games', '旅行': 'travel', '観光': 'tourism', 'クルーズ': 'cruise', '教育': 'education',
  '少子化': 'birth rate', '移民': 'immigration', '雇用': 'jobs', '働き方': 'remote work',
};

function toEnglishQuery(raw) {
  const text = String(raw || '').trim().slice(0, 100);
  if (!text) return '';
  if (JA_KEYWORDS[text]) return JA_KEYWORDS[text];
  // 日本語が含まれる場合は、辞書にある語だけを英語に置き換えて使う
  if (/[^\x00-\x7F]/.test(text)) {
    const hits = Object.keys(JA_KEYWORDS).filter(k => text.includes(k)).map(k => `(${JA_KEYWORDS[k]})`);
    return hits.slice(0, 3).join(' AND ');
  }
  // 英語はGNewsのクエリ構文を壊す記号を除いて使う
  return text.replace(/["()\\]/g, ' ').replace(/\s+/g, ' ').trim();
}

function normalize(article, cat) {
  const title = (article.title || '').trim();
  return {
    source: (article.source && article.source.name) || 'GNews',
    title,
    summary: (article.description || title).trim(),
    url: article.url || '',
    image: article.image || '',
    publishedAt: article.publishedAt || '',
    cat,
    live: true,
  };
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  const apiKey = process.env.GNEWS_API_KEY;
  if (!apiKey) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(503).json({ error: 'not_configured', message: 'GNEWS_API_KEY が設定されていません' });
  }

  const { cat, q } = req.query || {};
  let endpoint;
  const params = new URLSearchParams({ lang: 'en', max: String(MAX_ARTICLES), apikey: apiKey });
  let resultCat = '国際';

  if (q) {
    const query = toEnglishQuery(q);
    if (!query) {
      res.setHeader('Cache-Control', CACHE_OK);
      return res.status(200).json({ articles: [], note: 'unsupported_query' });
    }
    endpoint = 'search';
    params.set('q', query);
    params.set('sortby', 'relevance');
  } else if (cat && CATEGORY_MAP[cat]) {
    const m = CATEGORY_MAP[cat];
    resultCat = cat;
    if (m.category) {
      endpoint = 'top-headlines';
      params.set('category', m.category);
    } else {
      endpoint = 'search';
      params.set('q', m.q);
      params.set('sortby', 'publishedAt');
    }
  } else {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(400).json({ error: 'bad_request', message: 'cat か q を指定してください' });
  }

  try {
    const upstream = await fetch(`${GNEWS_BASE}/${endpoint}?${params.toString()}`);
    if (!upstream.ok) {
      // GNewsのエラーメッセージを原因調査用に返す（APIキーが含まれていれば伏せる）
      let detail = '';
      try {
        const body = await upstream.json();
        const errs = body && body.errors;
        detail = Array.isArray(errs) ? errs.join(' / ')
          : (errs && typeof errs === 'object') ? Object.values(errs).flat().join(' / ')
          : String(errs || body.message || '');
      } catch (e) { /* 本文がJSONでない場合は詳細なし */ }
      detail = detail.split(apiKey).join('***').slice(0, 300);
      res.setHeader('Cache-Control', 'no-store');
      return res.status(502).json({ error: 'upstream_error', status: upstream.status, detail });
    }
    const data = await upstream.json();
    const articles = (data.articles || [])
      .filter(a => a && a.title && a.url)
      .map(a => normalize(a, resultCat));
    res.setHeader('Cache-Control', CACHE_OK);
    return res.status(200).json({ articles });
  } catch (err) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(502).json({ error: 'upstream_unreachable' });
  }
};

module.exports.toEnglishQuery = toEnglishQuery;
