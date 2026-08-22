/* PC/Chromebook 전용 카메라 도구 진입점.
   이 문서는 부모의 load/postMessage 이벤트에 의존하지 않고 스스로 도구를 마운트한다. */
(() => {
  const root = document.getElementById("cameraToolRoot");
  const params = new URLSearchParams(location.search);
  const toolId = params.get("tool") || "";
  let module = null;
  let disposed = false;

  function showError(message) {
    if (!root) return;
    root.innerHTML = "";
    const box = document.createElement("section");
    box.className = "camera-tool-loading camera-tool-error";
    const text = document.createElement("p");
    text.textContent = message || "카메라 도구를 열지 못했어요.";
    const close = document.createElement("button");
    close.type = "button";
    close.className = "button secondary";
    close.textContent = "창 닫기";
    close.onclick = () => window.close();
    box.append(text, close);
    root.append(box);
  }

  function cleanup() {
    if (disposed) return;
    disposed = true;
    try { module?.dispose?.(); } catch {}
  }

  async function boot() {
    if (!root) return;
    let owner = null;
    try {
      owner = window.opener;
      if (!owner || owner.closed || owner.location.origin !== location.origin) {
        showError("모아루에서 다시 열어 주세요.");
        return;
      }
    } catch {
      showError("모아루와 연결할 수 없어요. 모아루에서 다시 열어 주세요.");
      return;
    }

    const app = owner.MiniTalk;
    module = toolId === "face-toy" ? app?.Tools?.FaceToy
      : toolId === "lookalike" ? app?.Tools?.LookalikePlay
      : null;

    if (!module?.open) {
      showError("카메라 기능을 불러오지 못했어요. 모아루를 새로고침한 뒤 다시 열어 주세요.");
      return;
    }

    document.title = toolId === "lookalike" ? "닮은 생물 찾기" : "페이스 체인지";
    root.replaceChildren();
    try {
      await module.open(() => window.close(), { host: root, doc: document, separate: true });
    } catch (error) {
      console.error("카메라 도구 실행 실패", error);
      showError("카메라 도구를 여는 중 오류가 생겼어요.");
    }
  }

  addEventListener("pagehide", cleanup, { once: true });
  boot();
})();
