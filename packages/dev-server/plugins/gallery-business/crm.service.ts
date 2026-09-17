import { Injectable } from '@nestjs/common';
import { Customer, ID, Order, Product, RequestContext } from '@vendure/core';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { GalleryAccess, ListOptions, choice, galleryError, required, safePath, token } from './common';
import { GalleryAnalyticsEvent, GalleryCrmProfile, GalleryInquiry, GalleryPrivatePurchase, GalleryPaymentRequest } from './entities';
import { Artist } from '../gallery-catalog/entities/artist.entity';

@Injectable()
export class GalleryCrmService {
    constructor(private access: GalleryAccess) {}
    private sign(value: string) {
        const secret = process.env.VENDURE_COOKIE_SECRET;
        if (!secret) throw galleryError('VISITOR_SIGNING_NOT_CONFIGURED');
        return createHmac('sha256', secret).update(value).digest('hex');
    }
    visitor() { const id = token(); return `${id}.${this.sign(id)}`; }
    private verify(value: string) {
        const [id, signature] = value.split('.');
        if (!id || !signature || !/^[a-zA-Z0-9_-]{43}$/.test(id) || !/^[a-f0-9]{64}$/.test(signature) || !timingSafeEqual(Buffer.from(signature), Buffer.from(this.sign(id)))) throw galleryError('INVALID_VISITOR_TOKEN');
        return id;
    }
    async record(ctx: RequestContext, input: any, viewKey: string | null = null) {
        choice(input.eventType, ['page_view','artist_view','artwork_view','artwork_list_view'], 'EVENT_TYPE');
        const path = safePath(required(input.path, 'path', 2048));
        if (input.productId) await this.access.product(ctx, input.productId);
        if (input.artistId && !await this.access.connection.getRepository(ctx, Artist).findOne({ where: { id: input.artistId, status: 'PUBLISHED' } })) throw galleryError('ARTIST_NOT_FOUND');
        if (input.eventType === 'artwork_view' && !input.productId) throw galleryError('PRODUCT_REQUIRED', '事件類型 artwork_view 必須提供 productId。');
        if (input.eventType === 'artist_view' && !input.artistId) throw galleryError('ARTIST_REQUIRED');
        const metadata = input.metadata || {};
        if (Array.isArray(metadata) || typeof metadata !== 'object' || JSON.stringify(metadata).length > 2000 || Object.entries(metadata).some(([k,v]) => /token|password|secret|card|email|phone/i.test(k) || (v !== null && !['string','number','boolean'].includes(typeof v)))) throw galleryError('INVALID_METADATA');
        const customer = await this.access.customer(ctx, true);
        const visitorId = input.visitorToken ? this.verify(input.visitorToken) : null;
        if (!customer && !visitorId) throw galleryError('VISITOR_TOKEN_REQUIRED');
        const identityKey = customer ? `customer:${customer.id}` : `visitor:${visitorId}`;
        const repo = this.access.repo(ctx, GalleryCrmProfile);
        await repo.createQueryBuilder().insert().values({ channelId: ctx.channelId, customerId: customer?.id || null, identityKey, name: customer ? `${customer.firstName} ${customer.lastName}`.trim() : '', email: customer?.emailAddress || '', phone: customer?.phoneNumber || '', lastSeenAt: new Date() }).orIgnore().execute();
        const profile = (await repo.findOne({ where: { channelId: ctx.channelId, identityKey } }))!;
        if (customer && visitorId) {
            const anonymous = await repo.findOne({ where: { channelId: ctx.channelId, identityKey: `visitor:${visitorId}` } });
            if (anonymous && !anonymous.customerId) {
                await this.access.repo(ctx, GalleryAnalyticsEvent).update({ channelId: ctx.channelId, profileId: anonymous.id }, { profileId: profile.id });
                await repo.delete({ id: anonymous.id, channelId: ctx.channelId });
            }
        }
        await repo.update({ id: profile.id }, { lastSeenAt: new Date() });
        await this.access.repo(ctx, GalleryAnalyticsEvent).createQueryBuilder().insert().values({ channelId: ctx.channelId, profileId: profile.id, eventType: input.eventType, path, productId: input.productId || null, artistId: input.artistId || null, metadata, viewKey }).orIgnore().execute();
        return true;
    }
    async list(ctx: RequestContext, options: ListOptions = {}) {
        const query = this.access.repo(ctx, GalleryCrmProfile).createQueryBuilder('p').where('p.channelId = :channel', { channel: ctx.channelId });
        if (options.status) query.andWhere('p.stage = :stage', { stage: options.status });
        if (options.search) query.andWhere('(LOWER(p.name) LIKE :term OR LOWER(p.email) LIKE :term OR LOWER(p.phone) LIKE :term)', { term: `%${options.search.slice(0,200).toLowerCase()}%` });
        const [items,totalItems] = await query.orderBy('p.lastSeenAt','DESC').addOrderBy('p.id','DESC').skip(Math.max(0,options.skip||0)).take(Math.min(100,Math.max(1,options.take||20))).getManyAndCount();
        return { items,totalItems };
    }
    async detail(ctx: RequestContext, id: ID) {
        const profile = await this.access.find(ctx, GalleryCrmProfile, id);
        const repo = this.access.repo(ctx, GalleryAnalyticsEvent);
        return { ...profile, leadScore: null, eventCount: await repo.count({where:{channelId:ctx.channelId,profileId:id}}), recentEvents: await repo.find({where:{channelId:ctx.channelId,profileId:id},order:{createdAt:'DESC',id:'DESC'},take:100}) };
    }
    async update(ctx: RequestContext, input: any) {
        const row = await this.access.find(ctx, GalleryCrmProfile, input.id, true);
        if (input.stage !== undefined) row.stage = choice(input.stage,['new','nurturing','engaged','customer'],'STAGE');
        if (input.notes !== undefined) row.notes = input.notes === '' ? '' : required(input.notes,'notes',10000);
        if (input.assignedAdministratorId !== undefined) row.assignedAdministratorId = (await this.access.assignee(ctx,input.assignedAdministratorId)) ?? null;
        if (input.lastContactAt !== undefined) {
            row.lastContactAt = input.lastContactAt ? new Date(input.lastContactAt) : null;
            if (row.lastContactAt && !Number.isFinite(+row.lastContactAt)) throw galleryError('INVALID_DATE');
        }
        await this.access.repo(ctx, GalleryCrmProfile).save(row);
        return this.detail(ctx,row.id);
    }
    async overview(ctx: RequestContext) {
        const repo = this.access.repo(ctx,GalleryCrmProfile);
        const counts = await repo.createQueryBuilder('p').select('p.stage','stage').addSelect('COUNT(*)','count').where('p.channelId = :channel',{channel:ctx.channelId}).groupBy('p.stage').getRawMany();
        const topArtworks = await this.access.repo(ctx,GalleryAnalyticsEvent).createQueryBuilder('e').select('e.productId','productId').addSelect('COUNT(*)','count').where('e.channelId = :channel AND e.eventType = :type AND e.createdAt >= :since',{channel:ctx.channelId,type:'artwork_view',since:new Date(Date.now()-30*86400000)}).groupBy('e.productId').orderBy('COUNT(*)','DESC').limit(10).getRawMany();
        return { totalProfiles: counts.reduce((s,r)=>s+Number(r.count),0), activeLeads: counts.filter(r=>r.stage!=='customer').reduce((s,r)=>s+Number(r.count),0), customers:Number(counts.find(r=>r.stage==='customer')?.count||0), topArtworks:topArtworks.map(r=>({...r,count:Number(r.count)})), periodDays:30 };
    }
    async stats(ctx: RequestContext) {
        const channelCount = (entity:any, extra='1=1') => this.access.connection.getRepository(ctx,entity).createQueryBuilder('e').innerJoin('e.channels','c','c.id = :channel',{channel:ctx.channelId}).where(extra).getCount();
        return {
            totalArtworks:await channelCount(Product,'e.deletedAt IS NULL'), totalCustomers:await channelCount(Customer,'e.deletedAt IS NULL'),
            totalOrders:await channelCount(Order,'e.orderPlacedAt IS NOT NULL'),
            totalArtists: await this.access.connection.getRepository(ctx,Artist).createQueryBuilder('artist').where('artist.status != :status',{status:'ARCHIVED'}).getCount(),
            pendingInquiries:await this.access.repo(ctx,GalleryInquiry).count({where:{channelId:ctx.channelId,status:'pending'}}),
            pendingPrivatePurchases:await this.access.repo(ctx,GalleryPrivatePurchase).count({where:{channelId:ctx.channelId,status:'submitted'}}),
            paymentRequests:await this.access.repo(ctx,GalleryPaymentRequest).count({where:{channelId:ctx.channelId}}),
            crm: await this.overview(ctx),
        };
    }
}
