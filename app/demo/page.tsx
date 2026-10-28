import { notFound } from 'next/navigation';
import { Dashboard, ModeBanner, ModePill } from '@/components/Dashboard';
import { buildDemo } from '@/lib/demo';

export const dynamic = 'force-dynamic';

/** Public, read-only showcase. Contains ONLY fictional generated data — it never queries the database. */
export default function DemoPage() {
  if (process.env.ENABLE_PUBLIC_DEMO === 'false') notFound();
  const ds = buildDemo();
  return (
    <div className="wrap">
      <div className="adm-head"><div><p className="eyebrow">Campaign dashboard preview</p><h1>Campaign dashboard <ModePill label="DEMO" /></h1></div></div>
      <ModeBanner label="DEMO" />
      <Dashboard ds={ds} exportBase="/demo/export" />
    </div>
  );
}
