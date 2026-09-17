import { Injectable } from '@nestjs/common';
import {
    ID,
    Product,
    ProductService,
    ProductVariant,
    ProductVariantService,
    RequestContext,
    TransactionalConnection,
    TranslatorService,
} from '@vendure/core';
import { Brackets } from 'typeorm';

import { Artist } from '../entities/artist.entity';

export interface GalleryArtworkListOptions {
    skip?: number;
    take?: number;
    artistSlug?: string;
    categoryId?: ID;
    collectionId?: ID;
    collectionSlug?: string;
    term?: string;
}

@Injectable()
export class GalleryCatalogService {
    constructor(
        private connection: TransactionalConnection,
        private productService: ProductService,
        private productVariantService: ProductVariantService,
        private translator: TranslatorService,
    ) {}

    async findArtworks(ctx: RequestContext, options: GalleryArtworkListOptions = {}) {
        const skip = Math.max(0, options.skip ?? 0);
        const take = Math.min(100, Math.max(1, options.take ?? 20));
        const query = this.connection
            .getRepository(ctx, Product)
            .createQueryBuilder('product')
            .setFindOptions({
                relations: [
                    'translations',
                    'featuredAsset',
                    'customFields.artists',
                    'customFields.artists.translations',
                    'customFields.artists.avatarAsset',
                    'customFields.highResolutionAsset',
                ],
            })
            .innerJoin('product.channels', 'galleryChannel', 'galleryChannel.id = :channelId', {
                channelId: ctx.channelId,
            })
            .where('product.enabled = :enabled', { enabled: true })
            .andWhere('product.deletedAt IS NULL');
        if (options.artistSlug) {
            query.innerJoin(
                'product.customFields.artists',
                'filterArtist',
                'filterArtist.slug = :artistSlug AND filterArtist.status = :status',
                { artistSlug: options.artistSlug, status: 'PUBLISHED' },
            );
        }
        if (options.categoryId) {
            query
                .innerJoin('product.facetValues', 'category', 'category.id = :categoryId', {
                    categoryId: options.categoryId,
                })
                .innerJoin('category.facet', 'categoryFacet', 'categoryFacet.isPrivate = :private', {
                    private: false,
                })
                .innerJoin('category.channels', 'categoryChannel', 'categoryChannel.id = :channelId');
        }
        if (options.collectionId || options.collectionSlug) {
            query
                .innerJoin('product.variants', 'collectionVariant')
                .innerJoin('collectionVariant.collections', 'artworkCollection')
                .innerJoin(
                    'artworkCollection.channels',
                    'collectionChannel',
                    'collectionChannel.id = :channelId',
                )
                .andWhere('artworkCollection.isPrivate = :collectionPrivate', { collectionPrivate: false })
                .distinct(true);
            if (options.collectionId) {
                query.andWhere('artworkCollection.id = :collectionId', {
                    collectionId: options.collectionId,
                });
            }
            if (options.collectionSlug) {
                query.innerJoin(
                    'artworkCollection.translations',
                    'collectionTranslation',
                    'collectionTranslation.slug = :collectionSlug',
                    { collectionSlug: options.collectionSlug },
                );
            }
        }
        const term = options.term?.trim().toLowerCase();
        if (term) {
            query
                .innerJoin(
                    'product.translations',
                    'searchTranslation',
                    'searchTranslation.languageCode = :languageCode',
                    { languageCode: ctx.languageCode },
                )
                .andWhere(
                    new Brackets(where => {
                        where
                            .where('LOWER(searchTranslation.name) LIKE :term')
                            .orWhere('LOWER(searchTranslation.description) LIKE :term');
                    }),
                    { term: `%${term}%` },
                );
        }
        const [matching, totalItems] = await query
            .orderBy('product.updatedAt', 'DESC')
            .addOrderBy('product.id', 'DESC')
            .skip(skip)
            .take(take)
            .getManyAndCount();
        return {
            items: await Promise.all(
                matching.map(product => this.toArtwork(ctx, this.translator.translate(product, ctx))),
            ),
            totalItems,
        };
    }

    async findArtwork(ctx: RequestContext, slug: string) {
        const product = await this.productService.findOneBySlug(ctx, slug, [
            'featuredAsset',
            'customFields.artists',
            'customFields.highResolutionAsset',
        ]);
        return product?.enabled ? this.toArtwork(ctx, product) : undefined;
    }

    async findArtworkById(ctx: RequestContext, id: ID) {
        const product = await this.productService.findOne(ctx, id, [
            'featuredAsset',
            'customFields.artists',
            'customFields.highResolutionAsset',
        ]);
        return product?.enabled ? this.toArtwork(ctx, product) : undefined;
    }

    async findArtists(ctx: RequestContext, skip = 0, take = 20) {
        const [artists, totalItems] = await this.connection.getRepository(ctx, Artist).findAndCount({
            where: { status: 'PUBLISHED' },
            relations: { avatarAsset: true, heroAsset: true },
            order: { sortOrder: 'ASC', id: 'ASC' },
            skip: Math.max(0, skip),
            take: Math.min(100, Math.max(1, take)),
        });
        return { items: artists.map(artist => this.translator.translate(artist, ctx)), totalItems };
    }

    async findArtistBySlug(ctx: RequestContext, slug: string) {
        const artist = await this.connection.getRepository(ctx, Artist).findOne({
            where: { slug, status: 'PUBLISHED' },
            relations: { avatarAsset: true, heroAsset: true },
        });
        return artist && this.translator.translate(artist, ctx);
    }

    private async toArtwork(ctx: RequestContext, product: Product) {
        const direct =
            product.customFields.isDirectPurchase === true &&
            product.customFields.priceVisibility === 'PUBLIC';
        const variant = direct ? await this.getPurchasableVariant(ctx, product.id) : undefined;
        const available = variant
            ? (await this.productVariantService.getSaleableStockLevel(ctx, variant)) > 0
            : false;
        if (variant) {
            await this.productVariantService.hydratePriceFields(ctx, variant, 'priceWithTax');
        }
        return {
            id: product.id,
            createdAt: product.createdAt,
            updatedAt: product.updatedAt,
            slug: product.slug,
            title: product.name,
            yearText: product.customFields.yearText,
            dimensionsText: product.customFields.dimensionsText,
            material: product.customFields.material,
            seals: product.customFields.seals,
            inscriptions: product.customFields.inscriptions,
            concept: product.description,
            collectionStory: product.customFields.collectionStory,
            image: product.featuredAsset,
            highResolutionImage:
                product.customFields.highResolutionAsset?.customFields.visibility === 'PUBLIC'
                    ? product.customFields.highResolutionAsset
                    : null,
            artists: (product.customFields.artists ?? [])
                .filter(artist => artist.status === 'PUBLISHED')
                .map(artist => this.translator.translate(artist, ctx)),
            purchaseMode: direct ? 'DIRECT' : 'INQUIRY',
            available,
            purchasableVariantId: available ? variant?.id : null,
            price:
                available && product.customFields.priceVisibility === 'PUBLIC' && variant
                    ? { amount: variant.priceWithTax, currencyCode: variant.currencyCode }
                    : null,
        };
    }

    private async getPurchasableVariant(
        ctx: RequestContext,
        productId: ID,
    ): Promise<ProductVariant | undefined> {
        const { items } = await this.productVariantService.getVariantsByProductId(ctx, productId, {
            take: 2,
        });
        return items.length === 1 ? items[0] : undefined;
    }
}
