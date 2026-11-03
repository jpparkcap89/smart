# 접수 DB 연결

기존 배포를 사용하며 새 서버 코드 배포는 필요하지 않습니다. 기존 서버 원본과 실제 스프레드시트 ID는 공개 저장소에 포함하지 않습니다. 새 관리자 기능 확장 코드와 적용 방법은 [관리자 서버 업데이트](ADMIN-SETUP.md)를 참고하세요.

- `registration-config.js`: 공개 웹 앱 배포 URL과 연결 활성 여부
- `registration-api.js`: GET 설정 조회, POST 신청 저장
- `index.html`: Programs 시트와 공백까지 일치하는 트랙 값
- 기존 시트: Settings, Programs, Registrations, Certificates

Apps Script는 **실행 사용자: 나 / 액세스 권한: 모든 사용자**로 배포해야 로그인하지 않은 참가자도 신청할 수 있습니다. 현재 주소의 익명 GET은 설정 JSON을 정상 반환합니다. Settings의 registrationEnabled는 TRUE로 설정됐으며 실제 브라우저를 통한 저장과 동일 요청 중복 방지를 확인했습니다. 조직 정책상 익명 공개를 허용하지 않는 경우 공개 접수용 배포 대안이 필요합니다.

브라우저는 서버의 `consentVersion`, `privacyRetention`, `mediaUsageScope`, `registrationEnabled`를 읽습니다. POST는 `payload` 필드에 `{action:"register",requestId,consentVersion,data}` JSON을 넣습니다. data에는 name, organization, email, phone, morningTrack, afternoonTrack, consent, certificate(boolean), mediaConsent, discoverySource, futureTopics를 보냅니다.

성공 응답의 registrationId가 요청 ID와 일치할 때만 완료를 표시합니다. 실패 후 같은 화면에서 재시도하면 같은 ID를 사용하여 중복 저장을 방지합니다. 동의 버전 변경·연락처 중복 등의 서버 오류는 신청자에게 안내합니다. 서버 설정을 불러오지 못하면 제출할 수 없습니다.

검증 명령:

```sh
# 로컬 서버 실행 후, Playwright/Chromium이 있는 환경에서
python3 tests/registration-browser.py
```

브라우저 검증은 모의 API로 실행합니다. 제공된 서버 코드에 대한 저장·중복 방지 검증은 공개 저장소 밖의 로컬 모의 Sheets 환경에서 수행했습니다. 2026-11-03 실제 브라우저에서 예시 신청을 저장해 접수번호를 받고, 동일 요청을 재전송하여 duplicate: true 응답을 확인했습니다. 서버가 Registrations의 기존 행을 확인했으므로 동일 ID 중복 저장 방지도 검증했습니다. 검증용 예시 신청 한 건은 운영자가 시트에서 삭제할 수 있습니다. 공개 서버는 신청자 목록을 반환하지 않습니다. 관리자 로그인·접수 관리 확장 절차는 ADMIN-SETUP.md를 참고하세요. 수료증 발급 기능은 별도입니다.
