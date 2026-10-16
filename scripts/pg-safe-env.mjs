export function pgEnvironment(env=process.env,{readOnly=false}={}){
  const result={...env};
  for(const key of Object.keys(result))if(key.startsWith('PG'))delete result[key];
  result.PGOPTIONS=readOnly?'-c default_transaction_read_only=on':'';
  result.PGSSLMODE='require';
  return result;
}
