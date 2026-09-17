import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import { VendureConfig } from '@vendure/core';

type Example = { summary: string; value: { query: string; variables?: Record<string, unknown> } };

const shopExamples: Record<string, Example> = {
    artworks: {
        summary: '公開作品列表',
        value: {
            query: `query Artworks($options: GalleryArtworkListOptions) {
                galleryArtworks(options: $options) {
                    totalItems items { id slug title purchaseMode available price { amount currencyCode } }
                }
            }`,
            variables: { options: { skip: 0, take: 20 } },
        },
    },
    artists: {
        summary: '已發布藝術家',
        value: { query: 'query { galleryArtists { totalItems items { id slug name summary } } }' },
    },
    login: {
        summary: '會員登入；取得回應標頭 vendure-auth-token 後填入 Authorize',
        value: {
            query: `mutation Login($username: String!, $password: String!) {
                login(username: $username, password: $password) {
                    __typename ... on CurrentUser { id identifier } ... on ErrorResult { errorCode message }
                }
            }`,
            variables: { username: 'member@example.test', password: 'replace-with-your-password' },
        },
    },
    favorites: {
        summary: '本人收藏（需要會員登入）',
        value: {
            query: 'query { favoriteArtworks(skip: 0, take: 20) { totalItems lastUpdatedAt items { savedAt artwork { id slug title } } } }',
        },
    },
    mergeFavorites: {
        summary: '合併收藏袋（會寫入本人收藏）',
        value: {
            query: 'mutation MergeBag($ids: [ID!]!) { mergeFavoriteArtworks(productIds: $ids) { totalItems items { savedAt artwork { id title } } } }',
            variables: { ids: ['replace-with-product-id'] },
        },
    },
    history: {
        summary: '本人瀏覽紀錄（需要會員登入）',
        value: {
            query: 'query { artworkHistory(skip: 0, take: 20) { totalItems items { viewedAt sourceCode sourcePath artwork { id title } } } }',
        },
    },
    recordView: {
        summary: '記錄一次作品瀏覽（新增一筆本人事件）',
        value: {
            query: 'mutation RecordView($input: RecordArtworkViewInput!) { recordArtworkView(input: $input) }',
            variables: {
                input: {
                    productId: 'replace-with-product-id',
                    sourceCode: 'artwork_list',
                    sourcePath: '/works',
                },
            },
        },
    },
};

const adminExamples: Record<string, Example> = {
    login: {
        ...shopExamples.login,
        summary: '管理員登入；管理員與會員使用各自的登入身分',
        value: {
            ...shopExamples.login.value,
            variables: { username: 'replace-with-admin-username', password: 'replace-with-your-password' },
        },
    },
    artists: {
        summary: '管理藝術家列表（需要 ReadCatalog）',
        value: { query: 'query { galleryArtists { totalItems items { id slug name status } } }' },
    },
    createArtist: {
        summary: '新增雙語藝術家草稿（需要 CreateCatalog，會寫入資料）',
        value: {
            query: 'mutation CreateArtist($input: CreateGalleryArtistInput!) { createGalleryArtist(input: $input) { id slug name status } }',
            variables: {
                input: {
                    slug: 'example-artist',
                    translations: [
                        { languageCode: 'zh_Hant', name: '藝術家姓名', summary: '藝術家簡介' },
                        { languageCode: 'en', name: 'Artist name', summary: 'Artist biography' },
                    ],
                },
            },
        },
    },
};

export function createApiDocument(config: VendureConfig): OpenAPIObject {
    const document = new DocumentBuilder()
        .setTitle('Gallery Backend API')
        .setVersion('1.0.0')
        .setDescription(
            [
                'Vendure 使用 GraphQL。本文件描述實際的 HTTP 端點，Examples 提供可執行的 query / mutation；不將 GraphQL 操作當成獨立 REST 路由。',
                '選擇 Examples → Try it out → Execute。金額 amount / price 為最小貨幣單位整數，並帶 currencyCode。',
                '登入後可將回應標頭 vendure-auth-token 填入 Authorize（只填 token）。Swagger 不持久保存授權 token。',
                'HTTP 200 仍可能包含 GraphQL errors 或業務 errorCode，請一併檢查回應。',
                '完整欄位與型別請使用 GraphiQL（啟用 VENDURE_SERVE_GRAPHIQL 時）：[Shop](/graphiql/shop)、[Admin](/graphiql/admin)。',
            ].join('\n\n'),
        )
        .addBearerAuth(
            { type: 'http', scheme: 'bearer', description: 'Vendure session token' },
            'vendureSession',
        )
        .build();
    const response = { $ref: '#/components/schemas/GraphQLResponse' };
    const endpoints: Array<[string, string, Record<string, Example>]> = [
        [config.apiOptions.shopApiPath ?? 'shop-api', 'Shop', shopExamples],
        [config.apiOptions.adminApiPath ?? 'admin-api', 'Admin', adminExamples],
    ];
    return {
        ...document,
        components: {
            ...document.components,
            schemas: {
                GraphQLRequest: {
                    type: 'object',
                    required: ['query'],
                    properties: {
                        query: { type: 'string', description: 'GraphQL query 或 mutation 文件' },
                        operationName: { type: 'string', nullable: true },
                        variables: { type: 'object', nullable: true, additionalProperties: true },
                    },
                },
                GraphQLResponse: {
                    type: 'object',
                    properties: {
                        data: { type: 'object', nullable: true, additionalProperties: true },
                        errors: {
                            type: 'array',
                            items: {
                                type: 'object',
                                required: ['message'],
                                properties: {
                                    message: { type: 'string' },
                                    path: {
                                        type: 'array',
                                        items: { oneOf: [{ type: 'string' }, { type: 'integer' }] },
                                    },
                                    extensions: { type: 'object', additionalProperties: true },
                                },
                            },
                        },
                    },
                },
            },
        },
        paths: Object.fromEntries(
            endpoints.map(([path, tag, examples]) => [
                `/${String(path).replace(/^\/+|\/+$/g, '')}`,
                {
                    post: {
                        tags: [tag],
                        summary: `${tag} GraphQL API`,
                        operationId: `${String(tag).toLowerCase()}GraphQL`,
                        description:
                            '授權由所執行的 GraphQL 操作決定；login 不需現有 token，會員資料及管理操作需要對應權限。',
                        security: [{}, { vendureSession: [] }],
                        parameters: [
                            {
                                name: 'vendure-token',
                                in: 'header',
                                required: false,
                                description: 'Channel token（不是登入 token）；省略使用預設 channel',
                                schema: { type: 'string' },
                            },
                            {
                                name: 'languageCode',
                                in: 'query',
                                required: false,
                                schema: { type: 'string', enum: ['zh_Hant', 'en'] },
                            },
                        ],
                        requestBody: {
                            required: true,
                            content: {
                                'application/json': {
                                    schema: { $ref: '#/components/schemas/GraphQLRequest' },
                                    examples,
                                },
                            },
                        },
                        responses: {
                            '200': {
                                description: 'GraphQL 回應；請同時檢查 data、errors 與業務 errorCode',
                                headers: {
                                    'vendure-auth-token': {
                                        description: '登入成功後的 session token',
                                        schema: { type: 'string' },
                                    },
                                },
                                content: { 'application/json': { schema: response } },
                            },
                            '400': {
                                description: '無效 GraphQL 文件或請求',
                                content: { 'application/json': { schema: response } },
                            },
                        },
                    },
                },
            ]),
        ),
    } as OpenAPIObject;
}

export function setupApiDocs(app: INestApplication, config: VendureConfig) {
    const enabled =
        process.env.VENDURE_SERVE_SWAGGER === 'true' ||
        (process.env.NODE_ENV !== 'production' && process.env.VENDURE_SERVE_SWAGGER !== 'false');
    if (!enabled) return;
    SwaggerModule.setup('swagger', app, createApiDocument(config), {
        jsonDocumentUrl: 'swagger-json',
        customSiteTitle: 'Gallery API Swagger',
        swaggerOptions: { persistAuthorization: false, withCredentials: true, validatorUrl: null },
    });
}
