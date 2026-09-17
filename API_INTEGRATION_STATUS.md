# 前後端 API 接線狀態

> 更新日期：2026-09-11
> 依已部署容器的 Shop／Admin GraphQL introspection、程式碼與 migration 校正。前端位置是先前 Nuxt 專案盤點，並不在目前 Vendure workspace；因此「前端待接」不代表後端不存在。

## 狀態定義

| 狀態 | 意義 |
| --- | --- |
| 已部署 | 已註冊於運行中的 GraphQL schema，migration 已套用 |
| 前端待接 | 後端已部署，但既有 Nuxt 頁面仍使用 REST、Mock 或 cookie |
| 部分 | 有原生 API 或資料結構，但尚少前端操作流程 |
| 待新增 | 尚未有正式服務或尚未納入本次範圍 |

## 目前可用的 API 入口

| 用途 | 入口 | 說明 |
| --- | --- | --- |
| Shop GraphQL | `/shop-api` | 公開目錄、會員、收藏、瀏覽紀錄、購物流程 |
| Admin GraphQL | `/admin-api` | Dashboard、商品、會員、訂單、Asset、分類、集合與藝廊業務管理 |
| 健康檢查 | `/health` | 服務存活檢查 |
| Stripe webhook | `/payments/stripe/webhook` | 僅接受 Stripe 原始簽章 payload；未設定 Stripe secret 時回 `503 STRIPE_NOT_CONFIGURED` |

目前 Vendure 容器不提供舊 `/api/notifications/*` 或其他 Nuxt REST handler；這些呼叫必須遷移至下方 GraphQL 操作。GraphQL 的 Shop 與 Admin 是兩套不同 schema。Shop session 不能拿來呼叫 Admin API；Admin 前端必須使用 Admin API 的登入 session。

## 部署快照

| 項目 | 已驗證狀態 |
| --- | --- |
| `GalleryBusinessPlugin` | 已載入 server、worker、Shop schema 與 Admin schema |
| Migration | `GalleryBusiness1789136356053` 已套用，建立 13 張 `gallery_*` 業務資料表 |
| 背景工作 | `gallery-business-delivery` 每分鐘執行 Stripe 對帳、逾期邀請／保留處理與寄信 outbox |
| Dashboard | 已加入繁中「銷售」選單：洽詢、私人洽購、付款邀請、通知、內容管理、CRM |
| Stripe | API 與 webhook 已部署；須填入 `STRIPE_SECRET_KEY`、`STRIPE_WEBHOOK_SECRET` 才能建立真實 Checkout |

## 缺口總表

| 功能 | 前端目前位置／行為 | 目前狀態 | 建議正式 API | 主要工作 |
| --- | --- | --- | --- | --- |
| 通知 | 前端尚未串接 Shop GraphQL | 前端待接 | Shop `myNotifications`、`myUnreadNotificationCount`、`markMyNotificationRead`、`markAllMyNotificationsRead`；Admin `notifications`、`createNotification`、`publishNotification`、`archiveNotification` | 已部署通知、收件者、本人已讀、雙語內容與 Dashboard 列表 |
| 收藏／Saved Works | 使用 `sd_cart` cookie 與 mock fallback | 前端待接 | Shop `favoriteArtworks`、`addFavoriteArtwork`、`removeFavoriteArtwork`、`mergeFavoriteArtworks` | 已部署 Customer／Channel 隔離收藏；登入後應合併訪客 cookie 收藏 |
| 藝術家列表／詳情 | `composables/useArtData.ts:19` 讀 `/mock/artists.json` | 前端待接 | Shop `galleryArtists`、`galleryArtist(slug)`；Admin `galleryArtists`、`createGalleryArtist`、`updateGalleryArtist`、`publishGalleryArtist`、`archiveGalleryArtist` | 已部署 Artist 翻譯、Asset、發布狀態與排序 |
| 作品與藝術家關聯 | `utils/vendureCatalog.ts:70` 將 `artistIds` 固定成 `[]` | 前端待接 | `galleryArtworks { artists { id slug name } }` | Product custom field 已保存 Artist 關聯；前端不得再覆寫成空陣列 |
| 作品洽詢 | `/checkout/:id` 仍呼叫舊 REST | 前端待接 | Shop `createInquiry`／`createContactMessage`；Admin `inquiries`、`updateInquiry`、`archiveInquiry` | 已部署作品／客戶關聯、輸入驗證、outbox、分頁搜尋與 Dashboard 列表 |
| 聯絡表單 | `pages/contact/form.vue:18` 只開 `mailto:` | 前端待接 | Shop `createContactMessage` | 以 `GalleryInquiryInput` 提交姓名、Email、電話、主旨、內容、來源與語系 |
| 付款邀請 | `/pay/:id` 仍呼叫舊 REST | 已部署，待設定 | Shop `paymentRequest`、`startPaymentRequestCheckout`、`paymentRequestStatus`；Admin `createPaymentRequest`、`revokePaymentRequest`、`resendPaymentRequest`、`refundPaymentRequest` | Stripe Hosted Checkout、受限 token、訂金／尾款、冪等 webhook、退款與對帳排程已部署；設定 Stripe key 後啟用真實收款 |
| 私人洽購案件 | 前端尚未串接 | 前端待接 | Shop `createPrivatePurchase`、`myPrivatePurchases`、`myPrivatePurchase`、`cancelMyPrivatePurchase`、`claimPrivatePurchase`；Admin `privatePurchases`、`privatePurchase`、`updatePrivatePurchase`、`createPrivatePurchaseProposal` | 已部署狀態機、認領 token、提案版本、付款邀請、交付確認與取消規則 |
| Customer 個人資料 | 只讀 `activeCustomer` | 部分 | 原生 `activeCustomer`、`updateCustomer`；必要時 custom `updateMyCollectorProfile` | 前端接上更新姓名、電話、生日、偏好語言、地址、改密碼、改 Email；角色與審核狀態不可由本人修改 |
| Admin Dashboard | 舊 `/api/admin/stats` 不存在 | 前端待接 | Admin `galleryDashboardStats` | 已部署作品、藝術家、會員、訂單、待處理洽詢、私人案件、付款邀請與 CRM 統計 |
| Admin 作品管理 | 建立、更新、刪除、上傳仍呼叫 `/api/admin/artworks`、`/api/admin/upload` | 部分 | Admin `products`、`createProduct`、`updateProduct`、`deleteProduct`、`createAssets` | 前端改用 Admin GraphQL；作品內容、Variant 價格、庫存、Asset 分開處理 |
| Admin 會員管理 | `/api/admin/users` 舊 REST；未拆 customer／administrator | 部分 | Admin `customers`、`createCustomer`、`updateCustomer`、`deleteCustomer`；管理員使用 `administrators` | 分離顧客與後台管理員；權限改用 Administrator permissions、Customer group／custom field |
| Admin 藝術家管理 | 舊 REST 呼叫；前端未接 Artist GraphQL | 部分 | Admin `galleryArtists`、`createGalleryArtist`、`updateGalleryArtist`、`publishGalleryArtist`、`archiveGalleryArtist` | 前端改 Admin GraphQL；翻譯、圖片、草稿／發布與封存流程一致化 |
| Admin 洽詢管理 | 舊 REST 尚待移除 | 已部署 | Admin `inquiries`、`createInquiry`、`updateInquiry`、`archiveInquiry` | 分頁、搜尋、負責人、狀態、內部備註與 Dashboard 列表已部署 |
| Admin 付款管理 | 舊 REST 尚待移除 | 已部署，待設定 | Admin `paymentRequests`、`createPaymentRequest`、`revokePaymentRequest`、`resendPaymentRequest`、`refundPaymentRequest` | 付款邀請與原生 Payment 分開；需 Stripe 環境變數才會實際建立 Checkout |
| Admin CRM | 舊 REST 尚待移除 | 已部署 | Shop `createGalleryVisitorToken`、`recordGalleryEvent`；Admin `crmOverview`、`crmProfiles`、`crmProfile`、`updateCrmProfile` | CRM profile、簽章訪客 token、事件、階段、最近互動、權限與統計已部署 |
| CMS／內容 | 前端內容尚未改讀 API | 前端待接 | Admin `saveContentPage`、`savePressEntry`、`saveTeamMember`、`saveSiteSettings`、`publishContent`；Shop `siteSettings`、`contentPage`、`pressEntries`、`pressEntry`、`teamMembers` | 已部署雙語草稿／發布版本、受限區塊與 Asset ID 驗證 |
| 搜尋 | 抓全部商品後在瀏覽器過濾 | 部分 | Shop 原生 `search` | 前端改成 server-side search，傳 `term`、`facetValueIds`、分頁與排序；不要下載全量商品 |

## 目前已存在的藝廊 custom GraphQL

以下操作已由 `GalleryCatalogPlugin` 與 `GalleryCollectorPlugin` 提供，前端可以直接串 `/shop-api`。洽購、付款、通知、CRM 與 CMS 則由後述 `GalleryBusinessPlugin` 提供。

### 公開作品與藝術家

```graphql
query GalleryWorks($options: GalleryArtworkListOptions) {
  galleryArtworks(options: $options) {
    totalItems
    items {
      id
      slug
      title
      artists { id slug name }
      image { preview }
      purchaseMode
      available
      purchasableVariantId
      price { amount currencyCode }
    }
  }
}
```

```json
{
  "options": {
    "collectionSlug": "masters",
    "artistSlug": "artist-slug",
    "term": "山水",
    "skip": 0,
    "take": 20
  }
}
```

`GalleryArtworkListOptions` 支援 `collectionId`、`collectionSlug`、`artistSlug`、`categoryId`、`term`、`skip`、`take`。`categoryId` 是 FacetValue；Collection 篩選請使用 `collectionId` 或 `collectionSlug`。

藝術家查詢：

```graphql
query Artists($skip: Int!, $take: Int!) {
  galleryArtists(skip: $skip, take: $take) {
    totalItems
    items { id slug name summary avatarAsset { preview } }
  }
}

query Artist($slug: String!) {
  galleryArtist(slug: $slug) { id slug name summary quote avatarAsset { preview } }
}
```

### 收藏與瀏覽紀錄

這些操作需要登入的 Customer session，resolver 會從 session 取得本人，不接受前端傳入 `customerId`：

```graphql
query MyFavorites($skip: Int!, $take: Int!) {
  favoriteArtworks(skip: $skip, take: $take) {
    totalItems
    lastUpdatedAt
    items { savedAt artwork { id slug title image { preview } } }
  }
}

mutation AddFavorite($productId: ID!) {
  addFavoriteArtwork(productId: $productId) { totalItems items { savedAt artwork { id slug title } } }
}

mutation RemoveFavorite($productId: ID!) {
  removeFavoriteArtwork(productId: $productId)
}

query ArtworkHistory($skip: Int!, $take: Int!) {
  artworkHistory(skip: $skip, take: $take) {
    totalItems
    items { viewedAt sourceCode sourcePath artwork { id slug title } }
  }
}
```

每次成功呼叫 `recordArtworkView` 都會新增一筆事件；重複查看同一作品不會覆蓋前一筆紀錄。收藏及紀錄依 Customer 與 Channel 隔離。

## 藝廊業務 GraphQL

`GalleryBusinessPlugin` 已在 Shop 與 Admin schema 註冊。Shop 操作以登入 Customer 或簽章訪客 token 限制資料範圍；管理操作則依藝廊權限限制。

| 範圍 | Query | Mutation |
| --- | --- | --- |
| Shop 通知 | `myNotifications`、`myUnreadNotificationCount` | `markMyNotificationRead`、`markAllMyNotificationsRead` |
| Shop 洽詢／私人洽購 | `myPrivatePurchases`、`myPrivatePurchase` | `createInquiry`、`createContactMessage`、`createPrivatePurchase`、`claimPrivatePurchase`、`cancelMyPrivatePurchase` |
| Shop 付款 | `paymentRequest`、`paymentRequestStatus` | `startPaymentRequestCheckout` |
| Shop CRM／內容 | `siteSettings`、`contentPage`、`pressEntries`、`pressEntry`、`teamMembers` | `createGalleryVisitorToken`、`recordGalleryEvent` |
| Admin 銷售／付款 | `inquiries`、`inquiry`、`privatePurchases`、`privatePurchase`、`paymentRequests`、`paymentRequest` | `createInquiry`、`updateInquiry`、`archiveInquiry`、`updatePrivatePurchase`、`createPrivatePurchaseProposal`、`confirmPrivatePurchaseDelivery`、`createPaymentRequest`、`revokePaymentRequest`、`resendPaymentRequest`、`refundPaymentRequest` |
| Admin 通知／內容 | `notifications`、`notification`、`contentPages`、`managedContent` | `createNotification`、`updateNotification`、`publishNotification`、`archiveNotification`、`saveContentPage`、`savePressEntry`、`saveTeamMember`、`saveSiteSettings`、`publishContent`、`archiveContent` |
| Admin CRM／統計 | `crmOverview`、`crmProfiles`、`crmProfile`、`galleryDashboardStats` | `updateCrmProfile`、`setMembershipStatus` |

例如，會員可讀取自己的洽購案件：

```graphql
query MyPrivatePurchases($options: GalleryBusinessListOptions) {
  myPrivatePurchases(options: $options) {
    totalItems
    items {
      id
      code
      status
      totalAmount
      remainingAmount
      updatedAt
    }
  }
}
```

付款連結僅傳遞受限 token，不應把 Customer ID、付款金額或 Stripe session ID 放進前端可修改的參數。`startPaymentRequestCheckout` 會由後端依付款邀請建立 Stripe Hosted Checkout。

## Collection 階層與作品查詢

前端先取 Collection 樹，再用 ID 或 slug 查作品：

```graphql
query CollectionTree {
  collections(options: { topLevelOnly: true }) {
    items {
      id
      name
      slug
      parentId
      children {
        id
        name
        slug
        parentId
        children { id name slug parentId }
      }
    }
  }
}
```

```graphql
query WorksByCollection($options: GalleryArtworkListOptions) {
  galleryArtworks(options: $options) {
    totalItems
    items { id slug title artists { id slug name } image { preview } }
  }
}
```

```json
{ "options": { "collectionId": "4", "skip": 0, "take": 20 } }
```

目前 Collection 篩選是「Variant 直接掛在該 Collection」的語義；查父集合不會自動把所有子集合的作品合併。若頁面要顯示父集合及所有後代作品，前端先遞迴收集子孫 ID，再並行查詢或由後端另加 descendant filter。

## 原生 Vendure 對照

### Shop API 可直接使用

| 用途 | 原生操作 |
| --- | --- |
| 商品／Variant | `products`、`product`、`search` |
| Collection 階層 | `collections`、`collection`、`children`、`breadcrumbs` |
| 登入／登出 | `login`、`authenticate`、`logout` |
| 個人資料 | `activeCustomer`、`updateCustomer`、地址 mutations |
| 購物車／結帳 | `activeOrder`、`addItemToOrder`、`setOrderShippingAddress`、`transitionOrderToState`、`addPaymentToOrder` |
| 訂單 | `activeCustomer.orders`、`orderByCode` |
| Asset 公開讀取 | Product／Collection／custom entity 回傳的 Asset 欄位 |

### Admin API 可直接使用

| 用途 | 原生操作／資源 |
| --- | --- |
| 作品 | `products`、`createProduct`、`updateProduct`、`deleteProduct`、ProductVariant mutations |
| 上傳 | `createAssets`（GraphQL multipart） |
| Collection／Facet | `collections`、Collection mutations、`facets`／`facetValues` |
| Customer | `customers`、`createCustomer`、`updateCustomer`、`deleteCustomer` |
| Administrator | `administrators`、`createAdministrator`、`updateAdministrator`、`deleteAdministrator` |
| 訂單／付款紀錄 | `orders`、Order／Payment 原生查詢與狀態 mutations |

Artist 由 `GalleryCatalogPlugin` 提供；Notification、Inquiry、PrivatePurchase、PaymentRequest、CRM、CMS 由 `GalleryBusinessPlugin` 提供。它們不是 Vendure 核心的通用欄位，升級或移植環境時必須一併載入對應 plugin、migration 與權限設定。

## Admin 特別注意：登入 session

`layouts/admin.vue` 目前使用一般 `useAuth()`，這個 hook 對應 Shop GraphQL session。即使設定了 `adminApiUrl`，仍不能因此取得 Admin 權限。Admin 前端需要：

1. 使用 `/admin-api` 呼叫 `login`。
2. 以 `credentials: 'include'` 保留 Admin cookie，或保存 `vendure-auth-token` bearer token。
3. 後續所有管理 query／mutation 都送到 `/admin-api`。
4. 登出時呼叫 Admin API 的 `logout`，不要只清除 Shop session。
5. 商品與 Collection 使用 Vendure 原生 `Permission.ReadCatalog`、`Permission.UpdateCatalog` 等權限；藝廊業務則使用 `ReadGallerySales`、`ManageGallerySales`、`ManageGalleryPayments`、`ManageGalleryContent`、`ManageGalleryCrm`、`ManageGalleryMembership`。

## 建議接線順序

1. 先把前端 API client 分成 `shopClient` 與 `adminClient`，完成 Admin login/session。
2. 先切換作品、Collection、藝術家、搜尋，移除 Mock 與瀏覽器全量過濾。
3. 接上收藏與瀏覽事件；登入時處理訪客收藏合併。
4. 接 Customer 個人資料、地址與帳號安全流程。
5. 接 Inquiry、PrivatePurchase、付款邀請與 Stripe Checkout；在部署環境填入 Stripe secret 並設定 webhook。
6. 接通知、CRM、Dashboard 統計與 CMS，最後移除仍被使用的舊 REST、cookie mock 與靜態 JSON 呼叫。

## 相關程式與文件

- `packages/dev-server/plugins/gallery-catalog/api/api-extensions.ts`：作品／藝術家 Shop、Admin schema
- `packages/dev-server/plugins/gallery-catalog/services/gallery-catalog.service.ts`：作品、藝術家、Collection 篩選
- `packages/dev-server/plugins/gallery-collector/collector.plugin.ts`：收藏與瀏覽紀錄 GraphQL
- `packages/dev-server/plugins/gallery-collector/collector.service.ts`：本人權限、分頁與事件保存
- `packages/dev-server/plugins/gallery-business/gallery-business.plugin.ts`：業務 plugin、權限、排程與 Stripe webhook 註冊
- `packages/dev-server/plugins/gallery-business/schema.ts`：Shop／Admin 業務 GraphQL schema 與 resolver
- `packages/dev-server/plugins/gallery-business/payment.service.ts`：付款邀請、Stripe Checkout、webhook 與退款
- `packages/dev-server/plugins/gallery-business/dashboard/index.tsx`：繁中銷售管理選單與列表頁
- `packages/dev-server/migrations/1789136356053-gallery-business.ts`：業務資料表 migration
- `.env.example`：Stripe 與服務環境變數範本
- `GRAPHQL_INTEGRATION_GUIDE.md`：Shop／Admin GraphQL 基礎串接與 Collection 範例
- `VENDURE_BACKEND_REQUIREMENTS.md`：完整資料模型、48 條舊 REST 契約與 GraphQL 對照
