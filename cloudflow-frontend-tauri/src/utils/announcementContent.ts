import DOMPurify from 'dompurify';
import { marked } from 'marked';
import { escapeHtml } from '@/lib/security';

export type AnnouncementContentFormat = 'html' | 'markdown' | 'text';

const HTML_TAG_PATTERN = /<\/?[a-z][\s\S]*>/i;
const MARKDOWN_PATTERNS = [
  /(^|\n)#{1,6}\s+/,
  /(^|\n)\s*([-*+]|\d+\.)\s+/,
  /(^|\n)>\s+/,
  /(^|\n)```[\s\S]*?```/,
  /\[[^\]]+\]\([^)]+\)/,
  /(\*\*|__)[^*_]+(\*\*|__)/,
  /`[^`]+`/,
  /(^|\n)\|.+\|\s*(\n|$)/,
];

const ANNOUNCEMENT_ALLOWED_TAGS = [
  'a',
  'b',
  'blockquote',
  'br',
  'code',
  'div',
  'em',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'hr',
  'i',
  'img',
  'li',
  'ol',
  'p',
  'pre',
  'span',
  'strong',
  'table',
  'tbody',
  'td',
  'th',
  'thead',
  'tr',
  'ul',
];

const ANNOUNCEMENT_ALLOWED_ATTR = [
  'alt',
  'class',
  'height',
  'href',
  'rel',
  'src',
  'style',
  'target',
  'title',
  'width',
];

marked.setOptions({
  breaks: true,
  gfm: true,
});

function sanitizeAnnouncementHtml(dirty: string): string {
  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS: ANNOUNCEMENT_ALLOWED_TAGS,
    ALLOWED_ATTR: ANNOUNCEMENT_ALLOWED_ATTR,
    ALLOW_DATA_ATTR: false,
  });
}

function renderMarkdownToHtml(source: string): string {
  return marked.parse(source) as string;
}

// 纯文本公告按段落和换行转成 HTML，避免详情区域塌版。
function renderPlainTextToHtml(source: string): string {
  const paragraphs = source
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (paragraphs.length === 0) {
    return '';
  }

  return paragraphs
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, '<br />')}</p>`)
    .join('');
}

export function detectAnnouncementContentFormat(content?: string): AnnouncementContentFormat {
  const source = (content || '').trim();
  if (!source) {
    return 'text';
  }

  if (HTML_TAG_PATTERN.test(source)) {
    return 'html';
  }

  if (MARKDOWN_PATTERNS.some((pattern) => pattern.test(source))) {
    return 'markdown';
  }

  return 'text';
}

export function normalizeAnnouncementContentToHtml(content?: string): string {
  const source = (content || '').trim();
  if (!source) {
    return '';
  }

  const format = detectAnnouncementContentFormat(source);

  if (format === 'html') {
    return sanitizeAnnouncementHtml(source);
  }

  if (format === 'markdown') {
    return sanitizeAnnouncementHtml(renderMarkdownToHtml(source));
  }

  return sanitizeAnnouncementHtml(renderPlainTextToHtml(source));
}

export function renderAnnouncementHtml(
  content?: string,
  fallback = '<p>暂无正文内容</p>',
): string {
  const html = normalizeAnnouncementContentToHtml(content);
  return html || fallback;
}

// 摘要统一从最终 HTML 反推纯文本，避免 HTML/Markdown 两套逻辑再次分叉。
export function getAnnouncementPlainText(
  content?: string,
  fallback = '点击查看完整公告内容',
): string {
  const html = normalizeAnnouncementContentToHtml(content);
  if (!html) {
    return fallback;
  }

  if (typeof window !== 'undefined' && typeof DOMParser !== 'undefined') {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const text = doc.body.textContent?.replace(/\s+/g, ' ').trim();
    return text || fallback;
  }

  const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return text || fallback;
}

export function getAnnouncementExcerpt(
  content?: string,
  maxLength = 120,
  fallback = '点击查看完整公告内容',
): string {
  const plainText = getAnnouncementPlainText(content, fallback);
  if (plainText.length <= maxLength) {
    return plainText;
  }
  return `${plainText.slice(0, maxLength).trim()}...`;
}
