import { NextResponse } from 'next/server';
import { getAdmin } from '@/lib/admin';
import { buildCsv, csvFilename } from '@/lib/csv';
import { fetchLiveDataset } from '@/lib/data';
import { buildDemo } from '@/lib/demo';

export const dynamic = 'force-dynamic';

export async function GET(req: Request, ctx: { params: Promise<{ kind: string }> }) {
  const { kind } = await ctx.params;
  if (kind !== 'registrations' && kind !== 'summary') return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const a = await getAdmin();
  if (a.status === 'not_configured') return NextResponse.json({ error: 'not_configured' }, { status: 503 });
  if (a.status === 'anon') return NextResponse.json({ error: 'unauthorised' }, { status: 401 });
  if (a.status === 'forbidden') return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const mode = new URL(req.url).searchParams.get('mode') === 'demo' ? 'demo' : 'live';
  let ds;
  try { ds = mode === 'demo' ? buildDemo() : await fetchLiveDataset(a.supabase); }
  catch { return NextResponse.json({ error: 'server' }, { status: 500 }); }
  return new NextResponse(buildCsv(ds, kind), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${csvFilename(ds, kind)}"`,
      'Cache-Control': 'no-store',
    },
  });
}
