import { Injectable } from '@nestjs/common';
import {
    EntityNotFoundError,
    ID,
    LanguageCode,
    RequestContext,
    TransactionalConnection,
    TranslatableSaver,
    TranslatorService,
} from '@vendure/core';

import { ArtistTranslation } from '../entities/artist-translation.entity';
import { Artist } from '../entities/artist.entity';

type TranslationInput = {
    id?: ID;
    languageCode: string;
    name: string;
    quote?: string;
    summary?: string;
    lineageTitle?: string;
    lineageParagraph1?: string;
    lineageParagraph2?: string;
    exhibitionSummary?: string;
    seoTitle?: string;
    seoDescription?: string;
};

type ArtistInput = {
    id?: ID;
    slug?: string;
    legacyArtistId?: string | null;
    sortOrder?: number;
    templateKey?: string | null;
    contentBlocks?: Array<Record<string, unknown>> | null;
    avatarAssetId?: ID | null;
    heroAssetId?: ID | null;
    translations?: TranslationInput[];
};

@Injectable()
export class ArtistAdminService {
    constructor(
        private connection: TransactionalConnection,
        private translatableSaver: TranslatableSaver,
        private translator: TranslatorService,
    ) {}

    async findAll(ctx: RequestContext, skip = 0, take = 20) {
        const [items, totalItems] = await this.connection.getRepository(ctx, Artist).findAndCount({
            relations: { avatarAsset: true, heroAsset: true },
            order: { sortOrder: 'ASC', id: 'ASC' },
            skip: Math.max(0, skip),
            take: Math.min(100, Math.max(1, take)),
        });
        return { items: items.map(item => this.translator.translate(item, ctx)), totalItems };
    }

    async findOne(ctx: RequestContext, id: ID) {
        const artist = await this.connection.getRepository(ctx, Artist).findOne({
            where: { id },
            relations: { avatarAsset: true, heroAsset: true },
        });
        return artist && this.translator.translate(artist, ctx);
    }

    async create(ctx: RequestContext, input: ArtistInput) {
        if (!input.slug?.trim() || !input.translations?.length) {
            throw new Error('slug and at least one translation are required');
        }
        const artist = await this.translatableSaver.create({
            ctx,
            input: { ...input, translations: this.normalizeTranslations(input.translations) } as any,
            entityType: Artist,
            translationType: ArtistTranslation,
        });
        return this.translator.translate(artist, ctx);
    }

    async update(ctx: RequestContext, input: ArtistInput & { id: ID }) {
        const existing = await this.requireArtist(ctx, input.id);
        if (input.slug !== undefined && !input.slug?.trim()) {
            throw new Error('slug must not be empty');
        }
        if (existing.status === 'PUBLISHED') {
            this.validatePublishedTranslations(
                existing.translations.map(translation => ({
                    ...translation,
                    ...input.translations?.find(patch => patch.languageCode === translation.languageCode),
                })),
            );
        }
        const artist = await this.translatableSaver.update({
            ctx,
            input: {
                ...input,
                translations: input.translations,
            } as any,
            entityType: Artist,
            translationType: ArtistTranslation,
        });
        return this.translator.translate(artist, ctx);
    }

    async publish(ctx: RequestContext, id: ID) {
        const artist = await this.requireArtist(ctx, id);
        this.validatePublishedTranslations(artist.translations);
        artist.status = 'PUBLISHED';
        artist.publishedAt = artist.publishedAt ?? new Date();
        return this.translator.translate(await this.connection.getRepository(ctx, Artist).save(artist), ctx);
    }

    async archive(ctx: RequestContext, id: ID) {
        const artist = await this.requireArtist(ctx, id);
        artist.status = 'ARCHIVED';
        return this.translator.translate(await this.connection.getRepository(ctx, Artist).save(artist), ctx);
    }

    private validatePublishedTranslations(translations: TranslationInput[]) {
        for (const languageCode of [LanguageCode.zh_Hant, LanguageCode.en]) {
            const translation = translations.find(item => item.languageCode === languageCode);
            if (!translation?.name?.trim() || !translation.summary?.trim()) {
                throw new Error(`Artist name and summary are required in ${languageCode} before publishing`);
            }
        }
    }

    private async requireArtist(ctx: RequestContext, id: ID) {
        const artist = await this.connection.getRepository(ctx, Artist).findOne({ where: { id } });
        if (!artist) throw new EntityNotFoundError(Artist.name, id);
        return artist;
    }

    private normalizeTranslations(translations: TranslationInput[]) {
        return translations.map(translation => ({
            ...translation,
            quote: translation.quote ?? '',
            summary: translation.summary ?? '',
            lineageTitle: translation.lineageTitle ?? '',
            lineageParagraph1: translation.lineageParagraph1 ?? '',
            lineageParagraph2: translation.lineageParagraph2 ?? '',
            exhibitionSummary: translation.exhibitionSummary ?? '',
            seoTitle: translation.seoTitle ?? '',
            seoDescription: translation.seoDescription ?? '',
        }));
    }
}
