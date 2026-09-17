const assert = require('node:assert/strict');
const { test } = require('node:test');
const { lastValueFrom } = require('rxjs');
const core = require('@vendure/core');
const { setupApiDocs } = require('../dist/api-docs');
const {
    IndexerController,
} = require('@vendure/core/dist/plugin/default-search-plugin/indexer/indexer.controller');
const { GalleryCatalogPlugin } = require('../dist/plugins/gallery-catalog/gallery-catalog.plugin');
const { GalleryCollectorPlugin } = require('../dist/plugins/gallery-collector/collector.plugin');
const {
    GalleryPricePolicyService,
} = require('../dist/plugins/gallery-catalog/services/gallery-price-policy.service');

test('gallery GraphQL integration', async t => {
    const app = await core.bootstrap(
        {
            apiOptions: { port: 0, hostname: '127.0.0.1' },
            authOptions: {
                tokenMethod: 'bearer',
                requireVerification: false,
                superadminCredentials: { identifier: 'test-admin', password: 'isolated-admin-password' },
            },
            dbConnectionOptions: process.env.GALLERY_TEST_POSTGRES_PORT
                ? {
                      type: 'postgres',
                      host: '127.0.0.1',
                      port: Number(process.env.GALLERY_TEST_POSTGRES_PORT),
                      username: 'gallery_test',
                      password: 'isolated-test-password',
                      database: 'gallery_policy_test',
                      synchronize: process.env.GALLERY_TEST_USE_MIGRATIONS !== 'true',
                  }
                : { type: 'better-sqlite3', database: ':memory:', synchronize: true },
            paymentOptions: { paymentMethodHandlers: [] },
            logger: new core.DefaultLogger({ level: core.LogLevel.Error }),
            plugins: [
                GalleryCatalogPlugin,
                GalleryCollectorPlugin,
                core.DefaultSearchPlugin.init({ bufferUpdates: false }),
            ],
        },
        {
            onBeforeAppListen: app =>
                setupApiDocs(app, { apiOptions: { shopApiPath: 'shop-api', adminApiPath: 'admin-api' } }),
        },
    );
    try {
        const endpoint = `http://127.0.0.1:${app.getHttpServer().address().port}`;
        const request = async (api, query, variables = {}, token, channelToken) => {
            const response = await fetch(`${endpoint}/${api}-api`, {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                    ...(token ? { authorization: `Bearer ${token}` } : {}),
                    ...(channelToken ? { 'vendure-token': channelToken } : {}),
                },
                body: JSON.stringify({ query, variables }),
            });
            return { body: await response.json(), token: response.headers.get('vendure-auth-token') };
        };
        const login = async (api, username, password) => {
            const response = await request(
                api,
                `mutation($username: String!, $password: String!) {
                login(username: $username, password: $password) { __typename ... on CurrentUser { id } }
            }`,
                { username, password },
            );
            assert.equal(response.body.data?.login.__typename, 'CurrentUser', JSON.stringify(response.body));
            assert.ok(response.token);
            return response.token;
        };
        const adminToken = await login('admin', 'test-admin', 'isolated-admin-password');
        await t.test('Swagger UI and examples match both GraphQL schemas', async () => {
            const {
                buildClientSchema,
                getIntrospectionQuery,
                parse,
                validate,
                getOperationAST,
                getVariableValues,
            } = require('graphql');
            const ui = await fetch(`${endpoint}/swagger`);
            assert.equal(ui.status, 200);
            assert.match(await ui.text(), /swagger-ui/);
            const css = await fetch(`${endpoint}/swagger/swagger-ui.css`);
            assert.equal(css.status, 200);
            const specResponse = await fetch(`${endpoint}/swagger-json`);
            assert.equal(specResponse.status, 200);
            const spec = await specResponse.json();
            assert.equal(spec.openapi, '3.0.0');
            assert.deepEqual(Object.keys(spec.paths).sort(), ['/admin-api', '/shop-api']);
            for (const api of ['shop', 'admin']) {
                const introspection = await request(
                    api,
                    getIntrospectionQuery(),
                    {},
                    api === 'admin' ? adminToken : undefined,
                );
                assert.equal(introspection.body.errors, undefined);
                const schema = buildClientSchema(introspection.body.data);
                for (const example of Object.values(
                    spec.paths[`/${api}-api`].post.requestBody.content['application/json'].examples,
                )) {
                    const document = parse(example.value.query);
                    assert.deepEqual(validate(schema, document), [], example.summary);
                    assert.equal(
                        getVariableValues(
                            schema,
                            getOperationAST(document).variableDefinitions || [],
                            example.value.variables || {},
                        ).errors,
                        undefined,
                        example.summary,
                    );
                }
            }
            const sample =
                spec.paths['/shop-api'].post.requestBody.content['application/json'].examples.artworks.value;
            const response = await request('shop', sample.query, sample.variables);
            assert.equal(response.body.errors, undefined);
            assert.equal(response.body.data.galleryArtworks.totalItems, 0);
        });
        const ctx = await app.get(core.RequestContextService).create({ apiType: 'admin' });
        const connection = app.get(core.TransactionalConnection);
        const products = app.get(core.ProductService);
        const zone = await app.get(core.ZoneService).create(ctx, { name: 'Test only' });
        await app
            .get(core.ChannelService)
            .update(ctx, { id: ctx.channelId, defaultTaxZoneId: zone.id, defaultShippingZoneId: zone.id });
        const tax = await app.get(core.TaxCategoryService).create(ctx, { name: 'Test tax' });
        const create = (slug, direct) =>
            connection.withTransaction(ctx, tx =>
                products.create(tx, {
                    translations: [
                        { languageCode: core.LanguageCode.zh_Hant, name: slug, slug, description: '' },
                    ],
                    customFields: {
                        isDirectPurchase: direct,
                        priceVisibility: direct ? 'PUBLIC' : 'INQUIRY',
                    },
                }),
            );
        const inquiry = await create('inquiry-work', false);
        const direct = await create('direct-work', true);
        const variantInput = productId => ({
            productId,
            sku: `work-${productId}`,
            price: 1250000,
            taxCategoryId: tax.id,
            stockOnHand: 1,
            trackInventory: 'TRUE',
            translations: [{ languageCode: 'zh_Hant', name: 'Original' }],
        });
        const createVariants = `mutation($input: [CreateProductVariantInput!]!) {
            createProductVariants(input: $input) { id price currencyCode }
        }`;
        for (const enabled of [true, false]) {
            const rejected = await request(
                'admin',
                createVariants,
                { input: [{ ...variantInput(inquiry.id), enabled }] },
                adminToken,
            );
            assert.match(JSON.stringify(rejected.body.errors), /GALLERY_PRIVATE_VARIANT_FORBIDDEN/);
            assert.equal(
                await connection.getRepository(ctx, core.ProductVariant).countBy({ productId: inquiry.id }),
                0,
            );
        }
        const created = await request(
            'admin',
            createVariants,
            { input: [variantInput(direct.id)] },
            adminToken,
        );
        assert.equal(created.body.errors, undefined, JSON.stringify(created.body));
        assert.equal(created.body.data.createProductVariants[0].price, 1250000);
        assert.equal(created.body.data.createProductVariants[0].currencyCode, 'TWD');
        const rejected = await request(
            'admin',
            `mutation($input: UpdateProductInput!) {
            updateProduct(input: $input) { id }
        }`,
            { input: { id: direct.id, customFields: { priceVisibility: 'INQUIRY' } } },
            adminToken,
        );
        assert.match(JSON.stringify(rejected.body.errors), /GALLERY_PRIVATE_VARIANT_FORBIDDEN/);
        assert.equal((await products.findOne(ctx, direct.id)).customFields.priceVisibility, 'PUBLIC');
        const bulkWork = await create('bulk-work', true);
        const bulk = await request(
            'admin',
            createVariants,
            {
                input: [variantInput(bulkWork.id), variantInput(inquiry.id)],
            },
            adminToken,
        );
        assert.match(JSON.stringify(bulk.body.errors), /GALLERY_PRIVATE_VARIANT_FORBIDDEN/);
        assert.equal(await connection.getRepository(ctx, core.ProductVariant).count(), 1);

        const tokens = [undefined];
        for (const tier of ['COLLECTOR', 'VIP']) {
            const email = `${tier.toLowerCase()}@example.test`;
            const customer = await app.get(core.CustomerService).create(
                ctx,
                {
                    firstName: tier,
                    lastName: 'Test',
                    emailAddress: email,
                    customFields: { membershipTier: tier, membershipStatus: 'ACTIVE' },
                },
                'isolated-customer-password',
            );
            assert.ok(customer.id, customer.message);
            tokens.push(await login('shop', email, 'isolated-customer-password'));
        }
        const freshCtx = await app.get(core.RequestContextService).create({ apiType: 'admin' });
        await lastValueFrom(
            app.get(IndexerController).reindex(
                new core.Job({
                    queueName: 'update-search-index',
                    data: { ctx: freshCtx.serialize() },
                }),
            ),
        );
        for (const token of tokens) {
            const result = await request(
                'shop',
                `query {
                inquiry: product(slug: "inquiry-work") { id variants { id price priceWithTax } }
                direct: product(slug: "direct-work") { variants { price currencyCode } }
                galleryArtwork(slug: "inquiry-work") { price { amount } purchasableVariantId }
                publicArtwork: galleryArtwork(slug: "direct-work") { price { amount currencyCode } }
                products { items { id variants { price } } }
                search(input: { groupByProduct: true }) {
                    totalItems items { productId price { ... on SinglePrice { value } ... on PriceRange { min max } } }
                }
            }`,
                {},
                token,
            );
            assert.equal(result.body.errors, undefined, JSON.stringify(result.body));
            const data = result.body.data;
            assert.deepEqual(data.inquiry.variants, []);
            assert.equal(data.galleryArtwork.price, null);
            assert.equal(data.galleryArtwork.purchasableVariantId, null);
            assert.equal(data.direct.variants[0].price, 1250000);
            assert.equal(data.direct.variants[0].currencyCode, 'TWD');
            assert.equal(data.publicArtwork.price.amount, 1250000);
            assert.equal(data.publicArtwork.price.currencyCode, 'TWD');
            assert.deepEqual(
                data.products.items.find(item => String(item.id) === String(inquiry.id)).variants,
                [],
            );
            assert.equal(data.search.totalItems, 1);
            assert.equal(String(data.search.items[0].productId), String(direct.id));
        }
        await t.test('collector ownership, merge and history', async () => {
            await require('./gallery-collector.checks.cjs')({
                app,
                ctx,
                connection,
                products,
                request,
                tokens,
                adminToken,
                inquiry,
                direct,
                zone,
            });
        });
        if (process.env.GALLERY_TEST_POSTGRES_PORT) {
            const racing = await create('concurrent-work', true);
            const raced = await Promise.all([
                request('admin', createVariants, { input: [variantInput(racing.id)] }, adminToken),
                request(
                    'admin',
                    `mutation($input: UpdateProductInput!) { updateProduct(input: $input) { id } }`,
                    { input: { id: racing.id, customFields: { priceVisibility: 'INQUIRY' } } },
                    adminToken,
                ),
            ]);
            assert.equal(raced.filter(result => !result.body.errors).length, 1);
            for (const result of raced) {
                if (result.body.errors) {
                    assert.match(JSON.stringify(result.body.errors), /GALLERY_PRIVATE_VARIANT_FORBIDDEN/);
                    assert.doesNotMatch(JSON.stringify(result.body.errors), /deadlock detected/);
                }
            }
            const finalProduct = await products.findOne(ctx, racing.id);
            const variantCount = await connection
                .getRepository(ctx, core.ProductVariant)
                .countBy({ productId: racing.id });
            assert.ok(
                finalProduct.customFields.priceVisibility === 'PUBLIC' || variantCount === 0,
                'concurrent policy change must not leave a priced inquiry artwork',
            );
        }
        const totalVariants = await connection.getRepository(ctx, core.ProductVariant).count();
        // Simulate an old import which bypassed services. Startup must refuse it,
        // preserving the data for an explicit migration instead of deleting prices.
        await connection.getRepository(ctx, core.Product).update(direct.id, {
            customFields: { priceVisibility: 'INQUIRY' },
        });
        await assert.rejects(
            app.get(GalleryPricePolicyService).onApplicationBootstrap(),
            /GALLERY_PRIVATE_VARIANT_FORBIDDEN/,
        );
        assert.equal(await connection.getRepository(ctx, core.ProductVariant).count(), totalVariants);
    } finally {
        await app.close();
    }
});
