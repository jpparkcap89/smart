# 관리자 기능 서버 업데이트

최신 버전은 **순차 접수 ID, 신청자 수정, 관리자 수정·삭제**를 함께 적용합니다.

[통합 서버 업데이트 안내](SERVER-UPDATE.md)를 따라 `Registration.gs`, `Participant.gs`, `Admin.gs`를 추가/갱신하고 기존 `doPost`를 교체한 뒤 같은 웹 앱 배포를 새 버전으로 업데이트해 주세요.

관리자는 기존 Settings의 adminPassword로 로그인합니다. 비밀번호는 채팅이나 공개 저장소에 올리지 마세요. 기존 관리자 비밀번호와 DB 설정은 그대로 유지합니다.
