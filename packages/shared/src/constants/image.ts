export const IMAGE_CATEGORIES = {
  'promo-icon': '상품 아이콘',
  'item-icon': '아이템 아이콘',
} as const;
export type ImageCategory = keyof typeof IMAGE_CATEGORIES;

export const SIZE_PRESETS = {
  '256x256': { w: 256, h: 256, label: '상품 Product (대)' },
  '180x180': { w: 180, h: 180, label: '상품 Product (소)' },
  '112x112': { w: 112, h: 112, label: '무기/아머/코스튬' },
  '106x106': { w: 106, h: 106, label: '기본 아이콘' },
  '150x150': { w: 150, h: 150, label: '렐릭' },
  '200x200': { w: 200, h: 200, label: '모듈' },
  '100x100': { w: 100, h: 100, label: '재료' },
  '142x182': { w: 142, h: 182, label: 'Large 카드' },
  '106x136': { w: 106, h: 136, label: 'Piece 카드' },
  '68x80':   { w: 68, h: 80,  label: 'HUD' },
} as const;
export type SizePreset = keyof typeof SIZE_PRESETS;

export const IMPORTANCE_LEVELS = {
  'highest': '최상',
  'high': '상',
  'medium': '중',
  'low': '하',
} as const;
export type ImportanceLevel = keyof typeof IMPORTANCE_LEVELS;

export const MODEL_OPTIONS = {
  'gemini-3.1-flash-image-preview': 'Flash (빠름)',
  'gemini-3-pro-image-preview': 'Pro (품질)',
} as const;
export type ModelOption = keyof typeof MODEL_OPTIONS;

export const MAX_PRIORITY = 10;
export const MAX_ICONS = 14; // Gemini limit
export const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
