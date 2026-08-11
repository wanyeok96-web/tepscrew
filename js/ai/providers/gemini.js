/**
 * Google Gemini generateContent adapter
 */

export async function generateText({ apiKey, model, system, messages, temperature = 0.4, maxTokens = 900 }) {
  if (!apiKey) throw new Error('Gemini API Key가 없습니다.');

  const modelId = model || 'gemini-2.0-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    modelId
  )}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const contents = messages.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));

  const body = {
    contents,
    generationConfig: {
      temperature,
      maxOutputTokens: maxTokens,
    },
  };

  if (system) {
    body.systemInstruction = { parts: [{ text: system }] };
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.error?.message || `Gemini 오류 (${res.status})`;
    throw new Error(sanitizeError(msg));
  }

  const text = data?.candidates?.[0]?.content?.parts
    ?.map((p) => p.text || '')
    .join('')
    .trim();

  if (!text) throw new Error('Gemini 응답이 비어 있습니다.');
  return { text, raw: data, provider: 'gemini', model: modelId };
}

function sanitizeError(msg) {
  return String(msg).replace(/AIza[0-9A-Za-z_-]+/g, '[REDACTED]');
}
