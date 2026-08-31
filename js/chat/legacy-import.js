/* ============================================================
   기존 토리 대화 가져오기
   - Apps Script의 social_rooms / social_recent_room 응답을 정규화합니다.
   - 가져온 데이터는 Realtime 어댑터가 Firebase에 병합합니다.
   - 이 모듈은 화면이나 Firebase를 직접 수정하지 않습니다.
   ============================================================ */
MiniTalk.Chat = MiniTalk.Chat || {};
MiniTalk.Chat.LegacyImport = (() => {
  const endpoint = () => String(MiniTalkConfig.sheetUrl || "").trim();

  async function post(payload, timeoutMs = 12000) {
    if (!endpoint()) throw new Error("기존 대화 서버 주소가 설정되지 않았습니다.");
    const controller = typeof AbortController === "undefined" ? null : new AbortController();
    const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
    try {
      const body = new URLSearchParams();
      Object.entries(payload || {}).forEach(([key, value]) => body.set(key, String(value ?? "")));
      const response = await fetch(endpoint(), {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
        body,
        signal: controller?.signal
      });
      if (!response.ok) throw new Error(`기존 대화 서버 오류 ${response.status}`);
      const data = await response.json();
      if (!data?.ok) throw new Error(data?.message || data?.error || "기존 대화를 불러오지 못했습니다.");
      return data;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  function safeMemberKey(nickname) {
    const bytes = new TextEncoder().encode(String(nickname || "익명"));
    let value = "";
    bytes.forEach(byte => { value += byte.toString(16).padStart(2, "0"); });
    return `legacy-${value.slice(0, 80) || "anonymous"}`;
  }

  function normalizeRoom(source, currentUser) {
    const id = String(source?.room_id || source?.id || "").trim();
    if (!id) return null;
    const participants = Array.isArray(source.participants) ? source.participants : [];
    const members = {};
    participants.forEach((nickname, index) => {
      const name = String(nickname || "").trim();
      if (!name) return;
      const isCurrent = name === currentUser?.nickname;
      const memberId = isCurrent ? currentUser.user_id : safeMemberKey(name);
      members[memberId] = { user_id: memberId, nickname: name, role: index === 0 ? "owner" : "member", joinedAt: 0 };
    });
    const creatorName = String(source.creator || participants[0] || "").trim();
    const creator = creatorName === currentUser?.nickname ? currentUser.user_id : (creatorName ? safeMemberKey(creatorName) : "");
    return {
      id,
      title: String(source.name || source.title || (id === "global" ? "전체 대화" : "대화방")),
      type: "group",
      creator,
      createdAt: Number(source.created_at || 0),
      updatedAt: Number(source.updated_at || source.created_at || 0),
      lastMessage: "",
      members,
      hasPassword: Boolean(source.has_password),
      legacySource: true,
      legacyPublic: source.is_public !== false
    };
  }

  function stableId(roomId, source) {
    const raw = `${roomId}|${source.user_id || ""}|${source.nickname || ""}|${source.ts || 0}|${source.text || source.message || ""}`;
    let hash = 2166136261;
    for (let i = 0; i < raw.length; i += 1) {
      hash ^= raw.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return `legacy-${(hash >>> 0).toString(36)}-${Number(source.ts || 0).toString(36)}`;
  }

  function normalizeMessage(roomId, source, currentUser) {
    const rawText = String(source?.text ?? source?.message ?? "");
    const image = rawText.match(/^\[\[IMG\]\]\s*(https?:\/\/\S+)/i);
    const file = rawText.match(/^\[\[FILE\]\]\s*(https?:\/\/\S+)(?:\s+(.+))?/i);
    const ts = Number(source?.ts || Date.now());
    const message = {
      id: stableId(roomId, source || {}), roomId,
      user_id: String(source?.user_id || (source?.nickname === currentUser?.nickname ? currentUser.user_id : safeMemberKey(source?.nickname))),
      nickname: String(source?.nickname || "익명"), ts,
      type: image ? "image" : (file ? "file" : "text"),
      text: image ? "[사진]" : (file ? `[파일] ${file[2] || "첨부 파일"}` : rawText),
      imageUrl: image?.[1] || null,
      fileUrl: file?.[1] || null,
      fileName: file?.[2] || null,
      legacySource: true
    };
    return message;
  }

  async function rooms(currentUser) {
    const data = await post({ mode: "social_rooms", nickname: currentUser?.nickname || "" });
    const sourceRooms = Array.isArray(data.rooms) ? data.rooms : [];
    if (!sourceRooms.some(room => String(room?.room_id) === "global")) {
      sourceRooms.unshift({ room_id: "global", name: "전체 대화", is_public: true, participants: [] });
    }
    return sourceRooms.map(room => normalizeRoom(room, currentUser)).filter(Boolean);
  }

  async function messages(roomId, currentUser, limit = 100) {
    const data = await post({
      mode: "social_recent_room", room_id: roomId,
      nickname: currentUser?.nickname || "", limit: Math.min(100, Math.max(1, Number(limit) || 100))
    });
    return (Array.isArray(data.messages) ? data.messages : []).map(message => normalizeMessage(roomId, message, currentUser));
  }

  async function enter(roomId, currentUser, password) {
    return post({
      mode: "social_room_enter", room_id: roomId,
      nickname: currentUser?.nickname || "", password: password || ""
    });
  }

  return { rooms, messages, enter, normalizeRoom, normalizeMessage };
})();
