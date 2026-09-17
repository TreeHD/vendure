# Swagger

啟動或重啟 API server 後，以相同主機與 API port 開啟：

- `/swagger`：Swagger UI，支援 Try it out。
- `/swagger-json`：OpenAPI 3 JSON。
- `/graphiql/shop`、`/graphiql/admin`：完整 GraphQL 型別探索（需啟用 GraphiQL）。

開發環境預設開啟 Swagger。`VENDURE_SERVE_SWAGGER=false` 可關閉；正式環境預設關閉，需明確
設定 `VENDURE_SERVE_SWAGGER=true` 才提供文件。此設定只控制文件入口，API 本身沿用原有認證。

Vendure 是 GraphQL API，因此文件描述實際的 `POST /shop-api` 與 `POST /admin-api` HTTP
請求格式，提供作品、藝術家、登入、收藏合併、瀏覽紀錄和建立藝術家草稿的 Examples。
它不會將每個 GraphQL 操作建立為 REST 路由，也不取代完整的 GraphQL schema 文件。
端點名稱會跟隨 `devConfig.apiOptions` 的設定。

1. 展開對應端點，選擇 Example，再點 Try it out。
2. 將範例的 ID、帳號及密碼換成自己的資料。
3. 私有操作先執行 login，將回應標頭 `vendure-auth-token` 的值填入 Authorize（不要加 Bearer 前綴）。
4. `vendure-token` 是 channel token，與登入 token 不同；預設 channel 可省略。
5. GraphQL 的 HTTP 200 也可能包含 `errors` 或業務 `errorCode`，請檢查回應內容。

Swagger 不持久保存 Authorization token；若伺服器配置 cookie 登入，瀏覽器仍沿用其正常
session cookie。Execute mutation 會實際寫入資料。所有圖片與 Swagger UI 靜態資源仍由原有
伺服器提供，Swagger UI 資源不依賴外部 CDN。

實作在 `api-docs.ts`，透過 Vendure 的 `onBeforeAppListen` hook 掛載。
採用 [NestJS 官方 Swagger 設定方式](https://docs.nestjs.com/openapi/introduction)。

`bun run test:gallery` 會驗證 UI、CSS 與 JSON 路由；使用實際 Shop/Admin schema 檢查每個
Example 的 query 與 variables，並實際執行作品查詢。測試使用隔離資料庫與本機隨機埠。
