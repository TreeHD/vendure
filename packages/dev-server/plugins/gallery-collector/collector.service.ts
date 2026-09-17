import { Injectable } from '@nestjs/common';
import {
    CustomerService,
    ForbiddenError,
    ID,
    ProductService,
    RequestContext,
    TransactionalConnection,
    UserInputError,
} from '@vendure/core';

import { GalleryCatalogService } from '../gallery-catalog/services/gallery-catalog.service';

import { ArtworkView, FavoriteArtwork } from './collector.entities';

@Injectable()
export class CollectorService {
    constructor(
        private connection: TransactionalConnection,
        private customers: CustomerService,
        private products: ProductService,
        private gallery: GalleryCatalogService,
    ) {}

    async list(ctx: RequestContext, history = false, skip = 0, take = 20) {
        const customerId = await this.customerId(ctx);
        const entity = history ? ArtworkView : FavoriteArtwork;
        const query = this.connection
            .getRepository(ctx, entity)
            .createQueryBuilder('record')
            .innerJoin(
                'record.product',
                'product',
                'product.enabled = :enabled AND product.deletedAt IS NULL',
                { enabled: true },
            )
            .innerJoin('product.channels', 'channel', 'channel.id = :channelId', { channelId: ctx.channelId })
            .where('record.customerId = :customerId AND record.channelId = :channelId', { customerId })
            .orderBy(history ? 'record.lastViewedAt' : 'record.createdAt', 'DESC')
            .addOrderBy('record.id', 'DESC');
        const latest = await query.clone().take(1).getOne();
        const [items, totalItems] = await query
            .skip(Math.max(0, skip))
            .take(Math.min(100, Math.max(1, take)))
            .getManyAndCount();
        return {
            items: await Promise.all(
                items.map(async item => ({
                    ...item,
                    savedAt: item.createdAt,
                    viewedAt: (item as ArtworkView).lastViewedAt,
                    artwork: await this.gallery.findArtworkById(ctx, item.productId),
                })),
            ),
            totalItems,
            lastUpdatedAt: latest
                ? history
                    ? (latest as ArtworkView).lastViewedAt
                    : latest.createdAt
                : null,
        };
    }

    async merge(ctx: RequestContext, productIds: ID[]) {
        const customerId = await this.customerId(ctx);
        if (productIds.length > 100)
            throw new UserInputError('At most 100 artwork IDs can be merged at once');
        const ids = [...new Set(productIds.map(String))];
        for (const id of ids) await this.requireProduct(ctx, id);
        if (ids.length) {
            await this.connection
                .getRepository(ctx, FavoriteArtwork)
                .createQueryBuilder()
                .insert()
                .values(ids.map(productId => ({ productId, customerId, channelId: ctx.channelId })))
                .orIgnore()
                .execute();
        }
        return this.list(ctx);
    }

    async remove(ctx: RequestContext, productId: ID) {
        const customerId = await this.customerId(ctx);
        await this.connection
            .getRepository(ctx, FavoriteArtwork)
            .delete({ customerId, channelId: ctx.channelId, productId });
        return true;
    }

    async recordView(
        ctx: RequestContext,
        input: { productId: ID; sourceCode?: string; sourcePath?: string },
    ) {
        const customerId = await this.customerId(ctx);
        await this.requireProduct(ctx, input.productId);
        if (input.sourceCode && !/^[a-zA-Z0-9_-]{1,64}$/.test(input.sourceCode)) {
            throw new UserInputError('Invalid sourceCode');
        }
        if (
            input.sourcePath &&
            (!input.sourcePath.startsWith('/') ||
                input.sourcePath.startsWith('//') ||
                input.sourcePath.length > 2048 ||
                /[\\\u0000-\u001f\u007f]/.test(input.sourcePath))
        ) {
            throw new UserInputError('sourcePath must be a local path of at most 2048 characters');
        }
        await this.connection.getRepository(ctx, ArtworkView).insert({
            customerId,
            channelId: ctx.channelId,
            productId: input.productId,
            lastViewedAt: new Date(),
            sourceCode: input.sourceCode || null,
            sourcePath: input.sourcePath?.split(/[?#]/)[0] || null,
        });
        return true;
    }

    async clearHistory(ctx: RequestContext) {
        const customerId = await this.customerId(ctx);
        await this.connection
            .getRepository(ctx, ArtworkView)
            .delete({ customerId, channelId: ctx.channelId });
        return true;
    }

    private async customerId(ctx: RequestContext) {
        const customer = ctx.activeUserId
            ? await this.customers.findOneByUserId(ctx, ctx.activeUserId)
            : undefined;
        if (!customer || customer.deletedAt) throw new ForbiddenError();
        return customer.id;
    }

    private async requireProduct(ctx: RequestContext, id: ID) {
        const product = await this.products.findOne(ctx, id);
        if (!product?.enabled) throw new UserInputError('ARTWORK_NOT_AVAILABLE');
    }
}
