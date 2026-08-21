/*
 * 도구 허브
 * 이 파일은 메뉴 구성과 모듈 연결만 담당합니다.
 * 실제 기능은 js/tools/* 아래에 있으므로 새 도구도 그 위치에 독립 모듈로 추가하세요.
 */
MiniTalk.Features.Tools = (() => {
  let activeDragList = null;
  const items = [
    { id: "tarot", icon: "✧", title: "오늘의 타로", description: "카드를 뽑아 보는 운세" },
    { id: "alarm", icon: "◉", title: "알람", description: "원하는 시간에 알림" },
    { id: "lookalike", icon: "◌", title: "닮은 생물 찾기", description: "3·2·1 찍고 닮은 동식물 보기" },
    { id: "face-toy", icon: "☺", title: "페이스 체인지", description: "찍고 바꾸고 크게 놀기" },
    { id: "timetable", icon: "▦", title: "오늘의 시간표", description: "이미지로 함께 갱신" },
    { id: "lunch", icon: "☰", title: "오늘의 급식표", description: "TXT에서 오늘 급식 보기" }
  ];

  /* 분기문을 늘리지 않도록 도구 ID와 실행 모듈을 명시적으로 연결합니다. */
  const actions = {
    tarot: () => MiniTalk.Tools.TarotView.open(),
    alarm: () => MiniTalk.Tools.TimerAlarm.openAlarm(),
    profile: () => MiniTalk.Tools.ProfileEditor.open(refreshIfVisible),
    timetable: () => MiniTalk.Tools.ClassInfo.openTimetable(),
    lunch: () => MiniTalk.Tools.ClassInfo.openLunch(),
    "face-toy": () => MiniTalk.Tools.FaceToy.open(refreshIfVisible),
    lookalike: () => MiniTalk.Tools.LookalikePlay.open(refreshIfVisible)
  };

  function render(host) {
    if(activeDragList){MiniTalk.UI.DragScroll?.unbind?.(activeDragList);activeDragList=null}
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
        shortcut("↗", "관련 링크", "자주 쓰는 사이트와 놀이", () => MiniTalk.Router.go("links"))
      ])
    );
    view.append(list);
    host.replaceChildren(view);
    // 과제탭과 같은 공용 pointer 드래그 경로를 사용합니다.
    // 도구 화면은 대부분 버튼/링크이므로 해당 요소 위에서도 세로 드래그만 허용합니다.
    MiniTalk.UI.DragScroll?.bind?.(list,{allowInteractive:".profile-summary,.modern-tool,.shortcut-row"});
    activeDragList=list;
  }

  function sectionLabel(title, description, extraClass = "") {
    const D = MiniTalk.UI.Dom;
    const children = [D.el("strong", { text: title })];
    if (description) children.push(D.el("small", { class: "muted", text: description }));
    return D.el("div", { class: `section-label ${extraClass}`.trim() }, children);
  }

  function toolButton(item) {
    const D = MiniTalk.UI.Dom;
    const linked = Boolean(item.url);
    return D.el(linked ? "a" : "button", {
      class: "tool-button modern-tool",
      ...(linked ? { href: item.url, target: "_blank", rel: "noopener noreferrer", "aria-label": `${item.title} 새 창으로 열기` } : { type: "button", onclick: () => open(item.id) })
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
    if(activeDragList){MiniTalk.UI.DragScroll?.unbind?.(activeDragList);activeDragList=null}
    MiniTalk.Tools.FaceToy?.dispose?.();
    MiniTalk.Tools.LookalikePlay?.dispose?.();
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
    notifyRoomInvite: MiniTalk.Tools.Notifications.notifyRoomInvite,
    notificationMode: MiniTalk.Tools.Notifications.mode
  };
})();

MiniTalk.Registry.register(MiniTalk.Features.Tools);
