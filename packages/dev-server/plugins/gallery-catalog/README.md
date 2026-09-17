# Gallery catalog P0

This plugin implements the P0 catalog model from `VENDURE_BACKEND_REQUIREMENTS.md`:

- Product custom fields for artwork metadata, artists, purchase mode and price visibility
- translatable Artist entities with draft/published state and Asset relations
- public `galleryArtworks`, `galleryArtwork`, `galleryArtists` and `galleryArtist` Shop queries;
  `galleryArtworks` accepts `collectionId` or `collectionSlug` for Collection filtering
- Admin API operations for creating, updating and publishing artists
- TWD, `zh_Hant` and English channel configuration
- an order interceptor which rejects inquiry-only artworks and quantities other than one

An inquiry-only artwork must not have a ProductVariant, even a disabled one. Blocking Product and
ProductVariant event handlers reject violations inside native Admin API mutation transactions.
Changing an existing priced product to inquiry mode is rejected too. Startup refuses pre-existing
violations without deleting data. Custom import scripts must use `connection.withTransaction()`
around service calls; direct database writes bypass mutation checks.

This implements the requirements' public-price-only Variant model, not customer-specific price
masking. Private proposals need their own protected entities/order workflow and must never be
stored in catalogue variants. A direct-purchase original has exactly one enabled,
inventory-tracked variant with stock on hand of one.

For local development, copy `.env.gallery.example` values into the environment, set
`DB_SYNCHRONIZE=true` for an empty disposable database, then start the dev server. Schema sync is
disabled unless explicitly enabled. Do not use the monorepo demo populate script for gallery data.
Production must use PostgreSQL,
`DB_SYNCHRONIZE=false`, generated migrations, persistent Asset storage, and non-default secrets.
Payment, shipping and tax policy remain intentionally unconfigured because the requirements list
their providers and business rules as unresolved decisions for P3. The dummy payment handler is
development-only; production has no payment handler until a provider is integrated.

SMTP settings enable real email delivery; without SMTP_HOST development uses `/mailbox` previews.
Production requires SMTP, persistent public asset storage settings, explicit customer email URLs,
and credentials. Customer verification/reset links target the storefront, whose routes must be
implemented separately. Start the background worker to process email and indexing jobs. No email
was sent as part of the tests.

## Verification and remaining work

Run `bun run test:gallery` from `packages/dev-server`. The tests use isolated in-memory databases;
the GraphQL test listens on an ephemeral loopback port. They cover pagination beyond
100 works, draft visibility, missing slugs, and duplicate-add/quantity-adjustment restrictions.
Artist translation patches preserve omitted fields. Publishing requires a name and summary in both
zh_Hant and en; incomplete drafts remain permitted. Published updates enforce the same requirements.
`archiveGalleryArtist` requires DeleteCatalog and hides the artist from Shop queries while preserving
its identity and artwork relations.

GraphQL tests cover rejected enabled/disabled inquiry variants, bulk mutation rollback, rejected
price-policy changes, startup detection of invalid imported data, and native `product`, `products`,
`search` plus gallery queries as anonymous, COLLECTOR and VIP users. Public TWD Money values are
checked without converting minor units. The same suite has been run on PostgreSQL 16, including
concurrent variant creation and switching to inquiry mode. For a fresh disposable PostgreSQL DB,
set `GALLERY_TEST_POSTGRES_PORT` when running `node scripts/gallery-price-policy.spec.cjs`; the test
uses database `gallery_policy_test` and the test-only credentials in that script, and creates fixture
data with schema synchronization. Never point it at application data. External caches, collections
and a private proposal workflow are not covered.

The initial migration is PostgreSQL-only and targets an empty database. The server build includes
compiled migrations; SQLite development uses an independent schema without running PostgreSQL DDL.
Channel initialization refuses to relabel existing non-TWD prices.

This is still a partial implementation of the requirements. Asset visibility metadata and
privateOriginalAsset relations do not secure AssetServer
file URLs; private originals require separate protected storage before use. Payment-time inventory
validation, SSR sessions, Artist Dashboard pages, Collector frontend integration,
PrivateSales, CRM, notifications and CMS remain outstanding.
