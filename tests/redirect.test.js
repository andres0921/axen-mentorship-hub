import { describe, it, expect } from 'vitest';
import { sanitizeNext, destinationFor, homePathForRole, CONFIRM_TYPES } from '../src/shared/redirect.js';

describe('sanitizeNext (confirm page `next`)', () => {
  it.each([
    ['/mentee/', '/mentee/'],
    ['/', '/'],
    ['/mentee/#feedback', '/mentee/#feedback'],
    ['/?x=1', '/?x=1'],
    ['/mentee/../', '/'],
  ])('allows relative path %s', (input, out) => {
    expect(sanitizeNext(input)).toBe(out);
  });

  it.each([
    null, undefined, '', 'mentee', 'https://evil.com', 'http://evil.com/mentee/',
    '//evil.com', '//evil.com/mentee/', '/\\evil.com', '\\\\evil.com', '/\t/evil.com',
    '/\n/evil.com', ' /mentee/', 'javascript:alert(1)', '/auth/confirm', '/auth/confirm/?token_hash=x',
    '/' + 'a'.repeat(600), 42, {},
  ])('rejects %j', (input) => {
    expect(sanitizeNext(input)).toBeNull();
  });
});

describe('destinationFor(role, next)', () => {
  it('sends each role home by default', () => {
    expect(destinationFor('mentee', null)).toBe('/mentee/');
    expect(destinationFor('mentor', null)).toBe('/');
    expect(destinationFor('admin', undefined)).toBe('/');
  });
  it('pending / unknown roles get no destination', () => {
    expect(destinationFor('pending', '/mentee/')).toBeNull();
    expect(destinationFor(undefined, '/')).toBeNull();
    expect(homePathForRole('pending')).toBeNull();
  });
  it('honours next only inside the role\'s own app', () => {
    expect(destinationFor('mentee', '/mentee/#help')).toBe('/mentee/#help');
    expect(destinationFor('mentee', '/')).toBe('/mentee/');
    expect(destinationFor('mentor', '/mentee/')).toBe('/');
    expect(destinationFor('mentor', '/#mentees')).toBe('/#mentees');
  });
  it('never redirects off-site', () => {
    expect(destinationFor('mentee', '//evil.com')).toBe('/mentee/');
    expect(destinationFor('admin', 'https://evil.com')).toBe('/');
  });
  it('confirm types exclude recovery', () => {
    expect(CONFIRM_TYPES).toContain('invite');
    expect(CONFIRM_TYPES).toContain('magiclink');
    expect(CONFIRM_TYPES).not.toContain('recovery');
  });
});
