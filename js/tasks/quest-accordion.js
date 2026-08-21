/* 수학·국어 퀘스트가 공유하는 접이식 과목 카드 */
MiniTalk.Tasks = MiniTalk.Tasks || {};
MiniTalk.Tasks.QuestAccordion = (() => {
  let activeKey = null;

  function active() { return activeKey; }

  function applyState(doc = MiniTalk.UI.Dom.doc()) {
    doc?.querySelectorAll?.(".quest-accordion[data-subject]").forEach(section => {
      const key = section.dataset.subject || "";
      const open = activeKey === key;
      section.classList.toggle("expanded", open);
      section.querySelector(".quest-accordion-toggle")?.setAttribute("aria-expanded", String(open));
      section.querySelector(".quest-accordion-panel")?.classList.toggle("hidden", !open);
    });
    doc?.querySelectorAll?.('.friday-mission-card[data-quest-key="weekly"]').forEach(card => {
      const compact = Boolean(activeKey && activeKey !== "weekly");
      card.classList.toggle("quest-compact", compact);
      card.classList.toggle("quest-focused", activeKey === "weekly");
    });
  }

  function activate(key) {
    const normalized = String(key || "");
    activeKey = activeKey === normalized ? null : normalized;
    applyState();
    MiniTalk.Events?.emit?.("quest:accordion-change", { activeKey });
    return activeKey;
  }

  function wrap({ subject, icon, title, subtitle, completed, total, content }) {
    const D = MiniTalk.UI.Dom;
    const subjectDone = total > 0 && completed >= total;
    const section = D.el("section", { class: `quest-accordion section-card${subjectDone ? " completed" : ""}`, "data-subject": subject });
    const panelId = `quest-panel-${subject}`;
    const toggle = D.el("button", {
      class: "quest-accordion-toggle",
      type: "button",
      "data-no-drag-scroll": "true",
      "aria-expanded": "false",
      "aria-controls": panelId
    }, [
      D.el("span", { class: "quest-subject-icon", text: icon }),
      D.el("span", { class: "quest-subject-copy" }, [
        D.el("strong", { text: title }),
        D.el("small", { text: subtitle })
      ]),
      D.el("span", { class: `quest-subject-progress${subjectDone ? " completed" : ""}`, text: subjectDone ? "완료" : `${completed}/${total}` }),
      ...(subjectDone ? [D.el("img", { class: "quest-subject-stamp", src: "assets/ui/quest-stamp.png", alt: "과목 완료 도장" })] : []),
      D.el("span", { class: "quest-accordion-arrow", text: "⌄", "aria-hidden": "true" })
    ]);
    const initiallyOpen = activeKey === subject;
    toggle.setAttribute("aria-expanded", String(initiallyOpen));
    section.classList.toggle("expanded", initiallyOpen);
    const panel = D.el("div", { id: panelId, class: `quest-accordion-panel${initiallyOpen ? "" : " hidden"}` }, [content]);

    toggle.onclick = event => {
      event.preventDefault();
      event.stopPropagation();
      const wasOpen = activeKey === subject;
      activate(subject);
      if (!wasOpen) requestAnimationFrame(() => section.scrollIntoView({ block: "nearest", behavior: "auto" }));
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

  return { wrap, celebrate, active, activate, applyState };
})();
