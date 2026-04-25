'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Logo, BrandText } from './Logo';

const NAV_ITEMS = [
  { href: '/owner/home',        label: '홈',         icon: IconHome },
  { href: '/owner/ingredients', label: '일반 재료',   icon: IconBox },
  { href: '/owner/prep-items',  label: '준비 재료',   icon: IconFlask },
  { href: '/owner/menus',       label: '메뉴 · 원가', icon: IconChart },
  { href: '/owner/inventory',   label: '재고 · 매입', icon: IconStack },
  { href: '/owner/sales',       label: '판매 입력',   icon: IconReceipt },
  { href: '/owner/loss',        label: '로스 분석',   icon: IconAlertTri },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen md:grid md:grid-cols-[264px_1fr]">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex md:flex-col md:h-screen md:sticky md:top-0 border-r border-border bg-surface p-5 gap-6 overflow-y-auto">
        <Link href="/owner/home" className="flex items-center gap-2.5 py-1 px-2 rounded-[10px] hover:bg-surface-alt transition-colors select-none">
          <Logo size={36} />
          <BrandText className="text-[17px]" />
        </Link>

        <div>
          <div className="text-[10px] font-bold text-ink-3 tracking-[0.08em] uppercase mb-2 px-2">현재 매장</div>
          <div className="flex items-center gap-2.5 p-2.5 rounded-[10px] bg-surface-alt cursor-pointer hover:bg-bgalt transition-colors">
            <div className="w-8 h-8 bg-navy-bg text-navy rounded-lg flex items-center justify-center font-serif font-medium text-[15px] italic flex-shrink-0">갑</div>
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-bold text-ink tracking-tighter truncate">갑부떡볶이</div>
              <div className="text-[11px] text-ink-3">요식업 · 분식</div>
            </div>
          </div>
        </div>

        <div className="flex-1">
          <div className="text-[10px] font-bold text-ink-3 tracking-[0.08em] uppercase mb-2 px-2">메뉴</div>
          <nav className="flex flex-col gap-0.5">
            {NAV_ITEMS.map((item) => {
              const active = pathname === item.href || pathname.startsWith(item.href + '/');
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={[
                    'flex items-center gap-3 py-2.5 px-3 rounded-[10px] text-[13px] font-semibold tracking-tighter transition-colors',
                    active
                      ? 'bg-navy text-white'
                      : 'text-ink-2 hover:bg-surface-alt',
                  ].join(' ')}
                >
                  <item.icon className="w-4 h-4 flex-shrink-0" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>
      </aside>

      {/* Main area */}
      <div className="flex flex-col min-h-screen">
        {/* Mobile header */}
        <header className="md:hidden sticky top-0 z-20 bg-bgapp border-b border-border px-4 pt-3 pb-2">
          <div className="flex items-center gap-2 mb-2.5">
            <Link href="/owner/home" className="flex items-center gap-[7px] flex-shrink-0">
              <Logo size={30} />
              <BrandText className="text-[15px]" />
            </Link>
            <div className="flex-1" />
            <button className="flex items-center gap-[7px] px-2.5 py-1.5 pl-1.5 bg-surface border border-border rounded-full text-[12px] font-bold tracking-tighter text-ink max-w-[140px] overflow-hidden">
              <div className="w-[22px] h-[22px] bg-navy-bg text-navy rounded-[7px] flex items-center justify-center font-serif font-medium text-[12px] italic flex-shrink-0">갑</div>
              <span className="truncate">갑부떡볶이</span>
              <span className="text-[9px] text-ink-3">▼</span>
            </button>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 p-5 md:p-8 pb-24 md:pb-8">
          <div className="max-w-[1280px] mx-auto">{children}</div>
        </main>

        {/* Mobile tabbar */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-surface border-t border-border flex justify-around px-2 py-1 z-20">
          {NAV_ITEMS.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + '/');
            return (
              <Link
                key={item.href}
                href={item.href}
                className={[
                  'flex flex-col items-center gap-0.5 py-2 px-2 flex-1 transition-colors',
                  active ? 'text-navy' : 'text-ink-3',
                ].join(' ')}
              >
                <item.icon className="w-[18px] h-[18px]" />
                <span className="text-[10px] font-bold tracking-tighter">{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}

// ============ Icons ============
function IconHome(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  );
}
function IconBox(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
      <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
      <line x1="12" y1="22.08" x2="12" y2="12" />
    </svg>
  );
}
function IconFlask(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M10 2v7.31" />
      <path d="M14 9.3V1.99" />
      <path d="M8.5 2h7" />
      <path d="M14 9.3a6.5 6.5 0 1 1-4 0" />
    </svg>
  );
}
function IconChart(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M3 3v18h18" />
      <path d="M7 14l4-4 4 4 5-5" />
    </svg>
  );
}
function IconStack(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <polygon points="12 2 2 7 12 12 22 7 12 2" />
      <polyline points="2 17 12 22 22 17" />
      <polyline points="2 12 12 17 22 12" />
    </svg>
  );
}
function IconReceipt(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M4 2v20l3-2 3 2 3-2 3 2 3-2 1 2V2" />
      <line x1="8" y1="8" x2="16" y2="8" />
      <line x1="8" y1="12" x2="16" y2="12" />
      <line x1="8" y1="16" x2="13" y2="16" />
    </svg>
  );
}
function IconAlertTri(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}
