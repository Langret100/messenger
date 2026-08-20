/* ============================================================
   GAME HOST ADAPTER
   역할:
   - 메신저의 게임 feature와 실제 게임 HTML 사이의 경계를 담당합니다.
   - 모바일은 기존 전체화면 iframe, PC/웨일북은 별도 큰 팝업 창으로 실행합니다.
   - 게임 닫기, 점수 이벤트, 수학탐험대 결과 이벤트를 한 곳에서 처리합니다.
   ============================================================ */
MiniTalk.GameHost=(()=>{
  let overlay=null, frame=null, titleNode=null, currentGame=null, bgm=null, messageWindow=null;
  let gamePopup=null, popupClosing=false;

  function detachMessageWindow(){
    if(!messageWindow)return;
    try{messageWindow.removeEventListener("message",onMessage)}catch{}
    messageWindow=null;
  }

  function attachMessageWindow(win){
    if(messageWindow===win)return;
    detachMessageWindow();
    messageWindow=win||window;
    messageWindow.addEventListener("message",onMessage);
  }

  function ensure(){
    const D=MiniTalk.UI.Dom;
    const doc=D.doc();
    if(overlay&&overlay.isConnected&&overlay.ownerDocument===doc){attachMessageWindow(doc.defaultView||window);return overlay}
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
    attachMessageWindow(doc.defaultView||window);
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

  function mobileGameMode(){
    if(MiniTalk.MobileImmersive?.isMobile?.())return true;
    const ua=navigator.userAgent||"";
    return /Android|iPhone|iPad|iPod|Mobile/i.test(ua)&&!/CrOS/i.test(ua);
  }

  function popupBounds(){
    const scr=window.screen||{};
    const availWidth=Math.max(900,Number(scr.availWidth)||1280);
    const availHeight=Math.max(650,Number(scr.availHeight)||800);
    const width=Math.max(900,Math.min(1360,Math.round(availWidth*.90)));
    const height=Math.max(650,Math.min(920,Math.round(availHeight*.90)));
    const left=Math.round((Number(scr.availLeft)||0)+(availWidth-width)/2);
    const top=Math.round((Number(scr.availTop)||0)+(availHeight-height)/2);
    return{width,height,left,top};
  }

  function popupFeatures(){
    const b=popupBounds();
    return `popup=yes,toolbar=no,location=no,menubar=no,status=no,scrollbars=no,resizable=yes,width=${b.width},height=${b.height},left=${b.left},top=${b.top}`;
  }

  function cleanupPopupState(win){
    if(gamePopup!==win)return;
    detachMessageWindow();
    gamePopup=null;frame=null;titleNode=null;
    stopBgm();
    currentGame=null;
  }

  function openDesktop(game){
    let popup=null;
    try{popup=window.open("","MoaruMiniGame",popupFeatures())}catch{}
    if(!popup)return false;
    gamePopup=popup;popupClosing=false;currentGame=game;
    const doc=popup.document;
    const base=String(document.baseURI||location.href).replace(/"/g,"%22");
    doc.open();
    doc.write(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><base href="${base}"><title>${String(game.title||"게임").replace(/[<>]/g,"")}</title><style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#080b10;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.host{height:100%;display:grid;grid-template-rows:48px minmax(0,1fr)}.bar{display:flex;align-items:center;gap:10px;padding:0 12px;background:#0c1119;color:#f5f7fb;border-bottom:1px solid #202936;user-select:none}.close{width:34px;height:34px;border:0;border-radius:10px;background:#171f2b;color:#fff;font-size:22px;cursor:pointer}.title{flex:1;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.badge{font-size:9px;font-weight:900;letter-spacing:.08em;color:#73e6c0;background:#133529;padding:5px 7px;border-radius:999px}.frame{width:100%;height:100%;border:0;background:#fff}</style></head><body><main class="host"><header class="bar"><button id="gameClose" class="close" type="button" aria-label="게임 닫기">‹</button><strong class="title"></strong><span class="badge">GAME</span></header><iframe id="gameFrame" class="frame" title="게임" allow="autoplay; fullscreen" referrerpolicy="same-origin"></iframe></main></body></html>`);
    doc.close();
    titleNode=doc.querySelector(".title");
    if(titleNode)titleNode.textContent=game.title||"게임";
    frame=doc.getElementById("gameFrame");
    doc.getElementById("gameClose")?.addEventListener("click",closeGame);
    attachMessageWindow(popup);
    popup.addEventListener("pagehide",()=>{if(!popupClosing)cleanupPopupState(popup)},{once:true});
    frame.src=game.url;
    try{popup.focus()}catch{}
    playBgm(game.bgm);
    return true;
  }

  function openInline(game){
    ensure();
    currentGame=game;
    titleNode.textContent=game.title||"게임";
    frame.src=game.url;
    overlay.classList.remove("hidden");
    MiniTalk.UI.Dom.doc().body.classList.add("game-open");
    playBgm(game.bgm);
  }

  function open(game){
    if(!game?.url)throw new Error("게임 주소가 없습니다.");
    if(gamePopup&&!gamePopup.closed){try{gamePopup.focus()}catch{}return}
    if(!mobileGameMode()&&openDesktop(game))return;
    openInline(game);
  }

  function closeGame(){
    if(gamePopup&&!gamePopup.closed){
      const popup=gamePopup;popupClosing=true;
      try{frame&&(frame.src="about:blank")}catch{}
      try{popup.close()}catch{}
      cleanupPopupState(popup);popupClosing=false;
      return;
    }
    if(!overlay)return;
    overlay.classList.add("hidden");
    MiniTalk.UI.Dom.doc().body.classList.remove("game-open");
    try{frame.src="about:blank"}catch{}
    stopBgm();
    currentGame=null;
  }

  function isOpen(){return Boolean((gamePopup&&!gamePopup.closed)||(overlay&&!overlay.classList.contains("hidden")))}

  function sendScore(gameName,score){
    return MiniTalk.Games.ScoreService.submit(gameName,score);
  }

  let lastExplorerReportKey="";
  function explorerCharacterName(data){
    const named=String(data?.characterName||"").trim();
    if(named)return named;
    const type=String(data?.characterType||"").trim();
    return ({warrior:"전사",archer:"궁수",mage:"마법사",valkyrie:"발키리"})[type]||type||"고스트";
  }

  function formatExplorerEndedAt(value){
    const d=new Date(Number(value)||Date.now());
    const pad=n=>String(n).padStart(2,"0");
    return `${d.getFullYear()}년 ${d.getMonth()+1}월 ${d.getDate()}일 ${pad(d.getHours())}시 ${pad(d.getMinutes())}분`;
  }

  async function reportExplorerBoard(data,rawScore){
    if(rawScore<5000)return;
    const user=MiniTalk.Store.get("user")||{};
    if(!user.user_id||user.isGuest)return;
    const endedAt=Number(data?.endedAt)||Date.now();
    const stage=Math.max(1,Math.floor(Number(data?.stage)||1));
    const hard=Boolean(data?.hardMode);
    const charName=explorerCharacterName(data);
    const key=[user.user_id,rawScore,stage,hard?1:0,endedAt].join(":");
    if(lastExplorerReportKey===key)return;
    lastExplorerReportKey=key;
    const nickname=user.nickname||user.username||"누군가";
    const mode=hard?"하드 모드":"일반 모드";
    const title=`${nickname}께서 수학 탐험대 (${mode})에서 '${charName}'로 ${rawScore}점을 달성하셨습니다. 축하드립니다.`;
    const content=[
      `기록 시각: ${formatExplorerEndedAt(endedAt)}`,
      `도달 라운드: ${stage} 라운드`,
      `최종 점수: ${rawScore}점`,
      `플레이 모드: ${mode}`,
      `사용 캐릭터: ${charName}`
    ].join("\n");
    try{await MiniTalk.Games.Board?.writeAuto?.(title,content,"[게임자동기록]")}catch(error){console.warn("수학탐험대 게시판 자동 기록 실패",error)}
  }

  function onMessage(event){
    if(!frame||event.source!==frame.contentWindow)return;
    const data=event.data;
    if(!data)return;
    if(data==="WG_EXIT_GAME"||data.type==="WG_EXIT_GAME")return closeGame();
    if(data.type==="GAME_SCORE")return sendScore(data.gameName||data.game,data.score);
    if(data.type==="MATH_EXPLORER_RESULT"){
      const rawScore=Math.max(0,Math.floor(Number(data.score)||0));
      const supplied=Math.max(0,Math.floor(Number(data.rankingScore)||0));
      const score=supplied||Math.floor(rawScore*(data.hardMode?1.2:1));
      if(score>0)sendScore("수학탐험대",score);
      reportExplorerBoard(data,rawScore);
      return;
    }
  }

  return{open,close:closeGame,isOpen,current:()=>currentGame};
})();
