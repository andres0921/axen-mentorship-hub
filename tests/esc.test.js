import { describe, it, expect } from 'vitest';
import { esc, safeUrl } from '../src/shared/esc.js';

describe('esc()', () => {
  it('escapes HTML special characters', () => {
    expect(esc(`<img src=x onerror="alert('1')">&`)).toBe(
      '&lt;img src=x onerror=&quot;alert(&#39;1&#39;)&quot;&gt;&amp;',
    );
  });
  it('returns empty string for null/undefined and stringifies other values', () => {
    expect(esc(null)).toBe('');
    expect(esc(undefined)).toBe('');
    expect(esc(0)).toBe('0');
    expect(esc(false)).toBe('false');
  });
  it('renders an XSS payload inert when used in innerHTML', () => {
    const div = document.createElement('div');
    div.innerHTML = `<p title="${esc('" onmouseover="x')}">${esc('<script>alert(1)</script><img src=x onerror=alert(1)>')}</p>`;
    expect(div.querySelector('script')).toBeNull();
    expect(div.querySelector('img')).toBeNull();
    expect(div.querySelector('p').getAttribute('onmouseover')).toBeNull();
    expect(div.textContent).toContain('<img src=x onerror=alert(1)>');
  });
});

describe('safeUrl()', () => {
  it('allows only http(s) URLs', () => {
    expect(safeUrl('https://zoom.us/j/1')).toBe('https://zoom.us/j/1');
    expect(safeUrl(' http://x.test ')).toBe('http://x.test');
    expect(safeUrl('javascript:alert(1)')).toBeNull();
    expect(safeUrl('data:text/html,x')).toBeNull();
    expect(safeUrl('//evil.com')).toBeNull();
    expect(safeUrl(null)).toBeNull();
  });
});
