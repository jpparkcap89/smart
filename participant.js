(() => {
  'use strict';
  const $=selector=>document.querySelector(selector);
  let token='',settings=null,pending=null,generation=0,timer,busy=false;
  const dialog=$('#participant-confirmation');
  const lookup=$('#participant-lookup');
  const notify=text=>{$('#participant-status').textContent=text;};
  const post=(action,data={})=>RegistrationAPI.request({method:'POST',body:new URLSearchParams({payload:JSON.stringify({action,...data})})});
  function end(text=''){
    generation++;token='';settings=null;pending=null;busy=false;clearTimeout(timer);
    if(dialog.open)dialog.close();
    $('#participant-editor').hidden=true;$('#participant-lookup-panel').hidden=false;
    $('#participant-form-slot').replaceChildren();$('#participant-review').replaceChildren();lookup.reset();lookup.querySelector('button').disabled=false;notify(text);
  }
  function draw(data){
    const form=$('#registration').cloneNode(true);form.id='participant-edit-form';
    form.querySelector('#privacy-retention').textContent=settings.privacyRetention;
    form.querySelector('#media-usage').textContent=settings.mediaUsageScope||'운영 사무국에서 촬영·활용 범위를 안내할 예정입니다.';
    if(settings.privacyController)form.querySelector('[data-content=privacyController]').textContent=settings.privacyController;
    form.querySelectorAll('[id]').forEach(node=>node.removeAttribute('id'));
    form.reset();form.querySelector('.form-title h2').textContent='신청 정보 수정';
    form.querySelector('.draft-note').textContent='변경할 정보를 입력한 뒤 확인 화면에서 다시 검토해 주세요.';
    form.querySelectorAll('[role=status]').forEach(node=>node.remove());
    const mapped={...data,photoConsent:data.mediaConsent,discovery:data.discoverySource,futureTopic:data.futureTopics};
    for(const [key,value] of Object.entries(mapped)){
      const nodes=form.querySelectorAll(`[name="${key}"]`);
      nodes.forEach(node=>{if(node.type==='radio')node.checked=node.value===value;else if(node.type!=='checkbox')node.value=value;});
    }
    form.querySelectorAll('[name=consent]').forEach(node=>node.checked=false);form.elements.certificate.checked=false;
    form.querySelector('[type=submit]').textContent='수정 내용 확인하기';form.querySelector('[type=submit]').disabled=false;
    form.elements.phone.addEventListener('input',event=>{event.target.value=formatPhone(event.target.value);});
    form.addEventListener('submit',event=>{
      event.preventDefault();if(!token||!form.reportValidity())return;
      const raw=Object.fromEntries(new FormData(form));
      if(raw.consent!=='동의합니다.'){notify('개인정보 수집·이용 동의가 필요합니다.');return;}
      pending={name:raw.name.trim(),organization:raw.organization.trim(),email:raw.email.trim(),phone:raw.phone.trim(),morningTrack:raw.morningTrack,afternoonTrack:raw.afternoonTrack,consent:raw.consent,certificate:raw.certificate==='on',mediaConsent:raw.photoConsent,discoverySource:raw.discovery,futureTopics:raw.futureTopic.trim()};
      const review=$('#participant-review');review.replaceChildren();
      for(const [key,label] of [['name','성명'],['organization','소속'],['email','이메일'],['phone','연락처'],['morningTrack','오전 트랙'],['afternoonTrack','오후 트랙'],['mediaConsent','촬영 활용'],['discoverySource','인지 경로'],['futureTopics','희망 주제']]){
        const term=document.createElement('dt'),value=document.createElement('dd');term.textContent=label;value.textContent=pending[key];review.append(term,value);
      }
      $('#participant-review-confirm').checked=false;$('#participant-save').disabled=true;$('#participant-save-status').textContent='';dialog.showModal();
    });
    $('#participant-form-slot').replaceChildren(form);
  }
  lookup.addEventListener('submit',async event=>{
    event.preventDefault();if(!lookup.reportValidity()||lookup.querySelector('button').disabled)return;
    const current=++generation;lookup.querySelector('button').disabled=true;notify('신청 정보를 확인하고 있습니다.');
    try{
      const config=await RegistrationAPI.settings();
      const result=await post('participantLookup',{name:lookup.elements.lookupName.value.trim(),last4:lookup.elements.last4.value});
      if(current!==generation)return;
      if(!/^[a-f0-9]{64}$/i.test(result.token||'')||!/^2026-\d{3,}$/.test(result.registrationId||'')||!result.data)throw new Error('신청 정보를 확인하지 못했습니다.');
      token=result.token;settings={...config,...result.settings};draw(result.data);lookup.reset();
      $('#participant-id').textContent='접수 ID: '+result.registrationId;$('#participant-editor').hidden=false;$('#participant-lookup-panel').hidden=true;notify('변경할 정보를 수정해 주세요.');
      clearTimeout(timer);timer=setTimeout(()=>end('확인 시간이 만료되었습니다. 다시 확인해 주세요.'),15*60*1000);
    }catch(error){if(current===generation)notify(/지원하지 않는 요청/.test(error.message)?'신청 정보 수정 기능을 준비 중입니다. 운영 사무국으로 문의해 주세요.':error.message);}
    finally{if(current===generation)lookup.querySelector('button').disabled=false;}
  });
  $('#participant-exit').addEventListener('click',()=>end());
  $('#participant-review-confirm').addEventListener('change',event=>{$('#participant-save').disabled=!event.currentTarget.checked;});
  dialog.addEventListener('cancel',event=>{if(busy)event.preventDefault();});
  $('#participant-save').addEventListener('click',async()=>{
    if(!token||!pending||busy||!$('#participant-review-confirm').checked)return;
    const current=generation;busy=true;$('#participant-save').disabled=true;$('#participant-review-confirm').disabled=true;dialog.querySelector('.close').disabled=true;$('#participant-save-status').textContent='수정 내용을 저장하고 있습니다.';
    try{
      const result=await post('participantUpdate',{token,data:pending,consentVersion:settings.consentVersion});
      if(current===generation)end('신청 정보가 수정되었습니다. 접수 ID: '+result.registrationId);
    }catch(error){if(current===generation){$('#participant-save-status').textContent=error.message;if(/만료|다시 확인한 뒤|다시 확인해 주세요/.test(error.message))end(error.message);}}
    finally{busy=false;$('#participant-save').disabled=!$('#participant-review-confirm').checked;$('#participant-review-confirm').disabled=false;dialog.querySelector('.close').disabled=false;}
  });
  window.addEventListener('hashchange',()=>{if(location.hash!=='#edit')end();});
})();
