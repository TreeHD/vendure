import {
    Asset,
    DeepPartial,
    EntityId,
    ID,
    LocaleString,
    Translatable,
    Translation,
    VendureEntity,
} from '@vendure/core';
import { Column, Entity, Index, ManyToOne, OneToMany, Relation } from 'typeorm';

import { ArtistTranslation } from './artist-translation.entity';

export type ArtistStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';

@Entity()
export class Artist extends VendureEntity implements Translatable {
    constructor(input?: DeepPartial<Artist>) {
        super(input);
    }

    @Index({ unique: true })
    @Column()
    slug: string;

    @Index()
    @Column('varchar', { nullable: true })
    legacyArtistId: string | null;

    name: LocaleString;
    quote: LocaleString;
    summary: LocaleString;
    lineageTitle: LocaleString;
    lineageParagraph1: LocaleString;
    lineageParagraph2: LocaleString;
    exhibitionSummary: LocaleString;
    seoTitle: LocaleString;
    seoDescription: LocaleString;

    @Column('varchar', { default: 'DRAFT' })
    status: ArtistStatus;

    @Column({ type: Date, nullable: true })
    publishedAt: Date | null;

    @Column({ default: 0 })
    sortOrder: number;

    @Column('varchar', { nullable: true })
    templateKey: string | null;

    @Column('simple-json', { nullable: true })
    contentBlocks: Array<Record<string, unknown>> | null;

    @ManyToOne(() => Asset, { nullable: true, onDelete: 'SET NULL' })
    avatarAsset: Relation<Asset> | null;

    @EntityId({ nullable: true })
    avatarAssetId: ID | null;

    @ManyToOne(() => Asset, { nullable: true, onDelete: 'SET NULL' })
    heroAsset: Relation<Asset> | null;

    @EntityId({ nullable: true })
    heroAssetId: ID | null;

    @OneToMany(() => ArtistTranslation, translation => translation.base, { eager: true })
    translations: Array<Translation<Artist>>;
}
