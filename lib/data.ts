import type { SupabaseClient } from '@supabase/supabase-js';
import { addDays, istDay } from './dates';
import type { Ambassador, Dataset, Reg } from './metrics';

const PAGE = 1000; // PostgREST returns at most 1000 rows per request, so page through.

async function fetchAll<T>(run: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await run(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

type RegRow = { id: string; name: string; email: string; college: string; grad_year: number; source: string; ref_code: string | null; created_at: string; reg_day: string };

/** Real, persisted data only. Must be called with the admin's session client (RLS enforces admin-only access). */
export async function fetchLiveDataset(supabase: SupabaseClient): Promise<Dataset> {
  const [rows, ambs, settings] = await Promise.all([
    fetchAll<RegRow>((a, b) => supabase.from('registrations')
      .select('id,name,email,college,grad_year,source,ref_code,created_at,reg_day').order('created_at', { ascending: true }).order('id').range(a, b)),
    fetchAll<{ code: string; name: string; active: boolean }>((a, b) => supabase.from('ambassadors').select('code,name,active').order('created_at', { ascending: true }).order('id').range(a, b)),
    supabase.from('campaign_settings').select('start_date').eq('id', true).maybeSingle(),
  ]);
  if (settings.error) throw new Error(settings.error.message);
  const regs: Reg[] = rows.map((r) => ({
    id: r.id, name: r.name, email: r.email, college: r.college, year: String(r.grad_year), source: r.source,
    refCode: r.ref_code ?? '', createdAt: r.created_at, day: r.reg_day,
  }));
  const ambassadors: Ambassador[] = ambs.map((a) => ({ code: a.code, name: a.name, active: a.active }));
  const start = settings.data?.start_date as string | null | undefined;
  const unset = !start;
  return { label: 'LIVE', regs, ambassadors, startDate: start ?? addDays(istDay(new Date()), -6), startUnset: unset };
}
