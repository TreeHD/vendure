import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Allow, Ctx, ID, RequestContext, Transaction } from '@vendure/core';

import { CmsService } from './cms.service';
import * as P from './permissions';

@Resolver()
export class CmsAdminResolver {
    constructor(private cms: CmsService) {}

    @Query()
    @Allow(P.ReadCms.Permission)
    articles(@Ctx() ctx: RequestContext, @Args() args: { options?: any }) {
        return this.cms.articles(ctx, args.options);
    }

    @Query()
    @Allow(P.ReadCms.Permission)
    article(@Ctx() ctx: RequestContext, @Args() args: { id: ID }) {
        return this.cms.article(ctx, args.id);
    }

    @Query()
    @Allow(P.ReadCms.Permission)
    categories(@Ctx() ctx: RequestContext) {
        return this.cms.categories(ctx);
    }

    @Mutation()
    @Transaction()
    @Allow(P.UpdateCms.Permission)
    createArticle(@Ctx() ctx: RequestContext, @Args() args: { input: any }) {
        return this.cms.createArticle(ctx, args.input);
    }

    @Mutation()
    @Transaction()
    @Allow(P.UpdateCms.Permission)
    updateArticle(@Ctx() ctx: RequestContext, @Args() args: { input: any }) {
        return this.cms.updateArticle(ctx, args.input);
    }

    @Mutation()
    @Transaction()
    @Allow(P.DeleteCms.Permission)
    deleteArticle(@Ctx() ctx: RequestContext, @Args() args: { id: ID }) {
        return this.cms.deleteArticle(ctx, args.id);
    }

    @Mutation()
    @Transaction()
    @Allow(P.PublishCms.Permission)
    publishArticle(@Ctx() ctx: RequestContext, @Args() args: { id: ID }) {
        return this.cms.publishArticle(ctx, args.id);
    }

    @Mutation()
    @Transaction()
    @Allow(P.PublishCms.Permission)
    unpublishArticle(@Ctx() ctx: RequestContext, @Args() args: { id: ID }) {
        return this.cms.unpublishArticle(ctx, args.id);
    }

    @Mutation()
    @Transaction()
    @Allow(P.PublishCms.Permission)
    archiveArticle(@Ctx() ctx: RequestContext, @Args() args: { id: ID }) {
        return this.cms.archiveArticle(ctx, args.id);
    }

    @Mutation()
    @Transaction()
    @Allow(P.UpdateCms.Permission)
    createCmsCategory(@Ctx() ctx: RequestContext, @Args() args: { input: any }) {
        return this.cms.createCategory(ctx, args.input);
    }

    @Mutation()
    @Transaction()
    @Allow(P.UpdateCms.Permission)
    updateCmsCategory(@Ctx() ctx: RequestContext, @Args() args: { input: any }) {
        return this.cms.updateCategory(ctx, args.input);
    }

    @Mutation()
    @Transaction()
    @Allow(P.DeleteCms.Permission)
    deleteCmsCategory(@Ctx() ctx: RequestContext, @Args() args: { id: ID }) {
        return this.cms.deleteCategory(ctx, args.id);
    }
}
