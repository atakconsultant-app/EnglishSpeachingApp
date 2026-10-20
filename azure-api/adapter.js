// Vercel 形式の関数 (req, res) を、Azure Functions（v4）の HTTP 関数として動かすためのつなぎ。
// req: method / headers（小文字） / query / body（JSONは解析済み） / rawBody（加工前の本文。Stripe の署名確認用）
// res: setHeader / status / json / send / end
async function toReq(request) {
  const headers = {};
  for (const [k, v] of request.headers.entries()) headers[k.toLowerCase()] = v;
  const query = {};
  for (const [k, v] of request.query.entries()) query[k] = v;
  let rawBody = Buffer.alloc(0);
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    rawBody = Buffer.from(await request.arrayBuffer());
  }
  let body;
  const type = (headers['content-type'] || '').split(';')[0].trim();
  if (type === 'application/json' && rawBody.length) {
    try { body = JSON.parse(rawBody.toString('utf8')); } catch (e) { body = rawBody.toString('utf8'); }
  } else if (rawBody.length) {
    body = rawBody.toString('utf8');
  }
  return { method: request.method, url: request.url, headers, query, body, rawBody };
}

function makeRes() {
  const out = { status: 200, headers: {}, body: undefined, done: false };
  const res = {
    setHeader(name, value) { out.headers[name] = String(value); return res; },
    getHeader(name) { return out.headers[name]; },
    status(code) { out.status = code; return res; },
    json(obj) {
      if (!out.headers['Content-Type']) out.headers['Content-Type'] = 'application/json; charset=utf-8';
      out.body = JSON.stringify(obj); out.done = true; return res;
    },
    send(data) {
      if (Buffer.isBuffer(data) || data instanceof Uint8Array) out.body = Buffer.from(data);
      else if (typeof data === 'object' && data !== null) return res.json(data);
      else out.body = data == null ? '' : String(data);
      out.done = true; return res;
    },
    end(data) { if (data !== undefined) res.send(data); out.done = true; return res; },
  };
  return { res, out };
}

function wrap(handler) {
  return async (request, context) => {
    const req = await toReq(request);
    const { res, out } = makeRes();
    try {
      await handler(req, res);
    } catch (e) {
      context.error(e);
      return { status: 500, jsonBody: { error: 'internal_error' } };
    }
    return { status: out.status, headers: out.headers, body: out.body };
  };
}

module.exports = { wrap, toReq, makeRes };
