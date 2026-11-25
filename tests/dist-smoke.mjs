// Post-build smoke test for dist/ (run after `npm run build`).
// Checks: entry pages exist, every local script/stylesheet/image they reference
// exists, no inline <script> blocks or inline on* handlers / javascript: URLs,
// no server secrets anywhere in the output, and the vercel.json CSP is present.
// Never prints file contents (the public anon key ships in the JS bundle).
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const failures = [];
const fail = (msg) => failures.push(msg);

if (!existsSync(dist)) {
  console.error('dist/ not found. Run `npm run build` first.');
  process.exit(1);
}

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}
const files = walk(dist);

// 1. entry pages
const PAGES = ['index.html', 'mentee/index.html', 'auth/confirm/index.html'];
for (const page of PAGES) {
  if (!existsSync(join(dist, page))) fail(`missing dist/${page}`);
}

// 2. per-page checks
const attrRe = /<(script|link|img)\b([^>]*)>/gi;
for (const page of PAGES) {
  const file = join(dist, page);
  if (!existsSync(file)) continue;
  const html = readFileSync(file, 'utf8');

  // inline scripts: any <script> without src, or with a body
  for (const mt of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (!/\bsrc\s*=/.test(mt[1])) fail(`${page}: inline <script> block`);
    else if (mt[2].trim()) fail(`${page}: <script src> with an inline body`);
  }
  // inline event handlers / javascript: URLs
  if (/<[^>]+\son[a-z]+\s*=/i.test(html)) fail(`${page}: inline on* event handler attribute`);
  if (/(href|src|action)\s*=\s*["']?\s*javascript:/i.test(html)) fail(`${page}: javascript: URL`);
  // every local script/css/img must exist
  let scripts = 0;
  for (const mt of html.matchAll(attrRe)) {
    const tag = mt[1].toLowerCase();
    const attrs = mt[2];
    const ref = (attrs.match(tag === 'link' ? /\bhref\s*=\s*["']([^"']+)["']/i : /\bsrc\s*=\s*["']([^"']+)["']/i) || [])[1];
    if (!ref) continue;
    if (tag === 'link' && !/\brel\s*=\s*["'](stylesheet|icon|modulepreload|preload)["']/i.test(attrs)) continue;
    if (/^(https?:)?\/\//i.test(ref) || ref.startsWith('data:')) {
      if (tag === 'script') fail(`${page}: third-party script ${ref}`);
      continue;
    }
    if (tag === 'script') scripts++;
    const clean = ref.split(/[?#]/)[0];
    const target = clean.startsWith('/') ? join(dist, clean) : join(dist, dirname(page), clean);
    if (!existsSync(target)) fail(`${page}: referenced file missing: ${ref}`);
  }
  if (scripts === 0) fail(`${page}: no local module script found`);
  if (/\/src\//.test(html)) fail(`${page}: still references /src/ (unbuilt)`);
}

// 3. secrets / legacy leftovers in ANY output file
for (const file of files) {
  const rel = relative(dist, file);
  const buf = readFileSync(file);
  const text = buf.toString('latin1');
  if (/service_role/i.test(text)) fail(`${rel}: contains "service_role"`);
  // supabase-js itself contains the bare literal `sb_secret_` (a key-prefix
  // check), so flag the prefix only when a key body follows it.
  if (/sb_secret_[A-Za-z0-9_-]{8,}/.test(text)) fail(`${rel}: contains an sb_secret_ key`);
  const bare = (text.match(/sb_secret_/g) || []).length;
  const libraryPrefixChecks = (text.match(/[`'"]sb_secret_[`'"]/g) || []).length;
  if (bare !== libraryPrefixChecks) fail(`${rel}: unexpected "sb_secret_" occurrence`);
  if (/SUPABASE_SERVICE_ROLE_KEY/.test(text)) fail(`${rel}: contains SUPABASE_SERVICE_ROLE_KEY`);
  // a JWT whose payload says role=service_role
  for (const jwt of text.matchAll(/eyJ[A-Za-z0-9_-]{10,}\.(eyJ[A-Za-z0-9_-]{10,})\.[A-Za-z0-9_-]{10,}/g)) {
    try {
      const payload = JSON.parse(Buffer.from(jwt[1], 'base64url').toString('utf8'));
      if (payload.role && payload.role !== 'anon') fail(`${rel}: contains a JWT with role "${payload.role}"`);
    } catch { /* not a JWT */ }
  }
  if (/cdn\.tailwindcss\.com|cdn\.jsdelivr\.net/.test(text)) fail(`${rel}: references a runtime CDN`);
}
if (existsSync(join(dist, 'js/app.js'))) fail('legacy js/app.js shipped in dist');

// 4. vercel.json headers
try {
  const vercel = JSON.parse(readFileSync(join(root, 'vercel.json'), 'utf8'));
  const headers = (vercel.headers || []).flatMap((h) => h.headers || []);
  const get = (k) => (headers.find((h) => h.key.toLowerCase() === k.toLowerCase()) || {}).value || '';
  const csp = get('Content-Security-Policy');
  if (!/script-src 'self'(;|$)/.test(csp)) fail("vercel.json: CSP script-src must be exactly 'self'");
  if (!/frame-ancestors 'none'/.test(csp)) fail('vercel.json: CSP missing frame-ancestors');
  if (get('X-Frame-Options') !== 'DENY') fail('vercel.json: X-Frame-Options must be DENY');
  if (get('X-Content-Type-Options') !== 'nosniff') fail('vercel.json: X-Content-Type-Options must be nosniff');
  if (vercel.outputDirectory !== 'dist') fail('vercel.json: outputDirectory must be dist');
} catch (err) {
  fail(`vercel.json unreadable: ${err.message}`);
}

if (failures.length) {
  console.error(`dist smoke test FAILED (${failures.length}):`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`dist smoke test passed: ${PAGES.length} pages, ${files.length} files checked.`);
