import gql from 'graphql-tag';

const common = gql`
    enum CmsArticleStatus {
        DRAFT
        PUBLISHED
        ARCHIVED
    }
    type CmsArticleTranslation {
        languageCode: LanguageCode!
        title: String!
        slug: String!
        excerpt: String!
        content: JSON!
        seoTitle: String!
        seoDescription: String!
    }
    type CmsCategoryTranslation {
        languageCode: LanguageCode!
        name: String!
        slug: String!
        description: String!
    }
    type CmsCategory implements Node {
        id: ID!
        createdAt: DateTime!
        updatedAt: DateTime!
        name: String!
        slug: String!
        description: String!
        translations: [CmsCategoryTranslation!]!
    }
    type CmsArticle implements Node {
        id: ID!
        createdAt: DateTime!
        updatedAt: DateTime!
        status: CmsArticleStatus!
        publishedAt: DateTime
        featuredAsset: Asset
        category: CmsCategory
        title: String!
        slug: String!
        excerpt: String!
        content: JSON!
        seoTitle: String!
        seoDescription: String!
        translations: [CmsArticleTranslation!]!
    }
    type CmsArticleList implements PaginatedList {
        items: [CmsArticle!]!
        totalItems: Int!
    }
    input CmsStringFilter {
        contains: String
    }
    input CmsStatusFilter {
        eq: CmsArticleStatus
    }
    input CmsIdFilter {
        eq: ID
    }
    input CmsDateFilter {
        before: DateTime
        after: DateTime
    }
    input CmsArticleFilterParameter {
        title: CmsStringFilter
        status: CmsStatusFilter
        categoryId: CmsIdFilter
        publishedAt: CmsDateFilter
    }
    input CmsArticleSortParameter {
        publishedAt: SortOrder
        updatedAt: SortOrder
        createdAt: SortOrder
    }
    input CmsArticleListOptions {
        skip: Int
        take: Int
        sort: CmsArticleSortParameter
        filter: CmsArticleFilterParameter
    }
    input CmsArticleTranslationInput {
        languageCode: LanguageCode!
        title: String!
        slug: String!
        excerpt: String
        content: JSON!
        seoTitle: String
        seoDescription: String
    }
    input CreateCmsArticleInput {
        featuredAssetId: ID
        categoryId: ID
        translations: [CmsArticleTranslationInput!]!
        publishedAt: DateTime
    }
    input UpdateCmsArticleInput {
        id: ID!
        featuredAssetId: ID
        categoryId: ID
        translations: [CmsArticleTranslationInput!]
        publishedAt: DateTime
    }
    input CmsCategoryTranslationInput {
        languageCode: LanguageCode!
        name: String!
        slug: String!
        description: String
    }
    input CreateCmsCategoryInput {
        translations: [CmsCategoryTranslationInput!]!
    }
    input UpdateCmsCategoryInput {
        id: ID!
        translations: [CmsCategoryTranslationInput!]!
    }
`;

export const adminApiExtensions = gql`
    ${common}
    extend type Query {
        articles(options: CmsArticleListOptions): CmsArticleList!
        article(id: ID!): CmsArticle
        categories: [CmsCategory!]!
    }
    extend type Mutation {
        createArticle(input: CreateCmsArticleInput!): CmsArticle!
        updateArticle(input: UpdateCmsArticleInput!): CmsArticle!
        deleteArticle(id: ID!): DeletionResponse!
        publishArticle(id: ID!): CmsArticle!
        unpublishArticle(id: ID!): CmsArticle!
        archiveArticle(id: ID!): CmsArticle!
        createCmsCategory(input: CreateCmsCategoryInput!): CmsCategory!
        updateCmsCategory(input: UpdateCmsCategoryInput!): CmsCategory!
        deleteCmsCategory(id: ID!): DeletionResponse!
    }
`;

export const shopApiExtensions = gql`
    ${common}
    extend type Query {
        articles(options: CmsArticleListOptions): CmsArticleList!
        articleBySlug(slug: String!): CmsArticle
        articleCategories: [CmsCategory!]!
    }
`;
