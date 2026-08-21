/* 화면 기능 등록소. 같은 ID의 기능이 조용히 덮어써지는 것을 차단합니다. */
MiniTalk.Registry = (() => {
  const features = [];

  function register(feature) {
    if (!feature?.id) throw new Error("기능 ID가 필요합니다.");
    if (features.some(item => item.id === feature.id)) {
      throw new Error(`중복 기능 ID: ${feature.id}`);
    }
    features.push(feature);
    try { MiniTalk.Events?.emit?.("registry:changed", { id: feature.id }); } catch (_) {}
    return feature;
  }

  function all() {
    return features.slice();
  }

  function get(id) {
    return features.find(feature => feature.id === id);
  }

  return { register, all, get };
})();
