/* 화면 캡처: 미디어 스트림 정리와 이미지 크기 제한을 이 모듈이 보장합니다. */
MiniTalk.Tools = MiniTalk.Tools || {};
MiniTalk.Tools.Capture = (() => {
  async function capture() {
    if (!navigator.mediaDevices?.getDisplayMedia) throw new Error("화면 캡처를 지원하지 않습니다.");
    MiniTalk.UI.Shell.toast("캡처할 화면에서 현재 모아루 탭을 선택하세요.");
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: { displaySurface: "browser" },
      audio: false,
      preferCurrentTab: true,
      selfBrowserSurface: "include",
      surfaceSwitching: "exclude",
      monitorTypeSurfaces: "exclude"
    });
    try {
      const video = document.createElement("video");
      video.srcObject = stream;
      video.muted = true;
      await new Promise((resolve, reject) => {
        video.onloadedmetadata = resolve;
        video.onerror = () => reject(new Error("캡처 영상을 불러오지 못했습니다."));
      });
      await video.play();

      const width = video.videoWidth;
      const height = video.videoHeight;
      if (!width || !height) throw new Error("캡처 화면 크기를 확인하지 못했습니다.");

      const scale = Math.min(1, 1200 / Math.max(width, height));
      const canvas = MiniTalk.UI.Dom.doc().createElement("canvas");
      canvas.width = Math.round(width * scale);
      canvas.height = Math.round(height * scale);
      canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
      const data = canvas.toDataURL("image/jpeg", 0.68);
      if (data.length > 850000) throw new Error("캡처 이미지가 너무 큽니다.");
      return data;
    } finally {
      stream.getTracks().forEach(track => track.stop());
    }
  }

  async function captureAndSend(roomId = "") {
    try {
      const data = await capture();
      const room = String(roomId || MiniTalk.Store.get("activeRoom") || "").trim();
      if (!room) throw new Error("캡처를 보낼 대화방을 먼저 열어주세요.");
      await MiniTalk.Realtime.sendMessage(room, { text: "[화면 캡처]", image: data });
      MiniTalk.UI.Shell.toast("캡처를 채팅에 공유했습니다.");
      return true;
    } catch (error) {
      MiniTalk.UI.Shell.toast(error.message);
      return false;
    }
  }

  return { capture, captureAndSend };
})();
