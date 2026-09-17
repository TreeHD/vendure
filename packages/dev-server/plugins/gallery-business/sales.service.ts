import { Injectable } from '@nestjs/common';
import { CustomerService, ID, RequestContext } from '@vendure/core';
import { GalleryAccess, ListOptions, choice, email, future, galleryError, hash, money, required, safePath, token } from './common';
import { GalleryInquiry, GalleryPrivatePurchase, GalleryProposal, GalleryCaseTransition, GalleryPaymentRequest, GalleryReservation, GalleryNotification, GalleryMailOutbox } from './entities';

const transitions: Record<string, string[]> = {
    submitted: ['reviewing','cancelled'], reviewing: ['contacted','declined','cancelled'],
    contacted: ['proposal_sent','declined','cancelled'], proposal_sent: ['payment_requested','cancelled'],
    payment_requested: ['completed','cancelled'], completed: [], cancelled: [], declined: [],
};
@Injectable()
export class GallerySalesService {
    constructor(private access: GalleryAccess, private customers: CustomerService) {}
    async createInquiry(ctx: RequestContext, input: any) {
        const type = choice(input.type || 'general',['general','artwork','art-space'],'INQUIRY_TYPE');
        if (type === 'artwork' && !input.productId) throw galleryError('PRODUCT_REQUIRED', '作品詢價必須提供 productId。');
        if (input.productId) await this.access.product(ctx,input.productId);
        const customer = await this.access.customer(ctx,true);
        const row = await this.access.repo(ctx,GalleryInquiry).save(this.access.repo(ctx,GalleryInquiry).create({
            channelId:ctx.channelId,customerId:customer?.id||null,code:`INQ-${token().slice(0,12)}`,type,
            productId:input.productId||null,contactName:required(input.contactName,'name',200),emailAddress:email(input.emailAddress),
            phoneNumber:type==='artwork'?required(input.phoneNumber,'phone',50):(input.phoneNumber||'').slice(0,50),
            subject:required(input.subject,'subject',300),message:required(input.message,'message'),languageCode:choice(input.languageCode||'zh_Hant',['zh_Hant','en'],'LANGUAGE'),sourcePath:safePath(input.sourcePath),status:'pending',internalNote:'',
        }));
        return row;
    }
    inquiries(ctx: RequestContext, options: ListOptions) { return this.access.list(ctx,GalleryInquiry,options,['code','contactName','emailAddress','subject']); }
    inquiry(ctx: RequestContext,id:ID) { return this.access.find(ctx,GalleryInquiry,id); }
    async updateInquiry(ctx:RequestContext,input:any) {
        const row=await this.access.find(ctx,GalleryInquiry,input.id,true);
        if(input.status!==undefined) row.status=choice(input.status,['pending','contacted','closed','archived'],'STATUS');
        if(input.assignedAdministratorId!==undefined) row.assignedAdministratorId=(await this.access.assignee(ctx,input.assignedAdministratorId))??null;
        if(input.internalNote!==undefined) row.internalNote=input.internalNote?required(input.internalNote,'note',10000):'';
        if(input.contactName!==undefined) row.contactName=required(input.contactName,'name',200);
        if(input.emailAddress!==undefined) row.emailAddress=email(input.emailAddress);
        if(input.phoneNumber!==undefined) row.phoneNumber=required(input.phoneNumber,'phone',50);
        return this.access.repo(ctx,GalleryInquiry).save(row);
    }
    async createPurchase(ctx:RequestContext,input:any) {
        const product=await this.access.product(ctx,input.productId);
        const customer=await this.access.customer(ctx,true);
        const claimToken=customer?null:token();
        const row=await this.access.repo(ctx,GalleryPrivatePurchase).save(this.access.repo(ctx,GalleryPrivatePurchase).create({
            channelId:ctx.channelId,customerId:customer?.id||null,code:`PRV-${token().slice(0,12)}`,productId:product.id,artworkTitle:product.name,
            contactName:required(input.contactName,'name',200),emailAddress:email(input.emailAddress),phoneNumber:required(input.phoneNumber,'phone',50),
            preferredContactMethod:choice(input.preferredContactMethod||'email',['email','phone'],'CONTACT_METHOD'),message:required(input.message,'message'),
            languageCode:choice(input.languageCode||'zh_Hant',['zh_Hant','en'],'LANGUAGE'),status:'submitted',claimTokenHash:claimToken?hash(claimToken):null,
            claimExpiresAt:claimToken?new Date(Date.now()+7*86400000):null,internalNote:'',
        }));
        if(claimToken) await this.mail(ctx,row.emailAddress,'私人洽購案件認領',`案件 ${row.code}\n請登入已驗證的會員帳號後認領：${process.env.VENDURE_STOREFRONT_URL}/account/private-purchases/claim?token=${claimToken}`);
        return row;
    }
    async claim(ctx:RequestContext,claimToken:string) {
        const customer=(await this.access.customer(ctx))!;
        const withUser=await this.customers.findOne(ctx,customer.id,['user']);
        if(!withUser?.user?.verified) throw galleryError('VERIFIED_ACCOUNT_REQUIRED');
        const candidate=await this.access.repo(ctx,GalleryPrivatePurchase).findOne({where:{channelId:ctx.channelId,claimTokenHash:hash(claimToken)}});
        if(!candidate) throw galleryError('INVALID_CLAIM_TOKEN');
        const row=await this.access.find(ctx,GalleryPrivatePurchase,candidate.id,true);
        if(row.customerId || !row.claimTokenHash || !row.claimExpiresAt || +row.claimExpiresAt<Date.now() || row.emailAddress.toLowerCase()!==customer.emailAddress.toLowerCase()) throw galleryError('INVALID_CLAIM_TOKEN');
        row.customerId=customer.id;row.claimTokenHash=null;row.claimExpiresAt=null;
        return this.access.repo(ctx,GalleryPrivatePurchase).save(row);
    }
    async purchases(ctx:RequestContext,options:ListOptions={},mine=false) {
        if(!mine)return this.access.list(ctx,GalleryPrivatePurchase,options,['code','contactName','emailAddress','artworkTitle']);
        const customer=(await this.access.customer(ctx))!;
        const query=this.access.repo(ctx,GalleryPrivatePurchase).createQueryBuilder('p').where('p.channelId = :channel AND p.customerId = :customer',{channel:ctx.channelId,customer:customer.id});
        if(options.status)query.andWhere('p.status = :status',{status:options.status});
        const [items,totalItems]=await query.orderBy('p.createdAt','DESC').addOrderBy('p.id','DESC').skip(Math.max(0,options.skip||0)).take(Math.min(100,Math.max(1,options.take||20))).getManyAndCount();
        return {items,totalItems};
    }
    async purchase(ctx:RequestContext,id:ID,mine=false,lock=false) {
        const row=await this.access.find(ctx,GalleryPrivatePurchase,id,lock);
        if(mine && String(row.customerId)!==String((await this.access.customer(ctx))!.id))throw galleryError('NOT_FOUND', '找不到此私人洽購案件，或案件不屬於目前登入的客戶。');
        const proposals=await this.access.repo(ctx,GalleryProposal).find({where:{channelId:ctx.channelId,purchaseId:id},order:{version:'DESC'}});
        const payments=await this.access.repo(ctx,GalleryPaymentRequest).find({where:{channelId:ctx.channelId,purchaseId:id},order:{id:'ASC'}});
        const history=await this.access.repo(ctx,GalleryCaseTransition).find({where:{channelId:ctx.channelId,purchaseId:id},order:{id:'ASC'}});
        const paidAmount=payments.filter(p=>p.paymentId).reduce((s,p)=>s+p.amount,0);
        const refundedAmount=payments.reduce((s,p)=>s+p.refundedAmount,0);
        const totalAmount=proposals[0]?.amount||0;
        return {...row,proposals,paymentRequests:payments,history,totalAmount,paidAmount,refundedAmount,remainingAmount:Math.max(0,totalAmount-paidAmount+refundedAmount)};
    }
    async transition(ctx:RequestContext,id:ID,status:string,reason='',mine=false,system=false) {
        const row=await this.access.find(ctx,GalleryPrivatePurchase,id,true);
        if(mine && String(row.customerId)!==String((await this.access.customer(ctx))!.id))throw galleryError('NOT_FOUND', '找不到此私人洽購案件，或案件不屬於目前登入的客戶。');
        if(!transitions[row.status]?.includes(status))throw galleryError('INVALID_CASE_TRANSITION', `案件目前為「${row.status}」，不能轉換為「${status}」。`);
        if(mine && (status!=='cancelled'||row.status==='payment_requested'))throw galleryError('CONTACT_GALLERY_TO_CANCEL');
        if(!system && ['proposal_sent','payment_requested','completed'].includes(status))throw galleryError('USE_CASE_ACTION');
        if(status==='cancelled') {
            const requests=await this.access.repo(ctx,GalleryPaymentRequest).find({where:{channelId:ctx.channelId,purchaseId:id}});
            if(requests.some(p=>p.status==='pending'||p.paymentId&&p.refundedAmount<p.amount))throw galleryError('REVOKE_AND_REFUND_BEFORE_CANCELLING');
            await this.access.repo(ctx,GalleryReservation).delete({channelId:ctx.channelId,purchaseId:id});
        }
        await this.access.repo(ctx,GalleryCaseTransition).save(this.access.repo(ctx,GalleryCaseTransition).create({channelId:ctx.channelId,purchaseId:id,fromStatus:row.status,toStatus:status,actorUserId:ctx.activeUserId||null,reason:reason.slice(0,4000)}));
        row.status=status;
        await this.access.repo(ctx,GalleryPrivatePurchase).save(row);
        await this.notify(ctx,row,`案件狀態已更新：${status}`,`Case status updated: ${status}`);
        return this.purchase(ctx,id,mine);
    }
    async updatePurchase(ctx:RequestContext,input:any) {
        const row=await this.access.find(ctx,GalleryPrivatePurchase,input.id,true);
        if(input.assignedAdministratorId!==undefined)row.assignedAdministratorId=(await this.access.assignee(ctx,input.assignedAdministratorId))??null;
        if(input.internalNote!==undefined)row.internalNote=input.internalNote?required(input.internalNote,'note',10000):'';
        await this.access.repo(ctx,GalleryPrivatePurchase).save(row);
        if(input.status&&input.status!==row.status)return this.transition(ctx,row.id,input.status,input.reason);
        return this.purchase(ctx,row.id);
    }
    async proposal(ctx:RequestContext,input:any) {
        const row=await this.access.find(ctx,GalleryPrivatePurchase,input.purchaseId,true);
        if(!['contacted','proposal_sent'].includes(row.status)||row.orderId)throw galleryError('PROPOSAL_NOT_EDITABLE');
        const amount=money(input.amount),depositAmount=money(input.depositAmount);
        if(depositAmount>=amount)throw galleryError('DEPOSIT_MUST_BE_LESS_THAN_TOTAL');
        const depositDueAt=future(input.depositDueAt),balanceDueAt=future(input.balanceDueAt);
        if(+balanceDueAt<=+depositDueAt)throw galleryError('INVALID_BALANCE_DEADLINE');
        const repo=this.access.repo(ctx,GalleryProposal);
        const latest=await repo.findOne({where:{channelId:ctx.channelId,purchaseId:row.id},order:{version:'DESC'}});
        const proposal=await repo.save(repo.create({channelId:ctx.channelId,purchaseId:row.id,version:(latest?.version||0)+1,summary:required(input.summary,'summary'),amount,depositAmount,currencyCode:'TWD',depositDueAt,balanceDueAt}));
        if(row.status==='contacted')await this.transition(ctx,row.id,'proposal_sent','',false,true);
        return proposal;
    }
    async delivered(ctx:RequestContext,id:ID) {
        const detail=await this.purchase(ctx,id,false,true);
        if(detail.status!=='payment_requested'||detail.remainingAmount!==0||detail.totalAmount<=0||detail.refundedAmount>0)throw galleryError('PAYMENT_INCOMPLETE');
        await this.access.repo(ctx,GalleryPrivatePurchase).update({id,channelId:ctx.channelId},{deliveredAt:new Date()});
        return this.transition(ctx,id,'completed','交付已確認',false,true);
    }
    async mail(ctx:RequestContext,recipient:string,subject:string,body:string) {
        return this.access.repo(ctx,GalleryMailOutbox).save(this.access.repo(ctx,GalleryMailOutbox).create({channelId:ctx.channelId,recipient,subject,body,status:'pending'}));
    }
    async notify(ctx:RequestContext,row:GalleryPrivatePurchase,zh:string,en:string) {
        if(row.customerId)await this.access.repo(ctx,GalleryNotification).save(this.access.repo(ctx,GalleryNotification).create({channelId:ctx.channelId,status:'PUBLISHED',audience:'USERS',recipientIds:[String(row.customerId)],publishedAt:new Date(),actionPath:`/account/private-purchases/${row.id}`,translations:[{languageCode:'zh_Hant',title:zh,body:`案件 ${row.code}`,category:'私人洽購'},{languageCode:'en',title:en,body:`Case ${row.code}`,category:'Private purchase'}]}));
        await this.mail(ctx,row.emailAddress,zh,`案件 ${row.code}\n${zh}`);
    }
}
