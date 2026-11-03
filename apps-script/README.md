# 접수 DB 연결

기존 배포를 사용하며 새 서버 코드 배포는 필요하지 않습니다. 서버 코드와 스프레드시트 ID는 공개 저장소에 포함하지 않습니다.

- `registration-config.js`: 공개 웹 앱 배포 URL과 연결 활성 여부
- `registration-api.js`: GET 설정 조회, POST 신청 저장
- `index.html`: Programs 시트와 공백까지 일치하는 트랙 값
- 기존 시트: Settings, Programs, Registrations, Certificates

Apps Script는 **실행 사용자: 나 / 액세스 권한: 모든 사용자**로 배포해야 로그인하지 않은 참가자도 신청할 수 있습니다. 현재 주소의 익명 GET은 설정 JSON을 정상 반환합니다. registrationEnabled는 false이므로 Settings에서 TRUE로 변경해야 저장 테스트를 진행할 수 있습니다. 조직 정책상 익명 공개를 허용하지 않는 경우 공개 접수용 배포 대안이 필요합니다.

브라우저는 서버의 `consentVersion`, `privacyRetention`, `mediaUsageScope`, `registrationEnabled`를 읽습니다. POST는 `payload` 필드에 `{action:"register",requestId,consentVersion,data}` JSON을 넣습니다. data에는 name, organization, email, phone, morningTrack, afternoonTrack, consent, certificate(boolean), mediaConsent, discoverySource, futureTopics를 보냅니다.

성공 응답의 registrationId가 요청 ID와 일치할 때만 완료를 표시합니다. 실패 후 같은 화면에서 재시도하면 같은 ID를 사용하여 중복 저장을 방지합니다. 동의 버전 변경·연락처 중복 등의 서버 오류는 신청자에게 안내합니다. 서버 설정을 불러오지 못하면 제출할 수 없습니다.

검증 명령:

```sh
# 로컬 서버 실행 후, Playwright/Chromium이 있는 환경에서
python3 tests/registration-browser.py
```

브라우저 검증은 모의 API로 실행합니다. 제공된 서버 코드에 대한 저장·중복 방지 검증은 공개 저장소 밖의 로컬 모의 Sheets 환경에서 수행했습니다. 실제 저장 검증은 예시 신청의 응답과 접수번호를 확인한 뒤 실제 Registrations 시트 행과 대조해야 합니다. 공개 서버는 신청자 목록을 반환하지 않습니다. 관리자 화면 인증이나 수료증 발급은 이 연결 작업에 포함하지 않습니다.
