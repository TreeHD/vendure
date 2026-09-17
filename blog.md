# Vendure CMS / Blog Plugin Implementation Plan

## 0. Goal

在現有 Vendure Backend 裡新增一個 `CmsPlugin`，提供 Blog / Article CMS 功能。

現有 Storefront 前端與 Vendure 完全分離，**不要改變這個架構**。

最終架構：

```text
Storefront
   │
   │ Vendure Shop GraphQL API
   ▼
Vendure Backend
├── Commerce
│   ├── Product
│   ├── Collection
│   ├── Order
│   └── Customer
│
├── CmsPlugin
│   ├── Article
│   ├── Category
│   ├── Rich Text
│   ├── SEO
│   ├── Product Relations
│   └── Asset Relations
│
├── Admin GraphQL API
├── Shop GraphQL API
└── Vendure Dashboard
      └── Content
          ├── Articles
          └── Categories
```

Storefront 只透過 Shop API 讀文章。

管理員透過 Vendure Dashboard 編輯文章。

不要建立第二套 CMS Server、第二套登入系統或第二套管理後台。

---

# 1. Before Coding

先檢查目前 repository：

```text
package.json
vendure-config.ts
src/plugins/
vite.config.*
目前 Vendure version
目前 Dashboard 使用方式
目前 database
目前 Asset storage configuration
目前 migration strategy
目前 permission / role 寫法
```

特別確認 Vendure 版本。

如果目前專案使用新的：

```text
@vendure/dashboard
```

就使用新的 React Dashboard extension API。

不要為了 CMS 主動升級 Vendure major version。

不要使用已 deprecated 的舊 Admin UI extension API，除非目前專案版本只能使用它。

完成 inspection 後再依照現有 repository coding style 實作。

---

# 2. Plugin Structure

建立：

```text
src/plugins/cms/
├── cms.plugin.ts
│
├── entities/
│   ├── article.entity.ts
│   ├── article-translation.entity.ts
│   └── category.entity.ts
│
├── api/
│   ├── admin-api.extensions.ts
│   ├── shop-api.extensions.ts
│   ├── admin.resolver.ts
│   └── shop.resolver.ts
│
├── services/
│   ├── article.service.ts
│   └── category.service.ts
│
├── types/
│   ├── article-status.ts
│   └── content-document.ts
│
└── dashboard/
    ├── index.tsx
    ├── routes/
    │   ├── article-list.tsx
    │   ├── article-detail.tsx
    │   └── category-list.tsx
    │
    └── components/
        ├── rich-text-editor.tsx
        ├── asset-selector.tsx
        └── product-selector.tsx
```

實際檔名可依 repository 現有 convention 調整。

---

# 3. Article Entity

建立真正的 Entity。

不要把 Blog 塞進：

```text
Product.customFields
```

核心資料模型：

```text
Article
├── id
├── createdAt
├── updatedAt
├── status
├── publishedAt
├── featuredAsset
├── category
├── relatedProducts[]
├── channels[]
└── translations[]
```

翻譯資料：

```text
ArticleTranslation
├── languageCode
├── title
├── slug
├── excerpt
├── content
├── seoTitle
└── seoDescription
```

Article status：

```ts
enum ArticleStatus {
  DRAFT = 'DRAFT',
  PUBLISHED = 'PUBLISHED',
  ARCHIVED = 'ARCHIVED',
}
```

`publishedAt` nullable。

判斷文章公開時必須同時滿足：

```text
status === PUBLISHED

AND

publishedAt <= currentTime
```

如果 `publishedAt` 為 null：

```text
PUBLISHED 可以視為立即發布
```

或者在 publish mutation 時自動補現在時間。

請選擇其中一種行為並保持一致。

建議：

```text
publishArticle()
→ status = PUBLISHED
→ publishedAt ??= now
```

---

# 4. Translation Support

Article 從第一版就使用 Vendure 的 `Translatable` pattern。

以下欄位需要翻譯：

```text
title
slug
excerpt
content
seoTitle
seoDescription
```

這樣未來可支援：

```text
zh-TW
ja
en
```

Service 查詢 Article 時使用 Vendure 正規 translation mechanism。

不要自己另外做：

```text
titleZh
titleEn
titleJa
```

---

# 5. Channel Support

Article 建議直接實作：

```text
ChannelAware
```

即使現在只有一個 Channel 也先做好。

未來可能有：

```text
Taiwan Store
Japan Store
Global Store
```

不同 Channel 可以看到不同文章。

所有 Shop API 查詢必須依：

```text
RequestContext.channelId
```

過濾。

不能跨 Channel 洩漏 Article。

---

# 6. Rich Text Format

使用：

```text
TipTap / ProseMirror JSON
```

不要使用 Markdown 作為 CMS 主格式。

不要直接把 raw HTML 當 canonical content。

GraphQL 使用 Vendure 已提供的：

```graphql
JSON
```

scalar。

Article：

```graphql
content: JSON!
```

資料例如：

```json
{
  "type": "doc",
  "content": [
    {
      "type": "heading",
      "attrs": {
        "level": 2
      },
      "content": [
        {
          "type": "text",
          "text": "Summer Collection"
        }
      ]
    },
    {
      "type": "paragraph",
      "content": [
        {
          "type": "text",
          "text": "New products are now available."
        }
      ]
    }
  ]
}
```

Database storage 請依目前 DB 決定。

如果 repository 明確只支援 PostgreSQL：

```text
jsonb
```

可以接受。

如果目前專案仍希望 database agnostic：

使用 Vendure / TypeORM 相容的 JSON 儲存策略。

不要因 CMS 強迫整個專案綁 PostgreSQL。

---

# 7. Initial TipTap Nodes

第一階段只支援：

```text
paragraph
heading
bold
italic
strike
bulletList
orderedList
blockquote
horizontalRule
link
image
```

不要第一階段就做完整 Page Builder。

但 schema 要留下未來 extension 空間，例如：

```text
productCard
productGrid
youtube
gallery
button
```

第一版可以先不實作。

---

# 8. Asset Integration

圖片全部使用 Vendure `Asset`。

不要另外建立 CMS Media Library。

Article：

```text
featuredAsset → Vendure Asset
```

TipTap image node 不要直接把 binary / base64 放進 content。

建議保存：

```json
{
  "type": "image",
  "attrs": {
    "assetId": "123"
  }
}
```

Renderer 再取得：

```text
Asset.preview
Asset.source
```

如果目前 Vendure Asset 已經使用：

```text
S3
R2
```

CMS 直接共用。

不要增加另一套 Upload storage。

---

# 9. Product Relations

Article 要可以關聯 Vendure Product。

建立：

```text
Article
ManyToMany
Product
```

欄位：

```text
relatedProducts[]
```

用途：

```text
Article
"2026 Summer Outfit Guide"

Related Products
├── Product A
├── Product B
└── Product C
```

Shop API 一次可以取得：

```graphql
article {
  title
  content

  relatedProducts {
    id
    name
    slug
    featuredAsset {
      preview
    }
  }
}
```

第一階段先做 article-level relation。

不要先實作 TipTap inline `<ProductCard>` node。

那個留第二階段。

---

# 10. Category

建立：

```text
CmsCategory
```

MVP 欄位：

```text
id
name
slug
description
createdAt
updatedAt
```

Article：

```text
ManyToOne Category
```

第一版不用：

```text
nested category tree
```

除非現有需求明確需要。

未來再加入：

```text
parent
children
```

---

# 11. Admin GraphQL API

Admin API 要支援完整 CRUD。

Queries：

```graphql
articles(options: ArticleListOptions): ArticleList!

article(id: ID!): Article

categories: [CmsCategory!]!
```

Mutations：

```graphql
createArticle(input: CreateArticleInput!): Article!

updateArticle(input: UpdateArticleInput!): Article!

deleteArticle(id: ID!): DeletionResponse!

publishArticle(id: ID!): Article!

unpublishArticle(id: ID!): Article!
```

Category：

```graphql
createCmsCategory(...)
updateCmsCategory(...)
deleteCmsCategory(...)
```

Article list 至少可：

```text
paginate
sort
filter title
filter status
filter category
filter publishedAt
```

盡量使用 Vendure：

```text
ListQueryBuilder
ListQueryOptions
PaginatedList
```

不要自己重新發明 paging 格式。

---

# 12. Shop GraphQL API

Shop API 僅提供公開讀取。

Queries：

```graphql
articles(options: ArticleListOptions): ArticleList!

articleBySlug(slug: String!): Article

articleCategories: [CmsCategory!]!
```

Shop API 必須自動限制：

```text
current Channel only
status = PUBLISHED
publishedAt <= now
```

Shop API 不可以 expose：

```text
Draft
Archived
Future scheduled article
```

即使使用者知道 ID / slug 也不能取得。

---

# 13. Slug Rules

slug 要：

```text
lowercase
URL friendly
unique
```

Uniqueness 至少考慮：

```text
Channel
Language
Slug
```

避免未來多語、多站時碰撞。

Create / Update 時檢查 collision。

Dashboard 可以自動：

```text
Article Title
↓
article-title
```

但管理員允許手動修改。

---

# 14. Permission

新增 CMS Permission。

例如：

```text
ReadArticle
CreateArticle
UpdateArticle
DeleteArticle
PublishArticle
```

如果目前 Vendure custom permission convention 適合，可以整合成較少 permission，例如：

```text
ReadCms
UpdateCms
PublishCms
```

優先遵循目前 repository 的 permission style。

Dashboard route / mutation 都必須受到權限保護。

不要只靠 Dashboard 隱藏 button。

Server resolver 本身必須 enforce permission。

---

# 15. Dashboard

Vendure Dashboard sidebar 新增：

```text
Content
├── Articles
└── Categories
```

Articles list：

```text
Title
Status
Category
Published At
Updated At
```

支援：

```text
Search
Status filter
Pagination
Create
Edit
Delete
```

Article Edit Page：

```text
Title

Slug

Excerpt

Featured Image

Content
[ TipTap Editor ]

Category

Related Products

SEO
├── SEO Title
└── SEO Description

Publishing
├── Draft
├── Published
└── Published At

[Save]
[Publish]
```

TipTap editor 做成 Dashboard React component。

不要開 iframe 到另一個 CMS。

---

# 16. TipTap Editor

安裝 TipTap 所需最低 dependencies。

Toolbar MVP：

```text
H1
H2
H3
Paragraph

Bold
Italic
Strike

Bullet List
Ordered List

Link
Image
Quote
Divider
```

Editor output：

```text
TipTap JSON
```

保存前驗證 JSON。

Editor load 時：

```text
DB JSON
→ TipTap
```

Editor save 時：

```text
TipTap
→ JSON
→ GraphQL
→ Vendure
```

不要保存 generated HTML。

---

# 17. Frontend Boundary

目前 Storefront 是完全獨立 repository / application。

**此次任務不要重構 Storefront。**

CmsPlugin 只需要提供乾淨 Shop API。

最後補一份 API usage example：

```graphql
query BlogPost($slug: String!) {
  articleBySlug(slug: $slug) {
    id
    title
    slug
    excerpt
    content
    publishedAt

    featuredAsset {
      id
      preview
      source
    }

    category {
      id
      name
      slug
    }

    relatedProducts {
      id
      name
      slug

      featuredAsset {
        preview
      }
    }
  }
}
```

前端之後自己負責：

```text
/blog
/blog/:slug
```

以及 TipTap JSON renderer。

---

# 18. SEO Fields

Article Translation：

```text
seoTitle
seoDescription
```

另外 Article API 至少提供：

```text
slug
featuredAsset
publishedAt
updatedAt
```

方便 Storefront 產生：

```text
<title>
<meta description>
OpenGraph
canonical
sitemap.xml
structured data
```

CMS Backend 不負責 server-side HTML SEO rendering。

那是 Storefront 的責任。

---

# 19. Migrations

新增 Entity 後建立 Vendure / TypeORM migration。

不要使用：

```text
synchronize: true
```

當 production migration 方法。

Migration 要可以：

```text
UP
DOWN
```

並確認現有資料庫不受影響。

---

# 20. Validation

Create / Update API 要驗證：

```text
title non-empty
slug valid
slug unique
content valid JSON
publishedAt valid
category exists
relatedProducts exist
featuredAsset exists
```

對不存在或其他 Channel 不允許的 entity 回傳正常 Vendure / GraphQL error。

不要 silent fail。

---

# 21. Security

Shop API 不允許取得 unpublished content。

Dashboard mutation 要有 permission check。

Rich Text renderer 未來即使不是 raw HTML，也要避免：

```text
javascript: URL
unsafe iframe
arbitrary HTML
script
```

Link protocol 限制：

```text
https
http
mailto
```

除非有其他明確需求。

不要讓 TipTap `HTML` node 任意插入 HTML。

---

# 22. Tests

至少新增：

```text
ArticleService tests
Admin resolver tests
Shop resolver tests
```

重要 cases：

```text
create draft
update draft
publish
unpublish
scheduled publish
slug collision
different language
different channel
Shop API cannot see draft
Shop API cannot see future article
Shop API can see published article
related product relation
featured asset relation
```

如果 repository 已有 Vendure integration testing pattern，遵循既有寫法。

---

# 23. Implementation Phases

## Phase 1 — Backend Core

完成：

```text
CmsPlugin
Article Entity
Translation Entity
Category Entity
Channel support
Permissions
Migration
Service
Admin GraphQL
Shop GraphQL
```

確認 GraphQL 可正常 CRUD。

這階段先不用 Dashboard。

---

## Phase 2 — Vendure Dashboard

完成：

```text
Content navigation
Article list
Article editor
Category management
TipTap
Asset picker
Product selector
Publish / Unpublish
```

Dashboard 可以完整管理文章。

---

## Phase 3 — Polish

加入：

```text
SEO fields
filters
scheduled publishing behavior
validation
tests
error handling
loading state
empty state
confirm delete
```

---

## Phase 4 — Future Features

這次不要做，但架構不能阻止之後加入：

```text
inline Product Card
Product Grid
Gallery
YouTube
CTA Button

Article Tags
Authors

Revision History
Preview Token
Draft Preview

Scheduled Worker Publishing
Landing Pages
Reusable Content Blocks
Page Builder

Article ↔ Collection relation
Article ↔ Product Variant relation
```

---

# 24. Definition of Done

MVP 完成時必須可以：

```text
1. Vendure Dashboard → Content → Articles

2. Create Article

3. 輸入：
   title
   slug
   excerpt
   TipTap rich text
   featured image
   category
   related products
   SEO
   publish state

4. Save Draft

5. Shop API 查不到 Draft

6. Publish

7. Shop API 可以使用 slug 查到文章

8. Shop API 可以取得：
   content
   assets
   category
   relatedProducts

9. Unpublish

10. Shop API 再次無法取得

11. 不同 Channel 不會看到彼此不屬於自己的 Article

12. 多語 translation 可以正常讀寫
```

---

# 25. Coding Rules

執行時遵守：

```text
- 優先沿用目前 repository convention
- 不大改現有 Vendure architecture
- 不改 Storefront
- 不引入 Strapi / Directus / 其他 CMS
- 不建立第二套 authentication
- 不建立第二套 asset system
- 不複製 Vendure Product data
- Product relation 必須是真正 relation / ID reference
- 不為此功能升級 Vendure major version
- 每完成一個 phase 確認 build / typecheck / test
```

如果實際 Vendure version 與這份 Plan API 有差異：

```text
優先使用該版本官方 Vendure API，
不要為了完全照 Plan 而 hack framework。
```

---

# 26. First Codex Task

先不要一次實作全部。

第一步：

```text
1. Inspect repository
2. 回報 Vendure version / Dashboard version / DB / plugin structure
3. 建立 CmsPlugin skeleton
4. 建立 Article + ArticleTranslation + Category entities
5. 建 migration
6. 建 Admin + Shop GraphQL schema
7. 實作 ArticleService
8. 跑 typecheck / tests
```

Phase 1 正常後，再進 Dashboard + TipTap。

不要在第一個 commit 同時完成整個 CMS。
