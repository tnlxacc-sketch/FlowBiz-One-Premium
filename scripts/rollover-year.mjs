#!/usr/bin/env node
// Use after verifying and copying the registered archive offsite.
// Direct PostgreSQL execution avoids HTTP RPC timeouts on large years.
import { spawn } from 'node:child_process';
import { assertDatabaseProject } from './restore-target-guard.mjs';
const { DATABASE_URL, ADMIN_USER_ID, COMPANY_CODE, CLOSED_YEAR, ARCHIVE_SHA256, ROLLOVER_REASON }=process.env;
if (![DATABASE_URL,ADMIN_USER_ID,COMPANY_CODE,CLOSED_YEAR,ARCHIVE_SHA256,ROLLOVER_REASON].every(Boolean)
  || !/^[0-9a-f-]{36}$/i.test(ADMIN_USER_ID) || !/^20\d\d$/.test(CLOSED_YEAR)
  || !/^[a-f0-9]{64}$/i.test(ARCHIVE_SHA256) || ROLLOVER_REASON.trim().length<10)
  throw new Error('Set DATABASE_URL, ADMIN_USER_ID, COMPANY_CODE, CLOSED_YEAR, ARCHIVE_SHA256, ROLLOVER_REASON');
assertDatabaseProject(DATABASE_URL,'spkoqjfpiurtjbfrtcvh');
const child=spawn('psql',['--no-psqlrc','--set=ON_ERROR_STOP=1','--dbname',DATABASE_URL,
  ...Object.entries({admin_id:ADMIN_USER_ID,company_code:COMPANY_CODE,closed_year:CLOSED_YEAR,
    archive_hash:ARCHIVE_SHA256.toLowerCase(),reason:ROLLOVER_REASON}).flatMap(([key,value])=>['-v',`${key}=${value}`]),
  '-f','-'],{stdio:['pipe','inherit','inherit']});
child.stdin.end(`begin;
set local statement_timeout=0;
set local role authenticated;
set local request.jwt.claim.sub=:'admin_id';
select public.admin_rollover_year(:'closed_year'::integer,:'archive_hash',:'company_code',:'reason');
commit;\n`);
child.on('error',error=>{process.stderr.write(`${error.message}\n`);process.exitCode=1});
child.on('exit',code=>{if(code)process.exitCode=code});
