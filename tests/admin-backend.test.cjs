const {test}=require('node:test'),assert=require('node:assert/strict');const {backend}=require('./support/backend.cjs');
test('public content excludes secrets and every private action authenticates',()=>{const b=backend();assert.equal(b.call('getPublicContent',{password:''}).content.adminPassword,undefined);for(const action of ['adminGetContent','adminSaveContent','adminList','adminUpdateRegistration','adminEditRegistration','adminDeleteRegistration'])assert.throws(()=>b.call(action,{password:'wrong'}),/비밀번호/);});
test('admin can edit, change attendance, cancel and restore by primary ID with version checks',()=>{
 const b=backend();b.add();let v=b.version('2026-001');
 b.call('adminEditRegistration',{registrationId:'2026-001',version:v,data:{...b.data,organization:'새 학교'}});assert.equal(b.registrations.rows[1][3],'새 학교');assert.equal(b.registrations.rows[1][13],'v1');
 assert.throws(()=>b.call('adminUpdateRegistration',{registrationId:'2026-001',version:v,updates:{attendance:'ATTENDED'}}),/변경/);
 for(const updates of [{attendance:'ATTENDED'},{status:'CANCELLED'},{status:'REGISTERED'}])b.call('adminUpdateRegistration',{registrationId:'2026-001',version:b.version('2026-001'),updates});
 assert.equal(b.registrations.rows[1][15],'ATTENDED');assert.equal(b.registrations.rows[1][17],'REGISTERED');
});
test('deletion requires explicit confirmation and a current version',()=>{
 const b=backend();b.add();assert.throws(()=>b.call('adminDeleteRegistration',{registrationId:'2026-001',version:b.version('2026-001')}),/삭제/);assert.throws(()=>b.call('adminDeleteRegistration',{registrationId:'2026-001',version:'old',confirm:true}),/변경/);assert.equal(b.registrations.rows.length,2);b.call('adminDeleteRegistration',{registrationId:'2026-001',version:b.version('2026-001'),confirm:true});assert.equal(b.registrations.rows.length,1);
});
test('search and summary preserve schema, content edits reject private keys and stale revisions',()=>{
 const b=backend();b.add();const list=b.call('adminList',{query:'2026-001'});assert.equal(list.total,1);assert.equal(list.registrations[0].id,'2026-001');assert.equal(list.registrations[0].version,b.version('2026-001'));
 assert.throws(()=>b.call('adminSaveContent',{revision:'',content:{adminPassword:'replacement'}}),/수정할 수 없는/);
 const saved=b.call('adminSaveContent',{revision:'',content:{siteTitle:'수정 행사',privacyRetention:'6개월'}});assert.equal(saved.content.siteTitle,'수정 행사');assert.notEqual(b.ctx.settings_().consentVersion,'v1');assert.throws(()=>b.call('adminSaveContent',{revision:'',content:{siteTitle:'old'}}),/다른 관리자/);
});
