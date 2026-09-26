import express,{type Express} from 'express';
import {resolve} from 'node:path';

export function mountAdminFrontend(app:Express,directory=resolve('dist/admin')){
  // String routes also match a trailing slash in Express's default non-strict mode.
  // Only the bare path should redirect; /admin/ must reach the SPA below.
  app.get(/^\/admin$/i,(_req,res)=>{res.redirect('/admin/');});
  app.use('/admin',express.static(directory,{index:false}));
  app.get('/admin/{*path}',(_req,res)=>{res.set('Cache-Control','no-cache');res.sendFile(resolve(directory,'index.html'));});
}
