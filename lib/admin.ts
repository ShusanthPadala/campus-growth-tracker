import type { SupabaseClient, User } from '@supabase/supabase-js';
import { createServerSupabase } from './supabase/server';

export type AdminResult =
  | { status: 'not_configured' }
  | { status: 'anon' }
  | { status: 'forbidden'; user: User }
  | { status: 'ok'; supabase: SupabaseClient; user: User };

/** Server-side authorisation. getUser() validates the JWT with Supabase Auth (it does not trust the cookie),
 *  then is_admin() checks the allow-list table. Used by every admin page, action and export route. */
export async function getAdmin(): Promise<AdminResult> {
  const supabase = await createServerSupabase();
  if (!supabase) return { status: 'not_configured' };
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return { status: 'anon' };
  const { data: isAdmin, error: rpcErr } = await supabase.rpc('is_admin');
  if (rpcErr || isAdmin !== true) return { status: 'forbidden', user: data.user };
  return { status: 'ok', supabase, user: data.user };
}
