import React, { useEffect, useRef, useState } from 'react';
import { RotateCw, ZoomIn, ZoomOut } from 'lucide-react';
import { Button } from '@/components/common';

interface Props { source: string; fileName: string; onError: (message: string) => void }

export default function ImageFilePreview({ source, fileName, onError }: Props) {
  const stage = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState({ width: 1, height: 1 });
  const [natural, setNatural] = useState({ width: 1, height: 1 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  useEffect(() => {
    if (!stage.current) return;
    const observer = new ResizeObserver(entries => setViewport({ width: Math.max(1, entries[0].contentRect.width), height: Math.max(1, entries[0].contentRect.height) }));
    observer.observe(stage.current);
    return () => observer.disconnect();
  }, []);
  const sideways = rotation % 180 !== 0;
  const rotated = sideways ? { width: natural.height, height: natural.width } : natural;
  const scale = Math.min(1, viewport.width / rotated.width, viewport.height / rotated.height) * zoom;
  return <div className="file-preview-viewer" onKeyDown={event => {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLButtonElement) return;
    if (event.key === '+' || event.key === '=') { event.preventDefault(); setZoom(previous => Math.min(4, previous + 0.25)); }
    if (event.key === '-') { event.preventDefault(); setZoom(previous => Math.max(0.25, previous - 0.25)); }
    if (event.key.toLowerCase() === 'r') { event.preventDefault(); setRotation(previous => (previous + 90) % 360); }
  }}>
    <div className="file-preview-toolbar" role="toolbar" aria-label="图片预览工具">
      <Button type="button" variant="ghost" className="min-h-11 min-w-11" aria-label="缩小图片" disabled={zoom <= 0.25} onClick={() => setZoom(previous => Math.max(0.25, previous - 0.25))}><ZoomOut size={18} /></Button>
      <span className="text-sm tabular-nums" aria-live="polite">{Math.round(zoom * 100)}%</span>
      <Button type="button" variant="ghost" className="min-h-11 min-w-11" aria-label="放大图片" disabled={zoom >= 4} onClick={() => setZoom(previous => Math.min(4, previous + 0.25))}><ZoomIn size={18} /></Button>
      <Button type="button" variant="ghost" className="min-h-11" onClick={() => setRotation(previous => (previous + 90) % 360)} aria-label="顺时针旋转图片90度"><RotateCw size={18} className="mr-1" />旋转</Button>
      <Button type="button" variant="ghost" className="min-h-11" onClick={() => { setZoom(1); setRotation(0); }}>重置</Button>
    </div>
    <div ref={stage} className="file-preview-image-stage" tabIndex={0} aria-label="图片内容；加减键缩放，R键旋转">
      <div className="file-preview-image-canvas" style={{ width: Math.max(viewport.width, rotated.width * scale), height: Math.max(viewport.height, rotated.height * scale) }}>
        <img src={source} alt={fileName} referrerPolicy="no-referrer"
          onLoad={event => setNatural({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })}
          onError={() => onError('图片内容损坏，无法安全预览，请下载核对')}
          style={{ width: natural.width * scale, height: natural.height * scale, transform: `translate(-50%, -50%) rotate(${rotation}deg)` }} />
      </div>
    </div>
  </div>;
}
