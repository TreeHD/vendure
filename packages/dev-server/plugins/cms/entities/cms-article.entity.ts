import {
    Asset,
    Channel,
    ChannelAware,
    DeepPartial,
    EntityId,
    ID,
    LocaleString,
    Translatable,
    Translation,
    VendureEntity,
} from '@vendure/core';
import { Column, Entity, Index, JoinTable, ManyToMany, ManyToOne, OneToMany, Relation } from 'typeorm';

import { CmsArticleStatus } from '../types';
import { CmsArticleTranslation } from './cms-article-translation.entity';
import { CmsCategory } from './cms-category.entity';

@Entity()
@Index(['status', 'publishedAt'])
export class CmsArticle extends VendureEntity implements Translatable, ChannelAware {
    constructor(input?: DeepPartial<CmsArticle>) {
        super(input);
    }

    title: LocaleString;
    slug: LocaleString;
    excerpt: LocaleString;
    content: LocaleString;
    seoTitle: LocaleString;
    seoDescription: LocaleString;

    @Column('varchar', { default: 'DRAFT' })
    status: CmsArticleStatus;

    @Column({ type: Date, nullable: true })
    publishedAt: Date | null;

    @ManyToOne(() => Asset, { nullable: true, onDelete: 'SET NULL' })
    featuredAsset: Relation<Asset> | null;

    @EntityId({ nullable: true })
    featuredAssetId: ID | null;

    @ManyToOne(() => CmsCategory, category => category.articles, { nullable: true, onDelete: 'SET NULL' })
    category: Relation<CmsCategory> | null;

    @EntityId({ nullable: true })
    categoryId: ID | null;

    @OneToMany(() => CmsArticleTranslation, translation => translation.base, { eager: true })
    translations: Array<Translation<CmsArticle>>;

    @ManyToMany(() => Channel)
    @JoinTable()
    channels: Channel[];
}
