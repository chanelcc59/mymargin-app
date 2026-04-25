'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { rawIngredientStore, prepItemStore, menuStore, saleStore } from '@/lib/store';
import type { RawIngredient, PrepItem, Menu, SaleEntry } from '@/types/domain';
import { calcTheoreticalConsumption, formatKRW } from '@/lib/cost-engine';
import { SearchBox, CategoryChips } from '@/components/Filters';

const CATEGORY_ORDER = ['기본', '튀김', '김밥', '스페셜', '사이드', '음료', '세트', '미분류'];

function todayLocal(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function shiftDay(date: string, delta: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(y, m - 1, d + delta);
  return todayLocalFromDate(dt);
}

function todayLocalFromDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatStock(qty: number, unit: string): string {
  if (qty === 0) return `0${unit}`;
  if (Math.abs(qty) < 1) return `${qty.toFixed(2)}${unit}`;
  return `${Math.round(qty).toLocaleString('ko-KR')}${unit}`;
}

export default function SalesPage() {
  const [raws, setRaws] = useState<RawIngredient[]>([]);
  const [preps, setPreps] = useState<PrepItem[]>([]);
  const [menus, setMenus] = useState<Menu[]>([]);
  const [sales, setSales] = useState<SaleEntry[]>([]);
  const [loaded, setLoaded] = useState(false);

  const [date, setDate] = useState<string>(todayLocal());
  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [hideZero, setHideZero] = useState(false);

  // 입력 중인 수량 (저장 전 임시)
  const [draftQty, setDraftQty] = useState<Record<string, string>>({});

  const reload = () => {
    setRaws(rawIngredientStore.list());
    setPreps(prepItemStore.list());
    setMenus(menuStore.list());
    setSales(saleStore.list());
  };

  useEffect(() => {
    reload();
    setLoaded(true);
    const onFocus = () => reload();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);

  // 그날의 저장된 판매 데이터 (메뉴 ID -> qty)
  const savedQtyByMenu = useMemo(() => {
    const m = new Map<string, number>();
    sales.filter((s) => s.date === date).forEach((s) => {
      m.set(s.menuId, (m.get(s.menuId) ?? 0) + s.qty);
    });
    return m;
  }, [sales, date]);

  // draft가 입력되어 있으면 draft, 아니면 저장값을 표시
  const getCurrentQty = (menuId: string): string => {
    if (draftQty[menuId] !== undefined) return draftQty[menuId];
    const saved = savedQtyByMenu.get(menuId);
    return saved && saved > 0 ? String(saved) : '';
  };

  // 날짜 바뀌면 draft 초기화
  useEffect(() => { setDraftQty({}); }, [date]);

  const categories = useMemo(() => {
    const counts: Record<string, number> = {};
    menus.forEach((m) => {
      const c = m.category || '미분류';
      counts[c] = (counts[c] || 0) + 1;
    });
    return Object.keys(counts)
      .sort((a, b) => {
        const ai = CATEGORY_ORDER.indexOf(a);
        const bi = CATEGORY_ORDER.indexOf(b);
        if (ai === -1 && bi === -1) return a.localeCompare(b, 'ko');
        if (ai === -1) return 1;
        if (bi === -1) return -1;
        return ai - bi;
      })
      .map((c) => ({ name: c, count: counts[c] }));
  }, [menus]);

  const filteredMenus = useMemo(() => {
    const q = query.trim().toLowerCase();
    return menus.filter((m) => {
      if (activeCategory !== 'all') {
        const cat = m.category || '미분류';
        if (cat !== activeCategory) return false;
      }
      if (hideZero) {
        const qty = Number(getCurrentQty(m.id)) || 0;
        if (qty <= 0) return false;
      }
      if (q && !m.name.toLowerCase().includes(q)) return false;
      return true;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menus, query, activeCategory, hideZero, draftQty, savedQtyByMenu]);

  // 입력된 수량 합계 + 합산 매출 (그날의 채널별 평균가 가정 — dine_in 가격 기준 단순 계산)
  const totalQty = useMemo(
    () => filteredMenus.reduce((sum, m) => sum + (Number(getCurrentQty(m.id)) || 0), 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filteredMenus, draftQty, savedQtyByMenu]
  );

  // 그날의 이론 소모량 (저장된 sales만 기준 — draft는 미저장이므로 제외)
  const theoreticalDay = useMemo(
    () => calcTheoreticalConsumption(sales, menus, preps, { from: date, to: date }),
    [sales, menus, preps, date]
  );

  const consumedRaws = useMemo(() => {
    const arr: Array<{ raw: RawIngredient; qty: number }> = [];
    theoreticalDay.forEach((qty, rawId) => {
      const raw = raws.find((r) => r.id === rawId);
      if (raw) arr.push({ raw, qty });
    });
    arr.sort((a, b) => b.qty - a.qty);
    return arr;
  }, [theoreticalDay, raws]);

  const dirty = Object.keys(draftQty).length > 0;

  const saveAll = () => {
    const entries = Object.entries(draftQty);
    for (const [menuId, qtyStr] of entries) {
      const qty = Number(qtyStr) || 0;
      if (qty > 0) {
        saleStore.upsertDayMenu({ date, menuId, qty });
      } else {
        // 0 또는 빈값은 삭제
        const existing = sales.find((s) => s.date === date && s.menuId === menuId);
        if (existing) saleStore.delete(existing.id);
      }
    }
    setDraftQty({});
    reload();
  };

  const cancelDraft = () => setDraftQty({});

  if (!loaded) return <div className="text-ink-3 text-sm">로딩 중...</div>;

  if (menus.length === 0) {
    return (
      <div className="bg-surface border border-dashed border-border-strong rounded-xl p-12 text-center">
        <div className="font-serif text-[20px] italic tracking-tighter text-ink mb-1">먼저 메뉴부터 등록해주세요</div>
        <div className="text-[13px] text-ink-3 mb-4">판매 입력은 등록된 메뉴를 기준으로 합니다.</div>
        <Link
          href="/owner/menus"
          className="inline-block px-4 py-2 bg-navy text-white text-[13px] font-bold rounded-lg hover:bg-navy-dark"
        >메뉴 등록하러 가기 →</Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-serif text-[28px] md:text-[32px] font-medium tracking-tightest text-ink leading-tight">판매 입력</h1>
          <p className="text-ink-3 text-[13px] mt-1">일자별로 메뉴별 판매 수량을 기록하세요. 이론 소모량이 자동 계산됩니다.</p>
        </div>
      </div>

      {/* 날짜 선택 */}
      <div className="bg-surface border border-border rounded-2xl p-4 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setDate(shiftDay(date, -1))}
            className="px-2.5 py-1.5 border border-border-strong rounded-lg text-[14px] font-bold text-ink-2 hover:border-navy hover:text-navy"
            aria-label="전날"
          >‹</button>
          <input
            type="date"
            value={date}
            onChange={(e) => e.target.value && setDate(e.target.value)}
            className="px-3 py-1.5 border border-border-strong rounded-lg text-[14px] font-bold text-ink outline-none focus:border-accent font-serif-num"
          />
          <button
            onClick={() => setDate(shiftDay(date, 1))}
            className="px-2.5 py-1.5 border border-border-strong rounded-lg text-[14px] font-bold text-ink-2 hover:border-navy hover:text-navy"
            aria-label="다음날"
          >›</button>
          {date !== todayLocal() && (
            <button
              onClick={() => setDate(todayLocal())}
              className="text-[12px] text-accent font-bold hover:underline ml-1"
            >오늘로</button>
          )}
        </div>
        <div className="flex items-center gap-3 text-[12px] text-ink-3">
          <span>입력된 메뉴 <span className="font-serif-num font-bold text-ink-2">{savedQtyByMenu.size}</span>종</span>
          <span>·</span>
          <span>합계 <span className="font-serif-num font-bold text-ink-2">{Math.round(totalQty).toLocaleString('ko-KR')}</span>건</span>
        </div>
      </div>

      {/* 검색·필터 */}
      <div className="flex flex-col gap-3">
        <SearchBox
          value={query}
          onChange={setQuery}
          placeholder="메뉴명 검색"
          count={filteredMenus.length}
          total={menus.length}
        />
        {categories.length > 1 && (
          <CategoryChips
            items={[
              { value: 'all', label: '전체', count: menus.length },
              ...categories.map((c) => ({ value: c.name, label: c.name, count: c.count })),
            ]}
            active={activeCategory}
            onChange={setActiveCategory}
          />
        )}
        <label className="self-start flex items-center gap-2 text-[12px] font-bold text-ink-3 cursor-pointer">
          <input
            type="checkbox"
            checked={hideZero}
            onChange={(e) => setHideZero(e.target.checked)}
            className="w-4 h-4 accent-navy"
          />
          0건 메뉴 숨기기
        </label>
      </div>

      {/* 메뉴 입력 테이블 */}
      <div className="bg-surface border border-border rounded-xl overflow-hidden">
        <div className="hidden md:grid md:grid-cols-[1.6fr_90px_140px_30px] px-4 py-2.5 bg-surface-alt text-[11px] font-bold text-ink-3 tracking-[0.04em] uppercase border-b border-border">
          <div>메뉴</div>
          <div>분류</div>
          <div className="text-right">판매 수량</div>
          <div />
        </div>
        {filteredMenus.length === 0 ? (
          <div className="px-6 py-10 text-center text-[13px] text-ink-3">조건에 맞는 메뉴가 없어요</div>
        ) : (
          filteredMenus.map((m) => {
            const value = getCurrentQty(m.id);
            const isDraft = draftQty[m.id] !== undefined;
            const savedQty = savedQtyByMenu.get(m.id) ?? 0;
            const numValue = Number(value) || 0;
            return (
              <div
                key={m.id}
                className="md:grid md:grid-cols-[1.6fr_90px_140px_30px] flex flex-col md:items-center px-4 py-2.5 border-b border-border last:border-b-0 gap-2 md:gap-0 hover:bg-surface-alt/40"
              >
                <div className="font-semibold text-ink tracking-tighter text-[14px]">
                  {m.name}
                </div>
                <div className="text-[11px] text-ink-2">
                  {m.category ? (
                    <span className="px-1.5 py-0.5 bg-surface-alt rounded-md text-[10px] font-semibold">{m.category}</span>
                  ) : (
                    <span className="text-ink-4 text-[10px]">미분류</span>
                  )}
                </div>
                <div className="flex items-center md:justify-end gap-1.5">
                  <button
                    onClick={() => setDraftQty((d) => ({ ...d, [m.id]: String(Math.max(0, numValue - 1)) }))}
                    className="w-7 h-7 flex items-center justify-center border border-border-strong rounded-md text-[16px] text-ink-2 hover:border-navy hover:text-navy font-bold leading-none"
                    aria-label="-1"
                  >−</button>
                  <input
                    type="number"
                    inputMode="numeric"
                    min="0"
                    step="1"
                    value={value}
                    onChange={(e) => setDraftQty((d) => ({ ...d, [m.id]: e.target.value }))}
                    placeholder="0"
                    className={[
                      'w-16 px-2 py-1.5 border rounded-md text-[14px] text-right outline-none font-serif-num',
                      isDraft ? 'border-accent bg-accent-bg/40' : 'border-border-strong focus:border-accent',
                    ].join(' ')}
                  />
                  <button
                    onClick={() => setDraftQty((d) => ({ ...d, [m.id]: String(numValue + 1) }))}
                    className="w-7 h-7 flex items-center justify-center border border-border-strong rounded-md text-[14px] text-ink-2 hover:border-navy hover:text-navy font-bold leading-none"
                    aria-label="+1"
                  >＋</button>
                </div>
                <div className="text-right">
                  {isDraft && savedQty !== numValue && (
                    <span className="text-[10px] text-ink-3 font-serif-num" title="저장된 값">
                      ({savedQty})
                    </span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* 저장 버튼 (입력 변경시에만 활성) */}
      {dirty && (
        <div className="sticky bottom-0 md:bottom-auto md:relative bg-surface border border-accent/40 rounded-2xl p-3 flex items-center justify-between gap-3 shadow-lg z-10">
          <div className="text-[12px] text-ink-3">
            <span className="font-bold text-accent">{Object.keys(draftQty).length}개 메뉴</span> 변경됨
          </div>
          <div className="flex gap-2">
            <button
              onClick={cancelDraft}
              className="px-4 py-2 text-[13px] font-bold text-ink-3 hover:text-ink"
            >취소</button>
            <button
              onClick={saveAll}
              className="px-5 py-2 bg-accent text-white text-[13px] font-bold rounded-lg hover:bg-accent-dark"
            >저장</button>
          </div>
        </div>
      )}

      {/* 그날의 이론 소모량 (저장된 데이터 기준) */}
      <div className="bg-surface border border-border rounded-2xl p-5">
        <div className="flex items-baseline justify-between mb-3">
          <div className="text-[15px] font-bold tracking-tighter text-ink">{date} 이론 소모량</div>
          <div className="text-[11px] text-ink-3">저장된 판매 데이터 × 레시피 기반</div>
        </div>
        {consumedRaws.length === 0 ? (
          <div className="text-center py-6 text-[12px] text-ink-3">
            아직 저장된 판매가 없어요. 위에서 수량을 입력하고 저장하세요.
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {consumedRaws.map(({ raw, qty }) => (
              <div key={raw.id} className="bg-surface-alt/40 rounded-lg px-3 py-2">
                <div className="text-[12px] font-semibold text-ink tracking-tighter truncate">{raw.name}</div>
                <div className="text-[14px] font-serif-num text-ink-2 mt-0.5">{formatStock(qty, raw.baseUnit)}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
