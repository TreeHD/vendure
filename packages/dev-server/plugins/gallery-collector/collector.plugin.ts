import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import {
    Allow,
    Ctx,
    ID,
    Permission,
    PluginCommonModule,
    RequestContext,
    Transaction,
    VendurePlugin,
} from '@vendure/core';
import gql from 'graphql-tag';

import { GalleryCatalogPlugin } from '../gallery-catalog/gallery-catalog.plugin';

import { ArtworkView, FavoriteArtwork } from './collector.entities';
import { CollectorService } from './collector.service';

@Resolver()
class CollectorResolver {
    constructor(private service: CollectorService) {}

    @Query()
    @Allow(Permission.Owner)
    favoriteArtworks(@Ctx() ctx: RequestContext, @Args() args: { skip?: number; take?: number }) {
        return this.service.list(ctx, false, args.skip, args.take);
    }

    @Query()
    @Allow(Permission.Owner)
    artworkHistory(@Ctx() ctx: RequestContext, @Args() args: { skip?: number; take?: number }) {
        return this.service.list(ctx, true, args.skip, args.take);
    }

    @Mutation()
    @Transaction()
    @Allow(Permission.Owner)
    mergeFavoriteArtworks(@Ctx() ctx: RequestContext, @Args() args: { productIds: ID[] }) {
        return this.service.merge(ctx, args.productIds);
    }

    @Mutation()
    @Transaction()
    @Allow(Permission.Owner)
    addFavoriteArtwork(@Ctx() ctx: RequestContext, @Args() args: { productId: ID }) {
        return this.service.merge(ctx, [args.productId]);
    }

    @Mutation()
    @Transaction()
    @Allow(Permission.Owner)
    removeFavoriteArtwork(@Ctx() ctx: RequestContext, @Args() args: { productId: ID }) {
        return this.service.remove(ctx, args.productId);
    }

    @Mutation()
    @Transaction()
    @Allow(Permission.Owner)
    recordArtworkView(
        @Ctx() ctx: RequestContext,
        @Args() args: { input: { productId: ID; sourceCode?: string; sourcePath?: string } },
    ) {
        return this.service.recordView(ctx, args.input);
    }

    @Mutation()
    @Transaction()
    @Allow(Permission.Owner)
    clearArtworkHistory(@Ctx() ctx: RequestContext) {
        return this.service.clearHistory(ctx);
    }
}

@VendurePlugin({
    compatibility: '^3.7.0',
    imports: [PluginCommonModule, GalleryCatalogPlugin],
    entities: [FavoriteArtwork, ArtworkView],
    providers: [CollectorService],
    shopApiExtensions: {
        resolvers: [CollectorResolver],
        schema: gql`
            type FavoriteArtwork {
                id: ID!
                artwork: GalleryArtwork
                savedAt: DateTime!
            }
            type ArtworkView {
                id: ID!
                artwork: GalleryArtwork
                viewedAt: DateTime!
                sourceCode: String
                sourcePath: String
            }
            type FavoriteArtworkList {
                items: [FavoriteArtwork!]!
                totalItems: Int!
                lastUpdatedAt: DateTime
            }
            type ArtworkViewList {
                items: [ArtworkView!]!
                totalItems: Int!
                lastUpdatedAt: DateTime
            }
            input RecordArtworkViewInput {
                productId: ID!
                sourceCode: String
                sourcePath: String
            }
            extend type Query {
                favoriteArtworks(skip: Int = 0, take: Int = 20): FavoriteArtworkList!
                artworkHistory(skip: Int = 0, take: Int = 20): ArtworkViewList!
            }
            extend type Mutation {
                addFavoriteArtwork(productId: ID!): FavoriteArtworkList!
                mergeFavoriteArtworks(productIds: [ID!]!): FavoriteArtworkList!
                removeFavoriteArtwork(productId: ID!): Boolean!
                recordArtworkView(input: RecordArtworkViewInput!): Boolean!
                clearArtworkHistory: Boolean!
            }
        `,
    },
})
export class GalleryCollectorPlugin {}
