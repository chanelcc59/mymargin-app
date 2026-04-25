'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { rawIngredientStore, prepItemStore, menuStore } from '@/lib/store';
import type {
  Menu, MenuChannelConfig, MenuRecipeItem, ChannelKey,
  RawIngredient, PrepItem, Unit,
} from '@/types/domain';
import {
  calcMenuCost, calcChannelMargin, formatKRW, formatRate, judgeMargin,
  DEFAULT_CHANNEL_CONFIG, getRawIngredientUnitCost, isCompatibleUnit,
} from '@/lib/cost-engine';
import { SearchBox, CategoryChips } from '@/components/Filters';

const CHANNEL_LABELS: Record<ChannelKey, string> = {
  dine_in: '매장',
  takeout: '포장',
  delivery: '배달',
};

const CHANNEL_DESC: Record<ChannelKey, string> = {
  dine_in: '홀 판매 · 카드 수수료만 반영',
  takeout: '포장 판매 · 포장비 포함',
  delivery: '배달 판매 · 플랫폼/결제/포장비 포함',
};

// 단가 표시 헬퍼 (소수점 자동)
function formatPerUnit(unitCost: number, unit: string): string {
  if (!unitCost) return `0원/${unit}`;
  if (unitCost < 1) return `${unitCost.toFixed(2)}원/${unit}`;
  return `${Math.round(unitCost).toLocaleString('ko-KR')}원/${unit}`;
}

// 매입 단위 옵션 (재료 추가/수정 모달에서 사용)
const BASE_UNIT_OPTIONS: Array<{ value: Unit; label: string; hint: string }> = [
  { value: 'g', label: 'g', hint: '무게 (그램)' },
  { value: 'ml', label: 'ml', hint: '부피 (밀리리터)' },
  { value: 'ea', label: '개', hint: '낱개' },
];

function compatiblePurchaseUnits(baseUnit: Unit): Array<{ value: Unit; label: string }> {
  if (baseUnit === 'g') return [{ value: 'g', label: 'g' }, { value: 'kg', label: 'kg' }];
  if (baseUnit === 'ml') return [{ value: 'ml', label: 'ml' }, { value: 'l', label: 'L' }];
  if (baseUnit === 'ea') return [{ value: 'ea', label: '개' }, { value: 'pack', label: '팩' }];
  return [{ value: 'g', label: 'g' }];
}

// ============================================
// 메인 페이지
// ============================================
export default function MenuDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params?.id;

  const [menu, setMenu] = useState<Menu | null>(null);
  const [raws, setRaws] = useState<RawIngredient[]>([]);
  const [preps, setPreps] = useState<PrepItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [notFound, setNotFound] = useState(false);

  const reload = (menuId: string) => {
    const m = menuStore.get(menuId);
    if (!m) {
      setMenu(null);
      setNotFound(true);
      return;
    }
    setNotFound(false);
    setMenu(m);
    setRaws(rawIngredientStore.list());
    setPreps(prepItemStore.list());
  };

  useEffect(() => {
    if (!id) return;
    reload(id);
    setLoaded(true);
    const onFocus = () => reload(id);
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [id]);

  const cost = useMemo(
    () => (menu ? calcMenuCost(menu, raws, preps) : null),
    [menu, raws, preps]
  );

  if (!loaded) return <div className="text-ink-3 text-sm">로딩 중...</div>;
  if (notFound || !menu)
    return (
      <div className="text-center py-16">
        <div className="font-serif text-[20px] italic text-ink-3 mb-2">메뉴를 찾을 수 없어요</div>
        <Link href="/owner/menus" className="text-accent font-bold">메뉴 목록으로 →</Link>
      </div>
    );

  const updateMenu = (patch: Partial<Menu>) => {
    const updated = menuStore.update(menu.id, patch);
    if (updated) setMenu(updated);
  };

  const handleDelete = () => {
    if (!confirm(`"${menu.name}"을 삭제하시겠어요?`)) return;
    menuStore.delete(menu.id);
    router.push('/owner/menus');
  };

  const handleRenameMenu = () => {
    const next = prompt('메뉴명', menu.name);
    if (next && next.trim() && next !== menu.name) {
      updateMenu({ name: next.trim() });
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {/* 헤더 */}
      <div className="flex items-start gap-3">
        <Link href="/owner/menus" className="text-ink-3 hover:text-ink text-[13px] font-bold flex-shrink-0 pt-1.5">← 메뉴</Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="font-serif text-[28px] md:text-[32px] font-medium tracking-tightest text-ink leading-tight">
              {menu.name}
            </h1>
            <button onClick={handleRenameMenu} className="text-[11px] text-ink-3 hover:text-navy font-bold">이름 수정</button>
          </div>
          {menu.category && (
            <div className="text-[11px] text-ink-3 font-bold tracking-[0.04em] uppercase mt-1">{menu.category}</div>
          )}
        </div>
        <button onClick={handleDelete} className="text-[12px] text-ink-4 hover:text-alert font-bold flex-shrink-0 pt-1.5">삭제</button>
      </div>

      {/* 원가 요약 */}
      {cost && (
        <div className="bg-navy text-white rounded-2xl p-5 flex items-center justify-between gap-4">
          <div>
            <div className="text-[11px] text-white/60 font-bold tracking-[0.04em] uppercase">1인분 식재료 원가</div>
            <div className="text-[11px] text-white/60 mt-0.5">재료 {cost.breakdown.length}종 · 실시간 계산</div>
          </div>
          <div className="text-right">
            <div className="font-serif-num text-[34px] text-white leading-none">
              {formatKRW(cost.foodCost)}
              <span className="text-[14px] ml-1 text-white/60 font-sans">원</span>
            </div>
          </div>
        </div>
      )}

      {/* 레시피 섹션 */}
      <RecipeSection
        menu={menu}
        raws={raws}
        preps={preps}
        cost={cost}
        onChange={(recipe) => updateMenu({ recipe })}
        onReload={() => id && reload(id)}
      />

      {/* 채널별 마진 섹션 */}
      <ChannelsSection
        menu={menu}
        raws={raws}
        preps={preps}
        onChange={(channels) => updateMenu({ channels })}
      />
    </div>
  );
}

// ============================================
// 레시피 섹션
// ============================================
function RecipeSection({
  menu, raws, preps, cost, onChange, onReload,
}: {
  menu: Menu;
  raws: RawIngredient[];
  preps: PrepItem[];
  cost: ReturnType<typeof calcMenuCost> | null;
  onChange: (recipe: MenuRecipeItem[]) => void;
  onReload: () => void;
}) {
  const [adding, setAdding] = useState<null | 'raw' | 'prep'>(null);
  const [editingRawId, setEditingRawId] = useState<string | null>(null);

  const updateItem = (idx: number, patch: Partial<MenuRecipeItem>) => {
    const next = menu.recipe.map((it, i) =>
      i === idx ? ({ ...it, ...patch } as MenuRecipeItem) : it
    );
    onChange(next);
  };

  const removeItem = (idx: number) => {
    onChange(menu.recipe.filter((_, i) => i !== idx));
  };

  const addRaw = (rawId: string) => {
    onChange([...menu.recipe, { kind: 'raw', rawIngredientId: rawId, qty: 0 }]);
    setAdding(null);
  };

  const addPrep = (prepId: string) => {
    onChange([...menu.recipe, { kind: 'prep', prepItemId: prepId, qty: 0 }]);
    setAdding(null);
  };

  return (
    <section className="bg-surface border border-border rounded-2xl p-5">
      <div className="flex items-start justify-between mb-4 flex-wrap gap-2">
        <div>
          <div className="text-[15px] font-bold tracking-tighter text-ink">1인분 레시피</div>
          <div className="text-[12px] text-ink-3 mt-0.5">일반 재료 또는 준비 재료를 추가하세요</div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setAdding('raw')}
            className="px-3 py-1.5 border border-border-strong text-[12px] font-bold text-ink-2 rounded-lg hover:border-navy hover:text-navy"
          >＋ 일반 재료</button>
          <button
            onClick={() => setAdding('prep')}
            disabled={preps.length === 0}
            className="px-3 py-1.5 border border-border-strong text-[12px] font-bold text-ink-2 rounded-lg hover:border-accent hover:text-accent disabled:opacity-40 disabled:cursor-not-allowed"
          >＋ 준비 재료</button>
        </div>
      </div>

      {menu.recipe.length === 0 ? (
        <div className="border-2 border-dashed border-warning/40 bg-warning-bg/30 rounded-xl p-8 text-center">
          <div className="font-serif text-[18px] italic tracking-tighter text-warning mb-1">아직 레시피가 비어있어요</div>
          <div className="text-[12px] text-ink-3 mb-4">위쪽 <strong>＋ 일반 재료</strong> 또는 <strong>＋ 준비 재료</strong> 버튼을 눌러 추가하세요</div>
          {raws.length === 0 && preps.length === 0 && (
            <div className="text-[11px] text-alert mt-2">
              먼저 <Link href="/owner/ingredients" className="underline font-bold">일반 재료</Link>부터 등록해야 해요
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {menu.recipe.map((item, idx) => {
            const breakdown = cost?.breakdown[idx];
            const isRaw = item.kind === 'raw';
            const rawId = isRaw ? (item as any).rawIngredientId : null;
            const unitCostText = breakdown
              ? (isRaw
                  ? formatPerUnit((breakdown as any).unitCost, breakdown.unit)
                  : formatPerUnit((breakdown as any).costPerUnit, breakdown.unit))
              : '';
            return (
              <div key={idx} className="grid grid-cols-[60px_1fr_100px_110px_28px] gap-2 items-center py-2 border-b border-border last:border-b-0">
                <div className={[
                  'text-[10px] font-bold px-1.5 py-0.5 rounded-md w-fit tracking-[0.04em]',
                  isRaw ? 'bg-navy-bg text-navy' : 'bg-accent-bg text-accent',
                ].join(' ')}>
                  {isRaw ? '일반' : '준비'}
                </div>
                <div className="min-w-0">
                  <div className="text-[13px] font-semibold text-ink tracking-tighter truncate">
                    {breakdown?.name ?? '(삭제된 재료)'}
                  </div>
                  {breakdown && (
                    <div className="text-[11px] text-ink-3 flex items-center gap-1.5 flex-wrap">
                      <span>{unitCostText}</span>
                      {isRaw && rawId && (
                        <button
                          onClick={() => setEditingRawId(rawId)}
                          className="text-accent hover:underline font-bold text-[10px]"
                          title="이 재료의 매입가/단가 수정"
                        >
                          단가 수정
                        </button>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.1"
                    min="0"
                    value={item.qty || ''}
                    onChange={(e) => updateItem(idx, { qty: Number(e.target.value) })}
                    className="w-16 px-2 py-1.5 border border-border-strong rounded-md text-[13px] text-right outline-none focus:border-accent font-serif-num"
                  />
                  <span className="text-[11px] text-ink-3">{breakdown?.unit ?? ''}</span>
                </div>
                <div className="text-right font-serif-num text-[14px] text-ink">
                  {formatKRW(breakdown?.lineCost ?? 0)}<span className="text-[10px] text-ink-3 ml-0.5 font-sans">원</span>
                </div>
                <button
                  onClick={() => removeItem(idx)}
                  className="text-ink-4 hover:text-alert text-[16px] font-bold"
                  aria-label="삭제"
                >×</button>
              </div>
            );
          })}
        </div>
      )}

      {adding === 'raw' && (
        <RawPickerModal
          raws={raws}
          onPick={(rawId) => addRaw(rawId)}
          onCancel={() => setAdding(null)}
          onCreated={(rawId) => {
            onReload();
            // 새로 만든 재료 자동 추가
            onChange([...menu.recipe, { kind: 'raw', rawIngredientId: rawId, qty: 0 }]);
            setAdding(null);
          }}
        />
      )}

      {adding === 'prep' && (
        <SimplePickerModal
          title="준비 재료 선택"
          items={preps.map((p) => ({ id: p.id, label: p.name, hint: `${p.yieldQty}${p.yieldUnit} 생산` }))}
          onPick={(id) => addPrep(id)}
          onCancel={() => setAdding(null)}
        />
      )}

      {editingRawId && (
        <RawInlineEditModal
          rawId={editingRawId}
          onClose={() => setEditingRawId(null)}
          onSaved={() => {
            setEditingRawId(null);
            onReload();
          }}
        />
      )}
    </section>
  );
}

// ============================================
// 일반 재료 선택 모달 - 검색 + 카테고리 + 새 재료 추가
// ============================================
function RawPickerModal({
  raws, onPick, onCancel, onCreated,
}: {
  raws: RawIngredient[];
  onPick: (rawId: string) => void;
  onCancel: () => void;
  onCreated: (rawId: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [creating, setCreating] = useState(false);

  const categories = useMemo(() => {
    const counts: Record<string, number> = {};
    raws.forEach((r) => {
      const c = r.category || '미분류';
      counts[c] = (counts[c] || 0) + 1;
    });
    const ORDER = ['양념', '떡·면', '어묵·순대', '튀김재료', '채소', '단백질', '완제품', '김밥재료', '음료', '기타', '미분류'];
    return Object.keys(counts).sort((a, b) => {
      const ai = ORDER.indexOf(a);
      const bi = ORDER.indexOf(b);
      if (ai === -1 && bi === -1) return a.localeCompare(b, 'ko');
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    }).map((c) => ({ name: c, count: counts[c] }));
  }, [raws]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return raws.filter((r) => {
      if (activeCategory !== 'all') {
        const cat = r.category || '미분류';
        if (cat !== activeCategory) return false;
      }
      if (q && !(r.name.toLowerCase().includes(q) || (r.category || '').toLowerCase().includes(q))) return false;
      return true;
    });
  }, [raws, query, activeCategory]);

  if (creating) {
    return (
      <RawCreateModal
        onCancel={() => setCreating(false)}
        onCreated={(rawId) => {
          setCreating(false);
          onCreated(rawId);
        }}
        existingCategories={categories.map(c => c.name).filter(c => c !== '미분류')}
        defaultName={query.trim()}
      />
    );
  }

  return (
    <div
      className="fixed inset-0 bg-navy/45 backdrop-blur-sm flex items-center md:items-center items-end justify-center z-50 p-0 md:p-5"
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div className="bg-surface w-full md:max-w-[520px] max-h-[85vh] rounded-t-2xl md:rounded-2xl overflow-hidden shadow-2xl flex flex-col">
        <div className="px-6 pt-5 pb-4 border-b border-border">
          <div className="flex items-baseline justify-between">
            <div className="font-serif text-[20px] font-medium tracking-tightest text-ink">일반 재료 선택</div>
            <button
              onClick={() => setCreating(true)}
              className="text-[12px] text-accent font-bold hover:underline"
            >＋ 새 재료 추가</button>
          </div>
        </div>

        <div className="px-6 py-3 border-b border-border flex flex-col gap-2">
          <SearchBox
            value={query}
            onChange={setQuery}
            placeholder="재료명 검색"
            count={filtered.length}
            total={raws.length}
          />
          {categories.length > 1 && (
            <CategoryChips
              items={[
                { value: 'all', label: '전체', count: raws.length },
                ...categories.map((c) => ({ value: c.name, label: c.name, count: c.count })),
              ]}
              active={activeCategory}
              onChange={setActiveCategory}
            />
          )}
        </div>

        <div className="flex-1 overflow-y-auto py-2">
          {filtered.length === 0 ? (
            <div className="px-6 py-8 text-center text-[13px] text-ink-3">
              검색 결과 없음
              <button
                onClick={() => setCreating(true)}
                className="block mx-auto mt-3 px-4 py-2 bg-accent text-white text-[12px] font-bold rounded-lg hover:bg-accent-dark"
              >＋ "{query || '새 재료'}" 추가하기</button>
            </div>
          ) : (
            filtered.map((r) => {
              const unitCost = getRawIngredientUnitCost(r);
              return (
                <button
                  key={r.id}
                  onClick={() => onPick(r.id)}
                  className="w-full px-6 py-2.5 flex items-baseline justify-between gap-3 hover:bg-surface-alt text-left"
                >
                  <div className="min-w-0">
                    <div className="text-[14px] font-semibold text-ink tracking-tighter truncate">{r.name}</div>
                    {r.category && <div className="text-[10px] text-ink-3">{r.category}</div>}
                  </div>
                  <div className="text-[11px] text-ink-3 font-serif-num flex-shrink-0">
                    {formatPerUnit(unitCost, r.baseUnit)}
                  </div>
                </button>
              );
            })
          )}
        </div>

        <div className="px-6 py-3 border-t border-border">
          <button onClick={onCancel} className="w-full py-2 text-[13px] font-bold text-ink-3 hover:text-ink">취소</button>
        </div>
      </div>
    </div>
  );
}

// ============================================
// 인라인 재료 단가 수정 모달 (매입 단위 기반)
// ============================================
function RawInlineEditModal({
  rawId, onClose, onSaved,
}: {
  rawId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [raw, setRaw] = useState<RawIngredient | null>(null);

  useEffect(() => {
    const r = rawIngredientStore.get(rawId);
    if (r) setRaw(r);
  }, [rawId]);

  if (!raw) {
    return (
      <div className="fixed inset-0 bg-navy/45 flex items-center justify-center z-[60]">
        <div className="bg-surface px-6 py-4 rounded-xl">로딩 중...</div>
      </div>
    );
  }

  return (
    <RawEditForm
      raw={raw}
      onCancel={onClose}
      onSaved={() => {
        onSaved();
      }}
    />
  );
}

// 새 재료 만들기 모달 (레시피 화면에서 호출)
function RawCreateModal({
  onCancel, onCreated, existingCategories, defaultName,
}: {
  onCancel: () => void;
  onCreated: (rawId: string) => void;
  existingCategories: string[];
  defaultName: string;
}) {
  return (
    <RawEditForm
      raw={null}
      defaultName={defaultName}
      existingCategories={existingCategories}
      onCancel={onCancel}
      onSaved={(newRawId) => {
        if (newRawId) onCreated(newRawId);
      }}
    />
  );
}

// 공용 폼 — 신규 또는 수정 둘 다 처리
function RawEditForm({
  raw, defaultName, existingCategories, onCancel, onSaved,
}: {
  raw: RawIngredient | null;
  defaultName?: string;
  existingCategories?: string[];
  onCancel: () => void;
  onSaved: (newRawId?: string) => void;
}) {
  const [name, setName] = useState(raw?.name ?? defaultName ?? '');
  const [category, setCategory] = useState(raw?.category ?? '');
  const [baseUnit, setBaseUnit] = useState<Unit>(raw?.baseUnit ?? 'g');
  const [purchaseQty, setPurchaseQty] = useState<string>(raw?.purchaseQty?.toString() ?? '');
  const [purchaseUnit, setPurchaseUnit] = useState<Unit>(raw?.purchaseUnit ?? 'kg');
  const [purchasePrice, setPurchasePrice] = useState<string>(raw?.purchasePrice?.toString() ?? '');
  const [shippingCost, setShippingCost] = useState<string>(raw?.shippingCost?.toString() ?? '');
  const [note, setNote] = useState(raw?.note ?? '');

  const compatibleUnits = compatiblePurchaseUnits(baseUnit);
  useEffect(() => {
    if (!compatibleUnits.find((u) => u.value === purchaseUnit)) {
      setPurchaseUnit(compatibleUnits[0].value);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseUnit]);

  const qtyNum = Number(purchaseQty);
  const priceNum = Number(purchasePrice);
  const shippingNum = Number(shippingCost) || 0;

  const preview = useMemo(() => {
    if (!purchaseQty || !purchasePrice || qtyNum <= 0 || priceNum < 0) return null;
    if (!isCompatibleUnit(baseUnit, purchaseUnit)) return null;
    const fakeRaw: RawIngredient = {
      id: 'preview', name: 'preview',
      baseUnit, purchaseQty: qtyNum, purchaseUnit,
      purchasePrice: priceNum, shippingCost: shippingNum,
      createdAt: 0, updatedAt: 0,
    };
    return getRawIngredientUnitCost(fakeRaw);
  }, [qtyNum, priceNum, shippingNum, baseUnit, purchaseUnit, purchaseQty, purchasePrice]);

  const canSave =
    name.trim().length > 0 &&
    purchaseQty !== '' && qtyNum > 0 &&
    purchasePrice !== '' && priceNum >= 0 &&
    isCompatibleUnit(baseUnit, purchaseUnit);

  const handleSubmit = () => {
    if (!canSave) return;
    const data = {
      name: name.trim(),
      category: category.trim() || undefined,
      baseUnit,
      purchaseQty: qtyNum,
      purchaseUnit,
      purchasePrice: priceNum,
      shippingCost: shippingNum,
      note: note.trim() || undefined,
    };
    if (raw) {
      rawIngredientStore.update(raw.id, data);
      onSaved(raw.id);
    } else {
      const created = rawIngredientStore.create(data);
      onSaved(created.id);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-navy/45 backdrop-blur-sm flex items-center md:items-center items-end justify-center z-[60] p-0 md:p-5"
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div className="bg-surface w-full md:max-w-[520px] max-h-[92vh] overflow-y-auto rounded-t-2xl md:rounded-2xl shadow-2xl">
        <div className="px-6 pt-5 pb-4 border-b border-border sticky top-0 bg-surface z-10">
          <div className="font-serif text-[22px] font-medium tracking-tightest text-ink">
            {raw ? '재료 수정' : '새 재료 추가'}
          </div>
          <div className="text-[12px] text-ink-3 mt-0.5">
            매입 단위 그대로 입력하세요. 단가는 자동 계산됩니다.
          </div>
        </div>

        <div className="px-6 py-5 flex flex-col gap-4">
          <FormField label="재료명" required>
            <input
              autoFocus={!raw}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="예: 고춧가루"
              className="w-full px-3 py-2.5 border border-border-strong rounded-[10px] text-[14px] text-ink outline-none focus:border-accent"
            />
          </FormField>

          <FormField label="분류 (선택)">
            <input
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="예: 양념, 채소"
              className="w-full px-3 py-2.5 border border-border-strong rounded-[10px] text-[14px] text-ink outline-none focus:border-accent"
            />
            {existingCategories && existingCategories.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1.5">
                {existingCategories.slice(0, 8).map((c) => (
                  <button
                    type="button"
                    key={c}
                    onClick={() => setCategory(c)}
                    className="text-[10px] text-ink-3 hover:text-navy bg-surface-alt hover:bg-navy-bg px-2 py-0.5 rounded-md font-semibold"
                  >+ {c}</button>
                ))}
              </div>
            )}
          </FormField>

          <FormField label="메뉴 레시피에서 사용할 단위" required>
            <div className="flex gap-2">
              {BASE_UNIT_OPTIONS.map((o) => (
                <button
                  type="button"
                  key={o.value}
                  onClick={() => setBaseUnit(o.value)}
                  className={[
                    'flex-1 py-2.5 px-3 rounded-[10px] text-[13px] font-bold border transition-colors text-center',
                    baseUnit === o.value ? 'bg-navy text-white border-navy' : 'bg-surface text-ink-2 border-border-strong hover:border-navy/40',
                  ].join(' ')}
                >
                  <div>{o.label}</div>
                  <div className={[
                    'text-[10px] font-normal mt-0.5',
                    baseUnit === o.value ? 'text-white/70' : 'text-ink-4',
                  ].join(' ')}>{o.hint}</div>
                </button>
              ))}
            </div>
          </FormField>

          <div className="bg-surface-alt rounded-xl p-4 flex flex-col gap-3 border border-border">
            <div className="text-[12px] font-bold text-ink-2 tracking-tighter">📦 매입 정보</div>
            <div className="text-[11px] text-ink-3 -mt-2">평소 한 번 살 때 들어오는 양과 가격</div>

            <div className="grid grid-cols-[1.4fr_1fr] gap-2">
              <FormField label="매입 양" required dense>
                <input
                  type="number" inputMode="decimal" step="0.01" min="0"
                  value={purchaseQty}
                  onChange={(e) => setPurchaseQty(e.target.value)}
                  placeholder="예: 20"
                  className="w-full px-3 py-2 border border-border-strong rounded-lg text-[14px] text-ink outline-none focus:border-accent font-serif-num"
                />
              </FormField>
              <FormField label="단위" required dense>
                <select
                  value={purchaseUnit}
                  onChange={(e) => setPurchaseUnit(e.target.value as Unit)}
                  className="w-full px-3 py-2 border border-border-strong rounded-lg text-[14px] text-ink outline-none focus:border-accent bg-surface"
                >
                  {compatibleUnits.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </FormField>
            </div>

            <FormField label="매입 가격 (원)" required dense>
              <input
                type="number" inputMode="numeric" min="0"
                value={purchasePrice}
                onChange={(e) => setPurchasePrice(e.target.value)}
                placeholder="예: 260000"
                className="w-full px-3 py-2 border border-border-strong rounded-lg text-[14px] text-ink outline-none focus:border-accent font-serif-num"
              />
            </FormField>

            <FormField label="배송비 (원, 선택)" dense>
              <input
                type="number" inputMode="numeric" min="0"
                value={shippingCost}
                onChange={(e) => setShippingCost(e.target.value)}
                placeholder="0"
                className="w-full px-3 py-2 border border-border-strong rounded-lg text-[14px] text-ink outline-none focus:border-accent font-serif-num"
              />
            </FormField>
          </div>

          {preview !== null && (
            <div className="bg-accent-bg border border-accent/30 rounded-xl p-4 flex items-center justify-between">
              <div>
                <div className="text-[11px] text-accent-dark font-bold tracking-[0.04em] uppercase">자동 계산</div>
                <div className="text-[10px] text-ink-3 mt-0.5">
                  ({formatKRW(priceNum)}{shippingNum > 0 ? ` + ${formatKRW(shippingNum)}` : ''}) ÷ {qtyNum}{purchaseUnit}
                </div>
              </div>
              <div className="text-right">
                <div className="font-serif-num text-[22px] text-accent-dark leading-none">
                  {preview < 1 ? preview.toFixed(2) : Math.round(preview).toLocaleString('ko-KR')}
                  <span className="text-[12px] ml-0.5 text-ink-3 font-sans">원/{baseUnit}</span>
                </div>
              </div>
            </div>
          )}

          <FormField label="메모 (선택)">
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="예: 거래처 OO식자재"
              className="w-full px-3 py-2.5 border border-border-strong rounded-[10px] text-[14px] text-ink outline-none focus:border-accent"
            />
          </FormField>
        </div>

        <div className="px-6 py-4 border-t border-border flex items-center justify-end gap-2 sticky bottom-0 bg-surface">
          <button onClick={onCancel} className="px-4 py-2 text-[13px] font-bold text-ink-3 hover:text-ink">취소</button>
          <button
            onClick={handleSubmit}
            disabled={!canSave}
            className="px-5 py-2 bg-navy text-white text-[13px] font-bold rounded-lg hover:bg-navy-dark disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {raw ? '저장' : '등록 후 메뉴에 추가'}
          </button>
        </div>
      </div>
    </div>
  );
}

function FormField({ label, required, dense, children }: { label: string; required?: boolean; dense?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className={[
        'block font-semibold text-ink-2 tracking-tighter',
        dense ? 'text-[11px] mb-1' : 'text-[12px] mb-1.5',
      ].join(' ')}>
        {label}{required && <span className="text-accent ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

// 단순 선택 모달 (준비 재료용)
function SimplePickerModal({
  title, items, onPick, onCancel,
}: {
  title: string;
  items: Array<{ id: string; label: string; hint?: string }>;
  onPick: (id: string) => void;
  onCancel: () => void;
}) {
  return (
    <div
      className="fixed inset-0 bg-navy/45 backdrop-blur-sm flex items-center md:items-center items-end justify-center z-50 p-0 md:p-5"
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div className="bg-surface w-full md:max-w-[420px] max-h-[80vh] rounded-t-2xl md:rounded-2xl overflow-hidden shadow-2xl flex flex-col">
        <div className="px-6 pt-5 pb-4 border-b border-border">
          <div className="font-serif text-[20px] font-medium tracking-tightest text-ink">{title}</div>
        </div>
        <div className="flex-1 overflow-y-auto py-2">
          {items.map((it) => (
            <button
              key={it.id}
              onClick={() => onPick(it.id)}
              className="w-full px-6 py-3 flex items-baseline justify-between gap-2 hover:bg-surface-alt text-left"
            >
              <span className="text-[14px] font-semibold text-ink tracking-tighter">{it.label}</span>
              {it.hint && <span className="text-[11px] text-ink-3 font-serif-num">{it.hint}</span>}
            </button>
          ))}
        </div>
        <div className="px-6 py-3 border-t border-border">
          <button onClick={onCancel} className="w-full py-2 text-[13px] font-bold text-ink-3 hover:text-ink">취소</button>
        </div>
      </div>
    </div>
  );
}

// ============================================
// 채널별 마진 섹션
// ============================================
function ChannelsSection({
  menu, raws, preps, onChange,
}: {
  menu: Menu;
  raws: RawIngredient[];
  preps: PrepItem[];
  onChange: (channels: MenuChannelConfig[]) => void;
}) {
  const menuCost = useMemo(() => calcMenuCost(menu, raws, preps), [menu, raws, preps]);

  const updateChannel = (channel: ChannelKey, patch: Partial<MenuChannelConfig>) => {
    const existing = menu.channels.find((c) => c.channel === channel);
    if (existing) {
      onChange(menu.channels.map((c) => (c.channel === channel ? { ...c, ...patch } : c)));
    } else {
      onChange([...menu.channels, { channel, isActive: true, salePrice: 0, ...patch }]);
    }
  };

  return (
    <section className="bg-surface border border-border rounded-2xl p-5">
      <div className="mb-4">
        <div className="text-[15px] font-bold tracking-tighter text-ink">채널별 가격 · 마진</div>
        <div className="text-[12px] text-ink-3 mt-0.5">매장/포장/배달 별로 판매가와 마진을 비교하세요</div>
      </div>

      <div className="flex flex-col gap-3">
        {(['dine_in', 'takeout', 'delivery'] as const).map((channel) => {
          const config = menu.channels.find((c) => c.channel === channel) ?? {
            channel, isActive: false, salePrice: 0,
          };
          return (
            <ChannelRow
              key={channel}
              channel={channel}
              config={config}
              menuCost={menuCost}
              menu={menu}
              onChange={(patch) => updateChannel(channel, patch)}
            />
          );
        })}
      </div>
    </section>
  );
}

function ChannelRow({
  channel, config, menuCost, menu, onChange,
}: {
  channel: ChannelKey;
  config: MenuChannelConfig;
  menuCost: ReturnType<typeof calcMenuCost>;
  menu: Menu;
  onChange: (patch: Partial<MenuChannelConfig>) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const margin = useMemo(() => calcChannelMargin(menu, config, menuCost), [menu, config, menuCost]);
  const tier = judgeMargin(margin.contributionMarginRate);
  const def = DEFAULT_CHANNEL_CONFIG[channel];

  return (
    <div className={[
      'border rounded-xl overflow-hidden transition-colors',
      config.isActive ? 'border-border' : 'border-border bg-surface-alt/40 opacity-75',
    ].join(' ')}>
      <div className="p-4 flex items-center gap-3 flex-wrap">
        <button
          onClick={() => onChange({ isActive: !config.isActive })}
          className={[
            'w-10 h-6 rounded-full transition-colors relative flex-shrink-0',
            config.isActive ? 'bg-accent' : 'bg-border-strong',
          ].join(' ')}
          aria-label="채널 켜기/끄기"
        >
          <span
            className={[
              'block w-5 h-5 bg-white rounded-full absolute top-0.5 transition-all shadow',
              config.isActive ? 'left-[18px]' : 'left-0.5',
            ].join(' ')}
          />
        </button>

        <div className="min-w-0">
          <div className="text-[14px] font-bold tracking-tighter text-ink">{CHANNEL_LABELS[channel]}</div>
          <div className="text-[10px] text-ink-3">{CHANNEL_DESC[channel]}</div>
        </div>

        <div className="flex-1" />

        <div className="flex items-center gap-1">
          <input
            type="number" inputMode="numeric" min="0"
            value={config.salePrice || ''}
            onChange={(e) => onChange({ salePrice: Number(e.target.value) })}
            disabled={!config.isActive}
            placeholder="판매가"
            className="w-24 px-2.5 py-1.5 border border-border-strong rounded-md text-[14px] text-right outline-none focus:border-accent font-serif-num disabled:bg-surface-alt disabled:text-ink-4"
          />
          <span className="text-[11px] text-ink-3">원</span>
        </div>

        {config.isActive && (
          <div className={[
            'font-serif-num px-2.5 py-1 rounded-md text-[14px] font-bold min-w-[58px] text-center',
            tier === 'good' ? 'text-accent bg-accent-bg' :
            tier === 'mid'  ? 'text-warning bg-warning-bg' :
                              'text-alert bg-alert-bg',
          ].join(' ')}>
            {formatRate(margin.contributionMarginRate)}
          </div>
        )}

        <button
          onClick={() => setExpanded(!expanded)}
          disabled={!config.isActive}
          className="text-[11px] text-ink-3 hover:text-navy font-bold disabled:opacity-0"
        >
          {expanded ? '닫기' : '자세히'}
        </button>
      </div>

      {config.isActive && expanded && (
        <div className="border-t border-border px-4 py-4 bg-surface-alt/50 flex flex-col gap-3">
          <BreakdownGrid margin={margin} />

          <div className="pt-3 border-t border-border">
            <div className="text-[11px] font-bold text-ink-3 tracking-[0.04em] uppercase mb-2">채널 설정 (비워두면 기본값)</div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              <OverrideInput
                label={`플랫폼 수수료 (기본 ${(def.platformFeeRate * 100).toFixed(0)}%)`}
                suffix="%"
                value={config.platformFeeRate !== undefined ? (config.platformFeeRate * 100).toString() : ''}
                onChange={(v) => onChange({ platformFeeRate: v === '' ? undefined : Number(v) / 100 })}
              />
              <OverrideInput
                label={`결제 수수료 (기본 ${(def.paymentFeeRate * 100).toFixed(1)}%)`}
                suffix="%"
                value={config.paymentFeeRate !== undefined ? (config.paymentFeeRate * 100).toString() : ''}
                onChange={(v) => onChange({ paymentFeeRate: v === '' ? undefined : Number(v) / 100 })}
              />
              <OverrideInput
                label={`포장비 (기본 ${def.packagingCost}원)`}
                suffix="원"
                value={config.packagingCost !== undefined ? config.packagingCost.toString() : ''}
                onChange={(v) => onChange({ packagingCost: v === '' ? undefined : Number(v) })}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function BreakdownGrid({ margin }: { margin: ReturnType<typeof calcChannelMargin> }) {
  const lines = [
    { label: '판매가 (부가세 포함)', value: `+${formatKRW(margin.salePrice)}`, highlight: false },
    { label: '부가세 (-10% 분리)', value: `-${formatKRW(margin.salePrice - margin.netRevenue)}`, muted: true },
    { label: '실매출 인식액', value: formatKRW(margin.netRevenue), emphasize: true },
    { label: '식재료 원가', value: `-${formatKRW(margin.foodCost)}`, negative: true },
    { label: '플랫폼 수수료', value: `-${formatKRW(margin.platformFee)}`, negative: true, hide: margin.platformFee === 0 },
    { label: '결제 수수료', value: `-${formatKRW(margin.paymentFee)}`, negative: true },
    { label: '포장비', value: `-${formatKRW(margin.packagingCost)}`, negative: true, hide: margin.packagingCost === 0 },
    { label: '기타 비용', value: `-${formatKRW(margin.extraCost)}`, negative: true, hide: margin.extraCost === 0 },
  ];
  return (
    <div className="flex flex-col gap-1 text-[12px]">
      {lines.filter((l) => !l.hide).map((l, i) => (
        <div key={i} className={[
          'flex items-baseline justify-between',
          l.emphasize ? 'border-y border-border py-1.5 my-0.5' : '',
        ].join(' ')}>
          <span className={[
            l.muted ? 'text-ink-4' : l.emphasize ? 'text-ink font-bold' : 'text-ink-2',
          ].join(' ')}>{l.label}</span>
          <span className={[
            'font-serif-num',
            l.muted ? 'text-ink-4' :
            l.negative ? 'text-alert' :
            l.emphasize ? 'text-ink font-bold' : 'text-ink-2',
          ].join(' ')}>{l.value}원</span>
        </div>
      ))}
      <div className="flex items-baseline justify-between border-t-2 border-ink pt-1.5 mt-1">
        <span className="text-[13px] font-bold text-ink">공헌이익</span>
        <span className="font-serif-num text-[16px] font-bold text-accent">
          {formatKRW(margin.contributionProfit)}<span className="text-[11px] ml-0.5 text-ink-3 font-sans">원</span>
        </span>
      </div>
      <div className="flex items-baseline justify-between">
        <span className="text-[11px] text-ink-3">원가율 {formatRate(margin.foodCostRate)}</span>
        <span className="text-[11px] text-ink-3">공헌이익률 <strong className="text-accent">{formatRate(margin.contributionMarginRate)}</strong></span>
      </div>
    </div>
  );
}

function OverrideInput({ label, value, onChange, suffix }: { label: string; value: string; onChange: (v: string) => void; suffix: string }) {
  return (
    <div>
      <label className="block text-[10px] font-semibold text-ink-3 mb-1 tracking-tighter">{label}</label>
      <div className="flex items-center">
        <input
          type="number" inputMode="decimal" step="0.01" min="0"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="기본값"
          className="w-full px-2 py-1.5 border border-border-strong rounded-md text-[13px] text-right outline-none focus:border-accent font-serif-num"
        />
        <span className="ml-1 text-[11px] text-ink-3">{suffix}</span>
      </div>
    </div>
  );
}
