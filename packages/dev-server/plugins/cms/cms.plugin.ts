import { PluginCommonModule, VendurePlugin } from '@vendure/core';

import { CmsAdminResolver } from './admin.resolver';
import { adminApiExtensions, shopApiExtensions } from './api-extensions';
import { CmsService } from './cms.service';
import { CmsArticleContentResolver, CmsArticleTranslationContentResolver } from './content.resolver';
import { CmsArticleTranslation } from './entities/cms-article-translation.entity';
import { CmsArticle } from './entities/cms-article.entity';
import { CmsCategoryTranslation } from './entities/cms-category-translation.entity';
import { CmsCategory } from './entities/cms-category.entity';
import { cmsPermissions } from './permissions';
import { CmsShopResolver } from './shop.resolver';

@VendurePlugin({
    compatibility: '^3.7.0',
    imports: [PluginCommonModule],
    entities: [CmsArticle, CmsArticleTranslation, CmsCategory, CmsCategoryTranslation],
    providers: [CmsService],
    exports: [CmsService],
    adminApiExtensions: {
        schema: adminApiExtensions,
        resolvers: [CmsAdminResolver, CmsArticleContentResolver, CmsArticleTranslationContentResolver],
    },
    shopApiExtensions: {
        schema: shopApiExtensions,
        resolvers: [CmsShopResolver, CmsArticleContentResolver, CmsArticleTranslationContentResolver],
    },
    configuration: config => {
        config.authOptions.customPermissions.push(...cmsPermissions);
        return config;
    },
})
export class CmsPlugin {}
