import { supabase } from './supabase.js';
import { homePathForRole, sanitizeNext } from './redirect.js';

export { homePathForRole };

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

// Only same-origin relative paths are allowed as post-login redirects.
export const safeNext = sanitizeNext;

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw new Error(`Could not sign out: ${error.message}`);
}
