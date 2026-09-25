#!/usr/bin/env bash
set -euo pipefail
install -d -m 750 -o mongodb -g mongodb /var/lib/newdrugs/mongo/data
if ! test -f /var/lib/newdrugs/mongo.key; then
  openssl rand -base64 756 > /var/lib/newdrugs/mongo.key
  chown mongodb:mongodb /var/lib/newdrugs/mongo.key
  chmod 400 /var/lib/newdrugs/mongo.key
fi
cat > /etc/systemd/system/newdrugs-mongo.service <<'UNIT'
[Unit]
Description=New Drugs MongoDB
After=network.target
[Service]
User=mongodb
Group=mongodb
ExecStart=/usr/bin/mongod --dbpath /var/lib/newdrugs/mongo/data --port 7332 --bind_ip 127.0.0.1 --replSet rs0 --auth --keyFile /var/lib/newdrugs/mongo.key --wiredTigerCacheSizeGB 0.256 --oplogSize 128 --nounixsocket
Restart=on-failure
LimitNOFILE=64000
MemoryMax=500M
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/lib/newdrugs/mongo
[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable --now newdrugs-mongo
cat > /etc/newdrugs/bootstrap-db.js <<'JS'
const fs = require('fs');
const crypto = require('crypto');
const path = '/etc/newdrugs/database.json';
const existed = fs.existsSync(path);
const secrets = existed ? JSON.parse(fs.readFileSync(path, 'utf8')) : { admin: crypto.randomBytes(32).toString('hex'), prod: crypto.randomBytes(32).toString('hex'), dev: crypto.randomBytes(32).toString('hex'), test: crypto.randomBytes(32).toString('hex'), devAccess: crypto.randomBytes(32).toString('hex') };
if (existed) db.getSiblingDB('admin').auth('newdrugs_admin', secrets.admin);
try { rs.status(); } catch (e) { if (e.codeName === 'NotYetInitialized') rs.initiate({_id:'rs0',members:[{_id:0,host:'127.0.0.1:7332'}]}); else throw e; }
for(let i=0; i<40 && !db.hello().isWritablePrimary; i++) sleep(500);
if (!db.hello().isWritablePrimary) throw new Error('MongoDB did not become primary.');
if (!existed) {
  fs.writeFileSync(path, JSON.stringify(secrets), {mode:0o600,flag:'wx'});
  db.getSiblingDB('admin').createUser({user:'newdrugs_admin',pwd:secrets.admin,roles:['root']});
  db.getSiblingDB('admin').auth('newdrugs_admin', secrets.admin);
}
for (const env of ['prod','dev','test']) {
  const name = 'newdrugs_' + env;
  if (!db.getSiblingDB(name).getUser(name)) db.getSiblingDB(name).createUser({user:name,pwd:secrets[env],roles:[{role:'readWrite',db:name}]});
}
print('New Drugs databases ready: prod, dev, test.');
JS
chmod 600 /etc/newdrugs/bootstrap-db.js
for attempt in $(seq 1 30); do
  if mongosh --host 127.0.0.1 --port 7332 --quiet --eval 'db.adminCommand({ping:1}).ok' >/dev/null 2>&1; then break; fi
  sleep 1
done
mongosh --host 127.0.0.1 --port 7332 --quiet /etc/newdrugs/bootstrap-db.js
cat > /etc/systemd/system/newdrugs@.service <<'UNIT'
[Unit]
Description=New Drugs %i
After=network-online.target newdrugs-mongo.service
Requires=newdrugs-mongo.service
[Service]
User=newdrugs-%i
Group=newdrugs-%i
WorkingDirectory=/srv/newdrugs/%i/current
Environment=NODE_ENV=production
EnvironmentFile=/etc/newdrugs/%i.env
ExecStart=/usr/local/bin/node --max-old-space-size=192 dist/server/index.js
Restart=on-failure
RestartSec=3
TimeoutStopSec=20
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/lib/newdrugs/%i
UMask=0077
[Install]
WantedBy=multi-user.target
UNIT
cat > /etc/nginx/sites-available/newdrugs <<'NGINX'
server {
  listen 80;
  server_name druggie.org dev.druggie.org;
  location /.well-known/acme-challenge/ { root /var/www/newdrugs-acme; }
  location / { return 503; }
}
NGINX
ln -sfn /etc/nginx/sites-available/newdrugs /etc/nginx/sites-enabled/newdrugs
nginx -t
systemctl reload nginx
certbot certonly --webroot -w /var/www/newdrugs-acme -d druggie.org --non-interactive --agree-tos --register-unsafely-without-email
systemctl daemon-reload
