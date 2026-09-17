import { Args, Query, Resolver } from '@nestjs/graphql';
import { Allow, Ctx, Permission, RequestContext } from '@vendure/core';

import { CmsService } from './cms.service';

@Resolver()
export class CmsShopResolver {
    constructor(private cms: CmsService) {}

    @Query()
    @Allow(Permission.Public)
    articles(@Ctx() ctx: RequestContext, @Args() args: { options?: any }) {
        return this.cms.articles(ctx, args.options, true);
    }

    @Query()
    @Allow(Permission.Public)
    articleBySlug(@Ctx() ctx: RequestContext, @Args() args: { slug: string }) {
        return this.cms.articleBySlug(ctx, args.slug);
    }

    @Query()
    @Allow(Permission.Public)
    articleCategories(@Ctx() ctx: RequestContext) {
        return this.cms.categories(ctx, true);
    }
}
