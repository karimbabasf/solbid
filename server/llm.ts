// NEAR AI Cloud, OpenAI-compatible. Returns null on any failure or timeout so callers fall back.
type Msg = { role: 'system' | 'user' | 'assistant'; content: string };

export async function llm(messages: Msg[], ms = 4000, json = false): Promise<string | null> {
  const key = process.env.NEAR_AI_API_KEY;
  const base = process.env.NEAR_AI_BASE_URL || 'https://cloud-api.near.ai/v1';
  const model = process.env.AUCTION_MODEL || process.env.NEAR_AI_MODEL || 'openai/gpt-oss-120b';
  if (!key) return null;
  try {
    const r = await fetch(`${base.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
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
