/* 과제 화면. 수신과 제출만 담당하며 과제 배정은 관리자 기능에 위임합니다. */
MiniTalk.Features.Tasks = (() => {
  let tasks = {};

  MiniTalk.Events.on("rt:tasks", value => {
    tasks = value || {};
    MiniTalk.Store.set("tasks", tasks);
    if (MiniTalk.Store.get("route") === "tasks") {
      render(MiniTalk.UI.Dom.byId("viewHost"));
    }
  });

  function render(host) {
    if (!host) return;
    const D = MiniTalk.UI.Dom;
    const view = D.el("section", { class: "view" });
    const list = D.el("div", { class: "card-list" });
    const assigned = D.el("section", { class: "assigned-tasks" });
    const assignedList = D.el("div", { class: "assigned-task-list" });
    Object.values(tasks).forEach(task => assignedList.append(taskCard(task)));
    if (!assignedList.children.length) {
      assignedList.append(D.el("div", { class: "empty-state compact-empty" }, [
        D.el("span", { text: "✓" }),
        D.el("strong", { text: "받은 과제가 없어요" }),
        D.el("small", { class: "muted", text: "오늘의 수학·국어 퀘스트부터 도전해 보세요." })
      ]));
    }
    assigned.append(
      D.el("div", { class: "section-label" }, [
        D.el("strong", { text: "받은 과제" }),
        D.el("small", { class: "muted", text: `${Object.keys(tasks).length}개` })
      ]),
      assignedList
    );
    list.append(
      MiniTalk.Tasks.DailyMathQuest.render(() => render(host)),
      MiniTalk.Tasks.DailyKoreanQuest.render(() => render(host)),
      assigned
    );
    view.append(list);
    host.replaceChildren(view);
  }

  function taskCard(task) {
    const D = MiniTalk.UI.Dom;
    const submitted = task.status === "submitted";
    const answer = D.el("textarea", { placeholder: "답안" });
    answer.value = task.answer || "";
    const submit = D.el("button", {
      class: "button primary",
      type: "button",
      text: submitted ? "다시 제출" : "제출"
    });

    submit.onclick = async () => {
      submit.disabled = true;
      try {
        await MiniTalk.Realtime.submitTask(task.id, answer.value);
        MiniTalk.UI.Shell.toast("답안을 제출했습니다.");
      } catch (error) {
        MiniTalk.UI.Shell.toast(error.message || "제출에 실패했습니다.");
      } finally {
        submit.disabled = false;
      }
    };

    return D.el("article", { class: "task-card" }, [
      D.el("strong", { text: task.title || "과제" }),
      D.el("p", { class: "muted", text: task.description || "" }),
      answer,
      submit,
      D.el("small", { class: "muted", text: submitted ? "제출됨" : "미제출" })
    ]);
  }

  return { id: "tasks", title: "과제", icon: "✓", render };
})();

MiniTalk.Registry.register(MiniTalk.Features.Tasks);
