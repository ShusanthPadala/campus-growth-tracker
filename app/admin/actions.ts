'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getAdmin } from '@/lib/admin';
import { genCode } from '@/lib/codes';
import { createServerSupabase } from '@/lib/supabase/server';

type State = { ok: boolean; message: string };

export async function signIn(_prev: { error: string } | null, fd: FormData): Promise<{ error: string } | null> {
  const email = String(fd.get('email') ?? '').trim(), password = String(fd.get('password') ?? '');
  if (!email || !password) return { error: 'Enter your email and password.' };
  const supabase = await createServerSupabase();
  if (!supabase) return { error: 'Sign-in isn’t configured on this deployment.' };
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: 'Invalid email or password.' };   // generic on purpose
  redirect('/admin');
}

export async function signOut() {
  const supabase = await createServerSupabase();
  await supabase?.auth.signOut();
  redirect('/admin/login');
}

export async function createAmbassador(_prev: State | null, fd: FormData): Promise<State> {
  const a = await getAdmin();
  if (a.status !== 'ok') return { ok: false, message: 'Not authorised.' };
  const name = String(fd.get('name') ?? '').trim();
  if (name.length < 2 || name.length > 60) return { ok: false, message: 'Enter the ambassador’s name (2–60 characters).' };
  for (let i = 0; i < 8; i++) {
    const code = genCode(name);
    const { error } = await a.supabase.from('ambassadors').insert({ code, name });
    if (!error) { revalidatePath('/admin'); return { ok: true, message: `Created code ${code}` }; }
    if (error.code !== '23505') return { ok: false, message: 'Could not create a code. Please try again.' };   // 23505 = code collision → retry
  }
  return { ok: false, message: 'Could not find a free code. Please try again.' };
}

export async function saveSettings(_prev: State | null, fd: FormData): Promise<State> {
  const a = await getAdmin();
  if (a.status !== 'ok') return { ok: false, message: 'Not authorised.' };
  const raw = String(fd.get('start_date') ?? '').trim();
  if (raw && !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return { ok: false, message: 'Enter a valid start date.' };
  const { error } = await a.supabase.from('campaign_settings').update({ start_date: raw || null, updated_at: new Date().toISOString() }).eq('id', true);
  if (error) return { ok: false, message: 'Could not save settings.' };
  revalidatePath('/admin');
  return { ok: true, message: 'Saved.' };
}
