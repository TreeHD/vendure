import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { CurrencyCode, LanguageCode } from '@vendure/common/lib/generated-types';
import {
    ChannelService,
    GlobalSettingsService,
    ProductVariantPrice,
    RequestContext,
    TransactionalConnection,
} from '@vendure/core';

@Injectable()
export class GalleryConfigurationService implements OnApplicationBootstrap {
    constructor(
        private globalSettingsService: GlobalSettingsService,
        private channelService: ChannelService,
        private connection: TransactionalConnection,
    ) {}

    async onApplicationBootstrap() {
        const ctx = RequestContext.empty();
        const channel = await this.channelService.getDefaultChannel();
        // Changing Channel currency relabels existing prices; it does not convert their amounts.
        if (
            channel.defaultCurrencyCode !== CurrencyCode.TWD &&
            (await this.connection
                .getRepository(ctx, ProductVariantPrice)
                .count({ where: { channelId: channel.id } }))
        ) {
            throw new Error('Gallery setup requires an empty channel before changing its currency to TWD.');
        }
        const settings = await this.globalSettingsService.getSettings(ctx);
        await this.globalSettingsService.updateSettings(ctx, {
            availableLanguages: [
                ...new Set([...settings.availableLanguages, LanguageCode.zh_Hant, LanguageCode.en]),
            ],
        });
        const result = await this.channelService.update(ctx, {
            id: channel.id,
            defaultLanguageCode: LanguageCode.zh_Hant,
            availableLanguageCodes: [LanguageCode.zh_Hant, LanguageCode.en],
            defaultCurrencyCode: CurrencyCode.TWD,
            availableCurrencyCodes: [CurrencyCode.TWD],
        });
        if ('errorCode' in result) {
            throw new Error(`Could not configure the gallery channel: ${result.message}`);
        }
    }
}
