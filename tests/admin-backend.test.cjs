const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
function sheet(data){
 const rows=data.map(row=>[...row]);
 return {rows,getLastRow:()=>rows.length,getDataRange:()=>({getDisplayValues:()=>rows.map(row=>[...row])}),getRange(r,c,h=1,w=1){
  const range={setNumberFormat:()=>range,setValue:value=>range.setValues([[value]]),setValues(values){values.forEach((row,i)=>{if(!rows[r-1+i])rows[r-1+i]=[];row.forEach((value,j)=>{rows[r-1+i][c-1+j]=value;});});return range;}};return range;
 }};
}
function backend(){
 const settings=sheet([['key','value'],['adminPassword','test-only-password'],['contactEmail','office@example.com'],['registrationEnabled','TRUE'],['privacyRetention','3개월'],['mediaUsageScope',''],['consentVersion','v1']]);
 const row=(id,name,status='REGISTERED')=>[id,'2026-11-03',name,'학교',id+'@example.com','010-1234-5678','AM1','PM1','TRUE','FALSE','기타','AI','TRUE','v1','','NOT_CHECKED','',status];
 const registrations=sheet([Array(18).fill('header'),row('id-one','테스트 1'),row('id-two','테스트 2','CANCELLED')]);
 let locks=0,releases=0;
 const context=vm.createContext({
  settings_:()=>Object.fromEntries(settings.rows.slice(1)),
  db_:()=>({getSheetByName:name=>name==='Settings'?settings:registrations}),
  adminSummary_:req=>{if(req.password!=='test-only-password')throw new Error('비밀번호가 올바르지 않습니다.');return {ok:true};},
  literal_:value=>/^[=+\-@]/.test(value)?"'"+value:value,
  SpreadsheetApp:{flush(){}},Utilities:{getUuid:()=> 'revision-'+(locks+1)},
  LockService:{getScriptLock:()=>({tryLock:()=>{locks++;return true;},releaseLock:()=>{releases++;}})}
 });
 vm.runInContext(fs.readFileSync(require.resolve('../apps-script/Admin.gs'),'utf8'),context);
 return {settings,registrations,context,call:(action,data={})=>context.adminApi_({action,password:'test-only-password',...data}),releases:()=>releases};
}
test('anonymous public content excludes password and all private actions require existing server authentication',()=>{
 const b=backend();assert.equal(b.call('getPublicContent',{password:''}).content.adminPassword,undefined);
 for(const action of ['adminGetContent','adminSaveContent','adminList','adminUpdateRegistration'])assert.throws(()=>b.call(action,{password:'wrong'}),/비밀번호/);
 assert.equal(b.call('register'),null);
});
test('list filters, pagination, summary and photo refusal map existing 18-column schema',()=>{
 const b=backend();let result=b.call('adminList');assert.equal(result.total,1);assert.equal(result.summary.count,1);assert.equal(result.summary.cancelledCount,1);assert.equal(result.registrations[0].mediaConsent,false);
 result=b.call('adminList',{status:'ALL',query:'테스트 2',page:10});assert.equal(result.total,1);assert.equal(result.page,1);assert.equal(result.registrations[0].id,'id-two');
 assert.throws(()=>b.call('adminList',{status:'invented'}));
});
test('attendance, cancellation and restore target IDs and preserve applicant fields',()=>{
 const b=backend();const original=[...b.registrations.rows[1]];
 b.call('adminUpdateRegistration',{registrationId:'id-one',updates:{attendance:'ATTENDED'}});assert.equal(b.registrations.rows[1][15],'ATTENDED');
 b.call('adminUpdateRegistration',{registrationId:'id-one',updates:{status:'CANCELLED'}});assert.equal(b.registrations.rows[1][17],'CANCELLED');
 assert.throws(()=>b.call('adminUpdateRegistration',{registrationId:'id-one',updates:{attendance:'ATTENDED'}}),/취소/);
 b.call('adminUpdateRegistration',{registrationId:'id-one',updates:{status:'REGISTERED'}});assert.equal(b.registrations.rows[1][17],'REGISTERED');
 assert.deepEqual(b.registrations.rows[1].slice(0,15),original.slice(0,15));
 assert.throws(()=>b.call('adminUpdateRegistration',{registrationId:'id-one',updates:{email:'other@example.com'}}));
 assert.throws(()=>b.call('adminUpdateRegistration',{registrationId:'not-found',updates:{status:'CANCELLED'}}));
});
test('restore cannot create duplicate active contacts',()=>{
 const b=backend();b.registrations.rows[2][4]=b.registrations.rows[1][4];b.registrations.rows[2][5]=b.registrations.rows[1][5];
 assert.throws(()=>b.call('adminUpdateRegistration',{registrationId:'id-two',updates:{status:'REGISTERED'}}),/활성 접수/);assert.equal(b.registrations.rows[2][17],'CANCELLED');
});
test('content writes are whitelisted, revision-checked and consent changes advance version',()=>{
 const b=backend();assert.throws(()=>b.call('adminSaveContent',{revision:'',content:{adminPassword:'replacement'}}),/수정할 수 없는/);
 assert.throws(()=>b.call('adminSaveContent',{revision:'old',content:{siteTitle:'행사'}}),/다른 관리자/);
 let result=b.call('adminSaveContent',{revision:'',content:{siteTitle:'새 행사',contactPhone:'02-851-9392',privacyRetention:'6개월'}});
 assert.equal(result.content.siteTitle,'새 행사');assert.equal(result.content.privacyRetention,'6개월');
 assert.notEqual(b.context.settings_().consentVersion,'v1');assert.equal(b.context.settings_().adminPassword,'test-only-password');
 assert.throws(()=>b.call('adminSaveContent',{revision:'',content:{siteTitle:'오래된 수정'}}),/다른 관리자/);
 assert.throws(()=>b.call('adminSaveContent',{revision:result.revision,content:{contactEmail:'javascript:alert(1)'}}),/이메일/);
});
