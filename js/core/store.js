/* 중앙 상태 저장소. 쓰기는 set/patch를 거쳐 상태 이벤트가 항상 발행되도록 합니다. */
MiniTalk.Store = (() => {
  const state = {
    user: null,
    transport: "idle",
    route: "chats",
    activeRoom: null,
    lastRoom: null,
    rooms: {},
    messages: {},
    tasks: {},
    dailyQuest: null,
    profiles: {},
    shopCatalog: {},
    shopInventory: {},
    presence: {},
    coins: 0,
    admin: false,
    rootDocument: document
  };

  function get(key) {
    return state[key];
  }

  function all() {
    return { ...state };
  }

  function set(key, value) {
    state[key] = value;
    MiniTalk.Events.emit(`state:${key}`, value);
    return value;
  }

  function patch(key, partial) {
    const next = { ...(state[key] || {}), ...partial };
    return set(key, next);
  }

  return { get, all, set, patch };
})();
