// Vercel Serverless Function: POST /api/tts
// Azure AI Speech（ニューラル音声）で英語を読み上げ、mp3 を返す。キーは環境変数 AZURE_SPEECH_KEY にだけ置く。
//
// リクエスト: { text, accent: 'us'|'gb'|'in'|'au', gender: 'female'|'male', age: 15〜80, rate: 0.5〜1.5 }
// レスポンス: audio/mpeg（ヘッダー X-Voice に使った話者名、X-Tts-Remaining に今日の残り文字数）
//
// - ログイン中の利用者だけが使える（Supabase のログイン情報をサーバー側で確認）。
// - SUPABASE_SECRET_KEY があれば、1人1日あたりの読み上げ文字数を Supabase で数えて上限を設ける（supabase/tts_usage.sql）。
// - Azure には年齢の設定がないため、年齢は「話者の選び分け」と「声の高さ・速さ」で表現する。
//
// ElevenLabs との組み合わせ（ELEVENLABS_API_KEY を設定したときだけ有効）
// - AI の発言など、ある程度長い文（ELEVENLABS_MIN_CHARS 文字以上、既定 40）は ElevenLabs のより自然な声で読む。
// - 単語や短い語句、1人1日の ElevenLabs 分（ELEVENLABS_DAILY_CHARS、既定 5000 文字）を超えた分は Azure で読む。
// - ElevenLabs がエラー・文字数切れのとき、または選んだ地域・性別に合う声がないときも Azure で読む。

const billing = require('../lib/billing');

const ACCENTS = {
  us: 'en-US', gb: 'en-GB', in: 'en-IN', au: 'en-AU',
};

// 地域・性別ごとの話者の候補（上から順に、若い声 → 落ち着いた声 の目安）。
// Azure 側で話者が入れ替わっても動くよう、実在する話者一覧（voices/list）と照合して選ぶ。
const VOICE_PREFS = {
  'en-US': {
    female: ['en-US-AvaNeural', 'en-US-EmmaNeural', 'en-US-JennyNeural', 'en-US-AriaNeural', 'en-US-NancyNeural'],
    male: ['en-US-AndrewNeural', 'en-US-BrianNeural', 'en-US-GuyNeural', 'en-US-DavisNeural', 'en-US-ChristopherNeural'],
  },
  'en-GB': {
    female: ['en-GB-LibbyNeural', 'en-GB-SoniaNeural', 'en-GB-HollieNeural', 'en-GB-AbbiNeural'],
    male: ['en-GB-RyanNeural', 'en-GB-ThomasNeural', 'en-GB-AlfieNeural', 'en-GB-OliverNeural'],
  },
  'en-AU': {
    female: ['en-AU-NatashaNeural', 'en-AU-FreyaNeural', 'en-AU-AnnetteNeural', 'en-AU-JoanneNeural'],
    male: ['en-AU-WilliamNeural', 'en-AU-DarrenNeural', 'en-AU-NeilNeural', 'en-AU-DuncanNeural'],
  },
  'en-IN': {
    female: ['en-IN-NeerjaNeural', 'en-IN-AashiNeural', 'en-IN-AnanyaNeural', 'en-IN-KavyaNeural'],
    male: ['en-IN-PrabhatNeural', 'en-IN-AaravNeural', 'en-IN-ArjunNeural', 'en-IN-KunalNeural'],
  },
};
// 子どもの声は大人の話し相手に合わないので候補から外す
const CHILD_VOICES = ['en-US-AnaNeural', 'en-GB-MaisieNeural'];

// ElevenLabs の既定の声（地域 → 性別 → [若い, 中くらい, 年配]）。ELEVENLABS_VOICES（JSON）で差し替えられる。
// 例: {"in":{"female":["voiceId1:Priya","voiceId2:Ananya","voiceId3:Meera"]}}（若い声・中くらい・年配の順。1つだけでも可）。
// 合う声がない組み合わせは Azure で読む。
const ELEVEN_VOICES = {
  us: {
    female: [['cgSgspJ2msm6clMCkdW9', 'Jessica'], ['EXAVITQu4vr4xnSDxMaL', 'Sarah'], ['XrExE9yKIg1WjnnlVkGX', 'Matilda']],
    male: [['bIHbv24MWmeRgasZH58o', 'Will'], ['nPczCjzI2devNBz1zQrb', 'Brian'], ['pqHfZKP75CvOlQylNhV4', 'Bill']],
  },
  gb: {
    female: [['pFZP5JQG7iQjIQuC4Bku', 'Lily'], ['Xb7hH8MSUJpSbSDYk0k2', 'Alice'], ['Xb7hH8MSUJpSbSDYk0k2', 'Alice']],
    male: [['onwK4e9ZLuTAKqWW03F9', 'Daniel'], ['JBFqnCBsd6RMkjVDRZzb', 'George'], ['JBFqnCBsd6RMkjVDRZzb', 'George']],
  },
  au: {
    female: [['aEO01A4wXwd1O8GPgGlF', 'Arabella'], ['56bWURjYFHyYyVf490Dp', 'Emma'], ['cvpTJfe9LINpHIOmB2Hp', 'Charlotte']],
    male: [['IKne3meq5aSn9XLyUdCD', 'Charlie'], ['IKne3meq5aSn9XLyUdCD', 'Charlie'], ['IKne3meq5aSn9XLyUdCD', 'Charlie']],
  },
  // インド英語（Voice Library から追加した声。ElevenLabs の「My Voices」に追加済みであること）
  in: {
    female: [['90ipbRoKi4CpHXvKVtl0', 'Anika'], ['OUBnvvuqEKdDWtapoJFn', 'Tia Mirza'], ['MwUMLXurEzSN7bIfIdXF', 'Tripti']],
    male: [['0muxiGNHAVvmM1qWRtyV', 'Sid'], ['3gsg3cxXyFLcGIfNbM6C', 'Raju'], ['nlyULslzTRhqlyv46oPj', 'Indrajeet']],
  },
};
const ELEVEN_DEFAULT_MODEL = 'eleven_flash_v2_5';
const ELEVEN_DEFAULT_MIN_CHARS = 40;
const ELEVEN_DEFAULT_DAILY_CHARS = 5000;

const MAX_TEXT_CHARS = 1500;
const DEFAULT_DAILY_CHARS = 20000;
const VOICES_TTL_MS = 6 * 60 * 60 * 1000;

function env(...names) {
  for (const n of names) if (process.env[n]) return process.env[n];
  return '';
}
const supabaseUrl = () => env('NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_URL').replace(/\/$/, '');
const supabaseAnonKey = () => env('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_ANON_KEY');
const ttsHost = () => `https://${env('AZURE_SPEECH_REGION').trim().toLowerCase()}.tts.speech.microsoft.com`;

function sendJson(res, status, body) {
  res.setHeader('Cache-Control', 'no-store');
  return res.status(status).json(body);
}

async function getUserId(req) {
  // Azure Static Web Apps は Authorization ヘッダーを書き換えるため、画面から送る X-NS-Auth を優先する
  const auth = req.headers['x-ns-auth'] || req.headers.authorization || req.headers.Authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!token) return null;
  const r = await fetch(`${supabaseUrl()}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${token}`, apikey: supabaseAnonKey() },
  });
  if (!r.ok) return null;
  const user = await r.json();
  return user && user.id ? user.id : null;
}

// 今日の読み上げ文字数を加算し、残り文字数を返す（上限超過なら -1）。上限の仕組みが未設定なら null
async function consumeChars(userId, chars) {
  const serviceKey = env('SUPABASE_SECRET_KEY', 'SUPABASE_SERVICE_ROLE_KEY');
  if (!serviceKey) return null;
  const limit = parseInt(process.env.TTS_DAILY_CHAR_LIMIT, 10) || DEFAULT_DAILY_CHARS;
  const r = await fetch(`${supabaseUrl()}/rest/v1/rpc/consume_tts_quota`, {
    method: 'POST',
    headers: {
      apikey: serviceKey,
      ...(serviceKey.startsWith('eyJ') ? { Authorization: `Bearer ${serviceKey}` } : {}),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ p_user_id: userId, p_chars: chars, p_limit: limit }),
  });
  // SQL をまだ実行していない（関数がない）場合は上限なしで動かす
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`tts quota rpc ${r.status}`);
  return Number(await r.json());
}

// Azure の話者一覧（関数のインスタンスごとに数時間キャッシュ）
let voiceCache = { at: 0, names: null };
async function availableVoices(key) {
  if (voiceCache.names && Date.now() - voiceCache.at < VOICES_TTL_MS) return voiceCache.names;
  try {
    const r = await fetch(`${ttsHost()}/cognitiveservices/voices/list`, { headers: { 'Ocp-Apim-Subscription-Key': key } });
    if (!r.ok) throw new Error(`voices ${r.status}`);
    const list = await r.json();
    voiceCache = {
      at: Date.now(),
      names: list.map(v => ({ name: v.ShortName, locale: v.Locale, gender: String(v.Gender || '').toLowerCase() })),
    };
  } catch (e) {
    console.warn('Azure voices list unavailable', e.message);
    if (!voiceCache.names) return null;
  }
  return voiceCache.names;
}

function ageBand(age) {
  return age < 30 ? 0 : age < 50 ? 1 : 2;
}

function pickVoice(locale, gender, age, voices) {
  const prefs = (VOICE_PREFS[locale] && VOICE_PREFS[locale][gender]) || [];
  const exists = voices ? new Set(voices.map(v => v.name)) : null;
  const usable = exists ? prefs.filter(n => exists.has(n)) : prefs;
  if (usable.length) return usable[Math.min(ageBand(age), usable.length - 1)];
  // 候補がすべて廃止されていた場合は、同じ地域・性別の大人の声から選ぶ
  if (voices) {
    const same = voices.filter(v => v.locale === locale && v.gender === gender && !CHILD_VOICES.includes(v.name) && /Neural$/.test(v.name));
    if (same.length) return same[0].name;
    const any = voices.find(v => v.locale === locale && !CHILD_VOICES.includes(v.name));
    if (any) return any.name;
  }
  return prefs[0] || 'en-US-JennyNeural';
}

// 年齢は声の高さと速さで少しだけ表現する（ブラウザ音声のときと同じ考え方）
function prosodyFor(age, rate) {
  const pitch = age < 25 ? '+4%' : age < 40 ? '+1%' : age < 60 ? '-2%' : '-5%';
  const pace = age >= 65 ? 0.94 : age < 25 ? 1.03 : 1;
  const pct = Math.round((Math.min(1.5, Math.max(0.5, rate)) * pace - 1) * 100);
  return { pitch, rate: `${pct >= 0 ? '+' : ''}${pct}%` };
}

function escapeXml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function buildSsml(text, voice, locale, prosody) {
  return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${locale}">` +
    `<voice name="${voice}"><prosody rate="${prosody.rate}" pitch="${prosody.pitch}">${escapeXml(text)}</prosody></voice></speak>`;
}

// ── ElevenLabs ──
function elevenVoices() {
  const raw = process.env.ELEVENLABS_VOICES;
  if (!raw) return ELEVEN_VOICES;
  try {
    const custom = JSON.parse(raw);
    const out = JSON.parse(JSON.stringify(ELEVEN_VOICES));
    Object.keys(custom || {}).forEach(acc => {
      out[acc] = out[acc] || {};
      Object.keys(custom[acc] || {}).forEach(g => {
        const list = [].concat(custom[acc][g] || []).filter(Boolean).slice(0, 3);
        // "ID" または "ID:表示名"（スピーカー設定に表示する名前）
        if (list.length) out[acc][g] = [0, 1, 2].map(i => {
          const [id, name] = String(list[Math.min(i, list.length - 1)]).split(':');
          return [id.trim(), (name || id).trim()];
        });
      });
    });
    return out;
  } catch (e) {
    console.warn('ELEVENLABS_VOICES is not valid JSON; using the default voices');
    return ELEVEN_VOICES;
  }
}
// 選んだ地域・性別・年齢に合う ElevenLabs の声 [id, 表示名]。合う声がなければ null（Azure で読む）
function pickElevenVoice(accent, gender, age) {
  const list = (elevenVoices()[accent] || {})[gender];
  if (!list || !list.length) return null;
  return list[Math.min(ageBand(age), list.length - 1)];
}
// ElevenLabs で読むかどうか（鍵があり、ある程度長い文で、その人の今日の ElevenLabs 分が残っているとき）
function useEleven(text, usedToday) {
  if (!env('ELEVENLABS_API_KEY')) return false;
  const minChars = parseInt(process.env.ELEVENLABS_MIN_CHARS, 10) || ELEVEN_DEFAULT_MIN_CHARS;
  if (text.length < minChars) return false;
  const daily = parseInt(process.env.ELEVENLABS_DAILY_CHARS, 10) || ELEVEN_DEFAULT_DAILY_CHARS;
  return usedToday === null || usedToday <= daily;
}
async function elevenAudio(text, voiceId, rate) {
  const model = env('ELEVENLABS_MODEL') || ELEVEN_DEFAULT_MODEL;
  const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_64`, {
    method: 'POST',
    headers: { 'xi-api-key': env('ELEVENLABS_API_KEY'), 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
    body: JSON.stringify({
      text,
      model_id: model,
      ...(/flash|turbo/.test(model) ? { language_code: 'en' } : {}),
      voice_settings: { stability: 0.5, similarity_boost: 0.75, speed: Math.min(1.2, Math.max(0.7, rate || 1)) },
    }),
  });
  if (!r.ok) {
    const detail = (await r.text().catch(() => '')).slice(0, 300);
    const err = new Error(`elevenlabs ${r.status}`);
    err.status = r.status; err.detail = detail;
    throw err;
  }
  return Buffer.from(await r.arrayBuffer());
}

function validate(body) {
  if (!body || typeof body !== 'object') return 'invalid_body';
  if (typeof body.text !== 'string' || !body.text.trim()) return 'invalid_text';
  if (body.text.length > MAX_TEXT_CHARS) return 'too_long';
  return null;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return sendJson(res, 405, { error: 'method_not_allowed' });
  }
  const key = env('AZURE_SPEECH_KEY');
  if (!key || !env('AZURE_SPEECH_REGION')) return sendJson(res, 503, { error: 'not_configured', message: 'AZURE_SPEECH_KEY / AZURE_SPEECH_REGION が設定されていません' });
  if (!supabaseUrl() || !supabaseAnonKey()) return sendJson(res, 503, { error: 'auth_not_configured' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = null; } }
  const invalid = validate(body);
  if (invalid) return sendJson(res, 400, { error: invalid });

  let userId;
  try { userId = await getUserId(req); } catch (e) { userId = null; }
  if (!userId) return sendJson(res, 401, { error: 'unauthorized' });

  // Azure の高品質な音声は Pro のみ（無料プランはブラウザの音声）
  try {
    if (await billing.getPlan(userId) !== 'pro') return sendJson(res, 403, { error: 'pro_only' });
  } catch (e) {
    console.error('plan check failed', e);
    return sendJson(res, 503, { error: 'quota_check_failed' });
  }

  const text = body.text.replace(/\s+/g, ' ').trim();
  let remaining = null;
  try {
    remaining = await consumeChars(userId, text.length);
  } catch (e) {
    console.error('consume_tts_quota failed', e);
    return sendJson(res, 503, { error: 'quota_check_failed' });
  }
  if (remaining !== null && remaining < 0) return sendJson(res, 429, { error: 'daily_limit' });

  const accent = ACCENTS[body.accent] ? body.accent : 'us';
  const locale = ACCENTS[accent];
  const gender = body.gender === 'male' ? 'male' : 'female';
  const age = Math.min(80, Math.max(15, Math.round(Number(body.age) || 30)));
  const rate = Number(body.rate) || 1;

  // AI の発言など長めの文は、ElevenLabs のより自然な声で読む（使えないときは下の Azure へ）
  const limit = parseInt(process.env.TTS_DAILY_CHAR_LIMIT, 10) || DEFAULT_DAILY_CHARS;
  const usedToday = remaining === null ? null : limit - remaining;
  const eleven = useEleven(text, usedToday) ? pickElevenVoice(accent, gender, age) : null;
  // Azure で読んだ理由（スピーカー設定に表示して、ElevenLabs が使えないときの原因を分かるようにする）
  let ttsNote = '';
  if (!env('ELEVENLABS_API_KEY')) ttsNote = 'not_configured';
  else if (text.length < (parseInt(process.env.ELEVENLABS_MIN_CHARS, 10) || ELEVEN_DEFAULT_MIN_CHARS)) ttsNote = 'short_text';
  else if (!useEleven(text, usedToday)) ttsNote = 'daily_share_used';
  else if (!eleven) ttsNote = 'no_voice';
  if (eleven) {
    try {
      const audio = await elevenAudio(text, eleven[0], rate);
      res.setHeader('Content-Type', 'audio/mpeg');
      res.setHeader('Cache-Control', 'private, max-age=86400');
      res.setHeader('X-Voice', `ElevenLabs:${eleven[1]}`);
      if (remaining !== null) res.setHeader('X-Tts-Remaining', String(remaining));
      return res.status(200).send(audio);
    } catch (e) {
      // 401 鍵の誤り / 402・429 文字数切れ・混雑 / 404 声が見つからない など → Azure で読む
      console.warn('ElevenLabs TTS failed; falling back to Azure', e.status || '', e.detail || e.message);
      let code = '';
      try { const d = JSON.parse(e.detail || '{}').detail; code = (d && (d.status || d.code)) || ''; } catch (err) { /* 本文が JSON でない */ }
      ttsNote = `elevenlabs_${e.status || 'error'}${code ? '_' + String(code).replace(/[^\w-]/g, '').slice(0, 40) : ''}`;
    }
  }

  const voice = pickVoice(locale, gender, age, await availableVoices(key));

  try {
    const upstream = await fetch(`${ttsHost()}/cognitiveservices/v1`, {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': key,
        'Content-Type': 'application/ssml+xml',
        'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3',
        'User-Agent': 'ScooPitch',
      },
      body: buildSsml(text, voice, locale, prosodyFor(age, rate)),
    });
    if (!upstream.ok) {
      const detail = (await upstream.text().catch(() => '')).slice(0, 300);
      console.error('Azure TTS error', upstream.status, detail);
      return sendJson(res, 502, { error: 'upstream_error', status: upstream.status });
    }
    const audio = Buffer.from(await upstream.arrayBuffer());
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'private, max-age=86400');
    res.setHeader('X-Voice', voice);
    if (ttsNote) res.setHeader('X-Tts-Note', ttsNote);
    if (remaining !== null) res.setHeader('X-Tts-Remaining', String(remaining));
    return res.status(200).send(audio);
  } catch (e) {
    console.error('Azure TTS unreachable', e);
    return sendJson(res, 502, { error: 'upstream_unreachable' });
  }
};

module.exports.pickVoice = pickVoice;
module.exports.pickElevenVoice = pickElevenVoice;
module.exports.useEleven = useEleven;
module.exports.prosodyFor = prosodyFor;
module.exports.buildSsml = buildSsml;
