interface CanvasItem {
  priority: number;
  x: number; // 0~1 normalized
  y: number; // 0~1 normalized
  size: number; // 0~1 relative size
}

function positionDescription(x: number, y: number): string {
  const vPos = y < 0.33 ? 'top' : y < 0.66 ? 'center' : 'bottom';
  const hPos = x < 0.33 ? 'left' : x < 0.66 ? 'center' : 'right';
  return `${vPos}-${hPos}`;
}

export function buildPromoPrompt(
  iconCount: number,
  width: number,
  height: number,
  canvasLayout?: CanvasItem[],
  userPrompt?: string,
): string {
  let layoutDesc = '';

  if (canvasLayout && canvasLayout.length > 0) {
    const sorted = [...canvasLayout].sort((a, b) => a.priority - b.priority);
    const items = sorted.map((item) => {
      const pos = positionDescription(item.x, item.y);
      const sizeLabel = item.priority === 1 ? 'large (main/hero)' : 'small (secondary)';
      return `item${item.priority} at ${pos}, ${sizeLabel}`;
    });
    layoutDesc = `\nLAYOUT: ${items.join('. ')}.`;
  } else {
    layoutDesc =
      '\nLAYOUT: First item (priority 1) is the MAIN item — place it large at top-center as the hero. Remaining items are secondary — place them smaller at the bottom.';
  }

  const base = `Create a game shop package product icon (${width}x${height}).${layoutDesc}
Items should have layered depth structure: back(big/main) → front(small/sub).
Items overlap slightly with natural perspective.
Add subtle shadows and glow effects for depth.
White/clean background, items form the composition.
The last image provided is a STYLE REFERENCE for layout/composition.`;

  return userPrompt ? `${base}\n\nAdditional instructions: ${userPrompt}` : base;
}

export function buildItemIconPrompt(userPrompt: string): string {
  return `Create a game item icon matching the style of the reference icons provided.
The first image is the shape/theme reference for the desired icon.
The remaining images are existing in-game icons — match their visual style for consistency.

Description: ${userPrompt}`;
}
