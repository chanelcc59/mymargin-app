// src/types/domain.ts
// 마이마진 1차 구현 도메인 타입
// 점주 UI 용어: 일반 재료 / 준비 재료
// 내부 구현 용어: raw_ingredient / prep_item / prep_recipe

export type Unit =
  | 'g'   // 그램 (기본값)
  | 'kg'  // 킬로그램
  | 'ml'  // 밀리리터
  | 'l'   // 리터
  | 'ea'  // 개 (count)
  | 'pack'; // 팩

export type ChannelKey = 'dine_in' | 'takeout' | 'delivery';

export interface RawIngredient {
  id: string;
  name: string;
  category?: string;             // "양념", "채소", "단백질" 등 (선택)

  // 기본 단위 (메뉴 레시피에서 사용하는 단위)
  baseUnit: Unit;                // g, ml, ea 등

  // 매입 정보 (사장님이 입력하는 실제 매입 패턴)
  purchaseQty: number;           // 매입 단위 양 (예: 20, 25, 1.8)
  purchaseUnit: Unit;            // 매입 단위 (예: kg, ea, L)
  purchasePrice: number;         // 매입 가격 (원)
  shippingCost: number;          // 배송비 (원, 기본 0)

  // 자동 계산 결과 (저장 안 하고 계산해서 사용)
  // unitCost = (purchasePrice + shippingCost) ÷ (baseUnit 환산된 매입양)

  // 메뉴 레시피에서 이름만으로 빠르게 추가된 재료 표시.
  // 정상적인 매입양·매입가가 입력되면 폼에서 자동으로 false 처리됨.
  needsInfo?: boolean;

  note?: string;
  createdAt: number;
  updatedAt: number;
}

export interface PrepRecipeItem {
  // 준비 재료 레시피의 한 줄
  // 현재 단계에서는 일반 재료(raw)만 준비 재료에 들어갈 수 있다.
  // (준비 재료 안에 준비 재료가 들어가는 중첩은 2단계에서)
  rawIngredientId: string;
  qty: number;                   // 소비량
  // unit은 rawIngredient.unit을 그대로 사용
}

export interface PrepItem {
  id: string;
  name: string;                  // 예: "떡볶이 양념장"
  yieldQty: number;              // 한 번 만들면 생산되는 총량 (예: 2000)
  yieldUnit: Unit;               // 생산량 단위 (예: 'g')
  items: PrepRecipeItem[];       // 들어가는 일반 재료들
  note?: string;
  createdAt: number;
  updatedAt: number;
}

export type MenuRecipeItem =
  | {
      kind: 'raw';
      rawIngredientId: string;
      qty: number;               // 1인분에 들어가는 양, rawIngredient.unit 기준
    }
  | {
      kind: 'prep';
      prepItemId: string;
      qty: number;               // 1인분에 들어가는 양, prepItem.yieldUnit 기준
    };

export interface MenuChannelConfig {
  channel: ChannelKey;
  isActive: boolean;             // 이 채널에서 판매 중인지
  salePrice: number;             // 판매가 (부가세 포함)
  platformFeeRate?: number;      // 채널 수수료율 (0.1 = 10%), 배달만 기본값 있음
  paymentFeeRate?: number;       // 결제 수수료율
  packagingCost?: number;        // 포장비 (포장/배달)
  extraCost?: number;            // 기타 채널별 비용
}

export interface Menu {
  id: string;
  name: string;
  category?: string;             // "기본", "김밥", "튀김" 등
  recipe: MenuRecipeItem[];      // 1인분 기준 레시피
  channels: MenuChannelConfig[]; // 매장/포장/배달 설정
  createdAt: number;
  updatedAt: number;
}

// ============================================
// 계산 결과 타입 (view 성격, 저장하지 않음)
// ============================================
export interface PrepItemCostResult {
  prepItemId: string;
  totalCost: number;             // 1회 생산분의 총 원가
  costPerUnit: number;           // yieldUnit 기준 1 unit당 원가
  yieldQty: number;
  yieldUnit: Unit;
  breakdown: Array<{
    rawIngredientId: string;
    rawName: string;
    qty: number;
    unit: Unit;
    unitCost: number;
    lineCost: number;
  }>;
}

export interface MenuCostResult {
  menuId: string;
  foodCost: number;              // 메뉴 1인분 식재료 원가
  breakdown: Array<
    | {
        kind: 'raw';
        id: string;
        name: string;
        qty: number;
        unit: Unit;
        unitCost: number;
        lineCost: number;
      }
    | {
        kind: 'prep';
        id: string;
        name: string;
        qty: number;
        unit: Unit;
        costPerUnit: number;     // 준비 재료 1 unit당 원가
        lineCost: number;
      }
  >;
}

export interface ChannelMarginResult {
  menuId: string;
  channel: ChannelKey;
  isActive: boolean;
  salePrice: number;             // 부가세 포함 판매가
  // 부가세 제외한 실제 매출 인식액
  netRevenue: number;            // salePrice / 1.1
  // 채널 공제
  platformFee: number;           // netRevenue × platformFeeRate
  paymentFee: number;            // netRevenue × paymentFeeRate
  packagingCost: number;
  extraCost: number;
  // 원가
  foodCost: number;              // 메뉴 1인분 식재료 원가
  // 결과
  contributionProfit: number;    // netRevenue - 모든 변동비
  contributionMarginRate: number; // contributionProfit / netRevenue
  foodCostRate: number;          // foodCost / netRevenue
}
