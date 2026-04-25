'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { rawIngredientStore, prepItemStore, menuStore, inventoryEventStore } from '@/lib/store';
import {
  calcAllChannelMargins,
  formatKRW,
  formatRate,
  judgeMargin,
  judgeMenuTier,
  isRawNeedsInfo,
  calcAllCurrentStock,
  judgeStock,
} from '@/lib/cost-engine';
import type { ChannelKey } from '@/types/domain';

export default function OwnerHomePage() {
  // client only: useState + useEffect
  const [loaded, setLoaded] = useState(false);
  const [rawCount, setRawCount] = useState(0);
  const [prepCount, setPrepCount] = useState(0);
  const [menuCount, setMenuCount] = useState(0);
  const [worstMenus, setWorstMenus] = useState<
    Array<{ menuId: string; name: string; channel: string; rate: number; profit: number }>
  >([]);
  const [bestMenus, setBestMenus] = useState<
    Array<{ menuId: string; name: string; bestRate: number; bestChannel: string; bestProfit: number }>
  >([]);
  const [channelAverages, setChannelAverages] = useState<
    Array<{ channel: ChannelKey; label: string; avgRate: number; count: number }>
  >([]);
  const [needsInfoCount, setNeedsInfoCount] = useState(0);
  const [shortStockCount, setShortStockCount] = useState(0);
  const [lowStockCount, setLowStockCount] = useState(0);

  useEffect(() => {
    const raws = rawIngredientStore.list();
    const preps = prepItemStore.list();
    const menus = menuStore.list();

    setRawCount(raws.length);
    setPrepCount(preps.length);
    setMenuCount(menus.length);
    setNeedsInfoCount(raws.filter(isRawNeedsInfo).length);

    // 재고 부족·소진 카운트
    const events = inventoryEventStore.list();
    const stockMap = calcAllCurrentStock(raws, events);
    const eventCountByRaw = new Map<string, number>();
    events.forEach((e) => eventCountByRaw.set(e.rawId, (eventCountByRaw.get(e.rawId) ?? 0) + 1));
    let short = 0, low = 0;
    raws.forEach((r) => {
      const tier = judgeStock(r, stockMap.get(r.id) ?? 0, (eventCountByRaw.get(r.id) ?? 0) > 0);
      if (tier === 'short') short++;
      else if (tier === 'low') low++;
    });
    setShortStockCount(short);
    setLowStockCount(low);

    // 채널별 공헌이익률 가장 낮은 3개
    const allMargins: Array<{ menuId: string; name: string; channel: string; rate: number; profit: number }> = [];
    // 채널별 평균 공헌이익률 누적용
    const channelAcc: Record<ChannelKey, { sum: number; count: number }> = {
      dine_in:  { sum: 0, count: 0 },
      takeout:  { sum: 0, count: 0 },
      delivery: { sum: 0, count: 0 },
    };
    // 메뉴 단위 베스트(추천 라벨 + 메뉴 내 최고 마진 채널)
    const perMenuBest: Array<{ menuId: string; name: string; bestRate: number; bestChannel: string; bestProfit: number }> = [];

    menus.forEach((m) => {
      const margins = calcAllChannelMargins(m, raws, preps);
      margins.forEach((mg) => {
        allMargins.push({
          menuId: m.id,
          name: m.name,
          channel: channelLabel(mg.channel),
          rate: mg.contributionMarginRate,
          profit: mg.contributionProfit,
        });
        channelAcc[mg.channel].sum += mg.contributionMarginRate;
        channelAcc[mg.channel].count += 1;
      });

      const tier = judgeMenuTier(m, raws, preps);
      if (tier === 'recommended' && margins.length > 0) {
        const top = margins.reduce((a, b) => (a.contributionMarginRate >= b.contributionMarginRate ? a : b));
        perMenuBest.push({
          menuId: m.id,
          name: m.name,
          bestRate: top.contributionMarginRate,
          bestChannel: channelLabel(top.channel),
          bestProfit: top.contributionProfit,
        });
      }
    });

    allMargins.sort((a, b) => a.rate - b.rate);
    setWorstMenus(allMargins.slice(0, 3));

    perMenuBest.sort((a, b) => b.bestRate - a.bestRate);
    setBestMenus(perMenuBest.slice(0, 3));

    setChannelAverages((['dine_in', 'takeout', 'delivery'] as const).map((ch) => ({
      channel: ch,
      label: channelLabel(ch),
      avgRate: channelAcc[ch].count > 0 ? channelAcc[ch].sum / channelAcc[ch].count : 0,
      count: channelAcc[ch].count,
    })));

    setLoaded(true);
  }, []);

  if (!loaded) {
    return <div className="text-ink-3 text-sm">로딩 중...</div>;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-serif text-[34px] font-medium tracking-[-0.035em] text-ink leading-[1.1]">
          안녕하세요, <em className="not-italic text-accent">김사장</em>님
        </h1>
        <p className="text-ink-3 text-[13px]">오늘도 마진을 챙기는 하루 되세요</p>
      </div>

      {/* 요약 카드 3개 */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <SummaryCard
          href="/owner/ingredients"
          label="일반 재료"
          value={rawCount}
          hint="등록된 기본 재료"
        />
        <SummaryCard
          href="/owner/prep-items"
          label="준비 재료"
          value={prepCount}
          hint="양념장·육수 등"
        />
        <SummaryCard
          href="/owner/menus"
          label="메뉴"
          value={menuCount}
          hint="채널별 마진 관리"
        />
      </div>

      {needsInfoCount > 0 && (
        <Link
          href="/owner/ingredients"
          className="bg-warning-bg border border-warning/40 rounded-2xl p-4 flex items-center justify-between gap-3 hover:border-warning transition-colors"
        >
          <div>
            <div className="text-[14px] font-bold tracking-tighter text-warning">
              매입 정보가 비어있는 재료 <span className="font-serif-num">{needsInfoCount}</span>개
            </div>
            <div className="text-[11px] text-ink-3 mt-0.5">단가가 0원으로 잡혀 메뉴 원가가 실제보다 낮게 계산되고 있어요</div>
          </div>
          <span className="text-warning font-bold text-[13px]">채우러 가기 →</span>
        </Link>
      )}

      {(shortStockCount > 0 || lowStockCount > 0) && (
        <Link
          href="/owner/inventory"
          className="bg-alert-bg border border-alert/40 rounded-2xl p-4 flex items-center justify-between gap-3 hover:border-alert transition-colors"
        >
          <div>
            <div className="text-[14px] font-bold tracking-tighter text-alert">
              {shortStockCount > 0 && <>소진 <span className="font-serif-num">{shortStockCount}</span>개 </>}
              {shortStockCount > 0 && lowStockCount > 0 && <span className="text-ink-3 font-normal">·</span>}
              {lowStockCount > 0 && <> 부족 <span className="font-serif-num">{lowStockCount}</span>개</>}
            </div>
            <div className="text-[11px] text-ink-3 mt-0.5">곧 발주가 필요한 재료가 있어요</div>
          </div>
          <span className="text-alert font-bold text-[13px]">재고 보기 →</span>
        </Link>
      )}

      {/* 채널별 평균 공헌이익률 비교 */}
      {channelAverages.some((c) => c.count > 0) && (
        <div className="bg-surface border border-border rounded-2xl p-5">
          <div className="flex items-baseline justify-between mb-3">
            <div className="text-[15px] font-bold tracking-tighter text-ink">채널 평균 공헌이익률</div>
            <div className="text-[11px] text-ink-3">활성 채널 기준</div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {channelAverages.map((c) => {
              const tier = judgeMargin(c.avgRate);
              const colorClass =
                c.count === 0 ? 'text-ink-4 bg-surface-alt/40' :
                tier === 'good' ? 'text-accent bg-accent-bg' :
                tier === 'mid'  ? 'text-warning bg-warning-bg' :
                                  'text-alert bg-alert-bg';
              return (
                <div key={c.channel} className="bg-surface-alt/40 rounded-xl p-3 text-center">
                  <div className="text-[11px] text-ink-3 font-bold">{c.label}</div>
                  <div className={['mt-1 inline-block px-2 py-0.5 rounded-md font-serif-num text-[18px] font-medium', colorClass].join(' ')}>
                    {c.count > 0 ? formatRate(c.avgRate) : '—'}
                  </div>
                  <div className="text-[10px] text-ink-3 mt-1 font-serif-num">{c.count}건</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 지금 밀기 좋은 메뉴 TOP 3 */}
      <div className="bg-surface border border-border rounded-2xl p-5">
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="text-[15px] font-bold tracking-tighter text-ink">
              지금 밀기 좋은 메뉴 <span className="ml-1 text-[10px] px-1.5 py-0.5 bg-accent-bg text-accent rounded-md font-bold">TOP 3</span>
            </div>
            <div className="text-[12px] text-ink-3 mt-0.5">추천 라벨 + 메뉴 내 최고 마진 채널 기준</div>
          </div>
        </div>

        {bestMenus.length === 0 ? (
          <div className="text-center py-6 text-ink-3 text-[13px]">
            아직 추천 등급 메뉴가 없어요.{' '}
            <Link href="/owner/menus" className="text-accent font-bold">메뉴 점검하기 →</Link>
          </div>
        ) : (
          <div className="flex flex-col divide-y divide-border">
            {bestMenus.map((m, i) => (
              <Link
                key={`${m.menuId}-${i}`}
                href={`/owner/menus/${m.menuId}`}
                className="flex items-center gap-3 py-3 hover:bg-surface-alt -mx-2 px-2 rounded-lg transition-colors"
              >
                <div className="font-serif text-accent text-[18px] font-medium italic tracking-tighter w-7">
                  {String(i + 1).padStart(2, '0')}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[14px] font-bold tracking-tighter text-ink truncate">
                    {m.name} <span className="text-ink-3 font-normal text-[12px]">· {m.bestChannel} 최고</span>
                  </div>
                  <div className="text-[11px] text-ink-3">공헌이익 {formatKRW(m.bestProfit)}원</div>
                </div>
                <div className="font-serif text-[16px] font-medium tracking-tighter tabular-nums px-2 py-0.5 rounded-md text-accent bg-accent-bg">
                  {formatRate(m.bestRate)}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* 마진 낮은 TOP 3 (채널 단위) */}
      <div className="bg-surface border border-border rounded-2xl p-5">
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="text-[15px] font-bold tracking-tighter text-ink">
              공헌이익률이 낮은 조합 <span className="ml-1 text-[10px] px-1.5 py-0.5 bg-warning-bg text-warning rounded-md font-bold">TOP 3</span>
            </div>
            <div className="text-[12px] text-ink-3 mt-0.5">채널 × 메뉴 기준</div>
          </div>
        </div>

        {worstMenus.length === 0 ? (
          <div className="text-center py-6 text-ink-3 text-[13px]">
            아직 등록된 메뉴가 없어요.{' '}
            <Link href="/owner/menus" className="text-accent font-bold">메뉴 추가하기 →</Link>
          </div>
        ) : (
          <div className="flex flex-col divide-y divide-border">
            {worstMenus.map((m, i) => {
              const tier = judgeMargin(m.rate);
              return (
                <Link
                  key={`${m.menuId}-${m.channel}-${i}`}
                  href={`/owner/menus/${m.menuId}`}
                  className="flex items-center gap-3 py-3 hover:bg-surface-alt -mx-2 px-2 rounded-lg transition-colors"
                >
                  <div className="font-serif text-accent text-[18px] font-medium italic tracking-tighter w-7">
                    {String(i + 1).padStart(2, '0')}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[14px] font-bold tracking-tighter text-ink truncate">
                      {m.name} <span className="text-ink-3 font-normal text-[12px]">· {m.channel}</span>
                    </div>
                    <div className="text-[11px] text-ink-3">공헌이익 {formatKRW(m.profit)}원</div>
                  </div>
                  <div
                    className={[
                      'font-serif text-[16px] font-medium tracking-tighter tabular-nums px-2 py-0.5 rounded-md',
                      tier === 'good' ? 'text-accent bg-accent-bg' :
                      tier === 'mid'  ? 'text-warning bg-warning-bg' :
                                        'text-alert bg-alert-bg',
                    ].join(' ')}
                  >
                    {formatRate(m.rate)}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {/* 빠른 작업 */}
      <div>
        <div className="text-[10px] font-bold text-ink-3 tracking-[0.08em] uppercase mb-2">빠른 작업</div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <QuickLink href="/owner/ingredients" label="재료 등록" />
          <QuickLink href="/owner/prep-items" label="양념장 만들기" />
          <QuickLink href="/owner/menus" label="메뉴 관리" />
          <QuickLink href="/owner/inventory" label="매입 기록" />
        </div>
      </div>
    </div>
  );
}

function SummaryCard({ href, label, value, hint }: { href: string; label: string; value: number; hint: string }) {
  return (
    <Link
      href={href}
      className="bg-surface border border-border rounded-2xl p-5 flex flex-col gap-1 hover:border-border-strong transition-colors group"
    >
      <div className="text-[11px] font-bold text-ink-3 tracking-[0.04em] uppercase">{label}</div>
      <div className="font-serif text-[34px] font-medium tracking-tightest text-ink leading-none tabular-nums">
        {value}<span className="text-ink-3 text-[14px] font-normal font-sans ml-1">개</span>
      </div>
      <div className="text-[11px] text-ink-3 mt-auto pt-1.5 flex items-center justify-between">
        <span>{hint}</span>
        <span className="text-ink-4 group-hover:text-accent group-hover:translate-x-0.5 transition-all">→</span>
      </div>
    </Link>
  );
}

function QuickLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="bg-surface border border-border rounded-xl px-4 py-3 text-[13px] font-bold tracking-tighter text-ink hover:border-accent hover:text-accent transition-colors text-center"
    >
      {label}
    </Link>
  );
}

function channelLabel(channel: string): string {
  return channel === 'dine_in' ? '매장' : channel === 'takeout' ? '포장' : channel === 'delivery' ? '배달' : channel;
}
