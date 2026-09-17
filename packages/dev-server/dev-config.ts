/* eslint-disable no-console */
import { AssetServerPlugin, configureS3AssetStorage } from '@vendure/asset-server-plugin';
import { LanguageCode } from '@vendure/common/lib/generated-types';
import { ADMIN_API_PATH, API_PORT, SHOP_API_PATH } from '@vendure/common/lib/shared-constants';
import {
    DefaultJobQueuePlugin,
    DefaultLogger,
    DefaultSchedulerPlugin,
    DefaultSearchPlugin,
    dummyPaymentHandler,
    LogLevel,
    VendureConfig,
} from '@vendure/core';
import { DashboardPlugin } from '@vendure/dashboard/plugin';
import { defaultEmailHandlers, EmailPlugin, FileBasedTemplateLoader } from '@vendure/email-plugin';
import 'dotenv/config';
import { createRequire } from 'node:module';
import path from 'path';
import { DataSourceOptions } from 'typeorm';

import { CmsPlugin } from './plugins/cms/cms.plugin';
import { GalleryBusinessPlugin } from './plugins/gallery-business/gallery-business.plugin';
import { GalleryCatalogPlugin } from './plugins/gallery-catalog/gallery-catalog.plugin';
import { GalleryCollectorPlugin } from './plugins/gallery-collector/collector.plugin';

const IS_INSTRUMENTED = process.env.IS_INSTRUMENTED === 'true';
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const SERVE_GRAPHIQL =
    process.env.VENDURE_SERVE_GRAPHIQL === 'true' ||
    (!IS_PRODUCTION && process.env.VENDURE_SERVE_GRAPHIQL !== 'false');
const SERVE_STATIC_DASHBOARD = process.env.VENDURE_SERVE_STATIC_DASHBOARD !== 'false';
const loadPackage = createRequire(__filename);
const storefrontUrl = (process.env.VENDURE_STOREFRONT_URL || 'http://localhost:3000').replace(/\/$/, '');
const dashboardAppDir =
    path.basename(__dirname) === 'dist'
        ? path.join(__dirname, './dashboard')
        : path.join(__dirname, './dist/dashboard');
const emailTemplatesDir =
    path.basename(__dirname) === 'dist'
        ? path.join(__dirname, '../../email-plugin/templates')
        : path.join(__dirname, '../email-plugin/templates');
const corsOrigins = (process.env.VENDURE_CORS_ORIGINS || 'http://localhost:3000')
    .split(',')
    .map(origin => origin.trim());

if (IS_PRODUCTION) {
    for (const key of [
        'VENDURE_COOKIE_SECRET',
        'SUPERADMIN_USERNAME',
        'SUPERADMIN_PASSWORD',
        'DB_PASSWORD',
        'VENDURE_CORS_ORIGINS',
        'VENDURE_STOREFRONT_URL',
        'VENDURE_ASSET_UPLOAD_DIR',
        'VENDURE_ASSET_URL_PREFIX',
        'SMTP_HOST',
        'EMAIL_FROM_ADDRESS',
        'VENDURE_VERIFY_EMAIL_URL',
        'VENDURE_PASSWORD_RESET_URL',
        'VENDURE_CHANGE_EMAIL_URL',
    ]) {
        if (!process.env[key]?.trim()) throw new Error(`Production requires ${key}`);
    }
    if ((process.env.VENDURE_COOKIE_SECRET?.length ?? 0) < 32) {
        throw new Error('Production requires a cookie secret of at least 32 characters');
    }
    if (process.env.SUPERADMIN_PASSWORD === 'superadmin') {
        throw new Error('Production must not use the default superadmin password');
    }
    if ((process.env.DB || 'postgres') !== 'postgres' || process.env.DB_SYNCHRONIZE === 'true') {
        throw new Error('Production requires PostgreSQL migrations with DB_SYNCHRONIZE=false');
    }
}

/**
 * Config settings used during development
 */
export const devConfig: VendureConfig = {
    defaultLanguageCode: LanguageCode.zh_Hant,
    apiOptions: {
        port: Number(process.env.PORT) || Number(process.env.API_PORT) || API_PORT,
        trustProxy: process.env.VENDURE_TRUST_PROXY === 'true',
        csrfPrevention: true,
        cors: {
            // `*` is represented as `true` so Nest can reflect the request
            // origin while credentials remain enabled for Dashboard login.
            origin: corsOrigins.includes('*') ? true : corsOrigins,
            credentials: true,
        },
        adminApiPath: ADMIN_API_PATH,
        adminApiPlayground: IS_PRODUCTION
            ? false
            : {
                  settings: {
                      'request.credentials': 'include',
                  },
              },
        adminApiDebug: !IS_PRODUCTION,
        shopApiPath: SHOP_API_PATH,
        shopApiPlayground: IS_PRODUCTION
            ? false
            : {
                  settings: {
                      'request.credentials': 'include',
                  },
              },
        shopApiDebug: !IS_PRODUCTION,
    },
    authOptions: {
        disableAuth: false,
        tokenMethod: ['bearer', 'cookie', 'api-key'] as const,
        requireVerification: true,
        customPermissions: [],
        superadminCredentials: {
            identifier: process.env.SUPERADMIN_USERNAME || 'superadmin',
            password: process.env.SUPERADMIN_PASSWORD || 'superadmin',
        },
        cookieOptions: {
            secret: process.env.VENDURE_COOKIE_SECRET || 'development-only-change-me',
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
        },
    },
    dbConnectionOptions: {
        synchronize: false,
        logging: false,
        migrations:
            (process.env.DB || 'postgres') === 'postgres'
                ? [path.join(__dirname, `migrations/*.${path.basename(__dirname) === 'dist' ? 'js' : 'ts'}`)]
                : [],
        ...getDbConfig(),
    },
    paymentOptions: {
        paymentMethodHandlers: IS_PRODUCTION ? [] : [dummyPaymentHandler],
    },
    customFields: {},
    logger: new DefaultLogger({ level: LogLevel.Verbose }),
    importExportOptions: {
        importAssetsDir: path.join(__dirname, 'import-assets'),
    },
    plugins: [
        GalleryCatalogPlugin,
        GalleryCollectorPlugin,
        GalleryBusinessPlugin,
        CmsPlugin,
        ...(SERVE_GRAPHIQL ? [loadPackage('@vendure/graphiql-plugin').GraphiqlPlugin.init()] : []),
        AssetServerPlugin.init({
            route: 'assets',
            assetUploadDir: process.env.VENDURE_ASSET_UPLOAD_DIR || path.join(__dirname, 'assets'),
            assetUrlPrefix: process.env.VENDURE_ASSET_URL_PREFIX,
            storageStrategyFactory: process.env.S3_BUCKET
                ? configureS3AssetStorage({
                      bucket: process.env.S3_BUCKET,
                      credentials: {
                          accessKeyId: process.env.S3_ACCESS_KEY_ID!,
                          secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
                      },
                      nativeS3Configuration: {
                          region: process.env.S3_REGION || 'us-east-1',
                          endpoint: process.env.S3_ENDPOINT || undefined,
                          forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
                          signatureVersion: 'v4',
                      },
                  })
                : undefined,
        }),
        DefaultSearchPlugin.init({ bufferUpdates: false, indexStockStatus: false }),
        // Enable if you need to debug the job queue
        // BullMQJobQueuePlugin.init({}),
        DefaultJobQueuePlugin.init({}),
        // JobQueueTestPlugin.init({ queueCount: 10 }),
        DefaultSchedulerPlugin.init({}),
        EmailPlugin.init({
            ...(process.env.SMTP_HOST
                ? {
                      transport: {
                          type: 'smtp' as const,
                          host: process.env.SMTP_HOST,
                          port: Number(process.env.SMTP_PORT) || 587,
                          secure: process.env.SMTP_SECURE === 'true',
                          auth: process.env.SMTP_USER
                              ? {
                                    user: process.env.SMTP_USER,
                                    pass: process.env.SMTP_PASSWORD,
                                }
                              : undefined,
                      },
                  }
                : {
                      devMode: true as const,
                      route: 'mailbox',
                      outputPath: path.join(__dirname, 'test-emails'),
                  }),
            handlers: defaultEmailHandlers,
            templateLoader: new FileBasedTemplateLoader(emailTemplatesDir),
            globalTemplateVars: {
                fromAddress: process.env.EMAIL_FROM_ADDRESS || 'Gallery <noreply@example.test>',
                verifyEmailAddressUrl:
                    process.env.VENDURE_VERIFY_EMAIL_URL || `${storefrontUrl}/account/verify`,
                passwordResetUrl:
                    process.env.VENDURE_PASSWORD_RESET_URL || `${storefrontUrl}/account/reset-password`,
                changeEmailAddressUrl:
                    process.env.VENDURE_CHANGE_EMAIL_URL || `${storefrontUrl}/account/change-email-address`,
            },
        }),
        ...(IS_INSTRUMENTED ? [loadPackage('@vendure/telemetry-plugin').TelemetryPlugin.init({})] : []),
        SERVE_STATIC_DASHBOARD
            ? DashboardPlugin.init({
                  route: 'dashboard',
                  appDir: dashboardAppDir,
              })
            : DashboardPlugin,
    ],
};

function getDbConfig(): DataSourceOptions {
    const dbType = process.env.DB || 'postgres';
    switch (dbType) {
        case 'postgres':
            console.log('Using postgres connection');
            return {
                synchronize: shouldSynchronizeSchema(),
                type: 'postgres',
                host: process.env.DB_HOST || 'localhost',
                port: Number(process.env.DB_PORT) || 5432,
                username: process.env.DB_USERNAME || 'vendure',
                password: process.env.DB_PASSWORD || 'password',
                database: process.env.DB_NAME || 'vendure-dev',
                schema: process.env.DB_SCHEMA || 'public',
            };
        case 'sqlite':
            console.log('Using sqlite connection');
            return {
                synchronize: shouldSynchronizeSchema(),
                type: 'better-sqlite3',
                database: path.join(__dirname, 'vendure.sqlite'),
            };
        case 'sqljs':
            console.log('Using sql.js connection');
            return {
                type: 'sqljs',
                autoSave: true,
                database: new Uint8Array([]),
                location: path.join(__dirname, 'vendure.sqlite'),
            };
        case 'mysql':
        case 'mariadb':
        default:
            console.log('Using mysql connection');
            return {
                synchronize: shouldSynchronizeSchema(),
                type: 'mariadb',
                host: process.env.DB_HOST || '127.0.0.1',
                port: Number(process.env.DB_PORT) || 3306,
                username: process.env.DB_USERNAME || 'vendure',
                password: process.env.DB_PASSWORD || 'password',
                database: process.env.DB_NAME || 'vendure-dev',
            };
    }
}

function shouldSynchronizeSchema(): boolean {
    return process.env.DB_SYNCHRONIZE === 'true';
}
