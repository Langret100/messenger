/* PC/웨일북에서는 큰 별도 창, 모바일에서는 앱 안의 전체형 모달로 과제를 편집·검토합니다. */
MiniTalk.Tasks = MiniTalk.Tasks || {};
MiniTalk.Tasks.TaskWindow = (() => {
  const ANSWER_MAX = 1000, FEEDBACK_MAX = 100, IMAGE_MAX_CHARS = 6500;
  const sourceWindow = sourceDoc => sourceDoc?.defaultView || window;
  const desktop = (sourceDoc = MiniTalk.UI.Dom.doc()) => {
    const view = sourceWindow(sourceDoc);
    return sourceDoc?.body?.classList?.contains("admin-window-body") || MiniTalk.WindowMode?.isPopup?.() === true || (!MiniTalk.MobileImmersive?.isMobile?.() && Number(view.innerWidth || 0) >= 700 && Number(view.screen?.availWidth || view.innerWidth) >= 720);
  };
  const el = (doc, tag, attrs = {}, children = []) => { const node = doc.createElement(tag);Object.entries(attrs).forEach(([key, value]) => { if (key === "class") node.className = value;else if (key === "text") node.textContent = value;else if (key === "value") node.value = value;else if (value != null) node.setAttribute(key, value); });[].concat(children).filter(Boolean).forEach(child => node.append(child));return node; };

  function popupBounds(sourceView, desiredW=920, desiredH=780) {
    const scr=sourceView.screen||{},availLeft=Number(scr.availLeft)||0,availTop=Number(scr.availTop)||0,availW=Math.max(640,Number(scr.availWidth)||1280),availH=Math.max(520,Number(scr.availHeight)||800),gap=42;
    const srcLeft=Number(sourceView.screenX??sourceView.screenLeft)||availLeft,srcTop=Number(sourceView.screenY??sourceView.screenTop)||availTop,srcW=Math.max(320,Number(sourceView.outerWidth)||Math.min(520,availW*.42)),srcH=Math.max(420,Number(sourceView.outerHeight)||availH*.8);
    const rightStart=Math.min(availLeft+availW,srcLeft+srcW+gap),rightSpace=Math.max(0,availLeft+availW-rightStart),leftSpace=Math.max(0,srcLeft-gap-availLeft);let width=Math.min(desiredW,Math.max(rightSpace,leftSpace)),left=rightSpace>=leftSpace?rightStart:srcLeft-gap-width;
    if(Math.max(rightSpace,leftSpace)<520){width=Math.min(Math.max(560,Math.round(availW*.56)),availW-24);left=(srcLeft+srcW/2)<=availLeft+availW/2?availLeft+availW-width-8:availLeft+8;}
    const height=Math.min(desiredH,availH-24),top=Math.max(availTop+8,Math.min(srcTop,availTop+availH-height-8));return{width:Math.round(Math.max(500,width)),height:Math.round(Math.max(520,height)),left:Math.round(left),top:Math.round(top)};
  }
  function enforcePopupBounds(win,b){const apply=()=>{try{win.resizeTo(b.width,b.height);win.moveTo(b.left,b.top)}catch{}};apply();setTimeout(apply,80);setTimeout(apply,260);}

  function preparePopup(title, sourceDoc = MiniTalk.UI.Dom.doc()) {
    if (!desktop(sourceDoc)) return null;
    const sourceView = sourceWindow(sourceDoc);
    const bounds=popupBounds(sourceView),popup = sourceView.open("", `MoaruTask_${Date.now()}`, `popup=yes,toolbar=no,location=no,menubar=no,status=no,scrollbars=yes,resizable=yes,width=${bounds.width},height=${bounds.height},left=${bounds.left},top=${bounds.top}`);
    if (!popup) return null;enforcePopupBounds(popup,bounds);
    const doc = popup.document;doc.open();doc.write("<!doctype html><html lang='ko' data-theme='light'><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><base href='" + sourceDoc.baseURI.replace(/'/g, "%27") + "'></head><body class='task-window-body'></body></html>");doc.close();doc.title = title;enforcePopupBounds(popup,bounds);
    for (const sheet of sourceDoc.styleSheets) { if (!sheet.href) continue;const link = doc.createElement("link");link.rel = "stylesheet";link.href = sheet.href;doc.head.append(link); }
    return { doc, close: () => popup.close(), popup };
  }

  function openSurface(title, build, sourceDoc = MiniTalk.UI.Dom.doc()) {
    const separate = preparePopup(title, sourceDoc);
    if (separate) { const root = el(separate.doc, "main", { class: "task-workbench task-workbench-window" });separate.doc.body.append(root);build(separate.doc, root, separate.close);separate.popup.focus();return { separate: true, popup: separate.popup }; }
    const D = MiniTalk.UI.Dom.forDocument(sourceDoc), Shell = MiniTalk.UI.Shell.forDocument(sourceDoc), body = D.el("div", { class: "task-workbench task-workbench-mobile" });Shell.modal(title, body);build(sourceDoc, body, () => Shell.closeModal());return { separate: false };
  }

  const readDataUrl = file => new Promise((resolve, reject) => { const reader = new FileReader();reader.onload = () => resolve(String(reader.result || ""));reader.onerror = () => reject(new Error("이미지를 읽지 못했습니다."));reader.readAsDataURL(file); });
  async function compactImage(file) {
    if (!file?.type?.startsWith("image/")) throw new Error("이미지 파일만 첨부할 수 있습니다.");
    if (file.size > 12 * 1024 * 1024) throw new Error("이미지는 12MB 이하만 선택할 수 있습니다.");
    const source = await readDataUrl(file), image = await new Promise((resolve, reject) => { const node = new Image();node.onload = () => resolve(node);node.onerror = () => reject(new Error("이미지를 읽지 못했습니다."));node.src = source; });
    let max = 720, quality = .62, result = "";
    for (let attempt = 0; attempt < 7; attempt++) {
      const scale = Math.min(1, max / Math.max(image.naturalWidth, image.naturalHeight)), canvas = document.createElement("canvas");canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);result = canvas.toDataURL("image/jpeg", quality);if (result.length <= IMAGE_MAX_CHARS) return result;max = Math.round(max * .74);quality = Math.max(.34, quality - .06);
    }
    throw new Error("이미지를 더 작은 크기로 선택해주세요.");
  }

  function header(doc, task, eyebrow) {
    return el(doc, "header", { class: "task-workbench-head" }, [
      el(doc, "div", {}, [el(doc, "small", { class: "task-eyebrow", text: eyebrow }), el(doc, "h1", { text: task.title || "과제" }), el(doc, "p", { text: task.description || "과제 내용을 확인하고 제출해주세요." })]),
      el(doc, "span", { class: "task-reward-pill", "aria-label": `완료 보상 ${Number(task.rewardCoin) || 0}코인` }, [el(doc, "img", { src: "assets/ui/notebook-coin.svg", alt: "" }), el(doc, "b", { text: `+${Number(task.rewardCoin) || 0}` })])
    ]);
  }

  function openStudent(task, onSubmit) {
    return openSurface(task.status === "retry" ? "과제 다시 제출" : "과제 작성", (doc, root, close) => {
      let imageData = String(task.imageData || "");
      const answer = el(doc, "textarea", { class: "task-answer-editor", maxlength: String(ANSWER_MAX), placeholder: "과제 답안을 입력하세요. 최대 1,000자까지 작성할 수 있어요." });answer.value = task.answer || "";
      const count = el(doc, "small", { class: "task-char-count", text: `${answer.value.length} / ${ANSWER_MAX}` }), preview = el(doc, "div", { class: `task-image-preview${imageData ? " has-image" : ""}` }), file = el(doc, "input", { type: "file", accept: "image/*", class: "hidden" }), status = el(doc, "p", { class: "task-form-status", role: "status" });
      const drawImage = () => { preview.replaceChildren();preview.classList.toggle("has-image", Boolean(imageData));if (!imageData) { preview.append(el(doc, "span", { text: "첨부 이미지 없음" }));return; }const img = el(doc, "img", { src: imageData, alt: "과제 첨부 이미지" }), remove = el(doc, "button", { type: "button", class: "mini-action danger-lite", text: "이미지 제거" });remove.onclick = () => { imageData = "";file.value = "";drawImage(); };preview.append(img, remove); };
      const attach = el(doc, "button", { type: "button", class: "button secondary", text: imageData ? "이미지 바꾸기" : "이미지 1개 첨부" });attach.onclick = () => file.click();file.onchange = async () => { const selected = file.files?.[0];if (!selected) return;attach.disabled = true;status.textContent = "이미지를 준비하고 있어요…";try { imageData = await compactImage(selected);drawImage();attach.textContent = "이미지 바꾸기";status.textContent = "이미지를 첨부했습니다."; } catch (error) { status.textContent = error.message || "이미지를 첨부하지 못했습니다.";file.value = ""; } finally { attach.disabled = false; } };
      answer.oninput = () => { count.textContent = `${answer.value.length} / ${ANSWER_MAX}`; };
      const submit = el(doc, "button", { type: "button", class: "button primary task-submit-button", text: task.status === "retry" ? "수정해서 다시 제출" : "과제 제출" });
      submit.onclick = async () => { submit.disabled = true;status.textContent = "제출하고 있어요…";try { await onSubmit(answer.value, imageData);status.textContent = "제출했습니다.";setTimeout(close, 260); } catch (error) { status.textContent = error.message || "제출하지 못했습니다.";submit.disabled = false; } };
      root.append(header(doc, task, task.status === "retry" ? "다시! 관리자 피드백을 반영해주세요" : "관리자 지정 과제"));
      if (task.status === "retry" && task.feedback) root.append(el(doc, "aside", { class: "task-feedback-banner" }, [el(doc, "strong", { text: "다시!" }), el(doc, "p", { text: task.feedback })]));
      root.append(el(doc, "section", { class: "task-editor-panel" }, [el(doc, "label", { class: "task-editor-label", text: "제출 내용" }), answer, count, el(doc, "div", { class: "task-image-actions" }, [attach, file]), preview, status, submit]));drawImage();setTimeout(() => answer.focus(), 80);
    });
  }

  function openReview(task, onReview, sourceDoc = MiniTalk.UI.Dom.doc()) {
    return openSurface("과제 제출 확인", (doc, root, close) => {
      const feedback = el(doc, "textarea", { class: "task-feedback-editor", maxlength: String(FEEDBACK_MAX), placeholder: "다시 보낼 때 학생에게 보여줄 피드백을 100자 이내로 적어주세요." }), count = el(doc, "small", { class: "task-char-count", text: `0 / ${FEEDBACK_MAX}` }), status = el(doc, "p", { class: "task-form-status", role: "status" });feedback.oninput = () => { count.textContent = `${feedback.value.length} / ${FEEDBACK_MAX}`; };
      const retry = el(doc, "button", { type: "button", class: "button secondary task-retry-button", text: "피드백과 함께 다시!" }), complete = el(doc, "button", { type: "button", class: "button primary", text: `과제 완료 · 🪙 +${Number(task.rewardCoin) || 0}` });
      const act = async action => { retry.disabled = complete.disabled = true;status.textContent = "처리하고 있어요…";try { await onReview(action, feedback.value);status.textContent = action === "complete" ? "완료 처리하고 코인을 지급했습니다." : "학생에게 다시 보냈습니다.";setTimeout(close, 320); } catch (error) { status.textContent = error.message || "처리하지 못했습니다.";retry.disabled = complete.disabled = false; } };
      retry.onclick = () => act("retry");complete.onclick = () => act("complete");
      const answerText = el(doc, "div", { class: "task-submission-text", text: task.answer || "작성된 글이 없습니다." }), image = task.imageData ? el(doc, "img", { class: "task-submission-image", src: task.imageData, alt: "학생이 첨부한 과제 이미지" }) : el(doc, "p", { class: "muted", text: "첨부 이미지 없음" });
      root.append(header(doc, task, `${task.nickname || task.userId || "학생"}님의 제출`), el(doc, "section", { class: "task-review-grid" }, [el(doc, "article", { class: "task-review-content" }, [el(doc, "h2", { text: "제출 내용" }), answerText, image]), el(doc, "aside", { class: "task-review-actions" }, [el(doc, "h2", { text: "검토" }), feedback, count, el(doc, "div", { class: "task-review-buttons" }, [retry, complete]), status])]));setTimeout(() => feedback.focus(), 80);
    }, sourceDoc);
  }

  return { openStudent, openReview, compactImage, desktop, ANSWER_MAX, FEEDBACK_MAX, IMAGE_MAX_CHARS };
})();
