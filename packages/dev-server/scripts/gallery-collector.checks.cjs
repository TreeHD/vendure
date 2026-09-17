const assert = require('node:assert/strict');
const core = require('@vendure/core');

module.exports = async ({
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
}) => {
    const query = `query { favoriteArtworks(take: 1) { totalItems lastUpdatedAt items { id savedAt artwork { id price { amount } } } }
        artworkHistory { totalItems items { viewedAt sourceCode sourcePath artwork { id } } } }`;
    const shop = async (query, variables, token = tokens[1]) => {
        const result = await request('shop', query, variables, token);
        assert.equal(result.body.errors, undefined, JSON.stringify(result.body));
        return result.body.data;
    };
    for (const token of [undefined, adminToken]) {
        const result = await request('shop', 'query { favoriteArtworks { totalItems } }', {}, token);
        assert.ok(result.body.errors, 'a customer session is required');
        assert.equal(result.body.errors[0].extensions.code, 'FORBIDDEN');
    }
    const empty = await shop(query);
    assert.equal(empty.favoriteArtworks.totalItems, 0);
    assert.equal(empty.favoriteArtworks.lastUpdatedAt, null);
    const merge = `mutation($ids: [ID!]!) { mergeFavoriteArtworks(productIds: $ids) { totalItems items { savedAt artwork { id } } } }`;
    const initial = await shop(merge, { ids: [inquiry.id, inquiry.id, direct.id] });
    assert.equal(initial.mergeFavoriteArtworks.totalItems, 2);
    assert.equal((await shop('query { activeOrder { id } }')).activeOrder, null);
    const saved = initial.mergeFavoriteArtworks.items.find(
        item => String(item.artwork.id) === String(inquiry.id),
    ).savedAt;
    assert.ok(Number.isFinite(Date.parse(saved)));
    const again = await shop(merge, { ids: [inquiry.id] });
    assert.equal(
        again.mergeFavoriteArtworks.items.find(item => String(item.artwork.id) === String(inquiry.id))
            .savedAt,
        saved,
    );
    assert.equal((await shop(query)).favoriteArtworks.items.length, 1);
    assert.equal((await shop(query)).favoriteArtworks.totalItems, 2);
    assert.equal((await shop(query, {}, tokens[2])).favoriteArtworks.totalItems, 0);
    await shop(`mutation($id: ID!) { removeFavoriteArtwork(productId: $id) }`, { id: inquiry.id }, tokens[2]);
    assert.equal((await shop(query)).favoriteArtworks.totalItems, 2);
    const injection = await request(
        'shop',
        `query { favoriteArtworks(customerId: "1") { totalItems } }`,
        {},
        tokens[2],
    );
    assert.ok(injection.body.errors);
    const candidate = await connection.withTransaction(ctx, tx =>
        products.create(tx, {
            translations: [
                {
                    languageCode: core.LanguageCode.zh_Hant,
                    name: 'Merge candidate',
                    slug: 'merge-candidate',
                    description: '',
                },
            ],
        }),
    );
    const invalid = await request('shop', merge, { ids: [candidate.id, '999999999'] }, tokens[1]);
    assert.ok(invalid.body.errors);
    assert.equal(invalid.body.errors[0].extensions.code, 'USER_INPUT_ERROR');
    assert.equal((await shop(query)).favoriteArtworks.totalItems, 2);
    const tooMany = await request('shop', merge, { ids: Array(101).fill(inquiry.id) }, tokens[1]);
    assert.ok(tooMany.body.errors);
    assert.equal(tooMany.body.errors[0].extensions.code, 'USER_INPUT_ERROR');
    if (process.env.GALLERY_TEST_POSTGRES_PORT) {
        await Promise.all([shop(merge, { ids: [inquiry.id] }), shop(merge, { ids: [inquiry.id] })]);
        assert.equal((await shop(query)).favoriteArtworks.totalItems, 2);
    }
    const record = `mutation($input: RecordArtworkViewInput!) { recordArtworkView(input: $input) }`;
    await shop(record, {
        input: {
            productId: inquiry.id,
            sourceCode: 'artwork_list',
            sourcePath: '/works?token=must-not-store#fragment',
        },
    });
    let history = (await shop(query)).artworkHistory;
    assert.equal(history.totalItems, 1);
    assert.equal(history.items[0].sourcePath, '/works');
    const firstViewed = Date.parse(history.items[0].viewedAt);
    await shop(record, {
        input: { productId: inquiry.id, sourceCode: 'artist', sourcePath: '/artists/example' },
    });
    history = (await shop(query)).artworkHistory;
    assert.equal(history.totalItems, 2);
    assert.equal(history.items[0].sourceCode, 'artist');
    assert.equal(history.items[1].sourceCode, 'artwork_list');
    assert.ok(Date.parse(history.items[0].viewedAt) >= firstViewed);
    assert.equal((await shop(query, {}, tokens[2])).artworkHistory.totalItems, 0);
    await shop('mutation { clearArtworkHistory }', {}, tokens[2]);
    assert.equal((await shop(query)).artworkHistory.totalItems, 2);
    const badPath = await request(
        'shop',
        record,
        { input: { productId: inquiry.id, sourcePath: 'https://example.test/' } },
        tokens[1],
    );
    assert.ok(badPath.body.errors);
    assert.equal(badPath.body.errors[0].extensions.code, 'USER_INPUT_ERROR');
    await connection.withTransaction(ctx, tx => products.update(tx, { id: inquiry.id, enabled: false }));
    assert.equal((await shop(query)).favoriteArtworks.totalItems, 1);
    assert.equal((await shop(query)).artworkHistory.totalItems, 0);
    const draft = await request('shop', merge, { ids: [inquiry.id] }, tokens[1]);
    assert.ok(draft.body.errors);
    await connection.withTransaction(ctx, tx => products.update(tx, { id: inquiry.id, enabled: true }));
    const otherChannel = await app.get(core.ChannelService).create(ctx, {
        code: 'collector-other',
        token: 'collector-other-token',
        defaultLanguageCode: core.LanguageCode.zh_Hant,
        defaultCurrencyCode: core.CurrencyCode.TWD,
        defaultTaxZoneId: zone.id,
        defaultShippingZoneId: zone.id,
        pricesIncludeTax: false,
    });
    assert.ok(otherChannel.id, otherChannel.message);
    const other = await request(
        'shop',
        'query { favoriteArtworks { totalItems } }',
        {},
        tokens[1],
        'collector-other-token',
    );
    assert.equal(other.body.errors, undefined, JSON.stringify(other.body));
    assert.equal(other.body.data.favoriteArtworks.totalItems, 0);
    await shop('mutation { clearArtworkHistory }');
    assert.equal((await shop(query)).artworkHistory.totalItems, 0);
    await shop(`mutation($id: ID!) { removeFavoriteArtwork(productId: $id) }`, { id: inquiry.id });
    assert.equal((await shop(query)).favoriteArtworks.totalItems, 1);
};
