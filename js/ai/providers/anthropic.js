/**
 * Anthropic Claude Messages API adapter
 */

export async function generateText({
  apiKey,
  model,
  system,
  messages,
  temperature = 0.4,
  maxTokens = 900,
  apiVersion = '2023-06-01',
}) {
  if (!apiKey) throw new Error('Claude API Key가 없습니다.');

  const body = {
    model: model || 'claude-sonnet-4-6',
    max_tokens: maxTokens,
    temperature,
    system: system || undefined,
    messages: messages.map((m) => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: m.content,
    })),
  };

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': apiVersion,
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify(body),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.error?.message || data?.message || `Claude 오류 (${res.status})`;
    throw new Error(sanitizeError(msg));
  }

  const parts = Array.isArray(data.content) ? data.content : [];
  const text = parts
    .filter((p) => p.type === 'text')
    .map((p) => p.text)
    .join('\n')
    .trim();

  if (!text) throw new Error('Claude 응답이 비어 있습니다.');
  return { text, raw: data, provider: 'claude', model: body.model };
}

function sanitizeError(msg) {
  return String(msg)
    .replace(/sk-ant-[a-zA-Z0-9_-]+/g, '[REDACTED]')
    .replace(/sk-[a-zA-Z0-9_-]+/g, '[REDACTED]');
}
