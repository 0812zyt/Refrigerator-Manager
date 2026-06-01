# 前端系統開發與實作分析

## 目錄

- [4-3 前端系統開發與介面設計分析](#4-3-前端系統開發與介面設計分析) ............ 1
  - [4-3-1 技術架構與專案結構分析](#4-3-1-技術架構與專案結構分析) ................ 1
  - [4-3-3 API 串接與資料流設計分析](#4-3-3-api-串接與資料流設計分析) ............ 3
  - [4-3-3 元件設計與互動邏輯分析](#4-3-3-元件設計與互動邏輯分析) ................ 5
  - [4-3-4 照片儲存與本地端快取機制分析](#4-3-4-照片儲存與本地端快取機制分析) .... 7
  - [4-3-5 本階段前端實作結論](#4-3-5-本階段前端實作結論) ........................ 9

---

## 4-3 前端系統開發與介面設計分析

本階段前端以 **React 18 + TypeScript + Vite** 為核心框架，部署於 **Vercel**，並透過 REST API 與後端 FastAPI 服務溝通。整體架構以單頁應用（SPA）方式呈現，主要涵蓋登入、食材庫存管理、新增 / 編輯食材、等功能。

---

## 4-3-1 技術架構與專案結構分析

### 技術選型

| 層級 | 技術 |
|------|------|
| 框架 | React 18 + TypeScript |
| 建置工具 | Vite |
| 部署平台 | Vercel |
| 狀態管理 | React useState / useContext |
| 樣式方案 | Inline CSS（React.CSSProperties）|
| 本地快取 | localStorage |

### 專案目錄結構

```
frontend/
├── src/
│   ├── main.tsx                  # 應用程式進入點
│   ├── App.tsx                   # 根元件，處理路由與登入狀態
│   ├── api/
│   │   ├── client.ts             # 所有 API 呼叫函式
│   │   └── types.ts              # TypeScript 型別定義
│   ├── context/
│   │   └── ThemeContext.tsx      # 深色 / 淺色主題全域狀態
│   ├── pages/
│   │   ├── LoginPage.tsx         # 登入頁
│   │   └── DashboardPage.tsx     # 主儀表板頁（食材列表、搜尋、篩選）
│   └── components/
│       ├── AddChoiceModal.tsx    # 新增方式選擇彈窗（手動 / 拍照辨識）
│       ├── AddItemModal.tsx      # 手動新增食材彈窗
│       ├── EditItemModal.tsx     # 編輯食材彈窗
│       ├── ImageRecognizeModal.tsx # AI 圖片辨識彈窗
│       └── SystemStatusBar.tsx   # 後端系統狀態顯示列
├── index.html
├── vite.config.ts
└── package.json
```

### 路由設計

應用透過 `window.location.pathname` 簡易路由，無需引入額外路由套件：

- `/` → 登入頁 → 儀表板頁（依 localStorage 登入狀態切換）
- `/demo` → `FridgeManagerDemo`（展示用靜態頁面）

---

## 4-3-3 API 串接與資料流設計分析

### API 基礎設定

後端服務部署於 Render（免費方案），Base URL 定義於 `src/api/client.ts`：

```ts
const BASE = 'https://smartfridge-f6b6.onrender.com/api/v1';
```

統一使用 `request<T>()` 泛型函式處理 fetch、錯誤解析與 JSON 回傳，避免重複程式碼。

### 主要 API 函式

| 函式 | 方法 | 路徑 | 用途 |
|------|------|------|------|
| `getUsers()` | GET | `/users` | 取得所有使用者 |
| `getCategories()` | GET | `/categories` | 取得食材分類 |
| `getIngredients()` | GET | `/ingredients` | 取得食材清單 |
| `searchIngredients(keyword)` | GET | `/ingredients/search/{keyword}` | 搜尋食材 |
| `createIngredient(data)` | POST | `/ingredients` | 新增食材定義 |
| `getInventory(user_id)` | GET | `/inventory?user_id=` | 取得使用者庫存 |
| `createInventory(data)` | POST | `/inventory` | 新增庫存項目 |
| `updateInventory(id, data)` | PUT | `/inventory/{id}` | 更新庫存項目 |
| `deleteInventory(id)` | DELETE | `/inventory/{id}` | 刪除庫存項目 |
| `wakeSystem()` | POST | `/system/wake` | 喚醒後端服務 |

### 資料型別定義（`src/api/types.ts`）

```ts
interface InventoryItem {
  inventory_id: number;
  user_id: string;
  ingredient_id: number;
  ingredient_name: string | null;
  quantity: number;
  added_date: string;
  expire_date: string;
  custom_expire: boolean;
  urgent_flag: boolean;
}
```

---

## 4-3-3 元件設計與互動邏輯分析

### DashboardPage（主儀表板）

負責整體庫存管理流程，核心功能包含：

- **食材列表**：依分類 Tab 篩選、關鍵字搜尋，顯示到期天數徽章（`ExpiryBadge`）
- **到期警示 Tab**：列出 3 天內即將到期或已過期食材
- **新增入口**：點擊「＋ 新增」開啟 `AddChoiceModal`，選擇手動輸入或拍照辨識

到期天數計算邏輯：
```ts
const getDaysLeft = (d: string) =>
  Math.ceil((new Date(d).getTime() - today.getTime()) / 86400000);
```

到期徽章顏色規則：

| 天數 | 背景色 | 標籤 |
|------|--------|------|
| 已過期（< 0）| 紅色 | 已過期 |
| 今天（= 0）| 橘色 | 今天到期 |
| 1–3 天 | 黃橘色 | N 天後到期 |
| 3–7 天 | 黃色 | N 天後到期 |
| > 7 天 | 綠色 | N 天後到期 |

### AddItemModal（手動新增食材）

互動流程：
1. 使用者輸入食材名稱 → 即時過濾現有食材清單（下拉選單）
3. 選擇已有食材或手動輸入新名稱（自動 `createIngredient`）
3. 選擇分類、調整數量（`−` / `＋` 按鈕）、選擇到期日
4. 可上傳「商品照片」與「有效期限照片」（暫存 localStorage）
5. 送出後呼叫 `createInventory`，並將照片以 `inventory_id` 為 key 寫入 localStorage

### EditItemModal（編輯食材）

- 顯示目前食材名稱（唯讀）
- 可修改數量、到期日
- 可更換 / 刪除商品照片與到期日照片
- 儲存呼叫 `updateInventory`（帶 `custom_expire: true`）

### ImageRecognizeModal（AI 拍照辨識）

- 拍攝或上傳商品照片後，呼叫後端 AI 辨識 API
- 辨識結果自動帶入 `AddItemModal` 的食材名稱與分類欄位（`prefill` props）

### 主題切換（ThemeContext）

透過 CSS 變數（`--surface`, `--accent`, `--text-3` 等）實現深色 / 淺色模式，全域由 `ThemeProvider` 管理，可透過右上角設定齒輪即時切換。

---

## 4-3-4 照片儲存與本地端快取機制分析

### 設計動機

為讓使用者拍攝的商品照片與到期日照片可在重整頁面後保留，採用 **localStorage** 作為暫存方案，無需變更後端資料庫結構。

### 儲存鍵值規則

```
fridge_photo_product_{inventory_id}   ← 商品照片（base64 Data URL）
fridge_photo_expire_{inventory_id}    ← 有效期限照片（base64 Data URL）
```

### 核心函式（EditItemModal / AddItemModal 共用邏輯）

```ts
function photoKey(id: number, type: 'product' | 'expire') {
  return `fridge_photo_${type}_${id}`;
}
function loadPhoto(id: number, type: 'product' | 'expire') {
  return localStorage.getItem(photoKey(id, type));
}
function savePhoto(id: number, type: 'product' | 'expire', dataUrl: string | null) {
  if (dataUrl) localStorage.setItem(photoKey(id, type), dataUrl);
  else localStorage.removeItem(photoKey(id, type));
}
```

### 照片選擇器（PhotoPickerSheet）

在行動裝置上，直接呼叫 `input.click()` 不穩定，因此改以 `<label>` 包裹 `<input type="file">` 的方式實作，確保相冊與相機選項均可正常觸發：

```tsx
<label>
  從相冊中選擇
  <input type="file" accept="image/*" style={{ display: 'none' }} onChange={...} />
</label>
<label>
  使用相機
  <input type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={...} />
</label>
```

`capture="environment"` 指定使用後置鏡頭，符合拍攝商品條碼 / 日期標籤的使用情境。

### 資料流示意圖

```
使用者拍照
    ↓
FileReader.readAsDataURL()
    ↓
base64 Data URL
    ↓
setState（即時預覽）
    ↓（儲存時）
localStorage.setItem(key, dataUrl)
    ↓（下次開啟 EditItemModal）
localStorage.getItem(key) → 載入預覽
```

### 限制與後續計畫

| 面向 | 現況 | 後續改善方向 |
|------|------|------------|
| 儲存位置 | 瀏覽器 localStorage | 上傳至後端（Supabase Storage 或 S3）|
| 跨裝置同步 | 不支援 | 需後端儲存才能跨裝置顯示 |
| 容量限制 | ~5 MB（各瀏覽器不同）| 壓縮圖片或改用後端儲存 |
| 資料保存 | 清除瀏覽器資料即消失 | 後端儲存可永久保留 |

---

## 4-3-5 本階段前端實作結論

本階段前端系統達成以下目標：

1. **完整 CRUD 操作介面**：使用者可新增、瀏覽、編輯、刪除冰箱庫存，操作流程直觀。
3. **到期日視覺化管理**：透過顏色徽章即時顯示食材新鮮狀態，並設有專屬警示 Tab。
3. **照片輔助功能**：支援上傳商品照片與有效期限照片，以 localStorage 暫存，降低手動輸入錯誤率。
4. **行動裝置相容性**：PhotoPickerSheet 採 `<label>` 方案確保 iOS / Android 均可正常喚起相冊與相機。
5. **AI 辨識整合**：拍照後自動帶入食材名稱，減少手動輸入步驟。
6. **主題切換**：支援深色 / 淺色模式，提升長時間使用的視覺舒適度。

後續可優化方向包含：照片上傳後端化、離線快取（PWA Service Worker）、食材建議購買功能，以及推播通知整合。
