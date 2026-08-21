/* ============================================================
   닮은 생물 찾기 (로컬 사진 분석 + 결과명만 온라인 이미지 조회)
   개인정보 원칙
   - 카메라 프레임과 계산된 특징값은 브라우저 메모리에서만 사용합니다.
   - 캡처 직후 특징 계산이 끝나면 캡처 canvas를 즉시 지웁니다.
   - localStorage / IndexedDB / Cache / Firebase / Apps Script에 사진이나 특징값을 저장하지 않습니다.
   - 온라인 요청에는 최종 결과의 공개 검색어(예: "otter animal")만 포함됩니다.
   ============================================================ */
MiniTalk.Tools = MiniTalk.Tools || {};
MiniTalk.Tools.LookalikePlay = (() => {
  const MAX_EDGE = 720;
  const COMMONS_API = "https://commons.wikimedia.org/w/api.php";
  let stream = null;
  let facing = "user";
  let view = null;
  let video = null;
  let stage = null;
  let statusNode = null;
  let countdownNode = null;
  let switchButton = null;
  let shutter = null;
  let modeButton = null;
  let resultPanel = null;
  let closeCallback = null;
  let runId = 0;
  let category = "any";
  let busy = false;
  let lastResultId = "";
  const recentImageKeys = new Map();
  let audioContext = null;
  let activeDoc = null;
  let separateWindow = false;

  function audio(){
    try{
      const C=window.AudioContext||window.webkitAudioContext;if(!C)return null;
      if(!audioContext) audioContext=new C();
      if(audioContext.state==="suspended") audioContext.resume().catch(()=>{});
      return audioContext;
    }catch{return null}
  }
  function tone(freq=440,duration=.08,type="sine",gain=.045,delaySec=0){
    const ctx=audio();if(!ctx)return;
    try{const o=ctx.createOscillator(),g=ctx.createGain(),t=ctx.currentTime+delaySec;o.type=type;o.frequency.setValueAtTime(freq,t);g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(gain,t+.012);g.gain.exponentialRampToValueAtTime(.0001,t+duration);o.connect(g);g.connect(ctx.destination);o.start(t);o.stop(t+duration+.02)}catch{}
  }
  function sound(name){
    if(name==="count"){tone(620,.07,"sine",.035);return}
    if(name==="shutter"){tone(170,.045,"square",.055);tone(110,.07,"square",.035,.045);return}
    if(name==="scan"){tone(420,.06,"triangle",.025);tone(520,.06,"triangle",.025,.09);tone(660,.07,"triangle",.025,.18);return}
    if(name==="reveal"){tone(523,.12,"sine",.04);tone(659,.14,"sine",.04,.09);tone(784,.18,"sine",.045,.18);return}
    if(name==="tap"){tone(360,.045,"sine",.02);return}
  }

  const RESULTS = [
    { id:"otter", kind:"animal", ko:"수달", emoji:"🦦", query:"otter animal portrait", vibe:"둥글둥글하고 장난기 있는 느낌" },
    { id:"quokka", kind:"animal", ko:"쿼카", emoji:"🐹", query:"quokka animal portrait", vibe:"밝고 편안하게 웃는 느낌" },
    { id:"red-panda", kind:"animal", ko:"레서판다", emoji:"🦊", query:"red panda animal portrait", vibe:"따뜻하고 귀여운 분위기" },
    { id:"rabbit", kind:"animal", ko:"토끼", emoji:"🐰", query:"rabbit animal portrait", vibe:"맑고 가벼운 인상" },
    { id:"seal", kind:"animal", ko:"물범", emoji:"🦭", query:"harbor seal animal portrait", vibe:"말랑하고 차분한 느낌" },
    { id:"fox", kind:"animal", ko:"여우", emoji:"🦊", query:"red fox animal portrait", vibe:"선명하고 재빠른 느낌" },
    { id:"alpaca", kind:"animal", ko:"알파카", emoji:"🦙", query:"alpaca animal portrait", vibe:"부드럽고 느긋한 분위기" },
    { id:"cat", kind:"animal", ko:"고양이", emoji:"🐱", query:"domestic cat portrait", vibe:"또렷하고 살짝 시크한 느낌" },
    { id:"dog", kind:"animal", ko:"강아지", emoji:"🐶", query:"dog animal portrait", vibe:"친근하고 에너지 넘치는 느낌" },
    { id:"hamster", kind:"animal", ko:"햄스터", emoji:"🐹", query:"hamster animal portrait", vibe:"통통 튀고 귀여운 느낌" },
    { id:"raccoon", kind:"animal", ko:"라쿤", emoji:"🦝", query:"raccoon animal portrait", vibe:"장난꾸러기 같은 인상" },
    { id:"meerkat", kind:"animal", ko:"미어캣", emoji:"🦫", query:"meerkat animal portrait", vibe:"호기심 많고 또렷한 느낌" },
    { id:"koala", kind:"animal", ko:"코알라", emoji:"🐨", query:"koala animal portrait", vibe:"느긋하고 포근한 분위기" },
    { id:"panda", kind:"animal", ko:"판다", emoji:"🐼", query:"giant panda portrait", vibe:"둥글고 편안한 느낌" },
    { id:"penguin", kind:"animal", ko:"펭귄", emoji:"🐧", query:"penguin animal portrait", vibe:"단정하면서 엉뚱한 느낌" },
    { id:"owl", kind:"animal", ko:"부엉이", emoji:"🦉", query:"owl bird portrait", vibe:"눈빛이 또렷하고 침착한 느낌" },
    { id:"duck", kind:"animal", ko:"오리", emoji:"🦆", query:"duck bird portrait", vibe:"둥글고 유쾌한 분위기" },
    { id:"squirrel", kind:"animal", ko:"다람쥐", emoji:"🐿️", query:"squirrel animal portrait", vibe:"빠릿하고 발랄한 느낌" },
    { id:"hedgehog", kind:"animal", ko:"고슴도치", emoji:"🦔", query:"hedgehog animal portrait", vibe:"작지만 개성 강한 느낌" },
    { id:"capybara", kind:"animal", ko:"카피바라", emoji:"🦫", query:"capybara animal portrait", vibe:"세상 느긋하고 평온한 느낌" },
    { id:"llama", kind:"animal", ko:"라마", emoji:"🦙", query:"llama animal portrait", vibe:"무심한 듯 웃긴 분위기" },
    { id:"ferret", kind:"animal", ko:"페럿", emoji:"🐾", query:"ferret animal portrait", vibe:"날렵하고 장난기 있는 느낌" },
    { id:"fennec", kind:"animal", ko:"사막여우", emoji:"🦊", query:"fennec fox animal portrait", vibe:"귀가 쫑긋한 듯 또렷한 느낌" },
    { id:"sloth", kind:"animal", ko:"나무늘보", emoji:"🦥", query:"sloth animal portrait", vibe:"여유롭고 느긋한 분위기" },
    { id:"sunflower", kind:"plant", ko:"해바라기", emoji:"🌻", query:"sunflower flower", vibe:"밝고 에너지 넘치는 분위기" },
    { id:"daisy", kind:"plant", ko:"데이지", emoji:"🌼", query:"daisy flower", vibe:"가볍고 맑은 느낌" },
    { id:"lavender", kind:"plant", ko:"라벤더", emoji:"🪻", query:"lavender flowers", vibe:"차분하고 부드러운 분위기" },
    { id:"cherry", kind:"plant", ko:"벚꽃", emoji:"🌸", query:"cherry blossom flowers", vibe:"화사하고 산뜻한 느낌" },
    { id:"cactus", kind:"plant", ko:"선인장", emoji:"🌵", query:"cactus plant", vibe:"단단하고 개성 있는 느낌" },
    { id:"succulent", kind:"plant", ko:"다육이", emoji:"🌱", query:"succulent plant", vibe:"통통하고 귀여운 분위기" },
    { id:"monstera", kind:"plant", ko:"몬스테라", emoji:"🌿", query:"monstera plant leaves", vibe:"시원하고 존재감 있는 느낌" },
    { id:"fern", kind:"plant", ko:"고사리", emoji:"🌿", query:"fern plant frond", vibe:"차분하고 자연스러운 느낌" },
    { id:"tulip", kind:"plant", ko:"튤립", emoji:"🌷", query:"tulip flower", vibe:"깔끔하고 산뜻한 느낌" },
    { id:"rose", kind:"plant", ko:"장미", emoji:"🌹", query:"rose flower", vibe:"선명하고 존재감 있는 분위기" },
    { id:"hydrangea", kind:"plant", ko:"수국", emoji:"💠", query:"hydrangea flower", vibe:"풍성하고 부드러운 느낌" },
    { id:"lotus", kind:"plant", ko:"연꽃", emoji:"🪷", query:"lotus flower", vibe:"잔잔하고 맑은 분위기" },
    { id:"cosmos", kind:"plant", ko:"코스모스", emoji:"🌸", query:"cosmos flower", vibe:"가볍고 자유로운 느낌" },
    { id:"camellia", kind:"plant", ko:"동백꽃", emoji:"🌺", query:"camellia flower", vibe:"또렷하고 단단한 분위기" },
    { id:"orchid", kind:"plant", ko:"난초", emoji:"🌺", query:"orchid flower", vibe:"차분하고 세련된 느낌" },
    { id:"maple", kind:"plant", ko:"단풍나무", emoji:"🍁", query:"maple leaves tree", vibe:"따뜻하고 선명한 분위기" },
    { id:"bamboo", kind:"plant", ko:"대나무", emoji:"🎋", query:"bamboo plant", vibe:"곧고 시원한 느낌" },
    { id:"eucalyptus", kind:"plant", ko:"유칼립투스", emoji:"🌿", query:"eucalyptus leaves plant", vibe:"차분하고 청량한 느낌" },
    { id:"clover", kind:"plant", ko:"클로버", emoji:"☘️", query:"clover plant leaves", vibe:"소박하고 행운 같은 느낌" },
    { id:"moss", kind:"plant", ko:"이끼", emoji:"🌱", query:"green moss plant macro", vibe:"조용하고 포근한 자연 느낌" },
    { id:"waterlily", kind:"plant", ko:"수련", emoji:"🪷", query:"water lily flower", vibe:"잔잔하고 몽글한 분위기" },
    { id:"poppy", kind:"plant", ko:"양귀비", emoji:"🌺", query:"poppy flower", vibe:"선명하고 자유로운 느낌" },
    { id:"bluebell", kind:"plant", ko:"블루벨", emoji:"🪻", query:"bluebell flowers", vibe:"맑고 살짝 신비로운 느낌" }
  ];

  const doc = () => activeDoc || MiniTalk.UI?.Dom?.doc?.() || document;
  const dom = () => MiniTalk.UI.Dom.forDocument(doc());
  const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

  function stopCamera(){
    if(stream) stream.getTracks().forEach(track=>track.stop());
    stream=null;
    if(video) video.srcObject=null;
  }

  async function startCamera(nextFacing=facing){
    const mediaDevices=activeDoc?.defaultView?.navigator?.mediaDevices;
    if(!mediaDevices?.getUserMedia){setStatus("카메라를 쓸 수 없어요.",true);return false}
    stopCamera();
    facing=nextFacing;
    const exact={audio:false,video:{facingMode:{exact:facing},width:{ideal:1280},height:{ideal:1280}}};
    const ideal={audio:false,video:{facingMode:{ideal:facing},width:{ideal:1280},height:{ideal:1280}}};
    try{stream=await mediaDevices.getUserMedia(exact)}catch{
      try{stream=await mediaDevices.getUserMedia(ideal)}catch{
        try{stream=await mediaDevices.getUserMedia({audio:false,video:true})}catch{setStatus("카메라 권한을 확인해 줘.",true);return false}
      }
    }
    const actual=stream.getVideoTracks?.()[0]?.getSettings?.().facingMode;
    if(actual==="user"||actual==="environment") facing=actual;
    if(!video||!view?.isConnected){stopCamera();return false}
    video.srcObject=stream;video.muted=true;video.playsInline=true;
    await new Promise(resolve=>{if(video.readyState>=2)return resolve();video.onloadedmetadata=resolve;setTimeout(resolve,1500)});
    try{await video.play()}catch{}
    video.classList.toggle("is-mirrored",facing==="user");
    setStatus("얼굴을 크게 맞추고 눌러봐!");
    return true;
  }

  function buildView(){
    const D=dom();
    view=D.el("section",{class:"view lookalike-view view-enter"});
    const top=D.el("div",{class:"lookalike-topbar"});
    const back=D.el("button",{class:"lookalike-back",type:"button","aria-label":"나가기",text:"‹"});
    const title=D.el("div",{class:"lookalike-title"},[D.el("strong",{text:"나랑 닮은 생물은?"}),D.el("small",{text:"사진·얼굴 수치는 밖으로 보내지 않아요"})]);
    switchButton=D.el("button",{class:"lookalike-switch",type:"button","aria-label":"전후면 카메라 전환",title:"카메라 전환",text:"↻"});
    back.onclick=close;
    switchButton.onclick=async()=>{if(busy)return;sound("tap");switchButton.disabled=true;try{await startCamera(facing==="user"?"environment":"user")}finally{switchButton.disabled=false}};
    top.append(back,title,switchButton);

    stage=D.el("div",{class:"lookalike-stage"});
    video=D.el("video",{class:"lookalike-video",autoplay:true,muted:true,playsinline:true});
    countdownNode=D.el("div",{class:"lookalike-countdown hidden","aria-live":"assertive"});
    statusNode=D.el("div",{class:"lookalike-status",text:"카메라 준비 중…"});
    resultPanel=D.el("div",{class:"lookalike-result hidden"});
    stage.append(video,countdownNode,statusNode,resultPanel);

    const bottom=D.el("div",{class:"lookalike-bottom"});
    modeButton=D.el("button",{class:"lookalike-mode",type:"button",text:"아무거나"});
    modeButton.onclick=()=>{if(busy)return;sound("tap");category=category==="any"?"animal":category==="animal"?"plant":"any";modeButton.textContent=category==="any"?"아무거나":category==="animal"?"동물만":"식물만"};
    shutter=D.el("button",{class:"lookalike-shutter",type:"button","aria-label":"3초 뒤 촬영"},[D.el("span",{})]);
    shutter.onclick=runCountdown;
    const retry=D.el("button",{class:"lookalike-retry",type:"button",text:"다시"});
    retry.onclick=resetCamera;
    bottom.append(modeButton,shutter,retry);

    view.append(top,stage,bottom);
    return view;
  }

  async function open(onClose, options={}){
    dispose();
    closeCallback=typeof onClose==="function"?onClose:null;
    activeDoc=options.doc||MiniTalk.UI.Dom.doc();separateWindow=Boolean(options.separate);
    const host=options.host||activeDoc.getElementById("viewHost");if(!host){activeDoc=null;separateWindow=false;return}
    host.replaceChildren(buildView());
    facing="user";category="any";busy=false;lastResultId="";
    await startCamera("user");
  }

  function dispose(){
    runId++;
    busy=false;
    stopCamera();
    if(resultPanel) resultPanel.replaceChildren();
    view=null;video=null;stage=null;statusNode=null;countdownNode=null;switchButton=null;shutter=null;modeButton=null;resultPanel=null;
    activeDoc=null;separateWindow=false;
  }

  function close(){const cb=closeCallback;closeCallback=null;dispose();cb?.()}

  function setStatus(text,error=false){if(!statusNode)return;statusNode.textContent=text||"";statusNode.classList.toggle("error",!!error);statusNode.classList.toggle("hidden",!text)}

  async function runCountdown(){
    if(busy||!video?.videoWidth||!video?.videoHeight){if(!busy)setStatus("카메라가 아직 준비 중이야.",true);return}
    busy=true;const myRun=++runId;shutter.disabled=true;switchButton.disabled=true;modeButton.disabled=true;
    resultPanel.classList.add("hidden");resultPanel.replaceChildren();video.classList.remove("hidden");setStatus("");
    try{
      for(const n of [3,2,1]){if(myRun!==runId)return;sound("count");countdownNode.textContent=String(n);countdownNode.classList.remove("hidden");countdownNode.classList.remove("pop");void countdownNode.offsetWidth;countdownNode.classList.add("pop");await delay(650)}
      sound("shutter");countdownNode.textContent="찰칵!";await delay(240);countdownNode.classList.add("hidden");
      const metrics=captureMetrics();
      if(!metrics){setStatus("사진을 읽지 못했어. 다시 해보자.",true);return}
      stopCamera();
      video.classList.add("hidden");
      setStatus("촬영본 삭제 완료 · 특징 살펴보는 중…");
      sound("scan");
      const result=pickResult(metrics,category);
      // metrics는 이 함수 바깥에 저장하지 않으며 온라인 요청에도 전달하지 않습니다.
      await revealPhase("분위기 비슷한 후보 찾는 중…",420,myRun);
      const imagePromise=findCommonsImage(result,myRun);
      await revealPhase("거의 찾았다…",420,myRun);
      const image=await imagePromise;
      if(myRun!==runId)return;
      await revealPhase("결과 공개!",220,myRun);
      showResult(result,image);
      sound("reveal");
    }finally{
      if(myRun===runId){busy=false;shutter.disabled=false;switchButton.disabled=false;modeButton.disabled=false}
    }
  }

  async function revealPhase(text,ms,myRun){if(myRun!==runId)return;setStatus(text);await delay(ms)}

  function captureMetrics(){
    const capture=doc().createElement("canvas");
    const scale=Math.min(1,MAX_EDGE/Math.max(video.videoWidth,video.videoHeight));
    capture.width=Math.max(1,Math.round(video.videoWidth*scale));capture.height=Math.max(1,Math.round(video.videoHeight*scale));
    const ctx=capture.getContext("2d",{willReadFrequently:true,alpha:false});
    ctx.drawImage(video,0,0,capture.width,capture.height);
    const w=capture.width,h=capture.height;
    const side=Math.floor(Math.min(w,h)*.68),sx=Math.floor((w-side)/2),sy=Math.floor((h-side)/2);
    let data;
    try{data=ctx.getImageData(sx,sy,side,side).data}catch{wipeCanvas(capture);return null}
    let lum=0,lum2=0,rSum=0,gSum=0,bSum=0,left=0,right=0,top=0,bottom=0,pixels=0;
    const rowWidth=side;
    for(let i=0,p=0;i<data.length;i+=4,p++){
      const r=data[i],g=data[i+1],b=data[i+2],y=.2126*r+.7152*g+.0722*b;
      lum+=y;lum2+=y*y;rSum+=r;gSum+=g;bSum+=b;pixels++;
      const x=p%rowWidth,yy=(p/rowWidth)|0;
      if(x<rowWidth/2)left+=y;else right+=y;
      if(yy<rowWidth/2)top+=y;else bottom+=y;
    }
    const mean=lum/pixels,variance=Math.max(0,lum2/pixels-mean*mean),contrast=Math.sqrt(variance)/128;
    const avgR=rSum/pixels,avgG=gSum/pixels,avgB=bSum/pixels;
    const warmth=clamp((avgR-avgB+128)/256,0,1),green=clamp((avgG-(avgR+avgB)/2+96)/192,0,1);
    const half=pixels/2,symmetry=1-clamp(Math.abs(left/half-right/half)/80,0,1),vertical=clamp((top/half-bottom/half+80)/160,0,1);
    const brightness=clamp(mean/255,0,1);
    wipeCanvas(capture);
    return {brightness,contrast:clamp(contrast,0,1),warmth,green,symmetry,vertical};
  }

  function wipeCanvas(c){
    if(!c)return;try{c.getContext("2d")?.clearRect(0,0,c.width,c.height)}catch{}
    c.width=1;c.height=1;
  }

  function pickResult(m,kind){
    const pool=RESULTS.filter(r=>kind==="any"||r.kind===kind);
    const seed=(m.brightness*.24+m.contrast*.21+m.warmth*.19+m.green*.13+m.symmetry*.15+m.vertical*.08);
    let index=Math.floor(seed*9973)%pool.length;
    if(pool.length>1&&pool[index].id===lastResultId) index=(index+1+Math.floor(m.contrast*3))%pool.length;
    const result=pool[index];lastResultId=result.id;return result;
  }

  async function findCommonsImage(result,myRun){
    // 외부로 나가는 값은 이 공개 검색어뿐입니다. 사진/픽셀/특징값은 절대 포함하지 않습니다.
    const query=result.query;
    const params=new URLSearchParams({action:"query",format:"json",origin:"*",generator:"search",gsrnamespace:"6",gsrlimit:"16",gsrsearch:query,prop:"imageinfo",iiprop:"url|mime|extmetadata",iiurlwidth:"900"});
    try{
      const response=await fetch(`${COMMONS_API}?${params.toString()}`,{method:"GET",credentials:"omit",referrerPolicy:"no-referrer",cache:"no-store"});
      if(!response.ok||myRun!==runId)return null;
      const json=await response.json();
      const pages=Object.values(json?.query?.pages||{});
      const candidates=pages.map(p=>({title:p.title,info:p.imageinfo?.[0]})).filter(x=>x.info&&/^image\/(jpeg|png|webp)$/i.test(x.info.mime||""));
      if(!candidates.length)return null;
      const chosen=chooseImageCandidate(result.id,candidates),meta=chosen.info.extmetadata||{};
      const key=chosen.info.thumburl||chosen.info.url||chosen.title;
      return {url:chosen.info.thumburl||chosen.info.url,page:chosen.info.descriptionurl||"https://commons.wikimedia.org/",author:plain(meta.Artist?.value||""),license:plain(meta.LicenseShortName?.value||""),key};
    }catch{return null}
  }

  function chooseImageCandidate(resultId,candidates,random=Math.random){
    const recent=recentImageKeys.get(resultId)||[];
    const keyOf=x=>x?.info?.thumburl||x?.info?.url||x?.title||"";
    const fresh=candidates.filter(x=>!recent.includes(keyOf(x)));
    const pool=fresh.length?fresh:candidates;
    const chosen=pool[Math.min(pool.length-1,Math.floor(clamp(Number(random())||0,0,.999999)*pool.length))];
    const key=keyOf(chosen);
    recentImageKeys.set(resultId,[key,...recent.filter(v=>v!==key)].slice(0,5));
    return chosen;
  }

  function plain(value){const div=doc().createElement("div");div.innerHTML=String(value||"");return (div.textContent||"").replace(/\s+/g," ").trim().slice(0,80)}

  function showResult(result,image){
    const D=dom();resultPanel.replaceChildren();
    const media=D.el("div",{class:"lookalike-result-media"});
    if(image?.url){const img=D.el("img",{class:"lookalike-result-image",alt:`${result.ko} 이미지`});img.referrerPolicy="no-referrer";img.decoding="async";img.src=image.url;media.append(img)}
    else media.append(D.el("div",{class:"lookalike-result-fallback",text:result.emoji}));
    const copy=D.el("div",{class:"lookalike-result-copy"},[
      D.el("small",{text:"오늘의 닮은 생물"}),
      D.el("strong",{text:`${result.emoji} ${result.ko}!`}),
      D.el("p",{text:result.vibe})
    ]);
    if(image?.page){const source=D.el("a",{class:"lookalike-source",href:image.page,target:"_blank",rel:"noopener noreferrer",text:[image.author,image.license,"Wikimedia Commons"].filter(Boolean).join(" · ")});copy.append(source)}
    resultPanel.append(media,copy);resultPanel.classList.remove("hidden");resultPanel.classList.remove("reveal");void resultPanel.offsetWidth;resultPanel.classList.add("reveal");setStatus("촬영본은 이미 메모리에서 삭제됐어요.");
  }

  async function resetCamera(){
    if(busy)return;sound("tap");runId++;resultPanel?.replaceChildren();resultPanel?.classList.add("hidden");video?.classList.remove("hidden");await startCamera(facing);
  }

  const _test={pickResult,RESULTS,wipeCanvas,COMMONS_API,findCommonsImage,chooseImageCandidate,recentImageKeys,sound};
  return {open,dispose,isSeparate:()=>separateWindow,_test};
})();
