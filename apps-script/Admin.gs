/* Add this file to the existing Apps Script project. No DB identifier or password belongs here.
 * In the existing doPost, immediately after `const req=JSON.parse(raw);`, add:
 * const adminResult=adminApi_(req);if(adminResult!==null)return output_(adminResult);
 */
const ADMIN_CONTENT_KEYS_ = ['siteTitle','heroTitle1','heroTitle2','heroIntro','eventDate','eventTime','eventLocation','hostName','organizers','contactEmail','contactPhone','privacyController','privacyRetention','mediaUsageScope','registrationEnabled'];

function adminPublicContent_() {
  const settings = settings_(), content = {};
  ADMIN_CONTENT_KEYS_.forEach(function(key) { if (settings[key] !== undefined) content[key] = settings[key]; });
  return content;
}

function adminApi_(req) {
  if (req.action === 'getPublicContent') return {ok:true, content:adminPublicContent_()};
  if (['adminGetContent','adminSaveContent','adminList','adminUpdateRegistration'].indexOf(req.action) < 0) return null;
  // The existing server verifies the password and applies its failure limit.
  adminSummary_(req);
  if (req.action === 'adminGetContent') return {ok:true, content:adminPublicContent_(), revision:settings_().adminContentRevision || ''};
  if (req.action === 'adminSaveContent') return adminSaveContent_(req);
  if (req.action === 'adminList') return adminList_(req);
  return adminUpdateRegistration_(req);
}

function adminSaveContent_(req) {
  const input = req.content;
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('수정 내용을 확인해 주세요.');
  if (Object.keys(input).some(function(key) {return ADMIN_CONTENT_KEYS_.indexOf(key)<0;})) throw new Error('수정할 수 없는 항목입니다.');
  const cleaned = {};
  Object.keys(input).forEach(function(key) {
    if (typeof input[key] !== 'string' || input[key].length > (key==='heroIntro'||key==='mediaUsageScope'?2000:500)) throw new Error('입력 길이와 형식을 확인해 주세요.');
    cleaned[key] = input[key].trim();
  });
  if (cleaned.registrationEnabled !== undefined && ['TRUE','FALSE'].indexOf(cleaned.registrationEnabled)<0) throw new Error('접수 상태를 확인해 주세요.');
  if (cleaned.contactEmail !== undefined && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleaned.contactEmail)) throw new Error('문의 이메일을 확인해 주세요.');
  if (cleaned.contactPhone !== undefined && !/^\+?[0-9() -]{8,25}$/.test(cleaned.contactPhone)) throw new Error('문의 전화번호를 확인해 주세요.');
  ['siteTitle','heroTitle1','heroTitle2','eventDate','eventTime','eventLocation','hostName','organizers','privacyRetention'].forEach(function(key) {
    if (cleaned[key] !== undefined && !cleaned[key]) throw new Error('필수 행사 정보를 입력해 주세요.');
  });
  const lock=LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error('다른 작업이 진행 중입니다. 잠시 후 다시 시도해 주세요.');
  try {
    const current=settings_();
    if (typeof req.revision!=='string'||req.revision!==(current.adminContentRevision||'')) throw new Error('다른 관리자가 내용을 변경했습니다. 새로 불러온 뒤 다시 수정해 주세요.');
    const consentChanged=['privacyController','privacyRetention','mediaUsageScope'].some(function(key) {return cleaned[key]!==undefined&&cleaned[key]!==current[key];});
    const sheet=db_().getSheetByName('Settings');
    if (!sheet) throw new Error('Settings 시트를 확인해 주세요.');
    const rows=sheet.getDataRange().getDisplayValues();
    const revision=Utilities.getUuid();
    cleaned.adminContentRevision=revision;
    if (consentChanged) cleaned.consentVersion=new Date().toISOString();
    Object.keys(cleaned).forEach(function(key) {
      const row=rows.findIndex(function(r) {return r[0]===key;});
      if(row>=0) sheet.getRange(row+1,2).setNumberFormat('@').setValue(literal_(cleaned[key]));
      else sheet.getRange(sheet.getLastRow()+1,1,1,2).setNumberFormat('@').setValues([[key,literal_(cleaned[key])]]);
    });
    SpreadsheetApp.flush();
    return {ok:true, content:adminPublicContent_(), revision:revision};
  } finally {lock.releaseLock();}
}

function adminList_(req) {
  const query=String(req.query||'').trim().toLowerCase().slice(0,100);
  const status=req.status||'REGISTERED', attendance=req.attendance||'ALL';
  if(['ALL','REGISTERED','CANCELLED'].indexOf(status)<0||['ALL','ATTENDED','NOT_CHECKED'].indexOf(attendance)<0) throw new Error('조회 조건을 확인해 주세요.');
  const rows=db_().getSheetByName('Registrations').getDataRange().getDisplayValues().slice(1).filter(function(r) {return !!r[0];});
  const active=rows.filter(function(r) {return r[17]==='REGISTERED';});
  const matched=rows.filter(function(r) {
    return (status==='ALL'||r[17]===status)&&(attendance==='ALL'||r[15]===attendance)&&(!query||[r[0],r[2],r[3],r[4],r[5]].some(function(v) {return String(v).toLowerCase().indexOf(query)>=0;}));
  }).reverse();
  const size=25, pages=Math.max(1,Math.ceil(matched.length/size));
  const page=Math.min(pages,Math.max(1,Number(req.page)||1));
  if(!Number.isInteger(page)) throw new Error('페이지를 확인해 주세요.');
  return {ok:true, page:page, pages:pages, total:matched.length,
    summary:{count:active.length,attendanceCount:active.filter(function(r) {return r[15]==='ATTENDED';}).length,cancelledCount:rows.length-active.length},
    registrations:matched.slice((page-1)*size,page*size).map(function(r) {return {
      id:r[0],createdAt:r[1],name:r[2],organization:r[3],email:r[4],phone:r[5],morningTrack:r[6],afternoonTrack:r[7],
      mediaConsent:r[9]==='TRUE',discoverySource:r[10],futureTopics:r[11],attendance:r[15],status:r[17]
    };})};
}

function adminUpdateRegistration_(req) {
  if(typeof req.registrationId!=='string'||!req.registrationId||req.registrationId.length>60) throw new Error('접수번호를 확인해 주세요.');
  const updates=req.updates;
  if(!updates||typeof updates!=='object'||Array.isArray(updates)||!Object.keys(updates).length||Object.keys(updates).some(function(key) {return ['status','attendance'].indexOf(key)<0;})) throw new Error('변경 항목을 확인해 주세요.');
  if(updates.status!==undefined&&['REGISTERED','CANCELLED'].indexOf(updates.status)<0) throw new Error('접수 상태를 확인해 주세요.');
  if(updates.attendance!==undefined&&['ATTENDED','NOT_CHECKED'].indexOf(updates.attendance)<0) throw new Error('출석 상태를 확인해 주세요.');
  const lock=LockService.getScriptLock();
  if(!lock.tryLock(10000)) throw new Error('다른 작업이 진행 중입니다. 잠시 후 다시 시도해 주세요.');
  try {
    const sheet=db_().getSheetByName('Registrations'), rows=sheet.getDataRange().getDisplayValues();
    const index=rows.findIndex(function(r,i) {return i>0&&r[0]===req.registrationId;});
    if(index<0) throw new Error('신청 정보를 찾을 수 없습니다.');
    const row=rows[index], nextStatus=updates.status||row[17];
    if(nextStatus==='REGISTERED'&&rows.some(function(r,i) {return i>0&&i!==index&&r[4]===row[4]&&r[5]===row[5]&&r[17]==='REGISTERED';})) throw new Error('같은 연락처의 활성 접수가 있어 복원할 수 없습니다.');
    if(nextStatus==='CANCELLED'&&updates.attendance==='ATTENDED') throw new Error('취소된 신청은 출석 처리할 수 없습니다.');
    if(updates.attendance!==undefined) sheet.getRange(index+1,16).setValue(updates.attendance);
    if(updates.status!==undefined) sheet.getRange(index+1,18).setValue(updates.status);
    SpreadsheetApp.flush();
    return {ok:true,registrationId:req.registrationId};
  } finally {lock.releaseLock();}
}
