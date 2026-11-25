// Mobile layout guards for the mentor app: the responsive chrome in index.html,
// the full-screen-on-mobile modal shell and the 44px score pills. These check
// markup only (no layout engine in jsdom), so they stay cheap and not brittle.
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// forms.js imports data.js (Supabase client); the markup helpers never touch it.
vi.mock('../src/mentor/data.js', () => ({}));

const { modalShell } = await import('../src/mentor/views/forms.js');
const { scoreRow, dealsMeter, emptyState } = await import('../src/mentor/views/common.js');
const { renderDashboardSkeleton } = await import('../src/mentor/views/dashboard.js');

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(resolve(root, 'index.html'), 'utf8');
const doc = new DOMParser().parseFromString(html, 'text/html');
const classes = (el) => el.getAttribute('class').split(/\s+/);

describe('index.html mobile chrome', () => {
  it('keeps every ID main.js relies on, exactly once', () => {
    for (const id of ['export-btn', 'add-mentee-btn', 'profile-btn', 'signout-btn', 'page-title', 'page-subtitle',
      'auth-overlay', 'auth-form', 'grad-badge', 'modal-root', 'app', 'sidebar', 'nav-toggle', 'nav-close',
      'nav-backdrop', 'header-menu', 'header-menu-btn', 'app-header', 'mentor-tabbar', 'tabbar-more', 'fab-add',
      'auth-email', 'auth-submit', 'auth-message', 'auth-code-form', 'auth-code', 'auth-passkey', 'auth-google',
      'auth-use-password', 'auth-mfa-form', 'auth-pending']) {
      expect(doc.querySelectorAll(`#${id}`).length, id).toBe(1);
    }
    const ids = [...doc.querySelectorAll('[id]')].map(el => el.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('has an accessible hamburger that controls the sidebar, hidden on md+', () => {
    const toggle = doc.getElementById('nav-toggle');
    expect(toggle.getAttribute('aria-label')).toBe('Open menu');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(doc.getElementById(toggle.getAttribute('aria-controls'))).toBe(doc.getElementById('sidebar'));
    expect(classes(toggle)).toContain('md:hidden');
    expect(doc.querySelector('#sidebar nav')).not.toBeNull();
  });

  it('offsets main only from md up and pads #app for phones', () => {
    expect(classes(doc.querySelector('main'))).toEqual(expect.arrayContaining(['md:ml-64']));
    expect(classes(doc.querySelector('main'))).not.toContain('ml-64');
    expect(classes(doc.getElementById('app'))).toEqual(expect.arrayContaining(['p-4', 'md:p-8']));
  });

  it('keeps sign out hidden until enterApp and inside the header menu', () => {
    const btn = doc.getElementById('signout-btn');
    expect(classes(btn)).toContain('hidden');
    // no display utility that would override `hidden` at any breakpoint
    expect(classes(btn).some(c => /(^|:)(block|flex|inline-flex|inline-block)$/.test(c))).toBe(false);
    expect(doc.getElementById('header-menu').contains(btn)).toBe(true);
    expect(classes(doc.getElementById('header-menu'))).toContain('md:contents');
  });

  it('has no inline event handlers', () => {
    const withHandlers = [...doc.querySelectorAll('*')]
      .filter(el => [...el.attributes].some(a => /^on/i.test(a.name)));
    expect(withHandlers).toEqual([]);
  });
});

describe('index.html sign-in', () => {
  it('starts signed-out with the shell-hiding class and a loading step (no form flash)', () => {
    expect(classes(doc.body)).toContain('auth-open');
    const steps = [...doc.querySelectorAll('#auth-overlay [data-auth-step]')];
    expect(steps.map(s => s.dataset.authStep).sort()).toEqual(['code', 'email', 'loading', 'mfa', 'pending']);
    expect(steps.filter(s => !classes(s).includes('hidden')).map(s => s.dataset.authStep)).toEqual(['loading']);
  });
  it('keeps Google and passkey hidden until the app knows they work', () => {
    for (const id of ['auth-google', 'auth-passkey']) expect(classes(doc.getElementById(id))).toContain('hidden');
  });
});

describe('index.html native-feel phone layer', () => {
  it('opts into safe-area insets and PWA metadata', () => {
    expect(doc.querySelector('meta[name=viewport]').getAttribute('content')).toMatch(/viewport-fit=cover/);
    expect(doc.querySelector('link[rel=manifest]').getAttribute('href')).toBe('/manifest.webmanifest');
    expect(doc.querySelector('meta[name=theme-color]').getAttribute('content')).toBe('#0c1424');
    expect(doc.querySelector('link[rel=apple-touch-icon]')).not.toBeNull();
  });

  it('has a four-tab bottom bar: three views plus More (opens the drawer)', () => {
    const tabs = [...doc.querySelectorAll('#mentor-tabbar .mentor-tab')];
    expect(tabs.map(t => t.dataset.tab)).toEqual(['dashboard', 'mentees', 'checkin', 'more']);
    for (const t of tabs.slice(0, 3)) {
      expect(t.dataset.action).toBe('nav');
      expect(t.dataset.view).toBe(t.dataset.tab);
    }
    const more = doc.getElementById('tabbar-more');
    expect(more.getAttribute('aria-controls')).toBe('sidebar');
    expect(more.dataset.action).toBeUndefined();
    // mentor-specific classes only; the mentee portal's tab bar classes are untouched
    expect(doc.querySelector('.tabbar, .tab-btn, .pb-tabbar')).toBeNull();
  });

  it('keeps the tab bar and FAB out of the desktop markup flow (CSS-gated, no #add-mentee-btn clone)', () => {
    expect(classes(doc.getElementById('mentor-tabbar'))).toContain('mentor-tabbar');
    expect(classes(doc.getElementById('fab-add'))).toContain('mentor-fab');
    expect(doc.querySelectorAll('#add-mentee-btn').length).toBe(1);
  });
});

describe('modalShell', () => {
  it('is a bottom sheet below md and the original centered card from md up', () => {
    const div = document.createElement('div');
    div.innerHTML = modalShell('<p>hi</p>');
    const body = div.querySelector('[data-modal-body]');
    expect(classes(body)).toEqual(expect.arrayContaining(['rounded-2xl', 'p-6', 'max-w-md', 'w-full',
      'sheet', 'max-md:rounded-t-3xl', 'max-md:rounded-b-none', 'max-md:overflow-y-auto', 'max-md:max-w-none']));
    expect(body.getAttribute('role')).toBe('dialog');
    expect(body.querySelector('.sheet-handle.md\\:hidden')).not.toBeNull();
    const backdrop = div.querySelector('[data-backdrop]');
    expect(classes(backdrop)).toEqual(expect.arrayContaining(['p-4', 'items-center', 'justify-center',
      'sheet-backdrop', 'max-md:p-0', 'max-md:items-end']));
    expect(backdrop.dataset.action).toBe('close-modal');
  });
});

describe('dealsMeter', () => {
  const render = (html) => { const d = document.createElement('div'); d.innerHTML = html; return d; };
  it('shows X of N deals with N filled-or-empty steps', () => {
    const d = render(dealsMeter(1, 4));
    expect(d.textContent).toMatch(/1 of 4 deals closed/);
    expect(d.textContent).toMatch(/3 to go/);
    const bar = d.querySelector('[role=progressbar]');
    expect(bar.getAttribute('aria-valuenow')).toBe('1');
    expect(bar.getAttribute('aria-valuemax')).toBe('4');
    expect(bar.children.length).toBe(4);
    expect(bar.querySelectorAll('.bg-gold-500').length).toBe(1);
  });
  it('handles empty and complete progress', () => {
    expect(render(dealsMeter(0, 4)).querySelectorAll('.bg-navy-100').length).toBe(4);
    const done = render(dealsMeter(5, 4));
    expect(done.textContent).toMatch(/Graduation goal met/);
    expect(done.querySelector('[role=progressbar]').getAttribute('aria-valuenow')).toBe('4');
    expect(done.querySelectorAll('.bg-emerald-500').length).toBe(4);
  });
});

describe('empty + loading states', () => {
  it('emptyState escapes text and renders an optional CTA', () => {
    const d = document.createElement('div');
    d.innerHTML = emptyState({ title: '<b>x</b>', body: 'y', action: '<button data-action="add-mentee">Add</button>' });
    expect(d.querySelector('b')).toBeNull();
    expect(d.querySelector('[data-action=add-mentee]')).not.toBeNull();
  });
  it('renderDashboardSkeleton fills #app with a busy, motion-safe placeholder', () => {
    document.body.innerHTML = '<div id="app"></div>';
    renderDashboardSkeleton();
    const sk = document.querySelector('#app [data-skeleton]');
    expect(sk.getAttribute('aria-busy')).toBe('true');
    expect(classes(sk)).toContain('motion-safe:animate-pulse');
  });
});

describe('scoreRow', () => {
  it('renders tap-sized score pills with the radio values unchanged', () => {
    const div = document.createElement('div');
    div.innerHTML = scoreRow('Lead Gen', 'leadGenerationActivity');
    expect(div.querySelectorAll('.score-pill.score-pill-tap').length).toBe(5);
    expect([...div.querySelectorAll('input[type=radio]')].map(i => i.value)).toEqual(['1', '2', '3', '4', '5']);
  });
});
