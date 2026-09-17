import { MigrationInterface, QueryRunner } from 'typeorm';

export class GalleryCollector1788750620674 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<any> {
        await queryRunner.query(
            `CREATE TABLE "favorite_artwork" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "id" SERIAL NOT NULL, "customerId" integer NOT NULL, "productId" integer NOT NULL, "channelId" integer NOT NULL, CONSTRAINT "PK_36ca72bb67894da17395d73f847" PRIMARY KEY ("id"))`,
            undefined,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_674695965df10baac05235ba70" ON "favorite_artwork" ("customerId", "channelId", "productId") `,
            undefined,
        );
        await queryRunner.query(
            `CREATE TABLE "artwork_view" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "lastViewedAt" TIMESTAMP NOT NULL, "sourceCode" character varying(64), "sourcePath" character varying(2048), "id" SERIAL NOT NULL, "customerId" integer NOT NULL, "productId" integer NOT NULL, "channelId" integer NOT NULL, CONSTRAINT "PK_ea7a8161e25baf91cbac1cd1107" PRIMARY KEY ("id"))`,
            undefined,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_f8059073f998503b986833c2cc" ON "artwork_view" ("customerId", "channelId", "productId") `,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "favorite_artwork" ADD CONSTRAINT "FK_bbe54b716db129bef9903747738" FOREIGN KEY ("customerId") REFERENCES "customer"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "favorite_artwork" ADD CONSTRAINT "FK_4a9ea8a2dd3a3b7b533f6a708de" FOREIGN KEY ("productId") REFERENCES "product"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "favorite_artwork" ADD CONSTRAINT "FK_9baf882d25f7be58d513ef1abfd" FOREIGN KEY ("channelId") REFERENCES "channel"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "artwork_view" ADD CONSTRAINT "FK_bee015c9d45670ee150a9b2278d" FOREIGN KEY ("customerId") REFERENCES "customer"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "artwork_view" ADD CONSTRAINT "FK_d0545343024316f4b5fe48a24ba" FOREIGN KEY ("productId") REFERENCES "product"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "artwork_view" ADD CONSTRAINT "FK_a7391048fab20dbbd6e96977269" FOREIGN KEY ("channelId") REFERENCES "channel"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
            undefined,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<any> {
        await queryRunner.query(
            `ALTER TABLE "artwork_view" DROP CONSTRAINT "FK_a7391048fab20dbbd6e96977269"`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "artwork_view" DROP CONSTRAINT "FK_d0545343024316f4b5fe48a24ba"`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "artwork_view" DROP CONSTRAINT "FK_bee015c9d45670ee150a9b2278d"`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "favorite_artwork" DROP CONSTRAINT "FK_9baf882d25f7be58d513ef1abfd"`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "favorite_artwork" DROP CONSTRAINT "FK_4a9ea8a2dd3a3b7b533f6a708de"`,
            undefined,
        );
        await queryRunner.query(
            `ALTER TABLE "favorite_artwork" DROP CONSTRAINT "FK_bbe54b716db129bef9903747738"`,
            undefined,
        );
        await queryRunner.query(`DROP INDEX "public"."IDX_f8059073f998503b986833c2cc"`, undefined);
        await queryRunner.query(`DROP TABLE "artwork_view"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_674695965df10baac05235ba70"`, undefined);
        await queryRunner.query(`DROP TABLE "favorite_artwork"`, undefined);
    }
}
