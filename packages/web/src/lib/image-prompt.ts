import { IMPORTANCE_LEVELS, type ImportanceLevel } from '@aresdevunit/shared';

export interface PromoIconInfo {
  index: number;        // 1-based, matches image order sent to Gemini
  importance: string;   // ImportanceLevel key
  priority: number;     // z-order (lower = front when overlapping)
}

const IMPORTANCE_SIZE_DESC: Record<string, string> = {
  highest: '~40% of canvas area, hero/focal item',
  high: '~25% of canvas area, prominent',
  medium: '~15% of canvas area, supporting element',
  low: '~10% of canvas area, small accent',
};

export function buildPromoPrompt(
  icons: PromoIconInfo[],
  width: number,
  height: number,
  hasCanvasCapture: boolean,
  hasTemplate: boolean,
  userPrompt?: string,
): string {
  const lines: string[] = [];

  // 1. Task description
  lines.push(`Create a game shop package product icon (${width}x${height}).`);
  lines.push('');

  // 2. Per-icon role mapping
  lines.push('ITEM ROLES:');
  for (const icon of icons) {
    const impKey = icon.importance as ImportanceLevel;
    const impLabel = IMPORTANCE_LEVELS[impKey] ?? icon.importance;
    const sizeDesc = IMPORTANCE_SIZE_DESC[icon.importance] ?? 'supporting element';
    lines.push(
      `- Image ${icon.index}: importance=${impLabel} (render as ${sizeDesc}). z-order=${icon.priority} (${icon.priority === 1 ? 'appears in front when overlapping with other items' : `appears behind lower-numbered items when overlapping`}).`,
    );
  }
  lines.push('');

  // 3. Canvas capture reference
  if (hasCanvasCapture) {
    lines.push(
      'LAYOUT REFERENCE: The image immediately following this text (before the item images) shows the exact spatial arrangement on a canvas. Place each item at the same relative position and size shown in this reference.',
    );
    lines.push('');
  }

  // 4. Template / style reference
  if (hasTemplate) {
    lines.push(
      'STYLE REFERENCE: The last image is an existing product icon — match its visual style, depth effects, and composition quality.',
    );
    lines.push('');
  }

  // 5. Composition rules
  lines.push('COMPOSITION RULES:');
  lines.push('- Items should have layered depth: larger items behind, smaller items in front');
  lines.push('- When items overlap, the one with lower z-order number appears in FRONT');
  lines.push('- Add subtle shadows and glow effects for depth');
  lines.push('- White/clean background — items themselves form the composition');

  // 6. Optional user prompt
  if (userPrompt) {
    lines.push('');
    lines.push(`Additional instructions: ${userPrompt}`);
  }

  return lines.join('\n');
}

export function buildItemIconPrompt(userPrompt: string): string {
  return `Create a game item icon matching the style of the reference icons provided.
The first image is the shape/theme reference for the desired icon.
The remaining images are existing in-game icons — match their visual style for consistency.

Description: ${userPrompt}`;
}
