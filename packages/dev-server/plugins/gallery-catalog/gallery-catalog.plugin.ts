import { LanguageCode } from '@vendure/common/lib/generated-types';
import { Asset, PluginCommonModule, VendurePlugin } from '@vendure/core';

import { adminApiExtensions, shopApiExtensions } from './api/api-extensions';
import { GalleryAdminResolver } from './api/gallery-admin.resolver';
import { GalleryShopResolver } from './api/gallery-shop.resolver';
import { GalleryOrderInterceptor } from './config/gallery-order-interceptor';
import { ArtistTranslation } from './entities/artist-translation.entity';
import { Artist } from './entities/artist.entity';
import { ArtistAdminService } from './services/artist-admin.service';
import { GalleryCatalogService } from './services/gallery-catalog.service';
import { GalleryConfigurationService } from './services/gallery-configuration.service';
import { GalleryPricePolicyService } from './services/gallery-price-policy.service';
import './types';

const label = (zh: string, en: string) => [
    { languageCode: LanguageCode.zh_Hant, value: zh },
    { languageCode: LanguageCode.en, value: en },
];

@VendurePlugin({
    compatibility: '^3.7.0',
    imports: [PluginCommonModule],
    entities: [Artist, ArtistTranslation],
    exports: [GalleryCatalogService],
    providers: [
        GalleryCatalogService,
        ArtistAdminService,
        GalleryConfigurationService,
        GalleryPricePolicyService,
    ],
    shopApiExtensions: { schema: shopApiExtensions, resolvers: [GalleryShopResolver] },
    adminApiExtensions: { schema: adminApiExtensions, resolvers: [GalleryAdminResolver] },
    configuration: config => {
        config.customFields.Product.push(
            {
                name: 'legacyArtworkId',
                type: 'string',
                nullable: true,
                public: false,
                label: label('舊作品 ID', 'Legacy artwork ID'),
            },
            {
                name: 'artists',
                type: 'relation',
                list: true,
                entity: Artist,
                graphQLType: 'GalleryArtist',
                public: false,
                label: label('藝術家', 'Artists'),
            },
            { name: 'yearText', type: 'string', nullable: true, public: true, label: label('年代', 'Year') },
            {
                name: 'dimensionsText',
                type: 'string',
                nullable: true,
                public: true,
                label: label('尺寸', 'Dimensions'),
            },
            {
                name: 'material',
                type: 'localeString',
                nullable: true,
                public: true,
                label: label('材質', 'Material'),
            },
            {
                name: 'seals',
                type: 'localeText',
                nullable: true,
                public: true,
                label: label('印章', 'Seals'),
            },
            {
                name: 'inscriptions',
                type: 'localeText',
                nullable: true,
                public: true,
                label: label('題識', 'Inscriptions'),
            },
            {
                name: 'collectionStory',
                type: 'localeText',
                nullable: true,
                public: true,
                label: label('收藏故事', 'Collection story'),
            },
            {
                name: 'highResolutionAsset',
                type: 'relation',
                entity: Asset,
                graphQLType: 'Asset',
                nullable: true,
                public: false,
                label: label('公開高解析圖', 'Public high-resolution image'),
            },
            {
                name: 'privateOriginalAsset',
                type: 'relation',
                entity: Asset,
                graphQLType: 'Asset',
                nullable: true,
                public: false,
                label: label('保密原檔', 'Private original'),
            },
            {
                name: 'isDirectPurchase',
                type: 'boolean',
                defaultValue: false,
                public: true,
                label: label('可直接購買', 'Direct purchase'),
            },
            {
                name: 'priceVisibility',
                type: 'string',
                defaultValue: 'INQUIRY',
                public: false,
                options: [
                    { value: 'PUBLIC', label: label('公開', 'Public') },
                    { value: 'INQUIRY', label: label('洽詢', 'Inquiry') },
                ],
                label: label('價格可見性', 'Price visibility'),
            },
            {
                name: 'sourceReferences',
                type: 'text',
                nullable: true,
                public: false,
                label: label('來源參考', 'Source references'),
            },
            {
                name: 'verificationStatus',
                type: 'string',
                defaultValue: 'UNVERIFIED',
                public: false,
                options: [
                    { value: 'UNVERIFIED', label: label('未核實', 'Unverified') },
                    { value: 'VERIFIED', label: label('已核實', 'Verified') },
                ],
                label: label('核實狀態', 'Verification status'),
            },
        );
        config.customFields.Customer.push(
            {
                name: 'birthday',
                type: 'string',
                nullable: true,
                pattern: '^\\d{4}-\\d{2}-\\d{2}$',
                public: true,
                label: label('生日', 'Birthday'),
            },
            {
                name: 'gender',
                type: 'string',
                nullable: true,
                public: true,
                label: label('性別', 'Gender'),
                options: ['FEMALE', 'MALE', 'NON_BINARY', 'PREFER_NOT_TO_SAY'].map(value => ({ value })),
            },
            {
                name: 'preferredLanguage',
                type: 'string',
                nullable: true,
                public: true,
                label: label('偏好語言', 'Preferred language'),
                options: [{ value: 'zh_Hant' }, { value: 'en' }],
            },
            {
                name: 'membershipStatus',
                type: 'string',
                defaultValue: 'PENDING',
                public: false,
                label: label('會員狀態', 'Membership status'),
                options: ['ACTIVE', 'PENDING', 'SUSPENDED'].map(value => ({ value })),
            },
            {
                name: 'membershipTier',
                type: 'string',
                defaultValue: 'APPLICANT',
                public: false,
                label: label('會員級別', 'Membership tier'),
                options: ['COLLECTOR', 'VIP', 'APPLICANT'].map(value => ({ value })),
            },
        );
        config.customFields.Asset.push(
            {
                name: 'alt',
                type: 'localeString',
                nullable: true,
                public: true,
                label: label('替代文字', 'Alt text'),
            },
            {
                name: 'rights',
                type: 'text',
                nullable: true,
                public: false,
                label: label('授權資訊', 'Rights'),
            },
            {
                name: 'visibility',
                type: 'string',
                defaultValue: 'PUBLIC',
                public: false,
                options: [{ value: 'PUBLIC' }, { value: 'PRIVATE' }],
                label: label('可見性', 'Visibility'),
            },
        );
        config.orderOptions.orderInterceptors.push(new GalleryOrderInterceptor());
        return config;
    },
})
export class GalleryCatalogPlugin {}
