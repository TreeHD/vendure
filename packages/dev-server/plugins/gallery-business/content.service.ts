import { Injectable } from '@nestjs/common';
import { AssetService, ID, RequestContext } from '@vendure/core';
import { GalleryAccess, ListOptions, choice, galleryError, required, safePath } from './common';
import { GalleryContent, GalleryNotification, GalleryNotificationRead } from './entities';

@Injectable()
export class GalleryContentService {
    constructor(private access: GalleryAccess, private assets: AssetService) {}
    async save(ctx: RequestContext, kind: string, input: any) {
        const key = required(input.key, 'key', 160);
        if (!/^[a-z0-9][a-z0-9_/-]*$/.test(key)) throw galleryError('INVALID_CONTENT_KEY');
        const repo = this.access.repo(ctx, GalleryContent);
        let row = input.id ? await this.access.find(ctx, GalleryContent, input.id, true) : await repo.findOne({ where: { channelId: ctx.channelId, kind, key } });
        if (row && row.kind !== kind) throw galleryError('CONTENT_KIND_MISMATCH');
        const content = input.content;
        if (!content || typeof content !== 'object' || Array.isArray(content) || JSON.stringify(content).length > 200_000) throw galleryError('INVALID_CONTENT');
        await this.validateContent(ctx, content);
        if (!row) row = repo.create({ channelId: ctx.channelId, kind, key, status: 'draft', published: null });
        row.key = key;
        row.draft = content;
        row.sortOrder = input.sortOrder ?? row.sortOrder ?? 0;
        return repo.save(row);
    }
    private async validateContent(ctx: RequestContext, content: any) {
        const allowedBlocks = ['hero', 'text', 'image', 'gallery', 'links', 'steps', 'faq', 'video'];
        if (!Array.isArray(content.translations) || !content.translations.length || content.translations.length > 2) throw galleryError('TRANSLATIONS_REQUIRED', '內容必須有 1 至 2 筆翻譯資料。');
        const languages = new Set<string>();
        for (const translation of content.translations) {
            choice(translation.languageCode, ['zh_Hant', 'en'], 'LANGUAGE');
            if (languages.has(translation.languageCode)) throw galleryError('DUPLICATE_LANGUAGE', '每種語言只能提供一筆翻譯。');
            languages.add(translation.languageCode);
            required(translation.title, 'title', 300);
        }
        const visit = async (value: any, key = '', depth = 0): Promise<void> => {
            if (depth > 12) throw galleryError('CONTENT_TOO_DEEP');
            if (typeof value === 'string') {
                if (/<\s*(script|iframe|object|embed)|\bon\w+\s*=|javascript:/i.test(value)) throw galleryError('UNSAFE_CONTENT');
                if (['url', 'href', 'target', 'actionLink'].includes(key)) {
                    if (value.startsWith('/')) safePath(value);
                    else if (!/^(https:\/\/|mailto:|tel:)/i.test(value)) throw galleryError('INVALID_LINK');
                }
            }
            if (key.endsWith('AssetId') && value != null) {
                if (!await this.assets.findOne(ctx, value)) throw galleryError('ASSET_NOT_FOUND');
            }
            if (Array.isArray(value)) for (const item of value) await visit(item, key, depth + 1);
            else if (value && typeof value === 'object') {
                if (key === 'blocks' && !allowedBlocks.includes(value.type)) throw galleryError('INVALID_BLOCK_TYPE');
                for (const [k, v] of Object.entries(value)) await visit(v, k, depth + 1);
            }
        };
        await visit(content);
    }
    async publish(ctx: RequestContext, id: ID) {
        const row = await this.access.find(ctx, GalleryContent, id, true);
        await this.validateContent(ctx, row.draft);
        if (new Set(row.draft.translations.map((t: any) => t.languageCode)).size !== 2) throw galleryError('BOTH_LANGUAGES_REQUIRED');
        row.published = structuredClone(row.draft);
        row.publishedAt = new Date(); row.status = 'published';
        return this.access.repo(ctx, GalleryContent).save(row);
    }
    async archive(ctx: RequestContext, id: ID) {
        const row = await this.access.find(ctx, GalleryContent, id, true);
        row.status = 'archived';
        return this.access.repo(ctx, GalleryContent).save(row);
    }
    list(ctx: RequestContext, options: ListOptions) { return this.access.list(ctx, GalleryContent, options, ['key']); }
    one(ctx: RequestContext, id: ID) { return this.access.find(ctx, GalleryContent, id); }
    private publicView(ctx: RequestContext, row: GalleryContent) {
        const data = row.published!;
        const translations = data.translations || [];
        const translation = translations.find((t: any) => t.languageCode === ctx.languageCode) || translations.find((t: any) => t.languageCode === 'zh_Hant');
        return { id: row.id, key: row.key, kind: row.kind, sortOrder: row.sortOrder, publishedAt: row.publishedAt, content: { ...data, ...translation } };
    }
    async publicOne(ctx: RequestContext, kind: string, key: string) {
        const row = await this.access.repo(ctx, GalleryContent).findOne({ where: { channelId: ctx.channelId, kind, key, status: 'published' } });
        return row?.published ? this.publicView(ctx, row) : null;
    }
    async publicList(ctx: RequestContext, kind: string, options: ListOptions = {}) {
        const [rows, totalItems] = await this.access.repo(ctx, GalleryContent).findAndCount({ where: { channelId: ctx.channelId, kind, status: 'published' }, order: { sortOrder: 'ASC', id: 'ASC' }, skip: Math.max(0, options.skip || 0), take: Math.min(100, Math.max(1, options.take || 20)) });
        return { items: rows.map(row => this.publicView(ctx, row)), totalItems };
    }
}

@Injectable()
export class GalleryNotificationService {
    constructor(private access: GalleryAccess) {}
    async save(ctx: RequestContext, input: any) {
        const repo = this.access.repo(ctx, GalleryNotification);
        const row = input.id ? await this.access.find(ctx, GalleryNotification, input.id, true) : repo.create({ channelId: ctx.channelId, status: 'DRAFT' });
        if (row.status !== 'DRAFT') throw galleryError('PUBLISHED_NOTIFICATION_IMMUTABLE');
        row.audience = choice(input.audience, ['ALL', 'USERS'], 'AUDIENCE');
        row.recipientIds = [...new Set<string>((input.recipientIds || []).map(String))];
        if (row.audience === 'USERS' ? !row.recipientIds.length || row.recipientIds.length > 500 : row.recipientIds.length !== 0) throw galleryError('INVALID_RECIPIENTS');
        if (row.recipientIds.length) {
            const { Customer } = await import('@vendure/core');
            const count = await this.access.connection.getRepository(ctx, Customer).createQueryBuilder('c').innerJoin('c.channels', 'channel', 'channel.id = :channel', { channel: ctx.channelId }).where('c.id IN (:...ids) AND c.deletedAt IS NULL', { ids: row.recipientIds }).getCount();
            if (count !== row.recipientIds.length) throw galleryError('INVALID_RECIPIENTS');
        }
        if (!Array.isArray(input.translations) || input.translations.length !== 2) throw galleryError('BOTH_LANGUAGES_REQUIRED');
        row.translations = input.translations.map((t: any) => ({ languageCode: choice(t.languageCode, ['zh_Hant', 'en'], 'LANGUAGE'), title: required(t.title, 'title', 300), body: required(t.body, 'body', 10000), category: required(t.category, 'category', 100) }));
        if (new Set(row.translations.map(t => t.languageCode)).size !== 2) throw galleryError('DUPLICATE_LANGUAGE', '繁體中文與英文各只能出現一次。');
        row.actionPath = safePath(input.actionPath);
        row.publishedAt = input.publishedAt ? new Date(input.publishedAt) : null;
        if (row.publishedAt && !Number.isFinite(+row.publishedAt)) throw galleryError('INVALID_DATE');
        return repo.save(row);
    }
    async status(ctx: RequestContext, id: ID, status: string) {
        const row = await this.access.find(ctx, GalleryNotification, id, true);
        if (status === 'PUBLISHED' && row.status !== 'DRAFT') throw galleryError('INVALID_TRANSITION', `通知目前為「${row.status}」，只有草稿可發布。`);
        row.status = status; row.publishedAt ??= new Date();
        return this.access.repo(ctx, GalleryNotification).save(row);
    }
    list(ctx: RequestContext, options: ListOptions) { return this.access.list(ctx, GalleryNotification, options); }
    one(ctx: RequestContext, id: ID) { return this.access.find(ctx, GalleryNotification, id); }
    private async visible(ctx: RequestContext) {
        const customer = (await this.access.customer(ctx))!;
        const rows = await this.access.repo(ctx, GalleryNotification).createQueryBuilder('n').where('n.channelId = :channel AND n.status = :status AND n.publishedAt <= :now', { channel: ctx.channelId, status: 'PUBLISHED', now: new Date() }).orderBy('n.publishedAt','DESC').addOrderBy('n.id','DESC').getMany();
        const reads = await this.access.repo(ctx, GalleryNotificationRead).find({ where: { channelId: ctx.channelId, customerId: customer.id } });
        const readIds = new Set(reads.map(r => String(r.notificationId)));
        return { customer, rows: rows.filter(n => n.audience === 'ALL' || n.recipientIds.includes(String(customer.id))).map(n => ({ ...n, ...(n.translations.find(t => t.languageCode === ctx.languageCode) || n.translations[0]), unread: !readIds.has(String(n.id)) })) };
    }
    async mine(ctx: RequestContext, options: ListOptions = {}) {
        const { rows } = await this.visible(ctx);
        const skip = Math.max(0, options.skip || 0), take = Math.min(100, Math.max(1, options.take || 20));
        return { items: rows.slice(skip, skip + take), totalItems: rows.length };
    }
    async unread(ctx: RequestContext) { return (await this.visible(ctx)).rows.filter(r => r.unread).length; }
    async read(ctx: RequestContext, id?: ID) {
        const { customer, rows } = await this.visible(ctx);
        if (id && !rows.some(row => String(row.id) === String(id))) throw galleryError('NOT_FOUND', '找不到可供目前客戶讀取的通知。');
        const unread = rows.filter(row => row.unread && (!id || String(row.id) === String(id)));
        if (unread.length) await this.access.repo(ctx, GalleryNotificationRead).createQueryBuilder().insert().values(unread.map(row => ({ channelId: ctx.channelId, customerId: customer.id, notificationId: row.id }))).orIgnore().execute();
        return unread.length;
    }
}
