# 관리자 기능 서버 업데이트

기존 서버의 `adminSummary`로 비밀번호를 검증하고 접수 인원·출석 인원을 조회할 수 있습니다. 행사 정보 수정과 접수 목록·상태 변경은 아래 확장 코드를 배포해야 동작합니다. 프론트엔드 파일만 바꿔서는 Google Sheets 수정 권한이 추가되지 않습니다.

## 1. 확장 파일 추가

현재 사용 중인 Apps Script 프로젝트에 **Admin** 스크립트 파일을 추가하고, [Admin.gs](Admin.gs)의 전체 내용을 붙여넣습니다. 기존 `DB_ID`, `db_`, `settings_`, `literal_`, `adminSummary_` 등은 그대로 유지합니다. 실제 비밀번호와 스프레드시트 ID를 공개 저장소에 복사하지 마세요.

## 2. 기존 doPost 교체

기존 `doPost` 함수만 아래 내용으로 교체합니다. 같은 이름의 함수를 새 파일에 중복 추가하지 마세요. 기존 접수 저장과 관리자 요약 처리는 그대로 호출합니다.

```javascript
function doPost(e) {
  try {
    const raw = e && e.parameter && e.parameter.payload;
    if (!raw || raw.length > 20000) throw new Error('올바르지 않은 요청입니다.');
    const req = JSON.parse(raw);
    const adminResult = adminApi_(req);
    if (adminResult !== null) return output_(adminResult);
    if (req.action === 'register') return output_(register_(req));
    if (req.action === 'adminSummary') return output_(adminSummary_(req));
    throw new Error('지원하지 않는 요청입니다.');
  } catch (err) {
    return output_({ok: false, message: err.message || '처리 중 오류가 발생했습니다.'});
  }
}
```

## 3. 같은 배포를 새 버전으로 업데이트

**저장 → 배포 → 배포 관리 → 수정 → 새 버전 → 배포**를 선택합니다. 실행 사용자는 **나**, 액세스 권한은 **모든 사용자**를 유지합니다. 같은 배포를 업데이트하면 사이트의 웹 앱 주소를 바꿀 필요가 없습니다.

## 4. 사이트에서 확인

1. 관리자 화면에서 **Settings의 기존 adminPassword**로 로그인합니다. 비밀번호를 채팅이나 GitHub에 올리지 마세요.
2. 접수 현황에서 검색·필터·신청 내용 상세와 전화·문자 버튼을 확인합니다.
3. 기존 ‘DB연동 확인용 테스트’ 행을 이용해 출석 확인/취소, 접수 취소/복원을 확인합니다. 실제 참가자의 상태를 테스트 목적으로 바꾸지 마세요.
4. 행사 정보 수정에서 필요한 내용을 저장한 뒤 로그아웃하고 새로고침하여 반영을 확인합니다.

## 저장 범위와 인증

- 기존 18열 `Registrations` 구조를 유지하며 출석(16열)·접수 상태(18열)만 변경합니다. 신청 행을 삭제하지 않습니다. 같은 연락처의 활성 접수가 있으면 취소된 접수를 복원하지 않습니다.
- 행사 제목·소개·일시·장소·주최·주관·문의처·개인정보 안내·접수 활성 여부는 `Settings`의 허용된 키로 저장합니다. `adminPassword`는 이 편집 API로 읽거나 수정할 수 없습니다.
- 공개 콘텐츠 조회는 허용된 행사 정보만 반환합니다. 신청자 정보 조회·변경과 행사 정보 저장은 요청마다 기존 서버의 관리자 인증을 거칩니다.
- 개인정보 안내를 바꾸면 `consentVersion`을 갱신합니다. 다른 관리자가 먼저 저장한 경우 수정 버전 충돌을 알려 덮어쓰기를 막습니다.
- 비밀번호는 HTTPS 요청에만 사용하며 브라우저 저장소에 기록하지 않습니다. 창 닫기·로그아웃·15분 미사용 시 화면의 신청자 정보와 메모리의 로그인 정보를 지웁니다.
- ‘전화’와 ‘문자’는 사용 중인 기기의 전화·문자 앱을 엽니다. 사이트에서 자동 발신·자동 발송하지 않습니다.

로컬 검증: `node tests/admin-backend.test.cjs`. 로컬 정적 서버 실행 후 `python3 tests/admin-browser.py`, `python3 tests/registration-browser.py`를 실행합니다. 이 검증은 모의 API/시트로 실행하며 실제 서버 적용 여부와 구분해야 합니다.
