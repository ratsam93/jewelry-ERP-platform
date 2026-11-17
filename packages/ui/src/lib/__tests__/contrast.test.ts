import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Parses the real CSS variables from globals.css so the test can never drift from the tokens.
const cssPath = resolve(process.cwd(), 'src/globals.css');
const webCssPath = resolve(process.cwd(), '../../apps/web/app/globals.css');

type HSL = [number, number, number];
type RGB = [number, number, number];

function parseBlock(css: string, selector: ':root' | '.dark'): Record<string, HSL> {
  const start = css.indexOf(`${selector} {`);
  const end = css.indexOf('}', start);
  const body = css.slice(start, end);
  const out: Record<string, HSL> = {};
  for (const m of body.matchAll(/--([\w-]+):\s*([\d.]+)\s+([\d.]+)%\s+([\d.]+)%;/g)) {
    out[m[1]!] = [Number(m[2]), Number(m[3]), Number(m[4])];
  }
  return out;
}

function hslToRgb([h, s, l]: HSL): RGB {
  const sat = s / 100;
  const lig = l / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = sat * Math.min(lig, 1 - lig);
  const f = (n: number) => lig - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0) * 255, f(8) * 255, f(4) * 255];
}

const luminance = (rgb: RGB) => {
  const [r, g, b] = rgb.map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }) as RGB;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

function contrast(a: RGB, b: RGB) {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

const mix = (fg: RGB, bg: RGB, alpha: number) =>
  fg.map((v, i) => v * alpha + bg[i]! * (1 - alpha)) as RGB;

const css = readFileSync(cssPath, 'utf8');
const themes = { light: parseBlock(css, ':root'), dark: parseBlock(css, '.dark') };

describe.each(Object.entries(themes))('%s theme contrast (WCAG AA 4.5:1)', (_name, t) => {
  const rgb = (k: string) => {
    const v = t[k];
    if (!v) throw new Error(`missing token --${k}`);
    return hslToRgb(v);
  };
  const surfaces = ['background', 'card', 'popover', 'muted', 'secondary', 'accent'];

  const textPairs: Array<[string, string]> = [
    ...surfaces.flatMap(
      (s) =>
        [
          ['foreground', s],
          ['muted-foreground', s],
          ['primary-text', s],
          ['success-text', s],
          ['danger-text', s],
        ] as Array<[string, string]>,
    ),
    ['primary-foreground', 'primary'],
    ['destructive-foreground', 'destructive'],
  ];

  it.each(textPairs)('%s on %s', (fg, bg) => {
    expect(contrast(rgb(fg), rgb(bg))).toBeGreaterThanOrEqual(4.5);
  });

  it('text-primary on its own 10% tint (active sidebar item)', () => {
    const tint = mix(rgb('primary'), rgb('card'), 0.1);
    expect(contrast(rgb('primary-text'), tint)).toBeGreaterThanOrEqual(4.5);
  });

  it('danger text on destructive 10% tint (error banners)', () => {
    const tint = mix(rgb('destructive'), rgb('card'), 0.1);
    expect(contrast(rgb('danger-text'), tint)).toBeGreaterThanOrEqual(4.5);
  });
});

describe('contrast helper and key values', () => {
  it('computes known ratios', () => {
    expect(contrast([0, 0, 0], [255, 255, 255])).toBeCloseTo(21, 0);
    expect(contrast([255, 255, 255], [255, 255, 255])).toBeCloseTo(1, 5);
  });

  it('old white-on-gold fails (why the tokens exist)', () => {
    expect(contrast([255, 255, 255], hslToRgb([41, 80, 45]))).toBeLessThan(3);
  });

  it('gold fill + navy text and dark gold text reach AA', () => {
    const l = themes.light;
    expect(contrast(hslToRgb(l['primary-foreground']!), hslToRgb(l.primary!))).toBeGreaterThan(5);
    expect(contrast(hslToRgb(l['primary-text']!), [255, 255, 255])).toBeGreaterThan(5.5);
  });

  it('keeps the brand gold fill unchanged', () => {
    expect(themes.light.primary).toEqual([41, 80, 45]);
  });
});

describe('web app globals.css stays in sync with the shared tokens', () => {
  it('has identical :root and .dark tokens', () => {
    const web = readFileSync(webCssPath, 'utf8');
    expect(parseBlock(web, ':root')).toEqual(themes.light);
    expect(parseBlock(web, '.dark')).toEqual(themes.dark);
  });
});
