import DOMPurify from 'dompurify';

export default function KnowledgeExternalContent({ content }: { content: string }) {
  const html = DOMPurify.sanitize(content, {
    ALLOWED_TAGS: ['p', 'br', 'b', 'strong', 'i', 'em', 'u', 'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tr', 'td', 'th', 'h1', 'h2', 'h3', 'div', 'span', 'blockquote'],
    ALLOWED_ATTR: [], ALLOW_DATA_ATTR: false, ALLOW_ARIA_ATTR: false,
  });
  return <div className="knowledge-external-content" dangerouslySetInnerHTML={{ __html: html }} />;
}
