/*
 * 화면 라우터
 * 이전 화면을 정리한 뒤 다음 화면을 렌더합니다.
 * navigationId는 늦게 끝난 비동기 렌더가 최신 화면을 덮는 경쟁 상태를 막습니다.
 */
MiniTalk.Router = (() => {
  let navigationId = 0;
  let currentFeature = null;

  async function go(id, params = {}) {
    const requestId = ++navigationId;
    const feature = MiniTalk.Registry.get(id);
    if (!feature) throw new Error(`없는 화면: ${id}`);

    if (currentFeature && currentFeature !== feature) {
      try {
        await currentFeature.leave?.();
      } catch (error) {
        console.warn("화면 종료 처리 실패", error);
      }
    }
    if (requestId !== navigationId) return false;

    currentFeature = feature;
    MiniTalk.Store.set("route", id);
    MiniTalk.UI.Shell.setActiveNav(id);
    MiniTalk.UI.Shell.setHeader(feature.title || MiniTalkConfig.appName, feature.actions?.() || []);

    const host = MiniTalk.UI.Dom.byId("viewHost");
    if (!host) return false;
    host.replaceChildren();
    await feature.render(host, params);
    return requestId === navigationId;
  }

  return {
    go,
    current: () => currentFeature?.id || null
  };
})();
