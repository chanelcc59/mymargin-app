'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { rawIngredientStore, inventoryEventStore } from '@/lib/store';
import type {
  RawIngredient, InventoryEvent, InventoryEventType,
} from '@/types/domain';
import {
  calcAllCurrentStock, judgeStock, formatKRW, isRawNeedsInfo,
} from '@/lib/cost-engine';
import type { StockTier } from '@/lib/cost-engine';
import { SearchBox, CategoryChips } from '@/components/Filters';

const TIER_LABEL: Record<StockTier, string> = {
  none:  '미입력',
  short: '소진',
  low:   '부족',
  ok:    '충분',
};

const TIER_BADGE: Record<StockTier, string> = {
  none:  'bg-surface-alt text-ink-4',
  short: 'bg-alert-bg text-alert',
  low:   'bg-warning-bg text-warning',
  ok:    'bg-accent-bg text-accent',
};

const TYPE_LABEL: Record<InventoryEventType, string> = {
  purchase: '매입',
  count:    '실사',
  waste:    '폐기',
};

const TYPE_BADGE: Record<InventoryEventType, string> = {
  purchase: 'bg-accent-bg text-accent',
  count:    'bg-navy-bg text-navy',
  waste:    'bg-alert-bg text-alert',
};

function formatStock(qty: number, unit: string): string {
  if (qty === 0) return `0${unit}`;
  if (Math.abs(qty) < 1) return `${qty.toFixed(2)}${unit}`;
  return `${Math.round(qty).toLocaleString('ko-KR')}${unit}`;
}

export default function InventoryPage() {
  const [raws, setRaws] = useState<RawIngredient[]>([]);
  const [events, setEvents] = useState<InventoryEvent[]>([]);
  const [loaded, setLoaded] = useState(false);

  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [activeTier, setActiveTier] = useState<'all' | StockTier>('all');

  // 모달 상태: 어떤 작업으로 어떤 재료에 대해 입력 중인지
  const [modal, setModal] = useState<null | {
    type: InventoryEventType;
    rawId?: string; // 미리 선택된 재료 (재료 행에서 액션 클릭 시)
  }>(null);

  const reload = () => {
    setRaws(rawIngredientStore.list());
    setEvents(inventoryEventStore.list());
  };

  useEffect(() => {
    reload();
    setLoaded(true);
    const onFocus = () => reload();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);

  const stockMap = useMemo(() => calcAllCurrentStock(raws, events), [raws, events]);
  const eventCountByRaw = useMemo(() => {
    const m = new Map<string, number>();
    events.forEach((e) => m.set(e.rawId, (m.get(e.rawId) ?? 0) + 1));
    return m;
  }, [events]);

  const tierByRaw = useMemo(() => {
    const m = new Map<string, StockTier>();
    raws.forEach((r) => {
      const stock = stockMap.get(r.id) ?? 0;
      const has = (eventCountByRaw.get(r.id) ?? 0) > 0;
      m.set(r.id, judgeStock(r, stock, has));
    });
    return m;
  }, [raws, stockMap, eventCountByRaw]);

  const tierCounts = useMemo(() => {
    const c: Record<StockTier, number> = { none: 0, short: 0, low: 0, ok: 0 };
    tierByRaw.forEach((t) => { c[t]++; });
    return c;
  }, [tierByRaw]);

  const categories = useMemo(() => {
    const counts: Record<string, number> = {};
    raws.forEach((r) => {
      const c = r.category || '미분류';
      counts[c] = (counts[c] || 0) + 1;
    });
    const ORDER = ['양념', '떡·면', '어묵·순대', '튀김재료', '채소', '단백질', '완제품', '김밥재료', '음료', '기타', '미분류'];
    return Object.keys(counts)
      .sort((a, b) => {
        const ai = ORDER.indexOf(a);
        const bi = ORDER.indexOf(b);
        if (ai === -1 && bi === -1) return a.localeCompare(b, 'ko');
        if (ai === -1) return 1;
        if (bi === -1) return -1;
        return ai - bi;
      })
      .map((c) => ({ name: c, count: counts[c] }));
  }, [raws]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return raws.filter((r) => {
      if (activeCategory !== 'all') {
        const cat = r.category || '미분류';
        if (cat !== activeCategory) return false;
      }
      if (activeTier !== 'all' && tierByRaw.get(r.id) !== activeTier) return false;
      if (q) {
        const hay = (r.name + ' ' + (r.category || '')).toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [raws, query, activeCategory, activeTier, tierByRaw]);

  const recentEvents = useMemo(
    () => [...events].sort((a, b) => b.occurredAt - a.occurredAt).slice(0, 8),
    [events]
  );

  if (!loaded) return <div className="text-ink-3 text-sm">로딩 중...</div>;

  if (raws.length === 0) {
    return (
      <div className="bg-surface border border-dashed border-border-strong rounded-xl p-12 text-center">
        <div className="font-serif text-[20px] italic tracking-tighter text-ink mb-1">먼저 일반 재료부터 등록해주세요</div>
        <div className="text-[13px] text-ink-3 mb-4">재고 관리는 등록된 일반 재료를 기준으로 합니다.</div>
        <Link
          href="/owner/ingredients"
          className="inline-block px-4 py-2 bg-navy text-white text-[13px] font-bold rounded-lg hover:bg-navy-dark"
        >일반 재료 등록하러 가기 →</Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-serif text-[28px] md:text-[32px] font-medium tracking-tightest text-ink leading-tight">재고 · 매입</h1>
          <p className="text-ink-3 text-[13px] mt-1">매입·실사·폐기를 기록하면 현재고와 부족 알림이 자동 갱신돼요.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setModal({ type: 'purchase' })}
            className="px-4 py-2 bg-accent text-white text-[13px] font-bold rounded-lg hover:bg-accent-dark"
          >＋ 매입</button>
          <button
            onClick={() => setModal({ type: 'waste' })}
            className="px-4 py-2 border border-border-strong text-ink-2 text-[13px] font-bold rounded-lg hover:border-alert hover:text-alert"
          >폐기</button>
          <button
            onClick={() => setModal({ type: 'count' })}
            className="px-4 py-2 border border-border-strong text-ink-2 text-[13px] font-bold rounded-lg hover:border-navy hover:text-navy"
          >실사</button>
        </div>
      </div>

      {/* 부족·소진 요약 */}
      {(tierCounts.short > 0 || tierCounts.low > 0) && (
        <div className="grid grid-cols-2 gap-3">
          <SummaryTile
            label="소진 (재고 0)"
            value={tierCounts.short}
            tone="alert"
            onClick={() => setActiveTier('short')}
          />
          <SummaryTile
            label="부족 (매입 1회분의 20% 미만)"
            value={tierCounts.low}
            tone="warning"
            onClick={() => setActiveTier('low')}
          />
        </div>
      )}

      <div className="flex flex-col gap-3">
        <SearchBox
          value={query}
          onChange={setQuery}
          placeholder="재료명으로 검색"
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
        <div className="flex flex-wrap gap-1.5">
          {(['all', 'short', 'low', 'ok', 'none'] as const).map((t) => {
            const isActive = activeTier === t;
            const label = t === 'all' ? '전체 상태' : TIER_LABEL[t];
            const count = t === 'all' ? raws.length : tierCounts[t];
            return (
              <button
                key={t}
                onClick={() => setActiveTier(t)}
                className={[
                  'px-3 py-1.5 rounded-full text-[12px] font-bold tracking-tighter flex items-center gap-1.5 border',
                  isActive
                    ? 'bg-navy text-white border-navy'
                    : 'bg-surface text-ink-2 border-border hover:border-border-strong',
                ].join(' ')}
              >
                {label}
                <span className={[
                  'text-[10px] font-bold px-1.5 py-0 rounded-md tabular-nums',
                  isActive ? 'bg-white/20 text-white/90' : 'bg-surface-alt text-ink-3',
                ].join(' ')}>{count}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 재고 목록 */}
      {filtered.length === 0 ? (
        <div className="bg-surface border border-dashed border-border-strong rounded-xl p-8 text-center text-[13px] text-ink-3">
          조건에 맞는 재료가 없어요
        </div>
      ) : (
        <div className="bg-surface border border-border rounded-xl overflow-hidden">
          <div className="hidden md:grid md:grid-cols-[1.2fr_90px_1fr_1fr_180px] px-4 py-2.5 bg-surface-alt text-[11px] font-bold text-ink-3 tracking-[0.04em] uppercase border-b border-border">
            <div>재료명</div>
            <div>분류</div>
            <div className="text-right">현재고</div>
            <div className="text-right">상태</div>
            <div className="text-right">기록</div>
          </div>
          {filtered.map((r) => {
            const stock = stockMap.get(r.id) ?? 0;
            const tier = tierByRaw.get(r.id) ?? 'none';
            const eventCount = eventCountByRaw.get(r.id) ?? 0;
            const needsInfo = isRawNeedsInfo(r);
            return (
              <div
                key={r.id}
                className={[
                  'md:grid md:grid-cols-[1.2fr_90px_1fr_1fr_180px] flex flex-col md:items-center px-4 py-3 border-b border-border last:border-b-0 hover:bg-surface-alt transition-colors gap-2 md:gap-0',
                  tier === 'short' ? 'bg-alert-bg/20' :
                  tier === 'low'   ? 'bg-warning-bg/20' :
                  '',
                ].join(' ')}
              >
                <div className="font-semibold text-ink tracking-tighter">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span>{r.name}</span>
                    {needsInfo && (
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-warning text-white tracking-[0.04em]">정보 필요</span>
                    )}
                  </div>
                </div>
                <div className="text-[12px] text-ink-2">
                  {r.category ? (
                    <span className="px-2 py-0.5 bg-surface-alt rounded-md text-[11px] font-semibold">{r.category}</span>
                  ) : (
                    <span className="text-ink-4 text-[11px]">미분류</span>
                  )}
                </div>
                <div className="md:text-right font-serif-num">
                  {tier === 'none' ? (
                    <span className="text-ink-4 text-[12px] font-sans">기록 없음</span>
                  ) : (
                    <>
                      <span className="text-[15px] text-ink font-semibold">{formatStock(stock, '')}</span>
                      <span className="text-ink-3 text-[11px] ml-0.5 font-sans">{r.baseUnit}</span>
                    </>
                  )}
                </div>
                <div className="md:text-right">
                  <span className={['inline-block px-2 py-0.5 rounded-md text-[11px] font-bold', TIER_BADGE[tier]].join(' ')}>
                    {TIER_LABEL[tier]}
                  </span>
                </div>
                <div className="flex items-center md:justify-end gap-1.5 flex-wrap">
                  <button
                    onClick={() => setModal({ type: 'purchase', rawId: r.id })}
                    className="text-[11px] text-accent hover:underline px-2 py-1 font-bold"
                  >매입</button>
                  <button
                    onClick={() => setModal({ type: 'waste', rawId: r.id })}
                    className="text-[11px] text-alert hover:underline px-2 py-1 font-bold"
                  >폐기</button>
                  <button
                    onClick={() => setModal({ type: 'count', rawId: r.id })}
                    className="text-[11px] text-navy hover:underline px-2 py-1 font-bold"
                  >실사</button>
                  <span className="text-[10px] text-ink-4 font-serif-num">{eventCount}건</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 최근 이벤트 */}
      {recentEvents.length > 0 && (
        <div className="bg-surface border border-border rounded-2xl p-5">
          <div className="flex items-baseline justify-between mb-3">
            <div className="text-[15px] font-bold tracking-tighter text-ink">최근 기록</div>
            <div className="text-[11px] text-ink-3 font-serif-num">{events.length}건 누적</div>
          </div>
          <div className="flex flex-col divide-y divide-border">
            {recentEvents.map((e) => {
              const raw = raws.find((r) => r.id === e.rawId);
              return (
                <div key={e.id} className="flex items-baseline gap-3 py-2.5">
                  <span className={['text-[10px] font-bold px-1.5 py-0.5 rounded-md tracking-[0.04em] flex-shrink-0', TYPE_BADGE[e.type]].join(' ')}>
                    {TYPE_LABEL[e.type]}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-semibold text-ink tracking-tighter truncate">
                      {raw?.name ?? '(삭제된 재료)'}
                      <span className="text-ink-3 font-normal text-[11px] ml-2">
                        {e.type === 'count' ? '실사값 ' : ''}{formatStock(e.qty, raw?.baseUnit ?? '')}
                      </span>
                    </div>
                    {e.reason && <div className="text-[10px] text-ink-3">사유: {e.reason}</div>}
                  </div>
                  <div className="text-[10px] text-ink-3 font-serif-num flex-shrink-0">
                    {new Date(e.occurredAt).toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' })}
                    {' '}
                    {new Date(e.occurredAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                  </div>
                  <button
                    onClick={() => {
                      if (!confirm('이 기록을 삭제하시겠어요? 현재고가 다시 계산됩니다.')) return;
                      inventoryEventStore.delete(e.id);
                      reload();
                    }}
                    className="text-ink-4 hover:text-alert text-[14px] font-bold flex-shrink-0"
                    aria-label="기록 삭제"
                  >×</button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {modal && (
        <EventModal
          type={modal.type}
          raws={raws}
          stockMap={stockMap}
          presetRawId={modal.rawId}
          onCancel={() => setModal(null)}
          onSave={(input) => {
            inventoryEventStore.create(input);
            reload();
            setModal(null);
          }}
        />
      )}
    </div>
  );
}

function SummaryTile({
  label, value, tone, onClick,
}: {
  label: string;
  value: number;
  tone: 'alert' | 'warning';
  onClick?: () => void;
}) {
  const cls =
    tone === 'alert'   ? 'bg-alert-bg border-alert/30 text-alert' :
                         'bg-warning-bg border-warning/30 text-warning';
  return (
    <button
      onClick={onClick}
      className={['rounded-2xl border p-4 text-left hover:opacity-90 transition-opacity', cls].join(' ')}
    >
      <div className="text-[11px] font-bold tracking-[0.04em] uppercase">{label}</div>
      <div className="font-serif-num text-[28px] mt-1 leading-none">{value}<span className="text-[12px] ml-1">건</span></div>
    </button>
  );
}

// ============================================
// 이벤트 입력 모달 (매입 / 폐기 / 실사 공용)
// ============================================
function EventModal({
  type, raws, stockMap, presetRawId, onCancel, onSave,
}: {
  type: InventoryEventType;
  raws: RawIngredient[];
  stockMap: Map<string, number>;
  presetRawId?: string;
  onCancel: () => void;
  onSave: (input: Omit<InventoryEvent, 'id' | 'createdAt'>) => void;
}) {
  const [rawId, setRawId] = useState<string>(presetRawId ?? raws[0]?.id ?? '');
  const [qty, setQty] = useState<string>('');
  const [reason, setReason] = useState<string>('');
  const [pickerQuery, setPickerQuery] = useState('');

  const raw = raws.find((r) => r.id === rawId) ?? null;
  const currentStock = raw ? (stockMap.get(raw.id) ?? 0) : 0;
  const qtyNum = Number(qty);
  const canSave = !!raw && qty !== '' && qtyNum >= 0 && (type !== 'purchase' || qtyNum > 0) && (type !== 'waste' || qtyNum > 0);

  const filteredRaws = useMemo(() => {
    const q = pickerQuery.trim().toLowerCase();
    if (!q) return raws;
    return raws.filter((r) => r.name.toLowerCase().includes(q) || (r.category || '').toLowerCase().includes(q));
  }, [raws, pickerQuery]);

  const TITLE: Record<InventoryEventType, string> = {
    purchase: '매입 기록',
    count:    '실사 기록',
    waste:    '폐기 기록',
  };
  const HINT: Record<InventoryEventType, string> = {
    purchase: '들어온 양을 입력하세요. 현재고에 더해집니다.',
    count:    '지금 실제로 남아있는 양을 입력하세요. 누적 계산이 이 값으로 리셋됩니다.',
    waste:    '버리는 양과 사유를 입력하세요. 현재고에서 빠집니다.',
  };

  const handleSubmit = () => {
    if (!canSave || !raw) return;
    onSave({
      rawId: raw.id,
      type,
      qty: qtyNum,
      reason: reason.trim() || undefined,
      occurredAt: Date.now(),
    });
  };

  return (
    <div
      className="fixed inset-0 bg-navy/45 backdrop-blur-sm flex items-end md:items-center justify-center z-50 p-0 md:p-5"
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div className="bg-surface w-full md:max-w-[480px] max-h-[92vh] rounded-t-2xl md:rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        <div className="px-5 pt-4 pb-3 border-b border-border flex-shrink-0">
          <div className="font-serif text-[20px] font-medium tracking-tightest text-ink">{TITLE[type]}</div>
          <div className="text-[11px] text-ink-3 mt-0.5">{HINT[type]}</div>
        </div>

        <div className="flex-1 overflow-y-auto min-h-0 px-5 py-4 flex flex-col gap-3">
          {/* 재료 선택: presetRawId 있으면 고정 표시, 없으면 검색 */}
          {presetRawId && raw ? (
            <div className="bg-surface-alt rounded-xl p-3 border border-border">
              <div className="text-[10px] text-ink-3 font-bold tracking-[0.04em] uppercase mb-1">대상 재료</div>
              <div className="text-[15px] font-bold text-ink tracking-tighter">{raw.name}</div>
              {raw.category && <div className="text-[11px] text-ink-3 mt-0.5">{raw.category}</div>}
            </div>
          ) : (
            <div>
              <label className="block text-[12px] font-semibold text-ink-2 tracking-tighter mb-1.5">재료 선택<span className="text-accent ml-0.5">*</span></label>
              <input
                value={pickerQuery}
                onChange={(e) => setPickerQuery(e.target.value)}
                placeholder="재료명 검색"
                className="w-full px-3 py-2 border border-border-strong rounded-lg text-[14px] outline-none focus:border-accent mb-2"
              />
              <div className="border border-border rounded-lg max-h-[200px] overflow-y-auto">
                {filteredRaws.length === 0 ? (
                  <div className="px-3 py-4 text-center text-[12px] text-ink-3">검색 결과 없음</div>
                ) : (
                  filteredRaws.map((r) => (
                    <button
                      key={r.id}
                      onClick={() => setRawId(r.id)}
                      className={[
                        'w-full px-3 py-2 text-left flex items-baseline justify-between gap-2 border-b border-border last:border-b-0',
                        rawId === r.id ? 'bg-navy-bg' : 'hover:bg-surface-alt',
                      ].join(' ')}
                    >
                      <span className="text-[13px] font-semibold text-ink tracking-tighter">{r.name}</span>
                      <span className="text-[10px] text-ink-3">{r.category || '미분류'} · 현재 {formatStock(stockMap.get(r.id) ?? 0, r.baseUnit)}</span>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}

          {raw && (
            <div className="text-[11px] text-ink-3 px-1">
              현재고:{' '}
              <span className="font-serif-num font-bold text-ink-2">{formatStock(currentStock, raw.baseUnit)}</span>
            </div>
          )}

          <div>
            <label className="block text-[12px] font-semibold text-ink-2 tracking-tighter mb-1.5">
              {type === 'count' ? '지금 남은 양' : type === 'purchase' ? '들어온 양' : '버린 양'}
              <span className="text-accent ml-0.5">*</span>
            </label>
            <div className="flex items-center gap-2">
              <input
                autoFocus
                type="number" inputMode="decimal" step="0.1" min="0"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                placeholder="0"
                className="flex-1 px-3 py-2.5 border border-border-strong rounded-lg text-[16px] text-right outline-none focus:border-accent font-serif-num"
              />
              <span className="text-[14px] text-ink-3 font-bold">{raw?.baseUnit ?? ''}</span>
            </div>
            {type === 'count' && raw && qty !== '' && (
              <div className="text-[11px] text-ink-3 mt-1.5">
                차이: <span className={qtyNum >= currentStock ? 'text-accent' : 'text-alert'}>
                  {qtyNum >= currentStock ? '+' : ''}{formatStock(qtyNum - currentStock, raw.baseUnit)}
                </span>
                <span className="text-ink-4 ml-1">(이 값이 새 누적 기준점이 됩니다)</span>
              </div>
            )}
            {type === 'purchase' && raw && raw.purchaseQty > 0 && (
              <div className="text-[11px] text-ink-3 mt-1.5">
                평소 매입: {raw.purchaseQty}{raw.purchaseUnit}
              </div>
            )}
          </div>

          {type === 'waste' && (
            <div>
              <label className="block text-[12px] font-semibold text-ink-2 tracking-tighter mb-1.5">사유 (선택)</label>
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="예: 유통기한 / 떨어뜨림 / 시식"
                className="w-full px-3 py-2.5 border border-border-strong rounded-lg text-[14px] outline-none focus:border-accent"
              />
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
            저장
          </button>
        </div>
      </div>
    </div>
  );
}
