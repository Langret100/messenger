/* ============================================================
   CHAT ATTACHMENTS
   - 토리의 사진/카메라/파일 업로드 규격을 재사용합니다.
   - Apps Script 실패 시 이미지는 작은 base64로 로컬/실시간 전송 가능.
   - 일반 파일은 서버 URL이 필요하므로 업로드 실패를 성공처럼 꾸미지 않습니다.
   ============================================================ */
MiniTalk.Chat=MiniTalk.Chat||{};
MiniTalk.Chat.Attachments=(()=>{
  const MAX_FILE=5*1024*1024;
  function pick({accept="*/*",capture=false,multiple=false}={}){return new Promise(resolve=>{
    const doc=MiniTalk.UI?.Dom?.doc?.()||document,win=doc.defaultView||window,input=doc.createElement("input");let done=false,focusTimer=0;
    input.type="file";input.accept=accept;input.multiple=!!multiple;if(capture)input.setAttribute("capture","environment");input.style.display="none";doc.body.append(input);
    const finish=files=>{if(done)return;done=true;clearTimeout(focusTimer);win.removeEventListener("focus",onFocus,true);input.remove();const list=Array.from(files||[]);resolve(multiple?list:(list[0]||null))};
    const onFocus=()=>{clearTimeout(focusTimer);focusTimer=setTimeout(()=>{if(!done&&!input.files?.length)finish([])},450)};
    input.addEventListener("change",()=>finish(input.files),{once:true});
    input.addEventListener("cancel",()=>finish([]),{once:true});
    win.addEventListener("focus",onFocus,true);
    try{input.click()}catch(error){finish([]);throw error}
  })}
  const readData=file=>new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result||""));r.onerror=()=>reject(new Error("파일을 읽지 못했습니다."));r.readAsDataURL(file)});
  const CHAT_IMAGE_DATA_LIMIT=60*1024,CHAT_IMAGE_BLOB_TARGET=44*1024;
  async function compressImage(file,max=720,targetBytes=CHAT_IMAGE_BLOB_TARGET){
    if(!file?.type?.startsWith("image/"))throw new Error("이미지 파일이 아닙니다.");
    if(file.size>15*1024*1024)throw new Error("이미지가 너무 큽니다.");
    const data=await readData(file),doc=MiniTalk.UI?.Dom?.doc?.()||document,Img=doc.defaultView?.Image||Image;
    const img=await new Promise((resolve,reject)=>{const i=new Img();i.onload=()=>resolve(i);i.onerror=()=>reject(new Error("이미지를 읽지 못했습니다."));i.src=data});
    let scale=Math.min(1,max/Math.max(img.naturalWidth,img.naturalHeight));
    const canvas=doc.createElement("canvas"),ctx=canvas.getContext("2d",{alpha:false});
    const encode=(quality)=>new Promise(resolve=>canvas.toBlob(resolve,"image/jpeg",quality));
    for(let sizePass=0;sizePass<6;sizePass+=1){
      canvas.width=Math.max(1,Math.round(img.naturalWidth*scale));canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));
      ctx.fillStyle="#fff";ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);
      for(const quality of [.78,.68,.58,.48,.38,.3]){
        const blob=await encode(quality);if(blob&&blob.size<=targetBytes){
          const dataUrl=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result||""));reader.onerror=()=>reject(new Error("이미지를 압축하지 못했습니다."));reader.readAsDataURL(blob)});
          if(dataUrl.length<=CHAT_IMAGE_DATA_LIMIT)return dataUrl;
        }
      }
      scale*=.82;
    }
    throw new Error("사진을 Firebase 저장 기준 60KB 이하로 줄이지 못했습니다. 다른 사진을 선택해주세요.");
  }
  function uploadErrorMessage(code){
    const raw=String(code||"");
    if(/drive_link_sharing_unavailable|public_sharing_(failed|blocked)|공유/i.test(raw))return "Google Drive 링크 공유 권한을 만들지 못했습니다. 학교/기관 계정이면 외부공유 또는 도메인 링크공유 정책을 확인해주세요.";
    if(/too_large/i.test(raw))return "파일이 업로드 서버의 허용 크기를 초과했습니다.";
    if(/empty_data|invalid_data/i.test(raw))return "파일 데이터를 서버로 전달하지 못했습니다. 다시 시도해주세요.";
    return raw&&raw!=="false"?raw:"파일 업로드에 실패했습니다.";
  }
  function makeUploadToken(){
    try{return crypto.randomUUID().replace(/-/g,"")}catch(_){return `${Date.now().toString(36)}${Math.random().toString(36).slice(2,14)}`}
  }
  async function uploadRequest(endpoint,body,timeoutMs=25000){
    const controller=typeof AbortController!=="undefined"?new AbortController():null;
    const timer=controller?setTimeout(()=>controller.abort(),timeoutMs):0;
    try{
      const res=await fetch(endpoint,{method:"POST",body,cache:"no-store",signal:controller?.signal});
      const txt=await res.text();let j={};
      try{j=JSON.parse(txt||"{}") }catch{throw new Error("업로드 서버 응답을 읽지 못했습니다.")}
      const url=j.url||j.file_url||j.fileUrl||j.image_url||j.link||j.downloadUrl||"";
      if(!res.ok||j.ok===false||!url)throw new Error(uploadErrorMessage(j.error||(!res.ok?`HTTP ${res.status}`:"")));
      return url;
    }finally{if(timer)clearTimeout(timer)}
  }
  async function upload(mode,file,dataUrl){
    const endpoint=MiniTalkConfig.sheetUrl;if(!endpoint)throw new Error("업로드 서버가 설정되지 않았습니다.");
    const token=makeUploadToken(),body=new URLSearchParams();
    body.set("mode",mode);body.set("mime",file.type||"application/octet-stream");body.set("filename",file.name||"file");body.set("size",String(file.size||0));body.set("data",String(dataUrl||"").split(",").pop());body.set("upload_token",token);
    const u=MiniTalk.Store.get("user")||{};body.set("user_id",u.user_id||"");body.set("nickname",u.nickname||"");body.set("ts",String(Date.now()));
    let lastError=null;
    for(let attempt=0;attempt<3;attempt+=1){
      try{body.set("attempt",String(attempt));return await uploadRequest(endpoint,body)}catch(error){
        lastError=error;
        if(attempt<2)await new Promise(resolve=>setTimeout(resolve,350*(attempt+1)));
      }
    }
    throw lastError||new Error("파일 업로드에 실패했습니다.");
  }
  async function image({camera=false}={}){const file=await pick({accept:"image/*",capture:camera});if(!file)return null;const dataUrl=await compressImage(file);return{type:"image",image:dataUrl,text:"[사진]",inlineImage:true}}
  async function uploadFile(f){if(!f)return null;if(f.size>MAX_FILE)throw new Error("파일은 5MB 이하만 보낼 수 있습니다.");const data=await readData(f);const url=await upload("social_upload_file",f,data);return{type:"file",fileUrl:url,fileName:f.name,text:`[파일] ${f.name}`,uploadState:"ready"}}
  async function file(){const f=await pick();if(!f)return null;return uploadFile(f)}
  async function uploadFiles(selectedInput,handlers){
    const selected=Array.from(selectedInput||[]).filter(file=>file&&typeof file.name==="string");if(!selected.length)return{sent:0,total:0,failed:[]};
    const oversized=selected.filter(f=>f.size>MAX_FILE);if(oversized.length)throw new Error(`파일은 각각 5MB 이하만 보낼 수 있습니다: ${oversized.map(f=>f.name).join(", ")}`);
    const legacy=typeof handlers==="function"?handlers:null,onStart=!legacy&&handlers?.onStart,onReady=!legacy&&handlers?.onReady,onFail=!legacy&&handlers?.onFail,tokens=new Array(selected.length).fill(null);
    if(typeof onStart==="function"){for(let index=0;index<selected.length;index+=1)tokens[index]=await onStart(selected[index],{index,total:selected.length})}
    let sent=0,nextIndex=0;const failed=[];
    const worker=async()=>{for(;;){const index=nextIndex++;if(index>=selected.length)return;const f=selected[index],token=tokens[index];try{
      const payload=await uploadFile(f);
      if(legacy)await legacy(payload,{file:f,index,total:selected.length});
      else if(typeof onReady==="function")await onReady(payload,{file:f,index,total:selected.length,token});
      sent+=1;
    }catch(error){
      const item={name:f.name,error:error?.message||"업로드 실패"};failed.push(item);
      if(typeof onFail==="function")try{await onFail(error,{file:f,index,total:selected.length,token})}catch(_){}
    }} };
    const workers=Array.from({length:Math.min(2,selected.length)},()=>worker());await Promise.all(workers);
    return{sent,total:selected.length,failed};
  }
  async function files(handlers){const selected=await pick({multiple:true});return uploadFiles(selected,handlers)}
  return{image,file,files,uploadFiles,uploadFile,compressImage,CHAT_IMAGE_DATA_LIMIT};
})();
