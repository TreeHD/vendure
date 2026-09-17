import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Changes artwork_view from a latest-view snapshot into an append-only event
 * table. Existing snapshot rows are retained as the first recorded event for
 * each customer, channel and artwork.
 */
export class GalleryCollectorViewEvents1788750620675 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_f8059073f998503b986833c2cc"`);
        await queryRunner.query(
            `CREATE INDEX "IDX_artwork_view_customer_channel_last_viewed" ON "artwork_view" ("customerId", "channelId", "lastViewedAt")`,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_artwork_view_customer_channel_product" ON "artwork_view" ("customerId", "channelId", "productId")`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_artwork_view_customer_channel_product"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_artwork_view_customer_channel_last_viewed"`);
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_f8059073f998503b986833c2cc" ON "artwork_view" ("customerId", "channelId", "productId")`,
        );
    }
}
