'use client';

import { useEffect, useMemo, useState } from 'react';
import { rawIngredientStore } from '@/lib/store';
import type { RawIngredient, Unit } from '@/types/domain';
import {
  formatKRW,
  getRawIngredientUnitCost,
  isCompatibleUnit,
} from '@/lib/cost-engine';
import { SearchBox, CategoryChips } from '@/components/Filters';

// 메뉴 레시피에서 사용할 기본 단위 (사장님이 g/ml/개 중 선택)
const BASE_UNIT_OPTIONS: Array<{ value: Unit; label: string; hint: string }> = [
  { value: 'g',  label: 'g',  hint: '무게 (그램)' },
  { value: 'ml', label: 'ml', hint: '부피 (밀리리터)' },
  { value: 'ea', label: '개', hint: '낱개 (셀 수 있는 것)' },
];

// 매입 단위 (사장님이 평소 매입하는 단위)
const PURCHASE_UNIT_OPTIONS: Array<{ value: Unit; label: string }> = [
  { value: 'g', label: 'g' },
  { value: 'kg', label: 'kg' },
  { value: 'ml', label: 'ml' },
  { value: 'l', label: 'L' },
  { value: 'ea', label: '개' },
  { value: 'pack', label: '팩' },
];

// 기본 단위에 호환되는 매입 단위만 필터
function compatiblePurchaseUnits(baseUnit: Unit): Array<{ value: Unit; label: string }> {
  if (baseUnit === 'g') return [
    { value: 'g', label: 'g' },
    { value: 'kg', label: 'kg' },
  ];
  if (baseUnit === 'ml') return [
    { value: 'ml', label: 'ml' },
    { value: 'l', label: 'L' },
  ];
  if (baseUnit === 'ea') return [
    { value: 'ea', label: '개' },
    { value: 'pack', label: '팩' },
  ];
  return PURCHASE_UNIT_OPTIONS;
}

export default function IngredientsPage() {
  const [list, setList] = useState<RawIngredient[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [editing, setEditing] = useState<RawIngredient | null>(null);
  const [showForm, setShowForm] = useState(false);

  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('all');

  const reload = () => setList(rawIngredientStore.list());

  useEffect(() => {
    reload();
    setLoaded(true);
    const onFocus = () => reload();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);

  const categories = useMemo(() => {
    const counts: Record<string, number> = {};
    list.forEach((r) => {
      const c = r.category || '미분류';
      counts[c] = (counts[c] || 0) + 1;
    });
    const ORDER = ['양념', '떡·면', '어묵·순대', '튀김재료', '채소', '단백질', '완제품', '김밥재료', '음료', '기타', '미분류'];
    const found = Object.keys(counts);
    found.sort((a, b) => {
      const ai = ORDER.indexOf(a);
      const bi = ORDER.indexOf(b);
      if (ai === -1 && bi === -1) return a.localeCompare(b, 'ko');
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    });
    return found.map((c) => ({ name: c, count: counts[c] }));
  }, [list]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return list.filter((r) => {
      if (activeCategory !== 'all') {
        const cat = r.category || '미분류';
        if (cat !== activeCategory) return false;
      }
      if (q) {
        const hay = (r.name + ' ' + (r.note || '') + ' ' + (r.category || '')).toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [list, query, activeCategory]);

  const handleSave = (data: Omit<RawIngredient, 'id' | 'createdAt' | 'updatedAt'>) => {
    if (editing) {
      rawIngredientStore.update(editing.id, data);
    } else {
      rawIngredientStore.create(data);
    }
    setShowForm(false);
    setEditing(null);
    reload();
  };

  const handleDelete = (id: string) => {
    if (!confirm('삭제하시겠어요? 이 재료를 사용하는 준비재료/메뉴의 원가가 0으로 계산됩니다.')) return;
    rawIngredientStore.delete(id);
    reload();
  };

  if (!loaded) return <div className="text-ink-3 text-sm">로딩 중...</div>;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="일반 재료"
        subtitle="매입 단위 그대로 입력하세요. 단위당 단가는 자동 계산됩니다."
        action={
          <button
            onClick={() => { setEditing(null); setShowForm(true); }}
            className="px-4 py-2 bg-navy text-white text-[13px] font-bold rounded-lg hover:bg-navy-dark transition-colors"
          >
            ＋ 재료 추가
          </button>
        }
      />

      {list.length === 0 ? (
        <EmptyState />
      ) : (
        <>
          <div className="flex flex-col gap-3">
            <SearchBox
              value={query}
              onChange={setQuery}
              placeholder="재료명 또는 메모로 검색"
              count={filtered.length}
              total={list.length}
            />
            {categories.length > 1 && (
              <CategoryChips
                items={[
                  { value: 'all', label: '전체', count: list.length },
                  ...categories.map((c) => ({ value: c.name, label: c.name, count: c.count })),
                ]}
                active={activeCategory}
                onChange={setActiveCategory}
              />
            )}
          </div>

          {filtered.length === 0 ? (
            <div className="bg-surface border border-dashed border-border-strong rounded-xl p-8 text-center text-[13px] text-ink-3">
              조건에 맞는 재료가 없어요
            </div>
          ) : (
            <div className="bg-surface border border-border rounded-xl overflow-hidden">
              <div className="hidden md:grid md:grid-cols-[1.2fr_90px_1.4fr_1fr_80px] px-4 py-2.5 bg-surface-alt text-[11px] font-bold text-ink-3 tracking-[0.04em] uppercase border-b border-border">
                <div>재료명</div>
                <div>분류</div>
                <div>매입</div>
                <div className="text-right">자동 단가</div>
                <div />
              </div>
              {filtered.map((r) => {
                const unitCost = getRawIngredientUnitCost(r);
                return (
                  <div
                    key={r.id}
                    className="md:grid md:grid-cols-[1.2fr_90px_1.4fr_1fr_80px] flex flex-col md:items-center px-4 py-3 border-b border-border last:border-b-0 hover:bg-surface-alt transition-colors gap-2 md:gap-0"
                  >
                    <div className="font-semibold text-ink tracking-tighter">
                      {r.name}
                      {r.note && <div className="text-[11px] text-ink-3 font-normal mt-0.5">{r.note}</div>}
                    </div>
                    <div className="text-[12px] text-ink-2">
                      {r.category ? (
                        <span className="px-2 py-0.5 bg-surface-alt rounded-md text-[11px] font-semibold">{r.category}</span>
                      ) : (
                        <span className="text-ink-4 text-[11px]">미분류</span>
                      )}
                    </div>
                    <div className="text-[12px] text-ink-2">
                      <span className="font-serif-num">{r.purchaseQty}{r.purchaseUnit}</span>
                      <span className="text-ink-4 mx-1">에</span>
                      <span className="font-serif-num font-semibold">{formatKRW(r.purchasePrice)}원</span>
                      {r.shippingCost > 0 && (
                        <span className="text-ink-4 text-[11px] ml-1">(+배송 {formatKRW(r.shippingCost)})</span>
                      )}
                    </div>
                    <div className="md:text-right font-serif-num">
                      <span className="text-[15px] text-accent font-semibold">
                        {unitCost < 1 ? unitCost.toFixed(2) : Math.round(unitCost).toLocaleString('ko-KR')}
                      </span>
                      <span className="text-ink-4 text-[11px] ml-0.5 font-sans">원/{r.baseUnit}</span>
                    </div>
                    <div className="flex items-center md:justify-end gap-1">
                      <button
                        onClick={() => { setEditing(r); setShowForm(true); }}
                        className="text-[12px] text-ink-3 hover:text-navy px-2 py-1 font-semibold"
                      >
                        수정
                      </button>
                      <button
                        onClick={() => handleDelete(r.id)}
                        className="text-[12px] text-ink-4 hover:text-alert px-2 py-1 font-semibold"
                      >
                        삭제
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {showForm && (
        <IngredientFormModal
          initial={editing}
          existingCategories={categories.map((c) => c.name).filter((c) => c !== '미분류')}
          onCancel={() => { setShowForm(false); setEditing(null); }}
          onSave={handleSave}
        />
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="bg-surface border border-dashed border-border-strong rounded-xl p-12 text-center">
      <div className="font-serif text-[20px] italic tracking-tighter text-ink mb-1">아직 등록된 재료가 없어요</div>
      <div className="text-[13px] text-ink-3">오른쪽 위 <strong>＋ 재료 추가</strong> 버튼으로 첫 재료를 등록해보세요.</div>
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
// 폼 모달 - 매입 단위 기반
// ============================================
function IngredientFormModal({
  initial,
  existingCategories,
  onCancel,
  onSave,
}: {
  initial: RawIngredient | null;
  existingCategories: string[];
  onCancel: () => void;
  onSave: (data: Omit<RawIngredient, 'id' | 'createdAt' | 'updatedAt'>) => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [category, setCategory] = useState(initial?.category ?? '');
  const [baseUnit, setBaseUnit] = useState<Unit>(initial?.baseUnit ?? 'g');
  const [purchaseQty, setPurchaseQty] = useState<string>(initial?.purchaseQty?.toString() ?? '');
  const [purchaseUnit, setPurchaseUnit] = useState<Unit>(initial?.purchaseUnit ?? 'kg');
  const [purchasePrice, setPurchasePrice] = useState<string>(initial?.purchasePrice?.toString() ?? '');
  const [shippingCost, setShippingCost] = useState<string>(initial?.shippingCost?.toString() ?? '');
  const [note, setNote] = useState(initial?.note ?? '');

  // 기본 단위가 바뀌면 매입 단위 호환 체크
  const compatibleUnits = compatiblePurchaseUnits(baseUnit);
  // 현재 매입 단위가 호환 안 되면 자동으로 첫 호환 단위로
  useEffect(() => {
    if (!compatibleUnits.find((u) => u.value === purchaseUnit)) {
      setPurchaseUnit(compatibleUnits[0].value);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseUnit]);

  const qtyNum = Number(purchaseQty);
  const priceNum = Number(purchasePrice);
  const shippingNum = Number(shippingCost) || 0;

  // 실시간 단가 계산 미리보기
  const preview = useMemo(() => {
    if (!purchaseQty || !purchasePrice || qtyNum <= 0 || priceNum < 0) return null;
    if (!isCompatibleUnit(baseUnit, purchaseUnit)) return null;
    const fakeRaw: RawIngredient = {
      id: 'preview',
      name: 'preview',
      baseUnit,
      purchaseQty: qtyNum,
      purchaseUnit,
      purchasePrice: priceNum,
      shippingCost: shippingNum,
      createdAt: 0,
      updatedAt: 0,
    };
    return getRawIngredientUnitCost(fakeRaw);
  }, [qtyNum, priceNum, shippingNum, baseUnit, purchaseUnit]);

  const canSave =
    name.trim().length > 0 &&
    purchaseQty !== '' && qtyNum > 0 &&
    purchasePrice !== '' && priceNum >= 0 &&
    isCompatibleUnit(baseUnit, purchaseUnit);

  const handleSubmit = () => {
    if (!canSave) return;
    onSave({
      name: name.trim(),
      category: category.trim() || undefined,
      baseUnit,
      purchaseQty: qtyNum,
      purchaseUnit,
      purchasePrice: priceNum,
      shippingCost: shippingNum,
      note: note.trim() || undefined,
    });
  };

  return (
    <div
      className="fixed inset-0 bg-navy/45 backdrop-blur-sm flex items-center md:items-center items-end justify-center z-50 p-0 md:p-5"
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div className="bg-surface w-full md:max-w-[520px] max-h-[92vh] overflow-y-auto rounded-t-2xl md:rounded-2xl shadow-2xl">
        <div className="px-6 pt-5 pb-4 border-b border-border sticky top-0 bg-surface z-10">
          <div className="font-serif text-[22px] font-medium tracking-tightest text-ink">
            {initial ? '재료 수정' : '재료 추가'}
          </div>
          <div className="text-[12px] text-ink-3 mt-0.5">
            매입 단위 그대로 입력하세요. 단가는 자동 계산됩니다.
          </div>
        </div>

        <div className="px-6 py-5 flex flex-col gap-4">
          <Field label="재료명" required>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="예: 고춧가루"
              className="w-full px-3 py-2.5 border border-border-strong rounded-[10px] text-[14px] text-ink outline-none focus:border-accent transition-colors"
            />
          </Field>

          <Field label="분류 (선택)">
            <input
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="예: 양념, 채소, 단백질"
              list="category-suggestions"
              className="w-full px-3 py-2.5 border border-border-strong rounded-[10px] text-[14px] text-ink outline-none focus:border-accent transition-colors"
            />
            {existingCategories.length > 0 && (
              <datalist id="category-suggestions">
                {existingCategories.map((c) => <option key={c} value={c} />)}
              </datalist>
            )}
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

          {/* 메뉴 레시피에서 쓸 단위 */}
          <Field label="메뉴 레시피에서 사용할 단위" required>
            <div className="flex gap-2">
              {BASE_UNIT_OPTIONS.map((o) => (
                <button
                  type="button"
                  key={o.value}
                  onClick={() => setBaseUnit(o.value)}
                  className={[
                    'flex-1 py-2.5 px-3 rounded-[10px] text-[13px] font-bold border transition-colors text-center',
                    baseUnit === o.value
                      ? 'bg-navy text-white border-navy'
                      : 'bg-surface text-ink-2 border-border-strong hover:border-navy/40',
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
            <div className="text-[11px] text-ink-3 mt-1.5">
              메뉴 레시피에 입력할 때 이 단위로 입력하게 됩니다 (예: 고춧가루 50<strong>{baseUnit}</strong>)
            </div>
          </Field>

          {/* 매입 정보 */}
          <div className="bg-surface-alt rounded-xl p-4 flex flex-col gap-3 border border-border">
            <div className="text-[12px] font-bold text-ink-2 tracking-tighter">📦 매입 정보</div>
            <div className="text-[11px] text-ink-3 -mt-2 leading-relaxed">
              평소 한 번 살 때 들어오는 양과 가격을 그대로 입력하세요
            </div>

            <div className="grid grid-cols-[1.4fr_1fr] gap-2">
              <Field label="매입 양" required dense>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0"
                  value={purchaseQty}
                  onChange={(e) => setPurchaseQty(e.target.value)}
                  placeholder="예: 20"
                  className="w-full px-3 py-2 border border-border-strong rounded-lg text-[14px] text-ink outline-none focus:border-accent font-serif-num"
                />
              </Field>
              <Field label="단위" required dense>
                <select
                  value={purchaseUnit}
                  onChange={(e) => setPurchaseUnit(e.target.value as Unit)}
                  className="w-full px-3 py-2 border border-border-strong rounded-lg text-[14px] text-ink outline-none focus:border-accent bg-surface"
                >
                  {compatibleUnits.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </Field>
            </div>

            <Field label="매입 가격 (원)" required dense>
              <input
                type="number"
                inputMode="numeric"
                min="0"
                value={purchasePrice}
                onChange={(e) => setPurchasePrice(e.target.value)}
                placeholder="예: 260000"
                className="w-full px-3 py-2 border border-border-strong rounded-lg text-[14px] text-ink outline-none focus:border-accent font-serif-num"
              />
            </Field>

            <Field label="배송비 (원, 선택)" dense>
              <input
                type="number"
                inputMode="numeric"
                min="0"
                value={shippingCost}
                onChange={(e) => setShippingCost(e.target.value)}
                placeholder="0"
                className="w-full px-3 py-2 border border-border-strong rounded-lg text-[14px] text-ink outline-none focus:border-accent font-serif-num"
              />
            </Field>
          </div>

          {/* 자동 계산 미리보기 */}
          {preview !== null && (
            <div className="bg-accent-bg border border-accent/30 rounded-xl p-4 flex items-center justify-between">
              <div>
                <div className="text-[11px] text-accent-dark font-bold tracking-[0.04em] uppercase">자동 계산 결과</div>
                <div className="text-[11px] text-ink-3 mt-0.5">
                  ({formatKRW(priceNum)}{shippingNum > 0 ? ` + 배송 ${formatKRW(shippingNum)}` : ''}) ÷ {qtyNum}{purchaseUnit}
                  {baseUnit !== purchaseUnit && ` (= ${(qtyNum * (purchaseUnit === 'kg' || purchaseUnit === 'l' ? 1000 : 1)).toLocaleString('ko-KR')}${baseUnit})`}
                </div>
              </div>
              <div className="text-right">
                <div className="font-serif-num text-[24px] text-accent-dark leading-none">
                  {preview < 1 ? preview.toFixed(2) : Math.round(preview).toLocaleString('ko-KR')}
                  <span className="text-[13px] ml-0.5 text-ink-3 font-sans">원/{baseUnit}</span>
                </div>
              </div>
            </div>
          )}

          <Field label="메모 (선택)">
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="예: 거래처 OO식자재"
              className="w-full px-3 py-2.5 border border-border-strong rounded-[10px] text-[14px] text-ink outline-none focus:border-accent transition-colors"
            />
          </Field>
        </div>

        <div className="px-6 py-4 border-t border-border flex items-center justify-end gap-2 sticky bottom-0 bg-surface">
          <button onClick={onCancel} className="px-4 py-2 text-[13px] font-bold text-ink-3 hover:text-ink">
            취소
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSave}
            className="px-5 py-2 bg-navy text-white text-[13px] font-bold rounded-lg hover:bg-navy-dark transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {initial ? '저장' : '등록'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, required, dense, children }: { label: string; required?: boolean; dense?: boolean; children: React.ReactNode }) {
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
