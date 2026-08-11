/* Firebase가 원본이며, Google Sheet에는 읽지 않는 비동기 백업만 전송합니다. */
MiniTalk.Chat.ServerBackup = (() => {
  function post(mode, payload) {
    if (MiniTalk.Realtime.getMode() !== "firebase") return false;
    const body = new URLSearchParams({ mode });
    Object.entries(payload || {}).forEach(([key, value]) => body.set(key, String(value ?? "")));
    fetch(MiniTalkConfig.sheetUrl, { method: "POST", mode: "no-cors", keepalive: true, body })
      .catch(error => console.warn("대화 시트 백업 실패", error));
    return true;
  }

  function room(event, room) {
    const user = MiniTalk.Store.get("user") || {};
    const members = Object.values(room?.members || {}).map(member => ({ user_id: member.user_id, nickname: member.nickname, role: member.role }));
    return post("mini_talk_room_backup", {
      event,
      actor_user_id: user.user_id,
      room_id: room?.id,
      title: room?.title,
      creator: room?.creator,
      members_json: JSON.stringify(members),
      updated_at: room?.updatedAt || Date.now()
    });
  }

  function message(message) {
    return post("mini_talk_message_backup", {
      message_id: message?.id,
      room_id: message?.roomId,
      user_id: message?.user_id,
      nickname: message?.nickname,
      message_type: message?.type,
      text: String(message?.text || "").slice(0, 2000),
      image_url: /^https?:/.test(String(message?.imageUrl || "")) ? message.imageUrl : "",
      file_url: /^https?:/.test(String(message?.fileUrl || "")) ? message.fileUrl : "",
      file_name: message?.fileName,
      sent_at: message?.ts || Date.now()
    });
  }

  return { room, message };
})();
