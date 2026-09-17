import { Injectable } from '@nestjs/common';
import { Customer, CustomerService, ID, Order, OrderService, Payment, PaymentMethodHandler, PaymentMethodService, RequestContext, TransactionalConnection, LanguageCode, Injector } from '@vendure/core';
import Stripe from 'stripe';
import { GalleryAccess, ListOptions, galleryError, galleryUpstreamError, hash, required, token } from './common';
import { GalleryPaymentRequest, GalleryPrivatePurchase, GalleryProposal, GalleryReservation, GalleryStripeEvent } from './entities';
import { GallerySalesService } from './sales.service';

@Injectable()
export class GalleryPaymentService {
    constructor(private access: GalleryAccess, private sales: GallerySalesService, private orders: OrderService, private customers: CustomerService, private methods: PaymentMethodService) {}
    stripe(): Stripe {
        if(!process.env.STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY.includes('replace'))throw galleryError('STRIPE_NOT_CONFIGURED');
        return new Stripe(process.env.STRIPE_SECRET_KEY,{maxNetworkRetries:2,timeout:20000});
    }
    list(ctx:RequestContext,options:ListOptions) {return this.access.list(ctx,GalleryPaymentRequest,options);}
    one(ctx:RequestContext,id:ID) {return this.access.find(ctx,GalleryPaymentRequest,id);}
    async ensureMethod(ctx:RequestContext) {
        const list=await this.methods.findAll(ctx,{take:100});
        if(!list.items.some(m=>m.code==='gallery-stripe')) {
            const result=await this.methods.create(ctx,{code:'gallery-stripe',enabled:true,handler:{code:'gallery-stripe',arguments:[]},translations:[{languageCode:LanguageCode.zh_Hant,name:'Stripe 信用卡',description:'Stripe 託管付款頁'}]});
            if('errorCode' in result)throw galleryUpstreamError('建立 gallery-stripe 付款方式', result.errorCode);
        }
    }
    async create(ctx:RequestContext,input:{purchaseId:ID;stage:string}) {
        const purchase=await this.access.find(ctx,GalleryPrivatePurchase,input.purchaseId,true);
        if(!['proposal_sent','payment_requested'].includes(purchase.status))throw galleryError('INVALID_CASE_STATE');
        if(!['deposit','balance'].includes(input.stage))throw galleryError('INVALID_STAGE');
        const proposal=await this.access.repo(ctx,GalleryProposal).findOne({where:{channelId:ctx.channelId,purchaseId:purchase.id},order:{version:'DESC'}});
        if(!proposal)throw galleryError('PROPOSAL_REQUIRED');
        const existing=await this.access.repo(ctx,GalleryPaymentRequest).find({where:{channelId:ctx.channelId,purchaseId:purchase.id}});
        if(existing.some(p=>p.stage===input.stage&&(p.status==='pending'||p.paymentId)))throw galleryError('STAGE_ALREADY_EXISTS');
        if(input.stage==='balance'&&!existing.some(p=>p.stage==='deposit'&&p.status==='paid'&&p.refundedAmount===0))throw galleryError('DEPOSIT_REQUIRED');
        const expiresAt=input.stage==='deposit'?proposal.depositDueAt:proposal.balanceDueAt;
        if(+expiresAt<Date.now()+30*60000)throw galleryError('DEADLINE_TOO_SOON');
        // Lock the work before reserving; a DB unique constraint is the final concurrency guard.
        const product=await this.access.product(ctx,purchase.productId);
        const productRepo=this.access.connection.getRepository(ctx,product.constructor as typeof import('@vendure/core').Product);
        if(this.access.connection.rawConnection.options.type==='postgres')await productRepo.createQueryBuilder('p').where('p.id = :id',{id:product.id}).setLock('pessimistic_write').getOne();
        const reservationRepo=this.access.repo(ctx,GalleryReservation);
        const reservation=await reservationRepo.findOne({where:{channelId:ctx.channelId,productId:product.id}});
        if(reservation&&String(reservation.purchaseId)!==String(purchase.id))throw galleryError('ARTWORK_RESERVED');
        if(!reservation)await reservationRepo.save(reservationRepo.create({channelId:ctx.channelId,productId:product.id,purchaseId:purchase.id,expiresAt:proposal.depositDueAt,depositPaid:false}));
        if(!purchase.orderId) {
            let customer=purchase.customerId?await this.customers.findOne(ctx,purchase.customerId):await this.access.connection.getRepository(ctx,Customer).createQueryBuilder('c').innerJoin('c.channels','channel','channel.id = :channel',{channel:ctx.channelId}).where('c.emailAddress = :email AND c.deletedAt IS NULL',{email:purchase.emailAddress}).getOne();
            if(!customer) {
                const created=await this.customers.create(ctx,{firstName:purchase.contactName,lastName:'',emailAddress:purchase.emailAddress,phoneNumber:purchase.phoneNumber});
                if('errorCode' in created)throw galleryUpstreamError('建立付款客戶', created.errorCode);
                customer=created;
            }
            let order=await this.orders.createDraft(ctx);
            order=await this.orders.addCustomerToOrder(ctx,order.id,customer);
            (order.customFields as Record<string, string>).galleryPrivatePurchaseId = String(purchase.id);
            await this.access.connection.getRepository(ctx, Order).save(order);
            order=await this.orders.addSurchargeToOrder(ctx,order.id,{description:`私人報價 ${purchase.code}`,sku:purchase.code,listPrice:proposal.amount,listPriceIncludesTax:true,taxLines:[]});
            if(order.totalWithTax!==proposal.amount)throw galleryError('ORDER_AMOUNT_MISMATCH');
            const transitioned=await this.orders.transitionToState(ctx,order.id,'ArrangingPayment');
            if('errorCode' in transitioned)throw galleryUpstreamError('將訂單轉為待付款', transitioned.message);
            purchase.orderId=order.id;
            await this.access.repo(ctx,GalleryPrivatePurchase).save(purchase);
        }
        await this.ensureMethod(ctx);
        const rawToken=token();
        const repo=this.access.repo(ctx,GalleryPaymentRequest);
        const row=await repo.save(repo.create({channelId:ctx.channelId,purchaseId:purchase.id,proposalId:proposal.id,orderId:purchase.orderId,stage:input.stage,amount:input.stage==='deposit'?proposal.depositAmount:proposal.amount-proposal.depositAmount,currencyCode:proposal.currencyCode,tokenHash:hash(rawToken),expiresAt,status:'pending',refundedAmount:0,reason:''}));
        if(purchase.status==='proposal_sent')await this.sales.transition(ctx,purchase.id,'payment_requested','',false,true);
        const paymentUrl=`${process.env.VENDURE_STOREFRONT_URL}/pay/${rawToken}`;
        await this.sales.mail(ctx,purchase.emailAddress,input.stage==='deposit'?'訂金付款邀請':'尾款付款邀請',`案件 ${purchase.code}\n${paymentUrl}`);
        return {...row,paymentUrl};
    }
    async byToken(ctx:RequestContext,rawToken:string,lock=false) {
        required(rawToken,'token',100);
        const candidate=await this.access.repo(ctx,GalleryPaymentRequest).findOne({where:{channelId:ctx.channelId,tokenHash:hash(rawToken)}});
        if(!candidate)throw galleryError('INVALID_PAYMENT_TOKEN');
        const row=await this.access.find(ctx,GalleryPaymentRequest,candidate.id,lock);
        return {...row,status:row.status==='pending'&&+row.expiresAt<Date.now()?'expired':row.status};
    }
    async checkout(ctx:RequestContext,rawToken:string) {
        const row=await this.byToken(ctx,rawToken,true);
        if(row.status!=='pending')throw galleryError('PAYMENT_REQUEST_NOT_PAYABLE');
        const purchase=await this.access.find(ctx,GalleryPrivatePurchase,row.purchaseId,true);
        if(purchase.status!=='payment_requested')throw galleryError('CASE_NOT_PAYABLE');
        const reservation=await this.access.repo(ctx,GalleryReservation).findOne({where:{channelId:ctx.channelId,purchaseId:purchase.id}});
        if(!reservation)throw galleryError('RESERVATION_REQUIRED');
        const order=await this.orders.findOne(ctx,row.orderId);
        const proposal=await this.access.find(ctx,GalleryProposal,row.proposalId);
        if(!order||order.totalWithTax!==proposal.amount||order.currencyCode!==row.currencyCode)throw galleryError('ORDER_CHANGED');
        const stripe=this.stripe();
        if(row.stripeSessionId) {
            const session=await stripe.checkout.sessions.retrieve(row.stripeSessionId);
            if(session.status==='open'&&session.url)return {url:session.url,expiresAt:new Date(session.expires_at*1000)};
            // Each invitation has one Stripe Session. Reissue a revoked/expired invitation for a fresh attempt.
            throw galleryError(session.payment_status==='paid'?'PAYMENT_PROCESSING':'REISSUE_PAYMENT_REQUEST', session.payment_status === 'paid' ? undefined : '原 Stripe 付款頁已失效或被撤銷，請要求畫廊重新發送付款邀請。');
        }
        const storefront=required(process.env.VENDURE_STOREFRONT_URL,'storefront_url',2048);
        const expiresAt=Math.min(Math.floor(+row.expiresAt/1000),Math.floor(Date.now()/1000)+23*3600);
        if(expiresAt<Math.floor(Date.now()/1000)+1800)throw galleryError('DEADLINE_TOO_SOON');
        const session=await stripe.checkout.sessions.create({
            mode:'payment',payment_method_types:['card'],customer_email:purchase.emailAddress,
            line_items:[{quantity:1,price_data:{currency:row.currencyCode.toLowerCase(),unit_amount:row.amount,product_data:{name:`${purchase.code} ${row.stage==='deposit'?'訂金':'尾款'}`}}}],
            metadata:{galleryPaymentRequestId:String(row.id),channelId:String(ctx.channelId)},
            payment_intent_data:{metadata:{galleryPaymentRequestId:String(row.id),channelId:String(ctx.channelId)}},
            success_url:`${storefront}/pay/${rawToken}?result=returned`,cancel_url:`${storefront}/pay/${rawToken}?result=cancelled`,expires_at:expiresAt,
        },{idempotencyKey:`gallery-checkout-${row.id}`});
        await this.access.repo(ctx,GalleryPaymentRequest).update({id:row.id},{stripeSessionId:session.id});
        return {url:session.url!,expiresAt:new Date(session.expires_at*1000)};
    }
    async revoke(ctx:RequestContext,id:ID,reason:string) {
        const row=await this.access.find(ctx,GalleryPaymentRequest,id,true);
        if(row.paymentId)throw galleryError('REFUND_REQUIRED');
        if(row.stripeSessionId) {
            const stripe=this.stripe();
            const session=await stripe.checkout.sessions.retrieve(row.stripeSessionId);
            if(session.payment_status==='paid'||session.status==='complete')throw galleryError('PAYMENT_PROCESSING');
            if(session.status==='open')await stripe.checkout.sessions.expire(session.id);
        }
        row.status='revoked';row.reason=required(reason,'reason');
        return this.access.repo(ctx,GalleryPaymentRequest).save(row);
    }
    async resend(ctx:RequestContext,id:ID) {
        const row=await this.access.find(ctx,GalleryPaymentRequest,id,true);
        if(row.status==='pending')await this.revoke(ctx,id,'重新發送付款邀請');
        if(row.paymentId)throw galleryError('STAGE_ALREADY_PAID');
        return this.create(ctx,{purchaseId:row.purchaseId,stage:row.stage});
    }
    async verifiedPayment(ctx:RequestContext,order:Order,maxAmount:number,requestId:ID) {
        if(ctx.apiType!=='admin')throw galleryError('WEBHOOK_PAYMENT_ONLY');
        const row=await this.access.find(ctx,GalleryPaymentRequest,requestId,true);
        if(row.paymentId||String(row.orderId)!==String(order.id)||!row.stripePaymentIntentId||row.amount>maxAmount)throw galleryError('INVALID_PAYMENT');
        const intent=await this.stripe().paymentIntents.retrieve(row.stripePaymentIntentId);
        if(intent.status!=='succeeded'||intent.amount_received!==row.amount||intent.currency!==row.currencyCode.toLowerCase()||intent.metadata.galleryPaymentRequestId!==String(row.id))throw galleryError('PAYMENT_VERIFICATION_FAILED');
        return {amount:row.amount,state:'Settled' as const,transactionId:intent.id,metadata:{galleryPaymentRequestId:String(row.id)}};
    }
    async acceptEvent(event:Stripe.Event) {
        const repo=this.access.connection.rawConnection.getRepository(GalleryStripeEvent);
        await repo.createQueryBuilder().insert().values({eventId:event.id,type:event.type,payload:JSON.stringify(event),status:'pending',error:''}).orIgnore().execute();
    }
    async processEvent(ctx:RequestContext,event:Stripe.Event) {
        const object=event.data.object as any;
        let session:Stripe.Checkout.Session|undefined;
        if(event.type.startsWith('checkout.session.'))session=object;
        const id=session?.metadata?.galleryPaymentRequestId;
        if(!id)return;
        const row=await this.access.find(ctx,GalleryPaymentRequest,id,true);
        if(session!.metadata?.channelId!==String(ctx.channelId)||row.stripeSessionId!==session!.id)throw galleryError('WEBHOOK_REQUEST_MISMATCH');
        if(['checkout.session.completed','checkout.session.async_payment_succeeded'].includes(event.type)) {
            if(session!.payment_status!=='paid')return;
            if(session!.amount_total!==row.amount||session!.currency!==row.currencyCode.toLowerCase())throw galleryError('WEBHOOK_AMOUNT_MISMATCH');
            if(row.paymentId)return;
            row.stripePaymentIntentId=typeof session!.payment_intent==='string'?session!.payment_intent:session!.payment_intent?.id||null;
            if(!row.stripePaymentIntentId)throw galleryError('PAYMENT_INTENT_MISSING');
            const late=row.status!=='pending';
            await this.access.repo(ctx,GalleryPaymentRequest).save(row);
            const result=await this.orders.addPaymentToOrder(ctx,row.orderId,{method:'gallery-stripe',metadata:{galleryPaymentRequestId:String(row.id)}});
            if('errorCode' in result)throw galleryUpstreamError('將 Stripe 付款寫入訂單', result.errorCode);
            const payment=await this.access.connection.getRepository(ctx,Payment).findOne({where:{transactionId:row.stripePaymentIntentId}});
            if(!payment)throw galleryError('PAYMENT_RECORD_MISSING');
            row.paymentId=payment.id;row.status=late?'requires_review':'paid';
            await this.access.repo(ctx,GalleryPaymentRequest).save(row);
            await this.access.repo(ctx,GalleryReservation).update({channelId:ctx.channelId,purchaseId:row.purchaseId},{depositPaid:true});
            const purchase=await this.access.find(ctx,GalleryPrivatePurchase,row.purchaseId);
            await this.sales.notify(ctx,purchase,`${row.stage==='deposit'?'訂金':'尾款'}已入帳`,'Payment received');
        } else if(event.type==='checkout.session.expired'&&row.status==='pending') {
            row.status='expired';await this.access.repo(ctx,GalleryPaymentRequest).save(row);
        }
    }
    async refund(ctx:RequestContext,id:ID,reason:string) {
        const row=await this.access.find(ctx,GalleryPaymentRequest,id,true);
        if(!row.paymentId||!row.stripePaymentIntentId)throw galleryError('NO_PAYMENT_TO_REFUND');
        if(row.refundedAmount===row.amount)return row;
        // Full refund per stage; Stripe and DB retries use the same idempotency key.
        const refund=await this.stripe().refunds.create({payment_intent:row.stripePaymentIntentId,amount:row.amount-row.refundedAmount,metadata:{galleryPaymentRequestId:String(row.id)}},{idempotencyKey:`gallery-refund-${row.id}`});
        if(refund.status!=='succeeded')throw galleryError('REFUND_PENDING_RECONCILIATION');
        const result=await this.orders.refundOrder(ctx,{paymentId:row.paymentId,lines:[],shipping:0,adjustment:row.amount-row.refundedAmount,reason:required(reason,'reason')});
        if('errorCode' in result)throw galleryUpstreamError('退款訂單', result.errorCode);
        row.refundedAmount=row.amount;row.status='refunded';row.reason=reason;
        return this.access.repo(ctx,GalleryPaymentRequest).save(row);
    }
}
let payments:GalleryPaymentService;
export const galleryStripeHandler=new PaymentMethodHandler({
    code:'gallery-stripe',description:[{languageCode:LanguageCode.zh_Hant,value:'Stripe 訂金／尾款'}],args:{},
    init(injector:Injector){payments=injector.get(GalleryPaymentService);},
    createPayment:(ctx,order,amount,args,metadata)=>payments.verifiedPayment(ctx,order,amount,metadata.galleryPaymentRequestId),
    settlePayment:async()=>({success:false,errorMessage:'Stripe payments settle through verified webhooks'}),
    createRefund:async(ctx,input,amount,order,payment)=>{
        if(ctx.apiType!=='admin')throw galleryError('ADMIN_REQUIRED');
        const result=await payments.stripe().refunds.create({payment_intent:payment.transactionId,amount},{idempotencyKey:`gallery-refund-${payment.metadata.galleryPaymentRequestId}`});
        return {state:result.status==='succeeded'?'Settled':'Pending',transactionId:result.id};
    },
});
