// Public client configuration shared by every page.
//
// The anon key is PUBLIC by design (it ships to every browser); Row Level
// Security is what protects the data. Never put the service_role key here or
// anywhere in this repo.

export const SUPABASE_URL = 'https://delfnadofjhlasxafvri.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRlbGZuYWRvZmpobGFzeGFmdnJpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTU1NjMzMDQsImV4cCI6MjExMTEzOTMwNH0.uMjayCov5J2i9LaRztx0O6TtkNriKaMnIEmgv1gKRPM';

// Production origin used in auth email redirects. On localhost the current
// origin is used so dev sign-in links come back to the dev server.
const PROD_SITE_URL = 'https://mentorship.andresaviles.com';
export const SITE_URL =
  typeof window !== 'undefined' && /^(localhost|127\.0\.0\.1)$/.test(window.location.hostname)
    ? window.location.origin
    : PROD_SITE_URL;

// Program rules. SINGLE client-side source for stage targets and graduation
// requirements (mentor and mentee UIs both read it via src/shared/program.js).
//
// !! These values are NOT yet confirmed by Andres (plan §1.4: 2/4/8/12 stage
// targets vs. 4 closed to graduate). The authoritative copy lives in the
// database table public.program_settings (admin-editable); the apps load it at
// start-up and only fall back to these defaults if it can't be read.
export const PROGRAM = Object.freeze({
  stageCount: 4,
  // closed transactions targeted by the end of each stage
  stageTargets: Object.freeze({ 1: 2, 2: 4, 3: 8, 4: 12 }),
  // closed transactions required to graduate
  graduationClosedRequired: 4,
  // a 1-5 score at or above this counts as "complete/proficient" for VT + Lofty
  graduationScoreThreshold: 4,
});

export const MENTEE_PORTAL_PATH = '/mentee/';
export const MENTOR_APP_PATH = '/';
export const INVITE_FUNCTION = 'invite-mentee';
