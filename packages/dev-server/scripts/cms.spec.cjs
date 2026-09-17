const assert = require('node:assert/strict');
const { test } = require('node:test');
const core = require('@vendure/core');
const { CmsPlugin } = require('../dist/plugins/cms/cms.plugin');
const { CmsService } = require('../dist/plugins/cms/cms.service');

const document = text => ({
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
});

test('CMS: drafts, scheduling, locale slugs, JSON documents and public isolation', async () => {
    const app = await core.bootstrap({
        apiOptions: { port: 0, adminApiPath: 'admin-api', shopApiPath: 'shop-api' },
        authOptions: { cookieOptions: { secret: 'cms-isolated-test-secret' } },
        dbConnectionOptions: { type: 'better-sqlite3', database: ':memory:', synchronize: true },
        paymentOptions: { paymentMethodHandlers: [] },
        logger: new core.DefaultLogger({ level: core.LogLevel.Error }),
        plugins: [CmsPlugin],
    });
    try {
        const contexts = app.get(core.RequestContextService);
        const admin = await contexts.create({ apiType: 'admin', languageCode: core.LanguageCode.en });
        const shop = await contexts.create({ apiType: 'shop', languageCode: core.LanguageCode.en });
        const connection = app.get(core.TransactionalConnection);
        const cms = app.get(CmsService);
        const tx = fn => connection.withTransaction(admin, fn);
        const shopEndpoint = `http://127.0.0.1:${app.getHttpServer().address().port}/shop-api`;

        const category = await tx(ctx =>
            cms.createCategory(ctx, { translations: [{ languageCode: 'en', name: 'News', slug: 'news' }] }),
        );
        const draft = await tx(ctx =>
            cms.createArticle(ctx, {
                categoryId: category.id,
                translations: [
                    { languageCode: 'en', title: 'Draft', slug: 'draft-post', content: document('draft') },
                ],
            }),
        );
        assert.equal(await cms.articleBySlug(shop, 'draft-post'), null);
        assert.equal((await cms.articles(shop, {}, true)).totalItems, 0);
        await tx(ctx => cms.publishArticle(ctx, draft.id));
        const published = await cms.articleBySlug(shop, 'draft-post');
        assert.equal(published.title, 'Draft');
        assert.deepEqual(JSON.parse(published.content), document('draft'));
        const publicResponse = await fetch(shopEndpoint, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                query: '{ articleBySlug(slug: "draft-post") { slug content category { slug } } }',
            }),
        }).then(response => response.json());
        assert.deepEqual(publicResponse.data.articleBySlug.content, document('draft'));
        assert.equal(publicResponse.data.articleBySlug.category.slug, 'news');
        assert.equal((await cms.categories(shop, true))[0].slug, 'news');
        await tx(ctx => cms.unpublishArticle(ctx, draft.id));
        assert.equal(await cms.articleBySlug(shop, 'draft-post'), null);

        const future = await tx(ctx =>
            cms.createArticle(ctx, {
                publishedAt: new Date(Date.now() + 60_000),
                translations: [
                    { languageCode: 'en', title: 'Future', slug: 'future-post', content: document('future') },
                ],
            }),
        );
        await tx(ctx => cms.publishArticle(ctx, future.id));
        assert.equal(await cms.articleBySlug(shop, 'future-post'), null);
        await assert.rejects(() =>
            tx(ctx =>
                cms.createArticle(ctx, {
                    translations: [
                        {
                            languageCode: 'en',
                            title: 'Duplicate',
                            slug: 'future-post',
                            content: document('duplicate'),
                        },
                    ],
                }),
            ),
        );
        await assert.rejects(
            () =>
                tx(ctx =>
                    cms.createArticle(ctx, {
                        translations: [
                            {
                                languageCode: 'en',
                                title: 'Unsafe',
                                slug: 'unsafe-post',
                                content: {
                                    type: 'doc',
                                    content: [
                                        {
                                            type: 'paragraph',
                                            marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }],
                                        },
                                    ],
                                },
                            },
                        ],
                    }),
                ),
            error => /^\[INVALID_LINK_PROTOCOL\] .*javascript:alert\(1\)/.test(error.message),
        );

        const zone = await app.get(core.ZoneService).create(admin, { name: 'CMS channel test zone' });
        const channel = await app.get(core.ChannelService).create(admin, {
            code: 'cms-other',
            token: 'cms-other-token',
            defaultLanguageCode: core.LanguageCode.en,
            defaultCurrencyCode: core.CurrencyCode.USD,
            defaultTaxZoneId: zone.id,
            defaultShippingZoneId: zone.id,
            pricesIncludeTax: false,
        });
        const otherAdmin = await contexts.create({
            apiType: 'admin',
            languageCode: core.LanguageCode.en,
            channelOrToken: channel.token,
        });
        const otherShop = await contexts.create({
            apiType: 'shop',
            languageCode: core.LanguageCode.en,
            channelOrToken: channel.token,
        });
        const otherArticle = await connection.withTransaction(otherAdmin, ctx =>
            cms.createArticle(ctx, {
                translations: [
                    {
                        languageCode: 'en',
                        title: 'Other channel',
                        slug: 'other-channel-post',
                        content: document('other'),
                    },
                ],
            }),
        );
        await connection.withTransaction(otherAdmin, ctx => cms.publishArticle(ctx, otherArticle.id));
        assert.equal(await cms.articleBySlug(shop, 'other-channel-post'), null);
        assert.equal((await cms.articles(otherShop, {}, true)).totalItems, 1);

        const result = await fetch(shopEndpoint, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ query: '{ __type(name: "CmsArticle") { fields { name } } }' }),
        }).then(response => response.json());
        assert.ok(!result.errors, JSON.stringify(result));
        assert.ok(result.data.__type.fields.some(field => field.name === 'content'));
    } finally {
        await app.close();
    }
});
