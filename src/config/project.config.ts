import { loadEnv } from '@core/config/env';

// Loads .env (secrets) so requireEnv calls for passwords/tokens work at runtime
loadEnv();

export const config = {

  api: {
    baseUrl:         'https://insurity-dev-microservice1-api-v2-ctc5era3h3euejgj.centralus-01.azurewebsites.net',
    rulesUrl:        'https://insurity-dev-microservice1-api-v2-ctc5era3h3euejgj.centralus-01.azurewebsites.net',
    ratingEngineUrl: 'https://insurity-dev-microservice1-api-v2-ctc5era3h3euejgj.centralus-01.azurewebsites.net',
  },

  db: {
    host: 'sqldb-eais-qa-usc-insur-pub.postgres.database.azure.com',
    name: 'eais_dynamic_renderer',
    user: 'qatest',
    port: 5432,
    // DB_PASSWORD stays in .env only
  },

  ado: {
    orgUrl:      'https://dev.azure.com/InsurityDevOps',
    project:     'Insurity EAIS AIDLC',
    planIdPod3:  18163,
    suiteIdPod3: 18165,
    // ADO_PAT stays in .env only
  },

  users: {
    admin:       { username: 'admin@insurity.com' },
    underwriter: { username: 'underwriter@insurity.com' },
    agent:       { username: 'agent@insurity.com' },
    viewer:      { username: 'viewer@insurity.com' },
    // *_PASSWORD stays in .env only
  },

} as const;

export type Config = typeof config;
