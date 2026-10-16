import fs from 'node:fs';
const app=fs.readFileSync('app.js','utf8'),premium=fs.readFileSync('premium.js','utf8');
const marker='\nstartSearchableSelectObserver();\ninit().catch';
if(!app.includes(marker))throw Error('Missing startup marker');
if(!app.includes("const SUPABASE_URL='https://spkoqjfpiurtjbfrtcvh.supabase.co';"))throw Error('Premium project identity mismatch');
if(!/const SUPABASE_KEY='sb_publishable_[A-Za-z0-9_-]+';/.test(app))throw Error('Premium requires a publishable key');
fs.mkdirSync('dist',{recursive:true});
const bundle=app.replace(marker,'\n'+premium+marker);
fs.writeFileSync('dist/flowbiz-premium.js',bundle);
for(const name of ['index.html','styles.css','master-admin-enhancements.js','master-admin-enhancements.css','support-selfservice-enhancements.js'])fs.copyFileSync(name,'dist/'+name);
if(/ifanefgaiuzkbjtttiqn/.test(bundle+fs.readFileSync('dist/index.html','utf8')))throw Error('Standard endpoint in runtime');
console.log('Premium bundle built; Standard endpoints absent');

for(const name of fs.readdirSync('dist')){
 const text=fs.readFileSync('dist/'+name,'utf8');
 if(/sb_secret_[A-Za-z0-9_-]+/.test(text))throw Error('Secret key in browser assets');
 for(const token of text.match(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g)||[]){
  let claims;try{claims=JSON.parse(Buffer.from(token.split('.')[1],'base64url'))}catch{throw Error('Unrecognized JWT in browser assets')}
  if(claims.role==='service_role')throw Error('Service role JWT in browser assets');
 }
}
