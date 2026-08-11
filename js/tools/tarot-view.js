/*
 * 오늘의 타로 화면
 * 카드 선택·연출·일일 결과 저장만 담당하며 카드 계산은 js/tarot.js에 위임합니다.
 */
MiniTalk.Tools = MiniTalk.Tools || {};
MiniTalk.Tools.TarotView = (() => {
  const STORAGE_KEY = "tools.tarot.daily";
  const IMAGE_VERSION = "17";
  let activeOverlay = null;
  let drawTimer = null;
  let escapeHandler = null;

  function dateKey(date = new Date()) {
    return [date.getFullYear(), date.getMonth() + 1, date.getDate()]
      .map((value, index) => index === 0 ? String(value) : String(value).padStart(2, "0"))
      .join("-");
  }

  function close() {
    if (drawTimer) clearTimeout(drawTimer);
    drawTimer = null;
    if (escapeHandler) MiniTalk.UI.Dom.doc().removeEventListener("keydown", escapeHandler);
    escapeHandler = null;
    activeOverlay?.remove();
    activeOverlay = null;
  }

  function open() {
    close();
    const D = MiniTalk.UI.Dom;
    const doc = D.doc();
    const user = MiniTalk.Store.get("user") || { user_id: "guest" };
    const date = dateKey();
    const saved = MiniTalk.Persistence.get(STORAGE_KEY, null);
    const overlay = D.el("section", { class: "tarot-overlay", "aria-label": "오늘의 타로" });
    const head = D.el("header", { class: "tarot-game-head" });
    const stage = D.el("div", { class: "tarot-stage" });
    const closeButton = D.el("button", {
      class: "tarot-close",
      type: "button",
      text: "×",
      "aria-label": "타로 닫기",
      onclick: close
    });

    activeOverlay = overlay;
    escapeHandler = event => {
      if (event.key === "Escape") close();
    };
    doc.addEventListener("keydown", escapeHandler);

    head.append(
      D.el("span", { class: "tarot-head-mark", text: "✧" }),
      D.el("strong", { text: "오늘의 타로" }),
      D.el("small", { text: date.replaceAll("-", ".") }),
      closeButton
    );
    overlay.append(head, stage);
    doc.body.append(overlay);

    if (saved?.date === date && saved?.userId === user.user_id && saved?.result) {
      renderResult(stage, saved.result, true);
      return;
    }
    renderDeck(stage, date, user);
  }

  function renderDeck(stage, date, user) {
    const D = MiniTalk.UI.Dom;
    const mascot = D.el("img", {
      class: "tarot-mascot",
      src: "assets/mascot-mini-talk.png",
      alt: "미니톡 마스코트"
    });
    const intro = D.el("div", { class: "tarot-intro" }, [
      D.el("span", { class: "tarot-kicker", text: "DAILY CARD" }),
      D.el("h2", { text: "마음이 가는 카드를 골라보세요" }),
      D.el("p", { class: "muted", text: "세 장 중 한 장을 선택하면 오늘의 카드가 펼쳐집니다." })
    ]);
    const deck = D.el("div", { class: "tarot-deck", "aria-label": "타로 카드 선택" });

    [0, 1, 2].forEach(index => {
      const button = D.el("button", {
        class: "tarot-choice",
        type: "button",
        "aria-label": `${index + 1}번째 타로 카드 선택`
      }, [
        D.el("span", { class: "tarot-card-back" }, [
          D.el("i", { text: "✦" }),
          D.el("b", { text: "M" })
        ])
      ]);
      button.style.setProperty("--card-index", String(index - 1));
      button.style.setProperty("--card-lift", index === 1 ? "0px" : "10px");
      button.onclick = () => draw(button, index, deck, stage, date, user);
      deck.append(button);
    });

    stage.append(
      mascot,
      intro,
      deck,
      D.el("p", { class: "tarot-disclaimer", text: "타로 해석은 재미와 자기 성찰을 위한 콘텐츠예요." })
    );
  }

  function draw(button, choice, deck, stage, date, user) {
    if (deck.classList.contains("is-drawing")) return;
    deck.classList.add("is-drawing");
    button.classList.add("chosen");
    MiniTalk.UI.Dom.all(".tarot-choice", deck).forEach(card => {
      card.disabled = true;
    });

    const result = MiniTalk.Tools.Tarot.draw(date, user.user_id, choice);
    MiniTalk.Persistence.set(STORAGE_KEY, { date, userId: user.user_id, choice, result });
    drawTimer = setTimeout(() => {
      drawTimer = null;
      if (!activeOverlay || !stage.isConnected) return;
      try {
        new Audio("assets/sounds/stamp.mp3").play().catch(() => {});
      } catch (error) {
        console.warn("타로 효과음 재생 실패", error);
      }
      renderResult(stage, result, false);
    }, 720);
  }

  function renderResult(stage, result, returning) {
    const D = MiniTalk.UI.Dom;
    const wrap = D.el("div", { class: `tarot-result ${returning ? "returning" : "fresh"}` });
    const inner = D.el("div", { class: `tarot-reveal-inner ${returning ? "settled" : ""}` }, [
      D.el("div", { class: "tarot-reveal-back", text: "✦" }),
      D.el("img", {
        class: "tarot-card-image",
        src: `assets/tarot/${result.id}.png?v=${IMAGE_VERSION}`,
        alt: `${result.title} 타로 카드`
      })
    ]);
    const visual = D.el("div", {
      class: `tarot-reveal ${result.reversed ? "reversed" : ""}`
    }, [inner]);
    const reading = D.el("div", { class: "tarot-reading" }, [
      D.el("span", {
        class: "tarot-direction",
        text: result.reversed ? "REVERSED · 역방향" : "UPRIGHT · 정방향"
      }),
      D.el("h2", { text: `${result.symbol} ${result.title}` }),
      D.el("p", { class: "tarot-keywords", text: result.keywords }),
      readingBlock("오늘의 흐름", result.meaning, "tarot-message"),
      readingBlock("카드의 조언", result.advice, "tarot-advice"),
      D.el("div", { class: "tarot-lucky" }, [
        D.el("span", { text: `행운 숫자 ${result.luckyNumber}` }),
        D.el("span", { text: `행운 컬러 ${result.color}` })
      ]),
      D.el("small", {
        class: "tarot-disclaimer",
        text: returning
          ? "오늘 뽑은 카드를 다시 보여드렸어요. 내일 새로운 카드를 뽑을 수 있어요."
          : "오늘의 카드는 하루 동안 유지됩니다."
      })
    ]);

    if (!returning) {
      const settle = () => inner.classList.add("settled");
      inner.addEventListener("animationend", settle, { once: true });
      setTimeout(settle, 1100);
    }
    wrap.append(visual, reading);
    stage.replaceChildren(wrap);
  }

  function readingBlock(title, text, className) {
    const D = MiniTalk.UI.Dom;
    return D.el("section", { class: className }, [
      D.el("strong", { text: title }),
      D.el("p", { text })
    ]);
  }

  return { open, close, dateKey };
})();
