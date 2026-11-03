"""Admin UI checks with simulated APIs; no real password or applicant data is used."""
import json
from urllib.parse import parse_qs
from playwright.sync_api import sync_playwright

BASE = 'http://127.0.0.1:8000'
ENDPOINT = 'https://script.google.com/macros/s/test-deployment/exec'
content = {}
revision = ''
row = {'id': 'test-id', 'name': '테스트 참가자', 'organization': '예시학교', 'email': 'test@example.com', 'phone': '010-1234-5678', 'createdAt': '2026-11-03', 'morningTrack': 'AM1', 'afternoonTrack': 'PM1', 'mediaConsent': False, 'discoverySource': '기타', 'futureTopics': '<script>unsafe()</script>', 'attendance': 'NOT_CHECKED', 'status': 'REGISTERED'}
calls = []

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True)
    page = browser.new_page(viewport={'width': 1280, 'height': 900})
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('dialog', lambda dialog: dialog.accept())
    page.route('**/registration-config.js*', lambda route: route.fulfill(content_type='application/javascript', body=f'window.REGISTRATION_CONFIG={{enabled:true,endpoint:{json.dumps(ENDPOINT)}}};'))

    def api(route):
        global content, revision
        def reply(data):
            route.fulfill(content_type='application/json', headers={'access-control-allow-origin': '*'}, body=json.dumps(data))
        if route.request.method == 'GET':
            reply({'ok': True, 'service': 'smart-festival-2026', 'registrationEnabled': True, 'privacyRetention': '3개월', 'mediaUsageScope': '행사 소개', 'consentVersion': 'v1'})
            return
        request = json.loads(parse_qs(route.request.post_data)['payload'][0])
        calls.append(request)
        action = request['action']
        if action == 'getPublicContent':
            reply({'ok': True, 'content': content})
            return
        if request.get('password') != 'test-only-password':
            reply({'ok': False, 'message': '비밀번호가 올바르지 않습니다.'})
            return
        if action == 'adminSummary':
            reply({'ok': True, 'count': 1, 'attendanceCount': 0})
        elif action == 'adminList':
            records = [row] if request['status'] in ['ALL', row['status']] else []
            reply({'ok': True, 'registrations': records, 'page': 1, 'pages': 1, 'total': len(records), 'summary': {'count': int(row['status'] == 'REGISTERED'), 'attendanceCount': int(row['attendance'] == 'ATTENDED'), 'cancelledCount': int(row['status'] == 'CANCELLED')}})
        elif action == 'adminUpdateRegistration':
            row.update(request['updates'])
            reply({'ok': True, 'registrationId': row['id']})
        elif action == 'adminGetContent':
            reply({'ok': True, 'content': content, 'revision': revision})
        elif action == 'adminSaveContent':
            assert request['revision'] == revision
            content = request['content']
            revision = 'v2'
            reply({'ok': True, 'content': content, 'revision': revision})
        else:
            reply({'ok': False, 'message': '지원하지 않는 요청입니다.'})

    page.route(ENDPOINT, api)
    page.goto(BASE, wait_until='domcontentloaded')
    page.locator('#admin-open').click()
    page.locator('#admin-form [name=password]').fill('wrong')
    page.locator('#admin-form button').click()
    page.wait_for_function("document.querySelector('#admin-status').textContent.includes('비밀번호가 올바르지')")
    assert not page.locator('#admin-dashboard').is_visible()
    page.locator('#admin-form [name=password]').fill('test-only-password')
    page.locator('#admin-form button').click()
    page.wait_for_selector('.admin-person')
    assert page.locator('#admin-form [name=password]').input_value() == ''
    assert page.locator('.admin-person a[href="tel:01012345678"]').count() == 1
    assert page.locator('.admin-person a[href="sms:01012345678"]').count() == 1
    page.locator('.admin-person summary').click()
    assert page.locator('.admin-person dd').last.inner_text() == '<script>unsafe()</script>'
    assert page.locator('.admin-person script').count() == 0
    page.get_by_role('button', name='출석 확인', exact=True).click()
    page.wait_for_function("document.querySelector('#admin-attendance').textContent==='1'")
    page.get_by_role('button', name='접수 취소', exact=True).click()
    page.wait_for_function("document.querySelector('#admin-cancelled').textContent==='1'")
    page.locator('#admin-search [name=status]').select_option('CANCELLED')
    page.locator('#admin-search button').click()
    page.get_by_role('button', name='접수 복원', exact=True).click()
    page.wait_for_function("document.querySelector('#admin-count').textContent==='1'")
    page.locator('[data-admin-tab=content]').click()
    page.wait_for_selector('#admin-content-form [name=siteTitle]')
    page.locator('#admin-content-form [name=siteTitle]').fill('수정한 행사명')
    page.locator('#admin-content-form [name=contactEmail]').fill('new@example.com')
    page.locator('#admin-content-form [name=contactPhone]').fill('02-1234-5678')
    page.locator('#admin-content-form [type=submit]').click()
    page.wait_for_function("document.querySelector('#admin-content-status').textContent.includes('저장했습니다')")
    assert page.locator('.hero-kicker').inner_text() == '수정한 행사명'
    assert page.locator('[data-contact-call]').get_attribute('href') == 'tel:0212345678'
    assert page.locator('[data-contact-sms]').get_attribute('href') == 'sms:0212345678'
    assert page.evaluate('localStorage.length') == 0
    assert page.evaluate('sessionStorage.length') == 0
    page.set_viewport_size({'width': 375, 'height': 812})
    assert page.locator('#admin').evaluate('(node)=>node.scrollWidth<=node.clientWidth')
    page.screenshot(path='/workspace/scratch/admin-mobile.png')
    page.locator('#admin-logout').click()
    assert not page.locator('#admin-dashboard').is_visible()
    assert page.locator('.admin-person').count() == 0
    assert not errors, errors
    print('PASS: server login, wrong password, contact links, safe applicant rendering, attendance/cancellation/restore, content save, mobile layout and logout')
    browser.close()
