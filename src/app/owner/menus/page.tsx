'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { rawIngredientStore, prepItemStore, menuStore } from '@/lib/store';
import type { Menu, RawIngredient, PrepItem, ChannelKey } from '@/types/domain';
import {
  calcMenuCost, calcAllChannelMargins, formatKRW, formatRate, judgeMargin,
} from '@/lib/cost-engine';
import { SearchBox, CategoryChips } from '@/components/Filters';

const CHANNEL_LABELS: Record<ChannelKey, string> = {
  dine_in: '매장',
  takeout: '포장',
  delivery: '배달',
};

const CATEGORY_ORDER = ['기본', '튀김', '김밥', '스페셜', '사이드', '음료', '세트', '미분류'];

export default function MenusPage() {
  const router = useRouter();
  const [menus, setMenus] = useState<Menu[]>([]);
  const [raws, setRaws] = useState<RawIngredient[]>([]);
  const [preps, setPreps] = useState<PrepItem[]>([]);
  const [loaded, setLoaded] = useState(false);

  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('all');

  const reload = () => {
    setMenus(menuStore.list());
    setRaws(rawIngredientStore.list());
    setPreps(prepItemStore.list());
  };

  useEffect(() => {
    reload();
    setLoaded(true);
    const onFocus = () => reload();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);

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

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return menus.filter((m) => {
      if (activeCategory !== 'all') {
        const cat = m.category || '미분류';
        if (cat !== activeCategory) return false;
      }
      if (q) {
        const hay = (m.name + ' ' + (m.category || '')).toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [menus, query, activeCategory]);

  const handleAdd = () => {
    const name = prompt('새 메뉴 이름');
    if (!name || !name.trim()) return;
    const created = menuStore.create({
      name: name.trim(),
      recipe: [],
      channels: [
        { channel: 'dine_in', isActive: true, salePrice: 0 },
        { channel: 'takeout', isActive: false, salePrice: 0 },
        { channel: 'delivery', isActive: false, salePrice: 0 },
      ],
    });
    router.push(`/owner/menus/${created.id}`);
  };

  if (!loaded) return <div className="text-ink-3 text-sm">로딩 중...</div>;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-serif text-[28px] md:text-[32px] font-medium tracking-tightest text-ink leading-tight">메뉴</h1>
          <p className="text-ink-3 text-[13px] mt-1">메뉴를 클릭하면 레시피와 채널별 마진을 편집할 수 있어요.</p>
        </div>
        <button
          onClick={handleAdd}
          className="px-4 py-2 bg-navy text-white text-[13px] font-bold rounded-lg hover:bg-navy-dark transition-colors"
        >
          ＋ 메뉴 추가
        </button>
      </div>

      {menus.length === 0 ? (
        <div className="bg-surface border border-dashed border-border-strong rounded-xl p-12 text-center">
          <div className="font-serif text-[20px] italic tracking-tighter text-ink mb-1">아직 등록된 메뉴가 없어요</div>
          <div className="text-[13px] text-ink-3">오른쪽 위 <strong>＋ 메뉴 추가</strong> 버튼으로 첫 메뉴를 등록해보세요.</div>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-3">
            <SearchBox
              value={query}
              onChange={setQuery}
              placeholder="메뉴명으로 검색"
              count={filtered.length}
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
          </div>

          {filtered.length === 0 ? (
            <div className="bg-surface border border-dashed border-border-strong rounded-xl p-8 text-center text-[13px] text-ink-3">
              조건에 맞는 메뉴가 없어요
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {filtered.map((m) => (
                <MenuCard key={m.id} menu={m} raws={raws} preps={preps} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function MenuCard({ menu, raws, preps }: { menu: Menu; raws: RawIngredient[]; preps: PrepItem[] }) {
  const cost = calcMenuCost(menu, raws, preps);
  const margins = calcAllChannelMargins(menu, raws, preps);
  const recipeEmpty = menu.recipe.length === 0;

  return (
    <Link
      href={`/owner/menus/${menu.id}`}
      className="bg-surface border border-border rounded-2xl p-4 hover:border-navy/40 hover:shadow-sm transition-all flex flex-col gap-3"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[16px] font-bold tracking-tighter text-ink truncate">{menu.name}</div>
          {menu.category && (
            <div className="text-[10px] text-ink-3 font-bold tracking-[0.04em] uppercase mt-0.5">{menu.category}</div>
          )}
        </div>
        <div className="text-right flex-shrink-0">
          <div className="text-[10px] text-ink-3 font-bold tracking-[0.04em] uppercase">원가</div>
          <div className="font-serif-num text-[18px] text-ink leading-none mt-0.5">
            {recipeEmpty ? (
              <span className="text-ink-4 text-[13px]">—</span>
            ) : (
              <>
                {formatKRW(cost.foodCost)}
                <span className="text-[10px] ml-0.5 text-ink-3 font-sans">원</span>
              </>
            )}
          </div>
        </div>
      </div>

      {recipeEmpty ? (
        <div className="text-[11px] text-warning font-semibold border-t border-border pt-2">
          ⚠ 레시피가 비어있어요 — 클릭해서 재료를 추가하세요
        </div>
      ) : margins.length === 0 ? (
        <div className="text-[11px] text-ink-3 border-t border-border pt-2">
          활성 채널이 없어요
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-1.5 border-t border-border pt-2.5">
          {(['dine_in', 'takeout', 'delivery'] as const).map((ch) => {
            const m = margins.find((x) => x.channel === ch);
            if (!m) {
              return (
                <div key={ch} className="text-center py-1.5 px-1 rounded-md bg-surface-alt/60 opacity-50">
                  <div className="text-[10px] text-ink-4 font-bold">{CHANNEL_LABELS[ch]}</div>
                  <div className="text-[11px] text-ink-4 mt-0.5">꺼짐</div>
                </div>
              );
            }
            const tier = judgeMargin(m.contributionMarginRate);
            const tierBg =
              tier === 'good' ? 'bg-accent-bg text-accent' :
              tier === 'mid'  ? 'bg-warning-bg text-warning' :
                                'bg-alert-bg text-alert';
            return (
              <div key={ch} className="text-center py-1.5 px-1 rounded-md bg-surface-alt/40">
                <div className="text-[10px] text-ink-3 font-bold">{CHANNEL_LABELS[ch]}</div>
                <div className="font-serif-num text-[12px] text-ink-2 mt-0.5">
                  {formatKRW(m.salePrice)}<span className="text-[9px] text-ink-4 font-sans">원</span>
                </div>
                <div className={['inline-block mt-1 px-1.5 py-0.5 rounded text-[10px] font-bold font-serif-num', tierBg].join(' ')}>
                  {formatRate(m.contributionMarginRate)}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Link>
  );
}
