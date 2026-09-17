import gql from 'graphql-tag';

const commonTypes = `
    enum ArtistStatus { DRAFT PUBLISHED ARCHIVED }
    enum GalleryPurchaseMode { DIRECT INQUIRY }

    type GalleryArtistTranslation implements Node {
        id: ID!
        createdAt: DateTime!
        updatedAt: DateTime!
        languageCode: LanguageCode!
        name: String!
        quote: String!
        summary: String!
        lineageTitle: String!
        lineageParagraph1: String!
        lineageParagraph2: String!
        exhibitionSummary: String!
        seoTitle: String!
        seoDescription: String!
    }

    type GalleryArtist implements Node {
        id: ID!
        createdAt: DateTime!
        updatedAt: DateTime!
        slug: String!
        legacyArtistId: String
        name: String!
        quote: String!
        summary: String!
        lineageTitle: String!
        lineageParagraph1: String!
        lineageParagraph2: String!
        exhibitionSummary: String!
        seoTitle: String!
        seoDescription: String!
        status: ArtistStatus!
        publishedAt: DateTime
        sortOrder: Int!
        templateKey: String
        contentBlocks: JSON
        avatarAsset: Asset
        heroAsset: Asset
        translations: [GalleryArtistTranslation!]!
    }
`;

export const shopApiExtensions = gql(
    commonTypes +
        `

    type GalleryMoney {
        amount: Money!
        currencyCode: CurrencyCode!
    }

    type GalleryArtwork implements Node {
        id: ID!
        createdAt: DateTime!
        updatedAt: DateTime!
        slug: String!
        title: String!
        yearText: String
        dimensionsText: String
        material: String
        seals: String
        inscriptions: String
        concept: String!
        collectionStory: String
        image: Asset
        highResolutionImage: Asset
        artists: [GalleryArtist!]!
        purchaseMode: GalleryPurchaseMode!
        available: Boolean!
        purchasableVariantId: ID
        price: GalleryMoney
    }

    type GalleryArtworkList { items: [GalleryArtwork!]!, totalItems: Int! }
    type GalleryArtistList { items: [GalleryArtist!]!, totalItems: Int! }

    input GalleryArtworkListOptions {
        skip: Int = 0
        take: Int = 20
        artistSlug: String
        categoryId: ID
        collectionId: ID
        collectionSlug: String
        term: String
    }

    extend type Query {
        galleryArtworks(options: GalleryArtworkListOptions): GalleryArtworkList!
        galleryArtwork(slug: String!): GalleryArtwork
        galleryArtists(skip: Int = 0, take: Int = 20): GalleryArtistList!
        galleryArtist(slug: String!): GalleryArtist
    }
`,
);

export const adminApiExtensions = gql(
    commonTypes +
        `

    input GalleryArtistTranslationInput {
        id: ID
        languageCode: LanguageCode!
        name: String!
        quote: String
        summary: String
        lineageTitle: String
        lineageParagraph1: String
        lineageParagraph2: String
        exhibitionSummary: String
        seoTitle: String
        seoDescription: String
    }

    input CreateGalleryArtistInput {
        slug: String!
        legacyArtistId: String
        sortOrder: Int = 0
        templateKey: String
        contentBlocks: JSON
        avatarAssetId: ID
        heroAssetId: ID
        translations: [GalleryArtistTranslationInput!]!
    }

    input UpdateGalleryArtistInput {
        id: ID!
        slug: String
        legacyArtistId: String
        sortOrder: Int
        templateKey: String
        contentBlocks: JSON
        avatarAssetId: ID
        heroAssetId: ID
        translations: [GalleryArtistTranslationInput!]
    }

    type GalleryArtistList { items: [GalleryArtist!]!, totalItems: Int! }

    extend type Query {
        galleryArtists(skip: Int = 0, take: Int = 20): GalleryArtistList!
        galleryArtist(id: ID!): GalleryArtist
    }

    extend type Mutation {
        createGalleryArtist(input: CreateGalleryArtistInput!): GalleryArtist!
        updateGalleryArtist(input: UpdateGalleryArtistInput!): GalleryArtist!
        publishGalleryArtist(id: ID!): GalleryArtist!
        archiveGalleryArtist(id: ID!): GalleryArtist!
    }
`,
);
