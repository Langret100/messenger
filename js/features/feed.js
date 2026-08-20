/* 학급 피드: 최대 40개, 미디어는 별도 경로에서 지연 로드합니다. Apps Script를 사용하지 않습니다. */
MiniTalk.Features.Feed=(()=>{
  const STATE_PATH="moaru/v3/feedState",POSTS_PATH=`${STATE_PATH}/posts`,TOTALS_PATH=`${STATE_PATH}/totals`,MEDIA_PATH="moaru/v3/feedMedia",MAX_POSTS=40,MAX_COMMENTS=20,COMMENT_LIMIT=60,PHOTO_LIMIT=100*1024,VIDEO_LIMIT=350*1024,VIDEO_SECONDS=7,CLEANUP_KEY="feed.pendingMediaCleanup",POST_CACHE="feed-post",MEDIA_CACHE="feed-media";
  let state={posts:{}},postsUnsub=null,totalUnsub=null,observer=null,totalHearts=0,totalHeartReady=false,syncStarting=false,heartAudioCtx=null;const pendingLocalHeartEffects=new Set();
  const user=()=>MiniTalk.Store.get("user")||{};
  const safeUserKey=id=>String(id||"").replace(/[.#$\[\]\/]/g,"_");
  function postRows(){return Object.values(state.posts||{}).filter(Boolean).sort((a,b)=>Number(b.createdAt||0)-Number(a.createdAt||0)||String(b.id).localeCompare(String(a.id)))}
  function avatarForPost(post){const profiles=MiniTalk.Store.get("profiles")||{},profile=profiles[post?.user_id]||profiles[post?.nickname]||{};return profile.avatar||post?.avatar||"assets/mascot-avatar.png"}
  function playHeaderHeartFeedback(on=true){if(MiniTalk.Router.current()!=="feed")return;const badge=MiniTalk.UI.Dom.one(".header-heart-inline");if(!badge)return;animateHeartTarget(badge,.22,380);if(on)spawnHeartBurst(badge,3,{spread:12,rise:25,size:10,duration:560})}
  function patchHeaderHeart(animate=false,on=true){if(MiniTalk.Router.current()!=="feed")return;const host=MiniTalk.UI.Dom.byId("headerActions"),count=host?.querySelector?.(".header-heart-inline b");if(count)count.textContent=String(totalHearts);if(animate)playHeaderHeartFeedback(on)}
  function samePostBody(a,b){return Boolean(a&&b)&&["id","user_id","nickname","avatar","text","mediaType","createdAt"].every(key=>String(a?.[key]??"")===String(b?.[key]??""))}
  function patchHeart(id,previous=null){if(MiniTalk.Router.current()!=="feed")return;const post=state.posts[id],card=MiniTalk.UI.Dom.one(`.feed-card[data-post-id="${CSS.escape(String(id))}"]`);if(!post||!card)return;const uid=safeUserKey(user().user_id),liked=post.hearts?.[uid]===true,hasHearts=(Number(post.heartCount)||0)>0,button=card.querySelector(".feed-heart");if(!button)return;button.classList.toggle("active",liked||hasHearts);const icon=button.querySelector("span"),count=button.querySelector("b"),nextCount=Number(post.heartCount)||0,prevCount=Number(previous?.heartCount)||0;if(icon)icon.textContent=(liked||hasHearts)?"♥":"♡";if(count)count.textContent=String(nextCount);if(previous&&nextCount!==prevCount){const local=pendingLocalHeartEffects.delete(String(id));if(!local)playHeartFeedback(button,nextCount>prevCount,false)}}
  function patchPost(id,previous=null){if(MiniTalk.Router.current()!=="feed")return;const list=MiniTalk.UI.Dom.one(".feed-list"),post=state.posts[id];if(!list)return;if(!post){list.querySelector(`[data-post-id="${CSS.escape(String(id))}"]`)?.remove();syncFeedEmpty(list);return}const current=list.querySelector(`[data-post-id="${CSS.escape(String(id))}"]`);if(current&&samePostBody(previous,post)){patchHeart(id,previous);patchComments(id);return}const next=postCard(post);current?current.replaceWith(next):list.append(next);sortFeedCards(list);syncFeedEmpty(list);setupLazyMedia(next)}
  function sortFeedCards(list){const cards=[...list.querySelectorAll(".feed-card")].sort((a,b)=>Number(state.posts[b.dataset.postId]?.createdAt||0)-Number(state.posts[a.dataset.postId]?.createdAt||0)||String(b.dataset.postId).localeCompare(String(a.dataset.postId)));cards.forEach(card=>list.append(card))}
  function syncFeedEmpty(list){const cards=list.querySelectorAll(".feed-card");let empty=list.querySelector(".feed-empty-state");if(cards.length){empty?.remove();return}if(!empty){empty=MiniTalk.UI.Dom.el("div",{class:"empty-state feed-empty-state"},[MiniTalk.UI.Dom.el("span",{text:"♡"}),MiniTalk.UI.Dom.el("strong",{text:"아직 게시물이 없어요"}),MiniTalk.UI.Dom.el("small",{class:"muted",text:"짧은 글과 사진·영상을 올려보세요."})]);list.append(empty)}}
  function paintCachedPosts(){if(MiniTalk.Router.current()!=="feed")return;const list=MiniTalk.UI.Dom.one(".feed-list");if(!list)return;list.replaceChildren(...postRows().map(postCard));syncFeedEmpty(list);setupLazyMedia(list)}
  async function ensureSub(){
    if(!totalUnsub){const uid=safeUserKey(user().user_id);totalUnsub=MiniTalk.Realtime.cloudSubscribe(`${TOTALS_PATH}/${uid}`,value=>{const next=Math.max(0,Number(value)||0),animate=totalHeartReady&&next!==totalHearts,on=next>totalHearts;totalHearts=next;patchHeaderHeart(animate,on);totalHeartReady=true})}
    if(postsUnsub||syncStarting)return;syncStarting=true;
    try{
      const cached=await MiniTalk.DataCache?.list?.(POST_CACHE)||[];state.posts={};cached.forEach(row=>{if(row.value?.id)state.posts[row.key]=row.value});paintCachedPosts();
      const serverKeys=await MiniTalk.Realtime.cloudKeys(POSTS_PATH).catch(()=>null);
      if(Array.isArray(serverKeys)){
        const serverSet=new Set(serverKeys);
        for(const id of Object.keys(state.posts))if(!serverSet.has(id)){delete state.posts[id];MiniTalk.DataCache?.remove?.(POST_CACHE,id).catch(()=>{});MiniTalk.DataCache?.remove?.(MEDIA_CACHE,id).catch(()=>{});patchPost(id)}
        const missing=serverKeys.filter(id=>!state.posts[id]);
        for(const id of missing){const value=await MiniTalk.Realtime.cloudGet(`${POSTS_PATH}/${id}`,null).catch(()=>null);if(value){state.posts[id]=value;MiniTalk.DataCache?.put?.(POST_CACHE,id,value,{sortAt:Number(value.updatedAt)||Number(value.createdAt)||0}).catch(()=>{});patchPost(id)}}
      }
      const latestUpdated=Object.values(state.posts).reduce((max,post)=>Math.max(max,Number(post?.updatedAt)||0),0);
      const apply=(id,value)=>{if(!value)return;const previous=state.posts[id];state.posts[id]=value;MiniTalk.DataCache?.put?.(POST_CACHE,id,value,{sortAt:Number(value.updatedAt)||Number(value.createdAt)||0}).catch(()=>{});patchPost(id,previous)};
      const remove=id=>{delete state.posts[id];MiniTalk.DataCache?.remove?.(POST_CACHE,id).catch(()=>{});MiniTalk.DataCache?.remove?.(MEDIA_CACHE,id).catch(()=>{});patchPost(id)};
      postsUnsub=MiniTalk.Realtime.cloudSubscribeDelta(POSTS_PATH,{added:apply,changed:apply,removed:remove},{orderByChild:"updatedAt",startAt:Math.max(1,latestUpdated)});
    }finally{syncStarting=false}
  }
  function stopSub(){postsUnsub?.();postsUnsub=null;totalUnsub?.();totalUnsub=null;observer?.disconnect?.();observer=null;syncStarting=false;totalHeartReady=false;pendingLocalHeartEffects.clear()}
  async function compressImageFile(file,maxSide=960,target=PHOTO_LIMIT){
    if(!file?.type?.startsWith("image/"))throw new Error("사진 파일을 선택해주세요.");
    const data=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result||""));r.onerror=()=>reject(new Error("사진을 읽지 못했습니다."));r.readAsDataURL(file)});
    const img=await new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=()=>reject(new Error("사진을 읽지 못했습니다."));i.src=data});
    return encodeCanvas(img,img.naturalWidth,img.naturalHeight,maxSide,target);
  }
  async function encodeCanvas(source,w,h,maxSide,target){
    let scale=Math.min(1,maxSide/Math.max(w,h));const c=document.createElement("canvas"),ctx=c.getContext("2d",{alpha:false});
    for(let pass=0;pass<6;pass++){c.width=Math.max(1,Math.round(w*scale));c.height=Math.max(1,Math.round(h*scale));ctx.fillStyle="#fff";ctx.fillRect(0,0,c.width,c.height);ctx.drawImage(source,0,0,c.width,c.height);for(const q of [.78,.68,.58,.48,.38,.3]){const blob=await new Promise(r=>c.toBlob(r,"image/jpeg",q));if(blob&&blob.size<=target)return await blobToData(blob)}scale*=.82}throw new Error("사진 용량을 줄이지 못했습니다.")
  }
  const blobToData=blob=>new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result||""));r.onerror=()=>reject(new Error("미디어를 읽지 못했습니다."));r.readAsDataURL(blob)});
  function pickPhoto(){return new Promise(resolve=>{const input=document.createElement("input");input.type="file";input.accept="image/*";input.onchange=()=>resolve(input.files?.[0]||null);input.click()})}
  async function compose(){
    if(user().isGuest)return MiniTalk.UI.Shell.toast("로그인 후 게시물을 올릴 수 있습니다.");
    const D=MiniTalk.UI.Dom,body=D.el("div",{class:"feed-compose modal-stack"}),text=D.el("textarea",{maxlength:"180",placeholder:"짧은 글을 남겨보세요.","aria-label":"게시물 글"}),preview=D.el("div",{class:"feed-compose-preview hidden"});let media=null;
    const photo=D.el("button",{class:"button secondary",type:"button",text:"사진 첨부"}),camera=D.el("button",{class:"button secondary",type:"button",text:"카메라"}),publish=D.el("button",{class:"button primary",type:"button",text:"올리기"});
    photo.onclick=async()=>{const f=await pickPhoto();if(!f)return;try{media={type:"image",data:await compressImageFile(f)};showPreview(preview,media)}catch(e){MiniTalk.UI.Shell.toast(e.message)}};
    camera.onclick=()=>openCamera(result=>{media=result;showPreview(preview,media)});
    publish.onclick=async()=>{const clean=text.value.trim();if(!clean&&!media)return MiniTalk.UI.Shell.toast("글이나 사진·영상을 추가해주세요.");publish.disabled=true;try{await createPost(clean,media);MiniTalk.UI.Shell.closeModal();MiniTalk.UI.Shell.toast("피드에 올렸습니다.")}catch(e){MiniTalk.UI.Shell.toast(e.message);publish.disabled=false}};
    body.append(text,D.el("div",{class:"button-row"},[photo,camera]),preview,publish);MiniTalk.UI.Shell.modal("새 게시물",body)
  }
  function showPreview(host,media){host.classList.remove("hidden");host.replaceChildren(media.type==="image"?MiniTalk.UI.Dom.el("img",{src:media.data,alt:"사진 미리보기"}):MiniTalk.UI.Dom.el("video",{src:media.data,controls:true,muted:true,playsinline:true}))}
  function openCamera(onDone){
    const D=MiniTalk.UI.Dom,body=D.el("div",{class:"feed-camera"}),video=D.el("video",{class:"feed-camera-video",autoplay:true,muted:true,playsinline:true}),status=D.el("div",{class:"feed-camera-status",text:"사진 또는 7초 영상을 촬영하세요."}),photoBtn=D.el("button",{class:"button secondary",type:"button",text:"사진 촬영"}),videoBtn=D.el("button",{class:"button primary",type:"button",text:"7초 영상"});let stream=null,timer=0;
    const cleanup=()=>{clearInterval(timer);stream?.getTracks?.().forEach(t=>t.stop());stream=null};
    MiniTalk.UI.Shell.modal("피드 카메라",body);body.append(video,status,D.el("div",{class:"button-row"},[photoBtn,videoBtn]));
    navigator.mediaDevices?.getUserMedia({video:{width:{ideal:320,max:480},height:{ideal:240,max:360},frameRate:{ideal:12,max:15},facingMode:"environment"},audio:false}).then(s=>{stream=s;video.srcObject=s}).catch(()=>{status.textContent="카메라 권한을 사용할 수 없습니다.";photoBtn.disabled=videoBtn.disabled=true});
    photoBtn.onclick=async()=>{if(!video.videoWidth)return;photoBtn.disabled=videoBtn.disabled=true;try{const data=await encodeCanvas(video,video.videoWidth,video.videoHeight,640,PHOTO_LIMIT);cleanup();MiniTalk.UI.Shell.closeModal();onDone({type:"image",data})}catch(e){MiniTalk.UI.Shell.toast(e.message);photoBtn.disabled=videoBtn.disabled=false}};
    videoBtn.onclick=async()=>{if(!stream||typeof MediaRecorder==="undefined")return MiniTalk.UI.Shell.toast("이 브라우저는 영상 촬영을 지원하지 않습니다.");photoBtn.disabled=videoBtn.disabled=true;const chunks=[],mime=["video/webm;codecs=vp8","video/webm"].find(v=>MediaRecorder.isTypeSupported?.(v))||"";let recorder;try{recorder=new MediaRecorder(stream,{mimeType:mime||undefined,videoBitsPerSecond:220000})}catch{recorder=new MediaRecorder(stream)}recorder.ondataavailable=e=>{if(e.data?.size)chunks.push(e.data)};const done=new Promise(resolve=>recorder.onstop=resolve);recorder.start(250);let left=VIDEO_SECONDS;status.textContent=`촬영 중 · ${left}초`;timer=setInterval(()=>{left-=1;status.textContent=`촬영 중 · ${Math.max(0,left)}초`;if(left<=0){clearInterval(timer);if(recorder.state!=="inactive")recorder.stop()}},1000);await done;cleanup();const blob=new Blob(chunks,{type:recorder.mimeType||"video/webm"});if(blob.size>VIDEO_LIMIT){MiniTalk.UI.Shell.toast("영상 용량이 너무 큽니다. 다시 촬영해주세요.");MiniTalk.UI.Shell.closeModal();return}const data=await blobToData(blob);MiniTalk.UI.Shell.closeModal();onDone({type:"video",data,duration:VIDEO_SECONDS,size:blob.size})};
    const host=MiniTalk.UI.Dom.byId("modalHost");const close=host?.querySelector?.(".modal-close-button");if(close){const old=close.onclick;close.onclick=()=>{cleanup();old?.()}}
  }
  function pendingCleanup(){const rows=MiniTalk.Persistence.get(CLEANUP_KEY,[]);return Array.isArray(rows)?rows:[]}
  function queueCleanup(id){if(!id)return;const rows=[...new Set(pendingCleanup().concat(String(id)))].slice(-30);MiniTalk.Persistence.set(CLEANUP_KEY,rows)}
  async function retryCleanup(){const rows=pendingCleanup();if(!rows.length)return;const failed=[];for(const id of rows){try{await MiniTalk.Realtime.cloudRemove(`${MEDIA_PATH}/${id}`)}catch{failed.push(id)}}MiniTalk.Persistence.set(CLEANUP_KEY,failed)}
  async function createPost(text,media){
    const u=user(),id=crypto.randomUUID(),createdAt=Date.now(),meta={id,user_id:u.user_id,nickname:u.nickname,text:String(text||"").slice(0,180),mediaType:media?.type||"",createdAt,updatedAt:createdAt,heartCount:0,hearts:{},commentCount:0,comments:{}};
    await retryCleanup().catch(()=>{});
    if(media?.data){try{await MiniTalk.Realtime.cloudSet(`${MEDIA_PATH}/${id}`,{type:media.type,data:media.data,size:Number(media.size)||0,createdAt:meta.createdAt})}catch(error){throw new Error("사진·영상을 저장하지 못했습니다. 게시물은 등록되지 않았습니다.")}}
    try{await MiniTalk.Realtime.cloudSet(`${POSTS_PATH}/${id}`,{...meta,updatedAt:MiniTalk.Realtime.serverTimestamp()})}catch(error){if(media?.data){try{await MiniTalk.Realtime.cloudRemove(`${MEDIA_PATH}/${id}`)}catch{queueCleanup(id)}}throw error}
    MiniTalk.DataCache?.put?.(POST_CACHE,id,meta,{sortAt:createdAt}).catch(()=>{});if(media?.data)MiniTalk.DataCache?.put?.(MEDIA_CACHE,id,{type:media.type,data:media.data,size:Number(media.size)||0,createdAt},{sortAt:createdAt}).catch(()=>{});
    /* 게시물 작성 때만 최대 41개의 가벼운 메타데이터를 확인합니다. 하트/조회 때 feedState 전체를 읽지 않습니다. */
    try{
      const posts=await MiniTalk.Realtime.cloudGet(POSTS_PATH,{}),rows=Object.values(posts||{}).filter(Boolean).sort((a,b)=>Number(a.createdAt||0)-Number(b.createdAt||0)||String(a.id).localeCompare(String(b.id)));
      while(rows.length>MAX_POSTS){const old=rows.shift();if(!old?.id)continue;await MiniTalk.Realtime.cloudRemove(`${POSTS_PATH}/${old.id}`);try{await MiniTalk.Realtime.cloudRemove(`${MEDIA_PATH}/${old.id}`);MiniTalk.DataCache?.remove?.(MEDIA_CACHE,old.id).catch(()=>{});MiniTalk.DataCache?.remove?.(POST_CACHE,old.id).catch(()=>{})}catch{queueCleanup(old.id)}}
    }catch(error){console.warn("오래된 피드 정리 실패",error)}
  }
  async function toggleHeart(postId,button){
    /* 카드가 처음 만들어졌을 때의 post 스냅샷을 쓰지 않습니다.
       하트는 카드 교체 없이 부분 갱신되므로 클릭할 때마다 state에서 최신 게시물을 읽어야
       취소 -> 재등록 같은 반복 클릭에서도 on/off 판단과 이펙트가 뒤집히지 않습니다. */
    const post=state.posts[String(postId)]||state.posts[postId];if(!post)return;
    const u=user();if(u.isGuest)return MiniTalk.UI.Shell.toast("로그인 후 하트를 누를 수 있습니다.");if(post.user_id===u.user_id)return MiniTalk.UI.Shell.toast("내 게시물에는 하트를 누를 수 없습니다.");
    if(button?.disabled)return;
    const uid=safeUserKey(u.user_id),postPath=`${POSTS_PATH}/${post.id}`,authorKey=safeUserKey(post.user_id);let delta=0;pendingLocalHeartEffects.add(String(post.id));
    const expectedOn=post.hearts?.[uid]!==true;
    if(button)button.disabled=true;
    playHeartFeedback(button,expectedOn,true);
    let saved;try{saved=await MiniTalk.Realtime.cloudTransaction(postPath,current=>{if(!current)return current;const next=structuredClone(current),hearts=next.hearts||{},on=hearts[uid]===true;delta=on?-1:1;if(on)delete hearts[uid];else hearts[uid]=true;next.hearts=hearts;next.heartCount=Math.max(0,(Number(next.heartCount)||0)+delta);next.updatedAt=MiniTalk.Realtime.serverTimestamp();return next})}catch(error){pendingLocalHeartEffects.delete(String(post.id));throw error}
    finally{if(button?.isConnected)button.disabled=false}
    if(!saved||!delta){pendingLocalHeartEffects.delete(String(post.id));return}
    setTimeout(()=>pendingLocalHeartEffects.delete(String(post.id)),1800);
    try{await MiniTalk.Realtime.cloudTransaction(`${TOTALS_PATH}/${authorKey}`,current=>Math.max(0,(Number(current)||0)+delta))}
    catch(error){
      /* 누적 하트 갱신이 실패하면 게시물 하트도 원상복구해 둘 값이 어긋나지 않게 합니다. */
      await MiniTalk.Realtime.cloudTransaction(postPath,current=>{if(!current)return current;const next=structuredClone(current),hearts=next.hearts||{},on=hearts[uid]===true;if(delta>0&&on){delete hearts[uid];next.heartCount=Math.max(0,(Number(next.heartCount)||0)-1)}else if(delta<0&&!on){hearts[uid]=true;next.heartCount=(Number(next.heartCount)||0)+1}next.hearts=hearts;next.updatedAt=MiniTalk.Realtime.serverTimestamp();return next}).catch(()=>{});throw error
    }
  }

  function commentRows(post){return Object.values(post?.comments||{}).filter(row=>row&&row.text).sort((a,b)=>Number(a.createdAt||0)-Number(b.createdAt||0)||String(a.id).localeCompare(String(b.id)))}
  async function addComment(post,input,button){
    const u=user();if(u.isGuest)return MiniTalk.UI.Shell.toast("로그인 후 댓글을 남길 수 있습니다.");
    const text=String(input?.value||"").trim().slice(0,COMMENT_LIMIT);if(!text)return;
    input.disabled=true;button.disabled=true;
    const id=crypto.randomUUID(),createdAt=Date.now(),postPath=`${POSTS_PATH}/${post.id}`;
    try{
      await MiniTalk.Realtime.cloudTransaction(postPath,current=>{
        if(!current)return current;
        const next=structuredClone(current),comments=next.comments||{};
        comments[id]={id,user_id:u.user_id,nickname:u.nickname||"사용자",text,createdAt};
        const rows=Object.values(comments).filter(Boolean).sort((a,b)=>Number(a.createdAt||0)-Number(b.createdAt||0)||String(a.id).localeCompare(String(b.id)));
        while(rows.length>MAX_COMMENTS){const old=rows.shift();if(old?.id)delete comments[old.id]}
        next.comments=comments;next.commentCount=Object.keys(comments).length;next.updatedAt=MiniTalk.Realtime.serverTimestamp();return next;
      });
      input.value="";
    }catch(error){MiniTalk.UI.Shell.toast("댓글을 등록하지 못했습니다.");}
    finally{if(input.isConnected)input.disabled=false;if(button.isConnected)button.disabled=false}
  }
  function commentsBlock(post){
    const D=MiniTalk.UI.Dom,wrap=D.el("section",{class:"feed-comments","data-feed-comments":post.id}),rows=commentRows(post),list=D.el("div",{class:"feed-comment-list"});
    const visible=rows.slice(-3);visible.forEach(row=>list.append(D.el("div",{class:"feed-comment-row"},[D.el("strong",{text:row.nickname||"사용자"}),D.el("span",{text:row.text})])));
    if(rows.length>3)list.prepend(D.el("small",{class:"feed-comment-more muted",text:`이전 댓글 ${rows.length-3}개 · 최근 댓글만 표시`}));
    wrap.append(list);
    if(!user().isGuest){const input=D.el("input",{class:"feed-comment-input",type:"text",maxlength:String(COMMENT_LIMIT),placeholder:"짧게 댓글 달기…","aria-label":"짧은 댓글"}),send=D.el("button",{class:"feed-comment-send",type:"button",text:"등록"});const submit=()=>addComment(post,input,send);send.onclick=submit;input.onkeydown=e=>{if(e.key==="Enter"&&!e.isComposing){e.preventDefault();submit()}};wrap.append(D.el("div",{class:"feed-comment-compose"},[input,send]))}
    return wrap;
  }
  function patchComments(id){if(MiniTalk.Router.current()!=="feed")return;const post=state.posts[id],card=MiniTalk.UI.Dom.one(`.feed-card[data-post-id="${CSS.escape(String(id))}"]`);if(!post||!card)return;const current=card.querySelector("[data-feed-comments]");const next=commentsBlock(post);current?current.replaceWith(next):card.append(next)}

  function animateHeartTarget(target,scale=.36,duration=430){
    if(!target)return;
    try{
      target.getAnimations?.().filter(animation=>animation.id==="moaru-heart-pop").forEach(animation=>animation.cancel());
      const animation=target.animate([{transform:"scale(1)"},{transform:`scale(${1+scale})`,offset:.32},{transform:"scale(.93)",offset:.68},{transform:"scale(1)"}],{duration,easing:"cubic-bezier(.2,.8,.2,1)"});
      animation.id="moaru-heart-pop";
    }catch{target.classList.remove("heart-pop");void target.offsetWidth;target.classList.add("heart-pop");setTimeout(()=>target.classList.remove("heart-pop"),duration)}
  }
  function spawnHeartBurst(target,count=5,{spread=14,rise=40,size=13,duration=680}={}){
    if(!target)return;const rect=target.getBoundingClientRect?.();if(!rect||(!rect.width&&!rect.height))return;
    const doc=target.ownerDocument||MiniTalk.UI.Dom.doc(),host=doc.body||doc.documentElement,center=(count-1)/2;
    for(let i=0;i<count;i++){
      const particle=doc.createElement("i");particle.textContent="♥";
      Object.assign(particle.style,{position:"fixed",left:`${rect.left+rect.width*.5}px`,top:`${rect.top+Math.min(rect.height*.45,16)}px`,zIndex:"65000",pointerEvents:"none",fontStyle:"normal",fontSize:`${size+(i%2)}px`,lineHeight:"1",color:"#e0526b",opacity:"0",transform:"translate(-50%,0) scale(.55)"});
      host.append(particle);const dx=(i-center)*spread+(Math.random()-.5)*5,dy=rise+Math.abs(i-center)*3;
      try{particle.animate([{opacity:0,transform:"translate(-50%,0) scale(.55)"},{opacity:1,offset:.16,transform:`translate(calc(-50% + ${dx*.18}px),-${dy*.12}px) scale(.9)`},{opacity:0,transform:`translate(calc(-50% + ${dx}px),-${dy}px) scale(1.22)`}],{duration:duration+i*18,easing:"cubic-bezier(.2,.72,.25,1)"}).finished.catch(()=>{}).finally(()=>particle.remove())}
      catch{particle.style.transition=`transform ${duration}ms ease-out, opacity ${duration}ms ease-out`;requestAnimationFrame(()=>{particle.style.opacity="0";particle.style.transform=`translate(calc(-50% + ${dx}px),-${dy}px) scale(1.22)`});setTimeout(()=>particle.remove(),duration+80)}
    }
  }
  function heartAudioContext(){try{const Ctx=window.AudioContext||window.webkitAudioContext;if(!Ctx)return null;if(!heartAudioCtx||heartAudioCtx.state==="closed")heartAudioCtx=new Ctx();return heartAudioCtx}catch{return null}}
  function primeHeartAudio(){const ctx=heartAudioContext();if(ctx?.state==="suspended")try{ctx.resume().catch(()=>{})}catch{}}
  function playHeartSound(on){
    const ctx=heartAudioContext();if(!ctx)return;const play=()=>{try{const now=ctx.currentTime,osc=ctx.createOscillator(),gain=ctx.createGain();osc.type="sine";osc.frequency.setValueAtTime(on?660:430,now);osc.frequency.exponentialRampToValueAtTime(on?900:360,now+.085);gain.gain.setValueAtTime(.0001,now);gain.gain.exponentialRampToValueAtTime(.055,now+.01);gain.gain.exponentialRampToValueAtTime(.0001,now+.13);osc.connect(gain).connect(ctx.destination);osc.start(now);osc.stop(now+.14)}catch{}};
    if(ctx.state==="suspended")try{ctx.resume().then(play).catch(()=>{})}catch{}else play();
  }
  function playHeartFeedback(button,on,sound=true){
    if(!button)return;animateHeartTarget(button,.42,440);if(on)spawnHeartBurst(button,6,{spread:14,rise:42,size:13,duration:700});if(sound)playHeartSound(on);
  }
  function headerHeartBadge(){const D=MiniTalk.UI.Dom;return D.el("div",{class:"header-heart-inline","aria-label":`받은 하트 ${totalHearts}개`},[D.el("span",{text:"♥"}),D.el("b",{text:String(totalHearts)})])}
  function render(host){if(!host)return;MiniTalk.UI.Shell.setHeader("소식",[headerHeartBadge()]);ensureSub();const D=MiniTalk.UI.Dom,u=user(),shell=D.el("section",{class:"view feed-shell view-enter"}),scroller=D.el("div",{class:"feed-view"}),list=D.el("div",{class:"feed-list"});postRows().forEach(post=>list.append(postCard(post)));if(!postRows().length)list.append(D.el("div",{class:"empty-state feed-empty-state"},[D.el("span",{text:"♡"}),D.el("strong",{text:"아직 게시물이 없어요"}),D.el("small",{class:"muted",text:"짧은 글과 사진·영상을 올려보세요."})]));scroller.append(list);shell.append(scroller);if(!u.isGuest)shell.append(D.el("button",{class:"feed-fab",type:"button","aria-label":"게시물 올리기",onclick:compose},[D.el("span",{text:"＋"})]));host.replaceChildren(shell);setupLazyMedia(scroller)}
  function youtubePlayer(text){const D=MiniTalk.UI.Dom,id=MiniTalk.Chat.Linkify?.youtubeId?.(text);if(!id)return null;return D.el("div",{class:"feed-youtube-player"},[D.el("iframe",{src:`https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?playsinline=1&rel=0`,title:"YouTube 영상",loading:"lazy",allow:"accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share",allowfullscreen:true,referrerpolicy:"strict-origin-when-cross-origin"})])}
  function postCard(post){const D=MiniTalk.UI.Dom,u=user(),uid=safeUserKey(u.user_id),liked=post.hearts?.[uid]===true,card=D.el("article",{class:"feed-card","data-post-id":post.id}),avatar=D.el("img",{class:"feed-avatar",src:avatarForPost(post),alt:""});avatar.onerror=()=>{avatar.src="assets/mascot-avatar.png"};card.append(D.el("header",{class:"feed-card-head"},[avatar,D.el("div",{},[D.el("strong",{text:post.nickname||"사용자"}),D.el("small",{class:"muted",text:new Date(Number(post.createdAt)||Date.now()).toLocaleString("ko-KR")})]) ]));if(post.text){const display=MiniTalk.Chat.Linkify?.displayText?.(post.text)??post.text;if(display)card.append(D.el("p",{class:"feed-text",text:display}));const player=youtubePlayer(post.text);if(player)card.append(player)}if(post.mediaType){const mediaHost=D.el("div",{class:`feed-media-placeholder${post.mediaType==="video"?" video-gated":""}`,"data-media-id":post.id,"data-media-type":post.mediaType},[D.el("span",{text:post.mediaType==="video"?"▶ 영상 보기":"사진 불러오는 중…"})]);if(post.mediaType==="video")mediaHost.onclick=()=>{mediaHost.onclick=null;mediaHost.classList.add("loading");mediaHost.replaceChildren(D.el("span",{text:"영상 불러오는 중…"}));loadMedia(mediaHost)};card.append(mediaHost)};const hasHearts=(Number(post.heartCount)||0)>0,heart=D.el("button",{class:`feed-heart ${(liked||hasHearts)?"active":""}`,type:"button","aria-label":"하트"},[D.el("span",{text:(liked||hasHearts)?"♥":"♡"}),D.el("b",{text:String(Number(post.heartCount)||0)})]);heart.onpointerdown=primeHeartAudio;heart.onclick=()=>toggleHeart(post.id,heart);card.append(D.el("footer",{class:"feed-card-foot"},[heart]),commentsBlock(post));return card}
  function setupLazyMedia(root){if(typeof IntersectionObserver==="undefined"){root.querySelectorAll?.('[data-media-type="image"]').forEach(loadMedia);return}if(!observer)observer=new IntersectionObserver(entries=>entries.forEach(e=>{if(e.isIntersecting){observer.unobserve(e.target);loadMedia(e.target)}}),{rootMargin:"220px"});root.querySelectorAll?.('[data-media-type="image"]').forEach(el=>observer.observe(el))}
  async function loadMedia(host){const id=host.dataset.mediaId;try{let media=await MiniTalk.DataCache?.get?.(MEDIA_CACHE,id,null);if(!media?.data){media=await MiniTalk.Realtime.cloudGet(`${MEDIA_PATH}/${id}`,null);if(media?.data)MiniTalk.DataCache?.put?.(MEDIA_CACHE,id,media,{sortAt:Number(media.createdAt)||0}).catch(()=>{})}if(!host.isConnected)return;if(!media?.data)return host.replaceChildren(MiniTalk.UI.Dom.el("span",{class:"muted",text:"미디어가 없습니다."}));host.replaceChildren(media.type==="video"?MiniTalk.UI.Dom.el("video",{src:media.data,controls:true,playsinline:true,preload:"metadata"}):MiniTalk.UI.Dom.el("img",{src:media.data,alt:"게시물 사진",loading:"lazy"}))}catch{host.replaceChildren(MiniTalk.UI.Dom.el("span",{class:"muted",text:"미디어를 불러오지 못했습니다."}))}}
  return{id:"feed",title:"소식",icon:"♡",render,leave:stopSub};
})();
MiniTalk.Registry.register(MiniTalk.Features.Feed);
