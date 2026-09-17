import { Args, Mutation, Query, Resolver, ResolveField, Parent } from '@nestjs/graphql';
import { Allow, Ctx, Permission, RequestContext, Transaction, CustomerService } from '@vendure/core';
import { GallerySalesService } from './sales.service';
import { GalleryPaymentService } from './payment.service';
import { GalleryContentService, GalleryNotificationService } from './content.service';
import { GalleryCrmService } from './crm.service';
import { choice, galleryUpstreamError } from './common';
import * as P from './permissions';

@Resolver()
export class GalleryBusinessAdminResolver {
constructor(private sales:GallerySalesService,private payments:GalleryPaymentService,private content:GalleryContentService,private notificationService:GalleryNotificationService,private crm:GalleryCrmService,private customers:CustomerService){}
@Query()
@Allow(P.ReadGallerySales.Permission)
inquiries(@Ctx() ctx:RequestContext,@Args() args:any) {return this.sales.inquiries(ctx,args.options);}
@Query()
@Allow(P.ReadGallerySales.Permission)
inquiry(@Ctx() ctx:RequestContext,@Args() args:any) {return this.sales.inquiry(ctx,args.id);}
@Query()
@Allow(P.ReadGallerySales.Permission)
privatePurchases(@Ctx() ctx:RequestContext,@Args() args:any) {return this.sales.purchases(ctx,args.options);}
@Query()
@Allow(P.ReadGallerySales.Permission)
privatePurchase(@Ctx() ctx:RequestContext,@Args() args:any) {return this.sales.purchase(ctx,args.id);}
@Query()
@Allow(P.ManageGalleryPayments.Permission)
paymentRequests(@Ctx() ctx:RequestContext,@Args() args:any) {return this.payments.list(ctx,args.options);}
@Query()
@Allow(P.ManageGalleryPayments.Permission)
paymentRequest(@Ctx() ctx:RequestContext,@Args() args:any) {return this.payments.one(ctx,args.id);}
@Query()
@Allow(P.ManageGalleryContent.Permission)
notifications(@Ctx() ctx:RequestContext,@Args() args:any) {return this.notificationService.list(ctx,args.options);}
@Query()
@Allow(P.ManageGalleryContent.Permission)
notification(@Ctx() ctx:RequestContext,@Args() args:any) {return this.notificationService.one(ctx,args.id);}
@Query()
@Allow(P.ManageGalleryContent.Permission)
contentPages(@Ctx() ctx:RequestContext,@Args() args:any) {return this.content.list(ctx,args.options);}
@Query()
@Allow(P.ManageGalleryContent.Permission)
managedContent(@Ctx() ctx:RequestContext,@Args() args:any) {return this.content.one(ctx,args.id);}
@Query()
@Allow(P.ManageGalleryCrm.Permission)
crmOverview(@Ctx() ctx:RequestContext,@Args() args:any) {return this.crm.overview(ctx);}
@Query()
@Allow(P.ManageGalleryCrm.Permission)
crmProfiles(@Ctx() ctx:RequestContext,@Args() args:any) {return this.crm.list(ctx,args.options);}
@Query()
@Allow(P.ManageGalleryCrm.Permission)
crmProfile(@Ctx() ctx:RequestContext,@Args() args:any) {return this.crm.detail(ctx,args.id);}
@Query()
@Allow(P.ManageGalleryCrm.Permission)
galleryDashboardStats(@Ctx() ctx:RequestContext,@Args() args:any) {return this.crm.stats(ctx);}
@Mutation()
@Transaction()
@Allow(P.ManageGallerySales.Permission)
createInquiry(@Ctx() ctx:RequestContext,@Args() args:any) {return this.sales.createInquiry(ctx,args.input);}
@Mutation()
@Transaction()
@Allow(P.ManageGallerySales.Permission)
updateInquiry(@Ctx() ctx:RequestContext,@Args() args:any) {return this.sales.updateInquiry(ctx,args.input);}
@Mutation()
@Transaction()
@Allow(P.ManageGallerySales.Permission)
archiveInquiry(@Ctx() ctx:RequestContext,@Args() args:any) {return this.sales.updateInquiry(ctx,{id:args.id,status:'archived'});}
@Mutation()
@Transaction()
@Allow(P.ManageGallerySales.Permission)
updatePrivatePurchase(@Ctx() ctx:RequestContext,@Args() args:any) {return this.sales.updatePurchase(ctx,args.input);}
@Mutation()
@Transaction()
@Allow(P.ManageGallerySales.Permission)
createPrivatePurchaseProposal(@Ctx() ctx:RequestContext,@Args() args:any) {return this.sales.proposal(ctx,args.input);}
@Mutation()
@Transaction()
@Allow(P.ManageGallerySales.Permission)
confirmPrivatePurchaseDelivery(@Ctx() ctx:RequestContext,@Args() args:any) {return this.sales.delivered(ctx,args.id);}
@Mutation()
@Transaction()
@Allow(P.ManageGalleryPayments.Permission)
createPaymentRequest(@Ctx() ctx:RequestContext,@Args() args:any) {return this.payments.create(ctx,args.input);}
@Mutation()
@Transaction()
@Allow(P.ManageGalleryPayments.Permission)
revokePaymentRequest(@Ctx() ctx:RequestContext,@Args() args:any) {return this.payments.revoke(ctx,args.id,args.reason);}
@Mutation()
@Transaction()
@Allow(P.ManageGalleryPayments.Permission)
resendPaymentRequest(@Ctx() ctx:RequestContext,@Args() args:any) {return this.payments.resend(ctx,args.id);}
@Mutation()
@Transaction()
@Allow(P.ManageGalleryPayments.Permission)
refundPaymentRequest(@Ctx() ctx:RequestContext,@Args() args:any) {return this.payments.refund(ctx,args.id,args.reason);}
@Mutation()
@Transaction()
@Allow(P.ManageGalleryContent.Permission)
createNotification(@Ctx() ctx:RequestContext,@Args() args:any) {return this.notificationService.save(ctx,args.input);}
@Mutation()
@Transaction()
@Allow(P.ManageGalleryContent.Permission)
updateNotification(@Ctx() ctx:RequestContext,@Args() args:any) {return this.notificationService.save(ctx,args.input);}
@Mutation()
@Transaction()
@Allow(P.ManageGalleryContent.Permission)
publishNotification(@Ctx() ctx:RequestContext,@Args() args:any) {return this.notificationService.status(ctx,args.id,'PUBLISHED');}
@Mutation()
@Transaction()
@Allow(P.ManageGalleryContent.Permission)
archiveNotification(@Ctx() ctx:RequestContext,@Args() args:any) {return this.notificationService.status(ctx,args.id,'ARCHIVED');}
@Mutation()
@Transaction()
@Allow(P.ManageGalleryContent.Permission)
publishContent(@Ctx() ctx:RequestContext,@Args() args:any) {return this.content.publish(ctx,args.id);}
@Mutation()
@Transaction()
@Allow(P.ManageGalleryContent.Permission)
archiveContent(@Ctx() ctx:RequestContext,@Args() args:any) {return this.content.archive(ctx,args.id);}
@Mutation()
@Transaction()
@Allow(P.ManageGalleryCrm.Permission)
updateCrmProfile(@Ctx() ctx:RequestContext,@Args() args:any) {return this.crm.update(ctx,args.input);}
@Mutation()
@Transaction()
@Allow(P.ManageGalleryContent.Permission)
saveContentPage(@Ctx() ctx:RequestContext,@Args() args:any) {return this.content.save(ctx,'page',args.input);}
@Mutation()
@Transaction()
@Allow(P.ManageGalleryContent.Permission)
savePressEntry(@Ctx() ctx:RequestContext,@Args() args:any) {return this.content.save(ctx,'press',args.input);}
@Mutation()
@Transaction()
@Allow(P.ManageGalleryContent.Permission)
saveTeamMember(@Ctx() ctx:RequestContext,@Args() args:any) {return this.content.save(ctx,'team',args.input);}
@Mutation()
@Transaction()
@Allow(P.ManageGalleryContent.Permission)
saveSiteSettings(@Ctx() ctx:RequestContext,@Args() args:any) {return this.content.save(ctx,'settings',args.input);}
@Mutation() @Transaction() @Allow(P.ManageGalleryMembership.Permission)
 async setMembershipStatus(@Ctx() ctx:RequestContext,@Args() args:any) {
 choice(args.status,['ACTIVE','PENDING','SUSPENDED'],'MEMBERSHIP_STATUS');
 choice(args.tier,['COLLECTOR','VIP','APPLICANT'],'MEMBERSHIP_TIER');
 const result=await this.customers.update(ctx,{id:args.customerId,customFields:{membershipStatus:args.status,membershipTier:args.tier}});
 if('errorCode' in result)throw galleryUpstreamError('更新會員狀態', result.errorCode); return result;
 }
}
