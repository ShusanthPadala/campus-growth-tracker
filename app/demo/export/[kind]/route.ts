import { NextResponse } from 'next/server';
import { buildCsv, csvFilename } from '@/lib/csv';
import { buildDemo } from '@/lib/demo';

export const dynamic = 'force-dynamic';

/** Public demo CSV — fictional data only. */
export async function GET(_req: Request, ctx: { params: Promise<{ kind: string }> }) {
  if (process.env.ENABLE_PUBLIC_DEMO === 'false') return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const { kind } = await ctx.params;
  if (kind !== 'registrations' && kind !== 'summary') return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const ds = buildDemo();
  return new NextResponse(buildCsv(ds, kind), {
    headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${csvFilename(ds, kind)}"` },
  });
}
