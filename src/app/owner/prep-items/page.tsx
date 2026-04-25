'use client';

import { useEffect, useMemo, useState } from 'react';
import { rawIngredientStore, prepItemStore } from '@/lib/store';
import type { PrepItem, PrepRecipeItem, RawIngredient, Unit } from '@/types/domain';
import {
  calcPrepItemCost, formatKRW,
  getRawIngredientUnitCost, isCompatibleUnit,
} from '@/lib/cost-engine';
import { SearchBox, CategoryChips } from '@/components/Filters';

// 단가 표시 헬퍼
function formatPerUnit(unitCost: number, unit: string): string {
  if (!unitCost) return `0원/${unit}`;
  if (unitCost < 1) return `${unitCost.toFixed(2)}원/${unit}`;
  return `${Math.round(unitCost).toLocaleString('ko-KR')}원/${unit}`;
}

const UNIT_OPTIONS: Array<{ value: Unit; label: string }> = [
  { value: 'g', label: 'g' },
  { value: 'kg', label: 'kg' },
  { value: 'ml', label: 'ml' },
  { value: 'l', label: 'L' },
  { value: 'ea', label: '개' },
  { value: 'pack', label: '팩' },
];

const BASE_UNIT_OPTIONS: Array<{ value: Unit; label: string; hint: string }> = [
  { value: 'g', label: 'g', hint: '무게' },
  { value: 'ml', label: 'ml', hint: '부피' },
  { value: 'ea', label: '개', hint: '낱개' },
];

function compatiblePurchaseUnits(baseUnit: Unit): Array<{ value: Unit; label: string }> {
  if (baseUnit === 'g') return [{ value: 'g', label: 'g' }, { value: 'kg', label: 'kg' }];
  if (baseUnit === 'ml') return [{ value: 'ml', label: 'ml' }, { value: 'l', label: 'L' }];
  if (baseUnit === 'ea') return [{ value: 'ea', label: '개' }, { value: 'pack', label: '팩' }];
  return [{ value: 'g', label: 'g' }];
}

export default function PrepItemsPage() {
  const [raws, setRaws] = useState<RawIngredient[]>([]);
  const [preps, setPreps] = useState<PrepItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [editing, setEditing] = useState<PrepItem | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [query, setQuery] = useState('');

  const reload = () => {
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

  const handleSave = (data: Omit<PrepItem, 'id' | 'createdAt' | 'updatedAt'>) => {
    if (editing) {
      prepItemStore.update(editing.id, data);
    } else {
      prepItemStore.create(data);
    }
    setShowForm(false);
    setEditing(null);
    reload();
  };

  const handleDelete = (id: string) => {
    if (!confirm('삭제하시겠어요? 이 준비재료를 쓰는 메뉴의 원가가 영향을 받습니다.')) return;
    prepItemStore.delete(id);
    reload();
  };

  if (!loaded) return <div className="text-ink-3 text-sm">로딩 중...</div>;

  // 일반 재료가 하나도 없으면 안내
  if (raws.length === 0) {
    return (
      <div className="flex flex-col gap-5">
        <PageHeader
          title="준비 재료"
          subtitle="양념장·육수·반죽처럼 미리 만들어두고 여러 메뉴에 쓰는 재료"
        />
        <div className="bg-warning-bg border border-warning/30 rounded-xl p-8 text-center">
          <div className="font-serif text-[20px] italic tracking-tighter text-warning mb-2">
            먼저 일반 재료를 등록해주세요
          </div>
          <div className="text-[13px] text-ink-3 mb-4">
            준비 재료는 일반 재료를 조합해서 만들어요.
          </div>
          <a href="/owner/ingredients" className="inline-block px-5 py-2.5 bg-navy text-white text-[13px] font-bold rounded-lg hover:bg-navy-dark transition-colors">
            일반 재료 등록하러 가기 →
          </a>
        </div>
      </div>
    );
  }

  const filteredPreps = preps.filter((p) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return p.name.toLowerCase().includes(q) || (p.note || '').toLowerCase().includes(q);
  });

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="준비 재료"
        subtitle="양념장·육수·반죽처럼 미리 만들어두고 여러 메뉴에 쓰는 재료"
        action={
          <button
            onClick={() => { setEditing(null); setShowForm(true); }}
            className="px-4 py-2 bg-navy text-white text-[13px] font-bold rounded-lg hover:bg-navy-dark transition-colors"
          >
            ＋ 준비 재료 추가
          </button>
        }
      />

      {preps.length === 0 ? (
        <div className="bg-surface border border-dashed border-border-strong rounded-xl p-12 text-center">
          <div className="font-serif text-[20px] italic tracking-tighter text-ink mb-1">아직 등록된 준비재료가 없어요</div>
          <div className="text-[13px] text-ink-3">예시: 떡볶이 양념장, 육수, 반죽, 소스 등</div>
        </div>
      ) : (
        <>
          {preps.length > 3 && (
            <SearchBox
              value={query}
              onChange={setQuery}
              placeholder="준비 재료 검색"
              count={filteredPreps.length}
              total={preps.length}
            />
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {filteredPreps.map((p) => (
              <PrepCard
                key={p.id}
                prep={p}
                raws={raws}
                onEdit={() => { setEditing(p); setShowForm(true); }}
                onDelete={() => handleDelete(p.id)}
              />
            ))}
          </div>
        </>
      )}

      {showForm && (
        <PrepFormModal
          initial={editing}
          raws={raws}
          onCancel={() => { setShowForm(false); setEditing(null); }}
          onSave={handleSave}
          onRawsChanged={reload}
        />
      )}
    </div>
  );
}

function PrepCard({ prep, raws, onEdit, onDelete }: {
  prep: PrepItem;
  raws: RawIngredient[];
  onEdit: () => void;
  onDelete: () => void;
}) {
  const cost = useMemo(() => calcPrepItemCost(prep, raws), [prep, raws]);
  return (
    <div className="bg-surface border border-border rounded-xl p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-bold text-[15px] tracking-tighter text-ink truncate">{prep.name}</div>
          <div className="text-[11px] text-ink-3 mt-0.5">
            한 번 만들면 {prep.yieldQty.toLocaleString('ko-KR')}{prep.yieldUnit} 생산
          </div>
        </div>
        <div className="flex gap-1 flex-shrink-0">
          <button onClick={onEdit} className="text-[12px] text-ink-3 hover:text-navy px-2 py-1 font-semibold">수정</button>
          <button onClick={onDelete} className="text-[12px] text-ink-4 hover:text-alert px-2 py-1 font-semibold">삭제</button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 py-2 border-y border-border">
        <div>
          <div className="text-[10px] text-ink-3 font-bold tracking-[0.04em] uppercase">총 원가</div>
          <div className="font-serif-num text-[18px] text-ink">{formatKRW(cost.totalCost)}<span className="text-[11px] ml-0.5 text-ink-3 font-sans">원</span></div>
        </div>
        <div>
          <div className="text-[10px] text-ink-3 font-bold tracking-[0.04em] uppercase">단가</div>
          <div className="font-serif-num text-[18px] text-accent">
            {cost.costPerUnit < 1 ? cost.costPerUnit.toFixed(2) : Math.round(cost.costPerUnit).toLocaleString('ko-KR')}
            <span className="text-[11px] ml-0.5 text-ink-3 font-sans">원/{prep.yieldUnit}</span>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <div className="text-[10px] text-ink-3 font-bold tracking-[0.04em] uppercase mb-0.5">들어간 재료 · {cost.breakdown.length}종</div>
        {cost.breakdown.slice(0, 4).map((b) => (
          <div key={b.rawIngredientId} className="flex items-baseline justify-between text-[12px]">
            <span className="text-ink-2 tracking-tighter">{b.rawName} <span className="text-ink-4 text-[11px]">{b.qty}{b.unit}</span></span>
            <span className="font-serif-num text-ink-2">{formatKRW(b.lineCost)}원</span>
          </div>
        ))}
        {cost.breakdown.length > 4 && (
          <div className="text-[11px] text-ink-4">외 {cost.breakdown.length - 4}종</div>
        )}
      </div>

      {prep.note && (
        <div className="text-[11px] text-ink-3 bg-surface-alt p-2 rounded-md">{prep.note}</div>
      )}
    </div>
  );
}

function PageHeader({ title, subtitle, action }: { title: string; subtitle: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 flex-wrap">
      <div>
        <h1 className="font-serif text-[28px] md:text-[32px] font-medium tracking-tightest text-ink leading-tight">{title}</h1>
        <p className="text-ink-3 text-[13px] mt-1">{subtitle}</p>
      </div>
      {action}
    </div>
  );
}

// ============================================
// 준비재료 추가/수정 모달
// ============================================
function PrepFormModal({
  initial, raws, onCancel, onSave, onRawsChanged,
}: {
  initial: PrepItem | null;
  raws: RawIngredient[];
  onCancel: () => void;
  onSave: (data: Omit<PrepItem, 'id' | 'createdAt' | 'updatedAt'>) => void;
  onRawsChanged: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [yieldQty, setYieldQty] = useState<string>(initial?.yieldQty?.toString() ?? '');
  const [yieldUnit, setYieldUnit] = useState<Unit>(initial?.yieldUnit ?? 'g');
  const [items, setItems] = useState<PrepRecipeItem[]>(initial?.items ?? []);
  const [note, setNote] = useState(initial?.note ?? '');

  // 재료 선택/추가 모달 상태
  const [pickingForIdx, setPickingForIdx] = useState<number | null>(null);  // 어떤 행의 재료를 선택 중인지
  const [isAddingNewRow, setIsAddingNewRow] = useState(false); // 새 행 추가 중

  const preview = useMemo(() => {
    if (items.length === 0 || !yieldQty || Number(yieldQty) <= 0) return null;
    return calcPrepItemCost(
      {
        id: 'preview', name: name || 'preview',
        yieldQty: Number(yieldQty), yieldUnit, items,
        createdAt: 0, updatedAt: 0,
      },
      raws
    );
  }, [items, name, yieldQty, yieldUnit, raws]);

  const canSave =
    name.trim().length > 0 &&
    yieldQty !== '' && Number(yieldQty) > 0 &&
    items.length > 0 &&
    items.every((it) => it.qty > 0 && it.rawIngredientId);

  const handleSubmit = () => {
    if (!canSave) return;
    onSave({
      name: name.trim(),
      yieldQty: Number(yieldQty),
      yieldUnit,
      items,
      note: note.trim() || undefined,
    });
  };

  const updateItem = (idx: number, patch: Partial<PrepRecipeItem>) => {
    setItems(items.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  };

  const removeItem = (idx: number) => {
    setItems(items.filter((_, i) => i !== idx));
  };

  // 재료 선택 처리
  const handlePickRaw = (rawId: string) => {
    if (isAddingNewRow) {
      setItems([...items, { rawIngredientId: rawId, qty: 0 }]);
    } else if (pickingForIdx !== null) {
      updateItem(pickingForIdx, { rawIngredientId: rawId });
    }
    setPickingForIdx(null);
    setIsAddingNewRow(false);
  };

  // 새 재료 만들고 자동 추가
  const handleCreatedRaw = (rawId: string) => {
    onRawsChanged();
    handlePickRaw(rawId);
  };

  return (
    <div
      className="fixed inset-0 bg-navy/45 backdrop-blur-sm flex items-end md:items-center justify-center z-50 p-0 md:p-5"
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div className="bg-surface w-full md:max-w-[640px] h-[92vh] md:h-auto md:max-h-[92vh] rounded-t-2xl md:rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        <div className="px-5 pt-4 pb-3 border-b border-border flex-shrink-0">
          <div className="font-serif text-[20px] font-medium tracking-tightest text-ink">
            {initial ? '준비 재료 수정' : '준비 재료 추가'}
          </div>
          <div className="text-[11px] text-ink-3 mt-0.5">
            양념장·육수 등 한 번 만들어두고 여러 메뉴에 쓰는 재료
          </div>
        </div>

        <div className="flex-1 overflow-y-auto min-h-0 px-5 py-4 flex flex-col gap-4">
          <Field label="이름" required>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="예: 떡볶이 양념장"
              className="w-full px-3 py-2.5 border border-border-strong rounded-[10px] text-[14px] text-ink outline-none focus:border-accent transition-colors"
            />
          </Field>

          <div className="grid grid-cols-[1fr_1fr] gap-3">
            <Field label="1회 생산량" required>
              <input
                type="number" inputMode="decimal" step="1" min="0"
                value={yieldQty}
                onChange={(e) => setYieldQty(e.target.value)}
                placeholder="예: 2000"
                className="w-full px-3 py-2.5 border border-border-strong rounded-[10px] text-[14px] text-ink outline-none focus:border-accent font-serif-num"
              />
            </Field>
            <Field label="생산 단위" required>
              <select
                value={yieldUnit}
                onChange={(e) => setYieldUnit(e.target.value as Unit)}
                className="w-full px-3 py-2.5 border border-border-strong rounded-[10px] text-[14px] text-ink outline-none focus:border-accent bg-surface"
              >
                {UNIT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </Field>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-[12px] font-semibold text-ink-2 tracking-tighter">
                들어가는 재료 <span className="text-accent">*</span>
              </label>
              <button
                type="button"
                onClick={() => { setIsAddingNewRow(true); setPickingForIdx(null); }}
                className="text-[12px] text-accent font-bold hover:underline"
              >
                ＋ 재료 추가
              </button>
            </div>

            {items.length === 0 ? (
              <div className="border border-dashed border-border-strong rounded-[10px] py-6 text-center text-[12px] text-ink-4">
                위쪽 <strong>＋ 재료 추가</strong> 버튼으로 재료를 추가하세요
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {items.map((item, idx) => {
                  const raw = raws.find((r) => r.id === item.rawIngredientId);
                  const unitCost = raw ? getRawIngredientUnitCost(raw) : 0;
                  const lineCost = unitCost * item.qty;
                  return (
                    <div key={idx} className="grid grid-cols-[1fr_80px_70px_28px] gap-2 items-center">
                      <button
                        type="button"
                        onClick={() => { setPickingForIdx(idx); setIsAddingNewRow(false); }}
                        className="text-left px-2.5 py-2 border border-border-strong rounded-lg text-[13px] text-ink outline-none hover:border-navy bg-surface min-w-0"
                      >
                        <div className="truncate font-semibold">
                          {raw ? raw.name : <span className="text-ink-4">재료 선택...</span>}
                        </div>
                        {raw && (
                          <div className="text-[10px] text-ink-3 truncate">
                            {formatPerUnit(unitCost, raw.baseUnit)}
                          </div>
                        )}
                      </button>
                      <div className="flex items-center gap-1">
                        <input
                          type="number" inputMode="decimal" step="0.1" min="0"
                          value={item.qty || ''}
                          onChange={(e) => updateItem(idx, { qty: Number(e.target.value) })}
                          placeholder="0"
                          className="w-full px-2 py-2 border border-border-strong rounded-lg text-[13px] text-ink text-right outline-none focus:border-accent font-serif-num"
                        />
                        <span className="text-[10px] text-ink-3">{raw?.baseUnit ?? ''}</span>
                      </div>
                      <div className="text-right text-[12px] text-ink-2 font-serif-num">
                        {formatKRW(lineCost)}원
                      </div>
                      <button
                        type="button"
                        onClick={() => removeItem(idx)}
                        className="text-ink-4 hover:text-alert text-[16px] font-bold"
                        aria-label="삭제"
                      >×</button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {preview && (
            <div className="bg-accent-bg border border-accent/30 rounded-xl p-4 flex items-center justify-between">
              <div>
                <div className="text-[11px] text-accent-dark font-bold tracking-[0.04em] uppercase">실시간 원가</div>
                <div className="text-[11px] text-ink-3 mt-0.5">
                  {preview.yieldQty.toLocaleString('ko-KR')}{preview.yieldUnit} 생산 기준
                </div>
              </div>
              <div className="text-right">
                <div className="font-serif-num text-[22px] text-accent-dark">
                  {formatKRW(preview.totalCost)}<span className="text-[13px] ml-0.5 text-ink-3 font-sans">원</span>
                </div>
                <div className="text-[11px] text-ink-3">
                  단위당 <strong className="text-accent-dark">{preview.costPerUnit < 1 ? preview.costPerUnit.toFixed(2) : Math.round(preview.costPerUnit).toLocaleString('ko-KR')}원/{preview.yieldUnit}</strong>
                </div>
              </div>
            </div>
          )}

          <Field label="메모 (선택)">
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="예: 한 번에 만들어서 냉장 1주일 보관"
              className="w-full px-3 py-2.5 border border-border-strong rounded-[10px] text-[14px] text-ink outline-none focus:border-accent transition-colors"
            />
          </Field>
        </div>

        <div className="px-5 py-3 border-t border-border flex items-center justify-end gap-2 flex-shrink-0 bg-surface">
          <button onClick={onCancel} className="px-4 py-2 text-[13px] font-bold text-ink-3 hover:text-ink">취소</button>
          <button
            onClick={handleSubmit}
            disabled={!canSave}
            className="px-5 py-2 bg-navy text-white text-[13px] font-bold rounded-lg hover:bg-navy-dark transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {initial ? '저장' : '등록'}
          </button>
        </div>
      </div>

      {/* 재료 선택 모달 */}
      {(pickingForIdx !== null || isAddingNewRow) && (
        <RawPickerModal
          raws={raws}
          onPick={handlePickRaw}
          onCancel={() => { setPickingForIdx(null); setIsAddingNewRow(false); }}
          onCreated={handleCreatedRaw}
        />
      )}
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[12px] font-semibold text-ink-2 mb-1.5 tracking-tighter">
        {label}{required && <span className="text-accent ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

// ============================================
// 일반 재료 선택 모달 (검색 + 카테고리 + 즉석 추가)
// 메뉴 상세에서 쓰는 것과 동일한 컴포넌트 (간소 버전)
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
      <RawCreateForm
        defaultName={query.trim()}
        existingCategories={categories.map(c => c.name).filter(c => c !== '미분류')}
        onCancel={() => setCreating(false)}
        onCreated={(rawId) => {
          setCreating(false);
          onCreated(rawId);
        }}
      />
    );
  }

  return (
    <div
      className="fixed inset-0 bg-navy/55 backdrop-blur-sm flex items-end md:items-center justify-center z-[60] p-0 md:p-5"
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div className="bg-surface w-full md:max-w-[520px] h-[90vh] md:h-auto md:max-h-[80vh] rounded-t-2xl md:rounded-2xl overflow-hidden shadow-2xl flex flex-col">
        <div className="px-5 pt-4 pb-3 border-b border-border flex-shrink-0">
          <div className="flex items-center justify-between gap-2">
            <div className="font-serif text-[18px] font-medium tracking-tightest text-ink">일반 재료 선택</div>
            <button
              onClick={() => setCreating(true)}
              className="text-[12px] text-accent font-bold hover:underline whitespace-nowrap"
            >＋ 새 재료 추가</button>
          </div>
        </div>

        <div className="px-5 pt-3 pb-2 border-b border-border flex flex-col gap-2 flex-shrink-0">
          <SearchBox
            value={query}
            onChange={setQuery}
            placeholder="재료명 검색"
            count={filtered.length}
            total={raws.length}
          />
          {categories.length > 1 && (
            <div className="overflow-x-auto -mx-5 px-5 pb-1">
              <div className="flex gap-1.5 min-w-max">
                {[
                  { value: 'all', label: '전체', count: raws.length },
                  ...categories.map((c) => ({ value: c.name, label: c.name, count: c.count })),
                ].map((it) => {
                  const isActive = activeCategory === it.value;
                  return (
                    <button
                      key={it.value}
                      onClick={() => setActiveCategory(it.value)}
                      className={[
                        'px-3 py-1 rounded-full text-[12px] font-bold tracking-tighter flex items-center gap-1.5 whitespace-nowrap flex-shrink-0',
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
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto min-h-0">
          {filtered.length === 0 ? (
            <div className="px-6 py-10 text-center text-[13px] text-ink-3">
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
                  className="w-full px-5 py-2.5 flex items-baseline justify-between gap-3 hover:bg-surface-alt text-left border-b border-border last:border-b-0"
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

        <div className="px-5 py-2.5 border-t border-border flex-shrink-0">
          <button onClick={onCancel} className="w-full py-2 text-[13px] font-bold text-ink-3 hover:text-ink">취소</button>
        </div>
      </div>
    </div>
  );
}

// ============================================
// 재료 즉석 생성 폼 (간소화 버전)
// ============================================
function RawCreateForm({
  defaultName, existingCategories, onCancel, onCreated,
}: {
  defaultName: string;
  existingCategories: string[];
  onCancel: () => void;
  onCreated: (rawId: string) => void;
}) {
  const [name, setName] = useState(defaultName);
  const [category, setCategory] = useState('');
  const [baseUnit, setBaseUnit] = useState<Unit>('g');
  const [purchaseQty, setPurchaseQty] = useState<string>('');
  const [purchaseUnit, setPurchaseUnit] = useState<Unit>('kg');
  const [purchasePrice, setPurchasePrice] = useState<string>('');
  const [shippingCost, setShippingCost] = useState<string>('');

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
    return getRawIngredientUnitCost({
      id: 'preview', name: 'preview',
      baseUnit, purchaseQty: qtyNum, purchaseUnit,
      purchasePrice: priceNum, shippingCost: shippingNum,
      createdAt: 0, updatedAt: 0,
    });
  }, [qtyNum, priceNum, shippingNum, baseUnit, purchaseUnit, purchaseQty, purchasePrice]);

  const canSave =
    name.trim().length > 0 &&
    purchaseQty !== '' && qtyNum > 0 &&
    purchasePrice !== '' && priceNum >= 0 &&
    isCompatibleUnit(baseUnit, purchaseUnit);

  const handleSubmit = () => {
    if (!canSave) return;
    const created = rawIngredientStore.create({
      name: name.trim(),
      category: category.trim() || undefined,
      baseUnit,
      purchaseQty: qtyNum,
      purchaseUnit,
      purchasePrice: priceNum,
      shippingCost: shippingNum,
    });
    onCreated(created.id);
  };

  return (
    <div
      className="fixed inset-0 bg-navy/55 backdrop-blur-sm flex items-end md:items-center justify-center z-[70] p-0 md:p-5"
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div className="bg-surface w-full md:max-w-[520px] h-[92vh] md:h-auto md:max-h-[92vh] rounded-t-2xl md:rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        <div className="px-5 pt-4 pb-3 border-b border-border flex-shrink-0">
          <div className="font-serif text-[20px] font-medium tracking-tightest text-ink">새 재료 추가</div>
          <div className="text-[11px] text-ink-3 mt-0.5">매입 단위 그대로 입력하면 단가는 자동 계산돼요</div>
        </div>

        <div className="flex-1 overflow-y-auto min-h-0 px-5 py-4 flex flex-col gap-3">
          <Field label="재료명" required>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="예: 고춧가루"
              className="w-full px-3 py-2.5 border border-border-strong rounded-[10px] text-[14px] text-ink outline-none focus:border-accent"
            />
          </Field>

          <Field label="분류 (선택)">
            <input
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="예: 양념, 채소"
              className="w-full px-3 py-2.5 border border-border-strong rounded-[10px] text-[14px] text-ink outline-none focus:border-accent"
            />
            {existingCategories.length > 0 && (
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
          </Field>

          <Field label="메뉴 레시피에서 사용할 단위" required>
            <div className="flex gap-2">
              {BASE_UNIT_OPTIONS.map((o) => (
                <button
                  type="button"
                  key={o.value}
                  onClick={() => setBaseUnit(o.value)}
                  className={[
                    'flex-1 py-2 px-2 rounded-[10px] text-[13px] font-bold border transition-colors text-center',
                    baseUnit === o.value ? 'bg-navy text-white border-navy' : 'bg-surface text-ink-2 border-border-strong hover:border-navy/40',
                  ].join(' ')}
                >
                  <div>{o.label}</div>
                  <div className={[
                    'text-[10px] font-normal',
                    baseUnit === o.value ? 'text-white/70' : 'text-ink-4',
                  ].join(' ')}>{o.hint}</div>
                </button>
              ))}
            </div>
          </Field>

          <div className="bg-surface-alt rounded-xl p-3 flex flex-col gap-2.5 border border-border">
            <div className="text-[11px] font-bold text-ink-2 tracking-tighter">📦 매입 정보</div>

            <div className="grid grid-cols-[1.4fr_1fr] gap-2">
              <Field label="매입 양" required>
                <input
                  type="number" inputMode="decimal" step="0.01" min="0"
                  value={purchaseQty}
                  onChange={(e) => setPurchaseQty(e.target.value)}
                  placeholder="예: 20"
                  className="w-full px-3 py-2 border border-border-strong rounded-lg text-[14px] outline-none focus:border-accent font-serif-num"
                />
              </Field>
              <Field label="단위" required>
                <select
                  value={purchaseUnit}
                  onChange={(e) => setPurchaseUnit(e.target.value as Unit)}
                  className="w-full px-3 py-2 border border-border-strong rounded-lg text-[14px] outline-none focus:border-accent bg-surface"
                >
                  {compatibleUnits.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </Field>
            </div>

            <Field label="매입 가격 (원)" required>
              <input
                type="number" inputMode="numeric" min="0"
                value={purchasePrice}
                onChange={(e) => setPurchasePrice(e.target.value)}
                placeholder="예: 260000"
                className="w-full px-3 py-2 border border-border-strong rounded-lg text-[14px] outline-none focus:border-accent font-serif-num"
              />
            </Field>

            <Field label="배송비 (원, 선택)">
              <input
                type="number" inputMode="numeric" min="0"
                value={shippingCost}
                onChange={(e) => setShippingCost(e.target.value)}
                placeholder="0"
                className="w-full px-3 py-2 border border-border-strong rounded-lg text-[14px] outline-none focus:border-accent font-serif-num"
              />
            </Field>
          </div>

          {preview !== null && (
            <div className="bg-accent-bg border border-accent/30 rounded-xl p-3 flex items-center justify-between">
              <div className="text-[11px] text-accent-dark font-bold tracking-[0.04em] uppercase">자동 계산</div>
              <div className="font-serif-num text-[20px] text-accent-dark">
                {preview < 1 ? preview.toFixed(2) : Math.round(preview).toLocaleString('ko-KR')}
                <span className="text-[12px] ml-0.5 text-ink-3 font-sans">원/{baseUnit}</span>
              </div>
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-border flex items-center justify-end gap-2 flex-shrink-0 bg-surface">
          <button onClick={onCancel} className="px-4 py-2 text-[13px] font-bold text-ink-3 hover:text-ink">취소</button>
          <button
            onClick={handleSubmit}
            disabled={!canSave}
            className="px-5 py-2 bg-navy text-white text-[13px] font-bold rounded-lg hover:bg-navy-dark disabled:opacity-40 disabled:cursor-not-allowed"
          >
            등록 후 자동 추가
          </button>
        </div>
      </div>
    </div>
  );
}
