/* 인증 기능. 이전 아이디와 로그인 세션을 기억하지만 실제 비밀번호는 저장하지 않습니다. */
MiniTalk.Features=MiniTalk.Features||{};
MiniTalk.Features.Auth=(()=>{
  const KEY="session.user",LAST_ID_KEY="auth.lastUsername";
  let rememberedUser=null;

  function save(user){
    rememberedUser=user;
    MiniTalk.Persistence.set(KEY,user);
    if(!user?.isGuest&&user?.username)MiniTalk.Persistence.set(LAST_ID_KEY,user.username);
    MiniTalk.Store.set("user",user);
    MiniTalk.Events.emit("auth:success",user)
  }
  function restore(){
    const user=MiniTalk.Persistence.get(KEY);
    rememberedUser=user?.user_id&&!user.isGuest?user:null;
    if(user?.isGuest)MiniTalk.Persistence.remove(KEY);
    return rememberedUser
  }

  function render(host){
    host.classList.remove("hidden");
    const desktop=!MiniTalk.MobileImmersive?.isMobile?.();
    const keepDefault=MiniTalk.Persistence.get("window.keepOnTopAfterLogin",true)!==false;
    const lastId=String(rememberedUser?.username||MiniTalk.Persistence.get(LAST_ID_KEY,"")||"");
    const hasSession=Boolean(rememberedUser?.user_id);
    const topOption=desktop?`<label class="auth-keep-on-top"><input id="authKeepOnTop" type="checkbox" ${keepDefault?"checked":""}><span><strong>로그인 후 항상 위로 유지</strong><small>지원되는 PC·웨일북에서 작은 고정 창으로 열어요.</small></span></label>`:"";
    host.innerHTML=`<section class="auth-card"><div class="auth-brand"><span class="app-mark">M</span><div><strong>모아루</strong><small>대화와 일상을 한곳에</small></div></div><form id="authForm"><h2>로그인</h2><label class="field">아이디<input id="authId" value="${escapeAttribute(lastId)}" autocomplete="username"></label><label class="field">비밀번호<input id="authPw" type="password" autocomplete="current-password" placeholder="${hasSession?"••••••••":"비밀번호"}"></label><label class="field hidden" id="nickField">닉네임<input id="authNick" autocomplete="nickname"></label>${topOption}<button id="loginAction" type="submit" class="button primary">로그인</button><button id="signupToggle" type="button" class="button secondary">회원가입 화면</button><button id="guestAction" type="button" class="button text">게스트로 시작</button></form><small id="authMessage" class="muted auth-message">${hasSession?"저장된 로그인 정보가 있습니다. 로그인 버튼을 누르세요.":""}</small></section>`;

    let signup=false,busy=false;
    const msg=host.querySelector("#authMessage"),form=host.querySelector("#authForm"),login=host.querySelector("#loginAction"),toggle=host.querySelector("#signupToggle"),guest=host.querySelector("#guestAction");
    const setBusy=value=>{busy=value;[login,toggle,guest].forEach(control=>{control.disabled=value})};
    const prepareWindow=async()=>{
      const keep=Boolean(host.querySelector("#authKeepOnTop")?.checked);
      MiniTalk.Persistence.set("window.keepOnTopAfterLogin",keep);
      if(!keep)return;
      msg.textContent="항상 위 창을 준비하는 중...";
      try{await MiniTalk.WindowMode.openForLogin()}catch(error){console.warn("로그인 항상 위 창 전환 실패",error)}
    };

    toggle.onclick=()=>{
      if(busy)return;signup=!signup;
      host.querySelector("#nickField").classList.toggle("hidden",!signup);
      login.textContent=signup?"회원가입":"로그인";
      toggle.textContent=signup?"로그인 화면":"회원가입 화면";
      msg.textContent=""
    };
    form.addEventListener("submit",async event=>{
      event.preventDefault();if(busy)return;
      const id=host.querySelector("#authId").value.trim(),password=host.querySelector("#authPw").value;
      const canReuse=!signup&&rememberedUser?.user_id&&id===String(rememberedUser.username||"")&&!password;
      if(!id||(!password&&!canReuse)){msg.textContent="아이디와 비밀번호를 입력하세요.";return}
      setBusy(true);
      try{
        await prepareWindow();msg.textContent="처리 중...";
        const user=canReuse?rememberedUser:(signup?await MiniTalk.AuthApi.signup(id,password,host.querySelector("#authNick").value.trim()):await MiniTalk.AuthApi.login(id,password));
        if(Number.isFinite(Number(user.coin)))MiniTalk.Economy.CoinWallet?.setLocal?.(Number(user.coin),signup?"signup":"login");
        save(user)
      }catch(error){msg.textContent=error.message||"인증에 실패했습니다.";setBusy(false)}
    });
    guest.onclick=()=>{if(busy)return;setBusy(true);save({user_id:`guest-${crypto.randomUUID().slice(0,8)}`,username:"guest",nickname:"게스트",isGuest:true})};
    setTimeout(()=>host.querySelector(lastId?"#authPw":"#authId")?.focus(),0)
  }

  function escapeAttribute(value){return String(value||"").replace(/[&<>'"]/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[char]))}
  function logout(){MiniTalk.AdminSession?.clear?.();MiniTalk.Realtime.cleanup?.();MiniTalk.Persistence.remove(KEY);rememberedUser=null;location.reload()}
  return{render,restore,logout};
})();
