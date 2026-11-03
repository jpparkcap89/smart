/* Route the existing doPost through siteRequest_(req). Keep the existing DB_ID/db_/settings_ helpers. */
function siteRequest_(req){
  if(!req||typeof req!=='object'||Array.isArray(req))throw new Error('올바르지 않은 요청입니다.');
  if(req.action==='getCapabilities')return {ok:true,idFormat:'2026-000',participantEditing:true,adminEditing:true};
  if(req.action==='register')return registerSequential_(req);
  const participant=participantApi_(req);if(participant!==null)return participant;
  const admin=adminApi_(req);if(admin!==null)return admin;
  if(req.action==='adminSummary')return adminSummary_(req);
  throw new Error('지원하지 않는 요청입니다.');
}
function validateRegistrationData_(data, settings, consentVersion) {
  if(consentVersion!==settings.consentVersion)throw new Error('동의 문구가 변경되었습니다. 새로고침해 주세요.');
  const d=data||{}, value={};
  [['name',40,'성명'],['organization',100,'소속'],['email',150,'이메일'],['phone',20,'연락처'],['futureTopics',2000,'희망 주제']].forEach(function(item){value[item[0]]=clean_(d[item[0]],item[1],item[2]);});
  value.email=value.email.toLowerCase();
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email))throw new Error('이메일을 확인해 주세요.');
  if(!/^(02|0\d{2})-\d{3,4}-\d{4}$/.test(value.phone))throw new Error('연락처를 확인해 주세요.');
  if(d.consent!=='동의합니다.'||d.certificate!==true)throw new Error('개인정보 동의와 수료증 표기 확인이 필요합니다.');
  if(['동의합니다.','동의하지 않습니다.'].indexOf(d.mediaConsent)<0)throw new Error('촬영 동의 여부를 선택해 주세요.');
  const programs=db_().getSheetByName('Programs').getDataRange().getDisplayValues().slice(1);
  [['AM','morningTrack'],['PM','afternoonTrack']].forEach(function(pair){if(!programs.some(function(r){return r[1]===pair[0]&&r[3]===d[pair[1]]&&r[4]==='TRUE';}))throw new Error('실습 트랙을 확인해 주세요.');value[pair[1]]=d[pair[1]];});
  if(['소속 학교/기관 안내 공문','SNS(페이스북, 인스타그램 등)','에듀테크 커뮤니티','지인 추천','기타'].indexOf(d.discoverySource)<0)throw new Error('인지 경로를 선택해 주세요.');
  value.mediaConsent=d.mediaConsent;value.discoverySource=d.discoverySource;return value;
}
function registrationVersion_(row){
  return Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,JSON.stringify(row.slice(0,19)),Utilities.Charset.UTF_8));
}
function registerSequential_(req){
  const settings=settings_();
  if(settings.registrationEnabled!=='TRUE')throw new Error('현재 참가 신청을 준비 중입니다.');
  const requestId=clean_(req.requestId,60,'요청 식별자');
  if(!/^[a-zA-Z0-9-]{20,60}$/.test(requestId))throw new Error('요청 식별자를 확인해 주세요.');
  const d=validateRegistrationData_(req.data,settings,req.consentVersion);
  const lock=LockService.getScriptLock();if(!lock.tryLock(10000))throw new Error('잠시 후 같은 화면에서 다시 시도해 주세요.');
  try{
    const sheet=db_().getSheetByName('Registrations');
    const props=PropertiesService.getScriptProperties();
    if(props.getProperty('deletedRequest:'+requestId))throw new Error('삭제된 신청 요청입니다. 새 신청서를 작성해 주세요.');
    let rows=sheet.getDataRange().getDisplayValues();
    if(!rows[0]||!rows[0][0]){
      sheet.getRange(1,1,1,19).setValues([['ID','접수시각','성명','소속','이메일','연락처','오전트랙','오후트랙','개인정보동의','촬영동의','인지경로','희망주제','수료증확인','동의버전','동의시각','출석상태','수료증','접수상태','요청키']]);
      rows=sheet.getDataRange().getDisplayValues();
    }
    if(rows[0][18]&&rows[0][18]!=='요청키')throw new Error('S열에 다른 데이터가 있습니다. 운영자 확인이 필요합니다.');
    if(rows.slice(1).some(function(r){return r[0]&&!/^2026-\d{3,}$/.test(r[0]);}))throw new Error('기존 ID 형식을 확인해 주세요.');
    if(!rows[0][18])sheet.getRange(1,19).setValue('요청키');
    const old=rows.slice(1).find(function(r){return r[18]===requestId;});
    if(old){if(old[4]!==d.email||old[5]!==d.phone)throw new Error('요청 식별자가 중복되었습니다.');return {ok:true,registrationId:old[0],requestId:requestId,duplicate:true};}
    if(rows.slice(1).some(function(r){return r[0]&&r[4]===d.email&&r[5]===d.phone&&r[17]!=='CANCELLED';}))throw new Error('이미 접수된 연락처입니다. 신청 내용 수정 메뉴를 이용해 주세요.');
    let counter=Number(props.getProperty('registrationIdCounter2026')||0);
    if(!Number.isSafeInteger(counter)||counter<0)throw new Error('접수 ID 카운터를 확인해 주세요.');
    rows.slice(1).forEach(function(r){if(r[0])counter=Math.max(counter,Number(r[0].slice(5)));});
    counter++;props.setProperty('registrationIdCounter2026',String(counter));
    const id='2026-'+String(counter).padStart(3,'0'), now=new Date().toISOString();
    const row=[id,now,d.name,d.organization,d.email,d.phone,d.morningTrack,d.afternoonTrack,'TRUE',d.mediaConsent==='동의합니다.'?'TRUE':'FALSE',d.discoverySource,d.futureTopics,'TRUE',settings.consentVersion,now,'NOT_CHECKED','','REGISTERED',requestId];
    sheet.getRange(sheet.getLastRow()+1,1,1,row.length).setNumberFormat('@').setValues([row.map(literal_)]);SpreadsheetApp.flush();
    return {ok:true,registrationId:id,requestId:requestId};
  }finally{lock.releaseLock();}
}
