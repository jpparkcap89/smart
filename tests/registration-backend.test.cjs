const {test}=require('node:test'),assert=require('node:assert/strict');
const {backend}=require('./support/backend.cjs');
test('primary IDs are sequential and retries reuse the same ID',()=>{
 const b=backend();assert.equal(b.ctx.siteRequest_({action:'getCapabilities'}).idFormat,'2026-000');const first=b.ctx.siteRequest_({action:'register',...b.request});assert.equal(first.registrationId,'2026-001');assert.equal(first.requestId,b.request.requestId);
 assert.equal(b.ctx.registerSequential_(b.request).duplicate,true);assert.equal(b.registrations.rows.length,2);assert.equal(b.registrations.rows[1][0],'2026-001');assert.equal(b.registrations.rows[1][18],b.request.requestId);
 const second=b.add({email:'second@example.com'});assert.equal(second.registrationId,'2026-002');
 b.call('adminDeleteRegistration',{registrationId:second.registrationId,version:b.version(second.registrationId),confirm:true});
 assert.equal(b.add({email:'third@example.com'}).registrationId,'2026-003');
});
test('deleted submissions cannot be recreated by replaying their old request key',()=>{
 const b=backend();b.ctx.registerSequential_(b.request);b.call('adminDeleteRegistration',{registrationId:'2026-001',version:b.version('2026-001'),confirm:true});assert.throws(()=>b.ctx.registerSequential_(b.request),/삭제된 신청/);assert.equal(b.registrations.rows.length,1);
});
test('invalid values, duplicate active contacts and incompatible IDs are rejected without overwriting data',()=>{
 const b=backend();for(const patch of [{consent:'동의하지 않습니다.'},{certificate:false},{morningTrack:'wrong'},{email:'invalid'}])assert.throws(()=>b.add(patch));
 b.add();assert.throws(()=>b.add(),/이미 접수/);const before=JSON.stringify(b.registrations.rows);
 b.registrations.rows[1][0]='old-uuid';assert.throws(()=>b.add({email:'other@example.com'}),/ID 형식/);assert.equal(b.registrations.rows.length,2);
});
test('counter recovers existing maximum and supports more than 999 IDs',()=>{
 const b=backend();b.properties.set('registrationIdCounter2026','999');assert.equal(b.add().registrationId,'2026-1000');b.properties.set('registrationIdCounter2026','0');assert.equal(b.add({email:'other@example.com'}).registrationId,'2026-1001');
});
test('participant lookup uses exact identity, rate limits by name, and never chooses an ambiguous match',()=>{
 const b=backend();b.add();
 for(let i=0;i<5;i++)assert.throws(()=>b.ctx.participantLookup_({name:b.data.name,last4:'000'+i}),/확인하지 못/);
 assert.throws(()=>b.ctx.participantLookup_({name:b.data.name,last4:'5678'}),/10분/);
 b.cache.clear();b.add({email:'other@example.com',phone:'010-9999-5678'});assert.throws(()=>b.ctx.participantLookup_({name:b.data.name,last4:'5678'}),/여러 건/);
});
test('participant token can update only its record and expires or rejects changed records',()=>{
 const b=backend();b.add();const session=b.ctx.participantLookup_({name:b.data.name,last4:'5678'});assert.equal(session.registrationId,'2026-001');assert.equal(session.token.length,64);
 const update={token:session.token,consentVersion:'v1',data:{...b.data,organization:'변경 학교',phone:'010-2222-3333'}};
 assert.equal(b.ctx.participantUpdate_(update).registrationId,'2026-001');assert.equal(b.registrations.rows[1][3],'변경 학교');assert.equal(b.registrations.rows[1][15],'NOT_CHECKED');assert.equal(b.registrations.rows.length,2);
 b.registrations.rows[1][15]='ATTENDED';assert.throws(()=>b.ctx.participantUpdate_(update),/변경/);
 assert.throws(()=>b.ctx.participantUpdate_(update),/만료/);
});
