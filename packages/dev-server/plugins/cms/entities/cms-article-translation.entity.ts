import { DeepPartial, LanguageCode, Translation, VendureEntity } from '@vendure/core';
import { Column, Entity, Index, ManyToOne, Relation } from 'typeorm';

import { CmsArticle } from './cms-article.entity';

@Entity()
@Index(['languageCode', 'slug'], { unique: true })
export class CmsArticleTranslation extends VendureEntity implements Translation<CmsArticle> {
    constructor(input?: DeepPartial<Translation<CmsArticle>>) {
        super(input);
    }

    @Column('varchar') languageCode: LanguageCode;
    @Column('varchar') title: string;
    @Column('varchar') slug: string;
    @Column('text', { default: '' }) excerpt: string;
    @Column('text') content: string;
    @Column('varchar', { default: '' }) seoTitle: string;
    @Column('text', { default: '' }) seoDescription: string;

    @Index()
    @ManyToOne(() => CmsArticle, base => base.translations, { onDelete: 'CASCADE' })
    base: Relation<CmsArticle>;
}
