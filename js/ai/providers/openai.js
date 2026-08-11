/**
 * OpenAI Chat Completions adapter
 */

export async function generateText({ apiKey, model, system, messages, temperature = 0.4, maxTokens = 900 }) {
  if (!apiKey) throw new Error('OpenAI API Key가 없습니다.');

  const body = {
    model: model || 'gpt-4o-mini',
    temperature,
    max_tokens: maxTokens,
    messages: [
      ...(system ? [{ role: 'system', content: system }] : []),
      ...messages.map((m) => ({ role: m.role, content: m.content })),
    ],
  };

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.error?.message || `OpenAI 오류 (${res.status})`;
    throw new Error(sanitizeError(msg));
  }

  const text = data?.choices?.[0]?.message?.content;
  if (!text) throw new Error('OpenAI 응답이 비어 있습니다.');
  return { text: String(text).trim(), raw: data, provider: 'openai', model: body.model };
}

function sanitizeError(msg) {
  return String(msg).replace(/sk-[a-zA-Z0-9_-]+/g, '[REDACTED]');
}
