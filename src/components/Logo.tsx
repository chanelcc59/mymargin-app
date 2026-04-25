export function Logo({ size = 36 }: { size?: number }) {
  return (
    <div
      style={{ width: size, height: size }}
      className="flex items-center justify-center rounded-[9px] border-[1.5px] border-navy bg-white p-1 flex-shrink-0"
    >
      <svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" className="w-full h-full block">
        <path
          d="M 14 8 L 50 8 Q 56 8 56 14 L 56 50 Q 56 56 50 56 L 14 56 Q 8 56 8 50 L 8 14 Q 8 8 14 8 Z"
          fill="none" stroke="#1E3A5F" strokeWidth="4.5" strokeLinecap="round"
        />
        <path
          d="M 18 42 L 18 22 L 26 36 L 34 22 L 34 42"
          fill="none" stroke="#1E3A5F" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"
        />
        <rect x="38" y="32" width="3.5" height="12" fill="#2E9B63" rx="1" />
        <rect x="44" y="26" width="3.5" height="18" fill="#2E9B63" rx="1" />
        <rect x="50" y="20" width="3.5" height="24" fill="#2E9B63" rx="1" />
        <path
          d="M 16 50 Q 30 54 44 44 L 52 36"
          fill="none" stroke="#2E9B63" strokeWidth="3" strokeLinecap="round"
        />
        <path
          d="M 48 34 L 53 35 L 52 40"
          fill="none" stroke="#2E9B63" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

export function BrandText({ className = '' }: { className?: string }) {
  return (
    <div className={`font-sans font-extrabold tracking-tightest text-navy ${className}`}>
      마이<span className="text-accent">마진</span>
    </div>
  );
}
