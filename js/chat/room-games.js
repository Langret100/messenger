/* Chat room mini games: random ladder + client-only mafia/citizen/police/doctor. Apps Script is not used. */
MiniTalk.Chat.RoomGames=(()=>{
  const D=()=>MiniTalk.UI.Dom;
  const enc=new TextEncoder(),dec=new TextDecoder();
  const state={messages:new Map(),privateBoxes:new Map(),decrypting:new Set(),keyAnnouncements:new Set(),revealedRoles:new Set(),autoResolved:new Set(),leaveHandled:new Set(),phaseTimers:new Map(),desktop:{win:null,roomId:null,root:null,title:null,back:null,activeGameId:null,refreshTimer:0}};
  const currentUser=()=>MiniTalk.Store.get("user")||{};
  const randomToken=()=>{try{if(typeof crypto.randomUUID==="function")return crypto.randomUUID().replace(/-/g,"").slice(0,10)}catch{}try{return Array.from(crypto.getRandomValues(new Uint32Array(2))).map(v=>v.toString(36)).join("").slice(0,10)}catch{return Math.random().toString(36).slice(2,12)}};
  const nowId=prefix=>`${prefix}-${Date.now().toString(36)}-${randomToken()}`;
  const safeJson=value=>JSON.stringify(value).replace(/[<>&]/g,c=>({"<":"\\u003c",">":"\\u003e","&":"\\u0026"}[c]));
  const b64=bytes=>btoa(String.fromCharCode(...new Uint8Array(bytes)));
  const unb64=text=>Uint8Array.from(atob(String(text||"")),c=>c.charCodeAt(0));
  const ROLE_ORDER=["mafia","police","doctor","citizen"];
  const ROLE_ASSET={
    mafia:"assets/chat-games/role-mafia.png?v=2",
    citizen:"assets/chat-games/role-citizen.png?v=2",
    police:"assets/chat-games/role-police.png?v=2",
    doctor:"assets/chat-games/role-doctor.png?v=2"
  };
  const ROLE_LABEL={mafia:"마피아",citizen:"시민",police:"경찰",doctor:"의사"};
  const ROLE_DESC={
    mafia:"정체를 숨기고 밤마다 한 명을 지목해요.",
    citizen:"대화를 통해 마피아를 찾아내고 투표로 막아야 해요.",
    police:"밤마다 한 명을 조사해 마피아인지 확인해요.",
    doctor:"밤마다 한 명을 치료해 탈락을 막을 수 있어요."
  };
  const phaseText=phase=>phase==="night"?"밤":phase==="day"?"낮 · 토론/투표":"게임 종료";
  const MAFIA_TIMING={roleReveal:15000,night:30000,discussion:45000,vote:30000};
  function phaseTiming(phase,{initial=false,now=Date.now()}={}){
    if(phase==="night"){
      const actionStartsAt=initial?now+MAFIA_TIMING.roleReveal:now;
      return{startedAt:now,actionStartsAt,deadline:actionStartsAt+MAFIA_TIMING.night};
    }
    if(phase==="day"){
      const discussionEndsAt=now+MAFIA_TIMING.discussion;
      return{startedAt:now,discussionEndsAt,deadline:discussionEndsAt+MAFIA_TIMING.vote};
    }
    return{startedAt:now,deadline:now};
  }
  function phasePayload(id,phase,round,living,opts={}){return{kind:"mafia-phase",id,phase,round,living:[...living],...phaseTiming(phase,opts)}}
  function formatRemain(ms){return `${Math.max(0,Math.ceil(ms/1000))}초`}
  function phaseWindow(game,now=Date.now()){
    if(game.phase==="night")return now<(game.actionStartsAt||game.startedAt||0)?"role":"night";
    if(game.phase==="day")return now<(game.discussionEndsAt||game.startedAt||0)?"discussion":"vote";
    return"ended";
  }
  const ladderPalette=["#7c3aed","#f97316","#06b6d4","#22c55e","#ef4444","#eab308","#3b82f6","#ec4899","#14b8a6","#8b5cf6","#f59e0b","#10b981"];
  let gameSfxCtx=null;
  function gameSfxContext(){
    try{const Ctx=window.AudioContext||window.webkitAudioContext;if(!Ctx)return null;if(!gameSfxCtx||gameSfxCtx.state==="closed")gameSfxCtx=new Ctx();if(gameSfxCtx.state==="suspended")gameSfxCtx.resume().catch(()=>{});return gameSfxCtx}catch{return null}
  }
  function gameTone(ctx,{at=0,freq=440,to=null,duration=.08,gain=.035,type="sine"}={}){
    try{const start=ctx.currentTime+Math.max(0,at),osc=ctx.createOscillator(),amp=ctx.createGain();osc.type=type;osc.frequency.setValueAtTime(Math.max(40,freq),start);if(to)osc.frequency.exponentialRampToValueAtTime(Math.max(40,to),start+duration);amp.gain.setValueAtTime(.0001,start);amp.gain.exponentialRampToValueAtTime(Math.max(.001,gain),start+.008);amp.gain.exponentialRampToValueAtTime(.0001,start+duration);osc.connect(amp).connect(ctx.destination);osc.start(start);osc.stop(start+duration+.02)}catch{}
  }
  function playGameSfx(name){
    const ctx=gameSfxContext();if(!ctx)return false;
    const tone=(o)=>gameTone(ctx,o);
    if(name==="shuffle"){tone({freq:520,to:720,duration:.045,gain:.023,type:"triangle"});tone({at:.09,freq:610,to:830,duration:.045,gain:.022,type:"triangle"});tone({at:.18,freq:700,to:930,duration:.05,gain:.021,type:"triangle"})}
    else if(name==="flip"){tone({freq:260,to:760,duration:.14,gain:.032,type:"triangle"})}
    else if(name==="reveal"){tone({freq:523,duration:.16,gain:.035,type:"sine"});tone({at:.055,freq:659,duration:.18,gain:.03,type:"sine"});tone({at:.11,freq:784,duration:.2,gain:.028,type:"sine"})}
    else if(name==="trace"){tone({freq:500,to:900,duration:.13,gain:.025,type:"triangle"})}
    else if(name==="action"){tone({freq:430,to:610,duration:.09,gain:.026,type:"sine"})}
    else if(name==="vote"){tone({freq:360,to:300,duration:.11,gain:.028,type:"triangle"})}
    else if(name==="result"){tone({freq:330,to:520,duration:.13,gain:.03,type:"triangle"});tone({at:.08,freq:660,duration:.14,gain:.024,type:"sine"})}
    else if(name==="start"){tone({freq:392,duration:.10,gain:.025});tone({at:.07,freq:523,duration:.12,gain:.025});tone({at:.14,freq:659,duration:.14,gain:.025})}
    return true
  }

  function roleAsset(role){return ROLE_ASSET[role]||ROLE_ASSET.citizen}
  function roleLabel(role){return ROLE_LABEL[role]||"시민"}
  function roleDesc(role){return ROLE_DESC[role]||ROLE_DESC.citizen}

  function gameMessages(gameId){return state.messages.get(gameId)||[]}
  function ingest(message){
    const game=message?.game;if(!game?.id||!game.kind)return;
    const list=state.messages.get(game.id)||[];
    if(!list.some(item=>item.id===message.id)){list.push(message);state.messages.set(game.id,list)}
    if(game.kind==="mafia-role"&&game.target===currentUser().user_id)primeOwnBox(`role:${game.id}:${game.target}`,message,async()=>{
      const data=await decryptOwn(game.cipher);return{kind:"role",value:data}
    });
    if(game.kind==="mafia-police-result"&&game.target===currentUser().user_id)primeOwnBox(`police:${game.id}:${game.target}:${game.round||0}`,message,async()=>{
      const data=await decryptOwn(game.cipher);return{kind:"police-result",value:data}
    });
    if(game.kind==="mafia-leave")setTimeout(()=>maybeHandleLeaveAsHost(message).catch(()=>{}),0);
    if(game.kind==="mafia-phase"&&game.phase!=="ended")scheduleHostPhaseResolution(message);
    if(state.desktop.activeGameId===game.id)queueDesktopRefresh(game.id);
  }
  function membersFor(room){
    if(room?.id==="global")return Object.values(MiniTalk.Store.get("presence")||{}).filter(v=>v?.user_id&&!/^guest-/i.test(v.user_id));
    return Object.values(room?.members||{}).filter(v=>v?.user_id&&!/^guest-/i.test(v.user_id));
  }
  function memberPicker(title,members,{min=2,max=99,extraBuilder=null,onSubmit,mount=null}){
    const U=D(),body=U.el("div",{class:"modal-stack room-game-picker"}),selected=new Set(members.map(m=>String(m.user_id)));
    body.append(U.el("p",{class:"muted modal-note",text:`${title}에 참여할 멤버를 선택하세요.`}));
    const controls=U.el("div",{class:"room-game-picker-controls"}),all=U.el("button",{class:"mini-action",type:"button",text:"전체 선택"}),none=U.el("button",{class:"mini-action",type:"button",text:"선택 해제"}),count=U.el("span",{class:"muted room-game-count"});
    controls.append(all,none,count);body.append(controls);
    const list=U.el("div",{class:"room-member-list room-game-member-list"});
    const update=()=>{count.textContent=`${selected.size}명 선택`;list.querySelectorAll("input[data-game-member]").forEach(input=>input.checked=selected.has(input.dataset.gameMember))};
    members.forEach(member=>{
      const id=String(member.user_id),profile=MiniTalk.Store.get("profiles")?.[id]||{},src=profile.avatar||member.avatar||"",check=U.el("input",{type:"checkbox","data-game-member":id,"aria-label":`${member.nickname||id} 선택`});
      check.checked=true;check.onchange=()=>{check.checked?selected.add(id):selected.delete(id);update()};
      const avatar=src?U.el("img",{class:"room-member-avatar profile-image",src,alt:""}):U.el("span",{class:"room-member-avatar",text:(member.nickname||id||"?").slice(0,1)});
      list.append(U.el("label",{class:"room-member room-game-member-option"},[
        avatar,
        U.el("span",{class:"room-member-copy"},[
          U.el("strong",{text:member.nickname||id}),
          U.el("small",{class:"muted",text:id===currentUser().user_id?"나":"대화방 멤버"})
        ]),
        check
      ]));
    });
    body.append(list);
    all.onclick=()=>{members.forEach(m=>selected.add(String(m.user_id)));update()};
    none.onclick=()=>{selected.clear();update()};
    const extra=extraBuilder?.(body,()=>[...selected])||null;
    const go=U.el("button",{class:"button primary",type:"button",text:"만들기"});
    go.onclick=async()=>{
      if(selected.size<min){MiniTalk.UI.Shell.toast(`최소 ${min}명을 선택하세요.`);return}
      if(selected.size>max){MiniTalk.UI.Shell.toast(`최대 ${max}명까지 선택할 수 있어요.`);return}
      go.disabled=true;
      try{await onSubmit([...selected],extra)}catch(error){MiniTalk.UI.Shell.toast(error.message||"게임을 만들지 못했습니다.");go.disabled=false}
    };
    body.append(go);update();if(mount){mount(title,body);return}MiniTalk.UI.Shell.modal(title,body)
  }

  function rng(seed){let x=(Number(seed)||1)>>>0;return()=>{x^=x<<13;x^=x>>>17;x^=x<<5;return(x>>>0)/4294967296}}
  function ladderData(game){
    const people=game.participants||[],n=people.length,rows=Math.max(8,Math.min(26,n*2+4)),random=rng(game.seed),rungs=[];
    for(let r=0;r<rows;r++){
      const used=new Set();
      for(let c=0;c<n-1;c++){
        if(used.has(c)||used.has(c+1)||random()>.31)continue;
        rungs.push([r,c]);used.add(c);used.add(c+1)
      }
    }
    const pos=[...Array(n).keys()];
    for(const [,c] of rungs){const t=pos[c];pos[c]=pos[c+1];pos[c+1]=t}
    const mapping=Array(n);pos.forEach((start,end)=>mapping[start]=end);return{rows,rungs,mapping}
  }
  function ladderLayout(game){
    const n=Math.max(2,(game.participants||[]).length),data=ladderData(game),width=Math.max(240,n*62),height=214,padX=26,padTop=18,padBottom=24;
    const x=index=>padX+index*(width-padX*2)/Math.max(1,n-1);
    const y=index=>padTop+index*(height-padTop-padBottom)/Math.max(1,data.rows);
    return{...data,width,height,padX,padTop,padBottom,x,y}
  }
  function ladderTrace(game,start){
    const layout=ladderLayout(game),points=[],rungAt=new Map(layout.rungs.map(([r,c])=>[`${r}:${c}`,true]));
    let lane=start;points.push([layout.x(lane),layout.padTop]);
    for(let row=0;row<layout.rows;row++){
      const y=layout.y(row);points.push([layout.x(lane),y]);
      if(rungAt.get(`${row}:${lane}`)){lane+=1;points.push([layout.x(lane),y])}
      else if(rungAt.get(`${row}:${lane-1}`)){lane-=1;points.push([layout.x(lane),y])}
    }
    points.push([layout.x(lane),layout.height-layout.padBottom]);
    return{layout,points,endIndex:layout.mapping[start]}
  }
  function tracePath(points){return points.map((point,index)=>`${index?"L":"M"}${point[0].toFixed(2)},${point[1].toFixed(2)}`).join(" ")}
  function animateSvgPath(path){try{const length=path.getTotalLength();path.style.strokeDasharray=String(length);path.style.strokeDashoffset=String(length);requestAnimationFrame(()=>{path.style.strokeDashoffset="0"})}catch{}}
  function playerChip(U,person,index,onClick){const chip=U.el("button",{class:"ladder-player-chip",type:"button","data-player-index":String(index)}),avatar=U.el("span",{class:"ladder-player-dot",text:(person.nickname||person.user_id||"?").slice(0,1)}),name=U.el("span",{text:person.nickname});chip.append(avatar,name);chip.onclick=onClick;return chip}
  function ladderCard(game){
    const U=D(),layout=ladderLayout(game),card=U.el("section",{class:"room-game-card ladder-game-card"});
    card.append(U.el("div",{class:"room-game-head"},[
      U.el("div",{class:"room-game-head-copy"},[U.el("strong",{text:"🪜 사다리타기"}),U.el("small",{text:"모바일 카드형 디자인 · 선택한 멤버 경로 추적"})]),
      U.el("span",{class:"room-game-badge",text:"RANDOM"})
    ]));
    card.append(U.el("div",{class:"room-game-pills"},[
      U.el("span",{class:"room-game-pill",text:`참가 ${game.participants.length}명`}),
      U.el("span",{class:"room-game-pill",text:"매번 새 무작위 생성"})
    ]));
    const top=U.el("div",{class:"ladder-top-row"});
    game.participants.forEach((person,index)=>top.append(playerChip(U,person,index,()=>selectTrace(index))));
    card.append(top);
    const stage=U.el("div",{class:"ladder-stage"});
    const svg=document.createElementNS("http://www.w3.org/2000/svg","svg");
    svg.setAttribute("viewBox",`0 0 ${layout.width} ${layout.height}`);svg.setAttribute("preserveAspectRatio","none");svg.classList.add("ladder-svg");
    const bg=document.createElementNS(svg.namespaceURI,"rect");bg.setAttribute("x","8");bg.setAttribute("y","8");bg.setAttribute("width",String(layout.width-16));bg.setAttribute("height",String(layout.height-16));bg.setAttribute("rx","18");bg.classList.add("ladder-panel-bg");svg.append(bg);
    for(let i=0;i<game.participants.length;i++){const line=document.createElementNS(svg.namespaceURI,"line");line.setAttribute("x1",layout.x(i));line.setAttribute("x2",layout.x(i));line.setAttribute("y1",layout.padTop);line.setAttribute("y2",layout.height-layout.padBottom);line.classList.add("ladder-rail");svg.append(line)}
    layout.rungs.forEach(([r,c])=>{const line=document.createElementNS(svg.namespaceURI,"line"),y=layout.y(r);line.setAttribute("x1",layout.x(c));line.setAttribute("x2",layout.x(c+1));line.setAttribute("y1",y);line.setAttribute("y2",y);line.classList.add("ladder-rung");svg.append(line)});
    const traceLayer=document.createElementNS(svg.namespaceURI,"g");traceLayer.classList.add("ladder-traces");svg.append(traceLayer);stage.append(svg);card.append(stage);
    const bottom=U.el("div",{class:"ladder-result-slots"});
    (game.results||[]).forEach((value,index)=>bottom.append(U.el("div",{class:"ladder-result-slot","data-result-index":String(index)},[U.el("small",{text:`결과 ${index+1}`}),U.el("strong",{text:value||`${index+1}번`})])));
    card.append(bottom);
    const focus=U.el("div",{class:"ladder-focus-box hidden"}),focusLine=U.el("div",{class:"ladder-focus-copy"},[U.el("small",{text:"선택 결과"}),U.el("strong",{text:"위에서 이름을 누르면 경로가 그려져요."})]);
    focus.append(focusLine);card.append(focus);
    const revealAll=U.el("button",{class:"button secondary compact-button",type:"button",text:"전체 결과 보기"}),resultList=U.el("div",{class:"ladder-results hidden"});
    layout.mapping.forEach((end,start)=>resultList.append(U.el("div",{class:"ladder-result-row"},[U.el("b",{text:game.participants[start].nickname}),U.el("span",{text:"→"}),U.el("strong",{text:(game.results||[])[end]||`${end+1}번`})])));
    revealAll.onclick=()=>{resultList.classList.toggle("hidden");revealAll.textContent=resultList.classList.contains("hidden")?"전체 결과 보기":"전체 결과 숨기기"};
    card.append(U.el("div",{class:"room-game-actions"},[revealAll]),resultList);
    function selectTrace(index){
      const picked=game.participants[index],trace=ladderTrace(game,index),color=ladderPalette[index%ladderPalette.length];playGameSfx("trace");
      top.querySelectorAll(".ladder-player-chip").forEach((node,i)=>node.classList.toggle("active",i===index));
      bottom.querySelectorAll(".ladder-result-slot").forEach((node,i)=>node.classList.toggle("active",i===trace.endIndex));
      traceLayer.replaceChildren();
      const path=document.createElementNS(svg.namespaceURI,"path");path.setAttribute("d",tracePath(trace.points));path.classList.add("ladder-trace-path");path.style.setProperty("--trace-color",color);traceLayer.append(path);
      const endPoint=trace.points[trace.points.length-1],marker=document.createElementNS(svg.namespaceURI,"circle");marker.setAttribute("cx",endPoint[0]);marker.setAttribute("cy",endPoint[1]);marker.setAttribute("r","6.5");marker.classList.add("ladder-trace-marker");marker.style.setProperty("--trace-color",color);traceLayer.append(marker);
      animateSvgPath(path);focus.classList.remove("hidden");focusLine.replaceChildren(U.el("small",{text:"선택 결과"}),U.el("strong",{text:`${picked.nickname} → ${(game.results||[])[trace.endIndex]||`${trace.endIndex+1}번`}`}))
    }
    return card
  }
  async function createLadder(roomId,room,mount=null){
    const members=membersFor(room);if(members.length<2)throw new Error("사다리타기는 멤버가 2명 이상 필요해요.");
    memberPicker("사다리타기",members,{min:2,max:12,mount,extraBuilder:(body)=>{const U=D(),field=U.el("label",{class:"field room-game-results-field"},[U.el("span",{text:"결과 항목 (선택)"}),U.el("input",{placeholder:"예: 청소, 발표, 간식, 면제","aria-label":"사다리 결과 항목"}),U.el("small",{class:"muted",text:"쉼표로 구분. 비워두면 1번, 2번…으로 표시됩니다."})]);body.append(field);return{field}},onSubmit:async(ids,extra)=>{
      const chosen=members.filter(m=>ids.includes(String(m.user_id))).map(m=>({user_id:String(m.user_id),nickname:String(m.nickname||m.user_id)}));
      const raw=extra.field.querySelector("input").value.trim(),results=raw?raw.split(",").map(v=>v.trim()).filter(Boolean):chosen.map((_,i)=>`${i+1}번`);
      if(results.length!==chosen.length)throw new Error(`결과 항목도 ${chosen.length}개로 맞춰주세요.`);
      const game={kind:"ladder",id:nowId("ladder"),seed:crypto.getRandomValues(new Uint32Array(1))[0],participants:chosen,results},message={roomId,user_id:currentUser().user_id,nickname:currentUser().nickname||"",type:"game",text:"[사다리타기]",game};
      await MiniTalk.Realtime.sendMessage(roomId,{type:"game",text:message.text,game});
      if(mount)showDesktopMessage(message);else MiniTalk.UI.Shell.closeModal()
    }})
  }

  const keyName=userId=>`chat.roomGames.rsa.${userId}`;
  async function ensureRsa(){
    const id=currentUser().user_id;if(!id)throw new Error("로그인이 필요합니다.");
    let saved=null;try{saved=JSON.parse(localStorage.getItem(keyName(id))||"null")}catch{}
    if(saved?.publicKey&&saved?.privateKey)return saved;
    const kp=await crypto.subtle.generateKey({name:"RSA-OAEP",modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:"SHA-256"},true,["encrypt","decrypt"]),publicKey=await crypto.subtle.exportKey("jwk",kp.publicKey),privateKey=await crypto.subtle.exportKey("jwk",kp.privateKey),out={publicKey,privateKey};
    localStorage.setItem(keyName(id),JSON.stringify(out));return out
  }
  async function importPublic(jwk){return crypto.subtle.importKey("jwk",jwk,{name:"RSA-OAEP",hash:"SHA-256"},false,["encrypt"])}
  async function importPrivate(jwk){return crypto.subtle.importKey("jwk",jwk,{name:"RSA-OAEP",hash:"SHA-256"},false,["decrypt"])}
  async function encryptFor(jwk,value){const key=await importPublic(jwk),data=enc.encode(safeJson(value)),buf=await crypto.subtle.encrypt({name:"RSA-OAEP"},key,data);return b64(buf)}
  async function decryptOwn(cipher){const saved=await ensureRsa(),key=await importPrivate(saved.privateKey),buf=await crypto.subtle.decrypt({name:"RSA-OAEP"},key,unb64(cipher));return JSON.parse(dec.decode(buf))}
  async function primeOwnBox(boxKey,message,loader){
    if(state.privateBoxes.has(boxKey)||state.decrypting.has(boxKey))return;
    state.decrypting.add(boxKey);
    try{
      const loaded=await loader();state.privateBoxes.set(boxKey,loaded);refreshPrivateBindings(boxKey,loaded)
    }catch{}
    finally{state.decrypting.delete(boxKey)}
  }
  function gameDocuments(){const docs=[document];try{if(state.desktop.win&&!state.desktop.win.closed&&state.desktop.win.document)docs.push(state.desktop.win.document)}catch{}return docs}
  function refreshPrivateBindings(boxKey,loaded){
    gameDocuments().forEach(doc=>{
      doc.querySelectorAll(`[data-mafia-role-panel="${CSS.escape(boxKey)}"]`).forEach(panel=>mountRolePanel(panel,loaded?.value?.role||loaded?.value||null));
      doc.querySelectorAll(`[data-police-result-box="${CSS.escape(boxKey)}"]`).forEach(node=>mountPoliceResult(node,loaded?.value||null))
    })
  }
  function latest(gameId,kind,filter=()=>true){return [...gameMessages(gameId)].reverse().find(m=>m.game?.kind===kind&&filter(m))||null}
  function allOf(gameId,kind){return gameMessages(gameId).filter(m=>m.game?.kind===kind)}
  function scheduleHostPhaseResolution(message){
    const g=message?.game,roomId=message?.roomId;if(!g?.id||!g.deadline||!roomId)return;
    const lobby=latest(g.id,"mafia-lobby");if(!lobby||lobby.game.hostId!==currentUser().user_id)return;
    const key=`${g.id}:${g.phase}:${g.round||1}:${g.deadline}`;if(state.phaseTimers.has(key))return;
    const timer=setTimeout(async()=>{state.phaseTimers.delete(key);if(state.autoResolved.has(key))return;const newest=latestPhase(g.id);if(!newest||newest.id!==message.id&&Number(newest.game.deadline||0)!==Number(g.deadline||0))return;state.autoResolved.add(key);try{if(g.phase==="night")await resolveNight(roomId,lobby.game,message,{allowTimeout:true});else if(g.phase==="day")await resolveVote(roomId,lobby.game,message,{allowTimeout:true});playGameSfx("result")}catch{state.autoResolved.delete(key)}},Math.max(0,Number(g.deadline)-Date.now()+120));
    state.phaseTimers.set(key,timer)
  }
  function leftIds(gameId){return new Set(allOf(gameId,"mafia-player-left").map(m=>m.game.userId).filter(Boolean))}
  function activeParticipants(lobby){const left=leftIds(lobby.id);return (lobby.participants||[]).filter(p=>!left.has(p.user_id))}
  function winnerFor(host){
    if(!host?.roles||!Array.isArray(host.living))return null;
    const mafia=host.living.filter(id=>host.roles[id]==="mafia").length,citizenSide=host.living.length-mafia;
    if(mafia===0)return"citizen";
    if(mafia>=citizenSide)return"mafia";
    return null
  }
  function latestPhase(gameId){return latest(gameId,"mafia-phase")}
  async function sendEnded(roomId,lobby,host,{round=1,reason="rule",leftUserId=null}={}){
    const winner=winnerFor(host);
    if(!winner)return false;
    await MiniTalk.Realtime.sendMessage(roomId,{type:"game",text:"[마피아 게임 종료]",game:{kind:"mafia-phase",id:lobby.id,phase:"ended",round,living:[...host.living],winner,reason,leftUserId,startedAt:Date.now(),deadline:Date.now()}});
    return true
  }
  async function maybeHandleLeaveAsHost(message){
    const g=message?.game,gameId=g?.id,userId=g?.userId,roomId=message?.roomId;if(!gameId||!userId||!roomId)return;
    const lobby=latest(gameId,"mafia-lobby");if(!lobby||lobby.game.hostId!==currentUser().user_id)return;
    const marker=`${gameId}:${userId}`;if(state.leaveHandled.has(marker))return;state.leaveHandled.add(marker);
    const host=await hostPrivate(gameId),person=lobby.game.participants.find(p=>p.user_id===userId);
    if(!host?.roles){
      await MiniTalk.Realtime.sendMessage(roomId,{type:"game",text:"[게임 나가기]",game:{kind:"mafia-player-left",id:gameId,userId,nickname:person?.nickname||userId,round:0}});return
    }
    if(!host.living.includes(userId)){return}
    const role=host.roles[userId]||"citizen";host.living=host.living.filter(id=>id!==userId);localStorage.setItem(mafiaHostKey(gameId),JSON.stringify(host));
    await MiniTalk.Realtime.sendMessage(roomId,{type:"game",text:"[게임 나가기]",game:{kind:"mafia-player-left",id:gameId,userId,nickname:person?.nickname||userId,role,round:latestPhase(gameId)?.game?.round||1}});
    if(await sendEnded(roomId,lobby.game,host,{round:latestPhase(gameId)?.game?.round||1,reason:"leave",leftUserId:userId}))return;
    const phase=latestPhase(gameId);if(!phase||phase.game.phase==="ended")return;
    if(userId===lobby.game.hostId){
      await MiniTalk.Realtime.sendMessage(roomId,{type:"game",text:"[마피아 게임 종료]",game:{kind:"mafia-phase",id:gameId,phase:"ended",round:phase.game.round||1,living:[...host.living],winner:"none",reason:"host-left",leftUserId:userId,startedAt:Date.now(),deadline:Date.now()}});return
    }
    const carry={startedAt:phase.game.startedAt,deadline:phase.game.deadline,actionStartsAt:phase.game.actionStartsAt,discussionEndsAt:phase.game.discussionEndsAt};
    await MiniTalk.Realtime.sendMessage(roomId,{type:"game",text:"[마피아 인원 변경]",game:{kind:"mafia-phase",id:gameId,phase:phase.game.phase,round:phase.game.round||1,living:[...host.living],...carry}})
  }
  async function leaveMafia(roomId,lobby){
    const me=currentUser().user_id;if(!me||!lobby?.participants?.some(p=>p.user_id===me))return;
    if(leftIds(lobby.id).has(me))return;
    if(typeof window!=="undefined"&&window.confirm&&!window.confirm("이 마피아 게임에서 나갈까요? 채팅방에는 그대로 남습니다."))return;
    await MiniTalk.Realtime.sendMessage(roomId,{type:"game",text:"[게임 나가기 요청]",game:{kind:"mafia-leave",id:lobby.id,userId:me}});
    if(lobby.hostId===me){const msg={roomId,user_id:me,game:{kind:"mafia-leave",id:lobby.id,userId:me}};await maybeHandleLeaveAsHost(msg)}
  }
  function mafiaHostKey(gameId){return`chat.roomGames.mafiaHost.${gameId}`}
  function roleCounts(count){
    const n=Math.max(4,Math.min(12,Number(count)||4));
    if(n<8)return{mafia:1,police:0,doctor:0,citizen:n-1};
    if(n<12)return{mafia:2,police:1,doctor:0,citizen:n-3};
    return{mafia:2,police:1,doctor:1,citizen:n-4}
  }
  function roleSummary(counts){return ROLE_ORDER.filter(role=>counts[role]>0).map(role=>`${roleLabel(role)} ${counts[role]}`).join(" · ")}
  async function createMafia(roomId,room,mount=null){
    const members=membersFor(room);if(members.length<4)throw new Error("마피아는 최소 4명이 필요해요.");
    memberPicker("마피아 게임",members,{min:4,max:12,mount,onSubmit:async ids=>{
      const chosen=members.filter(m=>ids.includes(String(m.user_id))).map(m=>({user_id:String(m.user_id),nickname:String(m.nickname||m.user_id)})),host=await crypto.subtle.generateKey({name:"RSA-OAEP",modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:"SHA-256"},true,["encrypt","decrypt"]),hostPublic=await crypto.subtle.exportKey("jwk",host.publicKey),hostPrivate=await crypto.subtle.exportKey("jwk",host.privateKey),id=nowId("mafia");
      localStorage.setItem(mafiaHostKey(id),JSON.stringify({privateKey:hostPrivate,roles:null,living:chosen.map(p=>p.user_id),round:1}));
      const game={kind:"mafia-lobby",id,hostId:currentUser().user_id,hostPublic,participants:chosen},message={roomId,user_id:currentUser().user_id,nickname:currentUser().nickname||"",type:"game",text:"[마피아 모집]",game};
      await MiniTalk.Realtime.sendMessage(roomId,{type:"game",text:message.text,game});
      if(mount)showDesktopMessage(message);else MiniTalk.UI.Shell.closeModal()
    }})
  }
  async function announceMafiaKey(roomId,game){
    if(!game.participants?.some(p=>p.user_id===currentUser().user_id))return;
    const marker=`${game.id}:${currentUser().user_id}`;
    if(state.keyAnnouncements.has(marker))return;
    const already=latest(game.id,"mafia-key",m=>m.game.userId===currentUser().user_id);
    if(already){state.keyAnnouncements.add(marker);return}
    state.keyAnnouncements.add(marker);
    try{const keys=await ensureRsa();await MiniTalk.Realtime.sendMessage(roomId,{type:"game",text:"[마피아 준비]",game:{kind:"mafia-key",id:game.id,userId:currentUser().user_id,publicKey:keys.publicKey}})}catch(error){state.keyAnnouncements.delete(marker);throw error}
  }
  function buildRolesForParticipants(participants){
    const counts=roleCounts(participants.length),shuffle=[...participants];
    for(let i=shuffle.length-1;i>0;i--){const j=crypto.getRandomValues(new Uint32Array(1))[0]%(i+1);[shuffle[i],shuffle[j]]=[shuffle[j],shuffle[i]]}
    const roles={},order=[];Object.entries(counts).forEach(([role,count])=>{for(let i=0;i<count;i++)order.push(role)});shuffle.forEach((p,i)=>roles[p.user_id]=order[i]||"citizen");return roles
  }
  async function assignRoles(roomId,game){
    if(currentUser().user_id!==game.hostId)throw new Error("게임 생성자만 시작할 수 있어요.");
    const people=activeParticipants(game);if(people.length<4)throw new Error("남은 참가자가 4명 미만이라 시작할 수 없어요.");
    const keyMsgs=allOf(game.id,"mafia-key"),keys=new Map(keyMsgs.map(m=>[m.game.userId,m.game.publicKey]));
    if(people.some(p=>!keys.has(p.user_id)))throw new Error("아직 준비되지 않은 참가자가 있어요.");
    const roles=buildRolesForParticipants(people),host=JSON.parse(localStorage.getItem(mafiaHostKey(game.id))||"{}");
    host.roles=roles;host.living=people.map(p=>p.user_id);localStorage.setItem(mafiaHostKey(game.id),JSON.stringify(host));
    for(const person of people){
      const cipher=await encryptFor(keys.get(person.user_id),{role:roles[person.user_id],counts:roleCounts(people.length)});
      await MiniTalk.Realtime.sendMessage(roomId,{type:"game",text:"[역할 배정]",game:{kind:"mafia-role",id:game.id,target:person.user_id,cipher}})
    }
    await MiniTalk.Realtime.sendMessage(roomId,{type:"game",text:"[마피아 게임 시작]",game:phasePayload(game.id,"night",1,host.living,{initial:true})})
  }
  function participantBadge(U,person,{alive=true,ready=false}={}){return U.el("span",{class:`mafia-participant-chip ${alive?"alive":"dead"} ${ready?"ready":""}`.trim()},[U.el("span",{class:"mafia-participant-dot",text:alive?"●":"×"}),U.el("span",{text:person.nickname})])}
  function mountRolePanel(panel,role){
    const U=D(),boxKey=panel.dataset.mafiaRolePanel||"",revealed=state.revealedRoles.has(boxKey);
    if(!role){
      panel.className="mafia-my-role unknown";
      panel.replaceChildren(U.el("div",{class:"mafia-role-draw waiting"},[U.el("div",{class:"mafia-card-back",text:"?"}),U.el("div",{class:"mafia-role-draw-copy"},[U.el("strong",{text:"역할 준비 중…"}),U.el("small",{text:"암호화된 역할 정보를 받고 있어요."})])]))
      return
    }
    if(!revealed){
      panel.className="mafia-my-role draw-ready";
      const draw=U.el("div",{class:"mafia-role-draw"}),deck=U.el("div",{class:"mafia-card-deck"},[
        U.el("span",{class:"mafia-card-back back-3",text:"?"}),U.el("span",{class:"mafia-card-back back-2",text:"?"}),U.el("span",{class:"mafia-card-back back-1",text:"?"})
      ]),copy=U.el("div",{class:"mafia-role-draw-copy"},[U.el("strong",{text:"내 역할 뽑기"}),U.el("small",{text:"카드를 눌러 이번 게임의 역할을 확인하세요."})]),button=U.el("button",{class:"button primary compact-button mafia-role-draw-button",type:"button",text:"역할 뽑기"});
      button.onclick=()=>{
        if(button.disabled)return;button.disabled=true;playGameSfx("shuffle");draw.classList.add("drawing");button.textContent="카드 섞는 중…";
        setTimeout(()=>{playGameSfx("flip");draw.classList.add("flipping");button.textContent="역할 확인!"},650);
        setTimeout(()=>{playGameSfx("reveal");state.revealedRoles.add(boxKey);panel.classList.add("role-reveal-pop");mountRolePanel(panel,role)},1200)
      };
      draw.append(deck,copy,button);panel.replaceChildren(draw);return
    }
    panel.className=`mafia-my-role ${role} revealed`;
    panel.replaceChildren(U.el("img",{class:"mafia-role-portrait",src:roleAsset(role),alt:`${roleLabel(role)} 캐릭터`,loading:"lazy"}),U.el("div",{class:"mafia-role-copy"},[U.el("span",{text:"내 역할"}),U.el("strong",{"data-mafia-role-key":boxKey,text:roleLabel(role)}),U.el("small",{text:roleDesc(role)})]))
  }
  function mountPoliceResult(node,data){
    const U=D();
    if(!data){node.replaceChildren(U.el("small",{text:"경찰 조사 결과를 확인 중입니다…"}));return}
    node.className=`mafia-event-text police-result ${data.isMafia?"mafia":"citizen"}`;
    node.replaceChildren(U.el("strong",{text:`조사 결과 · ${data.nickname}`}),U.el("div",{text:data.isMafia?"이 사람은 마피아입니다.":"이 사람은 마피아가 아닙니다."}))
  }
  function mafiaRolePreview(U,count){
    const counts=roleCounts(count),wrap=U.el("div",{class:"mafia-role-preview"});
    ROLE_ORDER.filter(role=>counts[role]>0).forEach(role=>wrap.append(U.el("div",{class:`mafia-role-preview-card ${role}`},[U.el("img",{src:roleAsset(role),alt:`${roleLabel(role)} 역할 캐릭터`,loading:"lazy"}),U.el("strong",{text:`${roleLabel(role)} ×${counts[role]}`}),U.el("small",{text:roleDesc(role)})])));
    return wrap
  }
  function mafiaLobbyCard(roomId,game){
    const U=D(),card=U.el("section",{class:"room-game-card mafia-game-card"}),keys=new Set(allOf(game.id,"mafia-key").map(m=>m.game.userId)),people=activeParticipants(game),selected=people.some(p=>p.user_id===currentUser().user_id),counts=roleCounts(people.length),left=leftIds(game.id);
    card.append(U.el("div",{class:"room-game-head"},[U.el("div",{class:"room-game-head-copy"},[U.el("strong",{text:"🕵️ 마피아 게임"}),U.el("small",{text:"노와르 카드형 디자인 · 역할 이미지는 각자만 확인"})]),U.el("span",{class:"room-game-badge mafia",text:"SECRET"})]));
    card.append(U.el("div",{class:"room-game-pills"},[U.el("span",{class:"room-game-pill",text:`참가 ${people.length}명`}),U.el("span",{class:"room-game-pill",text:`준비 ${people.filter(p=>keys.has(p.user_id)).length}/${people.length}`}),U.el("span",{class:"room-game-pill",text:people.length>=4?roleSummary(counts):"최소 4명 필요"})]));
    const names=U.el("div",{class:"mafia-participants"});game.participants.forEach(p=>names.append(participantBadge(U,p,{alive:!left.has(p.user_id),ready:keys.has(p.user_id)&&!left.has(p.user_id)})));card.append(names);if(people.length>=4)card.append(mafiaRolePreview(U,people.length));
    if(selected&&!keys.has(currentUser().user_id)){const ready=U.el("button",{class:"button secondary compact-button",type:"button",text:"참가 준비"});ready.onclick=async()=>{ready.disabled=true;try{await announceMafiaKey(roomId,game)}catch(e){MiniTalk.UI.Shell.toast(e.message);ready.disabled=false}};card.append(U.el("p",{class:"mafia-event-text",text:"참가자는 준비를 눌러 개인 역할을 받을 암호키를 등록해야 해요."}),ready)}
    if(selected&&!latest(game.id,"mafia-phase")){const leave=U.el("button",{class:"button danger compact-button mafia-leave-button",type:"button",text:"게임 나가기"});leave.onclick=async()=>{leave.disabled=true;try{await leaveMafia(roomId,game);playGameSfx("vote")}catch(e){MiniTalk.UI.Shell.toast(e.message);leave.disabled=false}};card.append(leave)}
    if(currentUser().user_id===game.hostId&&!latest(game.id,"mafia-phase")){const readyCount=people.filter(p=>keys.has(p.user_id)).length,start=U.el("button",{class:"button primary compact-button",type:"button",text:people.length>=4&&readyCount===people.length?"역할 배정하고 시작":"참가자 준비 대기 중"});start.disabled=people.length<4||readyCount!==people.length;start.onclick=async()=>{start.disabled=true;playGameSfx("start");try{await assignRoles(roomId,game)}catch(e){MiniTalk.UI.Shell.toast(e.message);start.disabled=false}};card.append(start)}
    return card
  }
  function roundEvents(U,gameId){
    const wrap=U.el("div",{class:"mafia-event-list"}),latestTie=latest(gameId,"mafia-tie"),latestDeath=latest(gameId,"mafia-death"),latestVote=latest(gameId,"mafia-eliminate"),latestLeft=latest(gameId,"mafia-player-left");
    if(latestDeath)wrap.append(U.el("p",{class:"mafia-event-text",text:latestDeath.game.noKill?"시간 초과 또는 선택 불일치로 지난 밤에는 아무도 탈락하지 않았습니다.":latestDeath.game.saved?"의사가 지켜서 지난 밤에는 아무도 죽지 않았습니다.":`${latestDeath.game.nickname} 님이 밤에 탈락했습니다.`}));
    if(latestVote)wrap.append(U.el("p",{class:"mafia-event-text",text:`투표로 ${latestVote.game.nickname} 님이 탈락했습니다.`}));
    if(latestTie)wrap.append(U.el("p",{class:"mafia-event-text",text:"지난 투표는 동률이라 무효가 됐습니다."}));
    if(latestLeft)wrap.append(U.el("p",{class:"mafia-event-text",text:`${latestLeft.game.nickname||"참가자"} 님이 게임에서 나갔습니다.`}));
    return wrap.childNodes.length?wrap:null
  }
  function latestPoliceResultBox(gameId,userId){
    const msgs=allOf(gameId,"mafia-police-result").filter(m=>m.game.target===userId).sort((a,b)=>(a.game.round||0)-(b.game.round||0));
    const msg=msgs[msgs.length-1];if(!msg)return null;return{boxKey:`police:${gameId}:${userId}:${msg.game.round||0}`,message:msg}
  }
  function mafiaTimerCard(U,roomId,lobby,phaseMsg,card,rolePanel,roleValue){
    const g=phaseMsg.game,wrap=U.el("div",{class:"mafia-timer"}),label=U.el("strong",{text:""}),bar=U.el("span",{class:"mafia-timer-bar"}),fill=U.el("i");bar.append(fill);wrap.append(label,bar);card.append(wrap);
    const me=currentUser().user_id,key=`${g.id}:${g.phase}:${g.round||1}:${g.deadline||0}`;let mounted=false;
    const update=()=>{
      if(!wrap.isConnected){if(mounted)clearInterval(timer);return}mounted=true;
      const now=Date.now(),windowName=phaseWindow(g,now),end=windowName==="role"?g.actionStartsAt:windowName==="discussion"?g.discussionEndsAt:g.deadline,total=windowName==="role"?MAFIA_TIMING.roleReveal:windowName==="night"?MAFIA_TIMING.night:windowName==="discussion"?MAFIA_TIMING.discussion:MAFIA_TIMING.vote,remain=Math.max(0,(end||now)-now);
      label.textContent=windowName==="role"?`역할 확인 ${formatRemain(remain)}`:windowName==="night"?`밤 행동 ${formatRemain(remain)}`:windowName==="discussion"?`토론 ${formatRemain(remain)}`:windowName==="vote"?`투표 ${formatRemain(remain)}`:"종료";
      fill.style.width=`${Math.max(0,Math.min(100,total?remain/total*100:0))}%`;
      card.querySelectorAll('[data-phase-gate="night"]').forEach(node=>node.disabled=windowName!=="night");
      card.querySelectorAll('[data-phase-gate="vote"]').forEach(node=>node.disabled=windowName!=="vote");
      if(windowName!=="role"&&rolePanel&&roleValue&&!state.revealedRoles.has(rolePanel.dataset.mafiaRolePanel)){state.revealedRoles.add(rolePanel.dataset.mafiaRolePanel);mountRolePanel(rolePanel,roleValue);playGameSfx("reveal")}
      if(remain<=0&&g.phase!=="ended"&&lobby.hostId===me&&!state.autoResolved.has(key)){
        state.autoResolved.add(key);
        const action=g.phase==="night"?resolveNight(roomId,lobby,phaseMsg,{allowTimeout:true}):resolveVote(roomId,lobby,phaseMsg,{allowTimeout:true});
        action.then(()=>playGameSfx("result")).catch(()=>state.autoResolved.delete(key))
      }
    };
    const timer=setInterval(update,400);setTimeout(update,0);return wrap
  }
  function mafiaPhaseCard(roomId,phaseMsg){
    const gameId=phaseMsg.game.id,lobby=latest(gameId,"mafia-lobby"),phase=phaseMsg.game.phase,living=phaseMsg.game.living||lobby?.game.participants.map(p=>p.user_id)||[],U=D(),card=U.el("section",{class:"room-game-card mafia-game-card"});
    if(!lobby)return card;
    card.append(U.el("div",{class:"room-game-head"},[U.el("div",{class:"room-game-head-copy"},[U.el("strong",{text:`🕵️ 마피아 ${phaseMsg.game.round||1}라운드`}),U.el("small",{text:phaseText(phase)})]),U.el("span",{class:`room-game-badge mafia ${phase}`,text:phase==="ended"?"END":phase.toUpperCase()})]));
    card.append(U.el("div",{class:"room-game-pills"},[U.el("span",{class:"room-game-pill",text:`생존 ${living.length}명`}),U.el("span",{class:"room-game-pill",text:phase==="ended"?(phaseMsg.game.winner==="mafia"?"마피아 승리":"시민 승리"):phase==="night"?"역할별 밤 행동 진행" :"모두 투표하세요"})]));
    const board=U.el("div",{class:"mafia-living-board"});lobby.game.participants.forEach(person=>board.append(participantBadge(U,person,{alive:living.includes(person.user_id)})));card.append(board);
    const me=currentUser().user_id,roleBoxKey=`role:${gameId}:${me}`,roleData=state.privateBoxes.get(roleBoxKey)?.value,roleValue=roleData?.role||roleData,roleRevealed=state.revealedRoles.has(roleBoxKey),hasLeft=leftIds(gameId).has(me);
    let rolePanel=null;if(lobby.game.participants.some(p=>p.user_id===me)){rolePanel=U.el("div",{class:`mafia-my-role ${roleValue||"unknown"}`,"data-mafia-role-panel":roleBoxKey});mountRolePanel(rolePanel,roleValue);card.append(rolePanel)}
    if(phase!=="ended")mafiaTimerCard(U,roomId,lobby.game,phaseMsg,card,rolePanel,roleValue);
    const events=roundEvents(U,gameId);if(events)card.append(events);
    if(roleRevealed&&roleValue==="police"){const latestBox=latestPoliceResultBox(gameId,me);if(latestBox){const resultNode=U.el("div",{class:"mafia-event-text police-result","data-police-result-box":latestBox.boxKey});mountPoliceResult(resultNode,state.privateBoxes.get(latestBox.boxKey)?.value||null);card.append(resultNode)}}
    if(phase==="ended"){
      const winner=phaseMsg.game.winner||"citizen",participant=lobby.game.participants.some(p=>p.user_id===me),personalWin=participant&&winner!=="none"?((winner==="mafia")=== (roleValue==="mafia")):null,reason=phaseMsg.game.reason;
      const title=winner==="none"?"게임 종료":personalWin===true?"승리!":personalWin===false?"패배":"게임 종료";
      const detail=winner==="none"?(reason==="host-left"?"게임 진행자가 나가서 게임을 종료했어요.":"게임이 종료됐어요."):winner==="mafia"?"마피아 수가 시민 진영 수 이상이 되었어요.":"모든 마피아가 탈락했어요.";
      card.append(U.el("div",{class:`mafia-winner-banner ${winner} ${personalWin===true?"personal-win":personalWin===false?"personal-lose":""}`},[U.el("img",{src:roleAsset(winner==="mafia"?"mafia":"citizen"),alt:"게임 결과 캐릭터",loading:"lazy"}),U.el("div",{},[U.el("strong",{text:title}),U.el("small",{text:`${winner==="mafia"?"마피아 팀 승리":winner==="citizen"?"시민 팀 승리":"무승부/중단"} · ${detail}`})])]))
      return card
    }
    if(phase==="night"&&living.includes(me)&&roleRevealed){
      if(roleValue==="mafia"&&!latest(gameId,"mafia-night-action",m=>m.user_id===me&&m.game.round===phaseMsg.game.round)){
        const targets=lobby.game.participants.filter(p=>living.includes(p.user_id)&&p.user_id!==me),sel=U.el("select",{class:"room-game-select"});targets.forEach(p=>sel.append(U.el("option",{value:p.user_id,text:p.nickname})));
        const kill=U.el("button",{class:"button danger compact-button",type:"button",text:"밤의 대상 선택","data-phase-gate":"night"});kill.disabled=phaseWindow(phaseMsg.game)!=="night";kill.onclick=async()=>{kill.disabled=true;try{const cipher=await encryptFor(lobby.game.hostPublic,{target:sel.value,round:phaseMsg.game.round});await MiniTalk.Realtime.sendMessage(roomId,{type:"game",text:"[밤 행동 완료]",game:{kind:"mafia-night-action",id:gameId,round:phaseMsg.game.round,cipher}});playGameSfx("action")}catch(e){MiniTalk.UI.Shell.toast(e.message);kill.disabled=false}};
        card.append(U.el("div",{class:"mafia-action-panel"},[U.el("small",{text:"마피아만 보이는 비밀 행동"}),sel,kill]))
      }
      if(roleValue==="doctor"&&!latest(gameId,"mafia-doctor-action",m=>m.user_id===me&&m.game.round===phaseMsg.game.round)){
        const targets=lobby.game.participants.filter(p=>living.includes(p.user_id)),sel=U.el("select",{class:"room-game-select"});targets.forEach(p=>sel.append(U.el("option",{value:p.user_id,text:p.nickname})));
        const save=U.el("button",{class:"button primary compact-button",type:"button",text:"치료 대상 선택","data-phase-gate":"night"});save.disabled=phaseWindow(phaseMsg.game)!=="night";save.onclick=async()=>{save.disabled=true;try{const cipher=await encryptFor(lobby.game.hostPublic,{target:sel.value,round:phaseMsg.game.round});await MiniTalk.Realtime.sendMessage(roomId,{type:"game",text:"[의사 행동 완료]",game:{kind:"mafia-doctor-action",id:gameId,round:phaseMsg.game.round,cipher}});playGameSfx("action")}catch(e){MiniTalk.UI.Shell.toast(e.message);save.disabled=false}};
        card.append(U.el("div",{class:"mafia-action-panel"},[U.el("small",{text:"의사는 한 명을 살릴 수 있어요. 자신도 가능해요."}),sel,save]))
      }
      if(roleValue==="police"&&!latest(gameId,"mafia-police-action",m=>m.user_id===me&&m.game.round===phaseMsg.game.round)){
        const targets=lobby.game.participants.filter(p=>living.includes(p.user_id)&&p.user_id!==me),sel=U.el("select",{class:"room-game-select"});targets.forEach(p=>sel.append(U.el("option",{value:p.user_id,text:p.nickname})));
        const inspect=U.el("button",{class:"button secondary compact-button",type:"button",text:"조사 대상 선택","data-phase-gate":"night"});inspect.disabled=phaseWindow(phaseMsg.game)!=="night";inspect.onclick=async()=>{inspect.disabled=true;try{const cipher=await encryptFor(lobby.game.hostPublic,{target:sel.value,round:phaseMsg.game.round});await MiniTalk.Realtime.sendMessage(roomId,{type:"game",text:"[경찰 행동 완료]",game:{kind:"mafia-police-action",id:gameId,round:phaseMsg.game.round,cipher}});playGameSfx("action")}catch(e){MiniTalk.UI.Shell.toast(e.message);inspect.disabled=false}};
        card.append(U.el("div",{class:"mafia-action-panel"},[U.el("small",{text:"경찰은 한 명을 조사해 마피아 여부를 확인해요."}),sel,inspect]))
      }
    }
    if(phase==="day"&&living.includes(me)&&!latest(gameId,"mafia-vote",m=>m.user_id===me&&m.game.round===phaseMsg.game.round)){
      const targets=lobby.game.participants.filter(p=>living.includes(p.user_id)&&p.user_id!==me),sel=U.el("select",{class:"room-game-select"});targets.forEach(p=>sel.append(U.el("option",{value:p.user_id,text:p.nickname})));
      const vote=U.el("button",{class:"button secondary compact-button",type:"button",text:"투표하기","data-phase-gate":"vote"});vote.disabled=phaseWindow(phaseMsg.game)!=="vote";vote.onclick=async()=>{vote.disabled=true;await MiniTalk.Realtime.sendMessage(roomId,{type:"game",text:"[마피아 투표]",game:{kind:"mafia-vote",id:gameId,round:phaseMsg.game.round,target:sel.value}});playGameSfx("vote")};
      card.append(U.el("div",{class:"mafia-action-panel"},[U.el("small",{text:"생존자는 한 명에게 투표할 수 있어요."}),sel,vote]))
    }
    if(lobby.game.participants.some(p=>p.user_id===me)&&!hasLeft){const leave=U.el("button",{class:"button danger compact-button mafia-leave-button",type:"button",text:"게임 나가기"});leave.onclick=async()=>{leave.disabled=true;try{await leaveMafia(roomId,lobby.game);playGameSfx("vote")}catch(e){MiniTalk.UI.Shell.toast(e.message);leave.disabled=false}};card.append(leave)}
    if(lobby&&currentUser().user_id===lobby.game.hostId&&!hasLeft){const hostControls=mafiaHostControls(roomId,lobby.game,phaseMsg);if(hostControls)card.append(hostControls)}
    return card
  }
  async function hostPrivate(gameId){return JSON.parse(localStorage.getItem(mafiaHostKey(gameId))||"null")}
  async function resolveNight(roomId,lobby,phaseMsg,{allowTimeout=false}={}){
    const host=await hostPrivate(lobby.id);if(!host?.roles)throw new Error("이 기기에 게임 진행 정보가 없습니다.");
    const round=phaseMsg.game.round,keyMsgs=allOf(lobby.id,"mafia-key"),publicKeys=new Map(keyMsgs.map(m=>[m.game.userId,m.game.publicKey])),privateHost=JSON.parse(localStorage.getItem(mafiaHostKey(lobby.id))),privateKey=await importPrivate(privateHost.privateKey);
    const aliveRoleIds=role=>Object.keys(host.roles).filter(id=>host.roles[id]===role&&host.living.includes(id));
    const decodeTargets=async(kind,allowedIds)=>{
      const actions=allOf(lobby.id,kind).filter(m=>m.game.round===round&&allowedIds.includes(m.user_id));
      const values=[];
      for(const m of actions){try{const buf=await crypto.subtle.decrypt({name:"RSA-OAEP"},privateKey,unb64(m.game.cipher)),data=JSON.parse(dec.decode(buf));if(host.living.includes(data.target))values.push({from:m.user_id,target:data.target})}catch{}}
      return values
    };
    const mafiaIds=aliveRoleIds("mafia"),doctorIds=aliveRoleIds("doctor"),policeIds=aliveRoleIds("police");
    const mafiaVotes=await decodeTargets("mafia-night-action",mafiaIds),doctorActions=await decodeTargets("mafia-doctor-action",doctorIds),policeActions=await decodeTargets("mafia-police-action",policeIds);
    const uniqueActors=actions=>new Set(actions.map(v=>v.from)).size;
    const expired=Date.now()>=(phaseMsg.game.deadline||Infinity),timedOut=allowTimeout&&expired;
    if(!timedOut&&uniqueActors(mafiaVotes)<mafiaIds.length)throw new Error(`마피아의 밤 행동이 ${mafiaIds.length-uniqueActors(mafiaVotes)}명 남았습니다.`);
    if(!timedOut&&doctorIds.length&&uniqueActors(doctorActions)<doctorIds.length)throw new Error("의사의 밤 행동이 아직 없습니다.");
    if(!timedOut&&policeIds.length&&uniqueActors(policeActions)<policeIds.length)throw new Error("경찰의 밤 행동이 아직 없습니다.");
    const counts={};mafiaVotes.forEach(v=>counts[v.target]=(counts[v.target]||0)+1);
    const rankedTargets=Object.entries(counts).sort((a,b)=>b[1]-a[1]);
    if(rankedTargets.length>1&&rankedTargets[0][1]===rankedTargets[1][1]){
      if(!timedOut)throw new Error("마피아끼리 선택한 대상이 달라요. 같은 대상을 선택해야 합니다.");
      await MiniTalk.Realtime.sendMessage(roomId,{type:"game",text:"[밤 결과]",game:{kind:"mafia-death",id:lobby.id,round,noKill:true,nickname:"",target:""}});await advanceOrEnd(roomId,lobby,host,"day",round);return
    }
    const target=rankedTargets[0]?.[0];
    if(!target){if(!timedOut)throw new Error("마피아의 유효한 대상이 없습니다.");await MiniTalk.Realtime.sendMessage(roomId,{type:"game",text:"[밤 결과]",game:{kind:"mafia-death",id:lobby.id,round,noKill:true,nickname:"",target:""}});await advanceOrEnd(roomId,lobby,host,"day",round);return}
    const savedTarget=doctorActions[0]?.target||null;
    for(const action of policeActions){
      const policeId=action.from,targetId=action.target,person=lobby.participants.find(p=>p.user_id===targetId),isMafia=host.roles[targetId]==="mafia",publicJwk=publicKeys.get(policeId);
      if(!publicJwk)continue;
      const cipher=await encryptFor(publicJwk,{target:targetId,nickname:person?.nickname||targetId,isMafia,round});
      await MiniTalk.Realtime.sendMessage(roomId,{type:"game",text:"[경찰 결과]",game:{kind:"mafia-police-result",id:lobby.id,round,target:policeId,cipher}})
    }
    if(savedTarget&&savedTarget===target){
      await MiniTalk.Realtime.sendMessage(roomId,{type:"game",text:"[밤 결과]",game:{kind:"mafia-death",id:lobby.id,round,target,nickname:(lobby.participants.find(p=>p.user_id===target)?.nickname||target),saved:true}});
      await advanceOrEnd(roomId,lobby,host,"day",round);return
    }
    const person=lobby.participants.find(p=>p.user_id===target);host.living=host.living.filter(id=>id!==target);localStorage.setItem(mafiaHostKey(lobby.id),JSON.stringify(host));
    await MiniTalk.Realtime.sendMessage(roomId,{type:"game",text:"[밤 결과]",game:{kind:"mafia-death",id:lobby.id,round,target,nickname:person?.nickname||target}});
    await advanceOrEnd(roomId,lobby,host,"day",round)
  }
  async function resolveVote(roomId,lobby,phaseMsg,{allowTimeout=false}={}){
    const host=await hostPrivate(lobby.id),votes=allOf(lobby.id,"mafia-vote").filter(m=>m.game.round===phaseMsg.game.round&&host.living.includes(m.user_id)&&host.living.includes(m.game.target)),voters=new Set(votes.map(v=>v.user_id));
    const expired=Date.now()>=(phaseMsg.game.deadline||Infinity),timedOut=allowTimeout&&expired;
    if(!timedOut&&voters.size<host.living.length)throw new Error(`아직 ${host.living.length-voters.size}명의 투표가 남았습니다.`);
    const counts={};votes.forEach(v=>counts[v.game.target]=(counts[v.game.target]||0)+1);const ranked=Object.entries(counts).sort((a,b)=>b[1]-a[1]);
    if(ranked.length>1&&ranked[0][1]===ranked[1][1]){await MiniTalk.Realtime.sendMessage(roomId,{type:"game",text:"[투표 무효]",game:{kind:"mafia-tie",id:lobby.id,round:phaseMsg.game.round}});await advanceOrEnd(roomId,lobby,host,"night",phaseMsg.game.round+1);return}
    const target=ranked[0]?.[0];if(!target){if(!timedOut)throw new Error("집계할 표가 없습니다.");await MiniTalk.Realtime.sendMessage(roomId,{type:"game",text:"[투표 무효]",game:{kind:"mafia-tie",id:lobby.id,round:phaseMsg.game.round,abstain:true}});await advanceOrEnd(roomId,lobby,host,"night",phaseMsg.game.round+1);return}const person=lobby.participants.find(p=>p.user_id===target);host.living=host.living.filter(id=>id!==target);localStorage.setItem(mafiaHostKey(lobby.id),JSON.stringify(host));
    await MiniTalk.Realtime.sendMessage(roomId,{type:"game",text:"[투표 탈락]",game:{kind:"mafia-eliminate",id:lobby.id,round:phaseMsg.game.round,target,nickname:person?.nickname||target}});await advanceOrEnd(roomId,lobby,host,"night",phaseMsg.game.round+1)
  }
  async function advanceOrEnd(roomId,lobby,host,nextPhase,round){const winner=winnerFor(host);if(winner){await MiniTalk.Realtime.sendMessage(roomId,{type:"game",text:"[마피아 게임 종료]",game:{kind:"mafia-phase",id:lobby.id,phase:"ended",round,living:[...host.living],winner,reason:"rule",startedAt:Date.now(),deadline:Date.now()}});return}await MiniTalk.Realtime.sendMessage(roomId,{type:"game",text:"[마피아 진행]",game:phasePayload(lobby.id,nextPhase,round,host.living)})}
  function mafiaHostControls(roomId,lobby,phaseMsg){const U=D(),wrap=U.el("div",{class:"mafia-host-controls"});if(phaseMsg.game.phase==="night"){const b=U.el("button",{class:"button primary compact-button",type:"button",text:"밤 결과 처리","data-phase-gate":"night"});b.disabled=phaseWindow(phaseMsg.game)!=="night";b.onclick=async()=>{b.disabled=true;try{await resolveNight(roomId,lobby,phaseMsg);playGameSfx("result")}catch(e){MiniTalk.UI.Shell.toast(e.message);b.disabled=phaseWindow(phaseMsg.game)!=="night"}};wrap.append(U.el("small",{class:"muted",text:"역할 확인이 끝난 뒤, 마피아/경찰/의사의 밤 행동 완료 후 처리할 수 있어요."}),b)}else if(phaseMsg.game.phase==="day"){const b=U.el("button",{class:"button primary compact-button",type:"button",text:"투표 집계","data-phase-gate":"vote"});b.disabled=phaseWindow(phaseMsg.game)!=="vote";b.onclick=async()=>{b.disabled=true;try{await resolveVote(roomId,lobby,phaseMsg);playGameSfx("result")}catch(e){MiniTalk.UI.Shell.toast(e.message);b.disabled=phaseWindow(phaseMsg.game)!=="vote"}};wrap.append(U.el("small",{class:"muted",text:"토론 시간이 끝난 뒤 생존자 투표를 집계할 수 있어요."}),b)}return wrap.childNodes.length?wrap:null}
  function isInternal(message){return ["mafia-key","mafia-role","mafia-night-action","mafia-doctor-action","mafia-police-action","mafia-police-result","mafia-vote","mafia-death","mafia-eliminate","mafia-tie","mafia-leave","mafia-player-left"].includes(message?.game?.kind)}
  function renderFullMessage(message,roomId){const g=message?.game;if(!g)return null;if(g.kind==="ladder")return ladderCard(g);if(g.kind==="mafia-lobby"){if(g.participants?.some(p=>p.user_id===currentUser().user_id))announceMafiaKey(roomId,g).catch(()=>{});return mafiaLobbyCard(roomId,g)}if(g.kind==="mafia-phase")return mafiaPhaseCard(roomId,message);return null}
  function desktopGameMode(){if(MiniTalk.MobileImmersive?.isMobile?.())return false;const ua=navigator.userAgent||"";if(/CrOS|Whale/i.test(ua))return true;return !/Android|iPhone|iPad|iPod|Mobile/i.test(ua)}
  function desktopPopupBounds(){
    const source=MiniTalk.UI.Dom.doc()?.defaultView||window,scr=source.screen||{},availLeft=Number(scr.availLeft)||0,availTop=Number(scr.availTop)||0,availWidth=Math.max(760,Number(scr.availWidth)||1366),availHeight=Math.max(620,Number(scr.availHeight)||768),gap=42;
    const messengerLeft=Number(source.screenX??source.screenLeft)||availLeft,messengerTop=Number(source.screenY??source.screenTop)||availTop,messengerW=Math.max(300,Number(source.outerWidth)||360),desiredW=Math.min(1100,Math.max(820,Math.round(availWidth*.68))),desiredH=Math.min(900,Math.max(680,Math.round(availHeight*.86)));
    const rightStart=messengerLeft+messengerW+gap,rightSpace=availLeft+availWidth-rightStart;let width=Math.min(desiredW,availWidth-24),height=Math.min(desiredH,availHeight-24),left,top;
    if(rightSpace>=Math.min(720,width)){width=Math.min(width,rightSpace);left=rightStart}else left=Math.max(availLeft+8,Math.min(availLeft+availWidth-width-8,messengerLeft+messengerW/2-width/2));
    top=Math.max(availTop+8,Math.min(messengerTop,availTop+availHeight-height-8));return{width:Math.round(width),height:Math.round(height),left:Math.round(left),top:Math.round(top)}
  }
  function desktopPopupFeatures(){const b=desktopPopupBounds();return`popup=yes,toolbar=no,location=no,menubar=no,status=no,scrollbars=yes,resizable=yes,width=${b.width},height=${b.height},left=${b.left},top=${b.top}`}
  function enforceDesktopPopupBounds(win){const b=desktopPopupBounds(),apply=()=>{try{win.resizeTo(b.width,b.height);win.moveTo(b.left,b.top)}catch{}};apply();setTimeout(apply,80);setTimeout(apply,260)}
  function desktopMount(title,node){
    const d=state.desktop;if(!d.win||d.win.closed||!d.root)return false;d.title.textContent=title||"대화방 게임";d.back.classList.remove("hidden");d.root.replaceChildren(d.win.document.adoptNode(node));try{d.win.focus()}catch{}return true
  }
  function latestDisplayMessage(gameId){const list=gameMessages(gameId);return [...list].reverse().find(m=>m.game?.kind==="mafia-phase")||[...list].reverse().find(m=>m.game?.kind==="mafia-lobby")||[...list].reverse().find(m=>m.game?.kind==="ladder")||null}
  function roomDisplayGames(roomId){const out=[];for(const [gameId,list] of state.messages){if(!list.some(m=>m.roomId===roomId))continue;const msg=latestDisplayMessage(gameId);if(msg)out.push(msg)}return out.sort((a,b)=>(Number(b.ts)||Number(b.clientTs)||0)-(Number(a.ts)||Number(a.clientTs)||0)).slice(0,4)}
  function showDesktopMessage(message){
    if(!message?.game)return false;ingest(message);const d=state.desktop;if(!d.win||d.win.closed)return false;d.roomId=message.roomId||d.roomId;d.activeGameId=message.game.id;const node=renderFullMessage(message,d.roomId);if(!node)return false;d.title.textContent=message.game.kind==="ladder"?"사다리타기":"마피아 게임";d.back.classList.remove("hidden");const wrap=D().el("div",{class:"chat-room-game-desktop-stage"},[node]);d.root.replaceChildren(d.win.document.adoptNode(wrap));try{d.win.focus()}catch{}return true
  }
  function queueDesktopRefresh(gameId){clearTimeout(state.desktop.refreshTimer);state.desktop.refreshTimer=setTimeout(()=>{if(state.desktop.activeGameId!==gameId)return;const msg=latestDisplayMessage(gameId);if(msg)showDesktopMessage(msg)},30)}
  function renderDesktopMenu(roomId,room){
    const U=D(),body=U.el("div",{class:"room-game-desktop-menu"});body.append(U.el("div",{class:"room-game-desktop-hero"},[U.el("strong",{text:"대화방 미니게임"}),U.el("p",{text:"현재 대화방 멤버를 골라 게임을 시작하세요. PC·웨일북에서는 넓은 별도 창으로 진행합니다."})]));
    const choices=U.el("div",{class:"room-game-desktop-choices"}),ladder=U.el("button",{class:"room-game-desktop-choice ladder",type:"button"},[U.el("span",{class:"choice-icon choice-ladder","aria-hidden":"true"},[U.el("i"),U.el("i"),U.el("i")]),U.el("strong",{text:"사다리타기"}),U.el("small",{text:"2~12명 · 랜덤 경로 추적"})]),mafia=U.el("button",{class:"room-game-desktop-choice mafia",type:"button"},[U.el("img",{class:"choice-role-art",src:roleAsset("mafia"),alt:"",loading:"eager"}),U.el("strong",{text:"마피아 게임"}),U.el("small",{text:"4~12명 · 역할/타이머/투표"})]);
    ladder.onclick=()=>createLadder(roomId,room,desktopMount);mafia.onclick=()=>createMafia(roomId,room,desktopMount);choices.append(ladder,mafia);body.append(choices);
    const recent=roomDisplayGames(roomId);if(recent.length){const section=U.el("section",{class:"room-game-desktop-recent"},[U.el("strong",{text:"진행 중 / 최근 게임"})]);recent.forEach(msg=>{const label=msg.game.kind==="ladder"?"사다리타기":msg.game.kind==="mafia-phase"&&msg.game.phase==="ended"?"마피아 게임 · 종료":"마피아 게임";const b=U.el("button",{class:"room-game-recent-button",type:"button",text:label});b.onclick=()=>showDesktopMessage(msg);section.append(b)});body.append(section)}
    const d=state.desktop;d.title.textContent="대화방 게임";d.back.classList.add("hidden");d.activeGameId=null;d.root.replaceChildren(d.win.document.adoptNode(body))
  }
  function ensureDesktopPopup(roomId,room){
    const d=state.desktop;try{if(d.win&&!d.win.closed){d.roomId=roomId;d.win.focus();renderDesktopMenu(roomId,room);return true}}catch{}
    let win=null;try{win=window.open("",`MoaruChatRoomGame_${String(roomId).replace(/[^a-zA-Z0-9_-]/g,"_")}`,desktopPopupFeatures())}catch{}if(!win)return false;
    const base=String(document.baseURI||location.href).replace(/"/g,"%22"),doc=win.document;doc.open();doc.write(`<!doctype html><html lang="ko" data-theme="${document.documentElement?.dataset?.theme||"light"}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><base href="${base}"><title>대화방 게임</title><link rel="stylesheet" href="css/tokens.css?v=7"><link rel="stylesheet" href="css/app.css?v=64.5.20"><style>html,body{margin:0;width:100%;height:100%;overflow:hidden}.chat-room-game-window{background:#eef2f8}.chat-room-game-shell{height:100%;display:grid;grid-template-rows:54px minmax(0,1fr)}.chat-room-game-bar{display:flex;align-items:center;gap:10px;padding:0 14px;background:#fff;border-bottom:1px solid #dfe5ee;box-shadow:0 2px 10px rgba(22,33,50,.06)}.chat-room-game-back,.chat-room-game-close{width:36px;height:36px;border:1px solid #dfe5ee;border-radius:11px;background:#f6f8fb;color:#253246;font-size:18px;cursor:pointer}.chat-room-game-title{flex:1;font-size:15px}.chat-room-game-root{min-height:0;overflow:auto;padding:22px}</style></head><body class="chat-room-game-window"><main class="chat-room-game-shell"><header class="chat-room-game-bar"><button id="roomGameBack" class="chat-room-game-back hidden" type="button" aria-label="게임 메뉴로">‹</button><strong id="roomGameTitle" class="chat-room-game-title">대화방 게임</strong><button id="roomGameClose" class="chat-room-game-close" type="button" aria-label="닫기">×</button></header><section id="roomGameRoot" class="chat-room-game-root"></section></main></body></html>`);doc.close();enforceDesktopPopupBounds(win);
    d.win=win;d.roomId=roomId;d.root=doc.getElementById("roomGameRoot");d.title=doc.getElementById("roomGameTitle");d.back=doc.getElementById("roomGameBack");d.activeGameId=null;
    d.back.onclick=()=>renderDesktopMenu(d.roomId,room);doc.getElementById("roomGameClose").onclick=()=>win.close();win.addEventListener("pagehide",()=>{if(d.win===win){clearTimeout(d.refreshTimer);d.win=null;d.root=null;d.title=null;d.back=null;d.activeGameId=null}},{once:true});renderDesktopMenu(roomId,room);try{win.focus()}catch{}return true
  }
  function desktopLaunchCard(message,roomId){const U=D(),g=message.game,card=U.el("section",{class:"room-game-card room-game-launch-card"});card.append(U.el("div",{class:"room-game-head"},[U.el("div",{class:"room-game-head-copy"},[U.el("strong",{text:g.kind==="ladder"?"🪜 사다리타기":"🕵️ 마피아 게임"}),U.el("small",{text:"PC·웨일북에서는 넓은 별도 창에서 진행합니다."})]),U.el("span",{class:"room-game-badge",text:"POPUP"})]));const b=U.el("button",{class:"button primary",type:"button",text:"큰 창에서 열기"});b.onclick=async()=>{const room=await MiniTalk.Realtime.getRoom(roomId);if(!ensureDesktopPopup(roomId,room))return showDesktopMessage(message);showDesktopMessage(message)};card.append(b);return card}
  function renderMessage(message,roomId){const g=message?.game;if(!g)return null;ingest(message);if(desktopGameMode())return desktopLaunchCard(message,roomId);return renderFullMessage(message,roomId)}
  async function open(roomId){const room=await MiniTalk.Realtime.getRoom(roomId);if(!room)throw new Error("대화방 정보를 불러오지 못했습니다.");if(desktopGameMode()&&ensureDesktopPopup(roomId,room))return;const U=D(),body=U.el("div",{class:"modal-stack room-game-menu"}),ladder=U.el("button",{class:"button secondary room-game-menu-button",type:"button",text:"🪜 사다리타기"}),mafia=U.el("button",{class:"button secondary room-game-menu-button",type:"button",text:"🕵️ 마피아 게임"});ladder.onclick=()=>createLadder(roomId,room);mafia.onclick=()=>createMafia(roomId,room);body.append(U.el("p",{class:"muted modal-note",text:"현재 대화방 멤버 중 참여자를 직접 골라 시작합니다."}),ladder,mafia);MiniTalk.UI.Shell.modal("대화방 게임",body)}
  return{open,ingest,renderMessage,isInternal,ladderData,ladderTrace,roleCounts,buildRolesForParticipants,playGameSfx,phaseTiming,winnerFor,desktopGameMode,desktopPopupBounds};
})();
