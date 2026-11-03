(() => {
  'use strict';
  const $ = selector => document.querySelector(selector);
  const dialog = $('#admin');
  const dashboard = $('#admin-dashboard');
  const loginForm = $('#admin-form');
  const fields = [
    ['siteTitle','행사명'],['heroTitle1','메인 제목 첫 줄'],['heroTitle2','메인 제목 둘째 줄'],
    ['heroIntro','행사 소개','textarea'],['eventDate','행사 날짜'],['eventTime','행사 시간'],
    ['eventLocation','행사 장소'],['hostName','주최'],['organizers','주관','textarea'],
    ['contactEmail','문의 이메일','email'],['contactPhone','문의 전화번호','tel'],
    ['privacyController','개인정보 처리 주체'],['privacyRetention','개인정보 보유 기간'],
    ['mediaUsageScope','사진·동영상 촬영 및 활용 범위','textarea'],['registrationEnabled','참가 신청 접수','select']
  ];
  let password = '';
  let session = 0;
  let timer;
  let page = 1;
  let pages = 1;
  let listRequest = 0;
  let revision = null;
  let tab = 'registrations';
  let contentReady = false;
  let editingRow=null;
  const required = new Set(['siteTitle','heroTitle1','heroTitle2','eventDate','eventTime','eventLocation','hostName','organizers','contactEmail','contactPhone','privacyRetention']);
  const message = text => { $('#admin-status').textContent = text; };

  function element(tag, text, className) {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
  }
  function actionLink(text, href) {
    const link = element('a', text, 'button compact');
    link.href = href;
    return link;
  }
  function phoneNumber(value) { return String(value || '').replace(/[^+0-9]/g, ''); }

  function defaults() {
    const values = {};
    for (const [key] of fields) {
      const node = document.querySelector(`[data-content="${key}"]`);
      values[key] = node ? node.innerText : '';
    }
    values.contactEmail = $('[data-contact-email]').textContent.trim();
    values.privacyRetention = $('#privacy-retention').textContent;
    values.mediaUsageScope = typeof registrationSettings !== 'undefined' && registrationSettings ? registrationSettings.mediaUsageScope || '' : '';
    values.registrationEnabled = typeof registrationSettings !== 'undefined' && registrationSettings?.registrationEnabled ? 'TRUE' : 'FALSE';
    return values;
  }

  function applyContent(content) {
    if (!content || typeof content !== 'object') return;
    for (const [key] of fields) {
      if (typeof content[key] !== 'string') continue;
      document.querySelectorAll(`[data-content="${key}"]`).forEach(node => { node.textContent = content[key]; });
    }
    if (typeof content.siteTitle === 'string' && content.siteTitle.trim()) document.title = content.siteTitle;
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(content.contactEmail || '')) {
      document.querySelectorAll('[data-contact-email]').forEach(node => {
        node.textContent = content.contactEmail;
        node.href = 'mailto:' + content.contactEmail;
      });
    }
    if (/^\+?[0-9() -]{8,25}$/.test(content.contactPhone || '')) {
      const phone = phoneNumber(content.contactPhone);
      document.querySelectorAll('[data-contact-call]').forEach(node => { node.href = 'tel:' + phone; });
      document.querySelectorAll('[data-contact-sms]').forEach(node => { node.href = 'sms:' + phone; });
    }
  }

  async function post(action, data = {}) {
    return window.RegistrationAPI.request({method:'POST', body:new URLSearchParams({payload:JSON.stringify({action, ...data})})});
  }
  async function authenticated(action, data = {}) {
    if (!password) throw new Error('다시 로그인해 주세요.');
    const current = session;
    clearTimeout(timer);
    timer = setTimeout(() => logout('일정 시간 사용하지 않아 로그아웃되었습니다.'), 15 * 60 * 1000);
    try {
      const result = await post(action, {...data, password});
      if (current !== session || !password) throw new Error('로그아웃되었습니다.');
      return result;
    } catch (error) {
      if (current === session && /비밀번호|로그인 시도/.test(error.message)) logout(error.message);
      throw error;
    }
  }

  function logout(text = '') {
    session++;
    password = '';
    revision = null;
    contentReady = false;
    clearTimeout(timer);
    loginForm.reset();
    loginForm.querySelector('button').disabled = false;
    $('#admin-login').hidden = false;
    dashboard.hidden = true;
    $('#admin-title').textContent = '관리자 로그인';
    $('#admin-list').replaceChildren();
    if($('#admin-edit-dialog').open)$('#admin-edit-dialog').close();editingRow=null;
    $('#admin-count').textContent = '0';
    $('#admin-attendance').textContent = '0';
    $('#admin-cancelled').textContent = '—';
    message(text);
  }

  function unsupported(error) {
    return /지원하지 않는 요청/.test(error.message) ? '로그인은 완료됐습니다. 목록 조회와 정보 수정을 사용하려면 관리자 서버 업데이트가 필요합니다.' : error.message;
  }
  function summary(data) {
    $('#admin-count').textContent = String(data.count ?? 0);
    $('#admin-attendance').textContent = String(data.attendanceCount ?? 0);
    $('#admin-cancelled').textContent = String(data.cancelledCount ?? '—');
  }

  async function loadList() {
    if (!password) return;
    const current = session, request = ++listRequest;
    $('#admin-list-status').textContent = '접수 현황을 불러오는 중입니다.';
    $('#admin-list').replaceChildren();
    const search = new FormData($('#admin-search'));
    try {
      const result = await authenticated('adminList', {query:search.get('query'),status:search.get('status'),attendance:search.get('attendance'),page});
      if (session !== current || request !== listRequest) return;
      if (!Array.isArray(result.registrations)) throw new Error('접수 현황 응답을 확인하지 못했습니다.');
      page = result.page; pages = result.pages;
      summary(result.summary || {});
      $('#admin-list-status').textContent = `조회 결과 ${result.total}명`;
      $('#admin-page').textContent = `${page} / ${pages}`;
      $('#admin-prev').disabled = page <= 1;
      $('#admin-next').disabled = page >= pages;
      if (!result.registrations.length) $('#admin-list').append(element('p','조회된 신청자가 없습니다.','note'));
      result.registrations.forEach(renderRegistration);
    } catch (error) {
      if (session !== current || request !== listRequest) return;
      $('#admin-list-status').textContent = unsupported(error);
      $('#admin-page').textContent = '';
      $('#admin-prev').disabled = $('#admin-next').disabled = true;
    }
  }

  function renderRegistration(row) {
    const card = element('article', undefined, 'admin-person');
    const heading = element('div', undefined, 'admin-person-heading');
    heading.append(element('h3', row.name), element('span',row.status === 'CANCELLED' ? '취소' : '접수 완료','tag'),element('span',row.attendance === 'ATTENDED' ? '출석 확인' : '출석 미확인','tag'));
    card.append(heading,element('p',row.organization));
    const contacts = element('div',undefined,'phone-contact');
    contacts.append(element('strong',row.phone));
    const number=phoneNumber(row.phone);
    if (/^\+?\d{8,15}$/.test(number)) contacts.append(actionLink('전화','tel:'+number),actionLink('문자','sms:'+number));
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) contacts.append(actionLink('이메일','mailto:'+row.email));
    card.append(contacts);
    const details=element('details');
    details.append(element('summary','신청 내용 상세 보기'));
    const list=element('dl');
    for(const [label,value] of [['접수 ID',row.id],['접수 시각',row.createdAt],['이메일',row.email],['오전 트랙',row.morningTrack],['오후 트랙',row.afternoonTrack],['촬영 활용',row.mediaConsent?'동의':'비동의'],['인지 경로',row.discoverySource],['희망 주제',row.futureTopics]]) list.append(element('dt',label),element('dd',value));
    details.append(list);card.append(details);
    const actions=element('div',undefined,'admin-person-actions');
    const attendance=element('button',row.attendance==='ATTENDED'?'출석 확인 취소':'출석 확인','button compact');
    attendance.type='button';attendance.disabled=row.status==='CANCELLED';
    attendance.addEventListener('click',()=>updateRegistration(row,{attendance:row.attendance==='ATTENDED'?'NOT_CHECKED':'ATTENDED'},card));
    const status=element('button',row.status==='CANCELLED'?'접수 복원':'접수 취소','button compact');status.type='button';
    status.addEventListener('click',()=>{
      const verb=row.status==='CANCELLED'?'복원':'취소';
      if(window.confirm(`${row.name} 님의 접수를 ${verb}하시겠습니까?`)) updateRegistration(row,{status:row.status==='CANCELLED'?'REGISTERED':'CANCELLED'},card);
    });
    const edit=element('button','신청 정보 수정','button compact');edit.type='button';edit.addEventListener('click',()=>openRegistrationEditor(row));
    const remove=element('button','영구 삭제','button compact danger');remove.type='button';remove.addEventListener('click',()=>deleteRegistration(row,card));
    actions.append(edit,attendance,status,remove);card.append(actions);$('#admin-list').append(card);
  }

  async function updateRegistration(row, updates, card) {
    const current=session;
    card.querySelectorAll('button').forEach(button=>{button.disabled=true;});
    try {
      await authenticated('adminUpdateRegistration',{registrationId:row.id,version:row.version,updates});
      if(current===session){message('접수 정보를 변경했습니다.');await loadList();}
    } catch(error) {
      if(current===session){message(error.message);card.querySelectorAll('button').forEach(button=>{button.disabled=false;});}
    }
  }

  async function deleteRegistration(row,card){
    if(!window.confirm(`${row.name} 님의 신청(${row.id})을 영구 삭제하시겠습니까? 삭제 후 복구할 수 없습니다.`))return;
    const current=session;card.querySelectorAll('button').forEach(button=>button.disabled=true);
    try{await authenticated('adminDeleteRegistration',{registrationId:row.id,version:row.version,confirm:true});if(current===session){message('신청을 영구 삭제했습니다.');await loadList();}}
    catch(error){if(current===session){message(error.message);card.querySelectorAll('button').forEach(button=>button.disabled=false);}}
  }
  function openRegistrationEditor(row){
    editingRow=row;const form=$('#admin-edit-form');form.reset();const container=$('#admin-edit-fields');container.replaceChildren();
    const definitions=[['name','성명'],['organization','소속'],['email','이메일','email'],['phone','연락처','tel'],['morningTrack','오전 트랙','select'],['afternoonTrack','오후 트랙','select'],['mediaConsent','촬영 활용 동의','select'],['discoverySource','인지 경로','select'],['futureTopics','희망 주제','textarea']];
    for(const [key,label,type] of definitions){
      const wrapper=element('label',label);const input=element(type==='select'?'select':type==='textarea'?'textarea':'input');input.name=key;input.required=true;
      if(type==='select'){
        const sourceName=key==='discoverySource'?'discovery':key;
        const options=key==='mediaConsent'?['동의합니다.','동의하지 않습니다.']:key==='discoverySource'?Array.from(document.querySelectorAll(`#registration [name=${sourceName}] option`)).map(node=>node.value).filter(Boolean):Array.from(document.querySelectorAll(`#registration [name=${sourceName}]`)).map(node=>node.value);
        for(const value of options){const option=element('option',value);option.value=value;input.append(option);}
      }else{if(type!=='textarea')input.type=type||'text';input.maxLength=key==='futureTopics'?2000:key==='name'?40:key==='organization'?100:150;if(type==='textarea')input.rows=4;}
      input.value=key==='mediaConsent'?(row.mediaConsent?'동의합니다.':'동의하지 않습니다.'):row[key]||'';
      wrapper.append(input);container.append(wrapper);
    }
    $('#admin-edit-status').textContent='';$('#admin-edit-form [type=submit]').disabled=false;$('#admin-edit-dialog').showModal();
  }
  $('#admin-edit-dialog').addEventListener('close',()=>{editingRow=null;$('#admin-edit-fields').replaceChildren();});
  $('#admin-edit-form').addEventListener('submit',async event=>{
    event.preventDefault();if(!editingRow||!event.currentTarget.reportValidity())return;
    const row=editingRow,current=session,data=Object.fromEntries(new FormData(event.currentTarget));
    const button=event.currentTarget.querySelector('[type=submit]');button.disabled=true;$('#admin-edit-status').textContent='저장 중입니다.';
    try{await authenticated('adminEditRegistration',{registrationId:row.id,version:row.version,data});if(current===session){$('#admin-edit-dialog').close();message('신청 정보를 수정했습니다.');await loadList();}}
    catch(error){if(current===session){$('#admin-edit-status').textContent=error.message;button.disabled=false;}}
  });

  function buildContentForm(content) {
    const container=$('#admin-content-fields');container.replaceChildren();
    const values={...defaults(),...content};
    for(const [key,label,type] of fields){
      const wrapper=element('label',label);
      if(type==='textarea')wrapper.className='full';
      const input=element(type==='textarea'?'textarea':type==='select'?'select':'input');
      input.name=key;
      if(type==='select'){
        for(const [value,text] of [['TRUE','접수 중'],['FALSE','접수 닫기']]){const option=element('option',text);option.value=value;input.append(option);}
      }else if(type==='textarea'){input.rows=3;input.maxLength=2000;}
      else{input.type=type||'text';input.maxLength=500;}
      input.required=required.has(key);
      input.value=values[key]||'';
      wrapper.append(input);container.append(wrapper);
    }
  }
  async function loadContent() {
    if(!password)return;
    const current=session;contentReady=false;
    $('#admin-content-form [type=submit]').disabled=true;
    $('#admin-content-status').textContent='행사 정보를 불러오는 중입니다.';
    try{
      const result=await authenticated('adminGetContent');
      if(current!==session)return;
      if(!result.content||typeof result.revision!=='string')throw new Error('행사 정보를 확인하지 못했습니다.');
      revision=result.revision;contentReady=true;
      buildContentForm(result.content);
      $('#admin-content-status').textContent='';
      $('#admin-content-form [type=submit]').disabled=false;
    }catch(error){if(current===session)$('#admin-content-status').textContent=unsupported(error);}
  }
  async function selectTab(value) {
    tab=value;
    $('#admin-registrations').hidden=tab!=='registrations';$('#admin-content').hidden=tab!=='content';
    document.querySelectorAll('[data-admin-tab]').forEach(button=>{const active=button.dataset.adminTab===tab;button.classList.toggle('selected',active);button.setAttribute('aria-pressed',String(active));});
    if(tab==='content')await loadContent();else await loadList();
  }

  $('#admin-open').addEventListener('click',()=>{dialog.showModal();loginForm.elements.password.focus();});
  dialog.addEventListener('close',()=>logout());
  $('#admin-logout').addEventListener('click',()=>logout('로그아웃되었습니다.'));
  loginForm.addEventListener('submit',async event=>{
    event.preventDefault();if(loginForm.querySelector('button').disabled||!loginForm.reportValidity())return;
    const current=++session;
    const candidate=loginForm.elements.password.value;
    const button=loginForm.querySelector('button');button.disabled=true;message('로그인 확인 중입니다.');
    try{
      const result=await post('adminSummary',{password:candidate});
      if(current!==session)return;
      if(!Number.isInteger(result.count)||!Number.isInteger(result.attendanceCount))throw new Error('관리자 응답을 확인하지 못했습니다.');
      password=candidate;loginForm.reset();$('#admin-login').hidden=true;dashboard.hidden=false;$('#admin-title').textContent='행사 운영 관리';message('로그인되었습니다.');summary(result);
      await selectTab('registrations');
    }catch(error){if(current===session){message(error.message);loginForm.reset();}}
    finally{if(current===session)button.disabled=false;}
  });
  document.querySelectorAll('[data-admin-tab]').forEach(button=>button.addEventListener('click',()=>selectTab(button.dataset.adminTab)));
  $('#admin-search').addEventListener('submit',event=>{event.preventDefault();page=1;loadList();});
  $('#admin-prev').addEventListener('click',()=>{if(page>1){page--;loadList();}});
  $('#admin-next').addEventListener('click',()=>{if(page<pages){page++;loadList();}});
  $('#admin-content-reload').addEventListener('click',()=>{if(!contentReady||window.confirm('저장하지 않은 변경 내용을 버리고 다시 불러오시겠습니까?'))loadContent();});
  $('#admin-content-form').addEventListener('submit',async event=>{
    event.preventDefault();const form=event.currentTarget;if(!contentReady||!form.reportValidity())return;
    const current=session, button=form.querySelector('[type=submit]');button.disabled=true;
    const content=Object.fromEntries(new FormData(form));$('#admin-content-status').textContent='저장 중입니다.';
    try{
      const result=await authenticated('adminSaveContent',{content,revision});
      if(current!==session)return;
      if(!result.content||typeof result.revision!=='string')throw new Error('저장 결과를 확인하지 못했습니다. 다시 불러온 뒤 확인해 주세요.');
      revision=result.revision;applyContent(result.content);$('#admin-content-status').textContent='저장했습니다. 사이트에 변경 내용을 반영했습니다.';
      if(typeof loadRegistrationSettings==='function')await loadRegistrationSettings();
    }catch(error){if(current===session)$('#admin-content-status').textContent=error.message;}
    finally{if(current===session)button.disabled=false;}
  });
  if(window.RegistrationAPI.endpoint()) post('getPublicContent').then(result=>applyContent(result.content)).catch(()=>{});
})();
