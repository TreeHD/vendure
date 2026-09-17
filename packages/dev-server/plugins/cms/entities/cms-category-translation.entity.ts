import { DeepPartial, LanguageCode, Translation, VendureEntity } from '@vendure/core';
import { Column, Entity, Index, ManyToOne, Relation } from 'typeorm';

import { CmsCategory } from './cms-category.entity';

@Entity()
@Index(['languageCode', 'slug'], { unique: true })
export class CmsCategoryTranslation extends VendureEntity implements Translation<CmsCategory> {
    constructor(input?: DeepPartial<Translation<CmsCategory>>) {
        super(input);
    }

    @Column('varchar')
    languageCode: LanguageCode;

    @Column('varchar') name: string;
    @Column('varchar')
    slug: string;
    @Column('text', { default: '' }) description: string;

    @Index()
    @ManyToOne(() => CmsCategory, base => base.translations, { onDelete: 'CASCADE' })
    base: Relation<CmsCategory>;
}
