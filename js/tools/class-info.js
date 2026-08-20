/* 오늘의 시간표/급식표: Firebase 직접 저장. 급식표는 TXT를 날짜별로 파싱합니다. */
MiniTalk.Tools=MiniTalk.Tools||{};
MiniTalk.Tools.ClassInfo=(()=>{
  const TIMETABLE="moaru/v3/classInfo/timetable",LUNCH="moaru/v3/classInfo/lunch",TIMETABLE_CACHE="class-timetable";
  const nowDate=()=>new Date(),nowMs=()=>Date.now();
  const readData=file=>new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result||""));r.onerror=()=>reject(new Error("파일을 읽지 못했습니다."));r.readAsDataURL(file)});
  // 파일 선택기는 현재 UI가 실제로 떠 있는 문서(PiP/독립창 포함)에 붙여야 브라우저가
  // 사용자 제스처에서 시작된 파일 선택으로 안정적으로 인정합니다. DOM에 붙이지 않은
  // 임시 input.click()은 일부 Chromium/PWA 환경에서 아무 반응 없이 무시될 수 있습니다.
  const pick=(accept)=>new Promise(resolve=>{
    const doc=MiniTalk.UI.Dom.doc?.()||document,i=doc.createElement("input");
    let settled=false;
    const done=file=>{if(settled)return;settled=true;try{i.remove()}catch(_){ }resolve(file||null)};
    i.type="file";i.accept=accept;i.tabIndex=-1;i.setAttribute("aria-hidden","true");
    i.style.cssText="position:fixed;left:-9999px;top:-9999px;width:1px;height:1px;opacity:0;pointer-events:none";
    i.addEventListener("change",()=>done(i.files?.[0]||null),{once:true});
    // Chromium은 취소 시 change를 내지 않는 경우가 있어 창 포커스 복귀 뒤 정리합니다.
    const win=doc.defaultView||window;
    const onFocus=()=>setTimeout(()=>{if(!settled&&!i.files?.length)done(null)},250);
    win.addEventListener("focus",onFocus,{once:true});
    (doc.body||doc.documentElement).appendChild(i);
    try{i.click()}catch(error){win.removeEventListener("focus",onFocus);done(null);throw error}
  });
  async function compressImage(file,target=180*1024){const data=await readData(file),img=await new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=()=>reject(new Error("시간표 이미지를 읽지 못했습니다."));i.src=data}),canvas=document.createElement("canvas"),ctx=canvas.getContext("2d",{alpha:false});let scale=Math.min(1,1100/Math.max(img.naturalWidth,img.naturalHeight));for(let pass=0;pass<5;pass++){canvas.width=Math.max(1,Math.round(img.naturalWidth*scale));canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));ctx.fillStyle="#fff";ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);for(const q of [.82,.72,.62,.52,.42]){const blob=await new Promise(r=>canvas.toBlob(r,"image/jpeg",q));if(blob?.size<=target)return await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result||""));r.onerror=reject;r.readAsDataURL(blob)})}scale*=.82}throw new Error("시간표 이미지 용량을 줄이지 못했습니다.")}
  function safeDate(y,m,d){const yy=Number(y),mm=Number(m),dd=Number(d);if(!yy||mm<1||mm>12||dd<1||dd>31)return"";return`${yy}-${String(mm).padStart(2,"0")}-${String(dd).padStart(2,"0")}`}
  function parseLunch(text){const lines=String(text||"").replace(/\r/g,"").split("\n"),result={},now=nowDate();let current="";for(const raw of lines){const line=raw.trim();if(!line)continue;let m=line.match(/^(20\d{2})[-./년\s]+(\d{1,2})[-./월\s]+(\d{1,2})일?/);if(m)current=safeDate(m[1],m[2],m[3]);else{m=line.match(/^(\d{1,2})\s*월\s*(\d{1,2})\s*일/);if(m)current=safeDate(now.getFullYear(),m[1],m[2]);else{m=line.match(/^(\d{1,2})[./-](\d{1,2})(?:\s|$)/);if(m)current=safeDate(now.getFullYear(),m[1],m[2]);else if(current)(result[current]||(result[current]=[])).push(line)}}}return result}
  const todayKey=()=>{const d=nowDate();return`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`};
  async function readTimetableCached(){
    let cached=await MiniTalk.DataCache?.get?.(TIMETABLE_CACHE,"current",null);
    try{
      const serverVersion=await MiniTalk.Realtime.cloudGet(`${TIMETABLE}/updatedAt`,null),cachedUpdatedAt=Number(cached?.updatedAt)||0;
      if(serverVersion!==null&&Number(serverVersion)>0&&cached?.image&&cachedUpdatedAt===Number(serverVersion))return cached;
      const fresh=await MiniTalk.Realtime.cloudGet(TIMETABLE,null);
      if(fresh?.image){await MiniTalk.DataCache?.put?.(TIMETABLE_CACHE,"current",fresh,{sortAt:Number(fresh.updatedAt)||0});return fresh}
      if(cached)await MiniTalk.DataCache?.remove?.(TIMETABLE_CACHE,"current");return null
    }catch(error){
      if(cached?.image)return cached;
      throw error
    }
  }
  async function openTimetable(){
    const D=MiniTalk.UI.Dom,body=D.el("div",{class:"class-info modal-stack"}),data=await readTimetableCached(),preview=D.el("div",{class:"class-info-preview"});
    if(data?.image)preview.append(D.el("img",{src:data.image,alt:"오늘의 시간표"}));else preview.append(D.el("p",{class:"muted",text:"등록된 시간표가 없습니다."}));
    const upload=D.el("button",{class:"button primary",type:"button",text:"시간표 이미지 바꾸기"});
    upload.onclick=async()=>{
      if(MiniTalk.Store.get("user")?.isGuest)return MiniTalk.UI.Shell.toast("로그인 후 수정할 수 있습니다.");
      const file=await pick("image/*");if(!file)return;upload.disabled=true;
      try{
        const image=await compressImage(file),value={image,updatedAt:nowMs(),updatedBy:MiniTalk.Store.get("user")?.nickname||""};
        await MiniTalk.Realtime.cloudSet(TIMETABLE,value);await MiniTalk.DataCache?.put?.(TIMETABLE_CACHE,"current",value,{sortAt:value.updatedAt});
        MiniTalk.UI.Shell.closeModal();MiniTalk.UI.Shell.toast("시간표를 갱신했습니다.")
      }catch(e){MiniTalk.UI.Shell.toast(e.message);upload.disabled=false}
    };
    body.append(preview,upload);MiniTalk.UI.Shell.modal("오늘의 시간표",body)
  }
  async function openLunch(){const D=MiniTalk.UI.Dom,body=D.el("div",{class:"class-info modal-stack"}),data=await MiniTalk.Realtime.cloudGet(LUNCH,null),today=todayKey(),menu=data?.days?.[today]||[],box=D.el("section",{class:"lunch-today section-card"},[D.el("strong",{text:`${today} 급식`}),menu.length?D.el("div",{class:"lunch-lines"},menu.map(line=>D.el("span",{text:line}))):D.el("p",{class:"muted",text:"오늘 급식 정보가 없습니다."})]),upload=D.el("button",{class:"button primary",type:"button",text:"급식 TXT 올리기"});upload.onclick=async()=>{if(MiniTalk.Store.get("user")?.isGuest)return MiniTalk.UI.Shell.toast("로그인 후 수정할 수 있습니다.");const file=await pick("text/plain,.txt");if(!file)return;const text=await file.text(),days=parseLunch(text);if(!Object.keys(days).length)return MiniTalk.UI.Shell.toast("TXT에서 날짜를 찾지 못했습니다. 예: 2026-08-19 또는 8월 19일");upload.disabled=true;try{await MiniTalk.Realtime.cloudSet(LUNCH,{days,updatedAt:nowMs(),updatedBy:MiniTalk.Store.get("user")?.nickname||"",sourceName:file.name});MiniTalk.UI.Shell.closeModal();MiniTalk.UI.Shell.toast("급식표를 갱신했습니다.")}catch(e){MiniTalk.UI.Shell.toast(e.message);upload.disabled=false}};body.append(box,D.el("p",{class:"muted modal-note",text:data?.updatedAt?`마지막 갱신: ${new Date(data.updatedAt).toLocaleString("ko-KR")} · ${data.updatedBy||"사용자"}`:"TXT를 올리면 날짜별 급식이 표시됩니다."}),upload);MiniTalk.UI.Shell.modal("오늘의 급식표",body)}
  return{openTimetable,openLunch,parseLunch};
})();
