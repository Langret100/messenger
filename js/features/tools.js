/*
 * 도구 허브
 * 이 파일은 메뉴 구성과 모듈 연결만 담당합니다.
 * 실제 기능은 js/tools/* 아래에 있으므로 새 도구도 그 위치에 독립 모듈로 추가하세요.
 */
MiniTalk.Features.Tools = (() => {
  const items = [
    { id: "tarot", icon: "✧", title: "오늘의 타로", description: "카드를 뽑아 보는 운세" },
    { id: "notifications", icon: "♢", title: "알림", description: "소리 · 진동 · 무음" },
    { id: "timer", icon: "◷", title: "타이머", description: "간단한 시간 재기" },
    { id: "alarm", icon: "◉", title: "알람", description: "원하는 시간에 알림" },
    { id: "capture", icon: "▧", title: "화면 캡처", description: "현재 대화에 공유" },
    { id: "layout", icon: "✦", title: "화면 표시", description: "글자·메뉴 크기와 움직임" }
  ];

  /* 분기문을 늘리지 않도록 도구 ID와 실행 모듈을 명시적으로 연결합니다. */
  const actions = {
    tarot: () => MiniTalk.Tools.TarotView.open(),
    notifications: () => MiniTalk.Tools.Notifications.openSettings(),
    timer: () => MiniTalk.Tools.TimerAlarm.openTimer(),
    alarm: () => MiniTalk.Tools.TimerAlarm.openAlarm(),
    capture: () => MiniTalk.Tools.Capture.captureAndSend(),
    layout: () => MiniTalk.Features.Layout.open(),
    profile: () => MiniTalk.Tools.ProfileEditor.open(refreshIfVisible)
  };

  function render(host) {
    const D = MiniTalk.UI.Dom;
    const user = MiniTalk.Store.get("user") || {};
    const profile = MiniTalk.Store.get("profiles")?.[user.user_id] || {};
    const view = D.el("section", { class: "view utility-view view-enter" });
    const list = D.el("div", { class: "card-list tools-screen" });
    const profileCard = D.el("button", {
      class: `profile-summary${user.isGuest ? " guest-profile" : ""}`,
      type: "button",
      ...(user.isGuest ? { disabled: true } : {}),
      onclick: user.isGuest ? null : actions.profile
    });

    profileCard.append(
      MiniTalk.Tools.ProfileEditor.avatarNode(profile, user.nickname, "profile-summary-avatar"),
      D.el("span", { class: "profile-summary-copy" }, [
        D.el("strong", { text: user.nickname || "사용자" }),
        D.el("small", { class: "muted", text: user.isGuest ? "프로필 수정은 로그인 후 이용 가능" : profile.statusMsg || "상태메시지 설정" })
      ]),
      ...(user.isGuest ? [] : [D.el("span", { class: "row-arrow", text: "›" })])
    );

    const grid = D.el("div", { class: "tool-grid modern-tool-grid" });
    items.forEach(item => grid.append(toolButton(item)));
    list.append(
      profileCard,
      sectionLabel("빠른 도구", "자주 쓰는 기능"),
      grid,
      sectionLabel("더보기", "", "compact-section-label"),
      D.el("section", { class: "tool-shortcuts section-card" }, [
        shortcut("▣", "게임", "미니게임 5개", () => MiniTalk.Router.go("games")),
        shortcut("↗", "링크", "자주 쓰는 사이트", () => MiniTalk.Router.go("links"))
      ])
    );
    view.append(list);
    host.replaceChildren(view);
  }

  function sectionLabel(title, description, extraClass = "") {
    const D = MiniTalk.UI.Dom;
    const children = [D.el("strong", { text: title })];
    if (description) children.push(D.el("small", { class: "muted", text: description }));
    return D.el("div", { class: `section-label ${extraClass}`.trim() }, children);
  }

  function toolButton(item) {
    const D = MiniTalk.UI.Dom;
    return D.el("button", {
      class: "tool-button modern-tool",
      type: "button",
      onclick: () => open(item.id)
    }, [
      D.el("span", { class: "tool-glyph", text: item.icon }),
      D.el("span", { class: "tool-label" }, [
        D.el("strong", { text: item.title }),
        D.el("small", { class: "muted", text: item.description })
      ])
    ]);
  }

  function shortcut(icon, title, description, onClick) {
    const D = MiniTalk.UI.Dom;
    return D.el("button", { class: "shortcut-row", type: "button", onclick: onClick }, [
      D.el("span", { class: "shortcut-icon", text: icon }),
      D.el("span", { class: "shortcut-copy" }, [
        D.el("strong", { text: title }),
        D.el("small", { class: "muted", text: description })
      ]),
      D.el("span", { class: "row-arrow", text: "›" })
    ]);
  }

  function open(id) {
    const action = actions[id];
    if (!action) {
      console.warn(`등록되지 않은 도구: ${id}`);
      return;
    }
    return action();
  }

  function refreshIfVisible() {
    if (MiniTalk.Store.get("route") !== "tools") return;
    const host = MiniTalk.UI.Dom.byId("viewHost");
    if (host) render(host);
  }

  function leave() {
    MiniTalk.Tools.TarotView.close();
  }

  return {
    id: "tools",
    title: "도구",
    icon: "✦",
    render,
    leave,
    openTarot: MiniTalk.Tools.TarotView.open,
    notifyIncoming: MiniTalk.Tools.Notifications.notifyIncoming,
    notificationMode: MiniTalk.Tools.Notifications.mode
  };
})();

MiniTalk.Registry.register(MiniTalk.Features.Tools);
