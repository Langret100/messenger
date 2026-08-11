# GitHub Pages 배포

1. 이 폴더 내용을 저장소 루트에 올립니다.
2. 저장소 Settings → Secrets and variables → Actions에서 `FIREBASE_API_KEY`를 등록합니다.
3. main 브랜치에 push하면 테스트 통과 후 Pages에 배포됩니다.
4. 저장소 Settings → Pages의 Source는 **GitHub Actions**로 설정합니다.

## 중요한 실제 조건

- Firebase 키만 넣는다고 항상 통신되는 것은 아닙니다. Realtime Database 규칙이 `mini_talk/v3/*` 경로의 읽기/쓰기를 허용해야 합니다.
- `js/config.js`의 `firebase.apiKey`가 `__FIREBASE_API_KEY__`이면 서버 대신 로컬 저장으로 자동 전환됩니다. GitHub Actions의 `FIREBASE_API_KEY` Secret을 실제 Firebase 웹 앱 API 키로 설정해야 합니다.
- 현재 로그인은 기존 Apps Script 주소에 의존합니다.
- 관리자 권한은 클라이언트 명령어 방식입니다. 공개·상업 운영에서는 서버 검증으로 이전해야 합니다.

## 대화 저장 구조

- 대화방 명단은 Firebase의 `mini_talk/v3/rooms`에서 직접 불러옵니다.
- 대화 내용은 Firebase의 `mini_talk/v3/messages/{roomId}`에서 최근 100개를 직접 구독합니다.
- Google Sheets의 `미니톡_대화방백업`, `미니톡_메시지백업`은 추가 백업 전용입니다. 앱은 이 시트를 읽지 않습니다.
- 시트 백업은 `no-cors`/`keepalive`로 전송하여 채팅 저장과 화면 반응이 Apps Script 응답을 기다리지 않습니다.
