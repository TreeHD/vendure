const assert = require('node:assert/strict');
const { test } = require('node:test');
const core = require('@vendure/core');
const { GalleryCatalogPlugin } = require('../dist/plugins/gallery-catalog/gallery-catalog.plugin');
const { GalleryCatalogService } = require('../dist/plugins/gallery-catalog/services/gallery-catalog.service');
const { ArtistAdminService } = require('../dist/plugins/gallery-catalog/services/artist-admin.service');
const { Artist } = require('../dist/plugins/gallery-catalog/entities/artist.entity');
const {
    GalleryOrderInterceptor,
} = require('../dist/plugins/gallery-catalog/config/gallery-order-interceptor');

test('gallery pagination queries the full catalogue and excludes drafts', async () => {
    const worker = await core.bootstrapWorker({
        apiOptions: { port: 0 },
        authOptions: { cookieOptions: { secret: 'isolated-test-only' } },
        dbConnectionOptions: { type: 'better-sqlite3', database: ':memory:', synchronize: true },
        paymentOptions: { paymentMethodHandlers: [] },
        logger: new core.DefaultLogger({ level: core.LogLevel.Error }),
        plugins: [GalleryCatalogPlugin],
    });
    try {
        const ctx = await worker.app.get(core.RequestContextService).create({ apiType: 'shop' });
        const admin = await worker.app.get(core.RequestContextService).create({ apiType: 'admin' });
        const products = worker.app.get(core.ProductService);
        for (let i = 0; i < 105; i++) {
            await products.create(admin, {
                enabled: true,
                translations: [
                    {
                        languageCode: core.LanguageCode.zh_Hant,
                        name: `Artwork ${i}`,
                        slug: `artwork-${i}`,
                        description: '',
                    },
                ],
            });
        }
        await products.create(admin, {
            enabled: false,
            translations: [
                {
                    languageCode: core.LanguageCode.zh_Hant,
                    name: 'Draft',
                    slug: 'draft',
                    description: '',
                },
            ],
        });
        const gallery = worker.app.get(GalleryCatalogService);
        const collection = await worker.app.get(core.CollectionService).create(admin, {
            translations: [
                {
                    languageCode: core.LanguageCode.zh_Hant,
                    name: 'Filter collection',
                    slug: 'filter-collection',
                    description: '',
                },
            ],
            filters: [],
        });
        const collectionProduct = await products.create(admin, {
            translations: [
                {
                    languageCode: core.LanguageCode.zh_Hant,
                    name: 'Collection artwork',
                    slug: 'collection-artwork',
                    description: '',
                },
            ],
            customFields: { isDirectPurchase: true, priceVisibility: 'PUBLIC' },
        });
        const collectionZone = await worker.app.get(core.ZoneService).create(admin, {
            name: 'Collection test zone',
        });
        await worker.app.get(core.ChannelService).update(admin, {
            id: ctx.channelId,
            defaultTaxZoneId: collectionZone.id,
            defaultShippingZoneId: collectionZone.id,
        });
        const catalogCtx = await worker.app.get(core.RequestContextService).create({ apiType: 'shop' });
        const variantCtx = await worker.app.get(core.RequestContextService).create({ apiType: 'admin' });
        const [collectionVariant] = await worker.app.get(core.ProductVariantService).create(variantCtx, [
            {
                productId: collectionProduct.id,
                sku: 'collection-artwork-variant',
                price: 100,
                stockOnHand: 1,
                translations: [{ languageCode: core.LanguageCode.zh_Hant, name: 'Original' }],
            },
        ]);
        const variantRepository = worker.app
            .get(core.TransactionalConnection)
            .getRepository(variantCtx, core.ProductVariant);
        const variantEntity = await variantRepository.findOneOrFail({
            where: { id: collectionVariant.id },
            relations: ['collections'],
        });
        variantEntity.collections = [collection];
        await variantRepository.save(variantEntity);
        assert.equal((await gallery.findArtworks(catalogCtx, { collectionId: collection.id })).totalItems, 1);
        assert.equal(
            (await gallery.findArtworks(catalogCtx, { collectionSlug: 'filter-collection' })).totalItems,
            1,
        );
        const page = await gallery.findArtworks(catalogCtx, { skip: 100, take: 20 });
        assert.equal(page.totalItems, 106);
        assert.equal(page.items.length, 6);
        assert.equal((await gallery.findArtworks(catalogCtx, { term: 'Artwork 104' })).totalItems, 1);
        assert.equal(await gallery.findArtwork(catalogCtx, 'draft'), undefined);
        assert.equal(await gallery.findArtwork(catalogCtx, 'missing'), undefined);
        assert.equal(page.items[0].price, null);
        assert.equal(catalogCtx.currencyCode, core.CurrencyCode.TWD);

        const artists = worker.app.get(ArtistAdminService);
        const artist = await artists.create(admin, {
            slug: 'test-artist',
            translations: [
                {
                    languageCode: core.LanguageCode.zh_Hant,
                    name: '測試藝術家',
                    summary: '藝術家簡介',
                    quote: '保留引言',
                },
            ],
        });
        assert.equal(await gallery.findArtistBySlug(catalogCtx, artist.slug), null);
        await assert.rejects(artists.publish(admin, artist.id), /name and summary.*en/);
        await artists.update(admin, {
            id: artist.id,
            translations: [
                { languageCode: core.LanguageCode.zh_Hant, name: '更新姓名' },
                { languageCode: core.LanguageCode.en, name: 'Test Artist', summary: 'Artist biography' },
            ],
        });
        const updated = await artists.findOne(admin, artist.id);
        assert.equal(updated.summary, '藝術家簡介');
        assert.equal(updated.quote, '保留引言');
        await artists.publish(admin, artist.id);
        assert.equal((await gallery.findArtistBySlug(catalogCtx, artist.slug)).name, '更新姓名');
        await assert.rejects(
            artists.update(admin, {
                id: artist.id,
                translations: [{ languageCode: core.LanguageCode.en, name: 'Test Artist', summary: ' ' }],
            }),
            /name and summary.*en/,
        );
        const artwork = await products.create(admin, {
            translations: [
                {
                    languageCode: core.LanguageCode.zh_Hant,
                    name: 'Linked work',
                    slug: 'linked-work',
                    description: '',
                },
            ],
            customFields: { artistsIds: [artist.id], isDirectPurchase: true, priceVisibility: 'INQUIRY' },
        });
        const inconsistent = await gallery.findArtwork(catalogCtx, 'linked-work');
        assert.equal(inconsistent.purchaseMode, 'INQUIRY');
        assert.equal(inconsistent.available, false);
        assert.equal(inconsistent.purchasableVariantId, null);
        await artists.archive(admin, artist.id);
        assert.equal(await gallery.findArtistBySlug(catalogCtx, artist.slug), null);
        assert.equal((await gallery.findArtists(catalogCtx)).totalItems, 0);
        assert.deepEqual((await gallery.findArtwork(catalogCtx, 'linked-work')).artists, []);
        const connection = worker.app.get(core.TransactionalConnection);
        assert.equal(
            (await connection.getRepository(admin, Artist).findOneByOrFail({ id: artist.id })).status,
            'ARCHIVED',
        );
        const linked = await products.findOne(admin, artwork.id, ['customFields.artists']);
        assert.equal(linked.customFields.artists.length, 1);
    } finally {
        await worker.app.close();
    }
});

test('direct purchase rejects duplicate adds, adjustments and inquiry prices', async () => {
    const product = { enabled: true, customFields: { isDirectPurchase: true, priceVisibility: 'PUBLIC' } };
    const interceptor = new GalleryOrderInterceptor();
    interceptor.init({
        get: token =>
            token === core.ProductService ? { findOne: async () => product } : { hydrate: async () => {} },
    });
    const variant = { id: 10, productId: 1 };
    const ctx = core.RequestContext.empty();
    assert.equal(
        await interceptor.willAddItemToOrder(ctx, { lines: [] }, { productVariant: variant, quantity: 1 }),
        undefined,
    );
    assert.ok(
        await interceptor.willAddItemToOrder(
            ctx,
            { lines: [{ productVariantId: '10', quantity: 1 }] },
            { productVariant: variant, quantity: 1 },
        ),
    );
    const line = { id: 2, productVariantId: 10, productVariant: variant, quantity: 1 };
    assert.ok(
        await interceptor.willAdjustOrderLine(ctx, { lines: [line] }, { orderLine: line, quantity: 2 }),
    );
    product.customFields.priceVisibility = 'INQUIRY';
    assert.equal(
        await interceptor.willAdjustOrderLine(ctx, { lines: [line] }, { orderLine: line, quantity: 1 }),
        'DIRECT_PURCHASE_NOT_ALLOWED',
    );
    assert.equal(
        await interceptor.willAdjustOrderLine(ctx, { lines: [line] }, { orderLine: line, quantity: 0 }),
        undefined,
    );
});
