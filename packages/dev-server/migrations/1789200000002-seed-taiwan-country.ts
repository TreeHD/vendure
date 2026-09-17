import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Ensures address forms have at least one enabled country in the Taiwan/TWD default deployment.
 * The country is also made a member of the Channel's default tax and shipping zone.
 */
export class SeedTaiwanCountry1789200000002 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        const [channel] = await queryRunner.query(
            `SELECT "id", "defaultTaxZoneId", "defaultShippingZoneId" FROM "channel" WHERE "code" = '__default_channel__' LIMIT 1`,
        );
        if (!channel) return;

        let zoneId = channel.defaultShippingZoneId ?? channel.defaultTaxZoneId;
        if (!zoneId) {
            const [zone] = await queryRunner.query(
                `INSERT INTO "zone" ("name") VALUES ('台灣') RETURNING "id"`,
            );
            zoneId = zone.id;
        }
        await queryRunner.query(
            `UPDATE "channel" SET "defaultTaxZoneId" = $1, "defaultShippingZoneId" = $1 WHERE "id" = $2`,
            [zoneId, channel.id],
        );

        let [country] = await queryRunner.query(
            `SELECT "id" FROM "region" WHERE "type" = 'country' AND "code" = 'TW' LIMIT 1`,
        );
        if (!country) {
            [country] = await queryRunner.query(
                `INSERT INTO "region" ("code", "type", "enabled", "discriminator") VALUES ('TW', 'country', true, 'Country') RETURNING "id"`,
            );
        } else {
            await queryRunner.query(`UPDATE "region" SET "enabled" = true WHERE "id" = $1`, [country.id]);
        }

        const translations = [
            ['zh_Hant', '台灣'],
            ['en', 'Taiwan'],
        ];
        for (const [languageCode, name] of translations) {
            const [existing] = await queryRunner.query(
                `SELECT "id" FROM "region_translation" WHERE "baseId" = $1 AND "languageCode" = $2 LIMIT 1`,
                [country.id, languageCode],
            );
            if (existing) {
                await queryRunner.query(`UPDATE "region_translation" SET "name" = $1 WHERE "id" = $2`, [
                    name,
                    existing.id,
                ]);
            } else {
                await queryRunner.query(
                    `INSERT INTO "region_translation" ("languageCode", "name", "baseId") VALUES ($1, $2, $3)`,
                    [languageCode, name, country.id],
                );
            }
        }
        await queryRunner.query(
            `INSERT INTO "zone_members_region" ("zoneId", "regionId") VALUES ($1, $2) ON CONFLICT DO NOTHING`,
            [zoneId, country.id],
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `DELETE FROM "region" WHERE "type" = 'country' AND "code" = 'TW' AND "id" NOT IN (SELECT "countryId" FROM "address" WHERE "countryId" IS NOT NULL)`,
        );
    }
}
