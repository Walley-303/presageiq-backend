export const config = { api: { bodyParser: true } };

// In-memory rate limit — best-effort within a warm Vercel instance
// For hard limits use Vercel KV; this covers rapid-fire abuse cheaply
const RATE_LIMIT = new Map();
const MAX_CALLS_PER_WINDOW = 15;
const WINDOW_MS = 60 * 60 * 1000; // 1 hour

function checkRateLimit(ip) {
  const now = Date.now();
  const record = RATE_LIMIT.get(ip);

  if (record && now < record.resetAt) {
    if (record.count >= MAX_CALLS_PER_WINDOW) return false;
    record.count++;
  } else {
    RATE_LIMIT.set(ip, { count: 1, resetAt: now + WINDOW_MS });
  }

  // Prune stale entries so the Map doesn't grow forever
  if (RATE_LIMIT.size > 2000) {
    for (const [key, val] of RATE_LIMIT) {
      if (now > val.resetAt) RATE_LIMIT.delete(key);
    }
  }
  return true;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-override-key');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Rate limit by IP
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim()
    || req.socket?.remoteAddress
    || 'unknown';

  if (!checkRateLimit(ip)) {
    return res.status(429).json({ error: 'Rate limit exceeded', code: 'RATE_LIMITED' });
  }

  // x-override-key lets a user supply their own OpenAI key through the proxy
  // — used server-side for this request only, never stored
  const overrideKey = req.headers['x-override-key'];
  const serverKey = process.env.OPENAI_API_KEY;
  const apiKey = overrideKey || serverKey;

  if (!apiKey) return res.status(500).json({ error: 'API key not configured', code: 'NO_KEY' });

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;

    // Translate incoming Anthropic-style format → OpenAI format
    // Dashboard sends: { model, max_tokens, system, messages:[{role,content}] }
    const messages = [];
    if (body.system) {
      messages.push({ role: 'system', content: body.system });
    }
    if (Array.isArray(body.messages)) {
      for (const m of body.messages) {
        messages.push({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content });
      }
    }

    const openaiBody = {
      model: 'gpt-4o-mini',
      max_tokens: body.max_tokens || 1000,
      messages
    };

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(openaiBody)
    });

    const data = await response.json();

    if (!response.ok) {
      // Normalise OpenAI quota/auth errors into codes the dashboard understands
      const errCode = data?.error?.code || '';
      const errType = data?.error?.type || '';
      if (errCode === 'insufficient_quota' || errType === 'insufficient_quota') {
        return res.status(402).json({ error: 'API quota exceeded', code: 'CREDITS' });
      }
      if (response.status === 401) {
        return res.status(401).json({ error: 'Invalid API key', code: 'NO_KEY' });
      }
      return res.status(response.status).json({ ...data, code: 'API_ERROR' });
    }

    // Translate OpenAI response back to Anthropic-compatible shape
    // so the dashboard response parsing (data.content[0].text) doesn't need to change
    return res.status(200).json({
      content: [{ type: 'text', text: data.choices?.[0]?.message?.content || '' }],
      model: data.model,
      usage: data.usage
    });

  } catch (error) {
    return res.status(500).json({ error: 'Proxy error', details: error.message });
  }
}
