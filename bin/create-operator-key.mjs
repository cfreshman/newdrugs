#!/usr/bin/env node
// Host-console only. Pipe stdout into a private credential file, never a log.
import { randomBytes, createHash } from 'node:crypto';
import { MongoClient } from 'mongodb';
const stages = (process.argv[2] || '').split(',');
if (!stages.length || stages.some(stage => !['dev', 'prod'].includes(stage)) || !process.env.MONGODB_URI) throw new Error('Load the private service environment and specify dev, prod, or dev,prod.');
if (process.stdout.isTTY) throw new Error('Redirect this secret into a private file or credential importer.');
const token = `nd_admin_${randomBytes(32).toString('base64url')}`, keyId = createHash('sha256').update(token).digest('hex');
const client = new MongoClient(process.env.MONGODB_URI);
try {
  await client.connect();
  await client.db(process.env.STARTER_POOL_DB || 'newdrugs_shared').collection('adminCliKeys').insertOne({ _id: keyId, label: process.argv[3] || 'Host operator', stages, createdAt: new Date().toISOString(), revokedAt: null });
  process.stdout.write(JSON.stringify({ token, keyId, stages }));
} finally { await client.close(); }
