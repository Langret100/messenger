/* ============================================================
   FACE TOY
   - 카메라/사진과 모든 편집은 브라우저 메모리에서 처리합니다.
   - 자동 얼굴 감지는 브라우저 내장 FaceDetector가 있을 때만 사용합니다.
   - 미지원 브라우저에서는 사용자가 얼굴 중심을 직접 찍어 같은 효과를 쓸 수 있습니다.
   - 서버 통신은 사용자가 '대화방에 보내기'를 선택한 순간 기존 채팅 전송만 재사용합니다.
   ============================================================ */
MiniTalk.Tools = MiniTalk.Tools || {};
MiniTalk.Tools.FaceToy = (() => {
  const MAX_EDGE = 980;
  const CHAT_DATA_LIMIT = 60 * 1024;
  let stream = null;
  let facing = "user";
  let closeCallback = null;
  let view = null;
  let video = null;
  let canvas = null;
  let stage = null;
  let statusNode = null;
  let effectsNode = null;
  let shutter = null;
  let switchButton = null;
  let picker = null;
  let resultActions = null;
  let sourceImage = null;
  let faces = [];
  let history = [];
  let mode = "camera";
  let manualNeeded = 0;
  let manualResolve = null;
  let warpStart = null;
  let lastRandom = "";
  let audioContext = null;
  let effectDragCleanup = null;

  function audio() {
    try {
      const C = window.AudioContext || window.webkitAudioContext; if (!C) return null;
      if (!audioContext) audioContext = new C();
      if (audioContext.state === "suspended") audioContext.resume().catch(() => {});
      return audioContext;
    } catch { return null; }
  }
  function tone(freq = 440, duration = .07, type = "sine", gain = .035, delaySec = 0) {
    const ctx = audio(); if (!ctx) return;
    try { const o = ctx.createOscillator(), g = ctx.createGain(), t = ctx.currentTime + delaySec; o.type = type; o.frequency.setValueAtTime(freq, t); g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + .01); g.gain.exponentialRampToValueAtTime(.0001, t + duration); o.connect(g); g.connect(ctx.destination); o.start(t); o.stop(t + duration + .02); } catch {}
  }
  function sound(name) {
    if (name === "shutter") { tone(170,.045,"square",.055); tone(110,.07,"square",.032,.045); return; }
    if (name === "effect") { tone(480,.055,"triangle",.028); tone(720,.09,"triangle",.032,.055); return; }
    if (name === "warp") { tone(260,.05,"sine",.025); tone(390,.07,"sine",.025,.05); return; }
    if (name === "done") { tone(523,.08,"sine",.03); tone(784,.12,"sine",.035,.07); return; }
    if (name === "tap") { tone(340,.04,"sine",.018); return; }
  }

  const EFFECTS = [
    { id: "warp", icon: "↝", label: "쭉 늘려" },
    { id: "swap", icon: "⇄", label: "얼굴 바꿔" },
    { id: "random", icon: "✦", label: "랜덤 폭주" },
    { id: "bighead", icon: "◉", label: "초대두" },
    { id: "half", icon: "◐", label: "반반 합체" }
  ];

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const doc = () => MiniTalk.UI?.Dom?.doc?.() || document;

  /* 효과 버튼 위에서 시작해도 PC에서는 좌우로 끌어 목록을 넘길 수 있게 한다.
     모바일은 CSS touch-action:pan-x + native overflow scroll을 그대로 사용한다. */
  function bindEffectDrag(scroller) {
    if (!scroller) return () => {};
    const owner = scroller.ownerDocument || doc();
    let tracking = false, dragged = false, blockClick = false;
    let startX = 0, startY = 0, startScroll = 0;

    const down = event => {
      if (event.button !== 0) return;
      tracking = true; dragged = false;
      startX = event.clientX; startY = event.clientY; startScroll = scroller.scrollLeft;
    };
    const move = event => {
      if (!tracking) return;
      const dx = event.clientX - startX, dy = event.clientY - startY;
      if (!dragged) {
        if (Math.abs(dx) < 5 && Math.abs(dy) < 5) return;
        if (Math.abs(dy) > Math.abs(dx) * 1.15) { tracking = false; return; }
        dragged = true; scroller.classList.add("dragging");
      }
      event.preventDefault?.();
      scroller.scrollLeft = startScroll - dx;
    };
    const up = () => {
      if (dragged) blockClick = true;
      tracking = false; dragged = false; scroller.classList.remove("dragging");
    };
    const click = event => {
      if (!blockClick) return;
      blockClick = false;
      event.preventDefault?.(); event.stopImmediatePropagation?.(); event.stopPropagation?.();
    };
    const dragstart = event => event.preventDefault?.();

    scroller.addEventListener("mousedown", down);
    owner.addEventListener("mousemove", move);
    owner.addEventListener("mouseup", up);
    scroller.addEventListener("dragstart", dragstart, true);
    scroller.addEventListener("click", click, true);
    return () => {
      scroller.removeEventListener("mousedown", down);
      owner.removeEventListener("mousemove", move);
      owner.removeEventListener("mouseup", up);
      scroller.removeEventListener("dragstart", dragstart, true);
      scroller.removeEventListener("click", click, true);
      scroller.classList.remove("dragging");
    };
  }

  function stopCamera() {
    if (stream) stream.getTracks().forEach(track => track.stop());
    stream = null;
    if (video) video.srcObject = null;
  }

  async function startCamera(nextFacing = facing) {
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus("이 기기에서는 카메라를 열 수 없어요. 사진을 불러와 주세요.", true);
      return false;
    }
    stopCamera();
    facing = nextFacing;
    setStatus(facing === "user" ? "전면 카메라 여는 중…" : "후면 카메라 여는 중…");
    const exact = { audio: false, video: { facingMode: { exact: facing }, width: { ideal: 1280 }, height: { ideal: 1280 } } };
    const ideal = { audio: false, video: { facingMode: { ideal: facing }, width: { ideal: 1280 }, height: { ideal: 1280 } } };
    try {
      /* 휴대폰에서는 exact를 먼저 써야 전/후면 전환 요청이 같은 카메라로 무시되는 경우가 줄어듭니다. */
      stream = await navigator.mediaDevices.getUserMedia(exact);
    } catch (exactError) {
      try {
        stream = await navigator.mediaDevices.getUserMedia(ideal);
      } catch (idealError) {
        try {
          stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: true });
        } catch (error) {
          setStatus("카메라를 열지 못했어요. 권한을 확인하거나 사진을 불러와 주세요.", true);
          return false;
        }
      }
    }
    const actualFacing = stream.getVideoTracks?.()[0]?.getSettings?.().facingMode;
    if (actualFacing === "user" || actualFacing === "environment") facing = actualFacing;
    if (!video || !view?.isConnected) { stopCamera(); return false; }
    video.srcObject = stream;
    video.muted = true;
    video.playsInline = true;
    await new Promise(resolve => {
      if (video.readyState >= 2) return resolve();
      video.onloadedmetadata = () => resolve();
      setTimeout(resolve, 1600);
    });
    try { await video.play(); } catch {}
    video.classList.toggle("is-mirrored", facing === "user");
    mode = "camera";
    syncMode();
    setStatus("얼굴이 크게 보이게 맞추고 찍어봐!");
    return true;
  }

  function buildView() {
    const D = MiniTalk.UI.Dom;
    view = D.el("section", { class: "view face-toy-view view-enter" });
    const top = D.el("div", { class: "face-toy-topbar" });
    const back = D.el("button", { class: "face-toy-back", type: "button", "aria-label": "페이스 체인지 나가기", text: "‹" });
    const title = D.el("div", { class: "face-toy-title" }, [D.el("strong", { text: "페이스 체인지" }), D.el("small", { text: "사진은 이 기기에서만 편집돼요" })]);
    switchButton = D.el("button", { class: "face-toy-camera-switch", type: "button", "aria-label": "전후면 카메라 전환", title: "카메라 전환", text: "↻" });
    back.onclick = close;
    switchButton.onclick = async () => {
      sound("tap"); switchButton.disabled = true;
      try { await startCamera(facing === "user" ? "environment" : "user"); }
      finally { switchButton.disabled = false; }
    };
    top.append(back, title, switchButton);

    stage = D.el("div", { class: "face-toy-stage" });
    video = D.el("video", { class: "face-toy-video", autoplay: true, muted: true, playsinline: true });
    canvas = D.el("canvas", { class: "face-toy-canvas" });
    statusNode = D.el("div", { class: "face-toy-status", text: "카메라 준비 중…" });
    stage.append(video, canvas, statusNode);

    effectsNode = D.el("div", { class: "face-toy-effects", role: "list", "aria-label": "얼굴 효과" });
    EFFECTS.forEach(effect => {
      const button = D.el("button", { class: "face-effect", type: "button", "data-effect": effect.id, role: "listitem" }, [
        D.el("span", { class: "face-effect-icon", text: effect.icon }),
        D.el("span", { text: effect.label })
      ]);
      button.onclick = () => applyEffect(effect.id);
      effectsNode.append(button);
    });
    effectDragCleanup?.();
    effectDragCleanup = bindEffectDrag(effectsNode);

    const captureRow = D.el("div", { class: "face-toy-capture-row" });
    picker = D.el("input", { type: "file", accept: "image/*", class: "hidden", "aria-label": "사진 불러오기" });
    const gallery = D.el("button", { class: "face-toy-side-action", type: "button" }, [D.el("span", { text: "▧" }), D.el("small", { text: "사진" })]);
    shutter = D.el("button", { class: "face-toy-shutter", type: "button", "aria-label": "사진 촬영" }, [D.el("span", {})]);
    const reset = D.el("button", { class: "face-toy-side-action", type: "button" }, [D.el("span", { text: "↶" }), D.el("small", { text: "원본" })]);
    gallery.onclick = () => { sound("tap"); picker.click(); };
    picker.onchange = () => { const file = picker.files?.[0]; picker.value = ""; if (file) loadFile(file); };
    shutter.onclick = captureFrame;
    reset.onclick = () => { sound("tap"); restoreOriginal(); };
    captureRow.append(gallery, shutter, reset, picker);

    resultActions = D.el("div", { class: "face-toy-result-actions hidden" });
    const retake = D.el("button", { class: "button secondary", type: "button", text: "다시 찍기" });
    const save = D.el("button", { class: "button secondary", type: "button", text: "저장" });
    const share = D.el("button", { class: "button primary", type: "button", text: "대화방에 보내기" });
    retake.onclick = async () => { sound("tap"); sourceImage = null; history = []; faces = []; await startCamera(facing); };
    save.onclick = saveImage;
    share.onclick = chooseRoomAndSend;
    resultActions.append(retake, save, share);

    view.append(top, stage, effectsNode, captureRow, resultActions);
    bindWarp();
    return view;
  }

  async function open(onClose) {
    closeCallback = typeof onClose === "function" ? onClose : null;
    const host = MiniTalk.UI.Dom.byId("viewHost");
    if (!host) return;
    stopCamera();
    host.replaceChildren(buildView());
    facing = "user";
    await startCamera("user");
  }

  function dispose() {
    effectDragCleanup?.();
    effectDragCleanup = null;
    stopCamera();
    manualResolve?.([]);
    manualResolve = null;
    manualNeeded = 0;
    warpStart = null;
    if (view) MiniTalk.UI.Shell.closeModal?.();
    view = null;
  }

  function close() {
    const callback = closeCallback;
    closeCallback = null;
    dispose();
    callback?.();
  }

  function setStatus(text, error = false) {
    if (!statusNode) return;
    statusNode.textContent = text || "";
    statusNode.classList.toggle("error", Boolean(error));
    statusNode.classList.toggle("hidden", !text);
  }

  function syncMode() {
    const editing = mode === "edit";
    if (video) video.classList.toggle("hidden", editing);
    if (canvas) canvas.classList.toggle("active", editing);
    if (effectsNode) effectsNode.classList.toggle("disabled", !editing);
    if (shutter) shutter.classList.toggle("hidden", editing);
    if (switchButton) switchButton.classList.toggle("hidden", editing);
    if (resultActions) resultActions.classList.toggle("hidden", !editing);
  }

  async function captureFrame() {
    if (!video?.videoWidth || !video?.videoHeight) { setStatus("카메라가 아직 준비되지 않았어요.", true); return; }
    sound("shutter");
    const source = doc().createElement("canvas");
    const scale = Math.min(1, MAX_EDGE / Math.max(video.videoWidth, video.videoHeight));
    source.width = Math.max(1, Math.round(video.videoWidth * scale));
    source.height = Math.max(1, Math.round(video.videoHeight * scale));
    source.getContext("2d", { alpha: false }).drawImage(video, 0, 0, source.width, source.height);
    stopCamera();
    await enterEdit(source);
  }

  async function loadFile(file) {
    if (!file.type?.startsWith("image/")) { setStatus("사진 파일만 불러올 수 있어요.", true); return; }
    if (file.size > 16 * 1024 * 1024) { setStatus("사진이 너무 커요. 16MB 이하 사진을 골라 주세요.", true); return; }
    stopCamera();
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((resolve, reject) => { const i = new Image(); i.onload = () => resolve(i); i.onerror = reject; i.src = url; });
      const source = doc().createElement("canvas");
      const scale = Math.min(1, MAX_EDGE / Math.max(img.naturalWidth, img.naturalHeight));
      source.width = Math.max(1, Math.round(img.naturalWidth * scale));
      source.height = Math.max(1, Math.round(img.naturalHeight * scale));
      source.getContext("2d", { alpha: false }).drawImage(img, 0, 0, source.width, source.height);
      await enterEdit(source);
    } catch { setStatus("사진을 읽지 못했어요.", true); }
    finally { URL.revokeObjectURL(url); }
  }

  async function enterEdit(source) {
    sourceImage = cloneCanvas(source);
    canvas.width = source.width; canvas.height = source.height;
    canvas.getContext("2d", { alpha: false }).drawImage(source, 0, 0);
    history = [];
    faces = [];
    mode = "edit";
    syncMode();
    fitCanvasAspect();
    setStatus("얼굴 찾는 중…");
    faces = await detectFaces(canvas);
    if (faces.length) setStatus(faces.length > 1 ? `${faces.length}명 찾았어. 이제 제대로 망가뜨려봐 😵` : "얼굴 찾았어. 효과를 골라봐 😵");
    else setStatus("자동 얼굴 찾기가 안 되면 효과를 누른 뒤 얼굴 중심을 찍어줘.");
  }

  function fitCanvasAspect() {
    if (!stage || !canvas?.width || !canvas?.height) return;
    stage.style.setProperty("--photo-ratio", `${canvas.width}/${canvas.height}`);
  }

  function cloneCanvas(input = canvas) {
    const copy = doc().createElement("canvas");
    copy.width = input.width; copy.height = input.height;
    copy.getContext("2d", { alpha: true }).drawImage(input, 0, 0);
    return copy;
  }

  function pushHistory() {
    history.push(canvas.toDataURL("image/jpeg", 0.86));
    if (history.length > 6) history.shift();
  }

  async function restoreOriginal() {
    if (!sourceImage || mode !== "edit") return;
    canvas.getContext("2d", { alpha: false }).drawImage(sourceImage, 0, 0, canvas.width, canvas.height);
    history = [];
    faces = await detectFaces(canvas);
    setStatus("원본으로 돌아왔어.");
  }

  async function detectFaces(target) {
    if (!target?.width) return [];
    if (typeof window.FaceDetector === "function") {
      try {
        const detector = new window.FaceDetector({ fastMode: true, maxDetectedFaces: 4 });
        const found = await detector.detect(target);
        return found.map(item => {
          const b = item.boundingBox;
          return normalizeFace({ x: b.x, y: b.y, w: b.width, h: b.height });
        }).filter(Boolean).sort((a, b) => b.w * b.h - a.w * a.h);
      } catch (error) { console.warn("내장 얼굴 감지 실패", error); }
    }
    return [];
  }

  function normalizeFace(face) {
    if (!face) return null;
    const padX = face.w * .10, padTop = face.h * .18, padBottom = face.h * .06;
    const x = clamp(face.x - padX, 0, canvas.width - 1), y = clamp(face.y - padTop, 0, canvas.height - 1);
    const right = clamp(face.x + face.w + padX, x + 2, canvas.width), bottom = clamp(face.y + face.h + padBottom, y + 2, canvas.height);
    return { x, y, w: right - x, h: bottom - y };
  }

  async function ensureFaces(count) {
    if (faces.length >= count) return faces.slice(0, count);
    const selected = await selectFacesManually(count);
    if (selected.length >= count) {
      faces = selected.concat(faces).slice(0, Math.max(count, faces.length));
      return faces.slice(0, count);
    }
    setStatus(count === 2 ? "두 얼굴이 필요해. 사진 속 두 사람 얼굴을 하나씩 찍어줘." : "얼굴 중심을 한 번 찍어줘.", true);
    return [];
  }

  function selectFacesManually(count) {
    if (!canvas?.isConnected) return Promise.resolve([]);
    manualResolve?.([]);
    manualNeeded = count;
    const picked = [];
    canvas.classList.add("manual-face-pick");
    setStatus(count === 1 ? "얼굴 한가운데를 톡 찍어줘." : `첫 번째 얼굴부터 톡 찍어줘. (0/${count})`);
    return new Promise(resolve => {
      manualResolve = resolve;
      const handler = event => {
        if (mode !== "edit") return finish([]);
        const p = canvasPoint(event);
        const size = Math.min(canvas.width, canvas.height) * .34;
        picked.push(normalizeFace({ x: p.x - size * .5, y: p.y - size * .53, w: size, h: size * 1.08 }));
        if (picked.length >= count) finish(picked);
        else setStatus(`다음 얼굴을 톡 찍어줘. (${picked.length}/${count})`);
      };
      const finish = value => {
        canvas.removeEventListener("click", handler, true);
        canvas.classList.remove("manual-face-pick");
        manualResolve = null; manualNeeded = 0;
        resolve(value);
      };
      canvas.addEventListener("click", handler, true);
    });
  }

  function canvasPoint(event) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: clamp((event.clientX - rect.left) * canvas.width / rect.width, 0, canvas.width),
      y: clamp((event.clientY - rect.top) * canvas.height / rect.height, 0, canvas.height)
    };
  }

  async function applyEffect(id) {
    if (mode !== "edit" || !sourceImage) { setStatus("먼저 사진을 찍거나 불러와 줘.", true); return; }
    if (id === "warp") { sound("warp"); setStatus("얼굴을 누르고 원하는 방향으로 쭉 끌어봐! 크게 끌수록 더 웃겨져."); canvas.classList.add("warp-ready"); return; }
    canvas.classList.remove("warp-ready");
    const count = (id === "swap" || id === "half") ? 2 : 1;
    const selected = await ensureFaces(count);
    if (selected.length < count) return;
    pushHistory();
    if (id === "swap") faceSwap(selected[0], selected[1]);
    if (id === "bighead") bigHead(selected[0], 1.62);
    if (id === "half") halfMix(selected[0], selected[1]);
    if (id === "random") randomMadness(selected[0]);
    sound("effect");
    setStatus(id === "swap" ? "바꿨다 ㅋㅋ" : id === "half" ? "반반 합체 완료 😵" : id === "bighead" ? "머리 크기 폭주 완료 😂" : "랜덤 폭주 완료 🤪");
  }

  function faceCrop(face, pad = .06) {
    const x = clamp(face.x - face.w * pad, 0, canvas.width), y = clamp(face.y - face.h * pad, 0, canvas.height);
    const w = clamp(face.w * (1 + pad * 2), 2, canvas.width - x), h = clamp(face.h * (1 + pad * 2), 2, canvas.height - y);
    const crop = doc().createElement("canvas"); crop.width = Math.round(w); crop.height = Math.round(h);
    crop.getContext("2d").drawImage(canvas, x, y, w, h, 0, 0, crop.width, crop.height);
    return { crop, x, y, w, h };
  }

  function drawEllipseImage(ctx, image, x, y, w, h, alpha = 1) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.beginPath(); ctx.ellipse(x + w / 2, y + h / 2, w * .49, h * .49, 0, 0, Math.PI * 2); ctx.clip();
    ctx.drawImage(image, x, y, w, h);
    ctx.restore();
  }

  function faceSwap(a, b) {
    const ca = faceCrop(a, .02), cb = faceCrop(b, .02), ctx = canvas.getContext("2d", { alpha: false });
    drawEllipseImage(ctx, cb.crop, a.x, a.y, a.w, a.h, .98);
    drawEllipseImage(ctx, ca.crop, b.x, b.y, b.w, b.h, .98);
  }

  function bigHead(face, scale = 1.6) {
    const c = faceCrop(face, .09), ctx = canvas.getContext("2d", { alpha: false });
    const w = face.w * scale, h = face.h * scale, x = face.x + face.w / 2 - w / 2, y = face.y + face.h * .54 - h * .54;
    drawEllipseImage(ctx, c.crop, x, y, w, h, 1);
  }

  function halfMix(a, b) {
    const ca = faceCrop(a, 0), cb = faceCrop(b, 0), ctx = canvas.getContext("2d", { alpha: false });
    function mixAt(target, left, right) {
      const x = target.x, y = target.y, w = target.w, h = target.h;
      ctx.save(); ctx.beginPath(); ctx.ellipse(x + w / 2, y + h / 2, w * .49, h * .49, 0, 0, Math.PI * 2); ctx.clip();
      ctx.drawImage(left, 0, 0, left.width / 2, left.height, x, y, w / 2, h);
      ctx.drawImage(right, right.width / 2, 0, right.width / 2, right.height, x + w / 2, y, w / 2, h);
      const grad = ctx.createLinearGradient(x + w * .42, 0, x + w * .58, 0); grad.addColorStop(0, "rgba(255,255,255,0)"); grad.addColorStop(.5, "rgba(255,255,255,.13)"); grad.addColorStop(1, "rgba(255,255,255,0)"); ctx.fillStyle = grad; ctx.fillRect(x + w * .4, y, w * .2, h); ctx.restore();
    }
    mixAt(a, ca.crop, cb.crop); mixAt(b, cb.crop, ca.crop);
  }

  function randomMadness(face) {
    const choices = ["wide", "tall", "balloon", "squish", "forehead"];
    let choice = choices[Math.floor(Math.random() * choices.length)];
    if (choice === lastRandom) choice = choices[(choices.indexOf(choice) + 1) % choices.length];
    lastRandom = choice;
    if (choice === "wide") scaleFace(face, 1.72, .92);
    if (choice === "tall") scaleFace(face, .88, 1.62);
    if (choice === "squish") scaleFace(face, 1.55, .68);
    if (choice === "forehead") featureBulge(face, .5, .18, .62, 1.8);
    if (choice === "balloon") { featureBulge(face, .26, .58, .38, 1.7); featureBulge(face, .74, .58, .38, 1.7); }
  }

  function scaleFace(face, sx, sy) {
    const c = faceCrop(face, .02), ctx = canvas.getContext("2d", { alpha: false });
    const w = face.w * sx, h = face.h * sy, x = face.x + face.w / 2 - w / 2, y = face.y + face.h / 2 - h / 2;
    drawEllipseImage(ctx, c.crop, x, y, w, h, 1);
  }

  function featureBulge(face, fx, fy, fraction, scale) {
    const ctx = canvas.getContext("2d", { alpha: false }), radius = Math.min(face.w, face.h) * fraction * .5;
    const cx = face.x + face.w * fx, cy = face.y + face.h * fy;
    const x = clamp(cx - radius, 0, canvas.width), y = clamp(cy - radius, 0, canvas.height), size = Math.min(radius * 2, canvas.width - x, canvas.height - y);
    if (size < 4) return;
    const temp = doc().createElement("canvas"); temp.width = temp.height = Math.ceil(size); temp.getContext("2d").drawImage(canvas, x, y, size, size, 0, 0, temp.width, temp.height);
    const out = size * scale, dx = cx - out / 2, dy = cy - out / 2;
    drawEllipseImage(ctx, temp, dx, dy, out, out, 1);
  }

  function bindWarp() {
    canvas.addEventListener("pointerdown", event => {
      if (mode !== "edit" || !canvas.classList.contains("warp-ready") || manualNeeded) return;
      warpStart = canvasPoint(event); canvas.setPointerCapture?.(event.pointerId); event.preventDefault();
    });
    canvas.addEventListener("pointerup", event => {
      if (!warpStart || mode !== "edit") return;
      const end = canvasPoint(event), dx = end.x - warpStart.x, dy = end.y - warpStart.y;
      if (Math.hypot(dx, dy) >= 5) { pushHistory(); liquify(warpStart.x, warpStart.y, dx, dy); sound("warp"); setStatus("ㅋㅋ 더 잡아당겨도 돼."); }
      warpStart = null; event.preventDefault();
    });
    canvas.addEventListener("pointercancel", () => { warpStart = null; });
  }

  function liquify(cx, cy, dx, dy) {
    const ctx = canvas.getContext("2d", { willReadFrequently: true }), image = ctx.getImageData(0, 0, canvas.width, canvas.height), src = new Uint8ClampedArray(image.data);
    const radius = clamp(Math.min(canvas.width, canvas.height) * .16 + Math.hypot(dx, dy) * .18, 34, Math.min(canvas.width, canvas.height) * .28);
    const x0 = Math.max(0, Math.floor(cx - radius)), x1 = Math.min(canvas.width - 1, Math.ceil(cx + radius));
    const y0 = Math.max(0, Math.floor(cy - radius)), y1 = Math.min(canvas.height - 1, Math.ceil(cy + radius));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const dist = Math.hypot(x - cx, y - cy); if (dist >= radius) continue;
      const fall = Math.pow(1 - dist / radius, 2) * .92;
      const sx = clamp(Math.round(x - dx * fall), 0, canvas.width - 1), sy = clamp(Math.round(y - dy * fall), 0, canvas.height - 1);
      const di = (y * canvas.width + x) * 4, si = (sy * canvas.width + sx) * 4;
      image.data[di] = src[si]; image.data[di + 1] = src[si + 1]; image.data[di + 2] = src[si + 2]; image.data[di + 3] = src[si + 3];
    }
    ctx.putImageData(image, 0, 0);
  }

  function saveImage() {
    if (mode !== "edit" || !canvas?.width) return;
    canvas.toBlob(blob => {
      if (!blob) return setStatus("이미지 저장에 실패했어요.", true);
      const url = URL.createObjectURL(blob), a = doc().createElement("a");
      a.href = url; a.download = `moaru-face-toy-${new Date().toISOString().slice(0, 10)}.png`; doc().body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1500);
      sound("done"); setStatus("기기에 저장했어! ✨");
    }, "image/png");
  }

  function memberRooms() {
    const rooms = MiniTalk.Store.get("rooms") || {};
    return Object.values(rooms).filter(room => room && MiniTalk.Realtime?.isRoomMember?.(room)).sort((a, b) => (Number(b.updatedAt || b.lastMessageAt) || 0) - (Number(a.updatedAt || a.lastMessageAt) || 0));
  }

  async function chooseRoomAndSend() {
    if (mode !== "edit" || !canvas?.width) return;
    const rooms = memberRooms();
    if (!rooms.length) { setStatus("참여 중인 대화방이 없어요.", true); return; }
    const D = MiniTalk.UI.Dom, body = D.el("div", { class: "face-room-picker" });
    body.append(D.el("p", { class: "muted face-room-picker-note", text: "완성된 사진을 보낼 대화방을 골라줘." }));
    const list = D.el("div", { class: "face-room-list" });
    rooms.forEach(room => {
      const button = D.el("button", { class: "face-room-row", type: "button" }, [D.el("span", { class: "face-room-icon", text: "▣" }), D.el("span", { class: "face-room-copy" }, [D.el("strong", { text: room.title || "대화방" }), D.el("small", { class: "muted", text: room.lastMessage || "메시지 없음" })]), D.el("span", { class: "row-arrow", text: "›" })]);
      button.onclick = async () => {
        button.disabled = true;
        try { await sendCanvasToRoom(room.id); sound("done"); MiniTalk.UI.Shell.closeModal(); setStatus(`${room.title || "대화방"}에 보냈어!`); }
        catch (error) { MiniTalk.UI.Shell.toast(error.message || "사진을 보내지 못했어요."); button.disabled = false; }
      };
      list.append(button);
    });
    body.append(list);
    MiniTalk.UI.Shell.modal("대화방에 보내기", body);
  }

  async function sendCanvasToRoom(roomId) {
    const dataUrl = await chatSizedImage();
    if (!dataUrl || dataUrl.length > CHAT_DATA_LIMIT) throw new Error("채팅용 사진 크기를 줄이지 못했어요.");
    return MiniTalk.Realtime.sendMessage(roomId, { type: "image", text: "[페이스 체인지]", image: dataUrl });
  }

  async function chatSizedImage() {
    const temp = doc().createElement("canvas");
    let scale = Math.min(1, 720 / Math.max(canvas.width, canvas.height));
    const encode = quality => new Promise(resolve => temp.toBlob(resolve, "image/jpeg", quality));
    for (let pass = 0; pass < 7; pass++) {
      temp.width = Math.max(1, Math.round(canvas.width * scale)); temp.height = Math.max(1, Math.round(canvas.height * scale));
      const ctx = temp.getContext("2d", { alpha: false }); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, temp.width, temp.height); ctx.drawImage(canvas, 0, 0, temp.width, temp.height);
      for (const q of [.76, .64, .52, .42, .34, .28]) {
        const blob = await encode(q); if (!blob || blob.size > 44 * 1024) continue;
        const data = await blobToDataUrl(blob); if (data.length <= CHAT_DATA_LIMIT) return data;
      }
      scale *= .82;
    }
    return "";
  }

  function blobToDataUrl(blob) { return new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(String(r.result || "")); r.onerror = reject; r.readAsDataURL(blob); }); }

  return { open, close, dispose, _test: { normalizeFace, memberRooms, sound, bindEffectDrag } };
})();
