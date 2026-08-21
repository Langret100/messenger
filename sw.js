/*
 * 서비스 워커
 * - 문서/JS/CSS: 네트워크 우선, 실패하면 설치 캐시 사용
 * - 이미지/음원: 캐시 우선
 * - 외부 API와 Firebase 요청은 가로채지 않음
 */
const CACHE = "moaru-tools-scroll-layout";
const CORE = [
  "./",
  "./index.html",
  "./css/tokens.css",
  "./css/app.css",
  "./css/features/tools.css",
  "./css/features/tarot.css",
  "./css/features/chat-background.css",
  "./css/features/game-community.css",
  "./css/features/math-quest.css",
  "./css/features/quest-accordion.css",
  "./css/features/tasks-assignment.css",
  "./css/features/coin-wallet.css",
  "./css/features/shopping-store.css",
  "./css/features/display-clarity.css",
  "./css/features/feed-classinfo-weekly.css",
  // MOA_CHAT_INTEGRATION_START - 모아 AI 제거 시 moa-chat.css / moa-communication-engine.js / moa-chat.js 항목 제거
  "./css/features/moa-chat.css",
  "./js/ai/moa-communication-engine.js",
  "./js/config.js",
  "./js/core/namespace.js",
  "./js/core/events.js",
  "./js/core/store.js",
  "./js/core/registry.js",
  "./js/core/router.js",
  "./js/adapters/persistence.js",
  "./js/adapters/data-cache.js",
  "./js/adapters/auth-api.js",
  "./js/adapters/realtime.js",
  "./js/adapters/window-mode.js",
  "./js/adapters/mobile-immersive.js",
  "./js/admin/session.js",
  "./js/economy/coin-wallet.js",
  "./js/economy/quest-reward.js",
  "./js/shopping/store-service.js",
  "./js/chat/emoji.js",
  "./js/chat/linkify.js",
  "./js/chat/attachments.js",
  "./js/chat/qr.js",
  "./js/chat/voice.js",
  "./js/chat/unread.js",
  "./js/chat/server-backup.js",
  "./js/ui/dom.js",
  "./js/ui/shell.js",
  "./js/ui/interaction-guard.js",
  "./js/games/score-service.js",
  "./js/games/ranking.js",
  "./js/games/board.js",
  "./js/game-bridge/game-host.js",
  "./js/tasks/quest-accordion.js",
  "./js/tasks/daily-quest-clock.js",
  "./js/tasks/daily-math-quest.js",
  "./js/tasks/daily-korean-quest.js",
  "./js/tasks/friday-grade6-mission.js",
  "./js/tasks/task-service.js",
  "./js/tasks/task-window.js",
  "./js/features/auth.js",
  "./js/features/moa-chat.js",
  // MOA_CHAT_INTEGRATION_END
  "./js/features/chats.js",
  "./js/features/feed.js",
  "./js/features/games.js",
  "./js/tarot.js",
  "./js/tools/notifications.js",
  "./js/tools/timer-alarm.js",
  "./js/tools/tarot-view.js",
  "./js/tools/profile-editor.js",
  "./js/tools/capture.js",
  "./js/tools/class-info.js",
  "./js/features/tools.js",
  "./js/features/tasks.js",
  "./js/features/links.js",
  "./js/features/shopping.js",
  "./js/features/layout.js",
  "./js/features/settings.js",
  "./js/features/admin.js",
  "./js/app.js",
  "./games/gugudan.html",
  "./games/dice-sum.html",
  "./games/shape-tracker.html",
  "./games/math-explorer.html",
  "./games/tamagotchi.html",
  "./manifest.webmanifest",
  "./assets/icons/moaru-app-192.png",
  "./assets/icons/moaru-app-512.png",
  "./assets/icons/icon-maskable-192.png",
  "./assets/icons/icon-maskable-512.png",
  "./assets/icons/apple-touch-icon-180.png",
  "./assets/mascot-mini-talk.png",
  "./assets/mascot-avatar.png",
  "./assets/emoticons/e13.png",
  "./assets/emoticons/e14.png",
  "./assets/emoticons/e15.png",
  "./assets/emoticons/e16.png",
  "./assets/emoticons/e17.png",
  "./assets/ui/notebook-coin.svg",
  "./assets/ui/quest-stamp.png",
  "./assets/tarot/sun.png",
  "./assets/tarot/moon.png",
  "./assets/tarot/star.png",
  "./assets/tarot/wheel.png",
  "./assets/tarot/strength.png",
  "./assets/tarot/hermit.png",
  "./assets/tarot/lovers.png",
  "./assets/tarot/world.png",
  "./assets/sounds/games/game1.mp3",
  "./assets/sounds/games/game2.mp3",
  "./assets/sounds/games/game3.mp3",
  "./assets/sounds/notify.mp3",
  "./assets/sounds/stamp.mp3",
  "./assets/sounds/delivery-order-1.mp3",
  "./assets/sounds/delivery-order-2.mp3"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(CORE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

/*
 * index.html은 캐시 무효화를 위해 ?v= 값을 사용합니다.
 * 설치 목록은 쿼리 없이 저장되므로 오프라인 조회에서는 검색 쿼리를 무시해야 합니다.
 */
function cached(request) {
  return caches.match(request, { ignoreSearch: true });
}

function remember(request, response) {
  if (!response || !response.ok) return response;
  const copy = response.clone();
  caches.open(CACHE).then(cache => cache.put(request, copy));
  return response;
}

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== location.origin) return;

  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then(response => remember(event.request, response))
        .catch(async () => {
          const exactPage = await cached(event.request);
          if (exactPage) return exactPage;
          if (url.pathname.includes("/games/")) {
            return new Response("게임을 불러올 수 없습니다.", {
              status: 503,
              headers: { "Content-Type": "text/plain; charset=utf-8" }
            });
          }
          return cached("./index.html");
        })
    );
    return;
  }

  if (["script", "style", "manifest"].includes(event.request.destination)) {
    event.respondWith(
      fetch(event.request)
        .then(response => remember(event.request, response))
        .catch(() => cached(event.request))
    );
    return;
  }

  event.respondWith(
    cached(event.request).then(hit => hit || fetch(event.request).then(response => remember(event.request, response)))
  );
});
