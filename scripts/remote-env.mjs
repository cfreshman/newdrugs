import { readFileSync, writeFileSync } from 'node:fs';
const keys = JSON.parse(readFileSync(0, 'utf8'));
const db = JSON.parse(readFileSync('/etc/newdrugs/database.json', 'utf8'));
for (const instance of ['prod', 'dev']) {
  const values = {
    NODE_ENV: 'production', APP_ENV: instance === 'dev' ? 'staging' : 'production',
    PORT: instance === 'dev' ? '7333' : '7331',
    APP_ORIGIN: instance === 'dev' ? 'https://dev.druggie.org' : 'https://druggie.org',
    MCP_ORIGIN: instance === 'dev' ? 'https://dev.druggie.org' : 'https://druggie.org',
    MONGODB_URI: `mongodb://newdrugs_${instance}:${db[instance]}@127.0.0.1:7332/newdrugs_${instance}?replicaSet=rs0&authSource=newdrugs_${instance}`,
    DATA_DIR: `/var/lib/newdrugs/${instance}`,
    SESSION_COOKIE: `nd_${instance}_session`,
    OPENAI_MODEL: 'gpt-6-luna', OPENAI_API_KEY: keys.OPENAI_API_KEY,
    DEV_CREDIT_USD: '1', DEV_ACCESS_KEY: instance === 'dev' ? db.devAccess : '',
    STRIPE_SECRET_KEY: instance === 'prod' ? keys.STRIPE_SECRET_KEY || '' : '',
    STRIPE_WEBHOOK_SECRET: instance === 'prod' ? keys.STRIPE_WEBHOOK_SECRET || '' : '',
  };
  if (Object.values(values).some(value => /[\n\r]/.test(value))) throw new Error('Invalid multiline environment value.');
  writeFileSync(`/etc/newdrugs/${instance}.env`, Object.entries(values).map(([key,value])=>`${key}=${JSON.stringify(value)}`).join('\n')+'\n',{mode:0o600});
}
console.log('Production and dev environments configured.');
