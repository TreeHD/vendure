import { MigrationInterface, QueryRunner } from 'typeorm';

/** CMS tables. PostgreSQL is the production database for this application. */
export class CmsPlugin1789200000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `CREATE TABLE "cms_category" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "id" SERIAL NOT NULL, CONSTRAINT "PK_cms_category" PRIMARY KEY ("id"))`,
        );
        await queryRunner.query(
            `CREATE TABLE "cms_category_translation" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "languageCode" character varying NOT NULL, "name" character varying NOT NULL, "slug" character varying NOT NULL, "description" text NOT NULL DEFAULT '', "id" SERIAL NOT NULL, "baseId" integer, CONSTRAINT "PK_cms_category_translation" PRIMARY KEY ("id"))`,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_cms_category_translation_language_slug" ON "cms_category_translation" ("languageCode", "slug")`,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_cms_category_translation_base" ON "cms_category_translation" ("baseId")`,
        );
        await queryRunner.query(
            `CREATE TABLE "cms_category_channels_channel" ("cmsCategoryId" integer NOT NULL, "channelId" integer NOT NULL, CONSTRAINT "PK_cms_category_channels" PRIMARY KEY ("cmsCategoryId", "channelId"))`,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_cms_category_channels_category" ON "cms_category_channels_channel" ("cmsCategoryId")`,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_cms_category_channels_channel" ON "cms_category_channels_channel" ("channelId")`,
        );
        await queryRunner.query(
            `CREATE TABLE "cms_article" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "status" character varying NOT NULL DEFAULT 'DRAFT', "publishedAt" TIMESTAMP, "id" SERIAL NOT NULL, "featuredAssetId" integer, "categoryId" integer, CONSTRAINT "PK_cms_article" PRIMARY KEY ("id"))`,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_cms_article_status_published" ON "cms_article" ("status", "publishedAt")`,
        );
        await queryRunner.query(
            `CREATE TABLE "cms_article_translation" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "languageCode" character varying NOT NULL, "title" character varying NOT NULL, "slug" character varying NOT NULL, "excerpt" text NOT NULL DEFAULT '', "content" text NOT NULL, "seoTitle" character varying NOT NULL DEFAULT '', "seoDescription" text NOT NULL DEFAULT '', "id" SERIAL NOT NULL, "baseId" integer, CONSTRAINT "PK_cms_article_translation" PRIMARY KEY ("id"))`,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_cms_article_translation_language_slug" ON "cms_article_translation" ("languageCode", "slug")`,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_cms_article_translation_base" ON "cms_article_translation" ("baseId")`,
        );
        await queryRunner.query(
            `CREATE TABLE "cms_article_channels_channel" ("cmsArticleId" integer NOT NULL, "channelId" integer NOT NULL, CONSTRAINT "PK_cms_article_channels" PRIMARY KEY ("cmsArticleId", "channelId"))`,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_cms_article_channels_article" ON "cms_article_channels_channel" ("cmsArticleId")`,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_cms_article_channels_channel" ON "cms_article_channels_channel" ("channelId")`,
        );
        await queryRunner.query(
            `ALTER TABLE "cms_category_translation" ADD CONSTRAINT "FK_cms_category_translation_base" FOREIGN KEY ("baseId") REFERENCES "cms_category"("id") ON DELETE CASCADE`,
        );
        await queryRunner.query(
            `ALTER TABLE "cms_category_channels_channel" ADD CONSTRAINT "FK_cms_category_channels_category" FOREIGN KEY ("cmsCategoryId") REFERENCES "cms_category"("id") ON DELETE CASCADE`,
        );
        await queryRunner.query(
            `ALTER TABLE "cms_category_channels_channel" ADD CONSTRAINT "FK_cms_category_channels_channel" FOREIGN KEY ("channelId") REFERENCES "channel"("id") ON DELETE CASCADE`,
        );
        await queryRunner.query(
            `ALTER TABLE "cms_article" ADD CONSTRAINT "FK_cms_article_featured_asset" FOREIGN KEY ("featuredAssetId") REFERENCES "asset"("id") ON DELETE SET NULL`,
        );
        await queryRunner.query(
            `ALTER TABLE "cms_article" ADD CONSTRAINT "FK_cms_article_category" FOREIGN KEY ("categoryId") REFERENCES "cms_category"("id") ON DELETE SET NULL`,
        );
        await queryRunner.query(
            `ALTER TABLE "cms_article_translation" ADD CONSTRAINT "FK_cms_article_translation_base" FOREIGN KEY ("baseId") REFERENCES "cms_article"("id") ON DELETE CASCADE`,
        );
        await queryRunner.query(
            `ALTER TABLE "cms_article_channels_channel" ADD CONSTRAINT "FK_cms_article_channels_article" FOREIGN KEY ("cmsArticleId") REFERENCES "cms_article"("id") ON DELETE CASCADE`,
        );
        await queryRunner.query(
            `ALTER TABLE "cms_article_channels_channel" ADD CONSTRAINT "FK_cms_article_channels_channel" FOREIGN KEY ("channelId") REFERENCES "channel"("id") ON DELETE CASCADE`,
        );

        // Seed the fixed top-level content categories in the default Channel. They are regular
        // CmsCategory entities, so administrators may translate their names but cannot accidentally
        // publish content before the category taxonomy exists.
        const defaultChannel = await queryRunner.query(
            `SELECT "id" FROM "channel" WHERE "code" = '__default_channel__' LIMIT 1`,
        );
        if (defaultChannel[0]?.id != null) {
            const categories = [
                { slug: 'products', zhName: '商品', enName: 'Products' },
                { slug: 'timeline', zhName: '時間軸', enName: 'Timeline' },
                { slug: 'blog', zhName: '部落格', enName: 'Blog' },
            ];
            for (const category of categories) {
                const inserted = await queryRunner.query(
                    `INSERT INTO "cms_category" DEFAULT VALUES RETURNING "id"`,
                );
                const categoryId = inserted[0].id;
                await queryRunner.query(
                    `INSERT INTO "cms_category_translation" ("languageCode", "name", "slug", "description", "baseId") VALUES ($1, $2, $3, '', $4), ($5, $6, $7, '', $4)`,
                    [
                        'zh_Hant',
                        category.zhName,
                        category.slug,
                        categoryId,
                        'en',
                        category.enName,
                        category.slug,
                    ],
                );
                await queryRunner.query(
                    `INSERT INTO "cms_category_channels_channel" ("cmsCategoryId", "channelId") VALUES ($1, $2)`,
                    [categoryId, defaultChannel[0].id],
                );
            }
        }
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "cms_article_channels_channel"`);
        await queryRunner.query(`DROP TABLE "cms_article_translation"`);
        await queryRunner.query(`DROP TABLE "cms_article"`);
        await queryRunner.query(`DROP TABLE "cms_category_channels_channel"`);
        await queryRunner.query(`DROP TABLE "cms_category_translation"`);
        await queryRunner.query(`DROP TABLE "cms_category"`);
    }
}
