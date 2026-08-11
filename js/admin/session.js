/* 서버가 발급한 관리자 토큰은 메모리에만 두며 로그아웃·새 실행 시 폐기합니다. */
MiniTalk.AdminSession = (() => {
  let token = "";
  let expiresAt = 0;

  function currentUser() {
    return MiniTalk.Store.get("user") || {};
  }

  function authorized() {
    return Boolean(token && expiresAt > Date.now() && MiniTalk.Store.get("admin") === true);
  }

  function requireToken() {
    if (!authorized()) throw new Error("설정에서 관리자 인증을 먼저 해주세요.");
    return token;
  }

  async function unlock(code) {
    const user = currentUser();
    if (!user.user_id || user.isGuest) throw new Error("로그인 후 관리자 인증을 이용할 수 있어요.");
    const clean = String(code || "");
    if (!clean) throw new Error("관리자 고유 코드를 입력하세요.");
    const result = await MiniTalk.AuthApi.adminUnlock(user.user_id, clean);
    if (!result.admin || !result.admin_token) throw new Error("관리자 인증에 실패했습니다.");
    token = String(result.admin_token);
    expiresAt = Date.now() + Math.max(60, Number(result.expires_in) || 21600) * 1000;
    MiniTalk.Store.set("admin", true);
    return true;
  }

  function clear() {
    token = "";
    expiresAt = 0;
    MiniTalk.Store.set("admin", false);
  }

  return { unlock, clear, authorized, requireToken, token: requireToken };
})();
