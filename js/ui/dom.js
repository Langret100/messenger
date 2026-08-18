/* 현재 문서(Document PiP 포함)를 기준으로 안전하게 DOM을 생성·조회합니다. */
function createMiniTalkElement(doc, tag, attributes = {}, children = []) {
  const element = doc.createElement(tag);
  Object.entries(attributes).forEach(([key, value]) => {
    if (value == null || value === false) return;
    if (key === "class") {
      element.className = value;
    } else if (key === "text") {
      element.textContent = value;
    } else if (key.startsWith("on") && typeof value === "function") {
      element.addEventListener(key.slice(2), value);
    } else if (["value", "checked", "disabled"].includes(key)) {
      element[key] = value;
    } else if (value === true) {
      element.setAttribute(key, "");
    } else {
      element.setAttribute(key, value);
    }
  });
  [].concat(children).filter(Boolean).forEach(child => element.append(child));
  return element;
}

MiniTalk.UI.Dom = {
  doc() {
    return MiniTalk.Store.get("rootDocument") || document;
  },

  byId(id) {
    return this.doc().getElementById(id);
  },

  one(selector, root) {
    return (root || this.doc()).querySelector(selector);
  },

  all(selector, root) {
    return [...(root || this.doc()).querySelectorAll(selector)];
  },

  /* 별도 관리자 창처럼 동일 앱에서 두 Document를 동시에 쓸 때 사용합니다. */
  forDocument(doc) {
    const target = doc || this.doc();
    return {
      doc: () => target,
      byId: id => target.getElementById(id),
      one: (selector, root) => (root || target).querySelector(selector),
      all: (selector, root) => [...(root || target).querySelectorAll(selector)],
      el: (tag, attributes = {}, children = []) => createMiniTalkElement(target, tag, attributes, children)
    };
  },

  /*
   * text는 textContent로 처리해 사용자 문자열이 HTML로 실행되지 않게 합니다.
   * value/checked/disabled는 속성이 아닌 DOM 프로퍼티로 설정해야 현재 값이 정확합니다.
   */
  el(tag, attributes = {}, children = []) {
    return createMiniTalkElement(this.doc(), tag, attributes, children);
  }
};
