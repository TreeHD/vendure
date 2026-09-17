import { DeepPartial, LanguageCode, Translation, VendureEntity } from '@vendure/core';
import { Column, Entity, Index, ManyToOne, Relation } from 'typeorm';

import { Artist } from './artist.entity';

@Entity()
export class ArtistTranslation extends VendureEntity implements Translation<Artist> {
    constructor(input?: DeepPartial<Translation<Artist>>) {
        super(input);
    }

    @Column('varchar')
    languageCode: LanguageCode;

    @Column() name: string;
    @Column({ default: '' }) quote: string;
    @Column('text', { default: '' }) summary: string;
    @Column({ default: '' }) lineageTitle: string;
    @Column('text', { default: '' }) lineageParagraph1: string;
    @Column('text', { default: '' }) lineageParagraph2: string;
    @Column('text', { default: '' }) exhibitionSummary: string;
    @Column({ default: '' }) seoTitle: string;
    @Column('text', { default: '' }) seoDescription: string;

    @Index()
    @ManyToOne(() => Artist, base => base.translations, { onDelete: 'CASCADE' })
    base: Relation<Artist>;
}
