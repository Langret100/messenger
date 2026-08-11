/* 인증 기능. 로그인 화면과 세션 복원만 담당합니다. */
MiniTalk.Features=MiniTalk.Features||{};
MiniTalk.Features.Auth=(()=>{
  const KEY="session.user";
  function save(u){MiniTalk.Persistence.set(KEY,u);MiniTalk.Store.set("user",u);MiniTalk.Events.emit("auth:success",u)}
  function restore(){const u=MiniTalk.Persistence.get(KEY);if(u?.user_id)MiniTalk.Store.set("user",u);return u}
  function render(host){
    host.classList.remove("hidden");
    host.innerHTML=`<section class="auth-card"><h2>로그인</h2><label class="field">아이디<input id="authId" autocomplete="username"></label><label class="field">비밀번호<input id="authPw" type="password" autocomplete="current-password"></label><label class="field hidden" id="nickField">닉네임<input id="authNick"></label><button id="loginAction" class="button primary">로그인</button><button id="signupToggle" class="button secondary">회원가입 화면</button><button id="guestAction" class="button text">게스트로 시작</button><small id="authMessage" class="muted"></small></section>`;
    let signup=false,busy=false;
    const msg=host.querySelector("#authMessage"),login=host.querySelector("#loginAction"),toggle=host.querySelector("#signupToggle"),guest=host.querySelector("#guestAction");
    const setBusy=value=>{busy=value;login.disabled=value;toggle.disabled=value;guest.disabled=value};
    toggle.onclick=()=>{if(busy)return;signup=!signup;host.querySelector("#nickField").classList.toggle("hidden",!signup);login.textContent=signup?"회원가입":"로그인";toggle.textContent=signup?"로그인 화면":"회원가입 화면"};
    login.onclick=async()=>{if(busy)return;setBusy(true);try{msg.textContent="처리 중...";const id=host.querySelector("#authId").value.trim(),pw=host.querySelector("#authPw").value;if(!id||!pw)throw new Error("아이디와 비밀번호를 입력하세요.");const u=signup?await MiniTalk.AuthApi.signup(id,pw,host.querySelector("#authNick").value.trim()):await MiniTalk.AuthApi.login(id,pw);save(u)}catch(e){msg.textContent=e.message||"인증에 실패했습니다.";setBusy(false)}};
    guest.onclick=()=>{if(busy)return;setBusy(true);save({user_id:`guest-${crypto.randomUUID().slice(0,8)}`,username:"guest",nickname:"게스트",isGuest:true})};
  }
  function logout(){MiniTalk.AdminSession?.clear?.();MiniTalk.Realtime.cleanup?.();MiniTalk.Persistence.remove(KEY);location.reload()}
  return{render,restore,logout};
})();
