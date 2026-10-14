const express=require('express');
const Module=require('node:module');
const path=require('node:path');

function createMockSupabase(seed={}) {
  const tables=Object.fromEntries(Object.entries(seed).map(([key,rows])=>[key,rows.map(row=>({...row}))]));
  const calls=[];
  class Query {
    constructor(table){this.table=table;this.action='select';this.filters=[];this.payload=null;this.columns='*';}
    select(columns='*'){this.columns=columns;return this;}
    insert(payload){this.action='insert';this.payload=payload;return this;}
    update(payload){this.action='update';this.payload=payload;return this;}
    delete(){this.action='delete';return this;}
    upsert(payload){this.action='upsert';this.payload=payload;return this;}
    eq(key,value){this.filters.push(row=>row[key]===value);return this;}
    neq(key,value){this.filters.push(row=>row[key]!==value);return this;}
    gte(key,value){this.filters.push(row=>String(row[key])>=String(value));return this;}
    lte(key,value){this.filters.push(row=>String(row[key])<=String(value));return this;}
    lt(key,value){this.filters.push(row=>String(row[key])<String(value));return this;}
    gt(key,value){this.filters.push(row=>String(row[key])>String(value));return this;}
    in(key,values){this.filters.push(row=>values.includes(row[key]));return this;}
    or(expression){this.filters.push(row=>{const match=expression.match(/last_nagged_at\.lte\.([^,]+)/);return row.last_nagged_at==null||!!match&&row.last_nagged_at<=match[1];});return this;}
    order(){return this;}
    limit(n){this.max=n;return this;}
    single(){return this.run(true);}
    maybeSingle(){return this.run(true);}
    matches(row){return this.filters.every(filter=>filter(row));}
    run(single=false){
      const rows=tables[this.table]||(tables[this.table]=[]);let data=[];
      if(this.action==='insert') { for(const item of (Array.isArray(this.payload)?this.payload:[this.payload])){const row={id:`${this.table}-${rows.length+1}`,...item};rows.push(row);data.push({...row});} }
      else if(this.action==='upsert'){const row={...this.payload};rows.push(row);data=[row];}
      else if(this.action==='update'){for(const row of rows.filter(r=>this.matches(r))){Object.assign(row,this.payload);data.push({...row});}}
      else if(this.action==='delete'){const removed=rows.filter(r=>this.matches(r));tables[this.table]=rows.filter(r=>!this.matches(r));data=removed.map(r=>({...r}));}
      else data=rows.filter(r=>this.matches(r)).map(r=>({...r}));
      if(this.max!==undefined)data=data.slice(0,this.max);
      calls.push({table:this.table,action:this.action,payload:this.payload,filters:this.filters.length});
      return Promise.resolve({data:single?(data[0]||null):data,error:null});
    }
    then(resolve,reject){return this.run().then(resolve,reject);}
  }
  return {tables,calls,from(table){return new Query(table);},async rpc(name,args){calls.push({rpc:name,args});return {data:'plan-mock-1',error:null};},storage:{from(){return {upload:async()=>({data:{},error:null}),createSignedUrl:async()=>({data:{signedUrl:'https://signed.test/file'},error:null})};}}};
}

async function startApi(routerPath,db,mocks={}){
  const routerFile=path.resolve(__dirname,'../../src/routes',routerPath);
  delete require.cache[routerFile];
  const original=Module._load;
  Module._load=function(request,parent,isMain){
    if(parent?.filename===routerFile&&request==='../db')return db;
    if(parent?.filename===routerFile&&request==='../auth')return {requireAuth:(req,res,next)=>{req.user={id:'user-1',name:'Test'};next();}};
    if(mocks[request]&&parent?.filename===routerFile)return mocks[request];
    return original.apply(this,arguments);
  };
  let router;
  try{router=require(routerFile);}finally{Module._load=original;}
  const app=express();app.use(express.json());app.use('/api',router);
  const server=await new Promise(resolve=>{const instance=app.listen(0,'127.0.0.1',()=>resolve(instance));});
  const base=`http://127.0.0.1:${server.address().port}/api`;
  return {base,server,close:()=>new Promise(resolve=>server.close(resolve))};
}
async function request(base,route,method='GET',body){const response=await fetch(base+route,{method,headers:{'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});let data;try{data=await response.json();}catch{data=await response.text();}return{status:response.status,data};}
module.exports={createMockSupabase,startApi,request};
