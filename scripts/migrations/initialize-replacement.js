// Run with mongosh on the empty replacement only. Credentials stay in its
// root-owned copied configuration; no password is passed on the command line.
const fs = require('fs');
const secrets = JSON.parse(fs.readFileSync('/etc/newdrugs/database.json', 'utf8'));
try { rs.status(); } catch (error) {
  if (error.codeName === 'NotYetInitialized') rs.initiate({_id:'rs0',members:[{_id:0,host:'127.0.0.1:7332'}]});
  else if (error.codeName !== 'Unauthorized') throw error;
}
for(let i=0;i<60&&!db.hello().isWritablePrimary;i++)sleep(500);
if(!db.hello().isWritablePrimary)throw Error('Replacement is not primary.');
const admin=db.getSiblingDB('admin');
let authenticated=false;try{authenticated=Boolean(admin.auth('newdrugs_admin',secrets.admin));}catch{}
if(!authenticated){admin.createUser({user:'newdrugs_admin',pwd:secrets.admin,roles:['root']});admin.auth('newdrugs_admin',secrets.admin);}
const test=db.getSiblingDB('newdrugs_test');
if(!test.getUser('newdrugs_test'))test.createUser({user:'newdrugs_test',pwd:secrets.test,roles:[{role:'readWrite',db:'newdrugs_test'}]});
print('Replacement replica set and isolated test account ready.');
