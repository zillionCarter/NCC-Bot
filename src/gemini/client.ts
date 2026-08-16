export interface GeminiMessage {
  role: 'user' | 'model';
  text: string;
}

export interface FunctionCall {
  name: string;
  args: Record<string, unknown>;
}

export interface GeminiResult {
  text: string | null;
  functionCall: FunctionCall | null;
}

const MODEL = 'gemini-3.5-flash-lite';
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

export async function callGemini(
  apiKey: string,
  systemInstruction: string,
  history: GeminiMessage[],
  tools: unknown[],
  fetchImpl: typeof fetch = fetch
): Promise<GeminiResult> {
  const res = await fetchImpl(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: systemInstruction }] },
      contents: history.map((m) => ({ role: m.role, parts: [{ text: m.text }] })),
      ...(tools.length ? { tools: [{ functionDeclarations: tools }] } : {}),
    }),
  });

  if (!res.ok) {
    throw new Error(`Gemini API error ${res.status}: ${await res.text()}`);
  }

  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string; functionCall?: FunctionCall }[] } }[];
  };
  const parts = data.candidates?.[0]?.content?.parts ?? [];
  const textPart = parts.find((p) => typeof p.text === 'string');
  const fnPart = parts.find((p) => p.functionCall);

  return {
    text: textPart?.text ?? null,
    functionCall: fnPart?.functionCall ?? null,
  };
}
