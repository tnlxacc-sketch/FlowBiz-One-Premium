#!/usr/bin/env node
// FlowBiz One commercial backup utility.
// Requires Node 20+, pg_dump, pg_restore, psql and tar.
// Secrets are read from environment only and must never be committed.
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { chmod, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { projectRef, assertDatabaseProject } from './restore-target-guard.mjs';
import { pgEnvironment } from './pg-safe-env.mjs';

const {
  DATABASE_URL,SUPABASE_URL,SUPABASE_SERVICE_ROLE_KEY,COMPANY_ID,BACKUP_DIRECTORY,
  BACKUP_KIND='MANUAL',PERIOD_LABEL='',CLOSED_YEAR=''
}=process.env;
if(SUPABASE_URL!=='https://spkoqjfpiurtjbfrtcvh.supabase.co')throw Error('Premium backup only');
const allowedKinds=new Set(['MANUAL','MONTHLY','PRE_GO_LIVE','YEAR_END']);
if (![DATABASE_URL,SUPABASE_URL,SUPABASE_SERVICE_ROLE_KEY,COMPANY_ID,BACKUP_DIRECTORY].every(Boolean)
  || !/^[0-9a-f-]{36}$/i.test(COMPANY_ID) || !allowedKinds.has(BACKUP_KIND)
  || (BACKUP_KIND==='YEAR_END'&&!/^20\d\d$/.test(CLOSED_YEAR))) {
  throw new Error('Set DATABASE_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, COMPANY_ID, BACKUP_DIRECTORY and valid BACKUP_KIND. YEAR_END also requires CLOSED_YEAR.');
}

const sourceProjectRef=projectRef(SUPABASE_URL);
const safeDatabaseUrl=assertDatabaseProject(DATABASE_URL,sourceProjectRef);
const sourceEnv=pgEnvironment(process.env,{readOnly:true});
const root=resolve(BACKUP_DIRECTORY);
await mkdir(root,{recursive:true,mode:0o700});await chmod(root,0o700);
const stamp=new Date().toISOString().replace(/[:.]/g,'-');
const label=(PERIOD_LABEL||CLOSED_YEAR||stamp.slice(0,10)).replace(/[^A-Za-z0-9._-]/g,'_');
const name=`FlowBizOne-${COMPANY_ID}-${BACKUP_KIND}-${label}-${stamp}`;
const work=join(root,name);await mkdir(work,{mode:0o700});
const dbFile=join(work,'database.dump'),podDir=join(work,'pods');await mkdir(podDir);

const run=(cmd,args,opts={})=>new Promise((ok,fail)=>{
  const {input,...spawnOptions}=opts;
  const child=spawn(cmd,args,{stdio:[input===undefined?'ignore':'pipe','pipe','pipe'],...spawnOptions,env:sourceEnv});
  let out='',err='';child.stdout.on('data',x=>out+=x);child.stderr.on('data',x=>err+=x);
  if(input!==undefined)child.stdin.end(input);
  child.on('error',fail);
  child.on('close',code=>code===0?ok(out.trim()):fail(new Error(`${cmd}: ${err.slice(-4000)}`)));
});
const sql=async(query,variables={})=>run('psql',[
  '--no-psqlrc','--set=ON_ERROR_STOP=1','--tuples-only','--no-align','--dbname',safeDatabaseUrl,
  ...Object.entries(variables).flatMap(([k,v])=>['-v',`${k}=${v}`]),'-f','-'
],{input:query+'\n'});
const hash=async file=>{const {createReadStream}=await import('node:fs');const h=createHash('sha256');for await(const chunk of createReadStream(file))h.update(chunk);return h.digest('hex')};
const headers={Authorization:`Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,apikey:SUPABASE_SERVICE_ROLE_KEY,'Content-Type':'application/json'};
const storageBase=`${SUPABASE_URL.replace(/\/$/,'')}/storage/v1`;

async function list(prefix){
  const entries=[];
  for(let offset=0;;offset+=1000){
    const res=await fetch(`${storageBase}/object/list/pod-documents`,{method:'POST',headers,body:JSON.stringify({prefix,limit:1000,offset,sortBy:{column:'name',order:'asc'}})});
    if(!res.ok)throw new Error(`POD list failed: ${res.status}`);
    const page=await res.json();entries.push(...page);
    if(page.length<1000)break;
  }
  return entries;
}
async function collect(prefix){
  const files=[];
  for(const entry of await list(prefix)){
    const path=`${prefix}/${entry.name}`;
    if(entry.id)files.push(path);else files.push(...await collect(path));
  }
  return files;
}
async function snapshot(){
  const raw=await sql(`
select json_build_object(
 'audit_max_id',(select coalesce(max(id),0) from public.audit_logs where company_id=:'company_id'::uuid),
 'pod_metadata_count',(select count(*) from public.delivery_documents where company_id=:'company_id'::uuid),
 'table_counts',json_build_object(
   'customers',(select count(*) from public.customers where company_id=:'company_id'::uuid),
   'products',(select count(*) from public.products where company_id=:'company_id'::uuid),
   'product_warehouse_minimums',(select count(*) from public.product_warehouse_minimums where company_id=:'company_id'::uuid),
   'warehouses',(select count(*) from public.warehouses where company_id=:'company_id'::uuid),
   'orders',(select count(*) from public.orders where company_id=:'company_id'::uuid),
   'order_lines',(select count(*) from public.order_lines where company_id=:'company_id'::uuid),
   'invoices',(select count(*) from public.invoices where company_id=:'company_id'::uuid),
   'delivery_trips',(select count(*) from public.delivery_trips where company_id=:'company_id'::uuid),
   'stock_balances',(select count(*) from public.stock_balances where company_id=:'company_id'::uuid),
   'stock_movements',(select count(*) from public.stock_movements where company_id=:'company_id'::uuid),
   'audit_logs',(select count(*) from public.audit_logs where company_id=:'company_id'::uuid)
 ),
 'financial_totals',json_build_object(
   'revenue',(select coalesce(sum(revenue),0) from public.invoices where company_id=:'company_id'::uuid),
   'product_cost',(select coalesce(sum(product_cost),0) from public.invoices where company_id=:'company_id'::uuid),
   'freight_cost',(select coalesce(sum(freight_cost),0) from public.invoices where company_id=:'company_id'::uuid),
   'other_cost',(select coalesce(sum(other_cost),0) from public.invoices where company_id=:'company_id'::uuid)
 )
)::text
`,{company_id:COMPANY_ID});
  return JSON.parse(raw);
}

try{
  const before=await snapshot();
  await run('pg_dump',['--dbname',safeDatabaseUrl,'--format=custom','--no-owner','--no-acl','--file',dbFile]);
  await run('pg_restore',['--list',dbFile]);

  const pods=await collect(COMPANY_ID),objects=[];
  let next=0;
  await Promise.all(Array.from({length:Math.min(6,Math.max(1,pods.length))},async()=>{
    while(next<pods.length){
      const path=pods[next++],url=`${storageBase}/object/authenticated/pod-documents/${path.split('/').map(encodeURIComponent).join('/')}`;
      const res=await fetch(url,{headers:{Authorization:headers.Authorization,apikey:headers.apikey}});
      if(!res.ok||!res.body)throw new Error(`POD download failed: ${res.status} ${path}`);
      const filename=createHash('sha256').update(path).digest('hex'),local=join(podDir,filename);
      await pipeline(res.body,createWriteStream(local));
      objects.push({path,file:`pods/${filename}`,sha256:await hash(local)});
    }
  }));

  const after=await snapshot();
  if(before.audit_max_id!==after.audit_max_id||before.pod_metadata_count!==after.pod_metadata_count||pods.length<after.pod_metadata_count)
    throw new Error('Data changed during backup or POD files are missing. Archive retained for investigation and is NOT registered.');

  const projectRef=(SUPABASE_URL.match(/https:\/\/([^.]+)\.supabase\.co/i)||[])[1]||null;
  const manifest={
    format_version:2,product:'FlowBiz One',company_id:COMPANY_ID,backup_kind:BACKUP_KIND,
    period_label:PERIOD_LABEL||null,closed_year:BACKUP_KIND==='YEAR_END'?Number(CLOSED_YEAR):null,
    source_project_ref:projectRef,source_supabase_url:SUPABASE_URL.replace(/\/$/,''),
    database_sha256:await hash(dbFile),audit_max_id:after.audit_max_id,pod_metadata_count:after.pod_metadata_count,
    table_counts:after.table_counts,financial_totals:after.financial_totals,
    pod_objects:objects.sort((a,b)=>a.path.localeCompare(b.path)),created_at:new Date().toISOString()
  };
  await writeFile(join(work,'manifest.json'),JSON.stringify(manifest,null,2),{mode:0o600});

  const archive=join(root,`${basename(work)}.tar.gz`);
  await run('tar',['-czf',archive,'-C',root,basename(work)]);
  await run('tar',['-tzf',archive]);
  const sha256=await hash(archive);

  // Read-only backup: evidence stays in the archive; never register on source.
  await chmod(archive,0o600);

  await rm(work,{recursive:true,force:true});
  process.stdout.write(JSON.stringify({archive,sha256,backup_kind:BACKUP_KIND,company_id:COMPANY_ID,pod_objects:objects.length,table_counts:manifest.table_counts,source_registry_updated:false})+'\n');
}catch(error){
  process.stderr.write(`Backup stopped: ${error.message}\nFiles retained at ${work}\n`);
  process.exitCode=1;
}

