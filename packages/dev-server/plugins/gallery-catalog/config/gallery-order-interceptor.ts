import {
    EntityHydrator,
    Injector,
    Order,
    OrderInterceptor,
    ProductService,
    ProductVariant,
    RequestContext,
    WillAddItemToOrderInput,
    WillAdjustOrderLineInput,
    idsAreEqual,
} from '@vendure/core';

export class GalleryOrderInterceptor implements OrderInterceptor {
    private entityHydrator: EntityHydrator;
    private productService: ProductService;

    init(injector: Injector) {
        this.entityHydrator = injector.get(EntityHydrator);
        this.productService = injector.get(ProductService);
    }

    async willAddItemToOrder(
        ctx: RequestContext,
        order: Order,
        input: WillAddItemToOrderInput,
    ): Promise<void | string> {
        const existing = order.lines
            .filter(line => idsAreEqual(line.productVariantId, input.productVariant.id))
            .reduce((sum, line) => sum + line.quantity, 0);
        return this.validate(ctx, input.productVariant, input.quantity + existing);
    }

    async willAdjustOrderLine(ctx: RequestContext, order: Order, input: WillAdjustOrderLineInput) {
        if (input.quantity === 0) return;
        await this.entityHydrator.hydrate(ctx, input.orderLine, { relations: ['productVariant'] });
        const existing = order.lines
            .filter(
                line =>
                    !idsAreEqual(line.id, input.orderLine.id) &&
                    idsAreEqual(line.productVariantId, input.orderLine.productVariantId),
            )
            .reduce((sum, line) => sum + line.quantity, 0);
        return this.validate(ctx, input.orderLine.productVariant, input.quantity + existing);
    }

    private async validate(
        ctx: RequestContext,
        variant: ProductVariant,
        quantity: number,
    ): Promise<void | string> {
        const product = await this.productService.findOne(ctx, variant.productId);
        if (
            !product?.enabled ||
            !product.customFields.isDirectPurchase ||
            product.customFields.priceVisibility !== 'PUBLIC'
        ) {
            return 'DIRECT_PURCHASE_NOT_ALLOWED';
        }
        if (quantity !== 1) {
            return 'Gallery artworks can only be purchased one at a time';
        }
    }
}
