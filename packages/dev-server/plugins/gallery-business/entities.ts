import { Channel, Customer, EntityId, ID, VendureEntity } from '@vendure/core';
import { Column, Entity, Index, ManyToOne, Relation } from 'typeorm';

export abstract class GalleryChannelEntity extends VendureEntity {
    constructor() { super(); }
    @Column({ type: 'int' }) channelId: ID;
    @ManyToOne(() => Channel, { onDelete: 'CASCADE' }) channel: Relation<Channel>;
}
export abstract class GalleryCustomerEntity extends GalleryChannelEntity {
    @Column({ type: 'int', nullable: true }) customerId: ID | null;
    @ManyToOne(() => Customer, { nullable: true, onDelete: 'SET NULL' }) customer: Relation<Customer>;
}
@Entity()
@Index(['channelId', 'status', 'createdAt'])
export class GalleryInquiry extends GalleryCustomerEntity {
    @Column() code: string;
    @Column() type: string;
    @EntityId({ nullable: true }) productId: ID | null;
    @Column() contactName: string;
    @Column() emailAddress: string;
    @Column({ default: '' }) phoneNumber: string;
    @Column() subject: string;
    @Column('text') message: string;
    @Column({ default: 'pending' }) status: string;
    @Column({ default: 'zh_Hant' }) languageCode: string;
    @Column({ default: '' }) sourcePath: string;
    @EntityId({ nullable: true }) assignedAdministratorId: ID | null;
    @Column({ type: 'text', default: '' }) internalNote: string;
}
@Entity()
@Index(['channelId', 'customerId', 'createdAt'])
export class GalleryPrivatePurchase extends GalleryCustomerEntity {
    @Column() code: string;
    @EntityId() productId: ID;
    @Column() artworkTitle: string;
    @Column() contactName: string;
    @Column() emailAddress: string;
    @Column() phoneNumber: string;
    @Column({ default: 'email' }) preferredContactMethod: string;
    @Column('text') message: string;
    @Column({ default: 'zh_Hant' }) languageCode: string;
    @Column({ default: 'submitted' }) status: string;
    @EntityId({ nullable: true }) assignedAdministratorId: ID | null;
    @Column({ type: 'text', default: '' }) internalNote: string;
    @Column({ type: 'varchar', nullable: true }) claimTokenHash: string | null;
    @Column({ type: Date, nullable: true }) claimExpiresAt: Date | null;
    @Column({ type: Date, nullable: true }) deliveredAt: Date | null;
    @EntityId({ nullable: true }) orderId: ID | null;
}
@Entity()
@Index(['channelId', 'purchaseId', 'version'], { unique: true })
export class GalleryProposal extends GalleryChannelEntity {
    @EntityId() purchaseId: ID;
    @Column() version: number;
    @Column('text') summary: string;
    @Column() amount: number;
    @Column() depositAmount: number;
    @Column({ default: 'TWD' }) currencyCode: string;
    @Column() depositDueAt: Date;
    @Column() balanceDueAt: Date;
}
@Entity()
@Index(['channelId', 'purchaseId', 'createdAt'])
export class GalleryCaseTransition extends GalleryChannelEntity {
    @EntityId() purchaseId: ID;
    @Column() fromStatus: string;
    @Column() toStatus: string;
    @EntityId({ nullable: true }) actorUserId: ID | null;
    @Column({ type: 'text', default: '' }) reason: string;
}
@Entity()
@Index(['tokenHash'], { unique: true })
@Index(['channelId', 'purchaseId', 'stage'])
export class GalleryPaymentRequest extends GalleryChannelEntity {
    @EntityId() purchaseId: ID;
    @EntityId() proposalId: ID;
    @EntityId() orderId: ID;
    @Column() stage: string;
    @Column() amount: number;
    @Column({ default: 'TWD' }) currencyCode: string;
    @Column() tokenHash: string;
    @Column() expiresAt: Date;
    @Column({ default: 'pending' }) status: string;
    @Column({ type: 'varchar', nullable: true }) stripeSessionId: string | null;
    @Column({ type: 'varchar', nullable: true }) stripePaymentIntentId: string | null;
    @EntityId({ nullable: true }) paymentId: ID | null;
    @Column({ default: 0 }) refundedAmount: number;
    @Column({ type: 'text', default: '' }) reason: string;
}
@Entity()
@Index(['channelId', 'productId'], { unique: true })
export class GalleryReservation extends GalleryChannelEntity {
    @EntityId() productId: ID;
    @EntityId() purchaseId: ID;
    @Column() expiresAt: Date;
    @Column({ default: false }) depositPaid: boolean;
}
@Entity()
@Index(['eventId'], { unique: true })
export class GalleryStripeEvent extends VendureEntity {
    constructor() { super(); }
    @Column() eventId: string;
    @Column() type: string;
    @Column({ type: 'text' }) payload: string;
    @Column({ default: 'pending' }) status: string;
    @Column({ type: 'text', default: '' }) error: string;
}
@Entity()
@Index(['channelId', 'status', 'publishedAt'])
export class GalleryNotification extends GalleryChannelEntity {
    @Column({ default: 'DRAFT' }) status: string;
    @Column({ default: 'ALL' }) audience: string;
    @Column('simple-json') translations: Array<{ languageCode: string; title: string; body: string; category: string }>;
    @Column('simple-json') recipientIds: string[];
    @Column({ type: Date, nullable: true }) publishedAt: Date | null;
    @Column({ default: '' }) actionPath: string;
    @Column({ type: 'varchar', nullable: true, unique: true }) eventKey: string | null;
}
@Entity()
@Index(['channelId', 'notificationId', 'customerId'], { unique: true })
export class GalleryNotificationRead extends GalleryCustomerEntity {
    @EntityId() notificationId: ID;
}
@Entity()
@Index(['channelId', 'kind', 'key'], { unique: true })
export class GalleryContent extends GalleryChannelEntity {
    @Column() kind: string;
    @Column() key: string;
    @Column({ default: 'draft' }) status: string;
    @Column({ default: 0 }) sortOrder: number;
    @Column('simple-json') draft: Record<string, any>;
    @Column({ type: 'simple-json', nullable: true }) published: Record<string, any> | null;
    @Column({ type: Date, nullable: true }) publishedAt: Date | null;
}
@Entity()
@Index(['channelId', 'identityKey'], { unique: true })
export class GalleryCrmProfile extends GalleryCustomerEntity {
    @Column() identityKey: string;
    @Column({ default: '' }) name: string;
    @Column({ default: '' }) email: string;
    @Column({ default: '' }) phone: string;
    @Column({ default: 'new' }) stage: string;
    @EntityId({ nullable: true }) assignedAdministratorId: ID | null;
    @Column({ type: 'text', default: '' }) notes: string;
    @Column({ type: Date, nullable: true }) lastContactAt: Date | null;
    @Column() lastSeenAt: Date;
}
@Entity()
@Index(['channelId', 'profileId', 'createdAt'])
export class GalleryAnalyticsEvent extends GalleryChannelEntity {
    @EntityId() profileId: ID;
    @Column() eventType: string;
    @Column() path: string;
    @EntityId({ nullable: true }) productId: ID | null;
    @EntityId({ nullable: true }) artistId: ID | null;
    @Column('simple-json') metadata: Record<string, string | number | boolean | null>;
    @Column({ type: 'varchar', nullable: true, unique: true }) viewKey: string | null;
}
@Entity()
export class GalleryMailOutbox extends GalleryChannelEntity {
    @Column() recipient: string;
    @Column() subject: string;
    @Column('text') body: string;
    @Column({ default: 'pending' }) status: string;
}
export const businessEntities = [GalleryInquiry, GalleryPrivatePurchase, GalleryProposal, GalleryCaseTransition,
    GalleryPaymentRequest, GalleryReservation, GalleryStripeEvent, GalleryNotification, GalleryNotificationRead,
    GalleryContent, GalleryCrmProfile, GalleryAnalyticsEvent, GalleryMailOutbox];
