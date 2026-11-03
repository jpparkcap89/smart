"""Applicant verification and editing with a fake API; no live personal data."""
import json, re, html
from pathlib import Path
from urllib.parse import parse_qs
from playwright.sync_api import sync_playwright
BASE='http://127.0.0.1:8000'
ENDPOINT='https://script.google.com/macros/s/test-deployment/exec'
source=Path(__file__).parents[1].joinpath('index.html').read_text()
track=lambda name:html.unescape(re.search('name="'+name+'" value="([^"]+)"',source)[1])
data={'name':'테스트 참가자','organization':'예시학교','email':'test@example.com','phone':'010-1234-5678','morningTrack':track('morningTrack'),'afternoonTrack':track('afternoonTrack'),'mediaConsent':'동의하지 않습니다.','discoverySource':'기타','futureTopics':'AI 교육','consent':'동의합니다.','certificate':True}
updates=[]
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True)
    page=browser.new_page()
    errors=[]
    page.on('pageerror',lambda error:errors.append(str(error)))
    page.route('**/registration-config.js*',lambda route:route.fulfill(content_type='application/javascript',body=f'window.REGISTRATION_CONFIG={{enabled:true,endpoint:{json.dumps(ENDPOINT)}}};'))
    def api(route):
        def reply(value):route.fulfill(content_type='application/json',headers={'access-control-allow-origin':'*'},body=json.dumps(value))
        settings={'consentVersion':'v1','privacyRetention':'3개월','mediaUsageScope':'행사 소개'}
        if route.request.method=='GET':reply({'ok':True,'service':'smart-festival-2026','registrationEnabled':True,**settings});return
        req=json.loads(parse_qs(route.request.post_data)['payload'][0])
        if req['action']=='getCapabilities':reply({'ok':True,'idFormat':'2026-000'});return
        if req['action']=='getPublicContent':reply({'ok':True,'content':{}});return
        if req['action']=='participantLookup':
            if req['name']!=data['name'] or req['last4']!='5678':reply({'ok':False,'message':'신청 정보를 확인하지 못했습니다.'});return
            reply({'ok':True,'token':'a'*64,'registrationId':'2026-001','data':data,'settings':settings});return
        if req['action']=='participantUpdate':
            assert req['token']=='a'*64 and req['consentVersion']=='v1'
            assert req['data']['certificate'] is True
            updates.append(req['data']);reply({'ok':True,'registrationId':'2026-001'});return
        reply({'ok':False,'message':'지원하지 않는 요청입니다.'})
    page.route(ENDPOINT,api)
    page.goto(BASE+'/#edit',wait_until='domcontentloaded')
    page.locator('[name=lookupName]').fill(data['name']);page.locator('[name=last4]').fill('0000')
    page.locator('#participant-lookup button').click()
    page.wait_for_function("document.querySelector('#participant-status').textContent.includes('확인하지 못')")
    assert not page.locator('#participant-editor').is_visible()
    page.locator('[name=last4]').fill('5678');page.locator('#participant-lookup button').click()
    page.wait_for_selector('#participant-edit-form')
    assert page.locator('#participant-id').inner_text()=='접수 ID: 2026-001'
    page.locator('#participant-edit-form [name=organization]').fill('변경 학교')
    page.locator('#participant-edit-form [name=consent]').first.check()
    page.locator('#participant-edit-form [name=certificate]').check()
    page.locator('#participant-edit-form [type=submit]').click()
    assert page.locator('#participant-save').is_disabled()
    assert not updates
    page.locator('#participant-review-confirm').check();page.locator('#participant-save').click()
    page.wait_for_function("document.querySelector('#participant-status').textContent.includes('수정되었습니다')")
    assert updates[0]['organization']=='변경 학교'
    assert not page.locator('#participant-editor').is_visible()
    assert page.locator('#participant-edit-form').count()==0
    assert page.evaluate('localStorage.length+sessionStorage.length')==0
    page.set_viewport_size({'width':375,'height':812})
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
    assert not errors,errors
    print('PASS: applicant verification, failed identity, data editing, review-before-save, simplified ID, privacy cleanup and mobile layout')
    browser.close()
