import { Injectable } from '@nestjs/common';
import { DeletionResponse, DeletionResult } from '@vendure/common/lib/generated-types';
import {
    AssetService,
    ChannelService,
    EntityNotFoundError,
    ID,
    ListQueryBuilder,
    RequestContext,
    TransactionalConnection,
    TranslatableSaver,
    TranslatorService,
    UserInputError,
} from '@vendure/core';
import { Brackets } from 'typeorm';

import { CmsArticleTranslation } from './entities/cms-article-translation.entity';
import { CmsArticle } from './entities/cms-article.entity';
import { CmsCategoryTranslation } from './entities/cms-category-translation.entity';
import { CmsCategory } from './entities/cms-category.entity';
import { CmsArticleStatus, ContentDocument, ContentNode } from './types';

type TranslationInput = {
    languageCode: string;
    title: string;
    slug: string;
    excerpt?: string;
    content: ContentDocument;
    seoTitle?: string;
    seoDescription?: string;
};
type CategoryTranslationInput = {
    languageCode: string;
    name: string;
    slug: string;
    description?: string;
};
type ArticleInput = {
    id?: ID;
    status?: CmsArticleStatus;
    publishedAt?: string | Date | null;
    featuredAssetId?: ID | null;
    categoryId?: ID | null;
    translations?: TranslationInput[];
};
type CategoryInput = { id?: ID; translations?: CategoryTranslationInput[] };
type ArticleListOptions = {
    skip?: number;
    take?: number;
    sort?: { publishedAt?: 'ASC' | 'DESC'; updatedAt?: 'ASC' | 'DESC'; createdAt?: 'ASC' | 'DESC' };
    filter?: {
        title?: { contains?: string };
        status?: { eq?: CmsArticleStatus };
        categoryId?: { eq?: ID };
        publishedAt?: { before?: string; after?: string };
    };
};

const relations = ['featuredAsset', 'category', 'category.translations'] as const;

const cmsErrorMessages: Record<string, string> = {
    ARTICLE_STATUS_REQUIRES_TRANSITION: '文章狀態不可直接寫入；請使用 publishArticle、unpublishArticle 或 archiveArticle。',
    ARTICLE_SLUG_ALREADY_EXISTS: '此語言的 slug 已被另一篇文章使用。請改用未使用的 slug。',
    ARTICLE_TRANSLATION_REQUIRED: '文章至少需要一筆翻譯資料。',
    CATEGORY_TRANSLATION_REQUIRED: '分類至少需要一筆翻譯資料。',
    CONTENT_TOO_LARGE: '文章內容 JSON 超過 1 MB 上限，請縮小內容或拆分文章。',
    DUPLICATE_LANGUAGE: '同一筆文章或分類中，每個 languageCode 只能出現一次。',
    INCOMPLETE_ARTICLE_TRANSLATION: '文章有翻譯缺少 title、slug 或 content，無法發布。',
    INVALID_CONTENT_DOCUMENT: 'content 必須是 TipTap／ProseMirror JSON 文件：根節點 type 必須為 "doc"，content 必須是陣列；不可傳純文字或 HTML 字串。',
    INVALID_FEATURED_ASSET: 'featuredAssetId 不存在，或該資產不屬於目前頻道。',
    INVALID_IMAGE_ASSET: '圖片節點必須帶有目前頻道可使用的 assetId。',
    INVALID_LINK_PROTOCOL: '連結只允許 http:、https: 或 mailto:；不可使用 javascript:、相對 URL 或其他協定。',
    INVALID_PUBLISHED_AT: 'publishedAt 必須是有效的 ISO 8601 日期時間。',
    INVALID_SLUG: 'slug 只能使用小寫英數與連字號，不能有空白、底線或連續連字號，且最多 200 字元。',
    INVALID_TEXT: '選填文字必須是字串，且不可超過欄位允許長度。',
    UNSAFE_CONTENT_NODE: 'content 含有不安全節點（html、iframe 或 script），已被拒絕。',
};

function cmsError(code: string, detail?: string): UserInputError {
    const message = detail || cmsErrorMessages[code] || '請檢查輸入資料後再試一次。';
    return new UserInputError(`[${code}] ${message}`);
}

@Injectable()
export class CmsService {
    constructor(
        private connection: TransactionalConnection,
        private channels: ChannelService,
        private assets: AssetService,
        private saver: TranslatableSaver,
        private translator: TranslatorService,
        private listQueryBuilder: ListQueryBuilder,
    ) {}

    async createArticle(ctx: RequestContext, input: ArticleInput) {
        const normalized = await this.normalizeArticleInput(ctx, input, true);
        const article = await this.saver.create({
            ctx,
            input: normalized as any,
            entityType: CmsArticle,
            translationType: CmsArticleTranslation,
        });
        await this.assignToCurrentChannel(ctx, CmsArticle, article.id);
        return this.toArticle(ctx, await this.requireArticle(ctx, article.id));
    }

    async updateArticle(ctx: RequestContext, input: ArticleInput & { id: ID }) {
        if (input.status !== undefined) {
            throw cmsError('ARTICLE_STATUS_REQUIRES_TRANSITION');
        }
        const existing = await this.requireArticle(ctx, input.id);
        const normalized = await this.normalizeArticleInput(ctx, input, false);
        const article = await this.saver.update({
            ctx,
            input: { ...normalized, id: existing.id } as any,
            entityType: CmsArticle,
            translationType: CmsArticleTranslation,
        });
        return this.toArticle(ctx, article as CmsArticle);
    }

    async publishArticle(ctx: RequestContext, id: ID) {
        const article = await this.requireArticle(ctx, id);
        this.assertPublishable(article);
        article.status = 'PUBLISHED';
        article.publishedAt ??= new Date();
        return this.toArticle(ctx, await this.connection.getRepository(ctx, CmsArticle).save(article));
    }

    async unpublishArticle(ctx: RequestContext, id: ID) {
        const article = await this.requireArticle(ctx, id);
        article.status = 'DRAFT';
        return this.toArticle(ctx, await this.connection.getRepository(ctx, CmsArticle).save(article));
    }

    async archiveArticle(ctx: RequestContext, id: ID) {
        const article = await this.requireArticle(ctx, id);
        article.status = 'ARCHIVED';
        return this.toArticle(ctx, await this.connection.getRepository(ctx, CmsArticle).save(article));
    }

    async deleteArticle(ctx: RequestContext, id: ID): Promise<DeletionResponse> {
        const article = await this.requireArticle(ctx, id);
        await this.connection.getRepository(ctx, CmsArticle).remove(article);
        return { result: DeletionResult.DELETED };
    }

    async article(ctx: RequestContext, id: ID) {
        return this.toArticle(ctx, await this.requireArticle(ctx, id));
    }

    async articles(ctx: RequestContext, options: ArticleListOptions = {}, publicOnly = false) {
        const qb = this.listQueryBuilder.build(
            CmsArticle,
            { skip: options.skip, take: options.take } as any,
            {
                ctx,
                entityAlias: 'article',
                channelId: ctx.channelId,
                relations: [...relations],
            },
        );
        const filter = options.filter;
        if (filter?.status?.eq) qb.andWhere('article.status = :status', { status: filter.status.eq });
        if (filter?.categoryId?.eq != null)
            qb.andWhere('article.categoryId = :categoryId', { categoryId: filter.categoryId.eq });
        if (filter?.publishedAt?.before)
            qb.andWhere('article.publishedAt <= :before', {
                before: this.validDate(filter.publishedAt.before),
            });
        if (filter?.publishedAt?.after)
            qb.andWhere('article.publishedAt >= :after', { after: this.validDate(filter.publishedAt.after) });
        if (filter?.title?.contains?.trim()) {
            qb.innerJoin(
                'article.translations',
                'titleTranslation',
                'titleTranslation.languageCode = :languageCode',
                { languageCode: ctx.languageCode },
            ).andWhere('LOWER(titleTranslation.title) LIKE :title', {
                title: `%${filter.title.contains.trim().toLowerCase()}%`,
            });
        }
        if (publicOnly) {
            qb.andWhere('article.status = :publishedStatus', { publishedStatus: 'PUBLISHED' }).andWhere(
                new Brackets(where =>
                    where
                        .where('article.publishedAt IS NULL')
                        .orWhere('article.publishedAt <= :now', { now: new Date() }),
                ),
            );
        }
        const sortable = options.sort ?? { publishedAt: 'DESC' as const, updatedAt: 'DESC' as const };
        const entries = Object.entries(sortable).filter(
            ([key, value]) =>
                ['publishedAt', 'updatedAt', 'createdAt'].includes(key) &&
                (value === 'ASC' || value === 'DESC'),
        ) as Array<[string, 'ASC' | 'DESC']>;
        qb.orderBy(
            entries.length ? `article.${entries[0][0]}` : 'article.updatedAt',
            entries.length ? entries[0][1] : 'DESC',
        );
        for (const [key, direction] of entries.slice(1)) qb.addOrderBy(`article.${key}`, direction);
        qb.addOrderBy('article.id', 'DESC');
        const [items, totalItems] = await qb.getManyAndCount();
        return { items: items.map(item => this.toArticle(ctx, item)), totalItems };
    }

    async articleBySlug(ctx: RequestContext, slug: string) {
        const normalizedSlug = this.normalizeSlug(slug);
        const article = await this.connection
            .getRepository(ctx, CmsArticle)
            .createQueryBuilder('article')
            .innerJoin('article.channels', 'channel', 'channel.id = :channelId', { channelId: ctx.channelId })
            .innerJoinAndSelect(
                'article.translations',
                'translation',
                'translation.languageCode = :languageCode AND translation.slug = :slug',
                { languageCode: ctx.languageCode, slug: normalizedSlug },
            )
            .leftJoinAndSelect('article.featuredAsset', 'featuredAsset')
            .leftJoinAndSelect('article.category', 'category')
            .leftJoinAndSelect('category.translations', 'categoryTranslations')
            .where('article.status = :status', { status: 'PUBLISHED' })
            .andWhere(
                new Brackets(where =>
                    where
                        .where('article.publishedAt IS NULL')
                        .orWhere('article.publishedAt <= :now', { now: new Date() }),
                ),
            )
            .getOne();
        return article ? this.toArticle(ctx, article) : null;
    }

    async createCategory(ctx: RequestContext, input: CategoryInput) {
        const normalized = this.normalizeCategoryInput(input, true);
        const category = await this.saver.create({
            ctx,
            input: normalized as any,
            entityType: CmsCategory,
            translationType: CmsCategoryTranslation,
        });
        await this.assignToCurrentChannel(ctx, CmsCategory, category.id);
        return this.toCategory(ctx, await this.requireCategory(ctx, category.id));
    }

    async updateCategory(ctx: RequestContext, input: CategoryInput & { id: ID }) {
        await this.requireCategory(ctx, input.id);
        const category = await this.saver.update({
            ctx,
            input: { ...this.normalizeCategoryInput(input, false), id: input.id } as any,
            entityType: CmsCategory,
            translationType: CmsCategoryTranslation,
        });
        return this.toCategory(ctx, category as CmsCategory);
    }

    async deleteCategory(ctx: RequestContext, id: ID): Promise<DeletionResponse> {
        const category = await this.requireCategory(ctx, id);
        await this.connection.getRepository(ctx, CmsCategory).remove(category);
        return { result: DeletionResult.DELETED };
    }

    async categories(ctx: RequestContext, publicOnly = false) {
        const qb = this.listQueryBuilder.build(CmsCategory, { take: 100 } as any, {
            ctx,
            entityAlias: 'category',
            channelId: ctx.channelId,
            relations: ['translations'],
        });
        if (publicOnly) {
            qb.innerJoin('category.articles', 'article')
                .andWhere('article.status = :status', { status: 'PUBLISHED' })
                .andWhere(
                    new Brackets(where =>
                        where
                            .where('article.publishedAt IS NULL')
                            .orWhere('article.publishedAt <= :now', { now: new Date() }),
                    ),
                )
                .distinct(true);
        }
        qb.orderBy('category.updatedAt', 'DESC').addOrderBy('category.id', 'DESC');
        return (await qb.getMany()).map(category => this.toCategory(ctx, category));
    }

    private async normalizeArticleInput(ctx: RequestContext, input: ArticleInput, creating: boolean) {
        const result: Record<string, unknown> = {};
        if (input.status !== undefined) {
            throw cmsError('ARTICLE_STATUS_REQUIRES_TRANSITION');
        } else if (creating) result.status = 'DRAFT';
        if (input.publishedAt !== undefined)
            result.publishedAt = input.publishedAt == null ? null : this.validDate(input.publishedAt);
        if (input.featuredAssetId !== undefined) {
            if (input.featuredAssetId != null && !(await this.assets.findOne(ctx, input.featuredAssetId)))
                throw cmsError('INVALID_FEATURED_ASSET');
            result.featuredAssetId = input.featuredAssetId;
        }
        if (input.categoryId !== undefined) {
            if (input.categoryId != null) await this.requireCategory(ctx, input.categoryId);
            result.categoryId = input.categoryId;
        }
        if (input.translations !== undefined) {
            if (!input.translations.length) throw cmsError('ARTICLE_TRANSLATION_REQUIRED');
            const languages = new Set<string>();
            result.translations = await Promise.all(
                input.translations.map(async translation => {
                    if (languages.has(translation.languageCode))
                        throw cmsError('DUPLICATE_LANGUAGE');
                    languages.add(translation.languageCode);
                    const title = this.required(translation.title, 'TITLE', 300);
                    const slug = this.normalizeSlug(translation.slug);
                    await this.validateUniqueArticleSlug(translation.languageCode, slug, input.id);
                    await this.validateContent(ctx, translation.content);
                    return {
                        languageCode: translation.languageCode,
                        title,
                        slug,
                        excerpt: this.optional(translation.excerpt, 2000),
                        content: JSON.stringify(translation.content),
                        seoTitle: this.optional(translation.seoTitle, 300),
                        seoDescription: this.optional(translation.seoDescription, 1000),
                    };
                }),
            );
        } else if (creating) throw cmsError('ARTICLE_TRANSLATION_REQUIRED');
        return result;
    }

    private normalizeCategoryInput(input: CategoryInput, creating: boolean) {
        if (!input.translations?.length) {
            if (creating) throw cmsError('CATEGORY_TRANSLATION_REQUIRED');
            return {};
        }
        const languages = new Set<string>();
        return {
            translations: input.translations.map(translation => {
                if (languages.has(translation.languageCode)) throw cmsError('DUPLICATE_LANGUAGE');
                languages.add(translation.languageCode);
                return {
                    languageCode: translation.languageCode,
                    name: this.required(translation.name, 'NAME', 300),
                    slug: this.normalizeSlug(translation.slug),
                    description: this.optional(translation.description, 4000),
                };
            }),
        };
    }

    private async validateUniqueArticleSlug(languageCode: string, slug: string, id?: ID) {
        const existing = await this.connection.rawConnection
            .getRepository(CmsArticleTranslation)
            .findOne({ where: { languageCode: languageCode as any, slug }, relations: ['base'] });
        if (existing && String(existing.base.id) !== String(id))
            throw cmsError('ARTICLE_SLUG_ALREADY_EXISTS', `語言「${languageCode}」的 slug「${slug}」已存在。`);
    }

    private async validateContent(ctx: RequestContext, document: ContentDocument) {
        if (
            !document ||
            typeof document !== 'object' ||
            document.type !== 'doc' ||
            (document.content !== undefined && !Array.isArray(document.content))
        )
            throw cmsError('INVALID_CONTENT_DOCUMENT');
        if (JSON.stringify(document).length > 1_000_000) throw cmsError('CONTENT_TOO_LARGE');
        const assetIds = new Set<ID>();
        const walk = (node: ContentNode, depth = 0): void => {
            if (!node || typeof node !== 'object' || typeof node.type !== 'string' || depth > 30)
                throw cmsError('INVALID_CONTENT_DOCUMENT', `content 第 ${depth + 1} 層有缺少 type 的無效節點，或巢狀超過 30 層。`);
            if (node.type === 'html' || node.type === 'iframe' || node.type === 'script')
                throw cmsError('UNSAFE_CONTENT_NODE', `不允許使用「${node.type}」節點。請改用結構化 TipTap 節點。`);
            if (node.type === 'image') {
                const assetId = node.attrs?.assetId;
                if (assetId == null || (typeof assetId !== 'string' && typeof assetId !== 'number'))
                    throw cmsError('INVALID_IMAGE_ASSET', 'image 節點缺少 assetId，或 assetId 不是字串／數字。');
                assetIds.add(assetId as ID);
            }
            for (const mark of node.marks ?? [])
                if (mark.type === 'link') this.validateLink(String(mark.attrs?.href ?? ''));
            for (const child of node.content ?? []) walk(child, depth + 1);
        };
        for (const node of document.content ?? []) walk(node);
        for (const id of assetIds)
            if (!(await this.assets.findOne(ctx, id))) throw cmsError('INVALID_IMAGE_ASSET', `找不到圖片 assetId「${id}」，或它不屬於目前頻道。`);
    }

    private validateLink(href: string) {
        let url: URL;
        try {
            url = new URL(href);
        } catch {
            throw cmsError('INVALID_LINK_PROTOCOL', `連結「${href}」不是允許的完整 URL。只允許 http:、https: 或 mailto:。`);
        }
        if (!['http:', 'https:', 'mailto:'].includes(url.protocol))
            throw cmsError('INVALID_LINK_PROTOCOL', `連結「${href}」不是允許的完整 URL。只允許 http:、https: 或 mailto:。`);
    }

    private assertPublishable(article: CmsArticle) {
        if (!article.translations.length) throw cmsError('ARTICLE_TRANSLATION_REQUIRED');
        for (const translation of article.translations) {
            if (!translation.title?.trim() || !translation.slug?.trim() || !translation.content)
                throw cmsError('INCOMPLETE_ARTICLE_TRANSLATION', `語言「${translation.languageCode}」缺少 title、slug 或 content。`);
        }
    }

    private async requireArticle(ctx: RequestContext, id: ID) {
        const article = await this.connection.findOneInChannel(ctx, CmsArticle, id, ctx.channelId, {
            relations: [...relations, 'translations'],
        });
        if (!article) throw new EntityNotFoundError(CmsArticle.name, id);
        return article;
    }
    private async requireCategory(ctx: RequestContext, id: ID) {
        const category = await this.connection.findOneInChannel(ctx, CmsCategory, id, ctx.channelId, {
            relations: ['translations'],
        });
        if (!category) throw new EntityNotFoundError(CmsCategory.name, id);
        return category;
    }
    private async assignToCurrentChannel(
        ctx: RequestContext,
        type: typeof CmsArticle | typeof CmsCategory,
        id: ID,
    ) {
        // Unlike catalogue entities, CMS content must not be implicitly copied to the default
        // channel: doing so would turn that channel into a cross-site content leak.
        await this.channels.assignToChannels(ctx, type as any, id, [ctx.channelId]);
    }
    private toArticle(ctx: RequestContext, article: CmsArticle) {
        return this.translator.translate(article, ctx, ['category']);
    }
    private toCategory(ctx: RequestContext, category: CmsCategory) {
        return this.translator.translate(category, ctx);
    }
    private required(value: unknown, field: string, max: number) {
        const result = typeof value === 'string' ? value.trim() : '';
        if (!result || result.length > max) throw cmsError(`INVALID_${field}`, `${field.toLowerCase()} 為必填，且最多 ${max} 個字元。`);
        return result;
    }
    private optional(value: unknown, max: number) {
        if (value == null) return '';
        if (typeof value !== 'string' || value.length > max) throw cmsError('INVALID_TEXT', `選填文字必須是最多 ${max} 個字元的字串。`);
        return value.trim();
    }
    private normalizeSlug(value: unknown) {
        const slug = typeof value === 'string' ? value.trim().toLowerCase() : '';
        if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 200)
            throw cmsError('INVALID_SLUG');
        return slug;
    }
    private validDate(value: string | Date) {
        const date = new Date(value);
        if (!Number.isFinite(+date)) throw cmsError('INVALID_PUBLISHED_AT');
        return date;
    }
}
