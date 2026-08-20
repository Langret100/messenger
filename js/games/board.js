/*
 * 게임 게시판
 * 토리의 board_list/board_write 규격을 사용하며, 연결 실패 시 로그인 사용자의 글을 기기에 보관합니다.
 */
MiniTalk.Games = MiniTalk.Games || {};
MiniTalk.Games.Board = (() => {
  const STORAGE_KEY = "games.board.local";
  let page = 1;
  const PAGE_SIZE = 8;

  function localPosts() {
    const value = MiniTalk.Persistence.get(STORAGE_KEY, []);
    return Array.isArray(value) ? value : [];
  }

  function saveLocal(post) {
    const posts = localPosts();
    posts.unshift({ ...post, local: true });
    MiniTalk.Persistence.set(STORAGE_KEY, posts.slice(0, 60));
  }

  function normalize(item) {
    return {
      id: String(item.id || item.post_id || crypto.randomUUID()),
      title: String(item.title || item.subject || item.제목 || "(제목 없음)"),
      author: String(item.author || item.writer || item.name || item.이름 || "사용자"),
      content: String(item.content || item.body || item.내용 || ""),
      createdAt: String(item.created_at || item.date || item.날짜 || ""),
      local: Boolean(item.local)
    };
  }

  async function list() {
    const local = localPosts().map(normalize);
    try {
      const url = new URL(MiniTalkConfig.sheetUrl);
      url.searchParams.set("mode", "board_list");
      url.searchParams.set("t", String(Date.now()));
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const json = await response.json();
      const rows = Array.isArray(json.data) ? json.data : Array.isArray(json.items) ? json.items : Array.isArray(json.list) ? json.list : [];
      return { posts: [...local, ...rows.slice().reverse().map(normalize)], online: true };
    } catch (error) {
      console.warn("게시판 불러오기 실패", error);
      return { posts: local, online: false };
    }
  }

  async function persistPost(post) {
    try {
      const body = new URLSearchParams({
        mode: "board_write",
        title: post.title,
        author: post.author,
        content: post.content
      });
      const response = await fetch(MiniTalkConfig.sheetUrl, { method: "POST", body });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const result = await response.json().catch(() => ({ ok: true }));
      if (result?.ok === false) throw new Error(result.error || "게시판 저장 실패");
      return { online: true };
    } catch (error) {
      console.warn("게시판 온라인 저장 실패", error);
      saveLocal(post);
      return { online: false };
    }
  }

  function makePost(title, content, author) {
    const cleanTitle = String(title || "").trim();
    const cleanContent = String(content || "").trim();
    if (!cleanTitle) throw new Error("제목을 입력하세요.");
    if (!cleanContent) throw new Error("내용을 입력하세요.");
    return {
      id: crypto.randomUUID(),
      title: cleanTitle.slice(0, 80),
      author: String(author || "사용자").trim().slice(0, 40) || "사용자",
      content: cleanContent.slice(0, 1200),
      createdAt: new Date().toLocaleString("ko-KR")
    };
  }

  async function write(title, content) {
    const user = MiniTalk.Store.get("user") || {};
    if (!user.user_id || user.isGuest) throw new Error("게스트는 게시글을 볼 수만 있습니다.");
    return persistPost(makePost(title, content, user.nickname || user.username || "게스트"));
  }

  async function writeAuto(title, content, author = "[게임자동기록]") {
    const user = MiniTalk.Store.get("user") || {};
    if (!user.user_id || user.isGuest) return { online: false, skipped: true };
    return persistPost(makePost(title, content, author));
  }

  function open() {
    const D = MiniTalk.UI.Dom;
    const body = D.el("div", { class: "game-community-modal modal-stack" });
    const status = D.el("p", { class: "muted community-status", "aria-live": "polite" });
    const listHost = D.el("div", { class: "board-list" });
    const pageLabel = D.el("span", { class: "board-page-label" });
    const previous = D.el("button", { class: "mini-action", type: "button", text: "‹ 이전" });
    const next = D.el("button", { class: "mini-action", type: "button", text: "다음 ›" });
    const writeButton = D.el("button", { class: "button primary compact-button", type: "button", text: "글쓰기" });
    const reload = D.el("button", { class: "button secondary compact-button", type: "button", text: "새로고침" });
    let posts = [];

    function renderPage() {
      const total = Math.max(1, Math.ceil(posts.length / PAGE_SIZE));
      page = Math.min(Math.max(1, page), total);
      const slice = posts.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
      listHost.replaceChildren();
      if (!slice.length) {
        listHost.append(D.el("div", { class: "empty-state compact-empty" }, [
          D.el("span", { text: "▤" }),
          D.el("strong", { text: "등록된 글이 없어요" }),
          D.el("small", { class: "muted", text: "게임 이야기나 기록을 남겨보세요." })
        ]));
      } else {
        slice.forEach(post => listHost.append(postNode(post)));
      }
      pageLabel.textContent = `${page} / ${total}`;
      previous.disabled = page <= 1;
      next.disabled = page >= total;
    }

    async function load() {
      reload.disabled = true;
      status.hidden = false;
      status.textContent = "게시판을 불러오는 중...";
      try {
        const result = await list();
        posts = result.posts;
        page = 1;
        renderPage();
        status.textContent = result.online ? "" : "연결할 수 없어 이 기기에 저장된 글을 표시합니다.";
        status.hidden = Boolean(result.online);
      } finally {
        reload.disabled = false;
      }
    }

    previous.onclick = () => { page -= 1; renderPage(); };
    next.onclick = () => { page += 1; renderPage(); };
    reload.onclick = load;
    const guest = Boolean(MiniTalk.Store.get("user")?.isGuest);
    writeButton.disabled = guest;
    writeButton.textContent = guest ? "게스트는 보기만 가능" : "글쓰기";
    writeButton.onclick = guest ? null : openWriter;
    body.append(
      D.el("div", { class: "community-toolbar" }, [writeButton, reload]),
      status,
      listHost,
      D.el("div", { class: "board-pagination" }, [previous, pageLabel, next])
    );
    MiniTalk.UI.Shell.modal("게임 게시판", body);
    load();
  }

  function postNode(post) {
    const D = MiniTalk.UI.Dom;
    const content = D.el("p", { class: "board-post-content hidden", text: post.content });
    const button = D.el("button", { class: "board-post", type: "button" }, [
      D.el("span", { class: "board-post-title" }, [
        D.el("strong", { text: post.title }),
        post.local ? D.el("small", { class: "local-badge", text: "기기 저장" }) : null
      ]),
      D.el("small", { class: "muted", text: `${post.author}${post.createdAt ? ` · ${post.createdAt}` : ""}` }),
      content
    ]);
    button.onclick = () => content.classList.toggle("hidden");
    return button;
  }

  function openWriter() {
    const D = MiniTalk.UI.Dom;
    const body = D.el("div", { class: "modal-stack" });
    const title = D.el("input", { maxlength: "80", placeholder: "제목" });
    const content = D.el("textarea", { maxlength: "1200", placeholder: "게임 이야기나 기록을 적어보세요." });
    const save = D.el("button", { class: "button primary", type: "button", text: "등록" });
    save.onclick = async () => {
      save.disabled = true;
      try {
        const result = await write(title.value, content.value);
        MiniTalk.UI.Shell.toast(result.online ? "게시판에 글을 등록했습니다." : "글을 이 기기에 저장했습니다.");
        MiniTalk.UI.Shell.closeModal();
        setTimeout(() => {
          open();
        }, 220);
      } catch (error) {
        MiniTalk.UI.Shell.toast(error.message);
        save.disabled = false;
      }
    };
    body.append(
      D.el("label", { class: "field" }, [D.el("span", { text: "제목" }), title]),
      D.el("label", { class: "field" }, [D.el("span", { text: "내용" }), content]),
      save
    );
    MiniTalk.UI.Shell.modal("게시판 글쓰기", body);
    setTimeout(() => title.focus(), 30);
  }

  return { open, list, write, writeAuto };
})();
