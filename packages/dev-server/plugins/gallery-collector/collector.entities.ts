import { Channel, Customer, EntityId, ID, Product, VendureEntity } from '@vendure/core';
import { Column, Entity, Index, ManyToOne, Relation } from 'typeorm';

export abstract class CollectorArtworkRecord extends VendureEntity {
    constructor() {
        super();
    }

    @ManyToOne(() => Customer, { onDelete: 'CASCADE', nullable: false })
    customer: Relation<Customer>;

    @ManyToOne(() => Product, { onDelete: 'CASCADE', nullable: false })
    product: Relation<Product>;

    @ManyToOne(() => Channel, { onDelete: 'CASCADE', nullable: false })
    channel: Relation<Channel>;
}

@Entity()
@Index(['customerId', 'channelId', 'productId'], { unique: true })
export class FavoriteArtwork extends CollectorArtworkRecord {
    @EntityId() customerId: ID;
    @EntityId() productId: ID;
    @EntityId() channelId: ID;
}

@Entity()
@Index('IDX_artwork_view_customer_channel_last_viewed', ['customerId', 'channelId', 'lastViewedAt'])
@Index('IDX_artwork_view_customer_channel_product', ['customerId', 'channelId', 'productId'])
export class ArtworkView extends CollectorArtworkRecord {
    @EntityId() customerId: ID;
    @EntityId() productId: ID;
    @EntityId() channelId: ID;
    @Column() lastViewedAt: Date;
    @Column({ type: 'varchar', length: 64, nullable: true }) sourceCode: string | null;
    @Column({ type: 'varchar', length: 2048, nullable: true }) sourcePath: string | null;
}
