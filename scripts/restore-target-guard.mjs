// Reject libpq overrides before any connection or destructive operation.
export function projectRef(apiUrl){
  let u;try{u=new URL(apiUrl)}catch{throw Error('Invalid Supabase URL')}
  const ref=u.hostname.match(/^([a-z0-9-]+)\.supabase\.co$/)?.[1];
  if(u.protocol!=='https:'||!ref||u.username||u.password||u.port||u.pathname!=='/'||u.search||u.hash)throw Error('Invalid Supabase project URL');
  return ref;
}
export function assertDatabaseProject(databaseUrl,ref){
  let u;try{u=new URL(databaseUrl)}catch{throw Error('Invalid database URL')}
  if(!['postgres:','postgresql:'].includes(u.protocol)||u.hash||u.pathname!=='/postgres'||!u.username||(u.port&&u.port!=='5432'))throw Error('Invalid PostgreSQL connection; use postgres database and port 5432');
  const allowed=new Set(['sslmode','connect_timeout','application_name']),seen=new Set();
  for(const [k,v] of u.searchParams){
    if(!allowed.has(k)||seen.has(k))throw Error('Unsupported or duplicate database connection parameter');
    seen.add(k);
    if(k==='sslmode'&&!['require','verify-full'].includes(v))throw Error('TLS must be required');
    if(k==='connect_timeout'&&!/^([1-9]|[1-5][0-9]|60)$/.test(v))throw Error('Invalid connection timeout');
  }
  const user=decodeURIComponent(u.username);
  const direct=u.hostname===`db.${ref}.supabase.co`&&user==='postgres';
  const pooler=/^aws-[0-9]+-[a-z0-9-]+\.pooler\.supabase\.com$/.test(u.hostname)&&user===`postgres.${ref}`;
  if(!direct&&!pooler)throw Error('Database endpoint does not match the designated Supabase project');
  if(!seen.has('sslmode'))u.searchParams.set('sslmode','require');
  if(!seen.has('connect_timeout'))u.searchParams.set('connect_timeout','10');
  return u.toString();
}
export function assertRestoreTarget(targetDatabaseUrl,targetSupabaseUrl,sourceSupabaseUrl,sourceDatabaseUrl,expectedTargetRef){
  const target=projectRef(targetSupabaseUrl),source=projectRef(sourceSupabaseUrl);
  if(!expectedTargetRef||target!==expectedTargetRef)throw Error('Target is not the explicitly approved TEST project');
  if(target===source)throw Error('Refusing restore into the source Supabase project');
  assertDatabaseProject(targetDatabaseUrl,target);
  if(sourceDatabaseUrl)assertDatabaseProject(sourceDatabaseUrl,source);
  return target;
}

