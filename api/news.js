// Vercel Serverless Function: GET /api/news?cat=<カテゴリ>[&home=<言語>[&region=<国コード>]] | ?q=<キーワード>
// home は「国内」カテゴリのときだけ使う。利用者の言語に合わせ、その国の英語ニュースを返す（ko→韓国 など）。
// GNews APIをサーバー側で呼び出す。APIキーは環境変数 GNEWS_API_KEY にだけ置き、ブラウザには出さない。
// 同じURLへの応答はキャッシュされるため、GNewsへの呼び出しは
// 「カテゴリ数 × 3時間に1回」＋「検索語ごとに3時間に1回」程度に収まる。

const GNEWS_BASE = 'https://gnews.io/api/v4';
// GNews の無料プラン（1日100回）に収まるよう、ニュースは3時間ごとに取り直す
const CACHE_TTL_MS = 3 * 60 * 60 * 1000;

// 取得したニュースを3時間保存し、GNews への呼び出し回数を抑える。
// Vercel では CDN（s-maxage）が保存するが、Azure Static Web Apps は API の応答を保存しないため、
// 関数のメモリと Supabase の news_cache テーブル（supabase/billing.sql）の2段で保存する。
const memoryCache = new Map();
function serviceKey() { return process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || ''; }
function supabaseUrl() { return (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '').replace(/\/$/, ''); }
function dbHeaders(key) {
  return { apikey: key, ...(key.startsWith('eyJ') ? { Authorization: `Bearer ${key}` } : {}), 'Content-Type': 'application/json' };
}
async function readCache(key) {
  const mem = memoryCache.get(key);
  if (mem && Date.now() - mem.at < CACHE_TTL_MS) return { articles: mem.articles, fresh: true };
  const sk = serviceKey();
  if (!sk || !supabaseUrl()) return mem ? { articles: mem.articles, fresh: false } : null;
  try {
    const r = await fetch(`${supabaseUrl()}/rest/v1/news_cache?key=eq.${encodeURIComponent(key)}&select=articles,fetched_at`, { headers: dbHeaders(sk) });
    if (!r.ok) return mem ? { articles: mem.articles, fresh: false } : null;
    const row = (await r.json())[0];
    if (!row) return mem ? { articles: mem.articles, fresh: false } : null;
    const at = Date.parse(row.fetched_at);
    memoryCache.set(key, { at, articles: row.articles });
    return { articles: row.articles, fresh: Date.now() - at < CACHE_TTL_MS };
  } catch (e) {
    return mem ? { articles: mem.articles, fresh: false } : null;
  }
}
async function writeCache(key, articles) {
  memoryCache.set(key, { at: Date.now(), articles });
  const sk = serviceKey();
  if (!sk || !supabaseUrl()) return;
  try {
    await fetch(`${supabaseUrl()}/rest/v1/news_cache?on_conflict=key`, {
      method: 'POST',
      headers: { ...dbHeaders(sk), Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ key, articles, fetched_at: new Date().toISOString() }),
    });
  } catch (e) { /* 保存に失敗しても表示には影響しない */ }
}
const MAX_ARTICLES = 10;
const CACHE_OK = 'public, s-maxage=10800, stale-while-revalidate=86400';

// アプリのカテゴリ → GNewsのtop-headlinesカテゴリ（国内だけは「日本」の英語記事を検索）
const CATEGORY_MAP = {
  '主要': { category: 'general' },
  '国内': { q: 'Japan', home: true },
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

// 「国内」= 利用者の国（言語から決める）
const HOME_QUERY = { ja: 'Japan', ko: '"South Korea"', 'zh-TW': 'Taiwan', fr: 'France', es: 'Spain' };
// 英語版の利用者は、ブラウザの地域（例: GB, IN, BR）からその国の英語ニュースを探す
function regionQuery(region) {
  const code = String(region || '').toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) return null;
  try {
    const name = new Intl.DisplayNames(['en'], { type: 'region' }).of(code);
    if (!name || name === code) return null;
    return /\s/.test(name) ? `"${name}"` : name;
  } catch (e) {
    return null;
  }
}

// 韓国語・繁体字中国語・フランス語・スペイン語のよく使われるキーワード → 英語
const OTHER_KEYWORDS = {
  // 한국어
  '축구': 'soccer OR football', '야구': 'baseball', '농구': 'basketball', '테니스': 'tennis', '골프': 'golf', '올림픽': 'Olympics',
  '인공지능': 'artificial intelligence', '생성형 AI': 'generative AI', '반도체': 'semiconductor', '기후 변화': 'climate change', '기후변화': 'climate change',
  '환경': 'environment', '에너지': 'energy', '경제': 'economy', '주식': 'stocks', '금리': 'interest rates', '인플레이션': 'inflation', '환율': 'currency',
  '스타트업': 'startup', '암호화폐': 'cryptocurrency', '비트코인': 'bitcoin', '선거': 'election', '전쟁': 'war', '우크라이나': 'Ukraine', '러시아': 'Russia',
  '중국': 'China', '대만': 'Taiwan', '미국': 'United States', '한국': 'South Korea', '일본': 'Japan', '서울': 'Seoul', '의료': 'healthcare', '건강': 'health',
  '백신': 'vaccine', '우주': 'space', '영화': 'film', '음악': 'music', '게임': 'video games', '여행': 'travel', '관광': 'tourism', '교육': 'education',
  '저출산': 'birth rate', '이민': 'immigration', '일자리': 'jobs', '재택근무': 'remote work', 'K팝': 'K-pop', '케이팝': 'K-pop',
  // 繁體中文
  '足球': 'soccer OR football', '棒球': 'baseball', '籃球': 'basketball', '網球': 'tennis', '高爾夫': 'golf', '奧運': 'Olympics',
  '人工智慧': 'artificial intelligence', '生成式AI': 'generative AI', '半導體': 'semiconductor', '晶片': 'chips', '氣候變遷': 'climate change',
  '環境': 'environment', '能源': 'energy', '經濟': 'economy', '股票': 'stocks', '股市': 'stock market', '利率': 'interest rates', '通膨': 'inflation', '匯率': 'currency',
  '新創': 'startup', '加密貨幣': 'cryptocurrency', '比特幣': 'bitcoin', '選舉': 'election', '戰爭': 'war', '烏克蘭': 'Ukraine', '俄羅斯': 'Russia',
  '中國': 'China', '台灣': 'Taiwan', '臺灣': 'Taiwan', '美國': 'United States', '韓國': 'South Korea', '日本': 'Japan', '台北': 'Taipei', '醫療': 'healthcare',
  '健康': 'health', '疫苗': 'vaccine', '太空': 'space', '電影': 'film', '音樂': 'music', '遊戲': 'video games', '旅遊': 'travel', '觀光': 'tourism', '教育': 'education',
  '少子化': 'birth rate', '移民': 'immigration', '就業': 'jobs', '遠距工作': 'remote work',
  // Français
  'football': 'soccer OR football', 'basket': 'basketball', 'jeux olympiques': 'Olympics', 'intelligence artificielle': 'artificial intelligence',
  'ia': 'AI', 'ia générative': 'generative AI', 'semi-conducteurs': 'semiconductor', 'changement climatique': 'climate change', 'climat': 'climate',
  'environnement': 'environment', 'énergie': 'energy', 'économie': 'economy', 'bourse': 'stock market', 'actions': 'stocks', "taux d'intérêt": 'interest rates',
  'inflation': 'inflation', 'cryptomonnaie': 'cryptocurrency', 'élection': 'election', 'élections': 'election', 'guerre': 'war', 'chine': 'China',
  'états-unis': 'United States', 'japon': 'Japan', 'corée du sud': 'South Korea', 'russie': 'Russia', 'santé': 'health', 'vaccin': 'vaccine',
  'espace': 'space', 'cinéma': 'film', 'musique': 'music', 'jeux vidéo': 'video games', 'voyage': 'travel', 'tourisme': 'tourism', 'éducation': 'education',
  'natalité': 'birth rate', 'immigration': 'immigration', 'emploi': 'jobs', 'télétravail': 'remote work',
  // Español
  'fútbol': 'soccer OR football', 'futbol': 'soccer OR football', 'béisbol': 'baseball', 'baloncesto': 'basketball', 'tenis': 'tennis', 'juegos olímpicos': 'Olympics',
  'inteligencia artificial': 'artificial intelligence', 'ia generativa': 'generative AI', 'semiconductores': 'semiconductor', 'cambio climático': 'climate change',
  'clima': 'climate', 'medio ambiente': 'environment', 'energía': 'energy', 'economía': 'economy', 'bolsa': 'stock market', 'acciones': 'stocks',
  'tasas de interés': 'interest rates', 'inflación': 'inflation', 'criptomonedas': 'cryptocurrency', 'elecciones': 'election', 'guerra': 'war', 'ucrania': 'Ukraine',
  'rusia': 'Russia', 'estados unidos': 'United States', 'japón': 'Japan', 'corea del sur': 'South Korea', 'españa': 'Spain', 'méxico': 'Mexico',
  'salud': 'health', 'vacuna': 'vaccine', 'espacio': 'space', 'cine': 'film', 'música': 'music', 'videojuegos': 'video games', 'viajes': 'travel',
  'turismo': 'tourism', 'educación': 'education', 'natalidad': 'birth rate', 'inmigración': 'immigration', 'empleo': 'jobs', 'teletrabajo': 'remote work',
};
const KEYWORDS = { ...JA_KEYWORDS, ...OTHER_KEYWORDS };
// 文中から探すときは、長い語から順に（「ia」のような短い語は別の単語の一部と誤って一致するので除く）
const KEY_LIST = Object.keys(KEYWORDS).filter(k => k.length > 2 || /[^\x00-\x7F]/.test(k)).sort((a, b) => b.length - a.length);

function toEnglishQuery(raw) {
  const text = String(raw || '').trim().slice(0, 100);
  if (!text) return '';
  const lower = text.toLowerCase();
  if (KEYWORDS[text]) return KEYWORDS[text];
  if (KEYWORDS[lower]) return KEYWORDS[lower];
  // 英語以外（日本語・韓国語・中国語・アクセント付きの文字など）を含む場合は、辞書にある語だけを英語に置き換えて使う
  if (/[^\x00-\x7F]/.test(text)) {
    const hits = [];
    let rest = lower;
    for (const k of KEY_LIST) {
      if (hits.length >= 3) break;
      if (rest.includes(k.toLowerCase())) { hits.push(`(${KEYWORDS[k]})`); rest = rest.split(k.toLowerCase()).join(' '); }
    }
    return [...new Set(hits)].join(' AND ');
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

  const { cat, q, home, region } = req.query || {};
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
      const homeQ = m.home && (home === 'en' ? (regionQuery(region) || '"United States"') : HOME_QUERY[home]);
      params.set('q', homeQ || m.q);
      params.set('sortby', 'publishedAt');
    }
  } else {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(400).json({ error: 'bad_request', message: 'cat か q を指定してください' });
  }

  const cacheParams = new URLSearchParams(params);
  cacheParams.delete('apikey');
  const cacheKey = `${endpoint}?${cacheParams.toString()}|${resultCat}`;
  const cached = await readCache(cacheKey);
  if (cached && cached.fresh) {
    res.setHeader('Cache-Control', CACHE_OK);
    return res.status(200).json({ articles: cached.articles, cached: true });
  }

  try {
    const upstream = await fetch(`${GNEWS_BASE}/${endpoint}?${params.toString()}`);
    if (!upstream.ok && cached) {
      // GNews が使えないとき（上限到達など）は、少し古い保存分を返す
      res.setHeader('Cache-Control', 'public, s-maxage=300');
      return res.status(200).json({ articles: cached.articles, cached: true, stale: true });
    }
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
    await writeCache(cacheKey, articles);
    res.setHeader('Cache-Control', CACHE_OK);
    return res.status(200).json({ articles });
  } catch (err) {
    if (cached) return res.status(200).json({ articles: cached.articles, cached: true, stale: true });
    res.setHeader('Cache-Control', 'no-store');
    return res.status(502).json({ error: 'upstream_unreachable' });
  }
};

module.exports.toEnglishQuery = toEnglishQuery;
