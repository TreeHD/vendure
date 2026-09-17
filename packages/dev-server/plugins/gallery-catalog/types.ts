import { Asset } from '@vendure/core';

import { Artist } from './entities/artist.entity';

declare module '@vendure/core/dist/entity/custom-entity-fields' {
    interface CustomProductFields {
        legacyArtworkId?: string;
        artists?: Artist[];
        yearText?: string;
        dimensionsText?: string;
        material?: string;
        seals?: string;
        inscriptions?: string;
        collectionStory?: string;
        highResolutionAsset?: Asset;
        privateOriginalAsset?: Asset;
        isDirectPurchase: boolean;
        priceVisibility: 'PUBLIC' | 'INQUIRY';
        sourceReferences?: string;
        verificationStatus?: 'UNVERIFIED' | 'VERIFIED';
    }

    interface CustomCustomerFields {
        birthday?: string;
        gender?: 'FEMALE' | 'MALE' | 'NON_BINARY' | 'PREFER_NOT_TO_SAY';
        preferredLanguage?: 'zh_Hant' | 'en';
        membershipStatus: 'ACTIVE' | 'PENDING' | 'SUSPENDED';
        membershipTier: 'COLLECTOR' | 'VIP' | 'APPLICANT';
    }

    interface CustomAssetFields {
        alt?: string;
        rights?: string;
        visibility: 'PUBLIC' | 'PRIVATE';
    }
}
