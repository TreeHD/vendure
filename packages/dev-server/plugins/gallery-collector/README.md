# Gallery collector

Implements requirements §5.4 on the Shop API. Enable `GalleryCollectorPlugin` alongside
`GalleryCatalogPlugin` (already configured in `dev-config.ts`). Apply
`1788750620674-gallery-collector.ts` after the initial gallery migration, then
`1788750620675-gallery-collector-view-events.ts` before starting the server. The first migration
adds `favorite_artwork` and `artwork_view`; the second removes the artwork-view uniqueness
constraint so each view is retained as an event.

Every operation requires a customer session. Customer identity comes from `ctx.activeUserId` and is
resolved to a Customer in the active channel. Inputs cannot specify customer IDs. Administrator
sessions do not grant access to customers' personal lists. Favorites have a unique
`(customerId, channelId, productId)` index; artwork views use non-unique indexes so repeated views
remain separate events.

| Operation                           | Behaviour                                                                       |
| ----------------------------------- | ------------------------------------------------------------------------------- |
| `favoriteArtworks(skip, take)`      | Newest saved first; real totalItems and latest visible savedAt as lastUpdatedAt |
| `addFavoriteArtwork(productId)`     | Idempotent add; returns the first page of favorites                             |
| `mergeFavoriteArtworks(productIds)` | At most 100 input IDs, deduplicated; validates all products before saving       |
| `removeFavoriteArtwork(productId)`  | Idempotent removal from the current customer's channel only                     |
| `artworkHistory(skip, take)`        | Most recently viewed events first; repeated views remain separate rows          |
| `recordArtworkView(input)`          | Inserts an event with server-generated viewedAt, sourceCode and sourcePath       |
| `clearArtworkHistory`               | Removes the current customer's history in this channel                          |

Pagination defaults to 20 and is capped at 100. Missing, deleted, disabled or other-channel works
cannot be added. Invalid merges fail atomically. Existing favorites retain their original savedAt;
cookie dates are never accepted or fabricated. Adding favorites does not create an Order.
Lists exclude works which have since been disabled, deleted or removed from the current channel.
`artwork` is nullable to handle a work becoming unavailable while the response is being assembled.
Empty lists return zero items and null lastUpdatedAt, with no mock fallback.

View sourceCode is a non-localized identifier (letters, numbers, hyphens and underscores, max 64).
sourcePath must be local, max 2048 characters, and is saved without query parameters or fragments.
This is a customer's per-view event history, scoped to the active channel. Every
successful `recordArtworkView` call creates a row, including repeated views of the
same work. Use pagination and `clearArtworkHistory` to manage long histories.

```graphql
mutation MergeBag($ids: [ID!]!) {
    mergeFavoriteArtworks(productIds: $ids) {
        totalItems
        items {
            savedAt
            artwork {
                id
                slug
                title
                image {
                    preview
                }
            }
        }
    }
}

query MyHistory($skip: Int!, $take: Int!) {
    artworkHistory(skip: $skip, take: $take) {
        totalItems
        items {
            viewedAt
            sourceCode
            sourcePath
            artwork {
                id
                slug
                title
            }
        }
    }
}
```

`bun run test:gallery` includes real GraphQL checks with two customer sessions. It covers ownership,
channel isolation, pagination, duplicate merge timestamps, atomic invalid merges, append-only history events,
source URL sanitization, disabled works, and clearing/removing only one's own records. PostgreSQL 16
was also tested with schema synchronization disabled after applying migrations, including concurrent
duplicate favorite inserts. Use `GALLERY_TEST_USE_MIGRATIONS=true` with `GALLERY_TEST_POSTGRES_PORT`
only against a fresh disposable database already prepared with the gallery migrations.

Nuxt Bag/login-merge wiring and account pages are still needed. Purchase history should use native
customer Orders and OrderLines; this plugin does not create parallel purchase records. Account
retention/export policy, analytics and the other gallery business modules remain separate work.
