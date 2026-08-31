# 미니톡 구조 원칙

## 계층별 책임

1. `index.html`은 고정 앱 셸과 의존성 로딩 순서만 관리합니다.
2. `js/app.js`는 앱 시작과 종료 처리만 담당합니다.
3. `js/core/`는 상태, 이벤트, 라우팅, 기능 등록처럼 앱 전체가 공유하는 기반입니다.
4. `js/adapters/`는 저장소, 실시간 통신, 창 제어 등 브라우저·외부 서비스와의 경계입니다.
5. `js/features/`는 화면 단위 조립만 담당하고, 복잡한 내부 기능은 별도 하위 모듈에 위임합니다.
6. `js/chat/`, `js/tools/`, `js/games/`, `js/tasks/`, `js/economy/`, `js/game-bridge/`는 각 기능군 안에서 재사용되는 세부 모듈입니다.
7. `css/features/`는 독립 화면이나 독립 기능의 스타일을 관리합니다.

## 도구 기능 구성

- `js/features/tools.js`: 도구 목록과 모듈 연결
- `js/tools/notifications.js`: 알림 모드, 소리·진동·시스템 알림
- `js/tools/timer-alarm.js`: 타이머·알람 상태와 실행
- `js/tools/tarot-view.js`: 카드 선택과 결과 연출
- `js/tools/profile-editor.js`: 프로필 편집과 이미지 축소
- `js/tools/capture.js`: 화면 캡처와 채팅 전송
- `js/tarot.js`: 화면과 무관한 카드 데이터·추첨 규칙

## 게임·과제·코인 구성

- `js/games/score-service.js`: 게임 점수의 로컬 보관과 서버 전송
- `js/games/ranking.js`: 게임별 랭킹 표시
- `js/games/board.js`: 게임 게시판 조회와 작성
- `js/tasks/daily-math-quest.js`: 사용자별 일일 5종 수학 퀘스트와 도장
- `js/tasks/daily-korean-quest.js`: 사용자별 일일 5종 국어 퀘스트와 도장
- `js/tasks/daily-quest-clock.js`: 수학·국어 공용 오전 9시 회차와 남은 시간 계산
- `js/economy/coin-wallet.js`: 코인 조회·표시와 향후 보상/구매 연동 경계
- `js/economy/quest-reward.js`: 토리 Apps Script 규격의 과목별 일일 퀘스트 코인 보상

## 수정 규칙

- 새 화면은 `MiniTalk.Registry.register()`로 등록합니다.
- 기능 간 느슨한 통신은 `MiniTalk.Store`와 `MiniTalk.Events`를 우선합니다.
- 브라우저 API를 여러 화면에서 직접 호출하지 말고 담당 서비스 모듈 하나로 모읍니다.
- 사용자 입력은 `textContent` 또는 `MiniTalk.UI.Dom.el(..., { text })`로 표시합니다.
- 주석은 코드가 그대로 말해 주는 동작 설명보다 제약, 의존성, 선택 이유를 기록합니다.
- 캐시 대상 파일을 추가하면 `index.html`, `sw.js`, `tests/module-load.test.js`의 로딩 목록을 함께 갱신합니다.
- 기능 삭제는 연결 파일과 해당 모듈만 제거해도 나머지 화면이 작동하도록 유지합니다.
