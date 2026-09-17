import { Parent, ResolveField, Resolver } from '@nestjs/graphql';
import { Ctx, RequestContext } from '@vendure/core';
import { GallerySalesService } from './sales.service';
import { GalleryCrmService } from './crm.service';
@Resolver('GalleryPrivatePurchase')
export class GalleryPurchaseFields {
 constructor(private sales:GallerySalesService){}
 private detail(ctx:RequestContext,parent:any){return parent.proposals?parent:this.sales.purchase(ctx,parent.id);}
 @ResolveField() async proposals(@Ctx() ctx:RequestContext,@Parent() p:any){return (await this.detail(ctx,p)).proposals;}
 @ResolveField() async paymentRequests(@Ctx() ctx:RequestContext,@Parent() p:any){return (await this.detail(ctx,p)).paymentRequests;}
 @ResolveField() async totalAmount(@Ctx() ctx:RequestContext,@Parent() p:any){return (await this.detail(ctx,p)).totalAmount;}
 @ResolveField() async paidAmount(@Ctx() ctx:RequestContext,@Parent() p:any){return (await this.detail(ctx,p)).paidAmount;}
 @ResolveField() async refundedAmount(@Ctx() ctx:RequestContext,@Parent() p:any){return (await this.detail(ctx,p)).refundedAmount;}
 @ResolveField() async remainingAmount(@Ctx() ctx:RequestContext,@Parent() p:any){return (await this.detail(ctx,p)).remainingAmount;}
}
@Resolver('GalleryCrmProfile')
export class GalleryCrmFields {
 constructor(private crm:GalleryCrmService){}
 @ResolveField() async eventCount(@Ctx() ctx:RequestContext,@Parent() p:any){return (await this.crm.detail(ctx,p.id)).eventCount;}
 @ResolveField() async recentEvents(@Ctx() ctx:RequestContext,@Parent() p:any){return (await this.crm.detail(ctx,p.id)).recentEvents;}
}
