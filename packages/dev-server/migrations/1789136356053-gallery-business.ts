import {MigrationInterface, QueryRunner} from "typeorm";

export class GalleryBusiness1789136356053 implements MigrationInterface {

   public async up(queryRunner: QueryRunner): Promise<any> {
        await queryRunner.query(`CREATE TABLE "gallery_inquiry" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "channelId" integer NOT NULL, "customerId" integer, "code" character varying NOT NULL, "type" character varying NOT NULL, "contactName" character varying NOT NULL, "emailAddress" character varying NOT NULL, "phoneNumber" character varying NOT NULL DEFAULT '', "subject" character varying NOT NULL, "message" text NOT NULL, "status" character varying NOT NULL DEFAULT 'pending', "languageCode" character varying NOT NULL DEFAULT 'zh_Hant', "sourcePath" character varying NOT NULL DEFAULT '', "internalNote" text NOT NULL DEFAULT '', "id" SERIAL NOT NULL, "productId" integer, "assignedAdministratorId" integer, CONSTRAINT "PK_9ba53a03b121c439a927f23f4be" PRIMARY KEY ("id"))`, undefined);
        await queryRunner.query(`CREATE INDEX "IDX_c01c2027273132b2f779b466f0" ON "gallery_inquiry" ("channelId", "status", "createdAt") `, undefined);
        await queryRunner.query(`CREATE TABLE "gallery_private_purchase" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "channelId" integer NOT NULL, "customerId" integer, "code" character varying NOT NULL, "artworkTitle" character varying NOT NULL, "contactName" character varying NOT NULL, "emailAddress" character varying NOT NULL, "phoneNumber" character varying NOT NULL, "preferredContactMethod" character varying NOT NULL DEFAULT 'email', "message" text NOT NULL, "languageCode" character varying NOT NULL DEFAULT 'zh_Hant', "status" character varying NOT NULL DEFAULT 'submitted', "internalNote" text NOT NULL DEFAULT '', "claimTokenHash" character varying, "claimExpiresAt" TIMESTAMP, "deliveredAt" TIMESTAMP, "id" SERIAL NOT NULL, "productId" integer NOT NULL, "assignedAdministratorId" integer, "orderId" integer, CONSTRAINT "PK_4ecd79fa056542901f41e73ebff" PRIMARY KEY ("id"))`, undefined);
        await queryRunner.query(`CREATE INDEX "IDX_06ce55d65128671ef6cc5e318b" ON "gallery_private_purchase" ("channelId", "customerId", "createdAt") `, undefined);
        await queryRunner.query(`CREATE TABLE "gallery_proposal" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "channelId" integer NOT NULL, "version" integer NOT NULL, "summary" text NOT NULL, "amount" integer NOT NULL, "depositAmount" integer NOT NULL, "currencyCode" character varying NOT NULL DEFAULT 'TWD', "depositDueAt" TIMESTAMP NOT NULL, "balanceDueAt" TIMESTAMP NOT NULL, "id" SERIAL NOT NULL, "purchaseId" integer NOT NULL, CONSTRAINT "PK_387b636886b83a10df9785d3622" PRIMARY KEY ("id"))`, undefined);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_2cb3a5bccf62dda79cd7260e0a" ON "gallery_proposal" ("channelId", "purchaseId", "version") `, undefined);
        await queryRunner.query(`CREATE TABLE "gallery_case_transition" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "channelId" integer NOT NULL, "fromStatus" character varying NOT NULL, "toStatus" character varying NOT NULL, "reason" text NOT NULL DEFAULT '', "id" SERIAL NOT NULL, "purchaseId" integer NOT NULL, "actorUserId" integer, CONSTRAINT "PK_b8143325c6ab2251231aee4d333" PRIMARY KEY ("id"))`, undefined);
        await queryRunner.query(`CREATE INDEX "IDX_09a3e146b46bbedf056973f0e3" ON "gallery_case_transition" ("channelId", "purchaseId", "createdAt") `, undefined);
        await queryRunner.query(`CREATE TABLE "gallery_payment_request" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "channelId" integer NOT NULL, "stage" character varying NOT NULL, "amount" integer NOT NULL, "currencyCode" character varying NOT NULL DEFAULT 'TWD', "tokenHash" character varying NOT NULL, "expiresAt" TIMESTAMP NOT NULL, "status" character varying NOT NULL DEFAULT 'pending', "stripeSessionId" character varying, "stripePaymentIntentId" character varying, "refundedAmount" integer NOT NULL DEFAULT '0', "reason" text NOT NULL DEFAULT '', "id" SERIAL NOT NULL, "purchaseId" integer NOT NULL, "proposalId" integer NOT NULL, "orderId" integer NOT NULL, "paymentId" integer, CONSTRAINT "PK_9eac766e1ece04274e5260c5e59" PRIMARY KEY ("id"))`, undefined);
        await queryRunner.query(`CREATE INDEX "IDX_ee84b20d144b57695ad48a07de" ON "gallery_payment_request" ("channelId", "purchaseId", "stage") `, undefined);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_4c6c282bc4aa1db907f0b25a0f" ON "gallery_payment_request" ("tokenHash") `, undefined);
        await queryRunner.query(`CREATE TABLE "gallery_reservation" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "channelId" integer NOT NULL, "expiresAt" TIMESTAMP NOT NULL, "depositPaid" boolean NOT NULL DEFAULT false, "id" SERIAL NOT NULL, "productId" integer NOT NULL, "purchaseId" integer NOT NULL, CONSTRAINT "PK_54dddff96b747b5b7e4274b35ff" PRIMARY KEY ("id"))`, undefined);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_bdf576ea2cc44097ab8705caff" ON "gallery_reservation" ("channelId", "productId") `, undefined);
        await queryRunner.query(`CREATE TABLE "gallery_stripe_event" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "eventId" character varying NOT NULL, "type" character varying NOT NULL, "payload" text NOT NULL, "status" character varying NOT NULL DEFAULT 'pending', "error" text NOT NULL DEFAULT '', "id" SERIAL NOT NULL, CONSTRAINT "PK_0444fec3ef7e47a9f4e14faedb7" PRIMARY KEY ("id"))`, undefined);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_1e0a4ed93d824404ef44b9b05f" ON "gallery_stripe_event" ("eventId") `, undefined);
        await queryRunner.query(`CREATE TABLE "gallery_notification" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "channelId" integer NOT NULL, "status" character varying NOT NULL DEFAULT 'DRAFT', "audience" character varying NOT NULL DEFAULT 'ALL', "translations" text NOT NULL, "recipientIds" text NOT NULL, "publishedAt" TIMESTAMP, "actionPath" character varying NOT NULL DEFAULT '', "eventKey" character varying, "id" SERIAL NOT NULL, CONSTRAINT "UQ_4635b55b1e7515ab17670e27103" UNIQUE ("eventKey"), CONSTRAINT "PK_2d57e0db1de741576be3ce4620d" PRIMARY KEY ("id"))`, undefined);
        await queryRunner.query(`CREATE INDEX "IDX_e4c473a9f145753779b672f6bd" ON "gallery_notification" ("channelId", "status", "publishedAt") `, undefined);
        await queryRunner.query(`CREATE TABLE "gallery_notification_read" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "channelId" integer NOT NULL, "customerId" integer, "id" SERIAL NOT NULL, "notificationId" integer NOT NULL, CONSTRAINT "PK_07c10ce1df79d6829a3faf43e98" PRIMARY KEY ("id"))`, undefined);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_bf1a0e3261156a8befc32b1c71" ON "gallery_notification_read" ("channelId", "notificationId", "customerId") `, undefined);
        await queryRunner.query(`CREATE TABLE "gallery_content" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "channelId" integer NOT NULL, "kind" character varying NOT NULL, "key" character varying NOT NULL, "status" character varying NOT NULL DEFAULT 'draft', "sortOrder" integer NOT NULL DEFAULT '0', "draft" text NOT NULL, "published" text, "publishedAt" TIMESTAMP, "id" SERIAL NOT NULL, CONSTRAINT "PK_b683b4d4674df963aa9ce6cb09e" PRIMARY KEY ("id"))`, undefined);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_f3d598e397e4a0f27bb4f2cc9a" ON "gallery_content" ("channelId", "kind", "key") `, undefined);
        await queryRunner.query(`CREATE TABLE "gallery_crm_profile" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "channelId" integer NOT NULL, "customerId" integer, "identityKey" character varying NOT NULL, "name" character varying NOT NULL DEFAULT '', "email" character varying NOT NULL DEFAULT '', "phone" character varying NOT NULL DEFAULT '', "stage" character varying NOT NULL DEFAULT 'new', "notes" text NOT NULL DEFAULT '', "lastContactAt" TIMESTAMP, "lastSeenAt" TIMESTAMP NOT NULL, "id" SERIAL NOT NULL, "assignedAdministratorId" integer, CONSTRAINT "PK_925775ea9b18fe85fc669bcb034" PRIMARY KEY ("id"))`, undefined);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_b6d577fbcf998d84729c28b23e" ON "gallery_crm_profile" ("channelId", "identityKey") `, undefined);
        await queryRunner.query(`CREATE TABLE "gallery_analytics_event" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "channelId" integer NOT NULL, "eventType" character varying NOT NULL, "path" character varying NOT NULL, "metadata" text NOT NULL, "viewKey" character varying, "id" SERIAL NOT NULL, "profileId" integer NOT NULL, "productId" integer, "artistId" integer, CONSTRAINT "UQ_f76e86a922823e222a84ac3d654" UNIQUE ("viewKey"), CONSTRAINT "PK_b69c6493f62e85380adf575a7e5" PRIMARY KEY ("id"))`, undefined);
        await queryRunner.query(`CREATE INDEX "IDX_277f917bccb13541f38e2bcb70" ON "gallery_analytics_event" ("channelId", "profileId", "createdAt") `, undefined);
        await queryRunner.query(`CREATE TABLE "gallery_mail_outbox" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "channelId" integer NOT NULL, "recipient" character varying NOT NULL, "subject" character varying NOT NULL, "body" text NOT NULL, "status" character varying NOT NULL DEFAULT 'pending', "id" SERIAL NOT NULL, CONSTRAINT "PK_593513dcba7cab5ea3a6d55ae8d" PRIMARY KEY ("id"))`, undefined);
        await queryRunner.query(`ALTER TABLE "order" ADD "customFieldsGalleryprivatepurchaseid" character varying(255)`, undefined);
        await queryRunner.query(`ALTER TABLE "gallery_inquiry" ADD CONSTRAINT "FK_0adfbf82b43b743cdc240f1b974" FOREIGN KEY ("channelId") REFERENCES "channel"("id") ON DELETE CASCADE ON UPDATE NO ACTION`, undefined);
        await queryRunner.query(`ALTER TABLE "gallery_inquiry" ADD CONSTRAINT "FK_2460563423fd64970a32ea8c793" FOREIGN KEY ("customerId") REFERENCES "customer"("id") ON DELETE SET NULL ON UPDATE NO ACTION`, undefined);
        await queryRunner.query(`ALTER TABLE "gallery_private_purchase" ADD CONSTRAINT "FK_9e159961884be9c8431572a0c1c" FOREIGN KEY ("channelId") REFERENCES "channel"("id") ON DELETE CASCADE ON UPDATE NO ACTION`, undefined);
        await queryRunner.query(`ALTER TABLE "gallery_private_purchase" ADD CONSTRAINT "FK_1b125372d1107e57ea72c975f1f" FOREIGN KEY ("customerId") REFERENCES "customer"("id") ON DELETE SET NULL ON UPDATE NO ACTION`, undefined);
        await queryRunner.query(`ALTER TABLE "gallery_proposal" ADD CONSTRAINT "FK_4779472ae23c15b71ad93fcced0" FOREIGN KEY ("channelId") REFERENCES "channel"("id") ON DELETE CASCADE ON UPDATE NO ACTION`, undefined);
        await queryRunner.query(`ALTER TABLE "gallery_case_transition" ADD CONSTRAINT "FK_55120f845e6382a87ad1c9e4380" FOREIGN KEY ("channelId") REFERENCES "channel"("id") ON DELETE CASCADE ON UPDATE NO ACTION`, undefined);
        await queryRunner.query(`ALTER TABLE "gallery_payment_request" ADD CONSTRAINT "FK_93afc88ad470bbc4f6257b323a2" FOREIGN KEY ("channelId") REFERENCES "channel"("id") ON DELETE CASCADE ON UPDATE NO ACTION`, undefined);
        await queryRunner.query(`ALTER TABLE "gallery_reservation" ADD CONSTRAINT "FK_5fc46935c75da9cbfa821a279a8" FOREIGN KEY ("channelId") REFERENCES "channel"("id") ON DELETE CASCADE ON UPDATE NO ACTION`, undefined);
        await queryRunner.query(`ALTER TABLE "gallery_notification" ADD CONSTRAINT "FK_62401404ddbde8f6c6a12ce916b" FOREIGN KEY ("channelId") REFERENCES "channel"("id") ON DELETE CASCADE ON UPDATE NO ACTION`, undefined);
        await queryRunner.query(`ALTER TABLE "gallery_notification_read" ADD CONSTRAINT "FK_b9ea45a012c6c924c648b989893" FOREIGN KEY ("channelId") REFERENCES "channel"("id") ON DELETE CASCADE ON UPDATE NO ACTION`, undefined);
        await queryRunner.query(`ALTER TABLE "gallery_notification_read" ADD CONSTRAINT "FK_0a47261f8446461eeddccaf10f6" FOREIGN KEY ("customerId") REFERENCES "customer"("id") ON DELETE SET NULL ON UPDATE NO ACTION`, undefined);
        await queryRunner.query(`ALTER TABLE "gallery_content" ADD CONSTRAINT "FK_3391aae62f56ef8a43a01a2a242" FOREIGN KEY ("channelId") REFERENCES "channel"("id") ON DELETE CASCADE ON UPDATE NO ACTION`, undefined);
        await queryRunner.query(`ALTER TABLE "gallery_crm_profile" ADD CONSTRAINT "FK_b7dc2418a72b81bc8a3851d747f" FOREIGN KEY ("channelId") REFERENCES "channel"("id") ON DELETE CASCADE ON UPDATE NO ACTION`, undefined);
        await queryRunner.query(`ALTER TABLE "gallery_crm_profile" ADD CONSTRAINT "FK_524d5b96da11c97892b31d06093" FOREIGN KEY ("customerId") REFERENCES "customer"("id") ON DELETE SET NULL ON UPDATE NO ACTION`, undefined);
        await queryRunner.query(`ALTER TABLE "gallery_analytics_event" ADD CONSTRAINT "FK_8e1a376208bf3b3d60225291d97" FOREIGN KEY ("channelId") REFERENCES "channel"("id") ON DELETE CASCADE ON UPDATE NO ACTION`, undefined);
        await queryRunner.query(`ALTER TABLE "gallery_mail_outbox" ADD CONSTRAINT "FK_7d3f257c14698f238b1b2228e37" FOREIGN KEY ("channelId") REFERENCES "channel"("id") ON DELETE CASCADE ON UPDATE NO ACTION`, undefined);
   }

   public async down(queryRunner: QueryRunner): Promise<any> {
        await queryRunner.query(`ALTER TABLE "gallery_mail_outbox" DROP CONSTRAINT "FK_7d3f257c14698f238b1b2228e37"`, undefined);
        await queryRunner.query(`ALTER TABLE "gallery_analytics_event" DROP CONSTRAINT "FK_8e1a376208bf3b3d60225291d97"`, undefined);
        await queryRunner.query(`ALTER TABLE "gallery_crm_profile" DROP CONSTRAINT "FK_524d5b96da11c97892b31d06093"`, undefined);
        await queryRunner.query(`ALTER TABLE "gallery_crm_profile" DROP CONSTRAINT "FK_b7dc2418a72b81bc8a3851d747f"`, undefined);
        await queryRunner.query(`ALTER TABLE "gallery_content" DROP CONSTRAINT "FK_3391aae62f56ef8a43a01a2a242"`, undefined);
        await queryRunner.query(`ALTER TABLE "gallery_notification_read" DROP CONSTRAINT "FK_0a47261f8446461eeddccaf10f6"`, undefined);
        await queryRunner.query(`ALTER TABLE "gallery_notification_read" DROP CONSTRAINT "FK_b9ea45a012c6c924c648b989893"`, undefined);
        await queryRunner.query(`ALTER TABLE "gallery_notification" DROP CONSTRAINT "FK_62401404ddbde8f6c6a12ce916b"`, undefined);
        await queryRunner.query(`ALTER TABLE "gallery_reservation" DROP CONSTRAINT "FK_5fc46935c75da9cbfa821a279a8"`, undefined);
        await queryRunner.query(`ALTER TABLE "gallery_payment_request" DROP CONSTRAINT "FK_93afc88ad470bbc4f6257b323a2"`, undefined);
        await queryRunner.query(`ALTER TABLE "gallery_case_transition" DROP CONSTRAINT "FK_55120f845e6382a87ad1c9e4380"`, undefined);
        await queryRunner.query(`ALTER TABLE "gallery_proposal" DROP CONSTRAINT "FK_4779472ae23c15b71ad93fcced0"`, undefined);
        await queryRunner.query(`ALTER TABLE "gallery_private_purchase" DROP CONSTRAINT "FK_1b125372d1107e57ea72c975f1f"`, undefined);
        await queryRunner.query(`ALTER TABLE "gallery_private_purchase" DROP CONSTRAINT "FK_9e159961884be9c8431572a0c1c"`, undefined);
        await queryRunner.query(`ALTER TABLE "gallery_inquiry" DROP CONSTRAINT "FK_2460563423fd64970a32ea8c793"`, undefined);
        await queryRunner.query(`ALTER TABLE "gallery_inquiry" DROP CONSTRAINT "FK_0adfbf82b43b743cdc240f1b974"`, undefined);
        await queryRunner.query(`ALTER TABLE "order" DROP COLUMN "customFieldsGalleryprivatepurchaseid"`, undefined);
        await queryRunner.query(`DROP TABLE "gallery_mail_outbox"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_277f917bccb13541f38e2bcb70"`, undefined);
        await queryRunner.query(`DROP TABLE "gallery_analytics_event"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_b6d577fbcf998d84729c28b23e"`, undefined);
        await queryRunner.query(`DROP TABLE "gallery_crm_profile"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_f3d598e397e4a0f27bb4f2cc9a"`, undefined);
        await queryRunner.query(`DROP TABLE "gallery_content"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_bf1a0e3261156a8befc32b1c71"`, undefined);
        await queryRunner.query(`DROP TABLE "gallery_notification_read"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_e4c473a9f145753779b672f6bd"`, undefined);
        await queryRunner.query(`DROP TABLE "gallery_notification"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_1e0a4ed93d824404ef44b9b05f"`, undefined);
        await queryRunner.query(`DROP TABLE "gallery_stripe_event"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_bdf576ea2cc44097ab8705caff"`, undefined);
        await queryRunner.query(`DROP TABLE "gallery_reservation"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_4c6c282bc4aa1db907f0b25a0f"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_ee84b20d144b57695ad48a07de"`, undefined);
        await queryRunner.query(`DROP TABLE "gallery_payment_request"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_09a3e146b46bbedf056973f0e3"`, undefined);
        await queryRunner.query(`DROP TABLE "gallery_case_transition"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_2cb3a5bccf62dda79cd7260e0a"`, undefined);
        await queryRunner.query(`DROP TABLE "gallery_proposal"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_06ce55d65128671ef6cc5e318b"`, undefined);
        await queryRunner.query(`DROP TABLE "gallery_private_purchase"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_c01c2027273132b2f779b466f0"`, undefined);
        await queryRunner.query(`DROP TABLE "gallery_inquiry"`, undefined);
   }

}
