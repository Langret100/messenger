/* 기능끼리 직접 참조하지 않아도 상태 변화를 전달할 수 있는 앱 내부 이벤트 버스입니다. */
MiniTalk.Events = (() => {
  const bus = new EventTarget();

  function on(type, listener) {
    const handler = event => listener(event.detail);
    bus.addEventListener(type, handler);
    return () => bus.removeEventListener(type, handler);
  }

  function emit(type, detail) {
    bus.dispatchEvent(new CustomEvent(type, { detail }));
  }

  return { on, emit };
})();
