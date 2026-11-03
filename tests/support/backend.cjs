const fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto'),path=require('node:path');
function sheet(data){const rows=data.map(r=>[...r]);return {rows,getLastRow:()=>rows.length,getDataRange:()=>({getDisplayValues:()=>rows.map(r=>[...r])}),deleteRow:r=>rows.splice(r-1,1),getRange(r,c,h=1,w=1){const range={setNumberFormat:()=>range,setValue:value=>range.setValues([[value]]),setValues(values){values.forEach((row,i)=>{if(!rows[r-1+i])rows[r-1+i]=[];row.forEach((v,j)=>rows[r-1+i][c-1+j]=v);});return range;}};return range;}};}
function backend(){
 const settings=sheet([['key','value'],['adminPassword','test-only-password'],['registrationEnabled','TRUE'],['consentVersion','v1'],['privacyRetention','3개월'],['mediaUsageScope','행사 소개'],['contactEmail','office@example.com']]);
 const programs=sheet([['id','period','time','title','active'],['AM1','AM','','오전 실습','TRUE'],['PM1','PM','','오후 실습','TRUE']]);
 const registrations=sheet([['ID',...Array(17).fill('header'),'요청키']]);const cache=new Map(),properties=new Map();let held=false;
 const cacheApi={get:key=>cache.get(key)||null,put:(key,value)=>cache.set(key,value),remove:key=>cache.delete(key)};
 const ctx=vm.createContext({
  db_:()=>({getSheetByName:name=>({Settings:settings,Programs:programs,Registrations:registrations})[name]}),
  settings_:()=>Object.fromEntries(settings.rows.slice(1)),
  clean_:(v,max,label)=>{if(typeof v!=='string'||!v.trim()||v.trim().length>max)throw new Error(label+' 확인');return v.trim();},
  literal_:v=>/^[=+\-@]/.test(v)?"'"+v:v,
  adminSummary_:req=>{if(req.password!=='test-only-password')throw new Error('비밀번호가 올바르지 않습니다.');return {ok:true};},
  SpreadsheetApp:{flush(){}},CacheService:{getScriptCache:()=>cacheApi},
  PropertiesService:{getScriptProperties:()=>({getProperty:key=>properties.get(key)||null,setProperty:(key,v)=>properties.set(key,v)})},
  LockService:{getScriptLock:()=>({tryLock:()=>{if(held)return false;held=true;return true;},releaseLock:()=>{held=false;}})},
  Utilities:{getUuid:()=>crypto.randomUUID(),DigestAlgorithm:{SHA_256:'sha256'},Charset:{UTF_8:'utf8'},computeDigest:(a,v)=>crypto.createHash('sha256').update(v).digest(),base64EncodeWebSafe:v=>Buffer.from(v).toString('base64url')}
 });
 for(const filename of ['Registration.gs','Admin.gs','Participant.gs'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../../apps-script',filename),'utf8'),ctx);
 const data={name:'테스트 참가자',organization:'학교',email:'test@example.com',phone:'010-1234-5678',morningTrack:'오전 실습',afternoonTrack:'오후 실습',consent:'동의합니다.',certificate:true,mediaConsent:'동의하지 않습니다.',discoverySource:'기타',futureTopics:'AI 교육'};
 const request={requestId:crypto.randomUUID(),consentVersion:'v1',data};
 const add=(changes={})=>ctx.registerSequential_({...request,requestId:crypto.randomUUID(),data:{...data,...changes}});
 const call=(action,extra={})=>ctx.adminApi_({action,password:'test-only-password',...extra});
 const version=id=>ctx.registrationVersion_(registrations.rows.find(r=>r[0]===id));
 return {ctx,settings,programs,registrations,cache,properties,data,request,add,call,version};
}
module.exports={backend};
