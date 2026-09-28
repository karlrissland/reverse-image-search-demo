import { useCallback, useEffect, useRef, useState } from 'react';

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface ImageCropperProps {
  src: string;
  onCropChange: (blob: Blob | null) => void;
}

// Client-side rectangle crop for POC crop search. The user drags a selection over the
// preview; on release we render that region to a canvas and emit a PNG blob.
export function ImageCropper({ src, onCropChange }: ImageCropperProps) {
  const imgRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [rect, setRect] = useState<Rect | null>(null);
  const dragStart = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    setRect(null);
    onCropChange(null);
  }, [src, onCropChange]);

  const toLocal = (clientX: number, clientY: number) => {
    const bounds = containerRef.current!.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(clientX - bounds.left, bounds.width)),
      y: Math.max(0, Math.min(clientY - bounds.top, bounds.height)),
    };
  };

  const onMouseDown = (e: React.MouseEvent) => {
    const p = toLocal(e.clientX, e.clientY);
    dragStart.current = p;
    setRect({ x: p.x, y: p.y, w: 0, h: 0 });
  };

  const onMouseMove = (e: React.MouseEvent) => {
    if (!dragStart.current) return;
    const p = toLocal(e.clientX, e.clientY);
    const start = dragStart.current;
    setRect({
      x: Math.min(start.x, p.x),
      y: Math.min(start.y, p.y),
      w: Math.abs(p.x - start.x),
      h: Math.abs(p.y - start.y),
    });
  };

  const emitCrop = useCallback(
    (selection: Rect) => {
      const img = imgRef.current;
      const container = containerRef.current;
      if (!img || !container || selection.w < 8 || selection.h < 8) {
        onCropChange(null);
        return;
      }
      const scaleX = img.naturalWidth / container.clientWidth;
      const scaleY = img.naturalHeight / container.clientHeight;
      const sx = selection.x * scaleX;
      const sy = selection.y * scaleY;
      const sw = selection.w * scaleX;
      const sh = selection.h * scaleY;

      const canvas = document.createElement('canvas');
      canvas.width = Math.round(sw);
      canvas.height = Math.round(sh);
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        onCropChange(null);
        return;
      }
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => onCropChange(blob), 'image/png');
    },
    [onCropChange],
  );

  const onMouseUp = () => {
    dragStart.current = null;
    if (rect) emitCrop(rect);
  };

  const clearCrop = () => {
    setRect(null);
    onCropChange(null);
  };

  return (
    <div className="cropper">
      <div
        ref={containerRef}
        className="cropper-canvas"
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
      >
        <img ref={imgRef} src={src} alt="Query preview" draggable={false} />
        {rect && rect.w > 0 && rect.h > 0 && (
          <div
            className="cropper-rect"
            style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}
          />
        )}
      </div>
      <div className="cropper-hint">
        <span>Drag to search part of the image, or search the whole photo.</span>
        {rect && (
          <button type="button" className="link-button" onClick={clearCrop}>
            Clear crop
          </button>
        )}
      </div>
    </div>
  );
}
