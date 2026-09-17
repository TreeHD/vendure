# Vendure GraphQL 串接指南

本文件說明目前 Vendure server 的 GraphQL 串接方式，包含 Shop API（商店前台）與 Admin API（管理後台）。GraphQL schema 會隨 plugin、custom field 與設定變化，因此每次串接都應以伺服器的 introspection 文件為準。

## 1. 端點與工具

Docker Compose 啟動後，預設端點如下：

| 用途 | URL |
| --- | --- |
| Shop API | `http://localhost:3000/shop-api` |
| Admin API | `http://localhost:3000/admin-api` |
| Dashboard | `http://localhost:3000/dashboard/` |
| Swagger UI | `http://localhost:3000/swagger` |
| OpenAPI JSON | `http://localhost:3000/swagger-json` |

Shop API 給 storefront、會員與購物流程使用；Admin API 給內部管理工具使用。兩者是不同的 GraphQL schema，不能把 Admin API 的 query 直接送到 Shop API。

若修改了 `apiOptions.adminApiPath`、`apiOptions.shopApiPath` 或 port，以上 URL 要跟著設定變更。

開發時可用 GraphiQL 或 Dashboard 的 GraphQL explorer 查看型別：

```text
http://localhost:3000/graphiql/shop
http://localhost:3000/graphiql/admin
```

本專案的 GraphiQL 在最小 Docker 設定中關閉；若要啟用，需在 Dockerfile 建置 `@vendure/graphiql-plugin`，並移除 `VENDURE_SERVE_GRAPHIQL=false`。

完整 schema 也可以直接下載：

```bash
curl http://localhost:3000/shop-api \
  -H 'content-type: application/json' \
  --data '{"query":"{ __schema { queryType { name } } }"}'
```

Swagger 只描述 HTTP 請求與範例，不會把每個 GraphQL operation 變成 REST route。GraphQL 的完整欄位、參數與 union 請以 GraphiQL 的 Docs 面板或 introspection 為準。

## 2. 基本 HTTP 請求

每次請求都是 `POST`，body 至少包含 `query`，通常也包含 `variables` 與可選的 `operationName`：

```http
POST /shop-api HTTP/1.1
Host: localhost:3000
Content-Type: application/json
vendure-token: __default_channel__

{
  "operationName": "GetProducts",
  "query": "query GetProducts($options: ProductListOptions) { products(options: $options) { totalItems items { id name slug } } }",
  "variables": {
    "options": { "take": 20, "skip": 0 }
  }
}
```

JavaScript `fetch` 範例：

```js
const response = await fetch('http://localhost:3000/shop-api', {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    'vendure-token': '__default_channel__',
  },
  credentials: 'include',
  body: JSON.stringify({
    operationName: 'GetProducts',
    query: `query GetProducts($options: ProductListOptions) {
      products(options: $options) {
        totalItems
        items { id name slug }
      }
    }`,
    variables: { options: { take: 20, skip: 0 } },
  }),
});

const body = await response.json();
if (body.errors?.length) throw new Error(body.errors[0].message);
console.log(body.data.products);
```

成功的 HTTP status 不代表業務成功。GraphQL server 可能回傳 HTTP 200，但 body 同時有 `errors`，或 mutation 回傳 `ErrorResult` union。正式 client 必須同時檢查 HTTP status、`errors`、`data` 與 `errorCode`。

## 3. Channel、認證與 session

### 3.1 Channel header

`vendure-token` 是 Channel token，不是登入 token。公開請求可省略，伺服器會使用預設 channel；多 channel 商店則應在每次 Shop API 請求加上對應 channel token：

```http
vendure-token: __default_channel__
```

Admin API 查詢 channel 後，也可以在請求使用 channel code/token。不要把 Channel token 當作密碼或 `Authorization: Bearer` token。

### 3.2 Cookie session（推薦瀏覽器使用）

本專案同時開啟 cookie 與 bearer token。瀏覽器登入時帶 `credentials: 'include'`，server 會在 login response 設定 session cookie；之後所有請求都要保留 cookie：

```js
await fetch('/shop-api', {
  method: 'POST',
  credentials: 'include',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ query: LOGIN_QUERY, variables }),
});
```

跨網域時，server 的 `VENDURE_CORS_ORIGINS` 必須包含前端 origin，client 也必須使用 `credentials: 'include'`。正式環境應使用 HTTPS，並讓 cookie 的 `secure` 設定生效。

### 3.3 Bearer session（推薦 mobile/server-to-server）

login 或 authenticate 成功時，response header 會包含 `vendure-auth-token`。把它放在下一次請求的 `Authorization` header：

```http
Authorization: Bearer <vendure-auth-token>
```

不要把 `vendure-token` 放在 Authorization header。兩個 token 的用途不同。

登出：

```graphql
mutation Logout {
  logout { success }
}
```

### 3.4 Shop customer login

```graphql
mutation Login($username: String!, $password: String!, $rememberMe: Boolean) {
  login(username: $username, password: $password, rememberMe: $rememberMe) {
    ... on CurrentUser {
      id
      identifier
      channels { id code token }
    }
    ... on ErrorResult {
      errorCode
      message
    }
  }
}
```

```json
{
  "username": "customer@example.com",
  "password": "correct-password",
  "rememberMe": true
}
```

`login` 是 native username/password flow；若使用外部 OAuth、社群登入或自訂 AuthenticationStrategy，使用 `authenticate`：

```graphql
mutation Authenticate($input: AuthenticationInput!, $rememberMe: Boolean) {
  authenticate(input: $input, rememberMe: $rememberMe) {
    ... on CurrentUser { id identifier }
    ... on ErrorResult { errorCode message }
  }
}
```

native input 的形狀：

```json
{
  "input": {
    "native": {
      "username": "customer@example.com",
      "password": "correct-password"
    }
  }
}
```

登入後查詢目前 customer：

```graphql
query ActiveCustomer {
  activeCustomer {
    id
    emailAddress
    firstName
    lastName
    phoneNumber
    addresses {
      id
      fullName
      streetLine1
      city
      postalCode
      country { code name }
    }
  }
}
```

Shop API 的 `me` 是目前登入 user 的基本資料；customer 的完整資料用 `activeCustomer`。未登入時 `activeCustomer` 與 `me` 可能是 `null` 或被權限拒絕。

### 3.5 Admin login

Admin API 的登入 query 形狀相同，但請送到 `/admin-api`：

```graphql
mutation AdminLogin($username: String!, $password: String!) {
  login(username: $username, password: $password) {
    ... on CurrentUser { id identifier channels { id code token } }
    ... on ErrorResult { errorCode message }
  }
}
```

預設 Docker 開發帳號來自 `dev-config.ts`：`superadmin / superadmin`。正式環境請用環境變數覆寫，並停用預設密碼。

## 4. Shop API：商品瀏覽與搜尋

### 4.1 Channel 與國家

```graphql
query ShopContext {
  activeChannel { id code token currencyCode defaultLanguageCode }
  availableCountries { code name }
}
```

### 4.2 商品列表、單一商品、分類

```graphql
query ProductList($options: ProductListOptions) {
  products(options: $options) {
    totalItems
    items {
      id
      name
      slug
      description
      featuredAsset { id preview name }
      variants {
        id
        name
        sku
        price
        priceWithTax
        currencyCode
        stockLevel
        options { id code name }
      }
    }
  }
}
```

```json
{
  "options": {
    "skip": 0,
    "take": 24,
    "sort": { "updatedAt": "DESC" },
    "filter": { "enabled": { "eq": true } },
    "filterOperator": "AND"
  }
}
```

單一商品可用 id 或 slug：

```graphql
query ProductBySlug($slug: String!) {
  product(slug: $slug) {
    id
    name
    slug
    description
    featuredAsset { preview }
    assets { id preview name }
    optionGroups { id code name options { id code name } }
    variants {
      id sku name price priceWithTax currencyCode stockLevel
      options { id code name }
    }
    facetValues { id name code facet { id name code } }
  }
}
```

分類：

```graphql
query Collections($options: CollectionListOptions) {
  collections(options: $options) {
    totalItems
    items {
      id name slug description
      featuredAsset { preview }
      parent { id name slug }
      children { id name slug }
      productVariantCount
      productVariants(options: { take: 12 }) {
        totalItems
        items { id name sku priceWithTax product { id name slug } }
      }
    }
  }
}
```

單一分類：

```graphql
query CollectionBySlug($slug: String!) {
  collection(slug: $slug) {
    id name slug breadcrumbs { id name slug }
    productVariantCount
    productVariants(options: { take: 24 }) {
      items { id name sku product { id name slug } }
    }
  }
}
```

前端先用 `collections(options: { topLevelOnly: true })` 取得主分類，再讀每個 item 的
`children` 取得子分類；子分類可繼續查 `children`。取得分類的 `id` 或 `slug` 後，可直接
用 Gallery 作品查詢篩選該 Collection：

```graphql
query GalleryArtworksByCollection($options: GalleryArtworkListOptions) {
  galleryArtworks(options: $options) {
    totalItems
    items { id slug title image { preview } }
  }
}
```

```json
{
  "options": {
    "collectionId": "4",
    "skip": 0,
    "take": 20
  }
}
```

也可以使用 slug：`{ "options": { "collectionSlug": "masters" } }`。`collectionId` 與
`collectionSlug` 會篩選直接掛在該 Collection 的作品；若要顯示主分類及其子分類的全部
作品，先從階層查詢收集子分類 id，再分別查詢或由前端合併結果。`categoryId` 是 FacetValue
篩選，與 Collection id 不同。

### 4.3 Facet 與全文搜尋

```graphql
query Facets {
  facets {
    items {
      id name code
      values { id name code }
    }
  }
}
```

```graphql
query Search($input: SearchInput!) {
  search(input: $input) {
    totalItems
    items {
      productId
      productVariantId
      productName
      productVariantName
      slug
      sku
      price {
        ... on SinglePrice { value }
        ... on PriceRange { min max }
      }
      priceWithTax {
        ... on SinglePrice { value }
        ... on PriceRange { min max }
      }
      currencyCode
      productAsset { preview }
      productVariantAsset { preview }
      facetValueIds
      collectionIds
    }
  }
}
```

```json
{
  "input": {
    "term": "shirt",
    "collectionSlug": "clothing",
    "facetValueIds": ["12", "18"],
    "facetValueOperator": "AND",
    "groupByProduct": true,
    "take": 20,
    "skip": 0,
    "sort": { "price": "ASC" }
  }
}
```

`products` 是資料庫列表查詢；`search` 使用 SearchStrategy（目前預設為 `DefaultSearchPlugin`）。需要 Elasticsearch、Typesense 或其他索引時，必須在 server plugin 設定更換 strategy，client query 仍可沿用。

## 5. Shop API：購物車與結帳

Vendure 的 active order 會依 session 綁定。未登入 visitor 也能建立 guest order；登入後依 server 的 order strategy 可以合併或切換 active order。不要把 active order 的 id 只存在前端而忽略 session cookie/token。

### 5.1 讀取購物車

```graphql
query ActiveOrder {
  activeOrder {
    id code state active totalQuantity
    currencyCode
    lines {
      id quantity
      unitPrice unitPriceWithTax
      linePrice linePriceWithTax
      productVariant { id sku name product { id name slug } }
    }
    subTotal subTotalWithTax
    shipping shippingWithTax
    total totalWithTax
    discounts { description amountWithTax }
    couponCodes
    shippingAddress { fullName streetLine1 city postalCode country }
    billingAddress { fullName streetLine1 city postalCode country }
  }
}
```

沒有 active order 時，結果是 `null`。某些會修改購物車的 mutation 會依設定自動建立 order。

### 5.2 加入、調整與移除商品

```graphql
mutation AddItem($variantId: ID!, $quantity: Int!) {
  addItemToOrder(productVariantId: $variantId, quantity: $quantity) {
    ...CartResult
  }
}

mutation AddItems($inputs: [AddItemInput!]!) {
  addItemsToOrder(inputs: $inputs) {
    order { id code lines { id quantity productVariant { id sku } } }
    errorResults {
      ... on ErrorResult { errorCode message }
    }
  }
}

mutation AdjustLine($lineId: ID!, $quantity: Int!) {
  adjustOrderLine(orderLineId: $lineId, quantity: $quantity) {
    ...CartResult
  }
}

mutation RemoveLine($lineId: ID!) {
  removeOrderLine(orderLineId: $lineId) { ...CartResult }
}

mutation RemoveAllLines {
  removeAllOrderLines { ...CartResult }
}

fragment CartResult on UpdateOrderItemsResult {
  ... on Order { id code state totalWithTax lines { id quantity } }
  ... on ErrorResult { errorCode message }
}
```

`adjustOrderLine` 傳 `quantity: 0` 等同移除該 line。數量、庫存、價格與 promotion 都由 server 重新計算；前端顯示的金額不可作為付款金額來源。

### 5.3 Coupon

```graphql
mutation ApplyCoupon($code: String!) {
  applyCouponCode(couponCode: $code) {
    ... on Order { code couponCodes totalWithTax discounts { description amountWithTax } }
    ... on ErrorResult { errorCode message }
  }
}

mutation RemoveCoupon($code: String!) {
  removeCouponCode(couponCode: $code) {
    code couponCodes totalWithTax
  }
}
```

### 5.4 Customer 與地址

註冊 customer account：

```graphql
mutation Register($input: RegisterCustomerInput!) {
  registerCustomerAccount(input: $input) {
    ... on Success { success }
    ... on ErrorResult { errorCode message }
  }
}
```

```json
{
  "input": {
    "emailAddress": "customer@example.com",
    "firstName": "王",
    "lastName": "小明",
    "password": "a-strong-password"
  }
}
```

更新目前 customer：

```graphql
mutation UpdateCustomer($input: UpdateCustomerInput!) {
  updateCustomer(input: $input) {
    id emailAddress firstName lastName phoneNumber
  }
}
```

地址 CRUD：

```graphql
mutation CreateAddress($input: CreateAddressInput!) {
  createCustomerAddress(input: $input) {
    id fullName streetLine1 city province postalCode country { code name }
    defaultShippingAddress defaultBillingAddress
  }
}

mutation UpdateAddress($input: UpdateAddressInput!) {
  updateCustomerAddress(input: $input) {
    id fullName streetLine1 city postalCode country { code name }
  }
}

mutation DeleteAddress($id: ID!) {
  deleteCustomerAddress(id: $id) { success }
}
```

地址的 `countryCode` 使用 ISO 3166-1 alpha-2 code，例如 `TW`、`JP`、`US`。先用 `availableCountries` 檢查 server 有啟用哪些國家。

把 customer 綁到 guest order：

```graphql
mutation SetCustomerForOrder($input: CreateCustomerInput!) {
  setCustomerForOrder(input: $input) {
    ... on Order { id code customer { id emailAddress firstName lastName } }
    ... on ErrorResult { errorCode message }
  }
}
```

### 5.5 Shipping address、billing address 與 custom fields

```graphql
mutation SetAddresses($shipping: CreateAddressInput!, $billing: CreateAddressInput!) {
  setOrderShippingAddress(input: $shipping) {
    ... on Order { id shippingAddress { fullName streetLine1 city postalCode country } }
    ... on ErrorResult { errorCode message }
  }
  setOrderBillingAddress(input: $billing) {
    ... on Order { id billingAddress { fullName streetLine1 city postalCode country } }
    ... on ErrorResult { errorCode message }
  }
}
```

`setOrderCustomFields` 的 input 會因專案 custom fields 改變；一般形狀如下：

```graphql
mutation SetOrderCustomFields($input: UpdateOrderInput!) {
  setOrderCustomFields(input: $input) {
    ... on Order { id customFields }
    ... on ErrorResult { errorCode message }
  }
}
```

實際 input 名稱與欄位以 schema 的 `SetOrderCustomFieldsInput` 為準。custom field JSON 必須符合 server 定義的型別與 validation。

### 5.6 Shipping method

先取得可用方法：

```graphql
query ShippingMethods {
  eligibleShippingMethods {
    id price priceWithTax code name description metadata customFields
  }
}
```

選擇 shipping method：

```graphql
mutation SetShippingMethod($ids: [ID!]!) {
  setOrderShippingMethod(shippingMethodId: $ids) {
    ... on Order { id shippingWithTax shippingLines { shippingMethod { id code name } } totalWithTax }
    ... on ErrorResult { errorCode message }
  }
}
```

`shippingMethodId` 是 list，因為一張訂單可能需要多個 fulfillment/shipping method。每次變更地址、商品、coupon 或 shipping method 後都應重新讀取 order totals。

### 5.7 Payment method 與付款

公開列出 server 啟用的付款方法：

```graphql
query PaymentMethods {
  activePaymentMethods {
    code name description
    customFields
  }
}
```

只列出目前 order 可用的方法：

```graphql
query EligiblePaymentMethods {
  eligiblePaymentMethods {
    id code name description isEligible eligibilityMessage customFields
  }
}
```

把 payment request 交給 payment handler：

```graphql
mutation AddPayment($input: PaymentInput!) {
  addPaymentToOrder(input: $input) {
    ... on Order { id code state totalWithTax payments { id method state transactionId } }
    ... on PaymentFailedError { errorCode message paymentErrorMessage }
    ... on ErrorResult { errorCode message }
  }
}
```

```json
{
  "input": {
    "method": "standard-payment",
    "metadata": {
      "providerPaymentId": "payment_123"
    }
  }
}
```

`method` 必須是 server 啟用的 PaymentMethodHandler code；`metadata` 是交給 handler 的 provider-specific JSON。不要在前端傳信任的金額、訂單狀態或任意 payment state。

### 5.8 Order state machine 與完成訂單

取得目前 state 可走的下一步：

```graphql
query NextStates {
  nextOrderStates
}
```

轉換 state：

```graphql
mutation Transition($state: String!) {
  transitionOrderToState(state: $state) {
    ... on Order { id code state active }
    ... on ErrorResult { errorCode message }
  }
}
```

不要硬編完整 state flow；先查 `nextOrderStates`，再依付款與 fulfillment plugin 的規則轉換。常見流程是：

```text
AddingItems → ArrangingPayment → PaymentAuthorized/PaymentSettled →
PartiallyFulfilled/Fulfilled → Delivered
```

付款方式也可以在同一個 mutation 送出：

```graphql
mutation CompleteOrder($shippingMethodId: [ID!]!, $payment: PaymentInput!) {
  setOrderShippingMethod(shippingMethodId: $shippingMethodId) {
    ... on Order { code state }
    ... on ErrorResult { errorCode message }
  }
  addPaymentToOrder(input: $payment) {
    ... on Order { code state active orderPlacedAt }
    ... on ErrorResult { errorCode message }
  }
}
```

只有 `active: false` 且有 `orderPlacedAt` 的 order 才算完成。完成後把回傳的 `code` 保存給 customer confirmation page；不要只依賴前端的 cart state。

## 6. Shop API：帳戶安全功能

### 6.1 驗證 email

註冊後依 email link 的 token 執行：

```graphql
mutation VerifyAccount($token: String!, $password: String) {
  verifyCustomerAccount(token: $token, password: $password) {
    ... on CurrentUser { id identifier }
    ... on ErrorResult { errorCode message }
  }
}
```

重新寄送驗證信：

```graphql
mutation RefreshVerification($emailAddress: String!) {
  refreshCustomerVerification(emailAddress: $emailAddress) {
    ... on Success { success }
    ... on ErrorResult { errorCode message }
  }
}
```

實際 production 流程應由 server 設定的 `VENDURE_VERIFY_EMAIL_URL` 接收 token，驗證成功後再導回 storefront。

### 6.2 密碼 reset 與修改

```graphql
mutation RequestReset($emailAddress: String!) {
  requestPasswordReset(emailAddress: $emailAddress) {
    ... on Success { success }
    ... on ErrorResult { errorCode message }
  }
}

mutation ResetPassword($token: String!, $password: String!) {
  resetPassword(token: $token, password: $password) {
    ... on CurrentUser { id identifier }
    ... on ErrorResult { errorCode message }
  }
}

mutation UpdatePassword($currentPassword: String!, $newPassword: String!) {
  updateCustomerPassword(currentPassword: $currentPassword, newPassword: $newPassword) {
    ... on Success { success }
    ... on ErrorResult { errorCode message }
  }
}
```

不要在 log、analytics 或 GraphQL error 中記錄 password、reset token、session token。

### 6.3 Email 變更

```graphql
mutation RequestEmailChange($password: String!, $newEmail: String!) {
  requestUpdateCustomerEmailAddress(password: $password, newEmailAddress: $newEmail) {
    ... on Success { success }
    ... on ErrorResult { errorCode message }
  }
}

mutation UpdateEmail($token: String!) {
  updateCustomerEmailAddress(token: $token) {
    ... on Success { success }
    ... on ErrorResult { errorCode message }
  }
}
```

## 7. Admin API：管理資源

所有 Admin API mutation 都應使用 Admin session 或具有相應 Permission 的 API key。以 `id` 更新或刪除資料前，先查詢 entity，並處理 `ErrorResult`。多數列表都使用相同的 `skip`、`take`、`sort`、`filter`、`filterOperator` 參數。

### 7.1 Admin 目前使用者與權限

```graphql
query AdminContext {
  me { id identifier channels { id code token } }
  activeAdministrator {
    id firstName lastName emailAddress
    user { id identifier roles { id code permissions } }
  }
  activeChannel { id code token currencyCode }
}
```

登入後取得 bearer token 的方式與 Shop API 相同，但 request URL 是 `/admin-api`。

### 7.2 商品、variant、option group

```graphql
query AdminProducts($options: ProductListOptions) {
  products(options: $options) {
    totalItems
    items {
      id name slug enabled
      featuredAsset { id preview }
      variants { id sku name price priceWithTax stockOnHand stockLevel }
      optionGroups { id code name options { id code name } }
      facetValues { id code name }
      channels { id code }
    }
  }
}
```

```graphql
mutation CreateProduct($input: CreateProductInput!) {
  createProduct(input: $input) {
    id name slug enabled translations { languageCode name slug description }
  }
}

mutation UpdateProduct($input: UpdateProductInput!) {
  updateProduct(input: $input) {
    id name slug enabled updatedAt
  }
}

mutation CreateVariant($inputs: [CreateProductVariantInput!]!) {
  createProductVariants(input: $inputs) {
    id sku name price priceWithTax stockOnHand stockLevel
  }
}
```

`CreateProductInput.translations` 與 `CreateProductVariantInput.translations` 是必要欄位；price 通常以 minor unit 傳送，例如 USD 12.99 傳 `1299`。多 currency 價格請使用 `prices` input，不要只改 `price` 期待所有 channel 自動同步。

Option group 與 option：

```graphql
mutation CreateOptionGroup($input: CreateProductOptionGroupInput!) {
  createProductOptionGroup(input: $input) {
    id code name options { id code name }
  }
}

mutation AddOptionGroup($productId: ID!, $optionGroupId: ID!) {
  addOptionGroupToProduct(productId: $productId, optionGroupId: $optionGroupId) {
    id optionGroups { id code name }
  }
}
```

完整的 product mutation 還包含 `createProduct`、`updateProduct`、`deleteProduct`、`updateProducts`、`deleteProducts`、`createProductVariants`、`updateProductVariant`、`updateProductVariants`、`deleteProductVariant`、`deleteProductVariants`、`createProductOption`、`updateProductOption`、`deleteProductOption`、`createProductOptionGroup`、`updateProductOptionGroup`、`deleteProductOptionGroup`、`addOptionGroupToProduct` 與 `removeOptionGroupFromProduct`。

### 7.3 Asset 上傳與管理

查詢 assets：

```graphql
query Assets($options: AssetListOptions) {
  assets(options: $options) {
    totalItems
    items { id name type fileSize width height preview source focalPoint { x y } }
  }
}
```

`createAssets` 是 multipart GraphQL upload。使用 GraphQL multipart request spec：

```bash
curl http://localhost:3000/admin-api \
  -H "Authorization: Bearer $VENDURE_AUTH_TOKEN" \
  -F 'operations={"query":"mutation($file: Upload!){ createAssets(input:[{file:$file}]) { ... on Asset { id name preview } ... on ErrorResult { errorCode message } } }","variables":{"file":null}}' \
  -F 'map={"0":["variables.file"]}' \
  -F '0=@./product.jpg'
```

商品與 channel 可用 asset id 綁定：`assignAssetsToChannel`、`updateAsset`、`deleteAsset`、`deleteAssets`、`assignAssetsToChannel`。上傳後使用回傳的 `id` 放入 `CreateProductInput.assetIds` 或 `featuredAssetId`。

### 7.4 Collections、facets、tags

管理 catalog 的完整 mutation 分組：

```text
Collections: createCollection, updateCollection, deleteCollection,
             deleteCollections, moveCollection, assignProductsToChannel,
             removeProductsFromChannel, assignCollectionsToChannel,
             removeCollectionsFromChannel
Facets:      createFacet, updateFacet, deleteFacet, deleteFacets,
             createFacetValue, updateFacetValue, deleteFacetValue,
             deleteFacetValues, assignFacetsToChannel, removeFacetsFromChannel
Tags:        createTag, updateTag, deleteTag
```

建立 collection 的 filters、facet value 與 product assignment 前，先讀取目前 channel、facet 與 product id；不要把 slug 當作永久 id。

### 7.5 Customer、group、address、note

```graphql
query Customers($options: CustomerListOptions) {
  customers(options: $options) {
    totalItems
    items {
      id emailAddress firstName lastName phoneNumber
      groups { id name }
      addresses { id fullName city country { code name } }
      history { items { id type createdAt } }
    }
  }
}
```

主要 mutation：`createCustomer`、`updateCustomer`、`deleteCustomer`、`deleteCustomers`、`createCustomerAddress`、`updateCustomerAddress`、`deleteCustomerAddress`、`createCustomerGroup`、`updateCustomerGroup`、`deleteCustomerGroup`、`addCustomersToGroup`、`removeCustomersFromGroup`、`addNoteToCustomer`、`updateCustomerNote`、`deleteCustomerNote`。

### 7.6 Order 與 draft order

```graphql
query Orders($options: OrderListOptions) {
  orders(options: $options) {
    totalItems
    items {
      id code state active orderPlacedAt createdAt
      customer { id emailAddress firstName lastName }
      lines { id quantity productVariant { id sku name } }
      totalWithTax currencyCode
      payments { id method state amount transactionId }
      fulfillments { id state lines { orderLineId quantity } }
    }
  }
}
```

Admin 可執行：

```text
order read: order, orders
order update: modifyOrder, setOrderCustomer, setOrderCustomFields,
              setDraftOrderShippingAddress, setDraftOrderBillingAddress,
              setDraftOrderShippingMethod, addItemToDraftOrder,
              adjustDraftOrderLine, removeDraftOrderLine,
              applyCouponCodeToDraftOrder, removeCouponCodeFromDraftOrder
order state: transitionOrderToState, cancelOrder, cancelPayment,
             transitionPaymentToState, transitionFulfillmentToState
payment/refund: addManualPaymentToOrder, settlePayment, refundOrder,
                settleRefund
fulfillment: addFulfillmentToOrder
notes: addNoteToOrder, updateOrderNote, deleteOrderNote
```

建立 draft order：

```graphql
mutation CreateDraft {
  createDraftOrder { id code state active totalWithTax }
}

mutation AddDraftItem($orderId: ID!, $input: AddItemToDraftOrderInput!) {
  addItemToDraftOrder(orderId: $orderId, input: $input) {
    ... on Order { id code lines { id quantity productVariant { id sku } } }
    ... on ErrorResult { errorCode message }
  }
}
```

修改一般 order 時優先使用 `modifyOrder`，它可在一次 transaction 中調整 lines、address、shipping method、coupon、note 與 refund；需要預覽時傳 `dryRun: true`，確認結果後再以 `dryRun: false` 寫入。

### 7.7 Shipping、payment、tax

管理端可查詢與維護：

```text
Shipping: shippingMethods, shippingMethod, createShippingMethod,
          updateShippingMethod, deleteShippingMethod, deleteShippingMethods,
          shippingCalculators, shippingEligibilityCheckers,
          assignShippingMethodsToChannel, removeShippingMethodsFromChannel
Payment:  paymentMethods, paymentMethod, createPaymentMethod,
          updatePaymentMethod, deletePaymentMethod, deletePaymentMethods,
          paymentMethodHandlers, paymentMethodEligibilityCheckers,
          assignPaymentMethodsToChannel, removePaymentMethodsFromChannel
Tax:      taxRates, taxRate, createTaxRate, updateTaxRate, deleteTaxRate,
          deleteTaxRates, taxCategories, taxCategory, createTaxCategory,
          updateTaxCategory, deleteTaxCategory, deleteTaxCategories,
          countries, country, createCountry, updateCountry, deleteCountry,
          provinces, province, createProvince, updateProvince, deleteProvince
Zones:    zones, zone, createZone, updateZone, deleteZone, deleteZones,
          addMembersToZone, removeMembersFromZone
```

付款 provider 的實際 metadata、退款欄位與可用 state 由 handler 決定；不要在 client 假設所有 payment method 都支援相同欄位。

### 7.8 Channel、seller、stock location

多 channel 與 inventory 的操作：

```text
Channel:       channels, channel, createChannel, updateChannel,
               deleteChannel, deleteChannels
Seller:        sellers, seller, createSeller, updateSeller, deleteSeller,
               deleteSellers
Stock:         stockLocations, stockLocation, createStockLocation,
               updateStockLocation, deleteStockLocation, deleteStockLocations,
               assignStockLocationsToChannel, removeStockLocationsFromChannel
Assignments:   assignProductVariantsToChannel,
               removeProductVariantsFromChannel,
               assignProductOptionGroupsToChannel,
               removeProductOptionGroupsFromChannel,
               assignPromotionsToChannel, removePromotionsFromChannel
```

inventory 數量與 `stockLevel` 可能包含 `IN_STOCK`、`OUT_OF_STOCK`、數字或自訂策略結果；UI 不應只以數字 parse。更新 stock 時使用 server 提供的 `stockLevels`/`stockOnHand` input，並處理多 stock location。

### 7.9 Promotion、administrator、role、API key

Promotion：`promotions`、`promotion`、`createPromotion`、`updatePromotion`、`deletePromotion`、`deletePromotions`、`promotionConditions`、`promotionActions`、`assignPromotionsToChannel`、`removePromotionsFromChannel`。

管理使用者：`administrators`、`administrator`、`createAdministrator`、`updateAdministrator`、`deleteAdministrator`、`deleteAdministrators`、`updateActiveAdministrator`、`roles`、`role`、`createRole`、`updateRole`、`deleteRole`、`deleteRoles`、`assignRoleToAdministrator`。

API key：`apiKeys`、`apiKey`、`createApiKey`、`updateApiKey`、`rotateApiKey`、`deleteApiKeys`。API key secret 只在建立或 rotate response 出現一次，應立即放入 secret manager，不能寫入前端 bundle 或 Git。

## 8. Admin API：系統與背景工作

```text
Jobs:      jobs, job, jobsById, jobQueues, jobBufferSize, cancelJob,
           flushBufferedJobs, removeSettledJobs, runPendingSearchIndexUpdates
Search:    search, pendingSearchIndexUpdates, reindex
Scheduler: scheduledTasks, runScheduledTask, updateScheduledTask
Settings:  globalSettings, updateGlobalSettings,
           settingsStoreFieldDefinitions, getSettingsStoreValue,
           getSettingsStoreValues, setSettingsStoreValue,
           setSettingsStoreValues
Import:    importProducts
Utility:   entityDuplicators, duplicateEntity, slugForEntity,
           fulfillmentHandlers, paymentMethodHandlers
```

`jobs`、`reindex` 與 `importProducts` 可能是長時間工作；mutation 回傳的是 job/結果狀態時，應輪詢 job query，不要在 HTTP client 逾時後重複提交同一工作。

## 9. 分頁、排序、篩選與查詢效能

所有 `List` 型別通常回傳：

```text
{
  totalItems
  items { id }
}
```

使用 `skip` + `take`：

```json
{
  "options": {
    "skip": 0,
    "take": 50,
    "sort": { "createdAt": "DESC" },
    "filter": { "name": { "contains": "shirt" } },
    "filterOperator": "AND"
  }
}
```

常見 operators：

```text
StringOperators: eq, notEq, contains, notContains, startsWith,
                 endsWith, in, notIn
NumberOperators: eq, notEq, lt, lte, gt, gte
BooleanOperators: eq
DateOperators: eq, before, after
IDOperators: eq, notEq, in, notIn
```

實際可用 operator 由欄位型別決定，請以 schema Docs 為準。列表查詢只請求需要的欄位；大型 `orders`、`products` 查詢避免一次展開所有 translations、history、assets、variants 與 relations。對 dashboard 可採 list query + detail query 兩段式。

Money 是整數 minor unit；`DateTime` 是 ISO-8601 字串；`JSON` 欄位可能包含自訂 plugin 結構。GraphQL `ID` 在 client 端請以字串保存，即使目前看起來是數字。

## 10. GraphQL 錯誤處理

### 10.1 Transport / GraphQL errors

```js
const payload = await response.json();
if (!response.ok) throw new Error(`HTTP ${response.status}`);
if (payload.errors?.length) {
  for (const error of payload.errors) {
    console.error(error.message, error.path, error.extensions);
  }
  throw new Error(payload.errors[0].message);
}
```

### 10.2 ErrorResult union

Vendure mutation 常用 union：

```graphql
mutation AddItem($id: ID!, $quantity: Int!) {
  addItemToOrder(productVariantId: $id, quantity: $quantity) {
    ... on Order { id code totalWithTax }
    ... on ErrorResult { errorCode message }
  }
}
```

常見 `errorCode` 包含 `NOT_AUTHORIZED_ERROR`、`FORBIDDEN`、`NO_ACTIVE_ORDER_ERROR`、`INSUFFICIENT_STOCK_ERROR`、`OUT_OF_STOCK_ERROR`、`ORDER_STATE_TRANSITION_ERROR`、`PAYMENT_FAILED_ERROR`、`EMAIL_ADDRESS_CONFLICT_ERROR` 與 validation errors。不要只比對 `message`，應以 enum/errorCode 做程式邏輯，message 只顯示給使用者或寫 log。

### 10.3 Union fragment 寫法

```graphql
mutation Update($input: UpdateProductInput!) {
  updateProduct(input: $input) {
    id name
  }
}
```

若 schema 沒有 `ErrorResult` 直接作為 union member，使用 `... on ErrorResult` 可能會 validation error；從 GraphiQL Docs 確認該 operation 的實際 union members（例如 `PaymentFailedError`、`MissingPasswordError`）。

## 11. TypeScript client 與型別產生

推薦使用 GraphQL Code Generator、`gql.tada`、Apollo Client 或 urql；不要手寫整份 schema type。最小 fetch client：

```ts
type GraphQLResponse<T> = { data?: T; errors?: Array<{ message: string; path?: string[] }> };

export async function graphqlRequest<T>(
  endpoint: string,
  query: string,
  variables: Record<string, unknown> = {},
  token?: string,
): Promise<T> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers,
    credentials: 'include',
    body: JSON.stringify({ query, variables }),
  });
  const result = (await response.json()) as GraphQLResponse<T>;
  if (!response.ok || result.errors?.length) {
    throw new Error(result.errors?.map(error => error.message).join('; ') || `HTTP ${response.status}`);
  }
  if (!result.data) throw new Error('GraphQL response did not contain data');
  return result.data;
}
```

本專案的 `packages/dev-server/graphql/graphql.ts` 已使用 `gql.tada`。自訂前端可以從 Shop/Admin introspection 產生分開的型別，並為 query/mutation 加上 operation name。Shop 與 Admin type 不能混用，尤其是同名的 `Product`、`Order`、`Customer` 在兩個 schema 的欄位和權限不同。

## 12. 檔案下載、圖片與 CORS

Asset 的 `preview`、`source` 通常是 URL，直接由 browser GET；GraphQL 只回傳 metadata。Docker 中 upload 目錄是 `/app/assets`，對外 URL 由 `VENDURE_ASSET_URL_PREFIX` 決定。

前端若與 API 不同 origin，至少需要：

```text
VENDURE_CORS_ORIGINS=https://store.example.com
credentials: include
```

不要用 `Access-Control-Allow-Origin: *` 搭配 cookie。production 必須使用強 cookie secret、HTTPS、非預設管理密碼與 secret manager。

## 13. 建議的完整 storefront 流程

```text
1. activeChannel / availableCountries
2. collections / facets / products 或 search
3. product(slug) 取得 variant 與 option
4. addItemToOrder 或 addItemsToOrder
5. activeOrder 顯示即時 totals
6. registerCustomerAccount（可選）→ login
7. setCustomerForOrder（guest 可選）
8. setOrderShippingAddress / setOrderBillingAddress
9. eligibleShippingMethods → setOrderShippingMethod
10. eligiblePaymentMethods
11. addPaymentToOrder
12. 讀取回傳 order code、state、orderPlacedAt
13. 以 orderByCode 或 customer.orders 顯示確認頁
```

每個會改變 order 的 mutation 之後，都以 mutation 回傳的 order 作為畫面狀態；必要時再呼叫 `activeOrder`。不要在 client 自行累加商品價格、稅、折扣或運費。

## 14. 本專案 Gallery 擴充 API

本 repository 在核心 Vendure API 之外載入 `GalleryCatalogPlugin` 與 `GalleryCollectorPlugin`。這些欄位只有在目前 dev-server 設定與 plugin 啟用時才存在；前端應從實際 server schema 取得型別。

### 14.1 Shop：作品與藝術家

```graphql
query GalleryArtworks($options: GalleryArtworkListOptions) {
  galleryArtworks(options: $options) {
    totalItems
    items {
      id slug title yearText dimensionsText material concept
      collectionStory purchaseMode available purchasableVariantId
      image { id preview }
      highResolutionImage { id source }
      artists { id slug name }
      price { amount currencyCode }
    }
  }
}

query GalleryArtwork($slug: String!) {
  galleryArtwork(slug: $slug) {
    id slug title concept available purchaseMode
    image { preview }
    artists { slug name summary }
    price { amount currencyCode }
  }
}

query GalleryArtists($skip: Int, $take: Int) {
  galleryArtists(skip: $skip, take: $take) {
    totalItems
    items { id slug name quote summary avatarAsset { preview } heroAsset { preview } }
  }
}

query GalleryArtist($slug: String!) {
  galleryArtist(slug: $slug) {
    id slug name quote summary lineageTitle lineageParagraph1
    lineageParagraph2 exhibitionSummary seoTitle seoDescription
    avatarAsset { preview }
    heroAsset { preview }
    translations { languageCode name summary }
  }
}
```

作品列表 options：

```json
{
  "options": {
    "skip": 0,
    "take": 20,
    "artistSlug": "artist-slug",
    "categoryId": "12",
    "collectionId": "4",
    "collectionSlug": "masters",
    "term": "ink"
  }
}
```

`purchaseMode` 目前是 `DIRECT_INQUIRY`。`purchasableVariantId` 有值時，可以將該 variant id 傳給 Shop API 的 `addItemToOrder`；沒有值時應導向詢價流程，而不是假設可直接付款。

### 14.2 Admin：藝術家管理

以下操作需要 `ReadCatalog`、`CreateCatalog`、`UpdateCatalog` 或 `DeleteCatalog` permission：

```graphql
query AdminGalleryArtists($skip: Int, $take: Int) {
  galleryArtists(skip: $skip, take: $take) {
    totalItems
    items { id slug name status sortOrder publishedAt templateKey }
  }
}

query AdminGalleryArtist($id: ID!) {
  galleryArtist(id: $id) {
    id slug name status sortOrder templateKey contentBlocks
    translations { id languageCode name quote summary seoTitle seoDescription }
  }
}

mutation CreateGalleryArtist($input: CreateGalleryArtistInput!) {
  createGalleryArtist(input: $input) {
    id slug name status sortOrder translations { languageCode name }
  }
}

mutation UpdateGalleryArtist($input: UpdateGalleryArtistInput!) {
  updateGalleryArtist(input: $input) {
    id slug name status updatedAt
  }
}

mutation PublishGalleryArtist($id: ID!) {
  publishGalleryArtist(id: $id) { id slug status publishedAt }
}

mutation ArchiveGalleryArtist($id: ID!) {
  archiveGalleryArtist(id: $id) { id slug status }
}
```

建立藝術家的 `translations` 至少要傳 `languageCode` 與 `name`；`avatarAssetId`、`heroAssetId` 來自 Admin `createAssets` 回傳的 asset id。archive 是可逆業務狀態操作前的資料保留策略，仍應在 UI 先確認權限與目前 status。

### 14.3 Shop：收藏與瀏覽紀錄

這些 operation 使用 `Permission.Owner`，必須先登入 customer；guest session 不能讀取或修改其他人的收藏。

```graphql
query Favorites($skip: Int, $take: Int) {
  favoriteArtworks(skip: $skip, take: $take) {
    totalItems lastUpdatedAt
    items { id savedAt artwork { id slug title image { preview } } }
  }
}

query ArtworkHistory($skip: Int, $take: Int) {
  artworkHistory(skip: $skip, take: $take) {
    totalItems lastUpdatedAt
    items { id viewedAt sourceCode sourcePath artwork { id slug title } }
  }
}

mutation AddFavorite($productId: ID!) {
  addFavoriteArtwork(productId: $productId) {
    totalItems items { id savedAt artwork { id slug title } }
  }
}

mutation MergeFavorites($productIds: [ID!]!) {
  mergeFavoriteArtworks(productIds: $productIds) {
    totalItems items { id savedAt artwork { id slug title } }
  }
}

mutation RemoveFavorite($productId: ID!) {
  removeFavoriteArtwork(productId: $productId)
}

mutation RecordArtworkView($input: RecordArtworkViewInput!) {
  recordArtworkView(input: $input)
}

mutation ClearArtworkHistory {
  clearArtworkHistory
}
```

### 14.4 Shop：洽詢、私人洽購、通知、CRM 與付款邀請

所有金額都是最小貨幣單位；TWD `30000` 代表 NT$300。私人洽購先建立案件，再由管理員建立報價及訂金付款邀請。付款網址的 token 只能從 `createPaymentRequest` 回傳的 `paymentUrl` 取得，資料庫只保存 hash。

```graphql
mutation CreateArtworkInquiry($input: GalleryInquiryInput!) {
  createInquiry(input: $input) { id code status }
}

mutation CreatePrivatePurchase($input: GalleryPrivatePurchaseInput!) {
  createPrivatePurchase(input: $input) { id code status }
}

query MyPrivatePurchases {
  myPrivatePurchases(options: { take: 20 }) {
    items { id code artworkTitle status totalAmount paidAmount remainingAmount }
  }
}

query PaymentInvitation($token: String!) {
  paymentRequest(token: $token) { id stage amount currencyCode status expiresAt }
}

mutation BeginStripeCheckout($token: String!) {
  startPaymentRequestCheckout(token: $token) { url expiresAt }
}
```

```json
{
  "input": {
    "productId": "123",
    "contactName": "王小明",
    "emailAddress": "collector@example.com",
    "phoneNumber": "0912345678",
    "preferredContactMethod": "email",
    "message": "希望了解作品來源與交付方式。",
    "languageCode": "zh_Hant"
  }
}
```

Shop 端不得傳 Customer ID、付款金額或付款結果。Stripe 只可由 `/payments/stripe/webhook` 的簽章驗證回呼寫入付款；前端從 `url` 導向 Stripe Hosted Checkout，返回頁再查 `paymentRequestStatus`。

訪客在記錄 CRM 事件前先取得簽章 visitor token；登入後可在下一筆事件中一併傳 token，後端會合併訪客事件：

```graphql
mutation VisitorAndEvent($input: GalleryEventInput!) {
  createGalleryVisitorToken
  recordGalleryEvent(input: $input)
}
```

登入的會員可查通知並標記本人已讀：`myNotifications`、`myUnreadNotificationCount`、`markMyNotificationRead`、`markAllMyNotificationsRead`。

### 14.5 Admin：案件、付款、內容與 CRM

管理端必須使用 `/admin-api` 的 Administrator session，並具備對應自訂權限。Dashboard 的「銷售」選單已提供洽詢、私人洽購、付款邀請、站內通知、內容管理與 CRM 的列表入口。

```graphql
mutation CreateProposal($input: GalleryProposalInput!) {
  createPrivatePurchaseProposal(input: $input) {
    id version amount depositAmount depositDueAt balanceDueAt
  }
}

mutation CreateDepositInvitation($input: GalleryPaymentRequestInput!) {
  createPaymentRequest(input: $input) {
    id stage amount expiresAt paymentUrl
  }
}

mutation SavePage($input: GalleryContentInput!) {
  saveContentPage(input: $input) { id key status }
}

mutation PublishPage($id: ID!) {
  publishContent(id: $id) { id status publishedAt }
}
```

`GalleryProposalInput` 的 `amount` 是總報價，`depositAmount` 必須小於總報價，且尾款期限必須晚於訂金期限。先建立 `stage: "deposit"`；Stripe 付款成功後才能建立 `stage: "balance"`。完整 GraphQL 欄位以 `/admin-api` introspection 為準。

收藏合併適合在 visitor 登入後，把 local storage 的 product ids 一次傳給 `mergeFavoriteArtworks`；server 會去重。`recordArtworkView` 的 `sourceCode` 與 `sourcePath` 可用於追蹤導流來源，不要放入個資或密鑰。

每次成功呼叫 `recordArtworkView` 都會新增一筆瀏覽事件，即使是同一件作品重複瀏覽也會保留多筆；`artworkHistory` 依 `viewedAt` 從新到舊回傳。這些紀錄只屬於目前登入的 customer 與 channel，使用 `skip`、`take` 分頁，或用 `clearArtworkHistory` 清除。

## 15. 目前 Shop API root operations 完整清單

以下是目前 schema 的 Query 與 Mutation root 欄位；plugin 可能新增欄位。

### Shop Query

```text
activeChannel, activeCustomer, activeOrder, activePaymentMethods,
activeShippingMethods, availableCountries, collection, collections,
eligiblePaymentMethods, eligibleShippingMethods, facet, facets, me,
nextOrderStates, order, orderByCode, product, products, search,
galleryArtworks, galleryArtwork, galleryArtists, galleryArtist,
favoriteArtworks, artworkHistory, myNotifications, myUnreadNotificationCount,
myPrivatePurchases, myPrivatePurchase, paymentRequest, paymentRequestStatus,
siteSettings, contentPage, pressEntries, pressEntry, teamMembers
```

### Shop Mutation

```text
addItemToOrder, addItemsToOrder, addPaymentToOrder, adjustOrderLine,
applyCouponCode, authenticate, createCustomerAddress,
deleteCustomerAddress, login, logout, refreshCustomerVerification,
registerCustomerAccount, removeAllOrderLines, removeCouponCode,
removeOrderLine, requestPasswordReset, requestUpdateCustomerEmailAddress,
resetPassword, setCurrencyCodeForOrder, setCustomerForOrder,
setOrderBillingAddress, setOrderCustomFields, setOrderShippingAddress,
setOrderShippingMethod, transitionOrderToState, unsetOrderBillingAddress,
unsetOrderShippingAddress, updateCustomer, updateCustomerAddress,
updateCustomerEmailAddress, updateCustomerPassword, verifyCustomerAccount,
addFavoriteArtwork, mergeFavoriteArtworks, removeFavoriteArtwork,
recordArtworkView, clearArtworkHistory, createInquiry, createContactMessage,
createPrivatePurchase, claimPrivatePurchase, cancelMyPrivatePurchase,
markMyNotificationRead, markAllMyNotificationsRead, createGalleryVisitorToken,
recordGalleryEvent, startPaymentRequestCheckout
```

## 16. 目前 Admin API root operations 完整清單

### Admin Query

```text
activeAdministrator, activeChannel, administrator, administrators, apiKey,
apiKeys, asset, assets, channel, channels, collection, collectionFilters,
collections, countries, country, customer, customerGroup, customerGroups,
customers, eligibleShippingMethodsForDraftOrder, entityDuplicators, facet,
facetValue, facetValues, facets, fulfillmentHandlers,
getSettingsStoreValue, getSettingsStoreValues, globalSettings, job,
jobBufferSize, jobQueues, jobs, jobsById, me, metricSummary, order, orders,
paymentMethod, paymentMethodEligibilityCheckers, paymentMethodHandlers,
paymentMethods, pendingSearchIndexUpdates, previewCollectionVariants,
product, productOption, productOptionGroup, productOptionGroups,
productOptions, productVariant, productVariants, products, promotion,
promotionActions, promotionConditions, promotions, province, provinces,
role, roles, scheduledTasks, search, seller, sellers,
settingsStoreFieldDefinitions, shippingCalculators,
shippingEligibilityCheckers, shippingMethod, shippingMethods,
slugForEntity, stockLocation, stockLocations, tag, tags, taxCategories,
taxCategory, taxRate, taxRates, testEligibleShippingMethods,
testShippingMethod, zone, zones, inquiries, inquiry, privatePurchases,
privatePurchase, paymentRequests, paymentRequest, notifications, notification,
contentPages, managedContent, crmOverview, crmProfiles, crmProfile,
galleryDashboardStats
```

### Admin Mutation

```text
addCustomersToGroup, addFulfillmentToOrder, addItemToDraftOrder,
addManualPaymentToOrder, addMembersToZone, addNoteToCustomer,
addNoteToOrder, addOptionGroupToProduct, adjustDraftOrderLine,
applyCouponCodeToDraftOrder, assignAssetsToChannel,
assignCollectionsToChannel, assignFacetsToChannel,
assignPaymentMethodsToChannel, assignProductOptionGroupsToChannel,
assignProductVariantsToChannel, assignProductsToChannel,
assignPromotionsToChannel, assignRoleToAdministrator,
assignShippingMethodsToChannel, assignStockLocationsToChannel,
cancelJob, cancelOrder, cancelPayment, createAdministrator, createApiKey,
createAssets, createChannel, createCollection, createCountry,
createCustomer, createCustomerAddress, createCustomerGroup,
createDraftOrder, createFacet, createFacetValue, createFacetValues,
createPaymentMethod, createProduct, createProductOption,
createProductOptionGroup, createProductVariants, createPromotion,
createProvince, createRole, createSeller, createShippingMethod,
createStockLocation, createTag, createTaxCategory, createTaxRate,
createZone, deleteAdministrator, deleteAdministrators, deleteApiKeys,
deleteAsset, deleteAssets, deleteChannel, deleteChannels,
deleteCollection, deleteCollections, deleteCountries, deleteCountry,
deleteCustomer, deleteCustomerAddress, deleteCustomerGroup,
deleteCustomerGroups, deleteCustomerNote, deleteCustomers,
deleteDraftOrder, deleteFacet, deleteFacetValues, deleteFacets,
deleteOrderNote, deletePaymentMethod, deletePaymentMethods,
deleteProduct, deleteProductOption, deleteProductOptionGroup,
deleteProductOptionGroups, deleteProductVariant, deleteProductVariants,
deleteProducts, deletePromotion, deletePromotions, deleteProvince,
deleteRole, deleteRoles, deleteSeller, deleteSellers,
deleteShippingMethod, deleteShippingMethods, deleteStockLocation,
deleteStockLocations, deleteTag, deleteTaxCategories, deleteTaxCategory,
deleteTaxRate, deleteTaxRates, deleteZone, deleteZones, duplicateEntity,
flushBufferedJobs, importProducts, login, logout, modifyOrder,
moveCollection, refundOrder, reindex, removeCollectionsFromChannel,
removeCouponCodeFromDraftOrder, removeCustomersFromGroup,
removeDraftOrderLine, removeFacetsFromChannel,
removeMembersFromZone, removeOptionGroupFromProduct,
removePaymentMethodsFromChannel, removeProductOptionGroupsFromChannel,
removeProductVariantsFromChannel, removeProductsFromChannel,
removePromotionsFromChannel, removeSettledJobs,
removeShippingMethodsFromChannel, removeStockLocationsFromChannel,
rotateApiKey, runPendingSearchIndexUpdates, runScheduledTask,
setCustomerForDraftOrder, setDraftOrderBillingAddress,
setDraftOrderCustomFields, setDraftOrderShippingAddress,
setDraftOrderShippingMethod, setOrderCustomFields, setOrderCustomer,
setSettingsStoreValue, setSettingsStoreValues, settlePayment,
settleRefund, transitionFulfillmentToState, transitionOrderToState,
transitionPaymentToState, unsetDraftOrderBillingAddress,
unsetDraftOrderShippingAddress, updateActiveAdministrator,
updateAdministrator, updateApiKey, updateAsset, updateChannel,
updateCollection, updateCountry, updateCustomer, updateCustomerAddress,
updateCustomerGroup, updateCustomerNote, updateFacet, updateFacetValue,
updateFacetValues, updateGlobalSettings, updateOrderNote,
updatePaymentMethod, updateProduct, updateProductOption,
updateProductOptionGroup, updateProductVariant, updateProductVariants,
updateProducts, updatePromotion, updateProvince, updateRole,
updateScheduledTask, updateSeller, updateShippingMethod,
updateStockLocation, updateTag, updateTaxCategory, updateTaxRate,
updateZone
```

## 17. 串接檢查清單

```text
[ ] Shop 與 Admin 使用正確 endpoint
[ ] 多 channel 請求帶 vendure-token
[ ] Cookie client 使用 credentials: include
[ ] Server client 保存 vendure-auth-token，不放進前端 bundle
[ ] 每個 mutation 處理 GraphQL errors 與 ErrorResult
[ ] 金額使用 minor unit，狀態以 server response 為準
[ ] 商品列表使用分頁與最小欄位集合
[ ] 付款 metadata 不含不必要的卡號或密鑰
[ ] Upload 使用 multipart request spec
[ ] production 使用 HTTPS、強 cookie secret、非預設帳號密碼
[ ] plugin/custom field 啟用後重新取得 schema 並重新產生型別
```
