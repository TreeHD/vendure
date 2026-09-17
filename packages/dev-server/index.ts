import { bootstrap, JobQueueService, runMigrations } from '@vendure/core';

import { setupApiDocs } from './api-docs';
import { devConfig } from './dev-config';

/**
 * This bootstraps the dev server, used for testing Vendure during development.
 */
runMigrations(devConfig)
    .then(() => bootstrap(devConfig, { onBeforeAppListen: app => setupApiDocs(app, devConfig) }))
    .then(app => {
        if (process.env.RUN_JOB_QUEUE === '1') {
            return app.get(JobQueueService).start();
        }
    })
    .catch(err => {
        // eslint-disable-next-line
        console.log(err);
        process.exit(1);
    });
