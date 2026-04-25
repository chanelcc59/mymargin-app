# 마이마진 (MyMargin)

요식업 자영업자용 SaaS — **원가 · 재고 · 채널별 마진 관리**

현재 **1차 실제 기능 구현 단계**. LocalStorage 기반 로컬 저장, Supabase 연동은 다음 단계.

---

## 🧩 스택

- **Next.js 14** (App Router) + TypeScript
- **Tailwind CSS** (프로토타입 색상 토큰 이식 완료)
- **저장소**: `localStorage` (인터페이스가 `store.ts`에 격리되어 있어 Supabase 교체 용이)
- **상태**: React useState (글로벌 스토어 없음, 필요 시 Zustand 등 추가 예정)

---

## 🚀 시작하기

### 1. 의존성 설치

```bash
npm install
```

### 2. 개발 서버 실행

```bash
npm run dev
```

http://localhost:3000 에서 열림. `/owner/home` 으로 자동 리다이렉트.

### 3. 원가 엔진 테스트

```bash
npm run test:cost
```

`test-cost-engine.mjs` 실행 → 양념장 원가, 메뉴 원가, 채널별 마진, 단가 변경 전파를 검증.

---

## 📁 폴더 구조

```
src/
├── types/
│   └── domain.ts            # 도메인 타입 (RawIngredient, PrepItem, Menu, ...)
├── lib/
│   ├── cost-engine.ts       # 원가 · 마진 계산 (순수 함수)
│   └── store.ts             # localStorage CRUD + 시드 데이터
├── components/
│   ├── Logo.tsx             # 브랜드 로고
│   └── AppShell.tsx         # 사이드바 + 모바일 헤더/탭
└── app/
    ├── layout.tsx           # 루트 레이아웃
    ├── globals.css          # 글로벌 CSS + 웹폰트
    ├── page.tsx             # / → /owner/home 리다이렉트
    └── owner/
        ├── layout.tsx
        ├── StorageInit.tsx  # 최초 진입 시 시드 데이터 주입
        ├── home/page.tsx    # 홈 (요약 + TOP 3)
        ├── ingredients/page.tsx    # 일반 재료 CRUD
        ├── prep-items/page.tsx     # 준비 재료 CRUD
        ├── menus/page.tsx          # 메뉴 목록
        └── menus/[id]/page.tsx     # 메뉴 상세 (레시피 + 채널 마진)
```

---

## 🧮 도메인 모델

### RawIngredient (일반 재료)
```ts
{ id, name, unit, unitCost, note? }
```
`unit`당 `unitCost` 원. 예: 고춧가루 unit='g', unitCost=12 → 1g에 12원.

### PrepItem (준비 재료)
```ts
{ id, name, yieldQty, yieldUnit, items: PrepRecipeItem[], note? }
```
양념장·육수처럼 미리 만들어두는 재료. `yieldQty` 단위 생산분에 들어간 재료들을 `items`로 저장.
**준비 재료 단가** = 총 재료비 / yieldQty

### Menu
```ts
{ id, name, category?, recipe: MenuRecipeItem[], channels: MenuChannelConfig[] }
```
`recipe`는 1인분 기준. 각 항목은 `raw` 또는 `prep` 참조.
`channels`는 `dine_in`, `takeout`, `delivery` 각각에 대한 판매가·설정.

---

## 🎯 계산 규칙

### 메뉴 식재료 원가
```
foodCost = Σ (recipe item 단가 × 수량)
```
- `raw` 항목: `raw.unitCost × item.qty`
- `prep` 항목: `prep.costPerUnit × item.qty` (준비 재료 단가는 실시간 계산)

### 채널별 공헌이익
```
netRevenue = salePrice / 1.1                 # 부가세 분리
platformFee = netRevenue × platformFeeRate   # 배달앱 수수료
paymentFee = netRevenue × paymentFeeRate     # 카드/PG 수수료
contributionProfit = netRevenue - foodCost - platformFee - paymentFee - packagingCost - extraCost
contributionMarginRate = contributionProfit / netRevenue
```

### 기본 채널 설정 (점주 override 가능)
| 채널 | 플랫폼 수수료 | 결제 수수료 | 포장비 |
|---|---|---|---|
| 매장 (dine_in) | 0% | 2.0% | 0원 |
| 포장 (takeout) | 0% | 2.0% | 300원 |
| 배달 (delivery) | 12% | 3.0% | 500원 |

---

## ✅ 현재 되는 기능

1. **일반 재료 등록/수정/삭제** (`/owner/ingredients`)
2. **준비 재료 등록/수정/삭제** + 일반 재료 조합 (`/owner/prep-items`)
3. **메뉴 등록** + 레시피에 일반 재료/준비 재료 연결 (`/owner/menus/[id]`)
4. **메뉴 원가 자동 계산** — 1인분 식재료 원가 실시간
5. **매장/포장/배달 채널별 마진 자동 계산** — 부가세 · 수수료 · 포장비 감안
6. **단가 변경 전파** — 일반 재료 단가 바꾸면 → 준비 재료 단가 → 메뉴 원가 → 채널별 마진까지 자동 반영

---

## 🚫 의도적으로 하지 않은 것 (1차 범위 외)

- 준비 재료 재고 차감
- 로스율 상세 엔진
- 통장 거래 연결
- 정산 업로드
- 근태 위치 제한 실제 구현
- 멀티 매장 전환 (구조는 준비됨)
- Supabase 연동 (localStorage로 선행 검증 중)

---

## 🔜 다음 단계 (예정)

1. Supabase 프로젝트 생성 + 스키마 설치
2. `src/lib/store.ts` 구현만 바꾸고 나머지 코드는 그대로 유지
3. 인증 (Supabase Auth)
4. 멀티 매장 지원
5. 재고 CRUD + 입고/폐기 이벤트
6. 일자 × 채널 × 메뉴 판매 집계

---

## 💡 개발 팁

- 데이터 초기화: 브라우저 콘솔에서 `localStorage.clear()` 후 새로고침
- 시드 데이터는 `src/lib/store.ts`의 `seedDemoData()` 함수에 있음 (버전 기반으로 한 번만 실행)
- 계산 로직은 모두 `src/lib/cost-engine.ts`의 **순수 함수**. UI 의존성 없음 → 쉽게 테스트 가능
