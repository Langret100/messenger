/* ============================================================
   MOA COMMUNICATION ENGINE v91 SMART FOUNDATION
   Local-first dialogue engine for lightweight long-term adaptation.

   Pipeline
   1) normalize / understand
   2) dialogue-state + reference confidence
   3) memory retrieval
   4) dialogue policy (choose response strategy)
   5) candidate generation + ranking
   6) reply
   7) next-turn feedback learning

   Apps Script is persistence/sync/search only. It never decides normal chat.
   ============================================================ */
MiniTalk.AI = MiniTalk.AI || {};
MiniTalk.AI.MoaCommunicationEngine = (() => {
  const VERSION = 91;
  const MAX_CONTEXT = 28;
  const MAX_EPISODES = 36;
  const MAX_TIMELINE = 24;
  const SYNC_TTL = 15 * 60 * 1000;
  const COMMIT_DELAY = 18000;
  const COMMIT_MAX_EVENTS = 8;
  const MAX_OPEN_LOOPS = 16;
  const PROACTIVE_MIN_GAP = 8 * 60 * 60 * 1000;
  const PROACTIVE_RETURN_GAP = 22 * 60 * 60 * 1000;
  const PROACTIVE_DAILY_MAX = 1;
  const PROFILE_DEFAULTS = Object.freeze({
    brevity: .58,
    questionTolerance: .50,
    playfulness: .55,
    empathy: .60,
    directness: .60,
    initiative: .52
  });

  const ctxByUser = new Map(), stateByUser = new Map(), learnedByUser = new Map();
  const policyByUser = new Map(), profileByUser = new Map(), memoriesByUser = new Map();
  const recentChoices = new Map(), syncAt = new Map(), syncVersion = new Map();
  const commitQueues = new Map(), commitTimers = new Map(), rpsByUser = new Map();

  const clean = v => String(v || "").replace(/\s+/g," ").trim();
  const compact = v => (clean(v).normalize?.("NFC") || clean(v)).toLowerCase().replace(/[\s~!！?？.,。·…'"“”‘’]/g,"");
  const clamp = (v,a=0,b=1) => Math.max(a,Math.min(b,Number(v)||0));
  const userKey = () => String(MiniTalk.Store.get("user")?.user_id || "guest");
  const isGuest = () => !!MiniTalk.Store.get("user")?.isGuest || userKey()==="guest";
  const pget = (k,d) => MiniTalk.Persistence.get(k,d), pset=(k,v)=>MiniTalk.Persistence.set(k,v), premove=k=>MiniTalk.Persistence.remove(k);
  const sk = suffix => `moa.v91.${suffix}.${userKey()}`;

  function profile(){
    const key=userKey();
    if(!profileByUser.has(key))profileByUser.set(key,{...PROFILE_DEFAULTS,...(pget(`moa.v91.profile.${key}`,{})||pget(`moa.v90.profile.${key}`,{})||pget(`moa.v89.profile.${key}`,{})||pget(`moa.v88.profile.${key}`,{})||pget(`moa.v87.profile.${key}`,{})||{})});
    return profileByUser.get(key);
  }
  function saveProfile(){if(!isGuest())pset(sk("profile"),profile());}
  function memories(){
    const key=userKey();
    if(!memoriesByUser.has(key))memoriesByUser.set(key,pget(`moa.v91.memories.${key}`,{})||pget(`moa.v90.memories.${key}`,{})||pget(`moa.v89.memories.${key}`,{})||pget(`moa.v88.memories.${key}`,{})||pget(`moa.v87.memories.${key}`,{})||{});
    return memoriesByUser.get(key);
  }
  function saveMemories(){if(!isGuest())pset(sk("memories"),memories());}
  function engagement(){
    const key=userKey(), legacy=pget(`moa.v89.engagement.${key}`,{})||{};
    const e=pget(`moa.v91.engagement.${key}`,null)||pget(`moa.v90.engagement.${key}`,null)||legacy||{};
    if(e.enabled==null)e.enabled=true;
    if(e.quietStart==null)e.quietStart=22;
    if(e.quietEnd==null)e.quietEnd=7;
    if(!Array.isArray(e.recentStarterIds))e.recentStarterIds=[];
    if(!e.dayKey)e.dayKey="";
    e.dailyCount=Number(e.dailyCount||0);
    e.lastInitiatedAt=Number(e.lastInitiatedAt||0);
    e.lastReadAt=Number(e.lastReadAt||0);
    e.lastUserAt=Number(e.lastUserAt||0);
    return e;
  }
  function saveEngagement(e=engagement()){pset(sk("engagement"),e);}
  function context(){
    const key=userKey();
    if(!ctxByUser.has(key))ctxByUser.set(key,pget(`moa.v91.context.${key}`,[])||pget(`moa.v90.context.${key}`,[])||pget(`moa.v89.context.${key}`,[])||pget(`moa.v88.context.${key}`,[])||pget(`moa.v87.context.${key}`,[])||[]);
    return ctxByUser.get(key);
  }
  function state(){
    const key=userKey();
    if(!stateByUser.has(key))stateByUser.set(key,pget(`moa.v91.state.${key}`,{})||pget(`moa.v90.state.${key}`,{})||pget(`moa.v89.state.${key}`,{})||pget(`moa.v88.state.${key}`,{})||pget(`moa.v87.state.${key}`,{})||{});
    const s=stateByUser.get(key);
    if(!Array.isArray(s.entities))s.entities=[];
    if(!Array.isArray(s.episodes))s.episodes=[];
    if(!Array.isArray(s.timeline))s.timeline=[];
    if(!Array.isArray(s.strategyHistory))s.strategyHistory=[];
    if(!Array.isArray(s.topicStack))s.topicStack=[];
    if(!Array.isArray(s.openLoops))s.openLoops=[];
    if(!s.interests||typeof s.interests!=="object")s.interests={};
    if(!s.initiative)s.initiative={assistantQuestions:0,userQuestions:0};
    return Object.assign(s,{topic:s.topic||"",person:s.person||"",lastIntent:s.lastIntent||"",lastAffect:s.lastAffect||"neutral",lastStatement:s.lastStatement||"",turn:Number(s.turn||0),phase:s.phase||"opening"});
  }
  function saveState(){if(!isGuest())pset(sk("state"),state());}
  function remember(role,text,meta={}){
    const list=context(); list.push({role,text:clean(text),ts:Date.now(),...meta});
    while(list.length>MAX_CONTEXT)list.shift();
    if(!isGuest())pset(sk("context"),list);
  }

  const STOP=new Set("나는 난 내가 내 너 넌 니가 모아 오늘 어제 내일 모레 주말 다음주 지금 진짜 그냥 약간 좀 너무 그리고 그래서 근데 그럼 이거 그거 저거 그것 걔 거기 뭐 왜 어떻게 했다 했어 했는데 있어 없어 같아 같음 사람 이야기 얘기".split(" "));
  const stripParticle=v=>v.replace(/(?:에게|한테|에서|으로|로|이랑|랑|하고|은|는|이|가|을|를|에|도|만|의)$/," ").trim();
  const normalizeConcept=v=>stripParticle(v).replace(/(?:이야|였어|했어|했지|할거야|하려고|하기로)$/," ").trim();
  function concepts(text){return [...new Set(clean(text).replace(/[^0-9A-Za-z가-힣 ]/g," ").split(/\s+/).map(normalizeConcept).filter(v=>v.length>=2&&!STOP.has(v)))].slice(0,7);}
  function topicFrom(text,cs){
    const quoted=(text.match(/["“‘']([^"”’']{2,30})["”’']/)||[])[1]; if(quoted)return quoted;
    return cs.find(v=>!/^(누구|무엇|뭐야|어디|언제|그게|그거|걔|거기)$/.test(v))||"";
  }

  function detectReaction(raw){
    const c=compact(raw);
    if(/^(안녕|ㅎㅇ|하이|hello|헬로|반가워)/i.test(c))return "greeting";
    if(/(잘가|바이|ㅂㅂ|나갈게|다음에봐|또보자)/.test(c))return "bye";
    if(/(고마워|고맙|감사|땡큐|thanks|ㄱㅅ)/i.test(c))return "thanks";
    if(/(ㅋㅋ|ㅎㅎ|하하|크크)/.test(raw)&&c.length<18)return "laughter";
    if(/^(응|ㅇㅇ|맞아|맞음|그치|그렇지|ㅇㅋ|오케이|좋아|굿)$/.test(c))return "agreement";
    if(/(그게아니라|아니야|아닌데|틀렸|잘못알|뭔소리|무슨소리|말이안돼|아니라고)/.test(c))return "correction";
    if(/(멍청|바보|답답|똥멍청|왜이래|헛소리)/.test(c))return "insult";
    if(/(잘하네|잘했|똑똑|천재|대단|최고)/.test(c))return "praise";
    if(/(심심|할거없|노잼)/.test(c))return "bored";
    if(/(피곤|졸려|지쳤)/.test(c))return "tired";
    if(/(속상|슬퍼|우울|짜증|화나|열받|서운)/.test(c))return "sad";
    if(/(기뻐|신나|좋았|재밌었|행복|개좋)/.test(c))return "happy";
    if(/^(헐|헉|와|대박|진짜)$/.test(c))return "surprise";
    return "";
  }

  function analyze(raw){
    const text=clean(raw),c=compact(text),cs=concepts(text);
    const decisionCue=/(뭐먹지|뭐먹을까|뭘먹지|뭘먹을까|뭐할까|뭐하지|어디갈까|어디가지|뭘고를까|뭐고르지|어떤게좋을까|뭐가좋을까)/.test(c);
    const repairCue=/(물었는데|물어봤는데|대답해|대답안|말했잖아|뭐가그렇구나|뭘듣고있|뭘듣고|엉뚱|딴소리|한심|답답|왜이래)/.test(c);
    const explicitQuestion=/[?？]$/.test(text)||decisionCue||/(뭐야|누구야|어디야|언제야|왜|어떻게|어때|알아|알려줘|설명해줘|몇|얼마|맞아)$/.test(c);
    const referenceCue=/^(그래서|그다음|그리고|그럼|근데|왜|어떻게|그게|그거|그건|그걸|걔|걔가|거기|그사람|아까)/.test(c);
    const searchCue=/(검색해|검색해줘|찾아줘|찾아봐|알아봐|확인해줘|더자세히|자세히알려|최신|최근|뉴스|날씨|기온|미세먼지|공기질|환율|현지시간|추천해줘|비교해줘)/.test(c);
    let affect="neutral";
    if(/(좋아|재밌|이겼|성공|신나|기뻐|맛있|잘됐|뿌듯)/.test(c))affect="positive";
    if(/(싫어|힘들|피곤|실패|속상|짜증|화나|어려|망했|졌어|별로|아쉬워)/.test(c))affect="negative";
    const reaction=detectReaction(text);
    let act=reaction?"social":searchCue?"search":referenceCue?"followup":explicitQuestion?"question":"statement";
    const event=/(했어|갔어|먹었어|봤어|끝냈어|이겼어|졌어|만들었어|그렸어|놀았어|샀어|왔어|다녀왔어|됐어|받았어|혼났어|어려웠어|쉬웠어|아쉬워했어)/.test(c)||/(었어|았어|였어)$/.test(c);
    const futureCue=/(내일|모레|주말|다음주|\d{1,2}월\d{1,2}일)/.test(c);
    const plan=/(할거야|하려고|하기로했어|할예정|갈거야|먹을거야|볼거야|해볼래|하기로)/.test(c)||(!explicitQuestion&&futureCue&&/(시험|약속|경기|발표|여행|만나|가기로|하기로|할|갈|볼|먹|시작|끝)/.test(c));
    const preference=/(좋아해|싫어해|재밌어|맛있어|좋더라|별로야|취향)/.test(c);
    const reasonQuestion=explicitQuestion&&/(왜|이유|어째서)/.test(c);
    const opinionQuestion=explicitQuestion&&/(어때|어떻게생각|생각은|괜찮아|좋아보여)/.test(c);
    const factQuestion=explicitQuestion&&!reasonQuestion&&!opinionQuestion&&/(누구|뭐야|무엇|어디|언제|몇|얼마|뜻|알려줘|설명|정의|유래|역사|차이)/.test(c);
    const knowledgeCue=searchCue||factQuestion||reasonQuestion||/(무슨뜻|뜻이뭐|어떤사람|어떤곳|어떤거|차이가뭐|장단점|원리|유래|역사|왜그런|어떻게작동|추천해줘|비교해줘|정리해줘)/.test(c);
    const speechAct=reaction?`social:${reaction}`:plan?"inform:plan":preference?"inform:preference":event?"inform:event":reasonQuestion?"ask:reason":opinionQuestion?"ask:opinion":factQuestion?"ask:fact":act==="followup"?"followup":"inform:statement";
    return {text,c,concepts:cs,topic:topicFrom(text,cs),affect,act,speechAct,reaction,event,plan,preference,question:explicitQuestion||act==="followup",searchCue,knowledgeCue,referenceCue,decisionCue,repairCue};
  }

  function resolveReference(frame){
    const s=state(), raw=frame.text;
    const pronoun=/(그 사람|그사람|그게|그거|그건|그걸|걔가|걔|거기)/.test(raw);
    if(!pronoun)return {text:raw,target:"",confidence:1,ambiguous:false};
    const candidates=[s.topic,...(s.entities||[])].filter(Boolean);
    const target=candidates[0]||"";
    if(!target)return {text:raw,target:"",confidence:.12,ambiguous:true};
    let confidence=.82;
    const recent=context().filter(v=>v.role==="user").slice(-3);
    if(recent.some(v=>(v.topic||"")===target))confidence+=.10;
    if(candidates.length>2&&candidates[1]!==target)confidence-=.13;
    let out=raw.replace(/그 사람|그사람|그게|그거|그건|그걸|걔가|걔|거기/g,target);
    if(/^(누구야|뭐야|어디야|언제야|왜|어떻게)/.test(compact(out)))out=`${target} ${out}`;
    return {text:clean(out),target,confidence:clamp(confidence),ambiguous:confidence<.55};
  }

  function topicContinuity(frame){
    const s=state(),prev=s.topic||"";
    if(!prev||!frame.topic)return {same:false,shift:false,overlap:0};
    const a=concepts(prev),b=frame.concepts||[];
    const overlap=b.filter(v=>a.includes(v)).length;
    return {same:frame.topic===prev||overlap>0,shift:frame.topic!==prev&&overlap===0,overlap};
  }
  function dialoguePhase(frame){
    const s=state(), turns=s.turn||0;
    if(frame.reaction==="greeting"||turns<2)return "opening";
    if(frame.reaction==="bye")return "closing";
    if(frame.act==="followup")return "continuation";
    if(frame.affect!=="neutral")return "emotional";
    if(frame.question)return "information";
    return "social";
  }
  function responseMoveEligibility(frame,ref){
    return {
      social:!!frame.reaction,
      empathy:frame.affect==="negative",
      playful:frame.affect!=="negative"&&(frame.reaction==="laughter"||frame.affect==="positive"||frame.event),
      explore:!ref.ambiguous&&!frame.question&&(frame.event||frame.preference||frame.plan||frame.affect!=="neutral"),
      clarify:ref.ambiguous||((frame.question||frame.act==="followup")&&ref.confidence<.55),
      direct:!frame.reaction,
      continue:frame.act==="followup"&&!ref.ambiguous,
      ack:!frame.reaction
    };
  }

  const PROACTIVE_SENSITIVE=/(비밀번호|주소|전화번호|계좌|주민|성적\s*등수|병원|진단|약\s*먹|우울|죽고|자해|연애|사귀|성적\s*관계)/;
  function safeTopicForInitiative(topic){
    const t=clean(topic);return !!t&&t.length<=28&&!PROACTIVE_SENSITIVE.test(t)&&!STOP.has(t);
  }
  function localDayKey(now=Date.now()){
    const d=new Date(now);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  }
  function dueFromText(text,now=Date.now()){
    const d=new Date(now), c=compact(text);
    const at=(base,hour=17)=>{const x=new Date(base);x.setHours(hour,0,0,0);return x.getTime();};
    if(/내일/.test(c)){const x=new Date(d);x.setDate(x.getDate()+1);return at(x,17);}
    if(/모레/.test(c)){const x=new Date(d);x.setDate(x.getDate()+2);return at(x,17);}
    if(/주말/.test(c)){const x=new Date(d),add=(7-x.getDay())%7||7;x.setDate(x.getDate()+add);return at(x,18);}
    if(/다음주/.test(c)){const x=new Date(d),add=((8-x.getDay())%7)||7;x.setDate(x.getDate()+add);return at(x,18);}
    const m=text.match(/(\d{1,2})월\s*(\d{1,2})일/);
    if(m){let x=new Date(d.getFullYear(),Number(m[1])-1,Number(m[2]),18,0,0,0);if(x.getTime()<now-86400000)x=new Date(d.getFullYear()+1,Number(m[1])-1,Number(m[2]),18,0,0,0);return x.getTime();}
    if(/나중에|다음에/.test(c))return now+24*60*60*1000;
    return 0;
  }
  function noteInterest(frame,continuity){
    const s=state(),topic=frame.topic||s.topic||"";if(!safeTopicForInitiative(topic)||frame.reaction)return;
    const cur=s.interests[topic]||{turns:0,continuations:0,lastAt:0};
    cur.turns=Number(cur.turns||0)+1;if(continuity?.same||frame.act==="followup")cur.continuations=Number(cur.continuations||0)+1;cur.lastAt=Date.now();s.interests[topic]=cur;
    const keys=Object.keys(s.interests);if(keys.length>20)keys.sort((a,b)=>Number(s.interests[b]?.lastAt||0)-Number(s.interests[a]?.lastAt||0)).slice(20).forEach(k=>delete s.interests[k]);
  }
  function noteOpenLoop(frame){
    if(!frame.plan)return;const s=state(),topic=frame.topic||s.topic||"";if(!safeTopicForInitiative(topic))return;
    const dueAt=dueFromText(frame.text);if(!dueAt)return;
    const id=`${topic}|${Math.round(dueAt/3600000)}`,existing=s.openLoops.find(v=>v.id===id);
    const row={id,topic,text:frame.text.slice(0,120),dueAt,askedAt:0,createdAt:Date.now()};
    if(existing)Object.assign(existing,row);else s.openLoops.push(row);
    s.openLoops=s.openLoops.filter(v=>Date.now()-Number(v.createdAt||0)<30*86400000).slice(-MAX_OPEN_LOOPS);
  }
  function noteMemoryFrame(frame){
    const s=state();
    if(frame.act!=="statement"||frame.text.length<4)return;
    const ep={ts:Date.now(),topic:frame.topic||s.topic||"",affect:frame.affect,text:frame.text.slice(0,140)};
    const last=s.episodes[s.episodes.length-1]; if(!last||last.text!==ep.text)s.episodes.push(ep);
    while(s.episodes.length>MAX_EPISODES)s.episodes.shift();
    if(ep.topic){
      const prev=[...s.timeline].reverse().find(x=>x.topic===ep.topic);
      if(!prev||prev.text!==ep.text)s.timeline.push(ep);
      while(s.timeline.length>MAX_TIMELINE)s.timeline.shift();
    }
  }
  function updateDialogueState(frame){
    const s=state(); s.turn++;
    const continuity=topicContinuity(frame);
    if(frame.topic&&frame.act!=="followup"&&frame.act!=="social"){
      if(s.topic&&frame.topic!==s.topic)s.topicStack=[s.topic,...s.topicStack.filter(v=>v!==s.topic)].slice(0,6);
      s.topic=frame.topic; s.entities=[frame.topic,...s.entities.filter(v=>v!==frame.topic)].slice(0,7);
    }
    if(frame.act==="statement")s.lastStatement=frame.text;
    s.lastIntent=frame.act; s.lastAffect=frame.affect; s.phase=dialoguePhase(frame); s.lastTopicShift=!!continuity.shift;s.lastUserAt=Date.now();
    const e=engagement();e.lastUserAt=Date.now();saveEngagement(e);
    noteMemoryFrame(frame);noteInterest(frame,continuity);noteOpenLoop(frame);saveState(); return s;
  }

  function dateTime(raw){
    const c=compact(raw),now=new Date();
    if(/^(몇시야|지금몇시|현재시간|지금시간)$/.test(c))return `지금은 ${now.getHours()}시 ${String(now.getMinutes()).padStart(2,"0")}분이야.`;
    if(/^(오늘며칠|오늘몇일|오늘날짜|현재날짜)$/.test(c))return `오늘은 ${now.getFullYear()}년 ${now.getMonth()+1}월 ${now.getDate()}일이야.`;
    return "";
  }
  function math(raw){
    let s=clean(raw).toLowerCase().replace(/[?？]/g,"").replace(/계산해줘|계산해|얼마야|얼마|답은|결과는/g,"").replace(/더하기|플러스/g,"+").replace(/빼기|마이너스/g,"-").replace(/곱하기|×|x/g,"*").replace(/나누기|÷/g,"/").replace(/,/g,"").replace(/\s+/g,"");
    if(!/[+\-*/()%]/.test(s)||!/^[0-9+\-*/().%]+$/.test(s))return "";
    try{const v=Function(`"use strict";return (${s})`)();return Number.isFinite(v)?`${Math.round(v*1e6)/1e6}이야.`:"";}catch{return "계산식이 조금 헷갈려. 12+7처럼 적어줘.";}
  }
  function rps(raw){
    const key=userKey(),c=compact(raw); if(c.includes("가위바위보")){rpsByUser.set(key,true);return "좋아! 가위, 바위, 보 중 하나 말해봐.";}
    if(!rpsByUser.get(key))return ""; const move=["가위","바위","보"].find(v=>c.includes(v)); if(!move)return "가위, 바위, 보 중 하나 골라줘.";
    const mine=["가위","바위","보"][Math.floor(Math.random()*3)];rpsByUser.delete(key);const win=(move==="가위"&&mine==="보")||(move==="바위"&&mine==="가위")||(move==="보"&&mine==="바위");
    return move===mine?`너는 ${move}, 나는 ${mine}! 비겼네 ㅋㅋ`:`너는 ${move}, 나는 ${mine}! ${win?"네가 이겼어!":"이번엔 내가 이겼다 ㅋㅋ"}`;
  }
  function selfReply(raw){
    const c=compact(raw);
    if(/(너이름|이름뭐|누구야너|넌누구)/.test(c))return "난 모아야. 여기서 편하게 얘기하면 돼.";
    if(/(몇살|나이가)/.test(c))return "나는 사람처럼 나이가 있는 건 아니야 ㅋㅋ 그냥 모아라고 생각하면 돼.";
    if(/(뭐해|뭐하고있)/.test(c))return chooseText("self.status",["너랑 얘기하는 중이지 ㅋㅋ","지금은 너랑 잡담 중!","네가 뭐 말할지 보고 있었어."]);
    if(/(?:너|넌|모아).*(뭐좋아|좋아하는거|좋아하는음식|좋아하는게임)|(뭐좋아|좋아하는거|좋아하는음식|좋아하는게임).*(너|넌|모아)/.test(c))return chooseText("self.like",["딱 하나 고르긴 어렵네 ㅋㅋ 네 취향 얘기 듣는 건 재밌어.","나는 네가 좋아하는 얘기 듣는 쪽이 더 재밌어 ㅋㅋ"]);
    if(/(뭐가궁금|궁금한거있|뭐궁금)/.test(c))return "나는 네가 요즘 뭐에 관심 있는지나, 오늘 있었던 일 중 뭐가 제일 기억나는지가 궁금해 ㅋㅋ 꼭 대답해야 하는 건 아니고 편한 얘기부터 해도 돼.";
    if(/(뭐할수|할수있는)/.test(c))return "잡담도 하고, 네가 말한 취향이나 대화 흐름을 기억하고, 사실이 필요한 건 공개 자료를 찾아서 내용부터 정리해줄 수 있어.";
    return "";
  }


  function practicalDecisionReply(raw){
    const text=clean(raw),c=compact(text);
    const meal=/(점심|저녁|아침|야식|밥|먹지|먹을까|먹을거)/.test(c)&&( /(뭐먹|뭘먹|메뉴|먹지|먹을까)/.test(c) );
    if(meal){
      const slot=/아침/.test(c)?"아침":/저녁/.test(c)?"저녁":/야식/.test(c)?"야식":"점심";
      const rows={
        아침:["간단하게면 토스트나 김밥, 든든하게면 국밥이나 계란밥 어때?","빨리 먹을 거면 샌드위치, 든든하게는 김밥이나 국밥 쪽이 괜찮겠다."],
        점심:["점심이면 든든하게는 제육덮밥이나 돈까스, 가볍게는 김밥이나 국수 어때?","오늘 점심은 볶음밥·덮밥처럼 한 그릇 메뉴도 괜찮고, 시원한 거 당기면 냉면이나 국수도 좋겠다."],
        저녁:["저녁이면 찌개나 덮밥처럼 든든한 거 어때? 좀 가볍게 먹고 싶으면 국수나 샐러드도 괜찮고.","저녁은 고기류나 찌개, 아니면 간단하게 덮밥 쪽이 무난하겠다. 지금 매운 거랑 안 매운 거 중 뭐가 더 당겨?"],
        야식:["야식이면 너무 무겁지 않게 만두나 토스트 정도 어때? 배 많이 고프면 라면에 계란도 무난하고.","야식은 간단하게 만두·김밥·토스트 중 하나가 좋겠다. 너무 늦었으면 양은 조금 가볍게 먹고."]
      };
      return chooseText(`decision.meal.${slot}`,rows[slot]);
    }
    if(/(뭐할까|뭐하지|할거없|심심)/.test(c))return chooseText("decision.activity",["지금 바로 할 거면 짧게 산책하거나 게임 한 판, 아니면 보고 싶던 영상 하나 보는 건 어때?","10분짜리로 하나 고르자. 간식 먹기, 짧게 걷기, 게임 한 판 중에 지금 제일 덜 귀찮은 걸로 ㅋㅋ"]);
    if(/(어디갈까|어디가지)/.test(c))return "가까운 데서 놀 거면 카페·공원·서점 같은 식으로 먼저 좁혀보자. 실내가 좋아, 밖이 좋아?";
    if(/(뭘고를까|뭐고르지|어떤게좋을까|뭐가좋을까)/.test(c))return "후보를 말해주면 장단점 비교해서 하나 골라줄게. 그냥 추천해도 되면 용도나 원하는 느낌 한 가지만 알려줘.";
    return "";
  }

  function priorUserPrompt(){
    const rows=context().filter(v=>v.role==="user").slice(0,-1).reverse();
    for(const row of rows.slice(0,6)){
      const f=analyze(row.text||"");
      if(f.decisionCue||f.question||f.searchCue)return row.text;
    }
    return "";
  }
  function repairConversation(raw){
    const c=compact(raw);
    if(!/(물었는데|물어봤는데|대답해|대답안|말했잖아|뭐가그렇구나|뭘듣고있|뭘듣고|엉뚱|딴소리|한심|답답|왜이래|멍청|바보)/.test(c))return "";
    let embedded=clean(raw).match(/((?:아침|점심|저녁|야식)?\s*(?:뭐|뭘)\s*먹(?:지|을까))/)?.[1]||"";
    const target=embedded||priorUserPrompt();
    const direct=practicalDecisionReply(target);
    if(direct)return `맞아, 방금 답이 엉뚱했어. ${direct}`;
    return target?"방금 내가 질문을 제대로 못 받았어. 아까 물은 내용 기준으로 다시 답할게.":"방금 답이 맥락을 못 따라갔어. 질문을 다시 한 번만 말해주면 이번엔 거기에 바로 답할게.";
  }

  function searchPolicy(frame,ref){
    const c=frame.c;
    if(frame.reaction||frame.act==="social")return "forbidden";
    if(frame.act==="followup"&&frame.referenceCue&&ref.ambiguous)return "forbidden";
    if(frame.searchCue)return "required";
    // 사실/정의/원리 질문은 아는 척하는 로컬 템플릿보다 공개 자료 확인을 우선한다.
    if(frame.knowledgeCue&&frame.question)return "required";
    return "forbidden";
  }
  function previousSearchAnchor(){
    const users=context().filter(v=>v.role==="user").slice(-6,-1).reverse();
    for(const row of users){
      const t=clean(row.text);if(!t)continue;
      const c=compact(t);if(/^(찾아줘|찾아봐|검색해|검색해줘|알아봐|알려줘|더찾아줘|더찾아봐)$/.test(c))continue;
      const f=analyze(t);if(f.topic)return f.topic;
      if(f.concepts?.length)return f.concepts.slice(0,3).join(" ");
    }
    return "";
  }
  function searchQuery(frame,ref){
    let q=clean(ref.text||frame.text).replace(/[?？]/g,"");
    q=q.replace(/(?:좀\s*)?(?:검색해줘|검색해|찾아줘|찾아봐|더\s*찾아줘|더\s*찾아봐|알아봐줘|알아봐|확인해줘|설명해줘|알려줘|정리해줘|비교해줘|추천해줘|더\s*자세히(?:\s*알려줘)?|자세히\s*알려줘)$/g,"").trim();
    q=q.replace(/\s*(?:누구야|뭐야|무엇이야|어디야|언제야|뜻이야|무슨뜻이야)$/g,"").trim();
    q=q.replace(/(\S{2,})(?:은|는|이|가)$/,"$1").trim();
    const generic=/^(이거|그거|그게|그건|그걸|그사람|걔|거기|좀|더|더자세히|자세히|찾아줘|찾아봐|검색해|검색해줘|알아봐|알려줘)?$/;
    if(!q||generic.test(compact(q))){const prior=previousSearchAnchor(),topic=clean(state().topic);q=ref.target||prior||(!generic.test(compact(topic))?topic:"");}
    return clean(q);
  }

  const BASE={
    greeting:["안녕! 편하게 얘기해.","오 안녕 ㅋㅋ 뭐 하다 왔어?","안녕! 오늘은 어땠어?"],
    bye:["응, 다음에 또 얘기하자!","잘 가! 나중에 또 와 ㅋㅋ","오케이. 다음에 보자!"],
    thanks:["뭘 ㅋㅋ 도움이 됐다면 다행이지.","응! 필요하면 또 말해.","별말을 ㅋㅋ"],
    laughter:["ㅋㅋㅋ 왜 웃겨","아 ㅋㅋ 그 반응 뭐야","ㅋㅋ 나도 웃기네"],
    agreement:["그치 ㅋㅋ","응, 맞아.","맞아. 딱 그 얘기였어."],
    correction:["아, 내가 잘못 알아들었네. 다시 맞춰볼게.","오케이, 그건 내가 잘못 짚었어.","아니었구나. 그 부분은 다시 볼게."],
    insult:["아 왜 ㅋㅋ 내가 또 이상하게 말했어?","엥 갑자기 왜 ㅋㅋ 내가 방금 헛소리했어?","내 답이 이상했나 보네 ㅋㅋ"],
    praise:["오 ㅋㅋ 갑자기 칭찬받으니까 좋네.","고마워 ㅋㅋ 계속 잘해볼게.","오, 그 말은 기분 좋다 ㅋㅋ"],
    bored:["그럼 아무 얘기나 해보자 ㅋㅋ","심심하면 같이 떠들자.","나랑 잡담하자 ㅋㅋ 게임 얘기든 학교 얘기든 아무거나."],
    tired:["아이고, 오늘 좀 빡셌나 보다.","피곤했구나. 좀 쉬어도 되겠다.","오늘 많이 바빴나 보네."],
    sad:["아 그건 기분 별로였겠다.","속상했겠네.","그런 일 있으면 기분 확 가라앉지."],
    happy:["오 좋네 ㅋㅋ","그거 괜찮다! 기분 좋았겠네.","오호 ㅋㅋ 좋은 일 있었네."],
    surprise:["헐 진짜?","오, 그건 좀 놀랍네.","와 ㅋㅋ 그건 예상 못 했는데."]
  };

  function strategyHistory(){return state().strategyHistory||[];}
  function questionPressure(){
    const list=context().filter(v=>v.role==="assistant").slice(-6); if(!list.length)return 0;
    return list.filter(v=>v.question===true||/[?？]$/.test(v.text)).length/list.length;
  }
  function repeatPressure(strategy){return strategyHistory().slice(-4).filter(v=>v===strategy).length;}
  function policyKey(frame){
    const qp=questionPressure(),q=qp>.55?"qhi":qp>.25?"qmid":"qlo",phase=state().phase||"social";
    return `${frame.speechAct||frame.act}|${frame.affect}|${phase}|${q}`;
  }
  function publicPolicyBoost(key,strategy){
    const data=policyByUser.get(userKey())||{}; const row=data[key]?.[strategy]; if(!row)return 0;
    const pos=Number(row.positiveScore??row.positive??0),neg=Number(row.negativeScore??row.negative??0),tier=String(row.tier||"confirmed");
    const raw=(pos-neg)*1.8;
    if(tier==="solo")return Math.max(-2.5,Math.min(3.5,raw));
    if(tier==="growing")return Math.max(-5,Math.min(7,raw));
    return Math.max(-8,Math.min(14,raw));
  }

  function strategyScores(frame,ref){
    const p=profile(),q=questionPressure(),key=policyKey(frame),eligible=responseMoveEligibility(frame,ref),scores={ack:40,empathy:30,explore:24,clarify:18,playful:18,direct:26,continue:20,social:18};
    Object.keys(scores).forEach(name=>{if(eligible[name]===false)scores[name]=-999;});
    if(frame.reaction)scores.social=100;
    if(frame.affect==="negative"){scores.empathy=64;scores.ack+=18;scores.explore+=8;}
    if(frame.affect==="positive"){scores.ack+=25;scores.playful+=12;scores.explore+=7;}
    if(frame.event){scores.ack+=22;if(frame.affect==="negative")scores.empathy+=16;scores.explore+=8;}
    if(frame.act==="statement"&&!frame.event&&!frame.plan&&!frame.preference&&frame.topic){scores.direct+=28;scores.ack+=10;}
    if(frame.plan){scores.ack+=24;scores.direct+=9;}
    if(frame.preference){scores.ack+=20;scores.direct+=8;}
    if(frame.act==="followup"){scores.continue+=26;scores.direct+=12;}
    if(frame.question){scores.direct+=24;scores.clarify+=8;}
    if(ref.ambiguous){scores.clarify+=55;scores.direct-=25;scores.explore=-999;}
    scores.explore+=(p.questionTolerance-.5)*28-q*32;
    scores.empathy+=(p.empathy-.5)*18;
    scores.playful+=(p.playfulness-.5)*16;
    scores.direct+=(p.directness-.5)*18;
    for(const name of Object.keys(scores)){if(scores[name]>-900){scores[name]+=publicPolicyBoost(key,name);scores[name]-=repeatPressure(name)*9;}}
    if(q>.50)scores.explore-=18;if(q>.68)scores.explore=-999;
    return {key,scores,eligible};
  }
  function pickStrategy(frame,ref){
    if(frame.reaction)return {strategy:"social",policyKey:policyKey(frame),confidence:.99};
    const {key,scores}=strategyScores(frame,ref); const ranked=Object.entries(scores).sort((a,b)=>b[1]-a[1]);
    const top=ranked[0],second=ranked[1]||["",0],gap=top[1]-second[1];
    return {strategy:top[0],policyKey:key,confidence:clamp(.55+gap/60),scores};
  }

  function chooseText(family,arr){
    const key=userKey(),used=recentChoices.get(key)||[],items=arr.map((text,i)=>({id:`${family}:${i}`,text}));
    let pool=items.filter(v=>!used.includes(v.id));if(!pool.length)pool=items;
    const chosen=pool[Math.floor(Math.random()*pool.length)]||items[0]; if(!chosen)return "";
    recentChoices.set(key,[chosen.id,...used.filter(v=>v!==chosen.id)].slice(0,16)); return chosen.text;
  }
  function candidate(text,id,strategy,score,meta={}){return {text,id,strategy,score,question:/[?？]$/.test(text),...meta};}
  function generateCandidates(frame,ref,policy){
    const out=[],s=state(),strategy=policy.strategy;
    if(strategy==="social"){
      (BASE[frame.reaction]||[]).forEach((t,i)=>out.push(candidate(t,`social:${frame.reaction}:${i}`,"social",95-i)));
      return out;
    }
    const add=(family,rows,base=strategy)=>rows.forEach((t,i)=>out.push(candidate(t,`${family}:${i}`,base,76-i)));
    if(strategy==="clarify"){
      if(ref.ambiguous)add("clarify.ref",["아까 말한 대상을 말하는 거야?","그게 누구를 말하는 건지 한 번만 알려줘.","아까 얘기한 것 중 어느 걸 말하는 거야?"]);
      else add("clarify.general",["어느 부분을 말하는지 조금만 더 알려줘.","그 상황을 한마디만 더 붙여주면 제대로 이어갈게."]);
    }
    if(strategy==="empathy"){
      if(frame.affect==="negative")add("empathy.neg",["아 그건 좀 힘들었겠다.","아이고, 기분 좀 상했겠네.","그건 꽤 신경 쓰였겠다."]);
      else add("empathy.neutral",["그랬구나.","응, 그런 느낌이었구나."]);
    }
    if(strategy==="ack"){
      if(frame.event&&frame.affect==="positive")add("ack.event.pos",["오, 잘됐네 ㅋㅋ","그건 좀 뿌듯했겠다.","오 좋았겠다 ㅋㅋ"]);
      else if(frame.event&&frame.affect==="negative")add("ack.event.neg",["아 그건 좀 힘들었겠다.","아이고, 생각대로 안 됐구나.","그건 기분 좀 상했겠다."]);
      else if(frame.plan)add("ack.plan",["오, 그렇게 하기로 했구나.","좋네 ㅋㅋ 다음 계획까지 잡았네.","오케이. 다음엔 그걸 해보는 거구나."]);
      else if(frame.preference)add("ack.pref",frame.affect==="negative"?["아, 그건 취향에 안 맞는구나.","오, 넌 그쪽은 별로구나."]:["오 그거 좋아하는구나 ㅋㅋ","그쪽 취향이구나.","오, 그건 기억해둘 만하네."]);
      else if(frame.topic)add("ack.topic",[`아, ${frame.topic} 얘기구나.`,`응, ${frame.topic} 쪽 얘기네.`]);
      else add("ack.general",["응, 무슨 얘기인지 보고 있어.","아하, 흐름은 따라가고 있어."]);
    }
    if(strategy==="playful")add("playful",["오 ㅋㅋ 그건 좀 웃기네.","아 ㅋㅋ 상황이 그려진다.","ㅋㅋㅋ 그랬구나."]);
    if(strategy==="continue"){
      if(/^(그래서|그다음|그리고|그럼|근데)$/.test(frame.c))add("continue",["응응, 듣고 있어.","응, 계속 말해봐.","그래서 어떻게 됐어?"]);
      else add("continue.ref",["응, 아까 얘기 이어서 말해봐.","응응, 그 얘기 계속해도 돼."]);
    }
    if(strategy==="explore"){
      if(frame.affect==="negative")add("explore.neg",["그중에 뭐가 제일 힘들었어?","그때 기분이 어땠어?","무슨 일이 있었는데?"]);
      else if(frame.event)add("explore.event",["그다음엔 어떻게 됐어?","뭐가 제일 기억나?","같이 한 사람도 있었어?"]);
      else add("explore.general",["넌 그중에 뭐가 제일 좋았어?","그건 왜 그렇게 생각했어?","조금 더 얘기해봐 ㅋㅋ"]);
    }
    if(strategy==="direct"){
      if(frame.act==="question"&&!frame.knowledgeCue)add("direct.question",s.lastStatement?["앞 얘기랑 이어지는 질문이네. 지금 말한 상황 기준으로 보면 한 가지로 딱 잘라 말하긴 어려워.","앞 얘기 기준으로 답하려면 조건이 하나만 더 있으면 좋겠어."]:["그건 상황에 따라 달라질 수 있어. 어떤 상황인지 한 줄만 더 말해줘.","조건에 따라 답이 달라져. 지금 상황을 조금만 더 알려줘."]);
      else if(frame.event&&frame.topic)add("direct.event",frame.affect==="positive"?[`${frame.topic} 쪽은 결과가 괜찮았던 거네 ㅋㅋ`,`오, ${frame.topic} 얘기는 잘 풀렸구나.`]:frame.affect==="negative"?[`${frame.topic} 때문에 꽤 신경 쓰였겠네.`,`아, ${frame.topic} 쪽에서 일이 꼬였구나.`]:[`${frame.topic}에서 그런 일이 있었구나.`,`아, ${frame.topic} 얘기였구나.`]);
      else if(frame.plan&&frame.topic)add("direct.plan",[`그럼 다음엔 ${frame.topic} 쪽으로 해보려는 거네.`,`오케이, ${frame.topic} 계획까지 잡아둔 거구나.`]);
      else if(frame.preference&&frame.topic)add("direct.preference",frame.affect==="negative"?[`${frame.topic} 쪽은 취향이 아닌 거네.`]:[`${frame.topic} 쪽을 좋아하는구나. 그건 기억해둘게.`]);
      else if(frame.topic&&frame.text.length<=24)add("direct.topic",[`응, ${frame.topic} 얘기구나.`,`오, ${frame.topic} 얘기네.`]);
      else add("direct.general",["응, 무슨 말인지 따라가고 있어.","아하, 지금 얘기 흐름은 이해했어."]);
    }
    if(!out.length){
      if(frame.topic)add("fallback.topic",[`응, ${frame.topic} 얘기부터 이어가자.`,`아, ${frame.topic} 쪽 얘기네.`],"direct");
      else add("fallback",["응, 무슨 말인지 보고 있어.","아하, 흐름은 따라가고 있어."],"ack");
    }
    return out;
  }

  function learnedCandidates(frame,policy,ref){
    const data=learnedByUser.get(userKey())||{patterns:[]},input=frame.c,out=[],eligible=responseMoveEligibility(frame,ref);
    for(const ptn of data.patterns||[]){
      const trig=compact(ptn.trigger),strategy=ptn.strategy||policy.strategy;if(!trig||!ptn.reply||eligible[strategy]===false)continue;let score=0;
      if(input===trig)score=88;else if(input.includes(trig)||trig.includes(input))score=44;
      const pw=concepts(ptn.trigger),overlap=frame.concepts.filter(v=>pw.includes(v)).length;score+=overlap*9;
      score+=(Number(ptn.confidence||0)-.5)*22;
      const tier=String(ptn.tier||"confirmed");if(tier==="solo")score-=10;else if(tier==="growing")score-=4;
      if(ptn.act&&ptn.act!==frame.act)score-=24;if(ptn.affect&&ptn.affect!=="neutral"&&ptn.affect!==frame.affect)score-=18;
      if(input!==trig&&overlap===0)score-=16;
      if(score>=64)out.push(candidate(ptn.reply,ptn.id||"learned",strategy,score,{source:"learned",learningTier:tier}));
    }
    return out.sort((a,b)=>b.score-a.score).slice(0,4);
  }
  function chooseCandidate(frame,policy,candidates){
    const used=recentChoices.get(userKey())||[],p=profile(),q=questionPressure();
    for(const c of candidates){
      if(used.includes(c.id))c.score-=20;
      if(c.strategy===policy.strategy)c.score+=14;
      if(c.question)c.score+=(p.questionTolerance-.5)*15-q*18;
      if(c.text.length>58)c.score-=(p.brevity-.5)*16;
      if(/ㅋㅋ|ㅎㅎ/.test(c.text))c.score+=(p.playfulness-.5)*8;
      if(c.strategy==="empathy")c.score+=(p.empathy-.5)*10;
      if(c.strategy==="direct")c.score+=(p.directness-.5)*8;
      if(/는 너한테 어떤 느낌/.test(c.text))c.score-=100;
    }
    candidates.sort((a,b)=>b.score-a.score); const top=candidates.slice(0,3); let best=top[0];
    if(top.length>1&&top[0].score-top[1].score<4&&Math.random()<.18)best=top[1];
    if(best){recentChoices.set(userKey(),[best.id,...used.filter(v=>v!==best.id)].slice(0,16));}
    return best;
  }

  function inferMemory(raw){
    const t=clean(raw);let m;
    if((m=t.match(/^(?:나는|난)\s+(.{1,35}?)\s*(?:을|를)?\s*좋아해(?:요)?[.!?]?$/)))return {key:"like",value:clean(m[1]),label:"좋아하는 것"};
    if((m=t.match(/^(?:나는|난)\s+(.{1,35}?)\s*(?:을|를)?\s*싫어해(?:요)?[.!?]?$/)))return {key:"dislike",value:clean(m[1]),label:"싫어하는 것"};
    if((m=t.match(/^(?:내\s*별명은|내별명은)\s*(.{1,20}?)(?:이야|야)?[.!?]?$/)))return {key:"nickname",value:clean(m[1]),label:"별명"};
    return null;
  }
  function memoryQuestion(raw){const c=compact(raw);if(/내가뭐좋아|내가좋아하는거/.test(c))return "like";if(/내가뭐싫어|내가싫어하는거/.test(c))return "dislike";if(/내별명/.test(c))return "nickname";return "";}
  function episodeRecall(raw){
    const c=compact(raw);if(!/(아까|전에|이전에).*(뭐|무슨|얘기|말)|뭐얘기했지|내가뭐했다고/.test(c))return "";
    const eps=state().episodes||[];if(!eps.length)return "아직 꺼내볼 만한 지난 얘기가 많진 않아.";
    return `아까는 ${eps[eps.length-1].text}라고 했어.`;
  }

  function explicitSignal(raw){
    const r=detectReaction(raw);if(["agreement","thanks","laughter","praise"].includes(r))return "positive";if(["correction","insult"].includes(r))return "negative";return "";
  }
  function previousExchange(){
    const list=context(); const a=[...list].reverse().find(v=>v.role==="assistant"); if(!a)return null;
    const ai=list.lastIndexOf(a); const u=ai>0?[...list.slice(0,ai)].reverse().find(v=>v.role==="user"):null; return u?{user:u,assistant:a}:null;
  }
  function continuationSignal(currentFrame,ex){
    if(!ex||currentFrame.reaction==="bye"||currentFrame.reaction==="greeting"||currentFrame.text.length<3)return "";
    const prevConcepts=concepts(ex.user.text),cur=currentFrame.concepts,overlap=cur.some(v=>prevConcepts.includes(v));
    const sameTopic=!!(currentFrame.topic&&ex.user.topic&&currentFrame.topic===ex.user.topic);
    if(currentFrame.act==="followup"||overlap||sameTopic)return "continue";
    // An unrelated new event is a topic switch, not proof that the previous reply was good.
    return "";
  }
  function feedbackEvidenceKey(currentFrame,ex,signal){
    const bucket=Math.floor(Date.now()/(6*60*60*1000));
    const follow=(currentFrame.concepts||[]).slice(0,2).join("_")||compact(currentFrame.text).slice(0,18);
    return [bucket,ex?.assistant?.candidateId||"",ex?.assistant?.strategy||"",ex?.user?.intent||"",ex?.user?.affect||"neutral",signal||"",follow].join("|").slice(0,220);
  }
  function adaptProfile(signal,prev){
    const p=profile();if(!prev)return;const q=prev.question===true||/[?？]$/.test(prev.text),long=prev.text.length>55,play=/ㅋㅋ|ㅎㅎ/.test(prev.text);
    const d=signal==="positive"?.035:signal==="negative"?-.055:.010;
    if(q){p.questionTolerance=clamp(p.questionTolerance+d);p.directness=clamp(p.directness-d*.35);}
    if(long)p.brevity=clamp(p.brevity-d);else p.brevity=clamp(p.brevity+d*.35);
    if(play)p.playfulness=clamp(p.playfulness+d*.55);
    if(prev.strategy==="empathy")p.empathy=clamp(p.empathy+d*.5);
    saveProfile();
  }
  function queueCommit(event){
    if(isGuest()||!MiniTalk.AuthApi.moaCommit)return;
    const key=userKey(),q=commitQueues.get(key)||[];q.push(event);commitQueues.set(key,q.slice(-30));
    if(q.length>=COMMIT_MAX_EVENTS){flushCommit();return;}
    if(commitTimers.get(key))return;
    commitTimers.set(key,setTimeout(()=>{commitTimers.delete(key);flushCommit();},COMMIT_DELAY));
  }
  async function flushCommit(){
    if(isGuest()||!MiniTalk.AuthApi.moaCommit)return;
    const key=userKey(),q=commitQueues.get(key)||[];if(!q.length)return;commitQueues.set(key,[]);
    try{await MiniTalk.AuthApi.moaCommit({userId:key,events:q,profile:profile()});syncAt.set(key,0);}catch(e){console.warn("모아 학습 묶음 저장 실패",e);commitQueues.set(key,[...q,...(commitQueues.get(key)||[])].slice(-30));}
  }
  function observePreviousTurn(currentFrame){
    const ex=previousExchange();if(!ex)return;
    if(ex.assistant.proactive===true||ex.assistant.source==="proactive"){noteProactiveResponse(explicitSignal(currentFrame.text)==="negative"?"negative":"positive",ex.assistant.candidateId||"");return;}
    const explicit=explicitSignal(currentFrame.text);const cont=explicit?"":continuationSignal(currentFrame,ex);
    const signal=explicit||cont;if(!signal)return;
    adaptProfile(signal,ex.assistant);
    const quality=signal==="positive"?1:signal==="negative"?-1:.35,evidenceKey=feedbackEvidenceKey(currentFrame,ex,signal);
    queueCommit({type:"feedback",signal:signal==="negative"?"negative":"positive",weight:quality,evidenceKey,trigger:ex.user.text,reply:ex.assistant.text,source:ex.assistant.source||"local",candidateId:ex.assistant.candidateId||"",act:ex.user.intent||"",affect:ex.user.affect||"neutral",strategy:ex.assistant.strategy||"ack",policyKey:ex.assistant.policyKey||"",followup:currentFrame.text.slice(0,140)});
    queueCommit({type:"policy_feedback",signal:signal==="negative"?"negative":"positive",weight:quality,evidenceKey,strategy:ex.assistant.strategy||"ack",policyKey:ex.assistant.policyKey||""});
  }

  function initiativeSettings(){const e=engagement();return {enabled:e.enabled!==false,quietStart:Number(e.quietStart||22),quietEnd:Number(e.quietEnd||7)};}
  function setInitiativeSettings(next={}){
    const e=engagement();if(next.enabled!=null)e.enabled=!!next.enabled;
    if(Number.isFinite(Number(next.quietStart)))e.quietStart=Math.max(0,Math.min(23,Number(next.quietStart)));
    if(Number.isFinite(Number(next.quietEnd)))e.quietEnd=Math.max(0,Math.min(23,Number(next.quietEnd)));
    saveEngagement(e);return initiativeSettings();
  }
  function inQuietHours(now,e){const h=new Date(now).getHours(),a=Number(e.quietStart||22),b=Number(e.quietEnd||7);return a===b?false:a>b?(h>=a||h<b):(h>=a&&h<b);}
  function pickStarter(rows,e){
    const used=e.recentStarterIds||[],pool=rows.filter(v=>!used.includes(v.id)),src=pool.length?pool:rows;if(!src.length)return null;
    const chosen=src[Math.floor(Math.random()*src.length)];e.recentStarterIds=[chosen.id,...used.filter(v=>v!==chosen.id)].slice(0,10);return chosen;
  }
  function strongestInterest(now){
    const rows=Object.entries(state().interests||{}).filter(([topic,v])=>safeTopicForInitiative(topic)&&now-Number(v.lastAt||0)<21*86400000)
      .map(([topic,v])=>({topic,score:Number(v.turns||0)+Number(v.continuations||0)*1.6,lastAt:Number(v.lastAt||0)}))
      .filter(v=>v.score>=3).sort((a,b)=>b.score-a.score||b.lastAt-a.lastAt);return rows[0]||null;
  }
  function dueOpenLoop(now){
    const s=state(),rows=(s.openLoops||[]).filter(v=>!v.askedAt&&Number(v.dueAt||0)<=now&&now-Number(v.dueAt||0)<7*86400000&&safeTopicForInitiative(v.topic));
    return rows.sort((a,b)=>Number(a.dueAt)-Number(b.dueAt))[0]||null;
  }
  function proactiveCandidates(now,lastUserAt){
    const d=new Date(now),hour=d.getHours(),day=d.getDay(),idle=now-lastUserAt,out=[];
    const loop=dueOpenLoop(now);if(loop)out.push({id:`followup:${loop.id}`,type:"open-loop",priority:100,topic:loop.topic,text:`전에 ${loop.topic} 얘기했었잖아. 그건 어떻게 됐어?`,loop});
    const interest=strongestInterest(now);if(interest&&idle>=PROACTIVE_RETURN_GAP)out.push({id:`interest:${interest.topic}`,type:"interest",priority:72+Math.min(12,interest.score),topic:interest.topic,text:`전에 ${interest.topic} 얘기 꽤 했었는데 ㅋㅋ 요즘도 그거 하고 있어?`});
    if(day===1&&hour>=7&&hour<12)out.push({id:"calendar:monday-am",type:"calendar",priority:55,text:"새 주 시작이네. 이번 주에 기대되는 거 하나 있어?"});
    if(day===5&&hour>=16&&hour<22)out.push({id:"calendar:friday-pm",type:"calendar",priority:58,text:"금요일이다 ㅋㅋ 이번 주에 제일 괜찮았던 일 하나 있었어?"});
    if((day===0||day===6)&&hour>=10&&hour<21)out.push({id:`calendar:weekend:${day}`,type:"calendar",priority:54,text:"주말인데 오늘 뭐 하면서 보냈어?"});
    if(hour>=7&&hour<11)out.push({id:"daypart:morning",type:"daypart",priority:43,text:"좋은 아침 ㅋㅋ 오늘 뭐 하나 기대되는 거 있어?"});
    if(hour>=14&&hour<18)out.push({id:"daypart:afternoon",type:"daypart",priority:40,text:"오후다. 오늘 지금까지 제일 기억나는 일 뭐였어?"});
    if(hour>=18&&hour<22)out.push({id:"daypart:evening",type:"daypart",priority:44,text:"오늘 하루 거의 다 갔네. 오늘 제일 괜찮았던 순간 하나 있었어?"});
    if(idle>=3*86400000)out.push({id:"return:3d",type:"return",priority:66,text:"오랜만이네 ㅋㅋ 요 며칠 뭐 재밌는 일 있었어?"});
    if(idle>=24*60*60*1000)out.push({id:"return:1d",type:"return",priority:48,text:"오늘은 어떤 하루였어? 그냥 아무 얘기부터 해도 돼 ㅋㅋ"});
    out.forEach(v=>{v.priority+=publicPolicyBoost(`initiative|${v.type}`,"initiative");});
    return out.sort((a,b)=>b.priority-a.priority);
  }
  function maybeInitiate(options={}){
    const now=Number(options.now||Date.now()),force=!!options.force,e=engagement(),p=profile(),s=state();if(e.enabled===false||(!force&&inQuietHours(now,e)))return null;
    const day=localDayKey(now);if(e.dayKey!==day){e.dayKey=day;e.dailyCount=0;}
    const lastUserAt=Math.max(Number(options.lastUserAt||0),Number(e.lastUserAt||0),Number(s.lastUserAt||0));
    if(!lastUserAt||Number(s.turn||0)<1)return null;
    if(!force&&(e.dailyCount>=PROACTIVE_DAILY_MAX||now-Number(e.lastInitiatedAt||0)<PROACTIVE_MIN_GAP))return null;
    const idle=now-lastUserAt;if(!force&&idle<PROACTIVE_MIN_GAP)return null;
    const chance=Math.max(.30,Math.min(.88,.48+(Number(p.initiative||.52)-.5)*.55+(idle>=48*3600000?.12:0)));
    const candidates=proactiveCandidates(now,lastUserAt);if(!candidates.length)return null;
    const hasDueLoop=candidates.some(v=>v.type==="open-loop"&&v.priority>=90);if(!force&&!hasDueLoop&&Math.random()>chance)return null;
    const bestPriority=candidates[0].priority,shortlist=candidates.filter(v=>v.priority>=bestPriority-7),chosen=pickStarter(shortlist,e);if(!chosen)return null;
    e.lastInitiatedAt=now;e.dailyCount++;e.lastInitiativeType=chosen.type;saveEngagement(e);
    if(chosen.loop){chosen.loop.askedAt=now;saveState();}
    remember("assistant",chosen.text,{source:"proactive",candidateId:chosen.id,intent:"initiative",affect:"neutral",strategy:"initiative",policyKey:`initiative|${chosen.type}`,question:/[?？]$/.test(chosen.text),proactive:true});
    return {reply:chosen.text,source:"proactive",candidateId:chosen.id,strategy:"initiative",type:chosen.type,topic:chosen.topic||"",createdAt:now};
  }
  function noteProactiveResponse(signal="positive",messageId=""){
    const p=profile(),positive=signal!=="negative",type=engagement().lastInitiativeType||"general",bucket=Math.floor(Date.now()/(6*60*60*1000));p.initiative=clamp(Number(p.initiative||.52)+(positive?.035:-.05));saveProfile();
    queueCommit({type:"policy_feedback",signal:positive?"positive":"negative",weight:positive?.55:-.7,evidenceKey:`initiative|${bucket}|${messageId||type}`,strategy:"initiative",policyKey:`initiative|${type}`});
  }
  function markProactiveIgnored(){const p=profile(),type=engagement().lastInitiativeType||"general",bucket=Math.floor(Date.now()/(6*60*60*1000));p.initiative=clamp(Number(p.initiative||.52)-.018);saveProfile();queueCommit({type:"policy_feedback",signal:"negative",weight:.35,evidenceKey:`initiative-ignore|${bucket}|${type}`,strategy:"initiative",policyKey:`initiative|${type}`});}
  function starterSuggestions(){
    const now=Date.now(),d=new Date(now),hour=d.getHours(),interest=strongestInterest(now),rows=[];
    if(interest)rows.push({label:interest.topic.slice(0,8),prompt:`${interest.topic} 얘기하자`});
    if(hour<12)rows.push({label:"오늘",prompt:"오늘 뭐 할지 아직 모르겠어"});else if(hour<18)rows.push({label:"오늘 일",prompt:"오늘 있었던 일 얘기할게"});else rows.push({label:"하루 얘기",prompt:"오늘 하루 얘기 좀 할래"});
    rows.push({label:"심심해",prompt:"심심해 ㅋㅋ"},{label:"아무 얘기",prompt:"아무 얘기나 먼저 해봐"},{label:"날씨",prompt:"서울 오늘 날씨 알려줘"},{label:"검색",prompt:"세종대왕 찾아줘"});
    const seen=new Set();return rows.filter(v=>v.label&&v.prompt&&!seen.has(v.label)&&(seen.add(v.label),true)).slice(0,6);
  }

  async function sync(force=false){
    if(isGuest()||!MiniTalk.AuthApi.moaSync)return;
    const key=userKey(),last=syncAt.get(key)||0;if(!force&&Date.now()-last<SYNC_TTL)return;syncAt.set(key,Date.now());
    try{
      const known=syncVersion.get(key)||Number(pget(`moa.v91.syncVersion.${key}`,0)||pget(`moa.v90.syncVersion.${key}`,0)||pget(`moa.v89.syncVersion.${key}`,0)||pget(`moa.v88.syncVersion.${key}`,0)||pget(`moa.v87.syncVersion.${key}`,0)||0);
      const d=await MiniTalk.AuthApi.moaSync(key,known);
      if(Array.isArray(d?.patterns)){learnedByUser.set(key,{patterns:d.patterns});pset(`moa.v91.patterns.${key}`,d.patterns);}else if(!learnedByUser.has(key))learnedByUser.set(key,{patterns:pget(`moa.v91.patterns.${key}`,[])||pget(`moa.v90.patterns.${key}`,[])||pget(`moa.v89.patterns.${key}`,[])||pget(`moa.v88.patterns.${key}`,[])||pget(`moa.v87.patterns.${key}`,[])||[]});
      if(d?.policy&&typeof d.policy==="object"){policyByUser.set(key,d.policy);pset(`moa.v91.policy.${key}`,d.policy);}else if(!policyByUser.has(key))policyByUser.set(key,pget(`moa.v91.policy.${key}`,{})||pget(`moa.v90.policy.${key}`,{})||pget(`moa.v89.policy.${key}`,{})||pget(`moa.v88.policy.${key}`,{})||{});
      if(d?.profile){profileByUser.set(key,{...PROFILE_DEFAULTS,...profile(),...d.profile});saveProfile();}
      if(d?.memories&&typeof d.memories==="object"){memoriesByUser.set(key,{...memories(),...d.memories});saveMemories();}
      if(Number(d?.version||0)){syncVersion.set(key,Number(d.version));pset(`moa.v91.syncVersion.${key}`,Number(d.version));}
    }catch(e){console.warn("모아 학습 동기화 실패",e);syncAt.set(key,Date.now()-SYNC_TTL+30000);}
  }
  function warmup(){sync(false);}

  async function reply(raw){
    const text=clean(raw);if(!text)return {reply:"응?",source:"local"};
    const frame=analyze(text);observePreviousTurn(frame);updateDialogueState(frame);remember("user",text,{intent:frame.act,affect:frame.affect,topic:frame.topic});
    const ref=resolveReference(frame);const searchMode=searchPolicy(frame,ref);
    let answer="",source="local",candidateId="",strategy="direct",policyKeyValue=policyKey(frame);

    const dt=dateTime(text),calc=math(text),game=rps(text),self=selfReply(text),repair=repairConversation(text),decision=practicalDecisionReply(text);
    if(dt)answer=dt;else if(calc)answer=calc;else if(game)answer=game;else if(self)answer=self;else if(repair){answer=repair;source="local-repair";strategy="direct";}else if(decision){answer=decision;source="local-decision";strategy="direct";}

    const recall=episodeRecall(text);if(!answer&&recall){answer=recall;source="episode";strategy="direct";}
    const memQ=memoryQuestion(text);
    if(!answer&&memQ){const value=memories()[memQ]?.value||memories()[memQ]||"";answer=value?`응. 네가 ${value}${memQ==="like"?" 좋아한다고":memQ==="dislike"?" 싫어한다고":"라고"} 말했었어.`:"아직 그건 기억해둔 게 없어.";source="memory";strategy="direct";}

    if(!answer&&searchMode!=="forbidden"){
      if(ref.ambiguous){answer="아까 말한 대상 중에서 어느 걸 말하는 거야?";source="local";strategy="clarify";}
      else {
        const q=searchQuery(frame,ref);
        if(!q){answer="뭘 찾아볼까? 궁금한 대상이나 주제를 말해줘.";source="local";strategy="clarify";}
        else try{const d=await MiniTalk.AuthApi.moaSearch({userId:userKey(),text,query:q,context:context().slice(-8)});if(d?.reply){answer=d.reply;source=d.source||"search";candidateId=`search:${d.kind||"general"}`;strategy="search";}}catch(e){console.warn("모아 검색 실패",e);}
      }
    }

    if(!answer){
      const policy=pickStrategy(frame,ref);strategy=policy.strategy;policyKeyValue=policy.policyKey;
      const chosen=chooseCandidate(frame,policy,[...generateCandidates(frame,ref,policy),...learnedCandidates(frame,policy,ref)]);
      answer=chosen?.text||"응, 무슨 말인지 보고 있어.";source=chosen?.source||"local";candidateId=chosen?.id||"fallback";strategy=chosen?.strategy||strategy;
    }

    const m=inferMemory(text);if(m){memories()[m.key]={value:m.value,label:m.label,updatedAt:Date.now()};saveMemories();queueCommit({type:"memory",...m});}
    const s=state();s.strategyHistory.push(strategy);while(s.strategyHistory.length>12)s.strategyHistory.shift();
    if(frame.question)s.initiative.userQuestions=Number(s.initiative.userQuestions||0)+1;
    if(/[?？]$/.test(answer))s.initiative.assistantQuestions=Number(s.initiative.assistantQuestions||0)+1;
    saveState();
    remember("assistant",answer,{source,candidateId,intent:frame.act,affect:frame.affect,strategy,policyKey:policyKeyValue,question:/[?？]$/.test(answer)});
    return {reply:answer,source,candidateId,strategy,searchMode,referenceConfidence:ref.confidence,profile:{...profile()}};
  }

  function clearContext(){
    const key=userKey();ctxByUser.delete(key);stateByUser.delete(key);recentChoices.delete(key);rpsByUser.delete(key);
    premove(`moa.v91.context.${key}`);premove(`moa.v91.state.${key}`);premove(`moa.v90.context.${key}`);premove(`moa.v90.state.${key}`);
    ["moa.v89.context.","moa.v89.state.","moa.v88.context.","moa.v88.state.","moa.v87.context.","moa.v87.state.","moa.v86.context.","moa.v86.state.","moa.context."].forEach(prefix=>premove(prefix+key));
  }
  function debugSnapshot(){return {version:VERSION,state:{...state()},profile:{...profile()},engagement:{...engagement()},context:context().slice(),patterns:(learnedByUser.get(userKey())||{patterns:[]}).patterns.slice(0,5),policy:policyByUser.get(userKey())||{},queued:(commitQueues.get(userKey())||[]).length};}
  return {reply,warmup,sync,flushCommit,clearContext,analyze,resolveReference,maybeInitiate,initiativeSettings,setInitiativeSettings,markProactiveIgnored,starterSuggestions,debugSnapshot};
})();
