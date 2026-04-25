// src/lib/cost-engine.ts
// 핵심 계산 로직 - 순수 함수 모음
// 테스트 가능, UI 의존성 없음

import type {
  RawIngredient,
  PrepItem,
  Menu,
  PrepItemCostResult,
  MenuCostResult,
  ChannelMarginResult,
  MenuChannelConfig,
  ChannelKey,
  Unit,
  InventoryEvent,
  SaleEntry,
} from '@/types/domain';

// ============================================
// 0-1. 단위 환산 (kg → g, L → ml, 그 외 동일)
// ============================================
// 매입 단위가 baseUnit과 다른 경우의 환산 비율
// 예: baseUnit='g', purchaseUnit='kg' → 1000
// 예: baseUnit='ml', purchaseUnit='L' → 1000
// 예: baseUnit='ea', purchaseUnit='ea' → 1 (=같은 단위)
// 예: baseUnit='g', purchaseUnit='g' → 1
export function getUnitConversionRatio(baseUnit: Unit, purchaseUnit: Unit): number {
  if (baseUnit === purchaseUnit) return 1;
  // 무게: kg → g
  if (baseUnit === 'g' && purchaseUnit === 'kg') return 1000;
  // 부피: L → ml
  if (baseUnit === 'ml' && purchaseUnit === 'l') return 1000;
  // 그 외 (개, 팩 등) — 매입 단위가 기본 단위와 호환 안 되면 1로 처리
  // (예: 어묵 baseUnit='ea', purchaseUnit='ea' → 1)
  return 1;
}

// 재료가 "추가 정보 필요" 상태인지 판단.
// 명시 플래그(needsInfo)가 true이거나, 매입양·매입가가 0인 경우.
export function isRawNeedsInfo(raw: RawIngredient): boolean {
  if (raw.needsInfo) return true;
  if (raw.purchaseQty <= 0) return true;
  if (raw.purchasePrice <= 0) return true;
  return false;
}

// 매입 단위와 기본 단위가 호환되는지 검증
export function isCompatibleUnit(baseUnit: Unit, purchaseUnit: Unit): boolean {
  if (baseUnit === purchaseUnit) return true;
  if (baseUnit === 'g' && purchaseUnit === 'kg') return true;
  if (baseUnit === 'kg' && purchaseUnit === 'g') return true;
  if (baseUnit === 'ml' && purchaseUnit === 'l') return true;
  if (baseUnit === 'l' && purchaseUnit === 'ml') return true;
  return false;
}

// ============================================
// 0-2. 재료의 기본 단위 단가 자동 계산
// ============================================
// (매입가 + 배송비) ÷ (매입양을 baseUnit으로 환산한 양)
export function getRawIngredientUnitCost(raw: RawIngredient): number {
  const totalCost = raw.purchasePrice + (raw.shippingCost || 0);
  const ratio = getUnitConversionRatio(raw.baseUnit, raw.purchaseUnit);
  const totalQtyInBase = raw.purchaseQty * ratio;
  if (totalQtyInBase <= 0) return 0;
  return totalCost / totalQtyInBase;
}

// ============================================
// 1. 준비 재료 원가 계산
// ============================================
export function calcPrepItemCost(
  prepItem: PrepItem,
  rawIngredients: RawIngredient[]
): PrepItemCostResult {
  const byId = new Map(rawIngredients.map(r => [r.id, r]));

  const breakdown = prepItem.items.map(item => {
    const raw = byId.get(item.rawIngredientId);
    if (!raw) {
      // 삭제된 재료 참조 - 0으로 처리하되 경고
      return {
        rawIngredientId: item.rawIngredientId,
        rawName: '(삭제된 재료)',
        qty: item.qty,
        unit: 'g' as const,
        unitCost: 0,
        lineCost: 0,
      };
    }
    const unitCost = getRawIngredientUnitCost(raw);
    const lineCost = item.qty * unitCost;
    return {
      rawIngredientId: raw.id,
      rawName: raw.name,
      qty: item.qty,
      unit: raw.baseUnit,
      unitCost,
      lineCost,
    };
  });

  const totalCost = breakdown.reduce((sum, b) => sum + b.lineCost, 0);
  const costPerUnit = prepItem.yieldQty > 0 ? totalCost / prepItem.yieldQty : 0;

  return {
    prepItemId: prepItem.id,
    totalCost,
    costPerUnit,
    yieldQty: prepItem.yieldQty,
    yieldUnit: prepItem.yieldUnit,
    breakdown,
  };
}

// ============================================
// 2. 메뉴 원가 계산
// ============================================
export function calcMenuCost(
  menu: Menu,
  rawIngredients: RawIngredient[],
  prepItems: PrepItem[]
): MenuCostResult {
  const rawById = new Map(rawIngredients.map(r => [r.id, r]));
  const prepById = new Map(prepItems.map(p => [p.id, p]));

  // 준비 재료의 단가는 미리 다 계산해둠 (반복 계산 방지)
  const prepCostById = new Map<string, PrepItemCostResult>();
  prepItems.forEach(p => {
    prepCostById.set(p.id, calcPrepItemCost(p, rawIngredients));
  });

  const breakdown: MenuCostResult['breakdown'] = menu.recipe.map(item => {
    if (item.kind === 'raw') {
      const raw = rawById.get(item.rawIngredientId);
      if (!raw) {
        return {
          kind: 'raw' as const,
          id: item.rawIngredientId,
          name: '(삭제된 재료)',
          qty: item.qty,
          unit: 'g' as const,
          unitCost: 0,
          lineCost: 0,
        };
      }
      return {
        kind: 'raw' as const,
        id: raw.id,
        name: raw.name,
        qty: item.qty,
        unit: raw.baseUnit,
        unitCost: getRawIngredientUnitCost(raw),
        lineCost: item.qty * getRawIngredientUnitCost(raw),
      };
    } else {
      // kind === 'prep'
      const prep = prepById.get(item.prepItemId);
      const prepCost = prepCostById.get(item.prepItemId);
      if (!prep || !prepCost) {
        return {
          kind: 'prep' as const,
          id: item.prepItemId,
          name: '(삭제된 준비재료)',
          qty: item.qty,
          unit: 'g' as const,
          costPerUnit: 0,
          lineCost: 0,
        };
      }
      return {
        kind: 'prep' as const,
        id: prep.id,
        name: prep.name,
        qty: item.qty,
        unit: prep.yieldUnit,
        costPerUnit: prepCost.costPerUnit,
        lineCost: item.qty * prepCost.costPerUnit,
      };
    }
  });

  const foodCost = breakdown.reduce((sum, b) => sum + b.lineCost, 0);

  return {
    menuId: menu.id,
    foodCost,
    breakdown,
  };
}

// ============================================
// 3. 채널별 마진 계산
// ============================================
// 채널별 기본 수수료 (점주가 설정 안 하면 쓰는 값)
export const DEFAULT_CHANNEL_CONFIG: Record<
  ChannelKey,
  {
    platformFeeRate: number;
    paymentFeeRate: number;
    packagingCost: number;
  }
> = {
  dine_in: {
    platformFeeRate: 0,
    paymentFeeRate: 0.02,    // 카드 수수료 평균 2%
    packagingCost: 0,
  },
  takeout: {
    platformFeeRate: 0,
    paymentFeeRate: 0.02,
    packagingCost: 300,      // 포장 용기 평균
  },
  delivery: {
    platformFeeRate: 0.12,   // 배민 오픈리스트 기준 대략 12%
    paymentFeeRate: 0.03,    // 배달앱 PG 수수료
    packagingCost: 500,
  },
};

const VAT_RATE = 0.1; // 10%

export function calcChannelMargin(
  menu: Menu,
  channelConfig: MenuChannelConfig,
  menuCost: MenuCostResult
): ChannelMarginResult {
  const channelKey = channelConfig.channel;
  const def = DEFAULT_CHANNEL_CONFIG[channelKey];

  // 부가세 제외한 매출 인식액
  const netRevenue = channelConfig.salePrice / (1 + VAT_RATE);

  // 수수료/비용 (override 있으면 그 값, 없으면 기본값)
  const platformFeeRate = channelConfig.platformFeeRate ?? def.platformFeeRate;
  const paymentFeeRate = channelConfig.paymentFeeRate ?? def.paymentFeeRate;
  const packagingCost = channelConfig.packagingCost ?? def.packagingCost;
  const extraCost = channelConfig.extraCost ?? 0;

  const platformFee = netRevenue * platformFeeRate;
  const paymentFee = netRevenue * paymentFeeRate;
  const foodCost = menuCost.foodCost;

  const contributionProfit =
    netRevenue - platformFee - paymentFee - packagingCost - extraCost - foodCost;

  const contributionMarginRate =
    netRevenue > 0 ? contributionProfit / netRevenue : 0;

  const foodCostRate = netRevenue > 0 ? foodCost / netRevenue : 0;

  return {
    menuId: menu.id,
    channel: channelKey,
    isActive: channelConfig.isActive,
    salePrice: channelConfig.salePrice,
    netRevenue,
    platformFee,
    paymentFee,
    packagingCost,
    extraCost,
    foodCost,
    contributionProfit,
    contributionMarginRate,
    foodCostRate,
  };
}

// 메뉴 한 개의 모든 채널 마진을 한 번에 계산
export function calcAllChannelMargins(
  menu: Menu,
  rawIngredients: RawIngredient[],
  prepItems: PrepItem[]
): ChannelMarginResult[] {
  const menuCost = calcMenuCost(menu, rawIngredients, prepItems);
  return menu.channels
    .filter(c => c.isActive)
    .map(c => calcChannelMargin(menu, c, menuCost));
}

// ============================================
// 4. 마진 등급 판정 (UI 표시용)
// ============================================
export type MarginTier = 'good' | 'mid' | 'risk';

export function judgeMargin(contributionMarginRate: number): MarginTier {
  if (contributionMarginRate >= 0.5) return 'good';
  if (contributionMarginRate >= 0.3) return 'mid';
  return 'risk';
}

// ============================================
// 4-2. 메뉴 종합 등급 판정 (점주에게 결론형 라벨로 보여주기 위함)
// ============================================
// 한 메뉴의 모든 활성 채널을 종합해서 한 라벨로 판정한다.
// - review     (가격점검): 손봐야 하는 상태 — 레시피 비어있음, 활성 채널 없음, 판매가 미입력, 적자 채널 존재
// - caution    (주의)    : 흑자지만 공헌이익률이 위험·중간 구간 (risk/mid 채널 섞임)
// - recommended (추천)   : 모든 활성 채널이 양호 (>=50%)
export type MenuTier = 'recommended' | 'caution' | 'review';

export const MENU_TIER_LABEL: Record<MenuTier, string> = {
  recommended: '추천',
  caution: '주의',
  review: '가격점검',
};

export function judgeMenuTier(
  menu: Menu,
  rawIngredients: RawIngredient[],
  prepItems: PrepItem[]
): MenuTier {
  // 레시피가 비어있으면 가격을 논할 단계가 아님 → 가격점검
  if (menu.recipe.length === 0) return 'review';

  const active = menu.channels.filter((c) => c.isActive);
  if (active.length === 0) return 'review';
  if (active.some((c) => !c.salePrice || c.salePrice <= 0)) return 'review';

  const margins = calcAllChannelMargins(menu, rawIngredients, prepItems);
  if (margins.length === 0) return 'review';

  // 공헌이익이 음수인 채널이 하나라도 있으면 가격점검
  if (margins.some((m) => m.contributionProfit < 0)) return 'review';

  const tiers = margins.map((m) => judgeMargin(m.contributionMarginRate));
  if (tiers.every((t) => t === 'good')) return 'recommended';
  return 'caution';
}

// ============================================
// 4-3. 재고 계산 (Inventory)
// ============================================
// 한 재료의 현재고를 이벤트 원장에서 계산.
// - 시간순 정렬 후 순차 적용
// - 'count' 이벤트는 절대값으로 누적값을 리셋 (실사 기준점)
// - 'purchase'는 +, 'waste'는 -
export function calcCurrentStock(rawId: string, events: InventoryEvent[]): number {
  const sorted = events
    .filter((e) => e.rawId === rawId)
    .sort((a, b) => a.occurredAt - b.occurredAt);
  let stock = 0;
  for (const e of sorted) {
    if (e.type === 'count') stock = e.qty;
    else if (e.type === 'purchase') stock += e.qty;
    else if (e.type === 'waste') stock -= e.qty;
  }
  return stock;
}

// 특정 시점(asOfMs 포함)에 한 재료의 재고를 계산.
// asOfMs 이후의 이벤트는 무시.
export function calcStockAt(rawId: string, events: InventoryEvent[], asOfMs: number): number {
  const sorted = events
    .filter((e) => e.rawId === rawId && e.occurredAt <= asOfMs)
    .sort((a, b) => a.occurredAt - b.occurredAt);
  let stock = 0;
  for (const e of sorted) {
    if (e.type === 'count') stock = e.qty;
    else if (e.type === 'purchase') stock += e.qty;
    else if (e.type === 'waste') stock -= e.qty;
  }
  return stock;
}

// 모든 재료의 현재고 맵을 한번에 계산 (페이지 렌더 용도)
export function calcAllCurrentStock(
  raws: RawIngredient[],
  events: InventoryEvent[]
): Map<string, number> {
  const byRaw = new Map<string, InventoryEvent[]>();
  events.forEach((e) => {
    const arr = byRaw.get(e.rawId) ?? [];
    arr.push(e);
    byRaw.set(e.rawId, arr);
  });
  const result = new Map<string, number>();
  raws.forEach((r) => {
    const evts = byRaw.get(r.id) ?? [];
    if (evts.length === 0) {
      result.set(r.id, 0);
      return;
    }
    evts.sort((a, b) => a.occurredAt - b.occurredAt);
    let stock = 0;
    for (const e of evts) {
      if (e.type === 'count') stock = e.qty;
      else if (e.type === 'purchase') stock += e.qty;
      else if (e.type === 'waste') stock -= e.qty;
    }
    result.set(r.id, stock);
  });
  return result;
}

// 재고 등급 (UI 표시용)
// - none: 이력 없음 (점주가 아직 등록 안 함)
// - short: 0 이하 (소진)
// - low: 매입 1회분의 20% 미만 (곧 떨어짐)
// - ok: 충분
export type StockTier = 'none' | 'short' | 'low' | 'ok';

export function judgeStock(
  raw: RawIngredient,
  stock: number,
  hasAnyEvent: boolean
): StockTier {
  if (!hasAnyEvent) return 'none';
  if (stock <= 0) return 'short';
  if (raw.purchaseQty > 0) {
    const oneOrderInBase = raw.purchaseQty * getUnitConversionRatio(raw.baseUnit, raw.purchaseUnit);
    if (oneOrderInBase > 0 && stock < oneOrderInBase * 0.2) return 'low';
  }
  return 'ok';
}

// ============================================
// 4-4. 이론 소모량 계산 (판매 데이터 → 재료 소모량)
// ============================================
// 판매 1건이 소비하는 재료를 모두 raw 단위로 환산해서 반환.
// prep 항목은 prep.items 풀어서 raw로 합산 (예: 양념장 80g → 고춧가루 8g + 설탕 12g + ...)
function expandRecipeToRaw(
  menu: Menu,
  qty: number,
  prepById: Map<string, PrepItem>
): Array<{ rawId: string; qty: number }> {
  const result: Array<{ rawId: string; qty: number }> = [];
  for (const item of menu.recipe) {
    if (item.kind === 'raw') {
      result.push({ rawId: item.rawIngredientId, qty: item.qty * qty });
    } else {
      const prep = prepById.get(item.prepItemId);
      if (!prep || prep.yieldQty <= 0) continue;
      // 메뉴에서 이 prep을 (item.qty * qty) 만큼 소비함.
      // prep 1 yieldUnit당 raw별 소비량 = prep.items[i].qty / prep.yieldQty
      const ratio = (item.qty * qty) / prep.yieldQty;
      for (const sub of prep.items) {
        result.push({ rawId: sub.rawIngredientId, qty: sub.qty * ratio });
      }
    }
  }
  return result;
}

// 기간 내 모든 판매 기록을 합쳐 raw별 이론 소모량 맵 반환.
// from/to는 'YYYY-MM-DD' 문자열로 비교 (생략시 전체).
export function calcTheoreticalConsumption(
  sales: SaleEntry[],
  menus: Menu[],
  preps: PrepItem[],
  range?: { from?: string; to?: string }
): Map<string, number> {
  const menuById = new Map(menus.map((m) => [m.id, m]));
  const prepById = new Map(preps.map((p) => [p.id, p]));
  const result = new Map<string, number>();

  for (const s of sales) {
    if (range?.from && s.date < range.from) continue;
    if (range?.to && s.date > range.to) continue;
    const menu = menuById.get(s.menuId);
    if (!menu || s.qty <= 0) continue;

    const expanded = expandRecipeToRaw(menu, s.qty, prepById);
    for (const e of expanded) {
      result.set(e.rawId, (result.get(e.rawId) ?? 0) + e.qty);
    }
  }
  return result;
}

// 한 메뉴 1인분의 raw 소모량 (미리보기·메뉴 카드 등에서 사용 가능)
export function calcMenuRawConsumption(
  menu: Menu,
  preps: PrepItem[]
): Map<string, number> {
  const prepById = new Map(preps.map((p) => [p.id, p]));
  const result = new Map<string, number>();
  for (const e of expandRecipeToRaw(menu, 1, prepById)) {
    result.set(e.rawId, (result.get(e.rawId) ?? 0) + e.qty);
  }
  return result;
}

// ============================================
// 4-5. 로스 분석 (이론 vs 실제)
// ============================================
// 비전 문서 정의:
//   실제 감소량 = 기초재고 + 매입 - 기말재고
//   설명 가능한 로스 = 폐기 (1차 범위)
//   설명 안 되는 로스 = 실제 감소량 - 이론 소모량 - 설명 가능한 로스
//
// 주의: 기간 [from, to) 사이에 'count' 실사가 끼어있으면 위 단순 공식이 부정확.
// 이 경우 hasMidCount=true 로 표시하여 화면에서 "정확도 주의" 알림 가능.
export interface LossAnalysisRow {
  rawId: string;
  rawName: string;
  unit: Unit;
  unitCost: number;            // baseUnit 1단위당 단가
  startStock: number;          // 기초 재고 (period 시작 직전 시점)
  endStock: number;            // 기말 재고 (period 끝 시점)
  purchase: number;            // 기간 매입 합
  waste: number;               // 기간 폐기 합 (= 설명 가능한 로스)
  theoretical: number;         // 이론 소모량 (판매×레시피)
  actualDecrease: number;      // 실제 감소량 = startStock + purchase - endStock
  unexplainedLoss: number;     // 설명 안 되는 로스 (음수 가능 — 이론보다 덜 쓴 경우)
  unexplainedLossCost: number; // 설명 안 되는 로스의 금액 (max(0, loss) × unitCost)
  hasMidCount: boolean;        // 기간 안에 count 이벤트가 있는지 (정확도 주의)
}

export interface LossAnalysisRange {
  fromMs: number;              // 기간 시작 (포함)
  toMs: number;                // 기간 끝 (포함)
  fromDate: string;            // 'YYYY-MM-DD' (이론 소모량 계산용)
  toDate: string;
}

export function analyzeLoss(
  raws: RawIngredient[],
  preps: PrepItem[],
  menus: Menu[],
  events: InventoryEvent[],
  sales: SaleEntry[],
  range: LossAnalysisRange
): LossAnalysisRow[] {
  const theoreticalMap = calcTheoreticalConsumption(sales, menus, preps, {
    from: range.fromDate,
    to: range.toDate,
  });

  // raw별 이벤트 인덱싱
  const eventsByRaw = new Map<string, InventoryEvent[]>();
  events.forEach((e) => {
    const arr = eventsByRaw.get(e.rawId) ?? [];
    arr.push(e);
    eventsByRaw.set(e.rawId, arr);
  });

  return raws.map((raw) => {
    const rawEvents = eventsByRaw.get(raw.id) ?? [];
    const inRange = rawEvents.filter((e) => e.occurredAt >= range.fromMs && e.occurredAt <= range.toMs);

    const startStock = calcStockAt(raw.id, rawEvents, range.fromMs - 1);
    const endStock = calcStockAt(raw.id, rawEvents, range.toMs);
    const purchase = inRange.filter((e) => e.type === 'purchase').reduce((s, e) => s + e.qty, 0);
    const waste = inRange.filter((e) => e.type === 'waste').reduce((s, e) => s + e.qty, 0);
    const theoretical = theoreticalMap.get(raw.id) ?? 0;
    const hasMidCount = inRange.some((e) => e.type === 'count');

    const actualDecrease = startStock + purchase - endStock;
    const unexplainedLoss = actualDecrease - theoretical - waste;
    const unitCost = getRawIngredientUnitCost(raw);
    const unexplainedLossCost = Math.max(0, unexplainedLoss) * unitCost;

    return {
      rawId: raw.id,
      rawName: raw.name,
      unit: raw.baseUnit,
      unitCost,
      startStock,
      endStock,
      purchase,
      waste,
      theoretical,
      actualDecrease,
      unexplainedLoss,
      unexplainedLossCost,
      hasMidCount,
    };
  });
}

// 로스 분석 결과의 종합 요약
export interface LossAnalysisSummary {
  totalUnexplainedLossCost: number;  // 설명 안 되는 로스 금액 합
  totalWaste: number;                // 폐기 건수
  rowsWithLoss: number;              // 설명 안 되는 로스가 양수인 raw 개수
  rowsWithData: number;              // 분석 가능한(이벤트 있는) raw 개수
  warningCount: number;              // hasMidCount 경고 행 수
}

export function summarizeLoss(rows: LossAnalysisRow[]): LossAnalysisSummary {
  let totalUnexplainedLossCost = 0;
  let totalWaste = 0;
  let rowsWithLoss = 0;
  let rowsWithData = 0;
  let warningCount = 0;

  rows.forEach((r) => {
    totalUnexplainedLossCost += r.unexplainedLossCost;
    totalWaste += r.waste;
    if (r.unexplainedLoss > 0) rowsWithLoss++;
    if (r.purchase > 0 || r.waste > 0 || r.theoretical > 0 || r.startStock !== 0 || r.endStock !== 0) rowsWithData++;
    if (r.hasMidCount) warningCount++;
  });

  return { totalUnexplainedLossCost, totalWaste, rowsWithLoss, rowsWithData, warningCount };
}

// ============================================
// 5. 포맷 유틸
// ============================================
export function formatKRW(n: number): string {
  return Math.round(n).toLocaleString('ko-KR');
}

export function formatRate(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}
