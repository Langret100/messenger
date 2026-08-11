// game-ghost.js v6 - Live2D 연동 (말풍선은 iframe 내부, 캐릭터는 부모 창 Live2D)
// v6 변경사항:
//   - hit(피격), lowHp(저체력), wrong(오답), chest(보물상자) 이벤트 추가
//   - levelup/reward/boss 대사 각 10개로 확장
//   - TTS/말풍선 불일치 수정: postMessage에 line 필드 포함 전달
//   - EMOTION_REMAP: 원본 호환 유지 + 새 타입 추가 (game-emotion.js 미패치 환경 대비)
(function () {
  if (window.gameGhostUI) return;

  const LINES = {
    start: [
      "좋아, 한 번 제대로 놀아보자!",
      "준비 완료! 시작해 볼까?",
      "집중~ 이번 판은 꼭 해보자!",
      "파이팅! 내가 옆에서 지켜보고 있을게.",
      "천천히 해도 괜찮아. 우리 같이 해보자."
    ],
    correct: [
      "와, 정답이야! 완전 멋진데?",
      "맞췄다! 이런 감각이라면 금방 끝내겠는걸?",
      "굿! 지금 흐름 아주 좋아!",
      "정답! 방금 그 느낌 기억해 둬!",
      "오 훌륭해, 이번 판 에이스다!"
    ],
    miss: [
      "괜찮아, 한 번 더 해봐!",
      "어디가 헷갈렸는지 같이 봐볼까?",
      "실수도 연습의 일부야.",
      "다음엔 꼭 맞출 수 있어!"
    ],
    wrong: [
      "아, 아쉬워! 다시 한 번 생각해봐.",
      "틀렸지만 괜찮아, 다시 도전!",
      "조금만 더 집중하면 맞출 수 있어!",
      "이 문제, 같이 다시 봐볼까?",
      "실수 괜찮아! 다음엔 꼭 맞춰봐.",
      "잠깐, 천천히 다시 풀어봐."
    ],
    hit: [
      "앗, 맞았어! 조심해~",
      "피격! 잘 피해야 해~",
      "아야! 체력 챙겨, 얼른!",
      "으악, 맞으면 안 돼! 더 피해봐!",
      "조심! 적이 너무 가까워!",
      "어, 맞았네. 더 조심해야 해~",
      "앗! 한 번 더 맞으면 위험할 수 있어!"
    ],
    lowHp: [
      "체력이 얼마 없어! 서둘러!!",
      "위험해! 체력이 너무 낮아!",
      "빨리 회복해야 해, 지금 당장!",
      "이러다 끝날 수 있어! 조심조심!!",
      "체력 빨간불! 정신 바짝 차려!",
      "살아남아야 해! 피하고 또 피해!",
      "지금 진짜 위험해... 집중해!!"
    ],
    gameover: [
      "아쉽지만 다음에 더 잘할 수 있어.",
      "실패해도 괜찮아. 다시 하면 되지!",
      "이번 판은 여기까지! 한 번 더 도전해 볼까?",
      "에이, 이 정도면 워밍업이지 뭐.",
      "괜찮아. 나도 옆에서 다시 도와줄게.",
      "게임 오버지만, 이 경험이 다음 판을 더 잘하게 해줄 거야!"
    ],
    boss: [
      "보스 등장! 긴장 늦추지 마!",
      "오, 강적이 왔어! 잘 피하면서 싸워!",
      "보스야! 패턴 잘 보고 공격해!",
      "이런, 보스 등장! 집중해!",
      "보스가 나타났어. 침착하게 대응해!"
    ],
    levelup: [
      "레벨업! 점점 강해지고 있어! 😊",
      "레벨 올랐다! 스킬 잘 골라봐!",
      "성장했네! 어떤 능력을 키울 거야?",
      "와, 레벨업! 계속 이렇게 해줘!",
      "레벨업 축하해! 더 강해질 수 있어!",
      "오르고 또 오르고! 정말 잘하고 있어!",
      "레벨이 올랐어! 이제 더 강해졌지?",
      "성장하는 속도가 대단한데? 멋지다!",
      "레벨업 완료! 어떤 스킬로 더 강해질까?",
      "쑥쑥 크고 있어! 이 느낌 유지해봐!"
    ],
    bossClear: [
      "보스 처치! 대단한데?!",
      "와, 해냈어! 보스를 무찔렀어!",
      "보스 격파! 역시 믿었다고!",
      "보스 처치! 정말 잘했어!",
      "완벽해! 다음 보스도 이길 수 있어!"
    ],
    reward: [
      "보상을 골라봐! 신중하게!",
      "어떤 걸 선택할 거야? 기대되는데!",
      "보상 시간! 뭐가 제일 좋을까~?",
      "이것도 좋고 저것도 좋은데… 잘 골라봐!",
      "보상 선택! 전략적으로 생각해봐!",
      "자, 보상이야! 지금 제일 필요한 게 뭐야?",
      "골라골라! 이 순간이 게임의 하이라이트지~",
      "신중하게 골라봐. 어떤 걸 택할지 궁금한데!",
      "보상을 고를 수 있다는 게 설레지 않아?",
      "좋은 선택을 해봐! 응원하고 있어~"
    ],
    chest: [
      "보물 상자다! 문제 풀면 아이템이 나와!",
      "상자를 열 기회야! 집중해서 풀어봐!",
      "오, 보물 상자 등장! 정답 맞히면 보상이 있어!",
      "문제를 풀면 뭔가 좋은 게 나올 것 같은데?",
      "상자 문제야! 꼭 맞혀봐~"
    ]
  };

  // EMOTION_REMAP: 부모창 game-emotion.js 로 전달할 타입
  // 원본 호환(good/miss/gameover/start)을 유지하되, game-emotion.js v2 패치시 새 타입도 지원
  const EMOTION_REMAP = {
    start:     "start",
    correct:   "good",
    miss:      "miss",
    wrong:     "miss",       // game-emotion.js 미패치 환경: miss로 fallback
    hit:       "miss",       // game-emotion.js 미패치 환경: miss로 fallback
    lowHp:     "miss",       // game-emotion.js 미패치 환경: miss로 fallback
    gameover:  "gameover",
    exit:      "exit",
    boss:      "start",      // game-emotion.js 미패치 환경: start로 fallback
    levelup:   "good",       // game-emotion.js 미패치 환경: good으로 fallback
    bossClear: "good",       // game-emotion.js 미패치 환경: good으로 fallback
    reward:    "good",       // game-emotion.js 미패치 환경: good으로 fallback
    chest:     "good"        // game-emotion.js 미패치 환경: good으로 fallback
  };

  let bubbleEl = null;
  let hideTimer = null;

  function choice(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  function ensureDom() {
    if (bubbleEl) return;
    const d = document;
    const style = d.createElement("style");
    style.textContent = `
      .game-ghost-bubble {
        position: fixed;
        right: auto;
        left: auto;
        bottom: 0;
        padding: 7px 11px;
        border-radius: 14px 14px 4px 14px;
        background: rgba(255,255,255,0.97);
        box-shadow: 0 3px 12px rgba(0,0,0,0.22);
        font-size: 0.78rem;
        line-height: 1.42;
        text-align: left;
        color: #222;
        opacity: 0;
        transform: translateY(8px);
        transition: opacity 0.2s ease-out, transform 0.2s ease-out;
        pointer-events: none;
        z-index: 10002;
        box-sizing: border-box;
        word-break: keep-all;
        overflow-wrap: break-word;
      }
      .game-ghost-bubble::after {
        content: '';
        position: absolute;
        right: 14px;
        bottom: -8px;
        border: 8px solid transparent;
        border-top-color: rgba(255,255,255,0.97);
        border-bottom: none;
      }
      .game-ghost-bubble.visible {
        opacity: 1;
        transform: translateY(0);
      }
    `;
    d.head.appendChild(style);
    bubbleEl = d.createElement("div");
    bubbleEl.className = "game-ghost-bubble";
    d.body.appendChild(bubbleEl);
  }

  function calcBubblePos() {
    var isMob = window.innerWidth <= 768;
    var charW, charH, bubW, bubbleBottom;
    if (isMob) {
      charW = Math.min(140, Math.max(85,  Math.round(window.innerWidth  * 0.28)));
      charH = Math.min(220, Math.max(140, Math.round(window.innerHeight * 0.26)));
    } else {
      charW = Math.min(200, Math.max(120, Math.round(window.innerWidth  * 0.14)));
      charH = Math.min(300, Math.max(200, Math.round(window.innerHeight * 0.32)));
    }
    bubW = Math.round(charW * 1.7);
    bubbleBottom = Math.round(charH * 0.95) + "px";
    return {
      bottom:    bubbleBottom,
      right:     (isMob ? 6 : 10) + "px",
      left:      "auto",
      maxWidth:  bubW + "px",
      width:     "auto"
    };
  }

  function showBubble(text) {
    if (!bubbleEl) return;
    if (text) {
      bubbleEl.textContent = text;
      var pos = calcBubblePos();
      bubbleEl.style.bottom    = pos.bottom;
      bubbleEl.style.right     = pos.right;
      bubbleEl.style.left      = pos.left;
      bubbleEl.style.width     = pos.width;
      bubbleEl.style.maxWidth  = pos.maxWidth;
      bubbleEl.classList.add("visible");
    } else {
      bubbleEl.textContent = "";
      bubbleEl.classList.remove("visible");
    }
  }

  function react(eventType) {
    ensureDom();
    if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }

    const lines = LINES[eventType];
    if (!lines || !lines.length) return;
    const line = choice(lines);

    // 말풍선은 iframe 안에 표시
    showBubble(line);

    // 부모 창으로 감정 이벤트 + 선택된 대사 전달
    // line을 함께 보내면 game-emotion.js v2 이상에서 TTS가 동일한 대사를 읽음
    var parentType = EMOTION_REMAP[eventType] || eventType;
    try {
      var target = (window.parent !== window) ? window.parent : (window.opener || null);
      if (target) target.postMessage({ type: "GAME_REACT", eventType: parentType, line: line }, "*");
    } catch(e) {}

    hideTimer = setTimeout(function() { showBubble(""); }, 5000);
  }

  window.gameGhostUI = { react: react };
  window.gameGhostReact = react;  // 편의 별칭

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", ensureDom);
  } else {
    ensureDom();
  }
})();
