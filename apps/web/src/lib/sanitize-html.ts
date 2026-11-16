/**
 * Minimal allowlist HTML sanitizer for rendering CMS content in the browser.
 *
 * Uses DOMParser (client-only). On the server it returns an empty string so
 * untrusted markup is never emitted without sanitization.
 */

const DISALLOWED_TAGS = new Set([
  'script',
  'style',
  'iframe',
  'frame',
  'frameset',
  'object',
  'embed',
  'applet',
  'link',
  'meta',
  'base',
  'form',
  'input',
  'button',
  'textarea',
  'select',
  'option',
  'svg',
  'math',
  'template',
  'noscript',
]);

const URL_ATTRIBUTES = new Set(['href', 'src', 'xlink:href', 'action', 'formaction', 'srcdoc']);

function isSafeUrl(value: string): boolean {
  // Strip whitespace/control characters that browsers ignore inside scheme names.
  // eslint-disable-next-line no-control-regex
  const normalized = value.replace(/[\u0000- \u007F]+/g, '').toLowerCase();
  if (normalized.startsWith('javascript:') || normalized.startsWith('vbscript:')) return false;
  if (normalized.startsWith('data:') && !normalized.startsWith('data:image/')) return false;
  return true;
}

export function sanitizeHtml(html: string): string {
  if (!html) return '';
  if (typeof window === 'undefined' || typeof DOMParser === 'undefined') return '';

  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  const root = doc.body;

  const walk = (node: Element) => {
    for (const child of Array.from(node.children)) {
      const tag = child.tagName.toLowerCase();
      if (DISALLOWED_TAGS.has(tag)) {
        child.remove();
        continue;
      }
      for (const attr of Array.from(child.attributes)) {
        const name = attr.name.toLowerCase();
        if (name.startsWith('on')) {
          child.removeAttribute(attr.name);
          continue;
        }
        if (URL_ATTRIBUTES.has(name) && !isSafeUrl(attr.value)) {
          child.removeAttribute(attr.name);
          continue;
        }
        if (name === 'style' && /expression\s*\(|javascript:/i.test(attr.value)) {
          child.removeAttribute(attr.name);
        }
      }
      walk(child);
    }
  };

  walk(root);
  return root.innerHTML;
}
