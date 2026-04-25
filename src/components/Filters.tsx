'use client';

// 검색 / 필터 공용 컴포넌트

export function SearchBox({
  value, onChange, placeholder, count, total,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  count: number;
  total: number;
}) {
  return (
    <div className="relative">
      <svg
        className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-4 pointer-events-none"
        width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"
      >
        <circle cx="11" cy="11" r="8" />
        <path d="m21 21-4.3-4.3" />
      </svg>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full pl-10 pr-20 py-2.5 bg-surface border border-border-strong rounded-xl text-[14px] text-ink outline-none focus:border-accent transition-colors placeholder:text-ink-4"
      />
      {value && (
        <button
          onClick={() => onChange('')}
          className="absolute right-12 top-1/2 -translate-y-1/2 text-ink-4 hover:text-ink text-[16px] font-bold leading-none w-5 h-5 flex items-center justify-center"
          aria-label="검색어 지우기"
        >×</button>
      )}
      <div className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-bold text-ink-3 font-serif-num">
        {value || total !== count ? `${count}/${total}` : `${total}`}
      </div>
    </div>
  );
}

export function CategoryChips({
  items, active, onChange,
}: {
  items: Array<{ value: string; label: string; count: number }>;
  active: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((it) => {
        const isActive = active === it.value;
        return (
          <button
            key={it.value}
            onClick={() => onChange(it.value)}
            className={[
              'px-3 py-1.5 rounded-full text-[12px] font-bold tracking-tighter transition-colors flex items-center gap-1.5',
              isActive
                ? 'bg-navy text-white border border-navy'
                : 'bg-surface text-ink-2 border border-border hover:border-border-strong',
            ].join(' ')}
          >
            {it.label}
            <span className={[
              'text-[10px] font-bold px-1.5 py-0 rounded-md tabular-nums',
              isActive ? 'bg-white/20 text-white/90' : 'bg-surface-alt text-ink-3',
            ].join(' ')}>{it.count}</span>
          </button>
        );
      })}
    </div>
  );
}
