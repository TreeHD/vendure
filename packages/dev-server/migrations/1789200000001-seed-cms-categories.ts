import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Backfills the initial CMS taxonomy for installations which applied the first CMS schema migration
 * before category seeding was introduced. It is deliberately idempotent for safe recovery deploys.
 */
export class SeedCmsCategories1789200000001 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_cms_category_translation_slug"`);
        await queryRunner.query(
            `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_cms_category_translation_language_slug" ON "cms_category_translation" ("languageCode", "slug")`,
        );

        const [defaultChannel] = await queryRunner.query(
            `SELECT "id" FROM "channel" WHERE "code" = '__default_channel__' LIMIT 1`,
        );
        if (!defaultChannel) return;

        const categories = [
            { slug: 'products', zhName: '商品', enName: 'Products' },
            { slug: 'timeline', zhName: '時間軸', enName: 'Timeline' },
            { slug: 'blog', zhName: '部落格', enName: 'Blog' },
        ];

        for (const category of categories) {
            let [existing] = await queryRunner.query(
                `SELECT "baseId" FROM "cms_category_translation" WHERE "languageCode" = $1 AND "slug" = $2 LIMIT 1`,
                ['zh_Hant', category.slug],
            );
            if (!existing) {
                const [inserted] = await queryRunner.query(
                    `INSERT INTO "cms_category" DEFAULT VALUES RETURNING "id"`,
                );
                existing = { baseId: inserted.id };
            }
            const categoryId = existing.baseId;
            await queryRunner.query(
                `INSERT INTO "cms_category_translation" ("languageCode", "name", "slug", "description", "baseId") VALUES ($1, $2, $3, '', $4) ON CONFLICT ("languageCode", "slug") DO UPDATE SET "name" = EXCLUDED."name", "description" = EXCLUDED."description"`,
                ['zh_Hant', category.zhName, category.slug, categoryId],
            );
            await queryRunner.query(
                `INSERT INTO "cms_category_translation" ("languageCode", "name", "slug", "description", "baseId") VALUES ($1, $2, $3, '', $4) ON CONFLICT ("languageCode", "slug") DO UPDATE SET "name" = EXCLUDED."name", "description" = EXCLUDED."description"`,
                ['en', category.enName, category.slug, categoryId],
            );
            await queryRunner.query(
                `INSERT INTO "cms_category_channels_channel" ("cmsCategoryId", "channelId") VALUES ($1, $2) ON CONFLICT DO NOTHING`,
                [categoryId, defaultChannel.id],
            );
        }
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        const slugs = ['products', 'timeline', 'blog'];
        await queryRunner.query(
            `DELETE FROM "cms_category" WHERE "id" IN (SELECT "baseId" FROM "cms_category_translation" WHERE "languageCode" = 'zh_Hant' AND "slug" = ANY($1))`,
            [slugs],
        );
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_cms_category_translation_language_slug"`);
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_cms_category_translation_slug" ON "cms_category_translation" ("slug")`,
        );
    }
}
