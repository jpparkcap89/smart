"""Run with a local server on port 8000. API replies are simulated, not Sheets writes."""
import json
from playwright.sync_api import sync_playwright

BASE = 'http://127.0.0.1:8000'
ENDPOINT = 'https://script.google.com/macros/s/test-deployment/exec'

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True)
    page = browser.new_page()
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.route('**/registration-config.js*', lambda route: route.fulfill(
        content_type='application/javascript',
        body=f'window.REGISTRATION_CONFIG={{enabled:true,endpoint:{json.dumps(ENDPOINT)}}};'))
    requests = []

    def api(route):
        from urllib.parse import parse_qs
        if route.request.method == 'GET':
            route.fulfill(content_type='application/json', headers={'access-control-allow-origin': '*'}, body=json.dumps({'ok': True, 'service': 'smart-festival-2026', 'registrationEnabled': True, 'privacyRetention': '행사 종료 후 1년', 'mediaUsageScope': '학회 홈페이지 행사 소개', 'consentVersion': 'test-v1'}))
            return
        data = json.loads(parse_qs(route.request.post_data)['payload'][0])
        if data['action'] == 'getPublicContent':
            route.fulfill(content_type='application/json', headers={'access-control-allow-origin': '*'}, body=json.dumps({'ok': True, 'content': {}}))
            return
        requests.append(data)
        result = {'ok': False, 'message': '저장 실패. 다시 시도해 주세요.'} if len(requests) == 1 else {'ok': True, 'registrationId': data['requestId']}
        route.fulfill(content_type='application/json', headers={'access-control-allow-origin': '*'}, body=json.dumps(result))

    page.route(ENDPOINT, api)
    page.goto(BASE + '/#register', wait_until='domcontentloaded')
    for key, value in {'name': '테스트', 'organization': '예시학교', 'email': 'test@example.com', 'phone': '01012345678', 'futureTopic': 'AI 교육'}.items():
        page.locator(f'#registration [name="{key}"]').fill(value)
    page.wait_for_function("!document.querySelector('#registration [type=submit]').disabled")
    page.locator('[name="discovery"]').select_option('지인 추천')
    page.locator('[name="certificate"]').check()
    assert page.locator('#privacy-retention').inner_text() == '행사 종료 후 1년'
    assert page.locator('#media-usage').inner_text() == '학회 홈페이지 행사 소개'
    page.locator('[name="morningTrack"]').first.check()
    page.locator('[name="afternoonTrack"]').nth(1).check()
    page.locator('[name="consent"]').nth(1).check()
    page.locator('[name="photoConsent"]').nth(1).check()
    page.locator('#registration [type="submit"]').click()
    assert not page.locator('#confirmation').is_visible()
    assert '동의가 필요합니다' in page.locator('#registration-status').inner_text()
    assert not requests
    print('PASS: privacy refusal prevents submission')
    page.locator('[name="consent"]').first.check()
    page.locator('#registration [type="submit"]').click()
    assert page.locator('#registration-send').is_disabled()
    assert not requests
    page.locator('#registration-edit').click()
    assert not page.locator('#confirmation').is_visible()
    assert page.locator('#registration [name="name"]').input_value() == '테스트'
    page.locator('#registration [type="submit"]').click()
    assert not page.locator('#review-confirm').is_checked()
    assert page.locator('#registration-send').is_disabled()
    assert page.locator('#registration-retry').count() == 0
    page.locator('#review-confirm').check()
    page.locator('#registration-send').click()
    page.wait_for_function("document.querySelector('#complete-message').textContent.includes('다시 시도')")
    assert '접수되었습니다' not in page.locator('#complete-message').inner_text()
    assert page.locator('#registration-send').is_enabled()
    page.locator('#registration-send').click()
    page.wait_for_function("document.querySelector('#complete-message').textContent.includes('참가 신청이 접수되었습니다')")
    assert page.locator('#registration-send').is_hidden()
    assert len(requests) == 2
    assert requests[0]['requestId'] == requests[1]['requestId']
    assert requests[1]['data']['phone'] == '010-1234-5678'
    assert requests[1]['data']['mediaConsent'] == '동의하지 않습니다.'
    assert requests[1]['data']['certificate'] is True
    assert requests[1]['data']['discoverySource'] == '지인 추천'
    assert requests[1]['consentVersion'] == 'test-v1'
    assert len(requests[1]['data']) == 11
    assert not errors, errors
    print('PASS: failed save is not success; retry preserves ID and all answers; acknowledged save shows receipt')
    for reply, expected in [
        ({'ok': True, 'service': 'smart-festival-2026', 'registrationEnabled': False, 'privacyRetention': '1년', 'consentVersion': 'test-v1'}, '현재 참가 신청을 준비 중'),
        ({'ok': False, 'message': '설정 조회 오류'}, '설정 조회 오류')
    ]:
        page.unroute(ENDPOINT)
        def settings_reply(route):
            route.fulfill(content_type='application/json', headers={'access-control-allow-origin': '*'}, body=json.dumps(reply))
        page.route(ENDPOINT, settings_reply)
        page.reload(wait_until='domcontentloaded')
        page.wait_for_function('(text)=>document.querySelector("#registration-status").textContent.includes(text)', arg=expected)
        assert page.locator('#registration [type="submit"]').is_disabled()
    print('PASS: closed registration and settings errors prevent submission')
    browser.close()
