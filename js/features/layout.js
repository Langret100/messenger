/*
 * 화면 표시 설정
 * 사용자가 결과를 바로 이해할 수 있는 테마·글자·하단 메뉴·동작 효과만 제공합니다.
 */
MiniTalk.Features.Layout = (() => {
  const KEY = "layout.preferences";
  const UI_VERSION = 3;
  const THEMES = new Set(["dark", "light", "forest"]);
  const NAV_SIZES = new Set(["comfortable", "large"]);
  const MOTIONS = new Set(["full", "reduced"]);
  const FONT_SIZES = new Set([16, 18, 20]);
  const DEFAULT = {
    theme: "light",
    fontSize: 16,
    navSize: "comfortable",
    motion: "full",
    uiVersion: UI_VERSION
  };

  function normalize(value = {}) {
    const fontSize = Number(value.fontSize);
    return {
      theme: THEMES.has(value.theme) ? value.theme : DEFAULT.theme,
      fontSize: FONT_SIZES.has(fontSize) ? fontSize : DEFAULT.fontSize,
      navSize: NAV_SIZES.has(value.navSize) ? value.navSize : DEFAULT.navSize,
      motion: MOTIONS.has(value.motion) ? value.motion : DEFAULT.motion,
      uiVersion: UI_VERSION
    };
  }

  function current() {
    const stored = MiniTalk.Persistence.get(KEY, null);
    if (!stored || stored.uiVersion !== UI_VERSION) {
      // 예전의 작은 12~14px 값과 의미가 불분명한 모서리/밀도 값은 가져오지 않습니다.
      const migrated = normalize({ theme: stored?.theme });
      MiniTalk.Persistence.set(KEY, migrated);
      return migrated;
    }
    return normalize(stored);
  }

  function apply(preferences = current()) {
    const next = normalize(preferences);
    const roots = new Set([
      document.documentElement,
      MiniTalk.Store.get("rootDocument")?.documentElement
    ].filter(Boolean));
    for (const root of roots) {
      root.dataset.theme = next.theme;
      root.dataset.navSize = next.navSize;
      root.dataset.motion = next.motion;
      root.style.setProperty("--font-size", `${next.fontSize}px`);
    }
  }

  function option(value, label) {
    return `<option value="${value}">${label}</option>`;
  }

  function open() {
    const D = MiniTalk.UI.Dom;
    const saved = current();
    const body = D.el("div", { class: "tool-modal-body modal-stack" });
    body.innerHTML = `
      <p class="muted modal-note">읽기 편한 크기와 동작 방식으로 바꿀 수 있습니다.</p>
      <label class="field">화면 색상
        <select id="layoutTheme">
          ${option("light", "라이트")}${option("dark", "다크")}${option("forest", "포레스트")}
        </select>
      </label>
      <label class="field">글자 크기
        <select id="layoutFont">
          ${option(16, "보통")}${option(18, "크게")}${option(20, "매우 크게")}
        </select>
      </label>
      <label class="field">하단 메뉴 크기
        <select id="layoutNavSize">
          ${option("comfortable", "편안하게")}${option("large", "크게")}
        </select>
      </label>
      <label class="field">화면 움직임
        <select id="layoutMotion">
          ${option("full", "부드러운 효과 사용")}${option("reduced", "애니메이션 줄이기")}
        </select>
      </label>
      <small class="muted">설정은 이 기기에 저장되며 다음 실행에도 유지됩니다.</small>
      <div class="button-row">
        <button id="layoutReset" class="button secondary" type="button">권장 설정</button>
        <button id="layoutSave" class="button primary" type="button">적용</button>
      </div>`;

    const fields = {
      theme: body.querySelector("#layoutTheme"),
      fontSize: body.querySelector("#layoutFont"),
      navSize: body.querySelector("#layoutNavSize"),
      motion: body.querySelector("#layoutMotion")
    };
    const fill = value => Object.entries(fields).forEach(([key, field]) => {
      field.value = String(value[key]);
    });
    fill(saved);

    body.querySelector("#layoutReset").onclick = () => fill(DEFAULT);
    body.querySelector("#layoutSave").onclick = () => {
      const next = normalize(Object.fromEntries(
        Object.entries(fields).map(([key, field]) => [key, field.value])
      ));
      MiniTalk.Persistence.set(KEY, next);
      apply(next);
      MiniTalk.UI.Shell.closeModal();
      MiniTalk.UI.Shell.toast("화면 표시 설정을 적용했습니다.");
    };
    MiniTalk.UI.Shell.modal("화면 표시", body);
  }

  apply();
  return { open, apply, current };
})();
