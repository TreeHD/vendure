/*
 * Downloads one deterministic Picsum image for each gallery artwork and stores
 * it through Vendure's configured AssetServer storage (R2/S3 in this stack).
 * Run: node packages/dev-server/scripts/assign-gallery-picsum-images.cjs
 */
require('dotenv').config({ path: require('node:path').resolve(__dirname, '../../../.env') });

const apiUrl = process.env.ADMIN_API_URL || `http://127.0.0.1:${process.env.APP_HOST_PORT || 3000}/admin-api`;
const username = process.env.SUPERADMIN_USERNAME;
const password = process.env.SUPERADMIN_PASSWORD;
const batchSize = Math.max(1, Number(process.env.GALLERY_IMAGE_BATCH || 15));
let cookie = '';

if (!username || !password) throw new Error('SUPERADMIN_USERNAME and SUPERADMIN_PASSWORD must be set');

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

async function login() {
    const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
            query: `mutation Login($username: String!, $password: String!) { login(username: $username, password: $password, rememberMe: true) { __typename ... on CurrentUser { id } ... on ErrorResult { message } } }`,
            variables: { username, password },
        }),
    });
    const payload = await response.json();
    if (!response.ok || payload.errors?.length || payload.data?.login?.__typename !== 'CurrentUser') {
        throw new Error(`Admin login failed: ${JSON.stringify(payload.errors || payload.data?.login)}`);
    }
    const setCookies = typeof response.headers.getSetCookie === 'function'
        ? response.headers.getSetCookie()
        : [response.headers.get('set-cookie') || ''];
    cookie = setCookies.filter(Boolean).map(value => value.split(';')[0]).join('; ');
    if (!cookie) throw new Error('Admin API did not issue a session cookie');
}

async function createAsset(code, order) {
    const sourceUrl = `https://picsum.photos/seed/gallery-${String(order).padStart(3, '0')}/800/1200`;
    const imageResponse = await fetch(sourceUrl);
    if (!imageResponse.ok) throw new Error(`Could not download ${sourceUrl}: HTTP ${imageResponse.status}`);
    const contentType = imageResponse.headers.get('content-type') || 'image/jpeg';
    const image = await imageResponse.blob();
    if (!contentType.startsWith('image/') || image.size === 0) throw new Error(`Invalid image returned by ${sourceUrl}`);

    const mutation = `mutation CreateAsset($input: [CreateAssetInput!]!) { createAssets(input: $input) { ... on Asset { id source } ... on ErrorResult { errorCode message } } }`;
    const form = new FormData();
    form.set('operations', JSON.stringify({
        query: mutation,
        variables: { input: [{ file: null, translations: [{ languageCode: 'zh_Hant', name: `${code}.jpg` }], customFields: { visibility: 'PUBLIC' } }] },
    }));
    form.set('map', JSON.stringify({ '0': ['variables.input.0.file'] }));
    form.set('0', image, `${code}.jpg`);
    const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'apollo-require-preflight': 'true', cookie },
        body: form,
    });
    const payload = await response.json();
    if (!response.ok || payload.errors?.length) throw new Error(JSON.stringify(payload.errors || payload));
    const asset = payload.data.createAssets[0];
    if (!asset?.id) throw new Error(`Asset creation failed for ${code}: ${asset?.message || 'unknown error'}`);
    return asset;
}

async function main() {
    await login();
    const catalog = await request(`query GalleryProducts { products(options: { take: 200 }) { items { id featuredAsset { id name } customFields { legacyArtworkId } variants { id sku } } } }`);
    const artworks = catalog.products.items
        .map(product => ({ productId: product.id, code: product.customFields.legacyArtworkId, featuredAsset: product.featuredAsset, variant: product.variants.find(variant => variant.sku === product.customFields.legacyArtworkId) }))
        .filter(artwork => /^GLY-\d{2}-\d{2}$/.test(artwork.code || '') && artwork.variant)
        .sort((a, b) => a.code.localeCompare(b.code))
        .map((artwork, index) => ({ ...artwork, order: index + 1 }));
    if (artworks.length !== 90) throw new Error(`Expected 90 saleable gallery products, found ${artworks.length}`);
    const pending = artworks.filter(artwork => artwork.featuredAsset?.name !== `${artwork.code}.jpg`);
    console.log(`${pending.length}/90 products need a unique Picsum image.`);

    const updateProduct = `mutation UpdateProduct($input: UpdateProductInput!) { updateProduct(input: $input) { id } }`;
    const updateVariant = `mutation UpdateVariant($input: UpdateProductVariantInput!) { updateProductVariant(input: $input) { id } }`;
    const batch = pending.slice(0, batchSize);
    for (const [index, artwork] of batch.entries()) {
        const asset = await createAsset(artwork.code, artwork.order);
        await request(updateProduct, {
            input: { id: artwork.productId, featuredAssetId: asset.id, assetIds: [asset.id], customFields: { highResolutionAssetId: asset.id } },
        });
        await request(updateVariant, {
            input: { id: artwork.variant.id, featuredAssetId: asset.id, assetIds: [asset.id] },
        });
        console.log(`${String(index + 1).padStart(2, '0')}/${batch.length} ${artwork.code} → asset ${asset.id}`);
    }
    console.log(batch.length === pending.length
        ? 'Assigned unique Picsum images through the configured AssetServer storage.'
        : `${pending.length - batch.length} products remain; rerun this script to continue.`);
}

main().catch(error => { console.error(error); process.exitCode = 1; });
