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
    { id: "lookalike", icon: "?", title: "닮은 생물 찾기", description: "3·2·1 찍고 닮은 동식물 보기" },
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
    "face-toy": () => openCameraTool(MiniTalk.Tools.FaceToy, "페이스 체인지"),
    lookalike: () => openCameraTool(MiniTalk.Tools.LookalikePlay, "닮은 생물 찾기")
  };


  let cameraToolPopup = null;
  let cameraToolModule = null;

  function mobileCameraTool() {
    if (MiniTalk.MobileImmersive?.isMobile?.()) return true;
    const ua = navigator.userAgent || "";
    return /Android|iPhone|iPad|iPod|Mobile/i.test(ua) && !/CrOS/i.test(ua);
  }

  function cameraPopupBounds(sourceView) {
    const scr = sourceView.screen || {}, availLeft = Number(scr.availLeft) || 0, availTop = Number(scr.availTop) || 0;
    const availWidth = Math.max(640, Number(scr.availWidth) || 1280), availHeight = Math.max(520, Number(scr.availHeight) || 800), gap = 42;
    const messengerLeft = Number(sourceView.screenX ?? sourceView.screenLeft) || availLeft, messengerTop = Number(sourceView.screenY ?? sourceView.screenTop) || availTop;
    const messengerW = Math.max(320, Number(sourceView.outerWidth) || Math.min(520, availWidth * .42)), messengerH = Math.max(420, Number(sourceView.outerHeight) || availHeight * .8);
    const rightStart = Math.min(availLeft + availWidth, messengerLeft + messengerW + gap), rightSpace = Math.max(0, availLeft + availWidth - rightStart), leftSpace = Math.max(0, messengerLeft - gap - availLeft);
    const bottomStart = Math.min(availTop + availHeight, messengerTop + messengerH + gap), bottomSpace = Math.max(0, availTop + availHeight - bottomStart), topSpace = Math.max(0, messengerTop - gap - availTop);
    const desiredWidth = Math.min(1040, Math.max(760, Math.round(availWidth * .62))), desiredHeight = Math.min(860, Math.max(650, Math.round(availHeight * .84)));
    const minSideWidth = Math.min(680, Math.max(540, Math.round(availWidth * .36)));
    let width, height, left, top;
    if (Math.max(rightSpace, leftSpace) >= minSideWidth) {
      const useRight = rightSpace >= leftSpace, space = useRight ? rightSpace : leftSpace;
      width = Math.min(desiredWidth, space); height = Math.min(desiredHeight, availHeight - 24); left = useRight ? rightStart : messengerLeft - gap - width;
      top = Math.max(availTop + 8, Math.min(messengerTop, availTop + availHeight - height - 8));
    } else if (Math.max(bottomSpace, topSpace) >= 500) {
      const useBottom = bottomSpace >= topSpace; width = Math.min(desiredWidth, availWidth - 24); height = Math.min(desiredHeight, useBottom ? bottomSpace : topSpace);
      left = Math.max(availLeft + 8, Math.min(messengerLeft, availLeft + availWidth - width - 8)); top = useBottom ? bottomStart : messengerTop - gap - height;
    } else {
      width = Math.min(Math.max(680, Math.round(availWidth * .64)), availWidth - 24); height = Math.min(desiredHeight, availHeight - 24);
      left = (messengerLeft + messengerW / 2) <= (availLeft + availWidth / 2) ? availLeft + availWidth - width - 8 : availLeft + 8;
      top = Math.max(availTop + 8, Math.min(messengerTop, availTop + availHeight - height - 8));
    }
    return { width: Math.round(Math.max(560, width)), height: Math.round(Math.max(600, height)), left: Math.round(left), top: Math.round(top) };
  }

  function enforceCameraPopupBounds(win, bounds) {
    const apply = () => { try { win.resizeTo(bounds.width, bounds.height); win.moveTo(bounds.left, bounds.top); } catch {} };
    apply(); setTimeout(apply, 80); setTimeout(apply, 260);
  }

  function cameraToolUrl(toolId, token) {
    try {
      const url = new URL("camera-tool.html", document.baseURI || location.href);
      url.searchParams.set("tool", toolId || "camera");
      url.searchParams.set("token", token || "");
      return url.href;
    } catch {
      return `camera-tool.html?tool=${encodeURIComponent(toolId || "camera")}&token=${encodeURIComponent(token || "")}`;
    }
  }

  function cameraToolId(module) {
    if (module === MiniTalk.Tools.FaceToy) return "face-toy";
    if (module === MiniTalk.Tools.LookalikePlay) return "lookalike";
    return "camera";
  }

  function openCameraTool(module, title) {
    if (!module?.open) return;
    if (mobileCameraTool()) return module.open(refreshIfVisible);

    if (cameraToolPopup && !cameraToolPopup.closed) {
      if (cameraToolModule === module) { try { cameraToolPopup.focus(); } catch {} return; }
      try { cameraToolModule?.dispose?.(); cameraToolPopup.close(); } catch {}
    }

    /*
     * PC/Chromebook은 camera-tool.html이 자기 자신을 부팅한다.
     * 부모가 새창의 load/postMessage 타이밍을 붙잡아 UI를 주입하는 구조를 사용하지 않는다.
     * tools.js는 팝업 생성과 크기/위치만 맡고, 실제 도구 마운트는 camera-tool.js가
     * 같은 origin의 opener에 있는 모듈을 가져와 새 문서에 직접 실행한다.
     */
    const sourceDoc = MiniTalk.UI.Dom.doc();
    const sourceView = sourceDoc.defaultView || window;
    const bounds = cameraPopupBounds(sourceView);
    const toolId = cameraToolId(module);
    const url = cameraToolUrl(toolId, "");
    let popup = null;

    try {
      /* 반드시 원래 앱 window가 opener가 되게 한다. Document PiP window를 opener로 쓰지 않는다. */
      popup = window.open(
        url,
        "MoaruCameraPlay",
        `popup=yes,toolbar=no,location=no,menubar=no,status=no,scrollbars=no,resizable=yes,width=${bounds.width},height=${bounds.height},left=${bounds.left},top=${bounds.top}`
      );
    } catch {}

    if (!popup) return module.open(refreshIfVisible);
    cameraToolPopup = popup;
    cameraToolModule = module;
    enforceCameraPopupBounds(popup, bounds);
    try { popup.focus(); } catch {}
  }

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
    if (!MiniTalk.Tools.FaceToy?.isSeparate?.()) MiniTalk.Tools.FaceToy?.dispose?.();
    if (!MiniTalk.Tools.LookalikePlay?.isSeparate?.()) MiniTalk.Tools.LookalikePlay?.dispose?.();
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
