const rows=[
 ['am','10:00–10:30',[['등록 및 AI 디지털 부스 탐방','','4층 로비']]],
 ['am','10:30–12:30',[['초등 교수 학습 바이브 코딩 실습','석희철 교사 · 화진초등학교','U 402호'],['캔바 AI를 활용한 실습','주방현 대표이사 · ㈜오늘배움','U 411호'],['대학생 글쓰기에서의 생성형 AI 활용 및 인식 비교 연구','성창규 교수 외 3인 · 목원대학교','U 403호']]],
 ['pm','12:30–13:30',[['점심식사','','']]],
 ['pm','13:30–13:45',[['인사 및 환영사','오석진 대전광역시 교육감 · 추진계획(안) 표기','U 408호 대강당']]],
 ['pm','13:45–15:15',[['AGI 시대의 교사의 역할과 나아갈 길','정영식 교수 · 전주교육대학교','U 408호 대강당']]],
 ['pm','15:15–15:30',[['휴식','','']]],
 ['pm','15:30–17:15',[['AI 바이브 코딩 실습','김재현 교사 · 신목중학교','U 402호'],['AI 교무 업무 개선 실습','김용욱 교사 · 신도초등학교','U 411호'],['AI를 활용하는 액션러닝 수업설계','이선희 교수 · 목원대학교','U 403호']]],
 ['pm','17:20–17:50',[['AGI 시대 바람직한 교수 학습 방법 공동 학술 토론회','사회 전영주 교수 · 여상수 교수, 김용욱 교사, 석희철 교사, 김재현 교사, 주방현 대표이사','U 408호 대강당']]]
];
function renderSchedule(period='all'){document.querySelector('#schedule').innerHTML=rows.filter(r=>period==='all'||r[0]===period).map(r=>`<div class="schedule-row"><span class="time">${r[1]}</span><div class="${r[2].length>1?'session-grid':''}">${r[2].map(s=>`<article class="session"><strong>${s[0]}</strong>${s[1]?`<p>${s[1]}</p>`:''}${s[2]?`<small>${s[2]}</small>`:''}</article>`).join('')}</div></div>`).join('')}
renderSchedule();
const phoneInput=document.querySelector('[name="phone"]');
function phoneDigits(value){return value.normalize('NFKC').replace(/[^0-9]/g,'');}
function formatPhone(value){
  let digits=phoneDigits(value);
  const prefixLength=digits.startsWith('02')?2:3;
  digits=digits.slice(0,prefixLength+8);
  if(digits.length<=prefixLength)return digits;
  if(digits.length<=prefixLength+3)return digits.slice(0,prefixLength)+'-'+digits.slice(prefixLength);
  const split=digits.length>prefixLength+7?prefixLength+4:prefixLength+3;
  return digits.slice(0,prefixLength)+'-'+digits.slice(prefixLength,split)+'-'+digits.slice(split);
}
function normalizePhone(){
  const cursor=phoneInput.selectionStart??phoneInput.value.length;
  const digitsBeforeCursor=phoneDigits(phoneInput.value.slice(0,cursor)).length;
  phoneInput.value=formatPhone(phoneInput.value);
  let caret=0,count=0;
  while(caret<phoneInput.value.length&&count<digitsBeforeCursor){if(/[0-9]/.test(phoneInput.value[caret]))count++;caret++;}
  phoneInput.setSelectionRange(caret,caret);
}
phoneInput.addEventListener('input',e=>{if(!e.isComposing)normalizePhone();});
phoneInput.addEventListener('compositionend',normalizePhone);
phoneInput.addEventListener('blur',normalizePhone);
phoneInput.addEventListener('beforeinput',e=>{
  const start=phoneInput.selectionStart,end=phoneInput.selectionEnd;
  if(start!==end)return;
  if(e.inputType==='deleteContentBackward'&&phoneInput.value[start-1]==='-')phoneInput.setSelectionRange(start-1,start-1);
  if(e.inputType==='deleteContentForward'&&phoneInput.value[start]==='-')phoneInput.setSelectionRange(start+1,start+1);
});
document.querySelectorAll('[data-period]').forEach(b=>b.addEventListener('click',()=>{document.querySelectorAll('[data-period]').forEach(x=>{x.classList.toggle('selected',x===b);x.setAttribute('aria-pressed',String(x===b))});renderSchedule(b.dataset.period)}));
function route(){const raw=location.hash.slice(1)||'home';const id=['register','contact'].includes(raw)?raw:'home';document.querySelectorAll('.page').forEach(p=>p.classList.toggle('hidden',p.id!==id));document.querySelectorAll('[data-nav]').forEach(a=>{a.classList.toggle('active',a.dataset.nav===id);if(a.dataset.nav===id)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current')});if(raw==='program')requestAnimationFrame(()=>document.querySelector('#program').scrollIntoView());else window.scrollTo(0,0)}
window.addEventListener('hashchange',route);route();
let registrationPayload=null;
let lastRegistrationData='';
let registrationBusy=false;
const registrationEnabled=Boolean(window.RegistrationAPI.endpoint());
let registrationSettings=null;
const registrationForm=document.querySelector('#registration');
const reviewButton=registrationForm.querySelector('[type=submit]');
async function loadRegistrationSettings(){
  reviewButton.disabled=true;
  registrationSettings=null;document.querySelector('#registration-status').textContent='접수 안내를 불러오는 중입니다.';
  try{
    registrationSettings=await window.RegistrationAPI.settings();
    document.querySelector('#privacy-retention').textContent=registrationSettings.privacyRetention;
    document.querySelector('#media-usage').textContent=registrationSettings.mediaUsageScope||'운영 사무국에서 촬영·활용 범위를 안내할 예정입니다.';
    reviewButton.disabled=!registrationSettings.registrationEnabled;
    document.querySelector('#registration-status').textContent=registrationSettings.registrationEnabled?'':'현재 참가 신청을 준비 중입니다.';
    document.querySelector('#registration-note').textContent='최종 접수 버튼을 누르면 신청 내용이 저장됩니다. 수료증 발급 기준은 별도 안내합니다.';
    document.querySelector('.draft-note').textContent='신청 내용을 확인한 후 최종 접수 버튼을 눌러 주세요. 저장이 확인되면 접수번호를 안내합니다.';
  }catch(error){document.querySelector('#registration-status').textContent=error.message;}
}
if(registrationEnabled){
  document.querySelector('.draft-note').textContent='접수 가능 여부를 확인하고 있습니다.';
  const retry=document.querySelector('#registration-retry');
  retry.hidden=false;retry.addEventListener('click',loadRegistrationSettings);
  loadRegistrationSettings();
}else{reviewButton.disabled=true;document.querySelector('#registration-status').textContent='접수 서버에 연결하지 못했습니다. 운영 사무국에 문의해 주세요.';}

document.querySelector('#registration').addEventListener('submit',e=>{e.preventDefault();const f=e.currentTarget;for(const n of ['name','organization','email','phone','discovery','futureTopic']){f.elements[n].value=f.elements[n].value.trim();}if(!f.reportValidity())return;const data=new FormData(f);if(!registrationEnabled||!registrationSettings?.registrationEnabled)return;if(registrationEnabled&&data.get('consent')!=='동의합니다.'){document.querySelector('#registration-status').textContent='접수하려면 개인정보 수집·이용 동의가 필요합니다.';return;}document.querySelector('#registration-status').textContent='';const payload=Object.fromEntries(data);const signature=JSON.stringify(payload);if(signature!==lastRegistrationData){lastRegistrationData=signature;registrationPayload={...payload,requestId:crypto.randomUUID()};}const review=document.querySelector('#review');review.replaceChildren();for(const [key,label] of [['name','성명'],['organization','소속'],['email','이메일'],['phone','연락처'],['morningTrack','오전 트랙'],['afternoonTrack','오후 트랙'],['consent','개인정보 수집·이용'],['photoConsent','사진·동영상 촬영·활용'],['discovery','행사 인지 경로'],['futureTopic','향후 희망 주제'],['certificate','수료증 표기 확인']]){const dt=document.createElement('dt');dt.textContent=label;const dd=document.createElement('dd');dd.textContent=key==='certificate'?(data.has(key)?'확인했습니다.':'미확인'):data.get(key);review.append(dt,dd)}document.querySelector('#certificate-name').textContent=data.get('name');document.querySelector('#certificate-org').textContent=data.get('organization');document.querySelector('#complete-message').textContent='';document.querySelector('#registration-send').hidden=false;document.querySelector('#registration-send').textContent='최종 접수하기';document.querySelector('#confirmation').showModal()});
document.querySelector('#registration-send').addEventListener('click',async e=>{
  const button=e.currentTarget;
  const status=document.querySelector('#complete-message');
  if(!registrationEnabled){status.textContent='접수 서버에 연결하지 못했습니다. 운영 사무국에 문의해 주세요.';return;}
  if(registrationBusy||!registrationPayload)return;
  registrationBusy=true;document.querySelector('#confirmation .close').disabled=true;button.disabled=true;button.textContent='접수 저장 중…';status.textContent='저장 결과를 확인하고 있습니다.';
  document.querySelector('#confirmation').setAttribute('aria-busy','true');
  try{
    const result=await window.RegistrationAPI.send(registrationPayload,registrationSettings.consentVersion);
    status.textContent='✓ 참가 신청이 접수되었습니다. 접수번호: '+result.registrationId;
    button.hidden=true;
  }catch(error){status.textContent=error.message;}
  finally{registrationBusy=false;document.querySelector('#confirmation .close').disabled=false;button.disabled=false;button.textContent='최종 접수하기';document.querySelector('#confirmation').removeAttribute('aria-busy');}
});
document.querySelectorAll('dialog .close').forEach(b=>b.addEventListener('click',()=>b.closest('dialog').close()));
document.querySelector('#admin-open').addEventListener('click',()=>document.querySelector('#admin').showModal());
document.querySelector('#admin-form').addEventListener('submit',e=>{e.preventDefault();document.querySelector('#admin-status').textContent='✓ 4자 이상 입력 조건을 충족합니다. 저장·인증은 하지 않았습니다.';e.currentTarget.reset()});

const posterDialog=document.querySelector('#poster-dialog');
document.querySelector('#poster-open').addEventListener('click',()=>posterDialog.showModal());
posterDialog.addEventListener('click',e=>{if(e.target===posterDialog){const r=posterDialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)posterDialog.close();}});
const posterImage=document.querySelector('#poster-open img');
function showPosterError(){document.querySelector('#poster-error').hidden=false;}
posterImage.addEventListener('error',showPosterError);
if(posterImage.complete&&!posterImage.naturalWidth)showPosterError();

document.querySelector('#confirmation').addEventListener('cancel',e=>{if(registrationBusy)e.preventDefault();});
