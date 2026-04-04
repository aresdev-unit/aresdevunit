'use client';

import { useRef, useEffect, useCallback, useState } from 'react';

export interface CanvasIcon {
  id: string;
  preview: string;
  priority: number;
  x: number; // 0~1 normalized
  y: number; // 0~1 normalized
  width: number; // 0~1 normalized
  height: number; // 0~1 normalized
}

interface CanvasPreviewProps {
  icons: CanvasIcon[];
  onLayoutChange: (icons: CanvasIcon[]) => void;
}

const CANVAS_SIZE = 480;
const GRID_STEP = 48;
const BG_COLOR = '#18181c';
const GRID_COLOR = '#222228';
const ACCENT_COLOR = '#4f6ef7';

export function CanvasPreview({ icons, onLayoutChange }: CanvasPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imagesRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const draggingRef = useRef<{ id: string; offsetX: number; offsetY: number } | null>(null);
  const iconsRef = useRef<CanvasIcon[]>(icons);
  const rafRef = useRef<number>(0);
  const [, forceRender] = useState(0);

  // Keep iconsRef in sync
  iconsRef.current = icons;

  // Load images when icons change
  useEffect(() => {
    const currentMap = imagesRef.current;
    const needed = new Set(icons.map((i) => i.id));

    // Remove stale entries
    for (const key of currentMap.keys()) {
      if (!needed.has(key)) currentMap.delete(key);
    }

    // Load new images
    for (const icon of icons) {
      if (!currentMap.has(icon.id)) {
        const img = new Image();
        img.onload = () => {
          forceRender((n) => n + 1);
        };
        img.src = icon.preview;
        currentMap.set(icon.id, img);
      }
    }
  }, [icons]);

  // Draw canvas
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const size = canvas.clientWidth;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.scale(dpr, dpr);

    // Background
    ctx.fillStyle = BG_COLOR;
    ctx.fillRect(0, 0, size, size);

    // Grid
    ctx.strokeStyle = GRID_COLOR;
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.5;
    const step = GRID_STEP * (size / CANVAS_SIZE);
    for (let x = step; x < size; x += step) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, size);
      ctx.stroke();
    }
    for (let y = step; y < size; y += step) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(size, y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // Center vertical guide
    ctx.strokeStyle = ACCENT_COLOR;
    ctx.globalAlpha = 0.15;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(size / 2, 0);
    ctx.lineTo(size / 2, size);
    ctx.stroke();
    ctx.globalAlpha = 1;

    // Sort icons by priority (lower priority drawn on top = last)
    const sorted = [...iconsRef.current].sort((a, b) => b.priority - a.priority);

    for (const icon of sorted) {
      const img = imagesRef.current.get(icon.id);
      const px = (icon.x - icon.width / 2) * size;
      const py = (icon.y - icon.height / 2) * size;
      const pw = icon.width * size;
      const ph = icon.height * size;

      if (img && img.complete && img.naturalWidth > 0) {
        ctx.drawImage(img, px, py, pw, ph);
      } else {
        // Placeholder
        ctx.fillStyle = '#1a1a1e';
        ctx.fillRect(px, py, pw, ph);
        ctx.strokeStyle = GRID_COLOR;
        ctx.lineWidth = 1;
        ctx.strokeRect(px, py, pw, ph);
      }

      // Priority badge
      const badgeR = 12;
      const bx = px + pw - badgeR + 2;
      const by = py + badgeR - 2;
      ctx.fillStyle = icon.priority === 1 ? ACCENT_COLOR : '#2a2a30';
      ctx.beginPath();
      ctx.arc(bx, by, badgeR, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(icon.priority), bx, by);
    }

    // Hint text
    ctx.fillStyle = '#141416';
    const hintW = 200;
    const hintH = 24;
    const hintX = (size - hintW) / 2;
    const hintY = size - 36;
    ctx.beginPath();
    ctx.roundRect(hintX, hintY, hintW, hintH, 4);
    ctx.fill();
    ctx.fillStyle = '#5a5a66';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('드래그하여 위치를 조정하세요', size / 2, hintY + hintH / 2);
  }, []);

  useEffect(() => {
    draw();
  }, [icons, draw]);

  // Resize observer
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver(() => draw());
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [draw]);

  const getCanvasPos = useCallback((e: React.PointerEvent): { nx: number; ny: number } => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      nx: (e.clientX - rect.left) / rect.width,
      ny: (e.clientY - rect.top) / rect.height,
    };
  }, []);

  const hitTest = useCallback(
    (nx: number, ny: number): CanvasIcon | null => {
      // Reverse order: lower priority number = higher z-order = tested first
      const sorted = [...iconsRef.current].sort((a, b) => a.priority - b.priority);
      for (const icon of sorted) {
        const left = icon.x - icon.width / 2;
        const top = icon.y - icon.height / 2;
        if (nx >= left && nx <= left + icon.width && ny >= top && ny <= top + icon.height) {
          return icon;
        }
      }
      return null;
    },
    [],
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      const { nx, ny } = getCanvasPos(e);
      const hit = hitTest(nx, ny);
      if (!hit) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      draggingRef.current = {
        id: hit.id,
        offsetX: nx - hit.x,
        offsetY: ny - hit.y,
      };
    },
    [getCanvasPos, hitTest],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!draggingRef.current) return;
      const { nx, ny } = getCanvasPos(e);
      const { id, offsetX, offsetY } = draggingRef.current;
      const idx = iconsRef.current.findIndex((i) => i.id === id);
      if (idx < 0) return;

      const updated = [...iconsRef.current];
      updated[idx] = {
        ...updated[idx],
        x: Math.max(0, Math.min(1, nx - offsetX)),
        y: Math.max(0, Math.min(1, ny - offsetY)),
      };
      iconsRef.current = updated;

      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(draw);
    },
    [getCanvasPos, draw],
  );

  const handlePointerUp = useCallback(() => {
    if (!draggingRef.current) return;
    draggingRef.current = null;
    onLayoutChange([...iconsRef.current]);
  }, [onLayoutChange]);

  return (
    <div className="w-full max-w-[480px]">
      <canvas
        ref={canvasRef}
        className="aspect-square w-full cursor-grab rounded-lg border border-zinc-200 active:cursor-grabbing dark:border-zinc-700"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      />
    </div>
  );
}
