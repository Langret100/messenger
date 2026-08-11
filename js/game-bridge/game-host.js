/* ============================================================
   GAME HOST ADAPTER
   역할:
   - 게임 feature와 실제 iframe 사이의 경계를 담당합니다.
   - 메신저 본체의 Router/Store를 게임 HTML이 직접 건드리지 않게 합니다.
   - 게임 닫기, 점수 이벤트, 수학탐험대 결과 이벤트를 한 곳에서 처리합니다.

   제거 방법:
   1) index.html의 game-host.js 로드 삭제
   2) js/features/games.js 삭제
   3) games/ 및 js/game-ghost.js, js/math-explorer-bridge.js 삭제

   주의:
   - 게임은 원본 토리 HTML을 iframe으로 격리해 가져옵니다.
   - 부모 메신저와 통신은 postMessage만 사용합니다.
   ============================================================ */
MiniTalk.GameHost=(()=>{
  let overlay=null, frame=null, titleNode=null, currentGame=null, bgm=null, messageWindow=null;

  function ensure(){
    const D=MiniTalk.UI.Dom;
    const doc=D.doc();
    if(overlay&&overlay.isConnected&&overlay.ownerDocument===doc)return overlay;
    if(messageWindow){try{messageWindow.removeEventListener("message",onMessage)}catch{}messageWindow=null}
    overlay=null;frame=null;titleNode=null;
    overlay=D.el("section",{class:"game-overlay hidden",id:"gameOverlay","aria-label":"게임 실행 화면"});
    const bar=D.el("header",{class:"game-bar"});
    const close=D.el("button",{class:"game-close",type:"button",text:"‹","aria-label":"게임 닫기",onclick:closeGame});
    titleNode=D.el("strong",{class:"game-title",text:"게임"});
    const badge=D.el("span",{class:"game-badge",text:"GAME"});
    bar.append(close,titleNode,badge);
    frame=D.el("iframe",{class:"game-frame",title:"게임",allow:"autoplay; fullscreen",referrerpolicy:"same-origin"});
    overlay.append(bar,frame);
    doc.body.append(overlay);
    messageWindow=doc.defaultView||window;
    messageWindow.addEventListener("message",onMessage);
    return overlay;
  }

  function stopBgm(){
    if(!bgm)return;
    try{bgm.pause();bgm.currentTime=0}catch{}
    bgm=null;
  }

  function playBgm(src){
    stopBgm();
    if(!src)return;
    try{
      bgm=new Audio(src);bgm.loop=true;bgm.volume=.42;
      bgm.play().catch(()=>{});
    }catch{bgm=null}
  }

  function open(game){
    if(!game?.url)throw new Error("게임 주소가 없습니다.");
    ensure();
    currentGame=game;
    titleNode.textContent=game.title||"게임";
    frame.src=game.url;
    overlay.classList.remove("hidden");
    MiniTalk.UI.Dom.doc().body.classList.add("game-open");
    playBgm(game.bgm);
  }

  function closeGame(){
    if(!overlay)return;
    overlay.classList.add("hidden");
    MiniTalk.UI.Dom.doc().body.classList.remove("game-open");
    try{frame.src="about:blank"}catch{}
    stopBgm();
    currentGame=null;
  }

  function isOpen(){return !!(overlay&&!overlay.classList.contains("hidden"));}

  function sendScore(gameName,score){
    return MiniTalk.Games.ScoreService.submit(gameName,score);
  }

  function onMessage(event){
    if(!frame||event.source!==frame.contentWindow)return;
    const data=event.data;
    if(!data)return;
    if(data==="WG_EXIT_GAME"||data.type==="WG_EXIT_GAME")return closeGame();
    if(data.type==="GAME_SCORE")return sendScore(data.gameName||data.game,data.score);
    if(data.type==="MATH_EXPLORER_RESULT"){
      const score=Number(data.score||0);
      if(score>0)sendScore("수학탐험대",score);
      return;
    }
    // 토리의 캐릭터 감정 이벤트는 이 프로그램에는 캐릭터가 없으므로 무시합니다.
    // 게임 iframe 안의 자체 말풍선은 그대로 표시됩니다.
  }

  return{open,close:closeGame,isOpen,current:()=>currentGame};
})();
