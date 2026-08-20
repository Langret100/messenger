/* 금요일 09:00~23:59에만 열리는 초6 수학·국어 통합 20문항 주간 미션.
 * 시간 판단과 카운트다운은 사용 중인 기기의 로컬 시간을 기준으로 합니다.
 */
MiniTalk.Tasks=MiniTalk.Tasks||{};
MiniTalk.Tasks.FridayGrade6Mission=(()=>{
  const OPEN_HOUR=9,TOTAL=20,PATH="moaru/v3/fridayMission",REWARD_TYPE="WEEKLY_CHECK_OVER80",REWARD_COIN=3;
  const mathCats=["분수·소수","비와 비율","도형","자료 해석","문장제"];
  const korBank=[
    ["독해","'비가 와서 운동회가 연기되었다.'에서 운동회가 연기된 까닭은?","비가 와서",["비가 와서","날씨가 더워서","학생이 적어서","운동장이 넓어서"]],
    ["독해","글에서 반복되거나 강조되는 내용을 살펴보는 주된 까닭은?","중심 생각을 찾기 위해",["중심 생각을 찾기 위해","글자 수를 세기 위해","문장부호를 찾기 위해","종이 크기를 알기 위해"]],
    ["독해","설명하는 글을 읽을 때 내용 이해에 가장 도움이 되는 것은?","문단별 핵심 내용을 정리하기",["문단별 핵심 내용을 정리하기","모든 문장을 외우기","제목을 가리기","글자 모양만 살피기"]],
    ["독해","주장하는 글에서 가장 먼저 확인해야 할 것은?","글쓴이의 주장과 근거",["글쓴이의 주장과 근거","문장의 개수","글씨의 크기","사용한 종이"]],
    ["어휘","'성실하다'와 뜻이 가장 가까운 말은?","부지런하다",["부지런하다","게으르다","시끄럽다","급하다"]],
    ["어휘","'예상'의 뜻으로 알맞은 것은?","앞으로의 일을 미리 생각함",["앞으로의 일을 미리 생각함","지난 일을 모두 잊음","소리를 크게 냄","물건을 나누어 줌"]],
    ["어휘","'갈등'의 뜻으로 가장 알맞은 것은?","서로 생각이나 마음이 맞지 않아 부딪힘",["서로 생각이나 마음이 맞지 않아 부딪힘","모두 같은 의견을 가짐","아무 일도 일어나지 않음","즐겁게 놀이를 함"]],
    ["어휘","'근거'의 뜻으로 알맞은 것은?","주장이나 판단을 뒷받침하는 까닭",["주장이나 판단을 뒷받침하는 까닭","글의 제목을 꾸미는 그림","문장을 짧게 만드는 부호","모르는 낱말의 발음"]],
    ["문법","문장에서 주어를 고르세요. '민지가 책을 읽었다.'","민지가",["민지가","책을","읽었다","책을 읽었다"]],
    ["문법","'아주 예쁜 꽃'에서 '꽃'을 꾸며 주는 말은?","예쁜",["예쁜","꽃","아주","아주 꽃"]],
    ["문법","'철수가 운동장에서 공을 찼다.'에서 목적어는?","공을",["철수가","운동장에서","공을","찼다"]],
    ["문법","다음 중 높임 표현이 바른 문장은?","할머니께서 진지를 드십니다.",["할머니께서 진지를 드십니다.","할머니가 밥을 먹어.","할머니께서 밥을 먹는다.","할머니가 진지를 먹는다."]],
    ["맞춤법","맞춤법이 바른 것은?","할게요",["할게요","할께요","할 게요","할께 요"]],
    ["맞춤법","띄어쓰기가 바른 것은?","할 수 있다",["할 수 있다","할수 있다","할 수있다","할수있다"]],
    ["맞춤법","맞춤법이 바른 낱말은?","며칠",["며칠","몇일","몃일","몇 칠"]],
    ["맞춤법","다음 중 바르게 쓴 것은?","금세",["금세","금새","금 쎄","금쌔"]],
    ["추론","'우산을 든 사람들이 많고 길이 젖어 있다.'에서 짐작할 수 있는 것은?","비가 왔거나 오고 있다",["비가 왔거나 오고 있다","눈이 많이 왔다","날씨가 매우 덥다","바람이 전혀 없다"]],
    ["추론","등장인물이 문을 세게 닫고 대답을 짧게 했다면 짐작할 수 있는 마음은?","화가 났다",["화가 났다","매우 즐겁다","졸리다","배가 고프다"]],
    ["추론","친구가 계속 시계를 보며 발을 동동 구르고 있다. 가장 알맞은 짐작은?","시간에 늦을까 걱정하고 있다",["시간에 늦을까 걱정하고 있다","잠이 들어 있다","배가 아주 부르다","날씨가 추워 즐겁다"]],
    ["추론","식물의 잎이 축 늘어지고 흙이 매우 말라 있다. 가장 먼저 할 일은?","물을 주고 상태를 살핀다",["물을 주고 상태를 살핀다","잎을 모두 떼어 낸다","햇빛을 완전히 가린다","화분을 버린다"]]
  ];

  const nowMs=()=>Date.now();
  const nowDate=()=>new Date();
  function weekKey(d=nowDate()){const x=new Date(d);const day=(x.getDay()+6)%7;x.setDate(x.getDate()-day);return`${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,"0")}-${String(x.getDate()).padStart(2,"0")}`}
  function user(){return MiniTalk.Store.get("user")||{}}
  function path(){return`${PATH}/${String(user().user_id||"guest").replace(/[.#$\[\]\/]/g,"_")}/${weekKey()}`}
  function windowInfo(now=nowDate()){
    const current=new Date(now),day=current.getDay(),open=new Date(current);open.setHours(OPEN_HOUR,0,0,0);
    if(day===5&&current>=open){const close=new Date(current);close.setHours(23,59,59,999);return{open:true,next:close,now:current}}
    let days=(5-day+7)%7;if(days===0&&current<open)days=0;else if(days===0)days=7;
    const next=new Date(current);next.setDate(current.getDate()+days);next.setHours(OPEN_HOUR,0,0,0);return{open:false,next,now:current}
  }
  function remainLabel(){const info=windowInfo();if(!info.next)return"잠시 후";const ms=Math.max(0,info.next.getTime()-nowMs()),mins=Math.ceil(ms/60000),days=Math.floor(mins/1440),hours=Math.floor((mins%1440)/60),m=mins%60;return days?`${days}일 ${hours}시간 ${m}분`:`${hours}시간 ${m}분`}
  function hash(t){let h=2166136261;for(const c of t){h^=c.charCodeAt(0);h=Math.imul(h,16777619)}return h>>>0}
  function rng(seed){let s=seed>>>0;return()=>{s+=0x6D2B79F5;let v=s;v=Math.imul(v^(v>>>15),v|1);v^=v+Math.imul(v^(v>>>7),v|61);return((v^(v>>>14))>>>0)/4294967296}}
  function between(r,a,b){return a+Math.floor(r()*(b-a+1))}
  function shuffle(items,r){const out=items.slice();for(let i=out.length-1;i>0;i--){const j=Math.floor(r()*(i+1));[out[i],out[j]]=[out[j],out[i]]}return out}
  function q(subject,category,text,answer,choices,r){const unique=[...new Set(choices.map(String))];while(unique.length<4)unique.push(`${answer} ${unique.length}`);return{subject,category,text,answer:String(answer),choices:shuffle(unique.slice(0,4),r)}}

  function makeQuestions(){
    const r=rng(hash(`${weekKey()}|${user().user_id||"guest"}|grade6-v2`)),rows=[];
    for(let i=0;i<10;i++){
      const cat=mathCats[i%mathCats.length];
      if(cat==="분수·소수"){
        const a=between(r,12,95)/10,b=between(r,1,9)/10,ans=(a+b).toFixed(1);
        rows.push(q("수학",cat,`${a.toFixed(1)} + ${b.toFixed(1)} = ?`,ans,[ans,(a+b+.1).toFixed(1),(a+b-.1).toFixed(1),Math.max(0,a-b).toFixed(1)],r));
      }else if(cat==="비와 비율"){
        const d=between(r,4,10),n=between(r,1,d-1),ans=`${Math.round(n/d*100)}%`;
        rows.push(q("수학",cat,`${d}명 중 ${n}명은 약 몇 %인가요?`,ans,[ans,`${n*10}%`,`${d*10}%`,`${Math.round(d/n*100)}%`],r));
      }else if(cat==="도형"){
        const w=between(r,3,12),h=between(r,3,12),ans=String(w*h);
        rows.push(q("수학",cat,`가로 ${w}cm, 세로 ${h}cm인 직사각형의 넓이는?`,ans,[ans,String(w+h),String(2*(w+h)),String(w*h+1)],r));
      }else if(cat==="자료 해석"){
        let vals=[between(r,20,90),between(r,20,90),between(r,20,90)];while(new Set(vals).size<3)vals=[between(r,20,90),between(r,20,90),between(r,20,90)];
        const ans=String(Math.max(...vals));rows.push(q("수학",cat,`세 반의 모은 책 수가 ${vals.join(", ")}권입니다. 가장 많은 반의 책 수는?`,ans,vals.map(String).concat(String(Math.min(...vals)-1)),r));
      }else{
        const price=between(r,2,9)*100,count=between(r,2,6),ans=String(price*count);
        rows.push(q("수학",cat,`${price}원짜리 공책 ${count}권의 값은?`,ans,[ans,String(price+count),String(price*(count-1)),String(price*count+100)],r));
      }
    }
    shuffle(korBank,r).slice(0,10).forEach(([cat,text,ans,choices])=>rows.push(q("국어",cat,text,ans,choices,r)));
    return shuffle(rows,r).slice(0,TOTAL).map((x,i)=>({...x,id:`q${i+1}`}));
  }

  async function saveAnswer(expectedIndex,answer,questions){
    const key=path();
    return MiniTalk.Realtime.cloudTransaction(key,current=>{
      if(current?.completed)return current;
      const existing=Array.isArray(current?.answers)?current.answers:[];
      const index=Math.max(0,Math.min(questions.length,Number(current?.index)||0));
      if(index!==expectedIndex)return current||{week:weekKey(),index:0,answers:[],completed:false};
      const nextAnswers=existing.concat(answer);
      return{week:weekKey(),index:index+1,answers:nextAnswers,completed:false,updatedAt:nowMs()};
    });
  }

  async function open(){
    if(user().isGuest)return MiniTalk.UI.Shell.toast("로그인 후 참여할 수 있습니다.");
    const gate=windowInfo();if(!gate.open)return MiniTalk.UI.Shell.toast(`금요일 오전 9시까지 ${remainLabel()} 남았습니다.`);
    const questions=makeQuestions(),saved=await MiniTalk.Realtime.cloudGet(path(),null);
    if(saved?.completed){const checked=await ensureWeeklyReward(saved);return showReport(checked||saved)}
    let index=Math.max(0,Math.min(questions.length,Number(saved?.index)||0)),answers=Array.isArray(saved?.answers)?saved.answers:[];
    const D=MiniTalk.UI.Dom,body=D.el("div",{class:"friday-solver modal-stack"});
    function draw(){
      body.replaceChildren();if(!windowInfo().open){MiniTalk.UI.Shell.closeModal();MiniTalk.UI.Shell.toast("이번 주 학습점검 시간이 끝났습니다.");return}
      if(index>=questions.length)return finish();
      const cur=questions[index],grid=D.el("div",{class:"quest-choice-grid"});
      cur.choices.forEach(choice=>{const b=D.el("button",{class:"quest-choice",type:"button",text:choice});b.onclick=async()=>{grid.querySelectorAll("button").forEach(x=>x.disabled=true);const entry={id:cur.id,subject:cur.subject,category:cur.category,correct:choice===cur.answer,answer:choice};try{const savedNow=await saveAnswer(index,entry,questions);index=Math.max(0,Math.min(questions.length,Number(savedNow?.index)||index+1));answers=Array.isArray(savedNow?.answers)?savedNow.answers:answers.concat(entry);draw()}catch(error){MiniTalk.UI.Shell.toast("답안을 저장하지 못했습니다. 다시 눌러주세요.");draw()}};grid.append(b)});
      body.append(D.el("div",{class:"quest-solver-progress"},[D.el("span",{text:`${cur.subject} · ${cur.category}`}),D.el("strong",{text:`${index+1} / ${questions.length}`})]),D.el("div",{class:"quest-question",text:cur.text}),grid)
    }
    async function finish(){
      const report=buildReport(answers),record={week:weekKey(),index:questions.length,answers,completed:true,report,completedAt:nowMs(),updatedAt:nowMs()};
      const savedFinal=await MiniTalk.Realtime.cloudTransaction(path(),current=>current?.completed?current:{...record,answers:Array.isArray(current?.answers)&&current.answers.length>=answers.length?current.answers:answers});
      const rewarded=await ensureWeeklyReward(savedFinal||record);
      MiniTalk.UI.Shell.closeModal();showReport(rewarded||savedFinal||record)
    }
    MiniTalk.UI.Shell.modal("금요일 초6 학습점검",body);draw()
  }


  function scorePercent(record){const r=record?.report||buildReport(record?.answers||[]);return r.total?Math.round((Number(r.score)||0)/(Number(r.total)||1)*100):0}
  function rewardEligible(record){return scorePercent(record)>80}
  async function ensureWeeklyReward(record){
    if(!record?.completed||!rewardEligible(record))return record;
    if(record?.reward?.acknowledged===true)return record;
    const currentUser=user();if(!currentUser?.user_id||currentUser.isGuest)return record;
    try{
      const body=new URLSearchParams({mode:"coin_reward",user_id:String(currentUser.user_id),reward_type:REWARD_TYPE,reward_key:String(record.week||weekKey())});
      const response=await fetch(MiniTalkConfig.sheetUrl,{method:"POST",body});
      if(!response.ok)throw new Error(`HTTP ${response.status}`);
      const result=await response.json();if(!result||result.ok===false)throw new Error(result?.error||"주간 보상 요청 실패");
      const granted=result.applied!==false&&result.granted!==false;
      const reward={eligible:true,amount:REWARD_COIN,acknowledged:true,granted,updatedAt:nowMs()};
      const saved=await MiniTalk.Realtime.cloudTransaction(path(),current=>current?.completed?{...current,reward}:current);
      const nextCoin=Number(result.newCoin);
      if(Number.isFinite(nextCoin))MiniTalk.Economy.CoinWallet?.setLocal?.(nextCoin,"friday-weekly-reward");
      else MiniTalk.Economy.CoinWallet?.refresh?.(true).catch(()=>{});
      if(granted)MiniTalk.UI.Shell.toast(`금요일 학습점검 보상 · 코인 ${REWARD_COIN}개 적립!`);
      return saved||{...record,reward};
    }catch(error){
      console.warn("금요일 학습점검 코인 보상 실패",error);
      MiniTalk.UI.Shell.toast("점검 결과는 저장됐지만 코인 보상 확인이 지연되고 있습니다. 다시 열면 재확인합니다.");
      return record;
    }
  }

  function buildReport(answers){const groups={};answers.forEach(a=>{const key=`${a.subject} · ${a.category}`,g=groups[key]||(groups[key]={correct:0,total:0});g.total++;if(a.correct)g.correct++});const rows=Object.entries(groups).map(([name,g])=>({name,...g,rate:Math.round(g.correct/g.total*100)})).sort((a,b)=>a.rate-b.rate),score=answers.filter(a=>a.correct).length;return{score,total:answers.length,rows,weak:rows.slice(0,3).map(r=>r.name),strong:[...rows].sort((a,b)=>b.rate-a.rate).slice(0,3).map(r=>r.name)}}
  function showReport(record){const D=MiniTalk.UI.Dom,r=record.report||buildReport(record.answers||[]),percent=scorePercent(record),eligible=percent>80,reward=record.reward||{},rewardText=eligible?(reward.acknowledged?`보상 ${REWARD_COIN}코인 · ${reward.granted?"적립 완료":"이미 적립됨"}`:`보상 ${REWARD_COIN}코인 · 적립 확인 중`):`80점을 넘어야 보상 ${REWARD_COIN}코인을 받을 수 있어요`,body=D.el("div",{class:"friday-report modal-stack"},[D.el("h3",{text:`이번 주 ${r.score}/${r.total}문항 정답 · ${percent}점`}),D.el("section",{class:`friday-reward-card section-card ${eligible?"earned":"missed"}`},[D.el("div",{class:"friday-reward-title"},[D.el("img",{src:"assets/ui/notebook-coin.svg",alt:""}),D.el("strong",{text:eligible?`주간 보상 +${REWARD_COIN}`:"주간 보상"})]),D.el("p",{text:rewardText}),D.el("small",{class:"muted",text:"금요일 학습점검은 80점 초과 시 주 1회 보상됩니다."})]),D.el("div",{class:"friday-bars"},r.rows.map(x=>D.el("div",{class:"friday-bar-row"},[D.el("span",{text:x.name}),D.el("i",{style:`--rate:${x.rate}%`}),D.el("b",{text:`${x.rate}%`})]))),D.el("section",{class:"section-card"},[D.el("strong",{text:"잘한 점"}),D.el("p",{text:(r.strong||[]).join(", ")||"영역별 기록을 더 모아보세요."})]),D.el("section",{class:"section-card"},[D.el("strong",{text:"보완하면 좋은 점"}),D.el("p",{text:(r.weak||[]).join(", ")||"특별히 낮은 영역이 없습니다."}),D.el("small",{class:"muted",text:"낮은 영역의 기본 개념을 다시 확인하고 비슷한 문제를 천천히 풀어보세요."})])]);MiniTalk.UI.Shell.modal("이번 주 학습 피드백",body)}
  function render(){const D=MiniTalk.UI.Dom,info=windowInfo(),card=D.el("section",{class:`friday-mission-card section-card ${info.open?"open":"locked"}`},[D.el("div",{class:"friday-mission-copy"},[D.el("div",{class:"friday-mission-eyebrow",text:"주간 미션"}),D.el("strong",{text:"금요일 초6 학습점검"}),D.el("small",{class:"muted",text:`수학·국어 20문항 · 80점 초과 시 🪙 +${REWARD_COIN}`}),D.el("b",{class:"friday-countdown",text:info.open?"오늘 자정 전까지 참여 가능":`열리기까지 ${remainLabel()}`})]),info.open?D.el("button",{class:"button primary compact-button friday-start-button",type:"button",text:"시작",disabled:user().isGuest,onclick:open}):D.el("div",{class:"friday-lock-overlay","aria-hidden":"true"},[D.el("span",{text:"🔒"})])]);if(!info.open){const label=card.querySelector(".friday-countdown"),timer=setInterval(()=>{if(!card.isConnected)return clearInterval(timer);const next=windowInfo();if(next.open){clearInterval(timer);if(MiniTalk.Store.get("route")==="tasks")MiniTalk.Features.Tasks.render(MiniTalk.UI.Dom.byId("viewHost"));return}label.textContent=`열리기까지 ${remainLabel()}`},30000)}return card}
  return{render,open,windowInfo,makeQuestions,buildReport,weekKey,scorePercent,rewardEligible,ensureWeeklyReward};
})();
