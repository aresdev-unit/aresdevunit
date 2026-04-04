export interface IconItem {
  id: string;
  fileName: string;
  base64: string;
  mimeType: string;
  priority: number;
  importance: string; // ImportanceLevel key
  width?: number;
  height?: number;
}

export interface PromoIconRequest {
  model: string;
  sizePreset: string;
  icons: { base64: string; mimeType: string; priority: number; importance: string }[];
  templateBase64?: string;
  templateMimeType?: string;
  prompt?: string;
  canvasImageBase64?: string;
  canvasImageMimeType?: string;
}

export interface ItemIconRequest {
  model: string;
  shapeRefBase64?: string;
  shapeRefMimeType?: string;
  prompt: string;
  referenceIcons: { base64: string; mimeType: string }[];
}

export interface GenerateRequest {
  type: 'promo-icon' | 'item-icon';
  payload: PromoIconRequest | ItemIconRequest;
}

export interface GenerateResponse {
  imageBase64: string;
  mimeType: string;
  text?: string;
}
