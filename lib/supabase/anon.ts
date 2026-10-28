import { createClient } from '@supabase/supabase-js';
import { supabaseEnv } from '../env';

/** Anonymous client: can ONLY call public.register_student(). It has no table privileges. No session, no cookies. */
export function createAnonClient() {
  const env = supabaseEnv();
  if (!env) return null;
  return createClient(env.url, env.key, { auth: { persistSession: false, autoRefreshToken: false } });
}
