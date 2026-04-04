import { NextRequest, NextResponse } from 'next/server';
import {
  requireAuth,
  errorResponse,
  withCors,
  handleCorsPreflightResponse,
  type AuthUser,
} from '@/lib/api-middleware';
import { generateImage, type GeminiPart } from '@/lib/gemini';
import { buildPromoPrompt, buildItemIconPrompt } from '@/lib/image-prompt';
import { z } from 'zod';
import {
  MAX_ICONS,
  MAX_FILE_SIZE,
  SIZE_PRESETS,
  type SizePreset,
} from '@aresdevunit/shared';
import type {
  PromoIconRequest,
  ItemIconRequest,
} from '@aresdevunit/shared';

// --- Validation ---

const iconSchema = z.object({
  base64: z.string().min(1),
  mimeType: z.string().regex(/^image\/(png|jpeg|webp|gif)$/),
  priority: z.number().int().min(1).max(10),
  importance: z.string().min(1),
});

const promoPayloadSchema = z.object({
  model: z.string().min(1),
  sizePreset: z.string().min(1),
  icons: z.array(iconSchema).min(1).max(MAX_ICONS),
  templateBase64: z.string().optional(),
  templateMimeType: z.string().regex(/^image\/(png|jpeg|webp|gif)$/).optional(),
  prompt: z.string().max(2000).optional(),
  canvasImageBase64: z.string().optional(),
  canvasImageMimeType: z.string().regex(/^image\/(png|jpeg|webp|gif)$/).optional(),
});

const referenceIconSchema = z.object({
  base64: z.string().min(1),
  mimeType: z.string().regex(/^image\/(png|jpeg|webp|gif)$/),
});

const itemPayloadSchema = z.object({
  model: z.string().min(1),
  shapeRefBase64: z.string().optional(),
  shapeRefMimeType: z.string().regex(/^image\/(png|jpeg|webp|gif)$/).optional(),
  prompt: z.string().min(1).max(2000),
  referenceIcons: z.array(referenceIconSchema).max(MAX_ICONS),
});

const generateRequestSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('promo-icon'), payload: promoPayloadSchema }),
  z.object({ type: z.literal('item-icon'), payload: itemPayloadSchema }),
]);

// --- Helpers ---

function estimateBase64Size(b64: string): number {
  // Base64 encodes 3 bytes into 4 chars; approximate original size
  return Math.ceil(b64.length * 3 / 4);
}

function computeAspectRatio(preset: string): string | undefined {
  const entry = SIZE_PRESETS[preset as SizePreset];
  if (!entry) return undefined;
  if (entry.w === entry.h) return '1:1';
  // For non-square, provide closest standard ratio
  const ratio = entry.w / entry.h;
  if (Math.abs(ratio - 3 / 4) < 0.05) return '3:4';
  if (Math.abs(ratio - 4 / 3) < 0.05) return '4:3';
  // Fallback: let Gemini decide
  return undefined;
}

// --- Route Handlers ---

export async function OPTIONS() {
  return handleCorsPreflightResponse();
}

export async function POST(request: NextRequest) {
  // Auth required
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return withCors(authResult);
  const _user = authResult as AuthUser;

  // Parse body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return withCors(errorResponse('VALIDATION_ERROR', 'Invalid JSON body', 422));
  }

  // Validate
  const parsed = generateRequestSchema.safeParse(body);
  if (!parsed.success) {
    const message = parsed.error.errors
      .map((e) => `${e.path.join('.')}: ${e.message}`)
      .join(', ');
    return withCors(errorResponse('VALIDATION_ERROR', message, 422));
  }

  const input = parsed.data;
  console.log('[image/generate]', _user.id, input.type);

  try {
    if (input.type === 'promo-icon') {
      return withCors(await handlePromoIcon(input.payload));
    } else {
      return withCors(await handleItemIcon(input.payload));
    }
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Image generation failed';
    console.error('Image generation error:', error);

    if (message.includes('GEMINI_API_KEY')) {
      return withCors(errorResponse('CONFIG_ERROR', message, 500));
    }
    return withCors(errorResponse('GENERATION_ERROR', message, 502));
  }
}

async function handlePromoIcon(
  payload: PromoIconRequest,
): Promise<NextResponse> {
  const parts: GeminiPart[] = [];

  // Validate file sizes
  for (const icon of payload.icons) {
    if (estimateBase64Size(icon.base64) > MAX_FILE_SIZE) {
      return errorResponse('VALIDATION_ERROR', 'Icon exceeds 5MB size limit', 422);
    }
  }

  // Sort icons by priority (main first)
  const sortedIcons = [...payload.icons].sort((a, b) => a.priority - b.priority);

  // 1. TEXT PROMPT FIRST
  const sizeEntry = SIZE_PRESETS[payload.sizePreset as SizePreset];
  const promptW = sizeEntry?.w ?? 256;
  const promptH = sizeEntry?.h ?? 256;
  const iconInfos = sortedIcons.map((icon, idx) => ({
    index: idx + 1,
    importance: icon.importance,
    priority: icon.priority,
  }));
  const prompt = buildPromoPrompt(
    iconInfos,
    promptW,
    promptH,
    !!payload.canvasImageBase64,
    !!(payload.templateBase64 && payload.templateMimeType),
    payload.prompt,
  );
  parts.push({ text: prompt });

  // 2. CANVAS CAPTURE (layout reference)
  if (payload.canvasImageBase64 && payload.canvasImageMimeType) {
    parts.push({
      inlineData: {
        mimeType: payload.canvasImageMimeType,
        data: payload.canvasImageBase64,
      },
    });
  }

  // 3. ICON IMAGES (sorted by priority for z-order)
  for (const icon of sortedIcons) {
    parts.push({
      inlineData: { mimeType: icon.mimeType, data: icon.base64 },
    });
  }

  // 4. TEMPLATE (style reference, last)
  if (payload.templateBase64 && payload.templateMimeType) {
    parts.push({
      inlineData: {
        mimeType: payload.templateMimeType,
        data: payload.templateBase64,
      },
    });
  }

  const aspectRatio = computeAspectRatio(payload.sizePreset);
  const result = await generateImage(payload.model, parts, aspectRatio);

  return NextResponse.json({
    imageBase64: result.imageBase64,
    mimeType: result.mimeType,
    text: result.text,
  });
}

async function handleItemIcon(
  payload: ItemIconRequest,
): Promise<NextResponse> {
  const parts: GeminiPart[] = [];

  // Add shape reference first
  if (payload.shapeRefBase64 && payload.shapeRefMimeType) {
    if (estimateBase64Size(payload.shapeRefBase64) > MAX_FILE_SIZE) {
      return errorResponse('VALIDATION_ERROR', 'Shape reference exceeds 5MB size limit', 422);
    }
    parts.push({
      inlineData: {
        mimeType: payload.shapeRefMimeType,
        data: payload.shapeRefBase64,
      },
    });
  }

  // Add reference style icons
  for (const ref of payload.referenceIcons) {
    if (estimateBase64Size(ref.base64) > MAX_FILE_SIZE) {
      return errorResponse('VALIDATION_ERROR', 'Reference icon exceeds 5MB size limit', 422);
    }
    parts.push({
      inlineData: { mimeType: ref.mimeType, data: ref.base64 },
    });
  }

  // Build text prompt
  const prompt = buildItemIconPrompt(payload.prompt);
  parts.push({ text: prompt });

  const result = await generateImage(payload.model, parts, '1:1');

  return NextResponse.json({
    imageBase64: result.imageBase64,
    mimeType: result.mimeType,
    text: result.text,
  });
}
