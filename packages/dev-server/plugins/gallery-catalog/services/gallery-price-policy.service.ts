import { Injectable, OnApplicationBootstrap, OnModuleInit } from '@nestjs/common';
import {
    EventBus,
    ID,
    Product,
    ProductEvent,
    ProductVariant,
    ProductVariantEvent,
    RequestContext,
    TransactionalConnection,
} from '@vendure/core';
import { IsNull } from 'typeorm';

/**
 * The baseline model has public variants only. Inquiry works have no variants;
 * private proposals must be stored separately, never as a hidden catalogue price.
 * Blocking handlers participate in the native Admin API mutation transaction.
 */
@Injectable()
export class GalleryPricePolicyService implements OnModuleInit, OnApplicationBootstrap {
    constructor(
        private connection: TransactionalConnection,
        private eventBus: EventBus,
    ) {}

    onModuleInit() {
        this.eventBus.registerBlockingEventHandler({
            event: ProductEvent,
            id: 'gallery-product-price-policy',
            handler: event =>
                event.type === 'deleted' ? Promise.resolve() : this.validate(event.ctx, event.entity.id),
        });
        this.eventBus.registerBlockingEventHandler({
            event: ProductVariantEvent,
            id: 'gallery-variant-price-policy',
            handler: async event => {
                if (event.type === 'deleted') return;
                for (const productId of new Set(event.entity.map(variant => variant.productId))) {
                    await this.validate(event.ctx, productId);
                }
            },
        });
    }

    async onApplicationBootstrap() {
        // Refuse to serve pre-existing data that violates the model. Do not silently
        // delete prices or assume that disabling a variant makes its price private.
        const ctx = RequestContext.empty();
        const invalid = await this.connection
            .getRepository(ctx, ProductVariant)
            .createQueryBuilder('variant')
            .innerJoin('variant.product', 'product')
            .where('variant.deletedAt IS NULL')
            .andWhere('product.deletedAt IS NULL')
            .andWhere(
                '(product.customFields.priceVisibility != :visibility OR product.customFields.isDirectPurchase = :direct)',
                {
                    visibility: 'PUBLIC',
                    direct: false,
                },
            )
            .getCount();
        if (invalid)
            throw new Error(
                'GALLERY_PRIVATE_VARIANT_FORBIDDEN: migrate inquiry variants before starting the gallery',
            );
    }

    private async validate(ctx: RequestContext, productId: ID) {
        const repository = this.connection.getRepository(ctx, Product);
        // Serialize product-policy edits and variant creation for PostgreSQL mutations.
        // NO KEY UPDATE permits the FK's KEY SHARE lock, avoiding an upgrade deadlock
        // when a concurrent variant insert and product update reach these handlers.
        const lock =
            repository.manager.queryRunner?.isTransactionActive &&
            this.connection.rawConnection.options.type === 'postgres'
                ? { mode: 'for_no_key_update' as const }
                : undefined;
        const product = await repository.findOne({
            where: { id: productId },
            loadEagerRelations: false,
            lock,
        });
        if (!product || product.deletedAt) return;
        if (product.customFields.priceVisibility === 'PUBLIC' && product.customFields.isDirectPurchase)
            return;
        const variants = await this.connection.getRepository(ctx, ProductVariant).count({
            where: { productId, deletedAt: IsNull() },
        });
        if (variants) {
            throw new Error(
                'GALLERY_PRIVATE_VARIANT_FORBIDDEN: inquiry artworks cannot have variants, including disabled variants',
            );
        }
    }
}
