'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { rawIngredientStore, prepItemStore, menuStore, inventoryEventStore, saleStore } from '@/lib/store';
import type { RawIngredient, PrepItem, Menu, InventoryEvent, SaleEntry } from '@/types/domain';
import {
  analyzeLoss, summarizeLoss, formatKRW,
} from '@/lib/cost-engine';
import type { LossAnalysisRow } from '@/lib/cost-engine';
import { SearchBox } from '@/components/Filters';

type RangePreset = 'today' | 'thisWeek' | 'lastWeek' | 'thisMonth' | 'custom';

function todayLocal(): string {
  return formatYMD(new Date());
}

function formatYMD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function ymdToDate(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function startOfDayMs(ymd: string): number {
  const d = ymdToDate(ymd);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function endOfDayMs(ymd: string): number {
  const d = ymdToDate(ymd);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

function presetRange(preset: RangePreset): { from: string; to: string } {
  const today = new Date();
  if (preset === 'today') {
    const d = formatYMD(today);
    return { from: d, to: d };
  }
  if (preset === 'thisWeek') {
    // 이번 주 (월~일)
    const day = today.getDay() || 7; // sunday=0 → 7
    const monday = new Date(today);
    monday.setDate(today.getDate() - (day - 1));
    return { from: formatYMD(monday), to: formatYMD(today) };
  }
  if (preset === 'lastWeek') {
    const day = today.getDay() || 7;
    const lastMonday = new Date(today);
    lastMonday.setDate(today.getDate() - (day - 1) - 7);
    const lastSunday = new Date(lastMonday);
    lastSunday.setDate(lastMonday.getDate() + 6);
    return { from: formatYMD(lastMonday), to: formatYMD(lastSunday) };
  }
  if (preset === 'thisMonth') {
    const first = new Date(today.getFullYear(), today.getMonth(), 1);
    return { from: formatYMD(first), to: formatYMD(today) };
  }
  return { from: formatYMD(today), to: formatYMD(today) };
}

function formatStock(qty: number, unit: string): string {
  if (qty === 0) return `0${unit}`;
  if (Math.abs(qty) < 1) return `${qty.toFixed(2)}${unit}`;
  return `${Math.round(qty).toLocaleString('ko-KR')}${unit}`;
}

export default function LossPage() {
  const [raws, setRaws] = useState<RawIngredient[]>([]);
  const [preps, setPreps] = useState<PrepItem[]>([]);
  const [menus, setMenus] = useState<Menu[]>([]);
  const [events, setEvents] = useState<InventoryEvent[]>([]);
  const [sales, setSales] = useState<SaleEntry[]>([]);
  const [loaded, setLoaded] = useState(false);

  const [preset, setPreset] = useState<RangePreset>('thisWeek');
  const [customRange, setCustomRange] = useState<{ from: string; to: string }>(() => presetRange('thisWeek'));
  const [query, setQuery] = useState('');
  const [hideEmpty, setHideEmpty] = useState(true);

  const reload = () => {
    setRaws(rawIngredientStore.list());
    setPreps(prepItemStore.list());
    setMenus(menuStore.list());
    setEvents(inventoryEventStore.list());
    setSales(saleStore.list());
  };

  useEffect(() => {
    reload();
    setLoaded(true);
    const onFocus = () => reload();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);

  // preset 변경시 customRange도 갱신
  useEffect(() => {
    if (preset !== 'custom') setCustomRange(presetRange(preset));
  }, [preset]);

  const range = useMemo(() => ({
    fromDate: customRange.from,
    toDate: customRange.to,
    fromMs: startOfDayMs(customRange.from),
    toMs: endOfDayMs(customRange.to),
  }), [customRange]);

  const rows = useMemo(
    () => analyzeLoss(raws, preps, menus, events, sales, range),
    [raws, preps, menus, events, sales, range]
  );

  const summary = useMemo(() => summarizeLoss(rows), [rows]);

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows
      .filter((r) => {
        if (q && !r.rawName.toLowerCase().includes(q)) return false;
        if (hideEmpty) {
          const hasAny = r.purchase > 0 || r.waste > 0 || r.theoretical > 0 || r.startStock !== 0 || r.endStock !== 0;
          if (!hasAny) return false;
        }
        return true;
      })
      // 설명 안 되는 로스 금액 큰 순
      .sort((a, b) => b.unexplainedLossCost - a.unexplainedLossCost);
  }, [rows, query, hideEmpty]);

  if (!loaded) return <div className="text-ink-3 text-sm">로딩 중...</div>;

  if (raws.length === 0) {
    return (
      <div className="bg-surface border border-dashed border-border-strong rounded-xl p-12 text-center">
        <div className="font-serif text-[20px] italic tracking-tighter text-ink mb-1">먼저 일반 재료부터 등록해주세요</div>
        <div className="text-[13px] text-ink-3 mb-4">로스 분석은 등록된 재료를 기준으로 합니다.</div>
        <Link href="/owner/ingredients" className="inline-block px-4 py-2 bg-navy text-white text-[13px] font-bold rounded-lg hover:bg-navy-dark">일반 재료 등록 →</Link>
      </div>
    );
  }

  const noData = events.length === 0 && sales.length === 0;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="font-serif text-[28px] md:text-[32px] font-medium tracking-tightest text-ink leading-tight">로스 분석</h1>
        <p className="text-ink-3 text-[13px] mt-1">이론 소모량과 실제 감소량을 비교해 "설명 안 되는 로스"를 찾아냅니다.</p>
      </div>

      {/* 기간 선택 */}
      <div className="bg-surface border border-border rounded-2xl p-4 flex flex-col gap-3">
        <div className="flex flex-wrap gap-1.5">
          {([
            { v: 'today',     l: '오늘' },
            { v: 'thisWeek',  l: '이번 주' },
            { v: 'lastWeek',  l: '지난 주' },
            { v: 'thisMonth', l: '이번 달' },
            { v: 'custom',    l: '직접 선택' },
          ] as Array<{ v: RangePreset; l: string }>).map((p) => (
            <button
              key={p.v}
              onClick={() => setPreset(p.v)}
              className={[
                'px-3 py-1.5 rounded-full text-[12px] font-bold tracking-tighter border',
                preset === p.v ? 'bg-navy text-white border-navy' : 'bg-surface text-ink-2 border-border hover:border-border-strong',
              ].join(' ')}
            >{p.l}</button>
          ))}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <input
            type="date"
            value={customRange.from}
            onChange={(e) => { if (e.target.value) { setCustomRange((r) => ({ ...r, from: e.target.value })); setPreset('custom'); } }}
            className="px-3 py-1.5 border border-border-strong rounded-lg text-[13px] font-bold text-ink outline-none focus:border-accent font-serif-num"
          />
          <span className="text-ink-3">~</span>
          <input
            type="date"
            value={customRange.to}
            onChange={(e) => { if (e.target.value) { setCustomRange((r) => ({ ...r, to: e.target.value })); setPreset('custom'); } }}
            className="px-3 py-1.5 border border-border-strong rounded-lg text-[13px] font-bold text-ink outline-none focus:border-accent font-serif-num"
          />
          <span className="text-[11px] text-ink-3 ml-1">
            {Math.max(1, Math.round((endOfDayMs(customRange.to) - startOfDayMs(customRange.from)) / 86400000) + 1)}일
          </span>
        </div>
      </div>

      {noData ? (
        <div className="bg-surface border border-dashed border-border-strong rounded-xl p-10 text-center">
          <div className="font-serif text-[18px] italic tracking-tighter text-ink mb-1">아직 분석할 데이터가 없어요</div>
          <div className="text-[12px] text-ink-3 mb-4">
            <Link href="/owner/inventory" className="underline font-bold text-navy">재고·매입</Link> 에서 매입·실사·폐기를 기록하고,{' '}
            <Link href="/owner/sales" className="underline font-bold text-navy">판매 입력</Link> 에서 판매 수량을 기록한 뒤 다시 와보세요.
          </div>
        </div>
      ) : (
        <>
          {/* 종합 요약 */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <SummaryCard
              label="설명 안 되는 로스"
              value={`${formatKRW(summary.totalUnexplainedLossCost)}`}
              suffix="원"
              tone={summary.totalUnexplainedLossCost > 0 ? 'alert' : 'ok'}
            />
            <SummaryCard
              label="로스 발견 재료"
              value={String(summary.rowsWithLoss)}
              suffix="종"
              tone={summary.rowsWithLoss > 0 ? 'warning' : 'ok'}
            />
            <SummaryCard
              label="기간 폐기 합 (설명 가능)"
              value={String(summary.totalWaste)}
              suffix="단위"
              tone="default"
              hint="재료 단위가 다르므로 단순 합계입니다"
            />
            <SummaryCard
              label="분석 가능 재료"
              value={`${summary.rowsWithData}/${rows.length}`}
              suffix="종"
              tone="default"
            />
          </div>

          {summary.warningCount > 0 && (
            <div className="bg-warning-bg border border-warning/30 rounded-xl p-3 text-[12px] text-warning">
              ⚠ {summary.warningCount}개 재료는 분석 기간 내에 실사 기록이 있어 정확도가 떨어질 수 있습니다 (실사가 누적 기준점을 리셋하기 때문).
            </div>
          )}

          {/* 검색·필터 */}
          <div className="flex flex-col gap-2">
            <SearchBox
              value={query}
              onChange={setQuery}
              placeholder="재료명 검색"
              count={filteredRows.length}
              total={rows.length}
            />
            <label className="self-start flex items-center gap-2 text-[12px] font-bold text-ink-3 cursor-pointer">
              <input
                type="checkbox"
                checked={hideEmpty}
                onChange={(e) => setHideEmpty(e.target.checked)}
                className="w-4 h-4 accent-navy"
              />
              데이터 없는 재료 숨기기
            </label>
          </div>

          {/* 재료별 분석 표 */}
          <div className="bg-surface border border-border rounded-xl overflow-x-auto">
            <table className="w-full text-[12px] min-w-[900px]">
              <thead className="bg-surface-alt text-[10px] font-bold text-ink-3 tracking-[0.04em] uppercase">
                <tr>
                  <th className="text-left px-3 py-2.5">재료</th>
                  <th className="text-right px-2 py-2.5">기초</th>
                  <th className="text-right px-2 py-2.5">매입</th>
                  <th className="text-right px-2 py-2.5">기말</th>
                  <th className="text-right px-2 py-2.5">실제 감소</th>
                  <th className="text-right px-2 py-2.5">이론</th>
                  <th className="text-right px-2 py-2.5">폐기</th>
                  <th className="text-right px-2 py-2.5 bg-alert-bg/40">설명 안 되는</th>
                  <th className="text-right px-3 py-2.5 bg-alert-bg/40">손실 금액</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-6 py-8 text-center text-[13px] text-ink-3">조건에 맞는 재료가 없어요</td>
                  </tr>
                ) : filteredRows.map((r) => <LossRow key={r.rawId} row={r} />)}
              </tbody>
            </table>
          </div>

          <div className="text-[11px] text-ink-3 leading-relaxed">
            <strong className="text-ink-2">계산식</strong> · 실제 감소 = 기초재고 + 매입 − 기말재고 / 설명 안 되는 로스 = 실제 감소 − 이론 − 폐기 / 손실 금액 = max(0, 설명 안 되는 로스) × 단가
          </div>
        </>
      )}
    </div>
  );
}

function LossRow({ row }: { row: LossAnalysisRow }) {
  const u = row.unit;
  const unexpTone =
    row.unexplainedLoss > 0 ? 'text-alert' :
    row.unexplainedLoss < 0 ? 'text-accent' :
                              'text-ink-3';
  return (
    <tr className={['border-t border-border', row.unexplainedLossCost > 0 ? 'bg-alert-bg/10' : ''].join(' ')}>
      <td className="px-3 py-2.5">
        <div className="font-semibold text-ink tracking-tighter">{row.rawName}</div>
        {row.hasMidCount && (
          <div className="text-[10px] text-warning font-bold">⚠ 기간 내 실사 있음</div>
        )}
      </td>
      <td className="text-right px-2 py-2.5 font-serif-num text-ink-2">{formatStock(row.startStock, u)}</td>
      <td className="text-right px-2 py-2.5 font-serif-num text-accent">{row.purchase > 0 ? `+${formatStock(row.purchase, u)}` : '-'}</td>
      <td className="text-right px-2 py-2.5 font-serif-num text-ink-2">{formatStock(row.endStock, u)}</td>
      <td className="text-right px-2 py-2.5 font-serif-num text-ink-2 font-bold">{formatStock(row.actualDecrease, u)}</td>
      <td className="text-right px-2 py-2.5 font-serif-num text-ink-3">{row.theoretical > 0 ? formatStock(row.theoretical, u) : '-'}</td>
      <td className="text-right px-2 py-2.5 font-serif-num text-ink-3">{row.waste > 0 ? formatStock(row.waste, u) : '-'}</td>
      <td className={['text-right px-2 py-2.5 font-serif-num font-bold bg-alert-bg/20', unexpTone].join(' ')}>
        {row.unexplainedLoss !== 0 ? `${row.unexplainedLoss > 0 ? '+' : ''}${formatStock(row.unexplainedLoss, u)}` : '-'}
      </td>
      <td className="text-right px-3 py-2.5 font-serif-num font-bold text-alert bg-alert-bg/20">
        {row.unexplainedLossCost > 0 ? `${formatKRW(row.unexplainedLossCost)}원` : '-'}
      </td>
    </tr>
  );
}

function SummaryCard({
  label, value, suffix, tone, hint,
}: {
  label: string;
  value: string;
  suffix: string;
  tone: 'alert' | 'warning' | 'ok' | 'default';
  hint?: string;
}) {
  const cls =
    tone === 'alert'   ? 'border-alert/30 bg-alert-bg/40' :
    tone === 'warning' ? 'border-warning/30 bg-warning-bg/40' :
    tone === 'ok'      ? 'border-accent/30 bg-accent-bg/40' :
                         'border-border bg-surface';
  const valueCls =
    tone === 'alert'   ? 'text-alert' :
    tone === 'warning' ? 'text-warning' :
    tone === 'ok'      ? 'text-accent' :
                         'text-ink';
  return (
    <div className={['rounded-2xl border p-4', cls].join(' ')}>
      <div className="text-[10px] font-bold text-ink-3 tracking-[0.04em] uppercase">{label}</div>
      <div className={['font-serif-num text-[24px] mt-1 leading-none', valueCls].join(' ')}>
        {value}<span className="text-[12px] ml-1 text-ink-3 font-sans">{suffix}</span>
      </div>
      {hint && <div className="text-[10px] text-ink-3 mt-1.5">{hint}</div>}
    </div>
  );
}
