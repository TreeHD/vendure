import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Allow, Ctx, ID, Permission, RequestContext, Transaction } from '@vendure/core';

import { ArtistAdminService } from '../services/artist-admin.service';

@Resolver()
export class GalleryAdminResolver {
    constructor(private artistAdminService: ArtistAdminService) {}

    @Query()
    @Allow(Permission.ReadCatalog)
    galleryArtists(@Ctx() ctx: RequestContext, @Args() { skip, take }: { skip?: number; take?: number }) {
        return this.artistAdminService.findAll(ctx, skip, take);
    }

    @Query()
    @Allow(Permission.ReadCatalog)
    galleryArtist(@Ctx() ctx: RequestContext, @Args() { id }: { id: ID }) {
        return this.artistAdminService.findOne(ctx, id);
    }

    @Mutation()
    @Transaction()
    @Allow(Permission.CreateCatalog)
    createGalleryArtist(@Ctx() ctx: RequestContext, @Args() { input }: { input: any }) {
        return this.artistAdminService.create(ctx, input);
    }

    @Mutation()
    @Transaction()
    @Allow(Permission.UpdateCatalog)
    updateGalleryArtist(@Ctx() ctx: RequestContext, @Args() { input }: { input: any }) {
        return this.artistAdminService.update(ctx, input);
    }

    @Mutation()
    @Transaction()
    @Allow(Permission.UpdateCatalog)
    publishGalleryArtist(@Ctx() ctx: RequestContext, @Args() { id }: { id: ID }) {
        return this.artistAdminService.publish(ctx, id);
    }

    @Mutation()
    @Transaction()
    @Allow(Permission.DeleteCatalog)
    archiveGalleryArtist(@Ctx() ctx: RequestContext, @Args() { id }: { id: ID }) {
        return this.artistAdminService.archive(ctx, id);
    }
}
