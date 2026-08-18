/* 관리자 지정 과제의 서버 동기화와 제출·검토 API를 한곳에서 관리합니다. */
MiniTalk.Tasks = MiniTalk.Tasks || {};
MiniTalk.Tasks.TaskService = (() => {
  const COMPLETED_VISIBLE_MS = 2 * 24 * 60 * 60 * 1000;
  let activeUserId = "", pollTimer = 0, inFlight = null, adminInFlight = null;

  const user = () => MiniTalk.Store.get("user") || {};
  const normalize = (task = {}) => ({
    ...task,
    id: String(task.id || ""),
    userId: String(task.userId || task.user_id || ""),
    nickname: String(task.nickname || ""),
    title: String(task.title || "과제").slice(0, 80),
    description: String(task.description || "").slice(0, 1000),
    answer: String(task.answer || "").slice(0, 1000),
    feedback: String(task.feedback || "").slice(0, 100),
    imageData: String(task.imageData || task.image_data || ""),
    rewardCoin: Math.max(0, Math.floor(Number(task.rewardCoin ?? task.reward_coin) || 0)),
    status: ["open", "submitted", "retry", "completed"].includes(task.status) ? task.status : "open",
    createdAt: Number(task.createdAt || task.created_at) || 0,
    submittedAt: Number(task.submittedAt || task.submitted_at) || 0,
    completedAt: Number(task.completedAt || task.completed_at) || 0,
    updatedAt: Number(task.updatedAt || task.updated_at) || 0,
    newCoin: Number(task.newCoin || task.new_coin) || 0
  });

  function visible(task, now = Date.now()) {
    return task.status !== "completed" || !task.completedAt || now - task.completedAt < COMPLETED_VISIBLE_MS;
  }

  function publish(rows) {
    const map = {}, now = Date.now();
    (rows || []).map(normalize).filter(task => task.id && visible(task, now)).forEach(task => { map[task.id] = task; });
    MiniTalk.Store.set("tasks", map);
    MiniTalk.Events.emit("rt:tasks", map);
    return Object.values(map);
  }

  async function refresh(force = false) {
    const current = user();
    if (!current.user_id || current.isGuest) return publish([]);
    if (inFlight && !force) return inFlight;
    inFlight = MiniTalk.AuthApi.userTaskList(current.user_id).then(publish).finally(() => { inFlight = null; });
    return inFlight;
  }

  function start(current = user()) {
    if (!current.user_id || current.isGuest) { publish([]);return; }
    if (activeUserId !== current.user_id) { clearInterval(pollTimer);pollTimer = 0;activeUserId = current.user_id; }
    refresh(true).catch(error => console.warn("과제 목록을 불러오지 못했습니다.", error));
    if (!pollTimer) pollTimer = setInterval(() => refresh(true).catch(() => {}), 12000);
  }

  async function submit(taskId, answer, imageData = "") {
    const current = user(), text = String(answer || ""), image = String(imageData || "");
    if (!current.user_id || current.isGuest) throw new Error("로그인 후 과제를 제출할 수 있어요.");
    if (text.length > 1000) throw new Error("제출 내용은 1,000자 이하로 입력하세요.");
    if (!text.trim() && !image) throw new Error("제출 내용이나 이미지를 입력하세요.");
    const result = await MiniTalk.AuthApi.userTaskSubmit({ userId: current.user_id, taskId, answer: text, imageData: image });
    await refresh(true);
    return normalize(result.task || {});
  }

  async function assign(targets, task) {
    const current = user();
    const result = await MiniTalk.AuthApi.adminTaskAssign({ userId: current.user_id, adminToken: MiniTalk.AdminSession.requireToken(), targets, title: task.title, description: task.description, rewardCoin: task.rewardCoin });
    await MiniTalk.Realtime.notifyCommandTargets?.(targets);
    return result;
  }

  async function adminList(force = false) {
    const current = user();
    if (adminInFlight && !force) return adminInFlight;
    adminInFlight = MiniTalk.AuthApi.adminTaskList(current.user_id, MiniTalk.AdminSession.requireToken()).then(rows => rows.map(normalize).filter(task => visible(task))).finally(() => { adminInFlight = null; });
    return adminInFlight;
  }

  async function review(taskId, action, feedback = "") {
    const current = user();
    const result = await MiniTalk.AuthApi.adminTaskReview({ userId: current.user_id, adminToken: MiniTalk.AdminSession.requireToken(), taskId, action, feedback });
    const task = normalize(result.task || {});
    if (task.userId) await MiniTalk.Realtime.notifyCommandTargets?.([task.userId]);
    return task;
  }

  MiniTalk.Events.on("rt:command", command => {
    if (!/^TASK_(?:ASSIGNED|RETRY|COMPLETED)$/.test(String(command?.type || ""))) return;
    refresh(true).catch(() => {});
    const payload = command.payload || {};
    if (command.type === "TASK_ASSIGNED") MiniTalk.Tools.Notifications?.notifyTask?.("새 과제가 도착했어요", `${payload.title || "과제"} · 🪙 +${Number(payload.rewardCoin) || 0}`);
    if (command.type === "TASK_RETRY") MiniTalk.Tools.Notifications?.notifyTask?.("과제를 다시 확인해주세요", payload.feedback || "관리자 피드백을 확인하고 다시 제출해주세요.");
    if (command.type === "TASK_COMPLETED") MiniTalk.Tools.Notifications?.notifyCoinReward?.(Number(payload.amount) || 0, `${payload.title || "과제"} 완료`, Number(payload.newCoin) || 0);
  });

  return { start, refresh, submit, assign, adminList, review, normalize, visible, COMPLETED_VISIBLE_MS };
})();
