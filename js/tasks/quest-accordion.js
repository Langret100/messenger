/* 수학·국어 퀘스트가 공유하는 접이식 과목 카드 */
MiniTalk.Tasks = MiniTalk.Tasks || {};
MiniTalk.Tasks.QuestAccordion = (() => {
  function wrap({ subject, icon, title, subtitle, completed, total, content }) {
    const D = MiniTalk.UI.Dom;
    const section = D.el("section", { class: "quest-accordion section-card", "data-subject": subject });
    const panelId = `quest-panel-${subject}`;
    const toggle = D.el("button", {
      class: "quest-accordion-toggle",
      type: "button",
      "aria-expanded": "false",
      "aria-controls": panelId
    }, [
      D.el("span", { class: "quest-subject-icon", text: icon }),
      D.el("span", { class: "quest-subject-copy" }, [
        D.el("strong", { text: title }),
        D.el("small", { text: subtitle })
      ]),
      D.el("span", { class: "quest-subject-progress", text: `${completed}/${total}` }),
      D.el("span", { class: "quest-accordion-arrow", text: "⌄", "aria-hidden": "true" })
    ]);
    const panel = D.el("div", { id: panelId, class: "quest-accordion-panel hidden" }, [content]);

    toggle.onclick = () => {
      const opening = toggle.getAttribute("aria-expanded") !== "true";
      D.all(".quest-accordion.expanded").forEach(item => {
        if (item === section) return;
        item.classList.remove("expanded");
        item.querySelector(".quest-accordion-toggle")?.setAttribute("aria-expanded", "false");
        item.querySelector(".quest-accordion-panel")?.classList.add("hidden");
      });
      section.classList.toggle("expanded", opening);
      toggle.setAttribute("aria-expanded", String(opening));
      panel.classList.toggle("hidden", !opening);
      if (opening) requestAnimationFrame(() => section.scrollIntoView({ block: "nearest", behavior: "smooth" }));
    };

    section.append(toggle, panel);
    return section;
  }

  /* 정답마다 도장이 화면 중앙에 찍힌 뒤 다음 문제로 넘어갑니다. */
  function celebrate(container, onFinished) {
    const D = MiniTalk.UI.Dom;
    const layer = D.el("div", { class: "quest-correct-celebration", role: "status", "aria-live": "assertive" }, [
      D.el("img", { src: "assets/ui/quest-stamp.png", alt: "정답 도장" }),
      D.el("strong", { text: "정답!" }),
      D.el("span", { text: "참 잘했어요" })
    ]);
    container.append(layer);
    try { new Audio("assets/sounds/stamp.mp3").play().catch(() => {}); }
    catch (error) { console.warn("퀘스트 정답 효과음 재생 실패", error); }
    setTimeout(() => {
      layer.classList.add("leaving");
      setTimeout(() => { layer.remove(); onFinished?.(); }, 180);
    }, 820);
  }

  return { wrap, celebrate };
})();
