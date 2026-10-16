// Vercel Serverless Function: POST /api/chat
// ブラウザの代わりにサーバーで Claude API を呼ぶ。APIキーは環境変数 ANTHROPIC_API_KEY にだけ置く。
//
// 受け付けるのはログイン中の利用者だけ（Supabase のログイン情報をサーバー側で確認）。
// SUPABASE_SERVICE_ROLE_KEY があれば、1人1日あたりの呼び出し回数を Supabase で数えて上限を設ける。
//
// リクエスト: { purpose: 'chat' | 'score', messages: [{ role: 'user'|'assistant', content: string }, ...] }
// レスポンス: { text, remaining }   remaining は今日の残り回数（上限未設定なら null）

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

const PURPOSES = {
  // 会話は速くて安いモデル、最後の採点は精度の高いモデル（環境変数で変更可）
  chat: { model: () => process.env.AI_CHAT_MODEL || 'claude-haiku-5-5', maxTokens: 700 },
  score: { model: () => process.env.AI_SCORE_MODEL || 'claude-sonnet-5-5', maxTokens: 900 },
};
const MAX_MESSAGES = 40;
const MAX_TOTAL_CHARS = 30000;
const DEFAULT_DAILY_LIMIT = 60;

function env(...names) {
  for (const n of names) if (process.env[n]) return process.env[n];
  return '';
}
const supabaseUrl = () => env('NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_URL').replace(/\/$/, '');
const supabaseAnonKey = () => env('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_ANON_KEY');

function send(res, status, body) {
  res.setHeader('Cache-Control', 'no-store');
  return res.status(status).json(body);
}

// Supabase にログイン情報を問い合わせ、本物のログイン中ユーザーなら user.id を返す
async function getUserId(req) {
  const auth = req.headers.authorization || req.headers.Authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!token) return null;
  const r = await fetch(`${supabaseUrl()}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${token}`, apikey: supabaseAnonKey() },
  });
  if (!r.ok) return null;
  const user = await r.json();
  return user && user.id ? user.id : null;
}

// 今日の利用回数を1つ増やし、残り回数を返す（上限超過なら -1）。上限の仕組みが未設定なら null
async function consumeQuota(userId) {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return null;
  const limit = parseInt(process.env.AI_DAILY_LIMIT, 10) || DEFAULT_DAILY_LIMIT;
  const r = await fetch(`${supabaseUrl()}/rest/v1/rpc/consume_ai_quota`, {
    method: 'POST',
    headers: {
      apikey: serviceKey,
      // 旧形式（JWT）の service_role キーだけ Authorization にも載せる。
      // 新形式の sb_secret_… キーはJWTではないため、apikey ヘッダーだけで送る（Supabaseの指定）
      ...(serviceKey.startsWith('eyJ') ? { Authorization: `Bearer ${serviceKey}` } : {}),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ p_user_id: userId, p_limit: limit }),
  });
  if (!r.ok) throw new Error(`quota rpc ${r.status}`);
  return Number(await r.json());
}

function validate(body) {
  if (!body || typeof body !== 'object') return 'invalid_body';
  if (!PURPOSES[body.purpose]) return 'invalid_purpose';
  const msgs = body.messages;
  if (!Array.isArray(msgs) || msgs.length === 0 || msgs.length > MAX_MESSAGES) return 'invalid_messages';
  let total = 0;
  for (const m of msgs) {
    if (!m || (m.role !== 'user' && m.role !== 'assistant') || typeof m.content !== 'string' || !m.content) return 'invalid_messages';
    total += m.content.length;
  }
  if (msgs[0].role !== 'user') return 'invalid_messages';
  if (total > MAX_TOTAL_CHARS) return 'too_long';
  return null;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return send(res, 405, { error: 'method_not_allowed' });
  }
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return send(res, 503, { error: 'not_configured', message: 'ANTHROPIC_API_KEY が設定されていません' });
  if (!supabaseUrl() || !supabaseAnonKey()) return send(res, 503, { error: 'auth_not_configured' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = null; } }
  const invalid = validate(body);
  if (invalid) return send(res, 400, { error: invalid });

  let userId;
  try { userId = await getUserId(req); } catch (e) { userId = null; }
  if (!userId) return send(res, 401, { error: 'unauthorized', message: 'ログインが必要です' });

  let remaining = null;
  try {
    remaining = await consumeQuota(userId);
  } catch (e) {
    console.error('consume_ai_quota failed', e);
    return send(res, 503, { error: 'quota_check_failed' });
  }
  if (remaining !== null && remaining < 0) {
    return send(res, 429, { error: 'daily_limit', message: '本日のAI利用回数の上限に達しました' });
  }

  const p = PURPOSES[body.purpose];
  try {
    const upstream = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: p.model(),
        max_tokens: p.maxTokens,
        messages: body.messages.map(m => ({ role: m.role, content: m.content })),
      }),
    });
    const data = await upstream.json().catch(() => null);
    if (!upstream.ok) {
      console.error('Anthropic API error', upstream.status, data && data.error);
      const detail = data && data.error && data.error.message ? String(data.error.message).slice(0, 300) : '';
      return send(res, 502, { error: 'upstream_error', status: upstream.status, detail });
    }
    const text = (data.content || []).filter(c => c.type === 'text').map(c => c.text).join('');
    return send(res, 200, { text, remaining });
  } catch (e) {
    console.error('Anthropic API unreachable', e);
    return send(res, 502, { error: 'upstream_unreachable' });
  }
};
