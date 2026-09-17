import { isObservable, lastValueFrom } from 'rxjs';
import { Controller, Post, Req, Res } from '@nestjs/common';
import { Channel, DefaultOrderByCodeAccessStrategy, Injector, Logger, OrderProcess, RequestContextService, ScheduledTask, TransactionalConnection, configureDefaultOrderProcess } from '@vendure/core';
import type { Request, Response } from 'express';
import { GalleryPaymentService } from './payment.service';
import { GalleryMailOutbox, GalleryPrivatePurchase, GalleryReservation, GalleryStripeEvent, GalleryPaymentRequest } from './entities';
import { GalleryAccess } from './common';

function backgroundError(error: unknown): string {
    const reason = error instanceof Error && error.message ? error.message.slice(0, 500) : '未知的非 Error 例外';
    return `[PROCESSING_FAILED] 背景工作處理失敗：${reason}`;
}

@Controller('payments/stripe')
export class GalleryStripeController {
    constructor(private payments:GalleryPaymentService){}
    @Post('webhook')
    async webhook(@Req() req:Request,@Res() res:Response) {
        try {
            const secret=process.env.STRIPE_WEBHOOK_SECRET;
            if(!secret)return res.status(503).json({error:'STRIPE_NOT_CONFIGURED',message:'伺服器未設定 STRIPE_WEBHOOK_SECRET，無法驗證 Stripe webhook。'});
            const event=this.payments.stripe().webhooks.constructEvent(req.body,req.headers['stripe-signature'] as string,secret);
            await this.payments.acceptEvent(event);
            return res.status(200).json({received:true});
        } catch(error) {
            if((error as any).type==='StripeSignatureVerificationError')return res.status(400).json({error:'INVALID_SIGNATURE',message:'Stripe-Signature 無效，或 webhook 原始請求內容未通過驗證。'});
            return res.status(503).json({error:'WEBHOOK_UNAVAILABLE',message:'目前無法接收或儲存 Stripe webhook；請稍後重試。'});
        }
    }
}
export function privateOrderProcess(): OrderProcess<any> {
    const standard=configureDefaultOrderProcess({});
    const privateProcess=configureDefaultOrderProcess({arrangingPaymentRequiresContents:false,arrangingPaymentRequiresShipping:false});
    let access:GalleryAccess;
    return {
        ...standard,
        async init(injector) {access=injector.get(GalleryAccess);await standard.init?.(injector);await privateProcess.init?.(injector);},
        async onTransitionStart(from,to,data) {
            const privateId=(data.order.customFields as any).galleryPrivatePurchaseId;
            if(privateId) {
                if(data.ctx.apiType!=='admin')return '[PRIVATE_ORDER_MANAGED_BY_GALLERY] 私人洽購訂單只能由畫廊的管理流程變更狀態。';
                const purchase=await access.find(data.ctx,GalleryPrivatePurchase,privateId);
                if(purchase.orderId && String(purchase.orderId)!==String(data.order.id))return '[PRIVATE_ORDER_MISMATCH] 此私人洽購案件已連結到另一張訂單，不能使用目前訂單。';
                if(data.order.lines.length)return '[PRIVATE_ORDER_CONTENTS_INVALID] 私人洽購訂單只能包含系統建立的報價附加費，不能含一般商品明細。';
                const result = privateProcess.onTransitionStart?.(from,to,data); return isObservable(result) ? lastValueFrom(result) : result;
            }
            if(['ArrangingPayment','PaymentAuthorized','PaymentSettled'].includes(to)) {
                for(const line of data.order.lines) {
                    const productId=line.productVariant?.productId;
                    if(productId&&await access.repo(data.ctx,GalleryReservation).findOne({where:{channelId:data.ctx.channelId,productId}}))return '[ARTWORK_RESERVED] 訂單包含已由私人洽購案件保留的作品，不能進入付款流程。';
                }
            }
            const result = standard.onTransitionStart?.(from,to,data); return isObservable(result) ? lastValueFrom(result) : result;
        },
    };
}
export class GalleryOrderAccess extends DefaultOrderByCodeAccessStrategy {
    constructor(){super('2h');}
    canAccessOrder(ctx:any,order:any) {
        if(order.customFields?.galleryPrivatePurchaseId)return !!ctx.activeUserId&&String(order.customer?.user?.id)===String(ctx.activeUserId);
        return super.canAccessOrder(ctx,order);
    }
}
export const galleryBackgroundTask=new ScheduledTask({
    id:'gallery-business-delivery',description:'Stripe 通知重試、付款對帳與藝廊寄信',schedule:'* * * * *',
    async execute({injector}) {
        const connection=injector.get(TransactionalConnection),contexts=injector.get(RequestContextService),payments=injector.get(GalleryPaymentService);
        const channels=await connection.rawConnection.getRepository(Channel).find();
        const eventRepo=connection.rawConnection.getRepository(GalleryStripeEvent);
        const events=await eventRepo.find({where:{status:'pending'},order:{id:'ASC'},take:100});
        for(const entry of events) {
            try {
                const event=JSON.parse(entry.payload),object=event.data.object;
                const channelId=object.metadata?.channelId;
                if(!channelId) {await eventRepo.update(entry.id,{status:'ignored',payload:'{}'});continue;}
                const channel=channels.find(c=>String(c.id)===String(channelId));
                if(!channel)throw new Error('[CHANNEL_NOT_FOUND] 此 Stripe 事件指定的 channelId 不存在，無法判定要寫入的頻道。');
                const ctx=await contexts.create({apiType:'admin',channelOrToken:channel});
                await connection.withTransaction(ctx,async tx=>{
                    await payments.processEvent(tx,event);
                    await connection.getRepository(tx,GalleryStripeEvent).update(entry.id,{status:'processed',payload:'{}',error:''});
                });
            } catch(error) {const detail=backgroundError(error);await eventRepo.update(entry.id,{error:detail});Logger.warn(`Stripe event ${entry.id} will retry: ${detail}`,'Gallery');}
        }
        for(const channel of channels) {
            const ctx=await contexts.create({apiType:'admin',channelOrToken:channel});
            const requests=await connection.getRepository(ctx,GalleryPaymentRequest).find({where:{channelId:channel.id,status:'pending'},order:{id:'ASC'},take:100});
            for(const request of requests) {
                try {
                    if(request.stripeSessionId) {
                        const session=await payments.stripe().checkout.sessions.retrieve(request.stripeSessionId);
                        if(session.payment_status==='paid')await connection.withTransaction(ctx,tx=>payments.processEvent(tx,{id:`reconcile-${session.id}`,type:'checkout.session.completed',data:{object:session}} as any));
                        else if(session.status==='expired')await connection.getRepository(ctx,GalleryPaymentRequest).update(request.id,{status:'expired'});
                    } else if(+request.expiresAt<Date.now())await connection.getRepository(ctx,GalleryPaymentRequest).update(request.id,{status:'expired'});
                }catch(error){Logger.warn(`Payment request ${request.id} pending reconciliation: ${backgroundError(error)}`,'Gallery');}
            }
            const reservations=await connection.getRepository(ctx,GalleryReservation).find({where:{channelId:channel.id,depositPaid:false}});
            for(const reservation of reservations) if(+reservation.expiresAt<Date.now()) {
                const requests=await connection.getRepository(ctx,GalleryPaymentRequest).find({where:{channelId:channel.id,purchaseId:reservation.purchaseId}});
                if(requests.every(r=>['expired','revoked'].includes(r.status)&&!r.paymentId))await connection.getRepository(ctx,GalleryReservation).delete(reservation.id);
            }
            if(process.env.SMTP_HOST) {
                const nodemailer=require('nodemailer');
                const transport=nodemailer.createTransport({host:process.env.SMTP_HOST,port:Number(process.env.SMTP_PORT)||587,secure:process.env.SMTP_SECURE==='true',auth:process.env.SMTP_USER?{user:process.env.SMTP_USER,pass:process.env.SMTP_PASSWORD}:undefined,connectionTimeout:10000,socketTimeout:20000});
                const repo=connection.getRepository(ctx,GalleryMailOutbox);
                const messages=await repo.find({where:{channelId:channel.id,status:'pending'},take:50,order:{id:'ASC'}});
                for(const message of messages) {
                    try{await transport.sendMail({from:process.env.EMAIL_FROM_ADDRESS,to:message.recipient,subject:message.subject,text:message.body,messageId:`<gallery-${message.id}@vendure.local>`});await repo.update(message.id,{status:'sent',body:''});}
                    catch(error){Logger.warn(`Gallery mail ${message.id} pending retry: ${backgroundError(error)}`,'Gallery');}
                }
            }
        }
        return {processed:events.length};
    },
});
