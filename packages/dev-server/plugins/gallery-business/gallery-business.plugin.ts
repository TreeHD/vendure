import { PluginCommonModule, VendurePlugin } from '@vendure/core';
import { raw } from 'express';
import { GalleryCatalogPlugin } from '../gallery-catalog/gallery-catalog.plugin';
import { GalleryAccess } from './common';
import { businessEntities } from './entities';
import { GalleryContentService, GalleryNotificationService } from './content.service';
import { GalleryCrmService } from './crm.service';
import { GallerySalesService } from './sales.service';
import { GalleryPaymentService, galleryStripeHandler } from './payment.service';
import { GalleryBusinessShopResolver } from './shop.resolver';
import { GalleryBusinessAdminResolver } from './admin.resolver';
import { GalleryPurchaseFields, GalleryCrmFields } from './fields.resolver';
import { shopSchema, adminSchema } from './schema';
import { businessPermissions } from './permissions';
import { GalleryOrderAccess, GalleryStripeController, galleryBackgroundTask, privateOrderProcess } from './runtime';
@VendurePlugin({
    compatibility:'^3.7.0',imports:[PluginCommonModule,GalleryCatalogPlugin],entities:businessEntities,
    providers:[GalleryAccess,GalleryContentService,GalleryNotificationService,GalleryCrmService,GallerySalesService,GalleryPaymentService],
    exports:[GalleryCrmService],controllers:[GalleryStripeController],
    shopApiExtensions:{schema:shopSchema,resolvers:[GalleryBusinessShopResolver,GalleryPurchaseFields]},
    adminApiExtensions:{schema:adminSchema,resolvers:[GalleryBusinessAdminResolver,GalleryPurchaseFields,GalleryCrmFields]},
    dashboard:'./dashboard/index.tsx',
    configuration:config=>{
        config.authOptions.customPermissions.push(...businessPermissions);
        config.customFields.Order.push({name:'galleryPrivatePurchaseId',type:'string',nullable:true,public:false,readonly:true});
        // Replace the default process rather than relying on object identity. Vendure
        // may clone the default process while composing the application config.
        config.orderOptions.process=[privateOrderProcess()];
        config.orderOptions.orderByCodeAccessStrategy=new GalleryOrderAccess();
        config.paymentOptions.paymentMethodHandlers.push(galleryStripeHandler);
        config.schedulerOptions.tasks.push(galleryBackgroundTask);
        config.apiOptions.middleware.push({route:'/payments/stripe/webhook',beforeListen:true,handler:raw({type:'application/json',limit:'1mb'})});
        return config;
    },
})
export class GalleryBusinessPlugin {}
