import React, { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Loader2, RotateCw, Search, ZoomIn, ZoomOut } from 'lucide-react';
import { AnnotationMode, getDocument, GlobalWorkerOptions, TextLayer, VerbosityLevel, type PDFDocumentProxy, type RenderTask } from 'pdfjs-dist/legacy/build/pdf.mjs';
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.mjs?url';
import { Button, Input } from '@/components/common';
import 'pdfjs-dist/web/pdf_viewer.css';

GlobalWorkerOptions.workerSrc = workerUrl;

interface Props { data: Uint8Array; fileName: string; onError: (message: string) => void }
interface SearchMatch { page: number; offset: number; length: number }
const MAX_SEARCH_MATCHES = 1000;
const MAX_CANVAS_PIXELS = 16777216;

export default function PdfFilePreview({ data, fileName, onError }: Props) {
  const [pdf, setPdf] = useState<PDFDocumentProxy>();
  const [page, setPage] = useState(1);
  const [pageInput, setPageInput] = useState('1');
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [rendering, setRendering] = useState(true);
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [matches, setMatches] = useState<SearchMatch[]>([]);
  const [matchIndex, setMatchIndex] = useState(0);
  const [truncated, setTruncated] = useState(false);
  const stage = useRef<HTMLDivElement>(null);
  const pageHost = useRef<HTMLDivElement>(null);
  const textLayer = useRef<TextLayer | undefined>(undefined);
  const [width, setWidth] = useState(800);
  const report = useRef(onError);
  report.current = onError;

  useEffect(() => {
    let live = true;
    const assets = new URL(`${import.meta.env.BASE_URL}pdf-preview-assets/`, window.location.origin).href;
    const task = getDocument({ data: new Uint8Array(data), cMapUrl: assets + 'cmaps/', cMapPacked: true,
      standardFontDataUrl: assets + 'standard_fonts/', wasmUrl: assets + 'wasm/', iccUrl: assets + 'iccs/',
      enableXfa: false, useWorkerFetch: true, useSystemFonts: false, stopAtErrors: true,
      disableAutoFetch: true, disableStream: true, verbosity: VerbosityLevel.ERRORS });
    task.onPassword = () => { if (live) report.current('该PDF需要密码，请通过原入口下载后使用本地阅读器打开'); void task.destroy().catch(() => undefined); };
    void task.promise.then(document => { if (live) setPdf(document); }).catch(() => {
      if (live) report.current('PDF损坏、加密或包含不支持的内容，请通过原入口下载核对');
    });
    return () => { live = false; void task.destroy().catch(() => undefined); };
  }, [data]);

  useEffect(() => {
    const container = stage.current;
    if (!container) return;
    const observer = new ResizeObserver(entries => setWidth(Math.max(120, entries[0].contentRect.width - 24)));
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => { setPageInput(String(page)); }, [page]);

  useEffect(() => {
    if (!pdf || !pageHost.current) return;
    let live = true;
    let drawing: RenderTask | undefined;
    let text: TextLayer | undefined;
    const host = pageHost.current;
    const canvas = document.createElement('canvas');
    const textContainer = document.createElement('div');
    textContainer.className = 'textLayer';
    canvas.setAttribute('aria-label', `${fileName} 第${page}页`);
    host.replaceChildren(canvas, textContainer);
    setRendering(true);
    void (async () => {
      try {
        const pdfPage = await pdf.getPage(page);
        if (!live) return;
        const unscaled = pdfPage.getViewport({ scale: 1, rotation: (pdfPage.rotate + rotation) % 360 });
        const scale = Math.max(0.1, Math.min(width / unscaled.width, 1.5)) * zoom;
        const viewport = pdfPage.getViewport({ scale, rotation: (pdfPage.rotate + rotation) % 360 });
        const density = Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(MAX_CANVAS_PIXELS / (viewport.width * viewport.height)));
        if (!Number.isFinite(density) || density <= 0) throw new Error('INVALID_PDF_PAGE');
        canvas.width = Math.max(1, Math.floor(viewport.width * density));
        canvas.height = Math.max(1, Math.floor(viewport.height * density));
        canvas.style.width = `${viewport.width}px`; canvas.style.height = `${viewport.height}px`;
        host.style.width = `${viewport.width}px`; host.style.height = `${viewport.height}px`;
        host.style.setProperty('--scale-factor', String(viewport.scale));
        host.style.setProperty('--total-scale-factor', String(viewport.scale));
        drawing = pdfPage.render({ canvas, viewport, transform: [density, 0, 0, density, 0, 0], annotationMode: AnnotationMode.DISABLE });
        const renderText = pdfPage.getTextContent().then(content => {
          if (!live) return;
          text = new TextLayer({ textContentSource: content, container: textContainer, viewport });
          textLayer.current = text;
          return text.render();
        });
        await Promise.all([drawing.promise, renderText]);
      } catch {
        if (live) report.current('PDF页面无法安全渲染，请通过原入口下载核对');
      } finally { if (live) setRendering(false); }
    })();
    return () => { live = false; drawing?.cancel(); text?.cancel(); textLayer.current = undefined; host.replaceChildren(); canvas.width = 0; canvas.height = 0; };
  }, [pdf, page, width, zoom, rotation, fileName]);

  useEffect(() => {
    const layer = textLayer.current;
    if (rendering || !layer) return;
    const pageMatches = matches.map((match, index) => ({ ...match, index })).filter(match => match.page === page);
    let offset = 0;
    const selected: HTMLElement[] = [];
    layer.textDivs.forEach((div, index) => {
      const original = layer.textContentItemsStr[index];
      const end = offset + original.length;
      const fragments: Node[] = [];
      let cursor = 0;
      for (const match of pageMatches) {
        if (match.offset >= end || match.offset + match.length <= offset) continue;
        const start = Math.max(0, match.offset - offset);
        const finish = Math.min(original.length, match.offset + match.length - offset);
        if (cursor < start) fragments.push(document.createTextNode(original.slice(cursor, start)));
        const highlight = document.createElement('span');
        highlight.className = `highlight appended file-preview-text-match${match.index === matchIndex ? ' selected' : ''}`;
        highlight.textContent = original.slice(start, finish);
        highlight.dataset.matchIndex = String(match.index);
        fragments.push(highlight);
        if (match.index === matchIndex) selected.push(highlight);
        cursor = finish;
      }
      if (cursor < original.length) fragments.push(document.createTextNode(original.slice(cursor)));
      div.replaceChildren(...fragments);
      offset = end;
    });
    selected[0]?.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
  }, [matches, matchIndex, page, rendering]);

  useEffect(() => {
    let live = true;
    const needle = query.trim();
    setMatches([]); setMatchIndex(0); setTruncated(false);
    if (!pdf || !needle) { setSearching(false); return; }
    setSearching(true);
    const timer = window.setTimeout(() => {
      void (async () => {
        const found: SearchMatch[] = [];
        try {
          for (let pageNumber = 1; pageNumber <= pdf.numPages && live; pageNumber++) {
            const pdfPage = await pdf.getPage(pageNumber);
            const content = await pdfPage.getTextContent();
            const text = content.items.map(item => 'str' in item ? item.str : '').join('');
            const pattern = new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'giu');
            let hasMore = false;
            for (const match of text.matchAll(pattern)) {
              if (found.length === MAX_SEARCH_MATCHES) { hasMore = true; break; }
              found.push({ page: pageNumber, offset: match.index, length: match[0].length });
            }
            if (hasMore) { if (live) setTruncated(true); break; }
            if (pageNumber % 10 === 0) await new Promise(resolve => window.setTimeout(resolve, 0));
          }
          if (live) { setMatches(found); if (found[0]) setPage(found[0].page); }
        } catch { if (live) report.current('PDF文字搜索失败，请通过原入口下载核对'); }
        finally { if (live) setSearching(false); }
      })();
    }, 300);
    return () => { live = false; window.clearTimeout(timer); };
  }, [pdf, query]);

  const turn = (next: number) => { if (pdf) setPage(Math.max(1, Math.min(pdf.numPages, next))); };
  const jump = () => { const next = Number(pageInput); if (Number.isSafeInteger(next)) turn(next); else setPageInput(String(page)); };
  const selectMatch = (direction: number) => {
    if (!matches.length) return;
    const next = (matchIndex + direction + matches.length) % matches.length;
    setMatchIndex(next); turn(matches[next].page);
  };

  return <div className="file-preview-viewer" onKeyDown={event => {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLButtonElement) return;
    if (event.key === 'ArrowLeft') { event.preventDefault(); turn(page - 1); }
    if (event.key === 'ArrowRight') { event.preventDefault(); turn(page + 1); }
  }}>
    <div className="file-preview-toolbar" role="toolbar" aria-label="PDF预览工具">
      <Button type="button" variant="ghost" className="min-h-11 min-w-11" aria-label="上一页" disabled={!pdf || page <= 1} onClick={() => turn(page - 1)}><ChevronLeft size={18} /></Button>
      <Input aria-label="PDF页码" type="number" min={1} max={pdf?.numPages || 1} value={pageInput} className="file-preview-page-input" onChange={event => setPageInput(event.target.value)} onBlur={jump} onKeyDown={event => { if (event.key === 'Enter') jump(); }} />
      <span className="text-sm whitespace-nowrap" aria-live="polite">/ {pdf?.numPages || '—'} 页</span>
      <Button type="button" variant="ghost" className="min-h-11 min-w-11" aria-label="下一页" disabled={!pdf || page >= pdf.numPages} onClick={() => turn(page + 1)}><ChevronRight size={18} /></Button>
      <Button type="button" variant="ghost" className="min-h-11 min-w-11" aria-label="缩小PDF" disabled={zoom <= 0.5} onClick={() => setZoom(previous => Math.max(0.5, previous - 0.25))}><ZoomOut size={18} /></Button>
      <span className="text-sm tabular-nums">{Math.round(zoom * 100)}%</span>
      <Button type="button" variant="ghost" className="min-h-11 min-w-11" aria-label="放大PDF" disabled={zoom >= 3} onClick={() => setZoom(previous => Math.min(3, previous + 0.25))}><ZoomIn size={18} /></Button>
      <Button type="button" variant="ghost" className="min-h-11 min-w-11" aria-label="顺时针旋转PDF90度" onClick={() => setRotation(previous => (previous + 90) % 360)}><RotateCw size={18} /></Button>
    </div>
    <div className="file-preview-toolbar" role="search" aria-label="搜索PDF文字">
      <Search size={16} aria-hidden="true" /><Input aria-label="搜索文档" placeholder="搜索文档文字" value={query} maxLength={100} onChange={event => setQuery(event.target.value)} className="file-preview-search-input" />
      <Button type="button" variant="ghost" className="min-h-11 min-w-11" aria-label="上一处匹配" disabled={!matches.length || searching} onClick={() => selectMatch(-1)}><ChevronLeft size={18} /></Button>
      <span className="text-xs tabular-nums" role="status">{searching ? '搜索中…' : query.trim() ? `${matches.length ? matchIndex + 1 : 0} / ${matches.length}${truncated ? '（前1000处）' : ''}` : '输入文字搜索'}</span>
      <Button type="button" variant="ghost" className="min-h-11 min-w-11" aria-label="下一处匹配" disabled={!matches.length || searching} onClick={() => selectMatch(1)}><ChevronRight size={18} /></Button>
    </div>
    <div ref={stage} className="file-preview-pdf-stage" tabIndex={0} aria-label="PDF页面内容；左右方向键翻页">
      {rendering && <div role="status" className="file-preview-render-status"><Loader2 size={18} className="animate-spin motion-reduce:animate-none" />正在渲染第{page}页…</div>}
      <div ref={pageHost} className="file-preview-pdf-page" />
    </div>
  </div>;
}
