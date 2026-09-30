// OpenAI-compatible chat call. Returns null on any failure or timeout so callers fall back.
// Key, base URL and model come as one set: LLM_* (OpenRouter today), else NEAR_AI_*. Never mixed.
type Msg = { role: 'system' | 'user' | 'assistant'; content: string };

function provider() {
  if (process.env.LLM_API_KEY) {
    return {
      key: process.env.LLM_API_KEY,
      base: process.env.LLM_BASE_URL || 'https://openrouter.ai/api/v1',
      model: process.env.LLM_MODEL || 'deepseek/deepseek-v4.1-flash',
      fallback: process.env.LLM_FALLBACK_MODEL,
    };
  }
  return {
    key: process.env.NEAR_AI_API_KEY,
    base: process.env.NEAR_AI_BASE_URL || 'https://cloud-api.near.ai/v1',
    model: process.env.NEAR_AI_MODEL || 'openai/gpt-oss-120b',
    fallback: undefined,
  };
}

export const llmLabel = () => {
  const p = provider();
  return p.key ? `${new URL(p.base).host} ${p.model}${p.fallback ? ` (fallback ${p.fallback})` : ''}` : 'none (rules only)';
};

export async function llm(messages: Msg[], ms = 4000, json = false): Promise<string | null> {
  const p = provider();
  if (!p.key) return null;
  const openrouter = p.base.includes('openrouter.ai');
  try {
    const r = await fetch(`${p.base.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${p.key}`, ...(openrouter ? { 'X-Title': 'SolBid' } : {}) },
      body: JSON.stringify({
        model: p.model,
        ...(openrouter && p.fallback ? { models: [p.model, p.fallback] } : {}),
        ...(openrouter ? { reasoning: { enabled: false }, provider: { sort: 'latency' } } : {}),
        messages,
        temperature: 0.8,
        max_tokens: 900,
        ...(json ? { response_format: { type: 'json_object' } } : {}),
      }),
      signal: AbortSignal.timeout(ms),
    });
    if (!r.ok) return null;
    const j: any = await r.json();
    const text = j?.choices?.[0]?.message?.content;
    return typeof text === 'string' && text.trim() ? text : null;
  } catch {
    return null;
  }
}

export function parseJson<T>(text: string | null): T | null {
  if (!text) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try {
      return JSON.parse(m[0]) as T;
    } catch {
      return null;
    }
  }
}
