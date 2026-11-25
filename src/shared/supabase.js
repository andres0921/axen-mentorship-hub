import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

// One client per page. Sessions persist in localStorage (same origin for
// /, /mentee/ and /auth/confirm), so signing in on one page signs in on all.
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});
