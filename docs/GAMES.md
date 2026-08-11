# 게임 모듈

게임 기능은 메신저 핵심과 분리되어 있습니다.

- `js/features/games.js`: 목록, 설명, 실행 버튼
- `js/games/score-service.js`: 로컬 최고 점수와 온라인 점수 전송
- `js/games/ranking.js`: 게임별 랭킹 화면
- `js/games/board.js`: 토리 게시판 조회·작성과 오프라인 보관
- `js/game-bridge/game-host.js`: iframe/BGM/postMessage
- `games/`: 독립 게임 파일

## 게임 하나 추가하기

1. HTML을 `games/`에 추가합니다.
2. 필요한 로컬 의존 파일도 프로젝트에 추가합니다.
3. `js/features/games.js`의 `GAMES` 배열에 항목 하나만 추가합니다.

```js
{id:"sample", title:"샘플", desc:"설명", icon:"◆", url:"games/sample.html", tag:"분류"}
```

부모와 점수 통신이 필요하면 게임에서 다음 형식으로 보냅니다.

```js
window.parent.postMessage({type:"GAME_SCORE", gameName:"게임명", score:100}, "*");
```

`game-host.js`가 메시지 출처를 확인한 뒤 `ScoreService`에 전달합니다. 로그인 사용자는 토리 온라인 랭킹에 전송하고, 게스트나 연결 실패 기록은 기기에 최고 점수로 보관합니다.

랭킹에 표시할 게임은 `GAMES` 항목에 `rankingName`을 지정합니다. 종료 점수가 없는 육성형 게임은 이 값을 생략합니다.
