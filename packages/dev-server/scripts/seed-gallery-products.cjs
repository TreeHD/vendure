/*
 * Creates six complete, saleable sample artworks for every configured gallery
 * collection. Run against the running Compose stack:
 *   set -a && . ./.env && set +a && node packages/dev-server/scripts/seed-gallery-products.cjs
 */
require('dotenv').config({ path: require('node:path').resolve(__dirname, '../../../.env') });

const apiUrl = process.env.ADMIN_API_URL || `http://127.0.0.1:${process.env.APP_HOST_PORT || 3000}/admin-api`;
const username = process.env.SUPERADMIN_USERNAME;
const password = process.env.SUPERADMIN_PASSWORD;
const itemsPerCollection = 6;

if (!username || !password) {
    throw new Error('SUPERADMIN_USERNAME and SUPERADMIN_PASSWORD must be set');
}

let cookie = '';
async function request(query, variables = {}) {
    const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
        body: JSON.stringify({ query, variables }),
    });
    const payload = await response.json();
    if (!response.ok || payload.errors?.length) throw new Error(JSON.stringify(payload.errors || payload));
    return payload.data;
}

function slugify(value) {
    return value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
}

function artworkFor(collection, index) {
    const prefixes = ['澄懷', '靜觀', '游心', '遠意', '墨韻', '清賞'];
    const themes = ['春曉', '夏山', '秋水', '冬林', '雲起', '月明'];
    const media = {
        painting: '水墨設色、宣紙', masters: '水墨、紙本', photography: '藝術微噴、典藏級相紙',
        'contemporary-art': '複合媒材、畫布', 'buddhist-sculptures': '銅鎏金、木座',
        'antiques-crafts': '陶瓷、木盒', calligraphy: '水墨、紙本', landscapes: '水墨設色、紙本',
        figures: '設色、絹本', 'flowers-birds': '水墨設色、紙本', 'four-gentlemen': '水墨、紙本',
        'oil-painting': '油彩、亞麻布', watercolor: '水彩、紙本',
        'antique-masterpieces': '瓷、木座', 'wood-fired': '柴燒陶、釉藥',
    };
    const year = 2016 + ((collection.id * 3 + index) % 10);
    const title = `${collection.name}・${prefixes[index - 1]}${themes[index - 1]}`;
    const enTitle = `${collection.enName} — ${['Dawn', 'Summer Mountain', 'Autumn Water', 'Winter Grove', 'Rising Clouds', 'Moonlight'][index - 1]}`;
    const code = `GLY-${String(collection.id).padStart(2, '0')}-${String(index).padStart(2, '0')}`;
    return {
        code, title, enTitle, year: String(year),
        dimensions: `${42 + index * 7} × ${58 + index * 9} cm`, material: media[collection.slug] || '複合媒材',
        price: 68000 + collection.id * 13000 + index * 17000,
        description: `〈${title}〉以細緻的光影與層次，描繪${collection.name}的當代觀點。作品保存狀況良好，附完整來源與典藏紀錄。`,
        enDescription: `${enTitle} presents a considered contemporary perspective on ${collection.enName}. The work is in excellent condition and is accompanied by provenance and collection records.`,
    };
}

function svgFor(artwork) {
    const safe = artwork.title.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
    return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900" viewBox="0 0 1200 900"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#17251f"/><stop offset="1" stop-color="#b89555"/></linearGradient></defs><rect width="1200" height="900" fill="url(#g)"/><circle cx="860" cy="260" r="155" fill="#e8d8ad" opacity=".72"/><path d="M0 690 C230 500 370 770 585 575 S930 750 1200 480 V900 H0Z" fill="#0b1713" opacity=".72"/><text x="80" y="130" font-family="serif" font-size="44" fill="#fff7e5">${safe}</text><text x="80" y="195" font-family="sans-serif" font-size="24" fill="#f2dfb4">Gallery Collection · ${artwork.year}</text></svg>`;
}

async function uploadAssets(artworks) {
    const mutation = `mutation CreateAssets($input: [CreateAssetInput!]!) { createAssets(input: $input) { ... on Asset { id name } ... on ErrorResult { errorCode message } } }`;
    const input = artworks.map(artwork => ({
        file: null,
        translations: [
            { languageCode: 'zh_Hant', name: `${artwork.title}.svg` },
            { languageCode: 'en', name: `${slugify(artwork.enTitle)}.svg` },
        ],
        customFields: { visibility: 'PUBLIC' },
    }));
    const form = new FormData();
    form.set('operations', JSON.stringify({ query: mutation, variables: { input } }));
    form.set('map', JSON.stringify(Object.fromEntries(artworks.map((_, i) => [String(i), [`variables.input.${i}.file`]]))));
    artworks.forEach((artwork, i) => form.set(String(i), new Blob([svgFor(artwork)], { type: 'image/svg+xml' }), `${artwork.code}.svg`));
    const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'apollo-require-preflight': 'true', ...(cookie ? { cookie } : {}) },
        body: form,
    });
    const payload = await response.json();
    if (!response.ok || payload.errors?.length) throw new Error(JSON.stringify(payload.errors || payload));
    const result = payload.data.createAssets;
    const failure = result.find(value => !value.id);
    if (failure) throw new Error(`Asset creation failed: ${failure.message}`);
    return result.map(value => value.id);
}

async function syncCollectionFilters(collections) {
    const facetResult = await request(`query GalleryFacet { facets(options: { take: 100 }) { items { id code values { id code } } } }`);
    let facet = facetResult.facets.items.find(item => item.code === 'gallery-collection');
    if (!facet) {
        const created = await request(`mutation CreateFacet($input: CreateFacetInput!) { createFacet(input: $input) { id code values { id code } } }`, {
            input: { code: 'gallery-collection', isPrivate: false, translations: [{ languageCode: 'zh_Hant', name: '藝廊分類' }, { languageCode: 'en', name: 'Gallery collection' }] },
        });
        facet = created.createFacet;
    }
    const values = new Map(facet.values.map(value => [value.code, value.id]));
    for (const collection of collections) {
        if (!values.has(collection.slug)) {
            const created = await request(`mutation CreateFacetValue($input: CreateFacetValueInput!) { createFacetValue(input: $input) { id code } }`, {
                input: { facetId: facet.id, code: collection.slug, translations: [{ languageCode: 'zh_Hant', name: collection.name }, { languageCode: 'en', name: collection.enName }] },
            });
            values.set(collection.slug, created.createFacetValue.id);
        }
    }
    const variants = await request(`query GalleryVariants { productVariants(options: { take: 200 }) { items { id sku } } }`);
    const updates = variants.productVariants.items
        .filter(variant => /^GLY-\d{2}-\d{2}$/.test(variant.sku))
        .map(variant => ({ id: variant.id, facetValueIds: [values.get(collections.find(collection => String(collection.id).padStart(2, '0') === variant.sku.slice(4, 6)).slug)] }));
    if (updates.length) await request(`mutation UpdateVariants($input: [UpdateProductVariantInput!]!) { updateProductVariants(input: $input) { id } }`, { input: updates });
    for (const collection of collections) {
        await request(`mutation UpdateCollection($input: UpdateCollectionInput!) { updateCollection(input: $input) { id } }`, {
            input: { id: collection.id, inheritFilters: false, filters: [{ code: 'facet-value-filter', arguments: [{ name: 'facetValueIds', value: JSON.stringify([values.get(collection.slug)]) }] }] },
        });
    }
}

async function main() {
    const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
            query: `mutation Login($username: String!, $password: String!) { login(username: $username, password: $password, rememberMe: true) { __typename ... on CurrentUser { id identifier } ... on ErrorResult { errorCode message } } }`,
            variables: { username, password },
        }),
    });
    const loginPayload = await response.json();
    if (!response.ok || loginPayload.errors?.length || loginPayload.data?.login?.__typename !== 'CurrentUser') {
        throw new Error(`Admin login failed: ${JSON.stringify(loginPayload.errors || loginPayload.data?.login)}`);
    }
    const setCookies = typeof response.headers.getSetCookie === 'function'
        ? response.headers.getSetCookie()
        : [response.headers.get('set-cookie') || ''];
    cookie = setCookies.filter(Boolean).map(value => value.split(';')[0]).join('; ');
    if (!cookie) throw new Error('Admin API did not issue a session cookie');

    const result = await request(`query Collections { collections(options: { take: 100 }) { items { id parent { id } translations { languageCode name slug } } } }`);
    const collections = result.collections.items
        .map(item => {
            const zh = item.translations.find(t => t.languageCode === 'zh_Hant');
            const en = item.translations.find(t => t.languageCode === 'en');
            return zh && zh.slug !== '__root_collection__' ? { id: item.id, name: zh.name, slug: zh.slug, enName: en?.name || zh.name } : null;
        })
        .filter(Boolean);
    if (collections.length === 0) throw new Error('No gallery collections found');
    await syncCollectionFilters(collections);

    const existing = await request(`query Products { products(options: { take: 200 }) { items { id customFields { legacyArtworkId } variants { sku } } } }`);
    const orphanProducts = existing.products.items.filter(product =>
        /^GLY-\d{2}-\d{2}$/.test(product.customFields.legacyArtworkId || '') && product.variants.length === 0,
    );
    for (const product of orphanProducts) {
        await request(`mutation DeleteProduct($id: ID!) { deleteProduct(id: $id) { result message } }`, { id: product.id });
    }
    if (orphanProducts.length) console.log(`Removed ${orphanProducts.length} incomplete product record(s) from earlier interrupted runs.`);
    const existingSkus = new Set(existing.products.items.flatMap(product => product.variants.map(variant => variant.sku)));
    const existingProducts = new Map(existing.products.items
        .filter(product => product.customFields.legacyArtworkId)
        .map(product => [product.customFields.legacyArtworkId, product.id]));
    const planned = collections.flatMap(collection => Array.from({ length: itemsPerCollection }, (_, i) => ({ collection, artwork: artworkFor(collection, i + 1) })))
        .filter(({ artwork }) => !existingSkus.has(artwork.code));
    console.log(`Found ${collections.length} collections; ${planned.length} products need creating.`);
    if (planned.length === 0) return console.log(`Nothing to create: all ${collections.length * itemsPerCollection} gallery products already exist.`);

    // The running gallery already has a public hero asset. Reuse it so this
    // seed is fast and safe to run against S3-backed deployments as well.
    const assets = await request(`query Assets { assets(options: { take: 1 }) { items { id } } }`);
    const publicAssetId = assets.assets.items[0]?.id;
    if (!publicAssetId) throw new Error('At least one public asset is required before seeding products');
    const assetIds = planned.map(() => publicAssetId);
    const taxSetup = await request(`query TaxSetup { taxCategories { items { id name isDefault } } zones { items { id name } } activeChannel { id defaultTaxZone { id } } }`);
    let taxCategoryId = taxSetup.taxCategories.items.find(category => category.isDefault)?.id;
    if (!taxCategoryId) {
        const created = await request(`mutation CreateTaxCategory($input: CreateTaxCategoryInput!) { createTaxCategory(input: $input) { id } }`, { input: { name: '標準稅別', isDefault: true } });
        taxCategoryId = created.createTaxCategory.id;
    }
    let taxZoneId = taxSetup.activeChannel.defaultTaxZone?.id || taxSetup.zones.items[0]?.id;
    if (!taxZoneId) {
        const created = await request(`mutation CreateZone($input: CreateZoneInput!) { createZone(input: $input) { id } }`, { input: { name: '預設稅區', memberIds: [] } });
        taxZoneId = created.createZone.id;
    }
    if (!taxSetup.activeChannel.defaultTaxZone?.id) {
        await request(`mutation UpdateChannel($input: UpdateChannelInput!) { updateChannel(input: $input) { ... on Channel { id } ... on ErrorResult { errorCode message } } }`, { input: { id: taxSetup.activeChannel.id, defaultTaxZoneId: taxZoneId } });
    }
    const createProduct = `mutation CreateProduct($input: CreateProductInput!) { createProduct(input: $input) { id name } }`;
    const createVariant = `mutation CreateVariant($input: [CreateProductVariantInput!]!) { createProductVariants(input: $input) { id sku } }`;
    for (const [i, { collection, artwork }] of planned.entries()) {
        const assetId = assetIds[i];
        const translations = [
            { languageCode: 'zh_Hant', name: artwork.title, slug: `${collection.slug}-${artwork.code.toLowerCase()}`, description: artwork.description, customFields: { material: artwork.material, seals: `典藏印記 ${artwork.code}`, inscriptions: `題識：${artwork.title}`, collectionStory: `本作收錄於「${collection.name}」專題典藏，來源與保存紀錄完整。` } },
            { languageCode: 'en', name: artwork.enTitle, slug: `${collection.slug}-${artwork.code.toLowerCase()}-en`, description: artwork.enDescription, customFields: { material: artwork.material, seals: `Collection mark ${artwork.code}`, inscriptions: `Inscription: ${artwork.enTitle}`, collectionStory: `Part of the ${collection.enName} collection with complete provenance and condition records.` } },
        ];
        const productId = existingProducts.get(artwork.code) || (await request(createProduct, { input: { enabled: true, featuredAssetId: assetId, assetIds: [assetId], translations, customFields: { legacyArtworkId: artwork.code, yearText: artwork.year, dimensionsText: artwork.dimensions, highResolutionAssetId: assetId, isDirectPurchase: true, priceVisibility: 'PUBLIC', sourceReferences: `館藏登錄 ${artwork.code}；來源文件與狀況報告均已歸檔。`, verificationStatus: 'VERIFIED' } } })).createProduct.id;
        const variant = await request(createVariant, { input: [{ productId, enabled: true, sku: artwork.code, price: artwork.price, taxCategoryId, stockOnHand: 1, trackInventory: 'TRUE', featuredAssetId: assetId, assetIds: [assetId], translations: translations.map(t => ({ languageCode: t.languageCode, name: `${t.name}（原作）` })) }] });
    }
    await syncCollectionFilters(collections);
    console.log(`Created ${planned.length} products and ${planned.length} variants across ${collections.length} collections.`);
}

main().catch(error => { console.error(error); process.exitCode = 1; });
