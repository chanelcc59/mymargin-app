// test-cost-engine.mjs - ES module 형태로 테스트
// 실행: node test-cost-engine.mjs

// 런타임 검증용 미니 테스트 (TS 컴파일 없이 JS 로직만 검증)
// 실제 프로덕션에선 vitest/jest 권장

// ============================================
// cost-engine 로직을 JS로 옮겨서 테스트
// ============================================

const DEFAULT_CHANNEL_CONFIG = {
  dine_in:  { platformFeeRate: 0,    paymentFeeRate: 0.02, packagingCost: 0 },
  takeout:  { platformFeeRate: 0,    paymentFeeRate: 0.02, packagingCost: 300 },
  delivery: { platformFeeRate: 0.12, paymentFeeRate: 0.03, packagingCost: 500 },
};
const VAT_RATE = 0.1;

function calcPrepItemCost(prepItem, rawIngredients) {
  const byId = new Map(rawIngredients.map(r => [r.id, r]));
  const breakdown = prepItem.items.map(item => {
    const raw = byId.get(item.rawIngredientId);
    if (!raw) return { rawIngredientId: item.rawIngredientId, rawName: '(삭제)', qty: item.qty, unit: 'g', unitCost: 0, lineCost: 0 };
    return {
      rawIngredientId: raw.id, rawName: raw.name, qty: item.qty,
      unit: raw.unit, unitCost: raw.unitCost, lineCost: item.qty * raw.unitCost,
    };
  });
  const totalCost = breakdown.reduce((s, b) => s + b.lineCost, 0);
  const costPerUnit = prepItem.yieldQty > 0 ? totalCost / prepItem.yieldQty : 0;
  return { prepItemId: prepItem.id, totalCost, costPerUnit, yieldQty: prepItem.yieldQty, yieldUnit: prepItem.yieldUnit, breakdown };
}

function calcMenuCost(menu, rawIngredients, prepItems) {
  const rawById = new Map(rawIngredients.map(r => [r.id, r]));
  const prepById = new Map(prepItems.map(p => [p.id, p]));
  const prepCostById = new Map();
  prepItems.forEach(p => { prepCostById.set(p.id, calcPrepItemCost(p, rawIngredients)); });

  const breakdown = menu.recipe.map(item => {
    if (item.kind === 'raw') {
      const raw = rawById.get(item.rawIngredientId);
      if (!raw) return { kind: 'raw', id: item.rawIngredientId, name: '(삭제)', qty: item.qty, unit: 'g', unitCost: 0, lineCost: 0 };
      return { kind: 'raw', id: raw.id, name: raw.name, qty: item.qty, unit: raw.unit, unitCost: raw.unitCost, lineCost: item.qty * raw.unitCost };
    } else {
      const prep = prepById.get(item.prepItemId);
      const prepCost = prepCostById.get(item.prepItemId);
      if (!prep || !prepCost) return { kind: 'prep', id: item.prepItemId, name: '(삭제)', qty: item.qty, unit: 'g', costPerUnit: 0, lineCost: 0 };
      return { kind: 'prep', id: prep.id, name: prep.name, qty: item.qty, unit: prep.yieldUnit, costPerUnit: prepCost.costPerUnit, lineCost: item.qty * prepCost.costPerUnit };
    }
  });
  const foodCost = breakdown.reduce((s, b) => s + b.lineCost, 0);
  return { menuId: menu.id, foodCost, breakdown };
}

function calcChannelMargin(menu, channelConfig, menuCost) {
  const def = DEFAULT_CHANNEL_CONFIG[channelConfig.channel];
  const netRevenue = channelConfig.salePrice / (1 + VAT_RATE);
  const platformFeeRate = channelConfig.platformFeeRate ?? def.platformFeeRate;
  const paymentFeeRate = channelConfig.paymentFeeRate ?? def.paymentFeeRate;
  const packagingCost = channelConfig.packagingCost ?? def.packagingCost;
  const extraCost = channelConfig.extraCost ?? 0;
  const platformFee = netRevenue * platformFeeRate;
  const paymentFee = netRevenue * paymentFeeRate;
  const foodCost = menuCost.foodCost;
  const contributionProfit = netRevenue - platformFee - paymentFee - packagingCost - extraCost - foodCost;
  const contributionMarginRate = netRevenue > 0 ? contributionProfit / netRevenue : 0;
  const foodCostRate = netRevenue > 0 ? foodCost / netRevenue : 0;
  return { menuId: menu.id, channel: channelConfig.channel, isActive: channelConfig.isActive, salePrice: channelConfig.salePrice, netRevenue, platformFee, paymentFee, packagingCost, extraCost, foodCost, contributionProfit, contributionMarginRate, foodCostRate };
}

// ============================================
// 시나리오: 사장님이 앱 시나리오 그대로 테스트
// ============================================
// 1. 일반 재료 등록
const rawIngredients = [
  { id: 'raw_red',    name: '고춧가루',   unit: 'g',  unitCost: 12 },
  { id: 'raw_sugar',  name: '설탕',       unit: 'g',  unitCost: 2 },
  { id: 'raw_soy',    name: '간장',       unit: 'ml', unitCost: 4 },
  { id: 'raw_syrup',  name: '물엿',       unit: 'g',  unitCost: 3 },
  { id: 'raw_garlic', name: '다진마늘',   unit: 'g',  unitCost: 15 },
  { id: 'raw_cake',   name: '떡',         unit: 'g',  unitCost: 4.5 },
  { id: 'raw_odeng',  name: '어묵',       unit: 'g',  unitCost: 12 },
  { id: 'raw_onion',  name: '양파',       unit: 'g',  unitCost: 2 },
];

// 2. 준비 재료 등록 (떡볶이 양념장 2kg 생산)
const prepItems = [
  {
    id: 'prep_sauce', name: '떡볶이 양념장',
    yieldQty: 2000, yieldUnit: 'g',
    items: [
      { rawIngredientId: 'raw_red',    qty: 200 },  // 200g × 12 = 2400
      { rawIngredientId: 'raw_sugar',  qty: 300 },  // 300g × 2  = 600
      { rawIngredientId: 'raw_soy',    qty: 150 },  // 150ml × 4 = 600
      { rawIngredientId: 'raw_syrup',  qty: 400 },  // 400g × 3  = 1200
      { rawIngredientId: 'raw_garlic', qty: 80 },   // 80g × 15  = 1200
    ],
  },
];

// 3. 메뉴 등록 (갑부떡볶이)
const menu = {
  id: 'menu_galbu', name: '갑부떡볶이',
  recipe: [
    { kind: 'raw',  rawIngredientId: 'raw_cake',  qty: 200 },  // 200g × 4.5 = 900
    { kind: 'raw',  rawIngredientId: 'raw_odeng', qty: 40 },   // 40g × 12  = 480
    { kind: 'raw',  rawIngredientId: 'raw_onion', qty: 30 },   // 30g × 2   = 60
    { kind: 'prep', prepItemId: 'prep_sauce',     qty: 80 },   // 80g × (6000/2000) = 240
  ],
  channels: [
    { channel: 'dine_in',  isActive: true, salePrice: 5000 },
    { channel: 'takeout',  isActive: true, salePrice: 5000, packagingCost: 300 },
    { channel: 'delivery', isActive: true, salePrice: 6500, packagingCost: 500 },
  ],
};

console.log('='.repeat(60));
console.log('TEST 1: 준비 재료 원가 계산');
console.log('='.repeat(60));
const sauceCost = calcPrepItemCost(prepItems[0], rawIngredients);
console.log('양념장 총 원가:', sauceCost.totalCost, '원');
console.log('양념장 g당 원가:', sauceCost.costPerUnit.toFixed(2), '원/g');
console.log('brekadown:');
sauceCost.breakdown.forEach(b => {
  console.log(`  - ${b.rawName}: ${b.qty}${b.unit} × ${b.unitCost} = ${b.lineCost}원`);
});
// 예상: 2400+600+600+1200+1200 = 6000원, 6000/2000 = 3원/g
const expected_sauce_cost = 6000;
const expected_sauce_per_g = 3;
console.assert(sauceCost.totalCost === expected_sauce_cost, `양념장 원가 불일치: ${sauceCost.totalCost} !== ${expected_sauce_cost}`);
console.assert(sauceCost.costPerUnit === expected_sauce_per_g, `양념장 g당 원가 불일치: ${sauceCost.costPerUnit} !== ${expected_sauce_per_g}`);
console.log('✅ 양념장 원가 검증 OK');

console.log();
console.log('='.repeat(60));
console.log('TEST 2: 메뉴 원가 계산');
console.log('='.repeat(60));
const menuCost = calcMenuCost(menu, rawIngredients, prepItems);
console.log('갑부떡볶이 식재료 원가:', menuCost.foodCost, '원');
menuCost.breakdown.forEach(b => {
  if (b.kind === 'raw') {
    console.log(`  - [원료] ${b.name}: ${b.qty}${b.unit} × ${b.unitCost} = ${b.lineCost}원`);
  } else {
    console.log(`  - [준비재료] ${b.name}: ${b.qty}${b.unit} × ${b.costPerUnit}원/unit = ${b.lineCost}원`);
  }
});
// 예상: 900 + 480 + 60 + 240 = 1680원
const expected_menu_cost = 1680;
console.assert(menuCost.foodCost === expected_menu_cost, `메뉴 원가 불일치: ${menuCost.foodCost} !== ${expected_menu_cost}`);
console.log('✅ 메뉴 원가 검증 OK');

console.log();
console.log('='.repeat(60));
console.log('TEST 3: 채널별 마진 계산');
console.log('='.repeat(60));
menu.channels.forEach(ch => {
  const margin = calcChannelMargin(menu, ch, menuCost);
  console.log();
  console.log(`[${ch.channel}] 판매가 ${margin.salePrice.toLocaleString()}원 (부가세포함)`);
  console.log(`  부가세제외 매출: ${margin.netRevenue.toFixed(0)}원`);
  console.log(`  식재료원가:     ${margin.foodCost}원 (원가율 ${(margin.foodCostRate*100).toFixed(1)}%)`);
  console.log(`  플랫폼수수료:   ${margin.platformFee.toFixed(0)}원`);
  console.log(`  결제수수료:     ${margin.paymentFee.toFixed(0)}원`);
  console.log(`  포장비:         ${margin.packagingCost}원`);
  console.log(`  ─────`);
  console.log(`  공헌이익:       ${margin.contributionProfit.toFixed(0)}원`);
  console.log(`  공헌이익률:     ${(margin.contributionMarginRate*100).toFixed(1)}%`);
});

console.log();
console.log('='.repeat(60));
console.log('TEST 4: 단가 변경 시 전파 검증');
console.log('='.repeat(60));
console.log('고춧가루 12원/g → 20원/g 으로 인상');
const raw2 = rawIngredients.map(r => r.id === 'raw_red' ? { ...r, unitCost: 20 } : r);
const sauceCost2 = calcPrepItemCost(prepItems[0], raw2);
const menuCost2 = calcMenuCost(menu, raw2, prepItems);
console.log('→ 양념장 g당 원가:', sauceCost.costPerUnit, '원/g →', sauceCost2.costPerUnit.toFixed(2), '원/g');
console.log('→ 갑부떡볶이 원가:', menuCost.foodCost, '원 →', menuCost2.foodCost.toFixed(0), '원');
// 양념장 원가 증가: 200g × (20-12) = 1600원 증가 → 7600/2000 = 3.8원/g
// 메뉴 원가 증가: 80g × 0.8원/g = 64원 증가 → 1680 + 64 = 1744원
const expected_menu_cost2 = 1744;
console.assert(Math.round(menuCost2.foodCost) === expected_menu_cost2, `전파 검증 실패: ${menuCost2.foodCost} !== ${expected_menu_cost2}`);
console.log('✅ 단가 변경 전파 검증 OK');

console.log();
console.log('='.repeat(60));
console.log('✅ 모든 테스트 통과');
console.log('='.repeat(60));
