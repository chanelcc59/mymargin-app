// src/lib/store.ts
// 저장소 - 현재는 localStorage, 나중에 Supabase로 교체 예정
// 모든 CRUD는 이 파일을 통해서만 한다 (교체 가능성 보호)

import type { RawIngredient, PrepItem, Menu, InventoryEvent } from '@/types/domain';

// ============================================
// 저장 키
// ============================================
const KEYS = {
  rawIngredients: 'mymargin:raw_ingredients',
  prepItems: 'mymargin:prep_items',
  menus: 'mymargin:menus',
  inventoryEvents: 'mymargin:inventory_events',
  version: 'mymargin:version',
} as const;

const CURRENT_VERSION = 4;

// ============================================
// 내부 헬퍼
// ============================================
function read<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function write<T>(key: string, value: T): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

function genId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function now(): number {
  return Date.now();
}

// ============================================
// Raw Ingredients (일반 재료)
// ============================================
export const rawIngredientStore = {
  list(): RawIngredient[] {
    return read<RawIngredient[]>(KEYS.rawIngredients, []);
  },

  get(id: string): RawIngredient | undefined {
    return this.list().find(r => r.id === id);
  },

  create(input: Omit<RawIngredient, 'id' | 'createdAt' | 'updatedAt'>): RawIngredient {
    const item: RawIngredient = {
      ...input,
      id: genId('raw'),
      createdAt: now(),
      updatedAt: now(),
    };
    const list = this.list();
    list.push(item);
    write(KEYS.rawIngredients, list);
    return item;
  },

  update(id: string, patch: Partial<Omit<RawIngredient, 'id' | 'createdAt'>>): RawIngredient | null {
    const list = this.list();
    const idx = list.findIndex(r => r.id === id);
    if (idx === -1) return null;
    list[idx] = { ...list[idx], ...patch, id, updatedAt: now() };
    write(KEYS.rawIngredients, list);
    return list[idx];
  },

  delete(id: string): boolean {
    const list = this.list();
    const next = list.filter(r => r.id !== id);
    if (next.length === list.length) return false;
    write(KEYS.rawIngredients, next);
    return true;
  },
};

// ============================================
// Prep Items (준비 재료)
// ============================================
export const prepItemStore = {
  list(): PrepItem[] {
    return read<PrepItem[]>(KEYS.prepItems, []);
  },

  get(id: string): PrepItem | undefined {
    return this.list().find(p => p.id === id);
  },

  create(input: Omit<PrepItem, 'id' | 'createdAt' | 'updatedAt'>): PrepItem {
    const item: PrepItem = {
      ...input,
      id: genId('prep'),
      createdAt: now(),
      updatedAt: now(),
    };
    const list = this.list();
    list.push(item);
    write(KEYS.prepItems, list);
    return item;
  },

  update(id: string, patch: Partial<Omit<PrepItem, 'id' | 'createdAt'>>): PrepItem | null {
    const list = this.list();
    const idx = list.findIndex(p => p.id === id);
    if (idx === -1) return null;
    list[idx] = { ...list[idx], ...patch, id, updatedAt: now() };
    write(KEYS.prepItems, list);
    return list[idx];
  },

  delete(id: string): boolean {
    const list = this.list();
    const next = list.filter(p => p.id !== id);
    if (next.length === list.length) return false;
    write(KEYS.prepItems, next);
    return true;
  },
};

// ============================================
// Menus (메뉴)
// ============================================
export const menuStore = {
  list(): Menu[] {
    return read<Menu[]>(KEYS.menus, []);
  },

  get(id: string): Menu | undefined {
    return this.list().find(m => m.id === id);
  },

  create(input: Omit<Menu, 'id' | 'createdAt' | 'updatedAt'>): Menu {
    const item: Menu = {
      ...input,
      id: genId('menu'),
      createdAt: now(),
      updatedAt: now(),
    };
    const list = this.list();
    list.push(item);
    write(KEYS.menus, list);
    return item;
  },

  update(id: string, patch: Partial<Omit<Menu, 'id' | 'createdAt'>>): Menu | null {
    const list = this.list();
    const idx = list.findIndex(m => m.id === id);
    if (idx === -1) return null;
    list[idx] = { ...list[idx], ...patch, id, updatedAt: now() };
    write(KEYS.menus, list);
    return list[idx];
  },

  delete(id: string): boolean {
    const list = this.list();
    const next = list.filter(m => m.id !== id);
    if (next.length === list.length) return false;
    write(KEYS.menus, next);
    return true;
  },
};

// ============================================
// Inventory Events (재고 이벤트 원장)
// 모든 재고 변동(매입/실사/폐기)을 이벤트로 누적 기록
// ============================================
export const inventoryEventStore = {
  list(): InventoryEvent[] {
    return read<InventoryEvent[]>(KEYS.inventoryEvents, []);
  },

  listByRaw(rawId: string): InventoryEvent[] {
    return this.list().filter((e) => e.rawId === rawId);
  },

  create(input: Omit<InventoryEvent, 'id' | 'createdAt'>): InventoryEvent {
    const item: InventoryEvent = {
      ...input,
      id: genId('evt'),
      createdAt: now(),
    };
    const list = this.list();
    list.push(item);
    write(KEYS.inventoryEvents, list);
    return item;
  },

  delete(id: string): boolean {
    const list = this.list();
    const next = list.filter((e) => e.id !== id);
    if (next.length === list.length) return false;
    write(KEYS.inventoryEvents, next);
    return true;
  },

  // 특정 재료가 삭제될 때 같이 정리하기 위함 (외래키 정리)
  deleteByRaw(rawId: string): number {
    const list = this.list();
    const next = list.filter((e) => e.rawId !== rawId);
    const removed = list.length - next.length;
    if (removed > 0) write(KEYS.inventoryEvents, next);
    return removed;
  },
};

// ============================================
// 초기화 + 시드 데이터
// ============================================
export function getStorageVersion(): number {
  return read<number>(KEYS.version, 0);
}

export function markInitialized(): void {
  write(KEYS.version, CURRENT_VERSION);
}

export function clearAll(): void {
  if (typeof window === 'undefined') return;
  Object.values(KEYS).forEach(k => window.localStorage.removeItem(k));
}

// 개발/테스트용 시드 데이터
// (사장님이 처음 열었을 때 예시로 보여줌 - 나중에 빈 상태로 시작하도록 바꿀 수 있음)
export function seedDemoData(): void {
  if (getStorageVersion() >= CURRENT_VERSION) return;

  // 버전 업 시 기존 데이터 정리
  // (사용자가 입력한 진짜 데이터가 있다면 위험할 수 있으나, 현재는 시드 데이터뿐이라 OK)
  if (getStorageVersion() < CURRENT_VERSION) {
    write(KEYS.rawIngredients, []);
    write(KEYS.prepItems, []);
    write(KEYS.menus, []);
    write(KEYS.inventoryEvents, []);
  }

  // ============================================
  // 1) 일반 재료 라이브러리 (분식집 기본 재료들)
  // 매입 단위 기준 입력 - 사장님이 평소 매입하는 형태 그대로
  // ============================================
  const rawByName: Record<string, string> = {};
  const addRaw = (
    name: string,
    baseUnit: 'g' | 'kg' | 'ml' | 'l' | 'ea' | 'pack',
    purchase: { qty: number; unit: 'g' | 'kg' | 'ml' | 'l' | 'ea' | 'pack'; price: number; shipping?: number },
    category?: string
  ) => {
    const r = rawIngredientStore.create({
      name,
      baseUnit,
      purchaseQty: purchase.qty,
      purchaseUnit: purchase.unit,
      purchasePrice: purchase.price,
      shippingCost: purchase.shipping || 0,
      category,
    });
    rawByName[name] = r.id;
  };

  // ── 양념 ──
  addRaw('고춧가루',  'g',  { qty: 20, unit: 'kg', price: 260000 }, '양념');           // 13원/g
  addRaw('설탕',      'g',  { qty: 15, unit: 'kg', price: 30000 }, '양념');             // 2원/g
  addRaw('간장',      'ml', { qty: 18, unit: 'l',  price: 72000 }, '양념');             // 4원/ml
  addRaw('물엿',      'g',  { qty: 5,  unit: 'kg', price: 15000 }, '양념');             // 3원/g
  addRaw('다진마늘',  'g',  { qty: 1,  unit: 'kg', price: 15000 }, '양념');             // 15원/g
  addRaw('고추장',    'g',  { qty: 14, unit: 'kg', price: 112000 }, '양념');            // 8원/g

  // ── 떡·면 ──
  addRaw('떡',         'g',  { qty: 10, unit: 'kg', price: 45000 }, '떡·면');            // 4.5원/g
  addRaw('가래떡',     'g',  { qty: 10, unit: 'kg', price: 50000 }, '떡·면');            // 5원/g
  addRaw('밥',         'g',  { qty: 20, unit: 'kg', price: 30000 }, '떡·면');            // 1.5원/g
  addRaw('당면',       'g',  { qty: 5,  unit: 'kg', price: 40000 }, '떡·면');            // 8원/g
  addRaw('소면',       'g',  { qty: 18, unit: 'kg', price: 108000 }, '떡·면');           // 6원/g
  addRaw('라면사리',   'ea', { qty: 30, unit: 'ea', price: 24000 }, '떡·면');            // 800원/개

  // ── 어묵·순대 ──
  addRaw('어묵',       'ea', { qty: 25, unit: 'ea', price: 4700 }, '어묵·순대');        // 188원/개 (한 봉지에 25개)
  addRaw('찹쌀순대',   'g',  { qty: 5,  unit: 'kg', price: 70000 }, '어묵·순대');        // 14원/g

  // ── 튀김재료 ──
  addRaw('밀가루(튀김용)', 'g',  { qty: 20, unit: 'kg', price: 60000 }, '튀김재료');     // 3원/g
  addRaw('식용유',         'ml', { qty: 18, unit: 'l',  price: 90000 }, '튀김재료');     // 5원/ml
  addRaw('튀김반죽',       'g',  { qty: 10, unit: 'kg', price: 40000 }, '튀김재료');     // 4원/g

  // ── 채소 ──
  addRaw('양파',         'g',  { qty: 15, unit: 'kg', price: 30000, shipping: 0 }, '채소');   // 2원/g
  addRaw('대파',         'g',  { qty: 5,  unit: 'kg', price: 20000 }, '채소');                // 4원/g
  addRaw('당근',         'g',  { qty: 10, unit: 'kg', price: 30000 }, '채소');                // 3원/g
  addRaw('야채믹스',     'g',  { qty: 5,  unit: 'kg', price: 25000 }, '채소');                // 5원/g
  addRaw('단무지',       'g',  { qty: 10, unit: 'kg', price: 30000 }, '채소');                // 3원/g
  addRaw('시금치',       'g',  { qty: 3,  unit: 'kg', price: 18000 }, '채소');                // 6원/g
  addRaw('깻잎',         'ea', { qty: 100, unit: 'ea', price: 8000 }, '채소');                // 80원/개
  addRaw('땡초(청양)',   'g',  { qty: 1,  unit: 'kg', price: 18000 }, '채소');                // 18원/g

  // ── 단백질 ──
  addRaw('계란',         'ea', { qty: 30, unit: 'ea', price: 10500 }, '단백질');              // 350원/개 (한 판 30개)
  addRaw('스팸',         'g',  { qty: 1.8, unit: 'kg', price: 32400 }, '단백질');             // 18원/g
  addRaw('참치캔',       'g',  { qty: 1.4, unit: 'kg', price: 19600 }, '단백질');             // 14원/g
  addRaw('치즈슬라이스', 'ea', { qty: 200, unit: 'ea', price: 70000 }, '단백질');             // 350원/장 (200매들이 박스)
  addRaw('불고기',       'g',  { qty: 1,  unit: 'kg', price: 30000 }, '단백질');              // 30원/g
  addRaw('오징어',       'g',  { qty: 5,  unit: 'kg', price: 80000 }, '단백질');              // 16원/g
  addRaw('새우',         'g',  { qty: 1,  unit: 'kg', price: 50000 }, '단백질');              // 50원/g
  addRaw('오돌뼈',       'g',  { qty: 5,  unit: 'kg', price: 110000 }, '단백질');             // 22원/g
  addRaw('멸치',         'g',  { qty: 1,  unit: 'kg', price: 50000 }, '단백질');              // 50원/g
  addRaw('명란',         'g',  { qty: 1,  unit: 'kg', price: 80000 }, '단백질');              // 80원/g

  // ── 완제품 ──
  addRaw('야끼만두',         'ea', { qty: 40, unit: 'ea', price: 10000 }, '완제품');          // 250원/개
  addRaw('고구마(튀김용)',   'g',  { qty: 10, unit: 'kg', price: 50000 }, '완제품');          // 5원/g
  addRaw('김말이',           'ea', { qty: 50, unit: 'ea', price: 20000 }, '완제품');          // 400원/개

  // ── 김밥재료 ──
  addRaw('김밥김',   'ea', { qty: 100, unit: 'ea', price: 20000 }, '김밥재료');               // 200원/장
  addRaw('맛살',     'g',  { qty: 5,   unit: 'kg', price: 60000 }, '김밥재료');               // 12원/g
  addRaw('우엉',     'g',  { qty: 5,   unit: 'kg', price: 40000 }, '김밥재료');               // 8원/g

  // ── 음료 ──
  addRaw('제로콜라',  'ea', { qty: 24, unit: 'ea', price: 28800 }, '음료');                   // 1200원/캔
  addRaw('일반음료',  'ea', { qty: 24, unit: 'ea', price: 21600 }, '음료');                   // 900원/캔

  // ── 기타 ──
  addRaw('참기름', 'ml', { qty: 1.8, unit: 'l',  price: 36000 }, '기타');                     // 20원/ml
  addRaw('소금',   'g',  { qty: 5,   unit: 'kg', price: 5000 }, '기타');                      // 1원/g
  addRaw('후추',   'g',  { qty: 0.5, unit: 'kg', price: 15000 }, '기타');                     // 30원/g

  // ============================================
  // 2) 준비 재료 (양념장)
  // ============================================
  const sauce = prepItemStore.create({
    name: '떡볶이 양념장',
    yieldQty: 2000,
    yieldUnit: 'g',
    items: [
      { rawIngredientId: rawByName['고춧가루'], qty: 200 },
      { rawIngredientId: rawByName['설탕'], qty: 300 },
      { rawIngredientId: rawByName['간장'], qty: 150 },
      { rawIngredientId: rawByName['물엿'], qty: 400 },
      { rawIngredientId: rawByName['다진마늘'], qty: 80 },
      { rawIngredientId: rawByName['고추장'], qty: 200 },
    ],
    note: '한 번에 만들어서 냉장 보관 1주일',
  });

  // ============================================
  // 3) 갑부떡볶이 메뉴 40개
  // ============================================
  // 채널 가격 도우미: 매장 = takeout 동일, 배달은 +20% 반올림(100원 단위)
  const makeChannels = (storePrice: number) => {
    const deliveryPrice = Math.round(storePrice * 1.2 / 100) * 100;
    return [
      { channel: 'dine_in' as const,  isActive: true,  salePrice: storePrice },
      { channel: 'takeout' as const,  isActive: true,  salePrice: storePrice, packagingCost: 300 },
      { channel: 'delivery' as const, isActive: true,  salePrice: deliveryPrice, packagingCost: 500 },
    ];
  };

  // 메뉴 정의 [이름, 카테고리, 매장가]
  // (레시피는 비워둠 - 사장님이 직접 입력)
  const MENUS: Array<[string, string, number, Array<{ kind: 'raw' | 'prep'; key: string; qty: number }>?]> = [
    // ── 기본 메뉴 ──
    ['갑부떡볶이', '기본', 5000, [
      { kind: 'raw', key: '떡', qty: 200 },
      { kind: 'raw', key: '어묵', qty: 4 },     // 4개 (baseUnit: ea)
      { kind: 'raw', key: '양파', qty: 30 },
      { kind: 'prep', key: 'sauce', qty: 80 },
    ]],
    ['가래떡볶이', '기본', 6000],
    ['떡볶이 섞어서', '기본', 6000],
    ['찹쌀순대', '기본', 6000],
    ['수제튀김 (모둠)', '기본', 8000],

    // ── 튀김 ──
    ['야끼만두', '튀김', 800],
    ['고구마 튀김', '튀김', 1300],
    ['김말이 튀김', '튀김', 1300],
    ['오징어 튀김', '튀김', 1300],
    ['야채 튀김', '튀김', 1300],
    ['새우 튀김', '튀김', 1500],
    ['깻잎 튀김', '튀김', 1500],
    ['튀김탕수육', '튀김', 10000],
    ['부산어묵 (1개)', '튀김', 1300],
    ['부산어묵 (3개)', '튀김', 3500],

    // ── 김밥 ──
    ['갑부김밥', '김밥', 5000],
    ['고기김밥', '김밥', 6000],
    ['치즈김밥', '김밥', 6500],
    ['참치김밥', '김밥', 6500],
    ['스팸김밥', '김밥', 7000],
    ['땡초김밥', '김밥', 7000],
    ['오징어김밥', '김밥', 7000],
    ['충무김밥', '김밥', 10000],

    // ── 스페셜 ──
    ['기본라면', '스페셜', 5000],
    ['갑부라면', '스페셜', 6000],
    ['잔치국수', '스페셜', 7000],
    ['비빔밥', '스페셜', 6000],

    // ── 사이드 ──
    ['고기주먹밥', '사이드', 4000],
    ['멸치주먹밥', '사이드', 4000],
    ['참치주먹밥', '사이드', 4000],
    ['명란주먹밥', '사이드', 4000],
    ['오돌뼈주먹밥', '사이드', 5000],
    ['가래떡꼬치', '사이드', 2000],
    ['갑부떡꼬치', '사이드', 3000],
    ['계란 (3개)', '사이드', 2000],
    ['계란 (1개)', '사이드', 1000],

    // ── 음료 ──
    ['제로콜라', '음료', 3000],
    ['음료수', '음료', 2500],

    // ── 세트 ──
    ['세트1 · 갑부떡볶이+김밥+음료수', '세트', 11000],
    ['세트2 · 갑부떡볶이+순대+음료수', '세트', 11000],
    ['세트3 · 갑부떡볶이+모듬튀김+음료수', '세트', 13000],
    ['세트4 · 갑부떡볶이+모듬튀김+오뎅+음료수', '세트', 16000],
    ['세트5 · 갑부떡볶이+모듬튀김+순대+음료수', '세트', 18000],
    ['세트6 · 갑부떡볶이+모듬튀김+순대+오뎅+음료수', '세트', 21000],
    ['세트7 · 갑부떡볶이+모듬튀김+순대+오뎅+김밥+음료수', '세트', 26000],
    ['세트8 · 갑부세트 2배', '세트', 52000],
  ];

  MENUS.forEach(([name, category, price, recipe]) => {
    const recipeItems = (recipe ?? []).map((item) => {
      if (item.kind === 'prep') {
        // 'sauce'는 위에서 만든 양념장 참조
        return { kind: 'prep' as const, prepItemId: sauce.id, qty: item.qty };
      }
      return { kind: 'raw' as const, rawIngredientId: rawByName[item.key], qty: item.qty };
    });
    menuStore.create({
      name,
      category,
      recipe: recipeItems,
      channels: makeChannels(price),
    });
  });

  markInitialized();
}
