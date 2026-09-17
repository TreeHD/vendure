import { Args, Mutation, Query, Resolver, ResolveField, Parent } from '@nestjs/graphql';
import { Allow, Ctx, Permission, RequestContext, Transaction, CustomerService } from '@vendure/core';
import { GallerySalesService } from './sales.service';
import { GalleryPaymentService } from './payment.service';
import { GalleryContentService, GalleryNotificationService } from './content.service';
import { GalleryCrmService } from './crm.service';
import { choice } from './common';
import * as P from './permissions';

@Resolver()
export class GalleryBusinessShopResolver {
constructor(private sales:GallerySalesService,private payments:GalleryPaymentService,private content:GalleryContentService,private notificationService:GalleryNotificationService,private crm:GalleryCrmService,private customers:CustomerService){}
@Query()
@Allow(Permission.Owner)
myNotifications(@Ctx() ctx:RequestContext,@Args() args:any) {return this.notificationService.mine(ctx,args.options);}
@Query()
@Allow(Permission.Owner)
myUnreadNotificationCount(@Ctx() ctx:RequestContext,@Args() args:any) {return this.notificationService.unread(ctx);}
@Query()
@Allow(Permission.Owner)
myPrivatePurchases(@Ctx() ctx:RequestContext,@Args() args:any) {return this.sales.purchases(ctx,args.options,true);}
@Query()
@Allow(Permission.Owner)
myPrivatePurchase(@Ctx() ctx:RequestContext,@Args() args:any) {return this.sales.purchase(ctx,args.id,true);}
@Query()
@Allow(Permission.Public)
paymentRequest(@Ctx() ctx:RequestContext,@Args() args:any) {return this.payments.byToken(ctx,args.token);}
@Query()
@Allow(Permission.Public)
paymentRequestStatus(@Ctx() ctx:RequestContext,@Args() args:any) {return this.payments.byToken(ctx,args.token);}
@Query()
@Allow(Permission.Public)
siteSettings(@Ctx() ctx:RequestContext,@Args() args:any) {return this.content.publicOne(ctx,'settings','site');}
@Query()
@Allow(Permission.Public)
contentPage(@Ctx() ctx:RequestContext,@Args() args:any) {return this.content.publicOne(ctx,'page',args.key);}
@Query()
@Allow(Permission.Public)
pressEntries(@Ctx() ctx:RequestContext,@Args() args:any) {return this.content.publicList(ctx,'press',args.options);}
@Query()
@Allow(Permission.Public)
pressEntry(@Ctx() ctx:RequestContext,@Args() args:any) {return this.content.publicOne(ctx,'press',args.slug);}
@Query()
@Allow(Permission.Public)
teamMembers(@Ctx() ctx:RequestContext,@Args() args:any) {return this.content.publicList(ctx,'team',args.options);}
@Mutation()
@Transaction()
@Allow(Permission.Public)
createInquiry(@Ctx() ctx:RequestContext,@Args() args:any) {return this.sales.createInquiry(ctx,args.input);}
@Mutation()
@Transaction()
@Allow(Permission.Public)
createContactMessage(@Ctx() ctx:RequestContext,@Args() args:any) {return this.sales.createInquiry(ctx,{...args.input,type:'general'});}
@Mutation()
@Transaction()
@Allow(Permission.Public)
createPrivatePurchase(@Ctx() ctx:RequestContext,@Args() args:any) {return this.sales.createPurchase(ctx,args.input);}
@Mutation()
@Transaction()
@Allow(Permission.Owner)
claimPrivatePurchase(@Ctx() ctx:RequestContext,@Args() args:any) {return this.sales.claim(ctx,args.token);}
@Mutation()
@Transaction()
@Allow(Permission.Owner)
cancelMyPrivatePurchase(@Ctx() ctx:RequestContext,@Args() args:any) {return this.sales.transition(ctx,args.id,'cancelled',args.reason,true);}
@Mutation()
@Transaction()
@Allow(Permission.Owner)
markMyNotificationRead(@Ctx() ctx:RequestContext,@Args() args:any) {return this.notificationService.read(ctx,args.id).then(()=>true);}
@Mutation()
@Transaction()
@Allow(Permission.Owner)
markAllMyNotificationsRead(@Ctx() ctx:RequestContext,@Args() args:any) {return this.notificationService.read(ctx);}
@Mutation()
@Transaction()
@Allow(Permission.Public)
createGalleryVisitorToken(@Ctx() ctx:RequestContext,@Args() args:any) {return this.crm.visitor();}
@Mutation()
@Transaction()
@Allow(Permission.Public)
recordGalleryEvent(@Ctx() ctx:RequestContext,@Args() args:any) {return this.crm.record(ctx,args.input);}
@Mutation()
@Transaction()
@Allow(Permission.Public)
startPaymentRequestCheckout(@Ctx() ctx:RequestContext,@Args() args:any) {return this.payments.checkout(ctx,args.token);}
}
