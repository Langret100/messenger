/* 서버가 발급한 ADMIN / SHOP_MANAGER 토큰은 메모리에만 두며 로그아웃·새 실행 시 폐기합니다. */
MiniTalk.AdminSession = (() => {
  let token = "";
  let expiresAt = 0;
  let currentRole = "";

  function currentUser() {
    return MiniTalk.Store.get("user") || {};
  }

  function authorized() {
    return Boolean(token && expiresAt > Date.now() && (currentRole === "ADMIN" || currentRole === "SHOP_MANAGER"));
  }

  function role() {
    return authorized() ? currentRole : "";
  }

  function isAdmin() {
    return role() === "ADMIN";
  }

  function isShopManager() {
    const value = role();
    return value === "ADMIN" || value === "SHOP_MANAGER";
  }

  function requireToken(permission = "ANY") {
    if (!authorized()) throw new Error("설정에서 관리자 인증을 먼저 해주세요.");
    if (permission === "ADMIN" && !isAdmin()) throw new Error("전체 관리자 권한이 필요합니다.");
    if (permission === "SHOP" && !isShopManager()) throw new Error("쇼핑몰 관리자 권한이 필요합니다.");
    return token;
  }

  async function unlock(code) {
    const user = currentUser();
    if (!user.user_id || user.isGuest) throw new Error("로그인 후 관리자 인증을 이용할 수 있어요.");
    const clean = String(code || "");
    if (!clean) throw new Error("관리자 또는 쇼핑몰 관리자 코드를 입력하세요.");
    const result = await MiniTalk.AuthApi.adminUnlock(user.user_id, clean);
    const nextRole = String(result?.role || (result?.admin ? "ADMIN" : result?.shop_manager ? "SHOP_MANAGER" : "")).toUpperCase();
    if (!result?.admin_token || !["ADMIN", "SHOP_MANAGER"].includes(nextRole)) throw new Error("관리자 인증에 실패했습니다.");
    token = String(result.admin_token);
    currentRole = nextRole;
    expiresAt = Date.now() + Math.max(60, Number(result.expires_in) || 21600) * 1000;
    MiniTalk.Store.set("admin", nextRole === "ADMIN");
    MiniTalk.Store.set("shopManager", nextRole === "SHOP_MANAGER");
    return nextRole;
  }

  function clear() {
    token = "";
    currentRole = "";
    expiresAt = 0;
    MiniTalk.Store.set("admin", false);
    MiniTalk.Store.set("shopManager", false);
  }

  return { unlock, clear, authorized, requireToken, role, isAdmin, isShopManager, token: requireToken };
})();
