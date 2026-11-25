import { supabase } from './supabase.js';
import { MENTEE_PORTAL_PATH, MENTOR_APP_PATH } from './config.js';

// Role is read from public.profiles (RLS: own row), never from user metadata.
export async function fetchRole(userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('role, full_name, email, phone, booking_url')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw new Error(`Could not load your profile: ${error.message}`);
  return { role: data ? data.role : 'pending', profile: data || null };
}

export function homePathForRole(role) {
  if (role === 'mentee') return MENTEE_PORTAL_PATH;
  if (role === 'mentor' || role === 'admin') return MENTOR_APP_PATH;
  return null;
}

// Only same-origin absolute paths are allowed as post-login redirects.
export function safeNext(next) {
  if (typeof next !== 'string') return null;
  if (!next.startsWith('/') || next.startsWith('//') || next.includes('\\')) return null;
  return next;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw new Error(`Could not sign out: ${error.message}`);
}
