interface GeminiImagePart {
  inlineData: { mimeType: string; data: string };
}
interface GeminiTextPart {
  text: string;
}
type GeminiPart = GeminiImagePart | GeminiTextPart;

export type { GeminiPart, GeminiImagePart, GeminiTextPart };

export async function generateImage(
  model: string,
  parts: GeminiPart[],
  aspectRatio?: string,
): Promise<{ imageBase64: string; mimeType: string; text?: string }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is not configured');

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const body = {
    contents: [{ parts }],
    generationConfig: {
      responseModalities: ['TEXT', 'IMAGE'],
      ...(aspectRatio && { imageConfig: { aspectRatio } }),
    },
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      `Gemini API error ${res.status}: ${(err as Record<string, any>)?.error?.message || res.statusText}`,
    );
  }

  const data = await res.json();
  const candidate = data.candidates?.[0];
  if (!candidate) throw new Error('No candidates returned from Gemini');

  let imageBase64 = '';
  let mimeType = 'image/png';
  let text: string | undefined;

  for (const part of candidate.content.parts) {
    if (part.inlineData) {
      imageBase64 = part.inlineData.data;
      mimeType = part.inlineData.mimeType || 'image/png';
    } else if (part.text) {
      text = part.text;
    }
  }

  if (!imageBase64) throw new Error('No image returned from Gemini');
  return { imageBase64, mimeType, text };
}
