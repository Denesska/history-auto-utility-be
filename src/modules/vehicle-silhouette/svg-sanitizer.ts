const ALLOWED_ELEMENTS = new Set(['svg', 'g', 'path', 'circle', 'ellipse', 'rect', 'polygon', 'polyline', 'line']);
const ALLOWED_ATTRIBUTES = new Set([
  'viewbox', 'xmlns', 'd', 'cx', 'cy', 'r', 'rx', 'ry', 'x', 'y', 'width', 'height', 'points',
  'x1', 'y1', 'x2', 'y2', 'fill', 'fill-rule', 'clip-rule', 'opacity', 'fill-opacity', 'stroke',
  'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'transform',
]);
// Attribute names are case-sensitive in SVG; this maps the lowercase match back to the canonical form.
const CANONICAL_NAME: Record<string, string> = { viewbox: 'viewBox' };

export const MAX_SVG_BYTES = 20 * 1024;
export const SVG_VIEWBOX = '0 0 240 100';

const NUMERIC_ATTR = /^-?\d*\.?\d+(e-?\d+)?(px|%)?$/i;
const PATH_DATA = /^[0-9eE\s,.\-+MmLlHhVvCcSsQqTtAaZz]*$/;
const POINTS = /^[0-9eE\s,.\-+]*$/;
const TRANSFORM = /^[0-9eE\s,.\-+()a-zA-Z]*$/;
const PAINT_ATTRS = new Set(['fill', 'stroke']);

export class SvgSanitizeError extends Error {}

/** Pulls the first `<svg ...>...</svg>` block out of a model response (which may be wrapped in code fences/prose). */
export function extractSvg(text: string): string | null {
  const match = /<svg[\s>][\s\S]*<\/svg>/i.exec(text ?? '');
  return match ? match[0] : null;
}

function sanitizeAttribute(name: string, value: string): string | null {
  const lower = name.toLowerCase();
  if (!ALLOWED_ATTRIBUTES.has(lower)) return null;
  const v = value.trim();
  if (PAINT_ATTRS.has(lower)) {
    // Never allow urls, named/hex colors or anything else that could look "off-theme": only currentColor/none.
    return v.toLowerCase() === 'none' ? 'none' : 'currentColor';
  }
  switch (lower) {
    case 'viewbox':
      return SVG_VIEWBOX; // always forced, the front end relies on it
    case 'xmlns':
      return v === 'http://www.w3.org/2000/svg' ? v : null;
    case 'd':
      return PATH_DATA.test(v) ? v : null;
    case 'points':
      return POINTS.test(v) ? v : null;
    case 'transform':
      return TRANSFORM.test(v) && !/url|javascript/i.test(v) ? v : null;
    case 'fill-rule':
    case 'clip-rule':
      return v === 'evenodd' || v === 'nonzero' ? v : null;
    case 'stroke-linecap':
      return ['butt', 'round', 'square'].includes(v) ? v : null;
    case 'stroke-linejoin':
      return ['miter', 'round', 'bevel'].includes(v) ? v : null;
    default:
      return NUMERIC_ATTR.test(v) ? v : null;
  }
}

/**
 * Strict allow-list sanitizer. Rebuilds the markup from scratch out of allowed elements/attributes only
 * (so scripts, foreignObject, event handlers, href, style, comments, entities... can never survive) and
 * verifies the tags are well formed. Throws SvgSanitizeError when the result is unusable.
 */
export function sanitizeSvg(raw: string): string {
  const input = raw.trim();
  if (/<!|<\?|&/.test(input)) throw new SvgSanitizeError('SVG contains comments, doctype, CDATA or entities');

  const tagRe = /<(\/?)([a-zA-Z][\w:-]*)((?:\s+[^<>]*?)?)\s*(\/?)>/g;
  const attrRe = /([a-zA-Z_:][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  const out: string[] = [];
  const stack: string[] = [];
  let pos = 0;
  let sawRoot = false;
  let drawn = 0;
  let m: RegExpExecArray | null;

  while ((m = tagRe.exec(input))) {
    // Any text between tags must be whitespace (no <text>, no stray content).
    if (input.slice(pos, m.index).trim()) throw new SvgSanitizeError('SVG contains text content');
    pos = tagRe.lastIndex;
    const [, closing, rawName, rawAttrs, selfClose] = m;
    const name = rawName.toLowerCase();
    if (!ALLOWED_ELEMENTS.has(name)) throw new SvgSanitizeError(`Disallowed element <${rawName}>`);

    if (closing) {
      if (stack.pop() !== name) throw new SvgSanitizeError('Unbalanced SVG tags');
      out.push(`</${name}>`);
      if (!stack.length) break;
      continue;
    }

    if (!sawRoot && name !== 'svg') throw new SvgSanitizeError('Root element is not <svg>');
    if (sawRoot && name === 'svg') throw new SvgSanitizeError('Nested <svg>');
    sawRoot = true;

    const attrs: string[] = [];
    const seen = new Set<string>();
    let a: RegExpExecArray | null;
    attrRe.lastIndex = 0;
    while ((a = attrRe.exec(rawAttrs))) {
      const key = a[1].toLowerCase();
      if (seen.has(key)) continue;
      const value = sanitizeAttribute(a[1], a[2] ?? a[3] ?? '');
      if (value === null) continue;
      seen.add(key);
      attrs.push(`${CANONICAL_NAME[key] ?? key}="${value}"`);
    }
    if (name === 'svg') {
      if (!seen.has('viewbox')) attrs.push(`viewBox="${SVG_VIEWBOX}"`);
      if (!seen.has('xmlns')) attrs.push('xmlns="http://www.w3.org/2000/svg"');
    } else if (name !== 'g') {
      drawn++;
    }

    out.push(`<${name}${attrs.length ? ' ' + attrs.join(' ') : ''}${selfClose ? '/' : ''}>`);
    if (!selfClose) stack.push(name);
    else if (name === 'svg') throw new SvgSanitizeError('Empty <svg>');
  }

  if (!sawRoot || stack.length) throw new SvgSanitizeError('SVG is not well formed');
  if (input.slice(pos).trim()) throw new SvgSanitizeError('Content after </svg>');
  if (drawn === 0) throw new SvgSanitizeError('SVG has no drawable shapes');

  const result = out.join('');
  if (Buffer.byteLength(result, 'utf8') > MAX_SVG_BYTES) throw new SvgSanitizeError('SVG exceeds size limit');
  return result;
}
