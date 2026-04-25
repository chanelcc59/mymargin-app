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
// 5. 포맷 유틸
// ============================================
export function formatKRW(n: number): string {
  return Math.round(n).toLocaleString('ko-KR');
}

export function formatRate(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}
