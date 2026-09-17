import {
    Channel,
    ChannelAware,
    DeepPartial,
    LocaleString,
    Translatable,
    Translation,
    VendureEntity,
} from '@vendure/core';
import { Entity, JoinTable, ManyToMany, OneToMany, Relation } from 'typeorm';

import { CmsArticle } from './cms-article.entity';
import { CmsCategoryTranslation } from './cms-category-translation.entity';

@Entity()
export class CmsCategory extends VendureEntity implements Translatable, ChannelAware {
    constructor(input?: DeepPartial<CmsCategory>) {
        super(input);
    }

    name: LocaleString;
    slug: LocaleString;
    description: LocaleString;

    @OneToMany(() => CmsCategoryTranslation, translation => translation.base, { eager: true })
    translations: Array<Translation<CmsCategory>>;

    @OneToMany(() => CmsArticle, article => article.category)
    articles: Relation<CmsArticle[]>;

    @ManyToMany(() => Channel)
    @JoinTable()
    channels: Channel[];
}
