'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const crumbFor = (p: string) => (p.startsWith('/admin') ? 'Admin · Campaign dashboard' : p.startsWith('/demo') ? 'Demo · Campaign dashboard' : 'Student registration');

export function Shell({ children, showDemo }: { children: React.ReactNode; showDemo: boolean }) {
  const path = usePathname() || '/';
  const cur = (active: boolean) => (active ? ('page' as const) : undefined);
  return (
    <div className="shell">
      <aside className="side">
        <div className="brand">
          <span className="logo" aria-hidden="true">CG</span>
          <span className="brand-txt">Campus Growth Tracker<small>Simulated workshop campaign · not an official NxtWave page</small></span>
        </div>
        <nav aria-label="Main">
          <Link href="/" aria-current={cur(path === '/')} id="navReg">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M19 8v6M22 11h-6" /></svg>Register
          </Link>
          {showDemo && (
            <Link href="/demo" aria-current={cur(path.startsWith('/demo'))} id="navDemo">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 3v18h18" /><path d="M7 15v-4M12 15V8M17 15v-7" /></svg>Demo dashboard
            </Link>
          )}
          <Link href="/admin" aria-current={cur(path.startsWith('/admin'))} id="navAdm">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="11" width="18" height="10" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>Admin
          </Link>
        </nav>
      </aside>
      <div className="main">
        <header className="top"><span className="crumb">{crumbFor(path)}</span><span className="chip">Target: 500 registrations in 7 days</span></header>
        <main id="app">{children}</main>
      </div>
    </div>
  );
}
