/* Add with Registration.gs; dispatch participantLookup/participantUpdate through participantApi_. */
function participantApi_(req){
  if(req.action==='participantLookup')return participantLookup_(req);
  if(req.action==='participantUpdate')return participantUpdate_(req);
  return null;
}
function participantHash_(value){return Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,value,Utilities.Charset.UTF_8));}
function participantData_(row){return {name:row[2],organization:row[3],email:row[4],phone:row[5],morningTrack:row[6],afternoonTrack:row[7],consent:'동의합니다.',certificate:true,mediaConsent:row[9]==='TRUE'?'동의합니다.':'동의하지 않습니다.',discoverySource:row[10],futureTopics:row[11]};}
function participantLookup_(req){
  const name=clean_(req.name,40,'성명').normalize('NFKC').toLowerCase();
  if(typeof req.last4!=='string'||!/^\d{4}$/.test(req.last4))throw new Error('연락처 끝 4자리를 입력해 주세요.');
  const cache=CacheService.getScriptCache(), key='participantAttempts:'+participantHash_(name);
  const lock=LockService.getScriptLock();if(!lock.tryLock(10000))throw new Error('잠시 후 다시 확인해 주세요.');
  try{
    const attempts=Number(cache.get(key)||0);if(attempts>=5)throw new Error('확인 시도가 많습니다. 10분 후 다시 시도해 주세요.');
    cache.put(key,String(attempts+1),600);
    const rows=db_().getSheetByName('Registrations').getDataRange().getDisplayValues().slice(1);
    const matched=rows.filter(function(row){return row[0]&&row[17]==='REGISTERED'&&String(row[2]).trim().normalize('NFKC').toLowerCase()===name&&String(row[5]).replace(/\D/g,'').slice(-4)===req.last4;});
    if(!matched.length)throw new Error('신청 정보를 확인하지 못했습니다. 성명과 연락처 끝 4자리를 확인해 주세요.');
    if(matched.length!==1)throw new Error('같은 확인 정보의 신청이 여러 건입니다. 운영 사무국으로 문의해 주세요.');
    const row=matched[0];if(!/^2026-\d{3,}$/.test(row[0]))throw new Error('접수 ID 형식을 운영 사무국에서 확인해야 합니다.');
    const token=(Utilities.getUuid()+Utilities.getUuid()).replace(/-/g,'');
    cache.put('participantToken:'+token,JSON.stringify({id:row[0],version:registrationVersion_(row)}),900);cache.remove(key);
    const s=settings_();
    return {ok:true,token:token,registrationId:row[0],data:participantData_(row),expiresIn:900,settings:{consentVersion:s.consentVersion,privacyRetention:s.privacyRetention,mediaUsageScope:s.mediaUsageScope||'',privacyController:s.privacyController||''}};
  }finally{lock.releaseLock();}
}
function participantUpdate_(req){
  if(typeof req.token!=='string'||!(/^[a-f0-9]{64}$/i).test(req.token))throw new Error('신청 정보를 다시 확인해 주세요.');
  const cache=CacheService.getScriptCache(), key='participantToken:'+req.token;
  const stored=cache.get(key);if(!stored)throw new Error('확인 시간이 만료되었습니다. 성명과 연락처로 다시 확인해 주세요.');
  const session=JSON.parse(stored),settings=settings_(),d=validateRegistrationData_(req.data,settings,req.consentVersion);
  const lock=LockService.getScriptLock();if(!lock.tryLock(10000))throw new Error('잠시 후 다시 저장해 주세요.');
  try{
    const sheet=db_().getSheetByName('Registrations'),rows=sheet.getDataRange().getDisplayValues();
    const index=rows.findIndex(function(row,i){return i>0&&row[0]===session.id;});
    if(index<0||rows[index][17]!=='REGISTERED'){cache.remove(key);throw new Error('수정할 수 있는 신청이 없습니다. 운영 사무국으로 문의해 주세요.');}
    const row=rows[index];
    if(registrationVersion_(row)!==session.version){cache.remove(key);throw new Error('신청 정보가 변경되었습니다. 다시 확인한 뒤 수정해 주세요.');}
    if(rows.some(function(r,i){return i>0&&i!==index&&r[4]===d.email&&r[5]===d.phone&&r[17]==='REGISTERED';}))throw new Error('같은 연락처로 접수된 신청이 있습니다. 운영 사무국으로 문의해 주세요.');
    row[2]=d.name;row[3]=d.organization;row[4]=d.email;row[5]=d.phone;row[6]=d.morningTrack;row[7]=d.afternoonTrack;row[8]='TRUE';row[9]=d.mediaConsent==='동의합니다.'?'TRUE':'FALSE';row[10]=d.discoverySource;row[11]=d.futureTopics;row[12]='TRUE';row[13]=settings.consentVersion;row[14]=new Date().toISOString();
    sheet.getRange(index+1,1,1,row.length).setNumberFormat('@').setValues([row.map(literal_)]);SpreadsheetApp.flush();
    const saved=sheet.getDataRange().getDisplayValues()[index];
    cache.put(key,JSON.stringify({id:session.id,version:registrationVersion_(saved)}),900);
    return {ok:true,registrationId:row[0]};
  }finally{lock.releaseLock();}
}
