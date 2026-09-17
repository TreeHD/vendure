# CMS plugin

`CmsPlugin` provides channel-isolated, translatable Blog articles. It has no Product relation:
an article may contain normal `http`, `https`, or `mailto` links to a storefront product, but Product data
is never copied into or coupled to the CMS.

## Public Shop API

Only articles assigned to the request Channel with `status = PUBLISHED` and either a null or elapsed
`publishedAt` are returned. A future `publishedAt` is therefore a scheduled publication and needs no worker.

```graphql
query BlogPost($slug: String!) {
    articleBySlug(slug: $slug) {
        id
        title
        slug
        excerpt
        content
        publishedAt
        featuredAsset {
            id
            preview
            source
        }
        category {
            id
            name
            slug
            description
        }
    }
}
```

Article and category translations use Vendure's normal `languageCode` selection. Article slugs are globally
unique per language (`languageCode`, `slug`), so the same locale cannot resolve two different articles.

## Admin API

The custom permissions are `ReadCms`, `UpdateCms`, `PublishCms`, and `DeleteCms`. Administrators operate
inside their active Channel. `publishArticle` fills a missing `publishedAt` with the current time;
`unpublishArticle` switches back to draft while retaining that timestamp for audit and future reuse.
Status changes are available only through `publishArticle`, `unpublishArticle`, and `archiveArticle`, all of
which require `PublishCms`; ordinary updates cannot bypass publication permissions.

`content` is a canonical TipTap/ProseMirror JSON document. The backend rejects raw HTML/script/iframe nodes,
unsafe URL protocols, excessive nesting, and images whose `assetId` is not an Asset visible in the active Channel.

Every CMS validation failure returns a stable bracketed code followed by a user-facing explanation, for example
`[INVALID_CONTENT_DOCUMENT] content 必須是 TipTap／ProseMirror JSON 文件...`. Clients may use the code as a
stable branch key, while showing the remainder directly to an administrator.

Dashboard editing is deliberately deferred; this plugin exposes the complete Admin GraphQL API needed to build it.
