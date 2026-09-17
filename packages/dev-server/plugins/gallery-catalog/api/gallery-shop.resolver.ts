import { Args, Query, Resolver } from '@nestjs/graphql';
import { Allow, Ctx, Permission, RequestContext } from '@vendure/core';

import { GalleryArtworkListOptions, GalleryCatalogService } from '../services/gallery-catalog.service';

@Resolver()
export class GalleryShopResolver {
    constructor(private galleryCatalogService: GalleryCatalogService) {}

    @Query()
    @Allow(Permission.Public)
    galleryArtworks(
        @Ctx() ctx: RequestContext,
        @Args() { options }: { options?: GalleryArtworkListOptions },
    ) {
        return this.galleryCatalogService.findArtworks(ctx, options);
    }

    @Query()
    @Allow(Permission.Public)
    galleryArtwork(@Ctx() ctx: RequestContext, @Args() { slug }: { slug: string }) {
        return this.galleryCatalogService.findArtwork(ctx, slug);
    }

    @Query()
    @Allow(Permission.Public)
    galleryArtists(@Ctx() ctx: RequestContext, @Args() { skip, take }: { skip?: number; take?: number }) {
        return this.galleryCatalogService.findArtists(ctx, skip, take);
    }

    @Query()
    @Allow(Permission.Public)
    galleryArtist(@Ctx() ctx: RequestContext, @Args() { slug }: { slug: string }) {
        return this.galleryCatalogService.findArtistBySlug(ctx, slug);
    }
}
