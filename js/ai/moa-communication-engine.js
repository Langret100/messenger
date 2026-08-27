/* ============================================================
   MOA COMMUNICATION ENGINE - local-personal / public-learning split

   Ownership rule
   - LOCAL ONLY: user memories, recent topics, style, roughness, brevity,
     punctuation habits, initiative acceptance and conversation history.
   - PUBLIC SERVER ONLY: reusable response-policy statistics and public
     learned patterns. No personal profile/memory is synced or committed.

   Dialogue pipeline
   understand -> local context/memory -> local style -> public policy hint
   -> candidate composition/ranking -> reply -> local adaptation
   -> anonymous reusable policy feedback
   ============================================================ */
MiniTalk.AI = MiniTalk.AI || {};
MiniTalk.AI.MoaCommunicationEngine = (() => {
  const VERSION = 92;
  const MAX_CONTEXT = 28;
  const MAX_EPISODES = 36;
  const MAX_TIMELINE = 24;
  const SYNC_TTL = 15 * 60 * 1000;
  const COMMIT_DELAY = 18000;
  const COMMIT_MAX_EVENTS = 8;
  const MAX_OPEN_LOOPS = 16;
  const PROACTIVE_CHANCE_GAP = 2 * 60 * 60 * 1000;
  const PROACTIVE_ACTIVE_COOLDOWN = 35 * 60 * 1000;
  const PROACTIVE_RETURN_GAP = 18 * 60 * 60 * 1000;
  const CONNECTION_GREETING_GAP = 6 * 60 * 60 * 1000;
  const PROFILE_DEFAULTS = Object.freeze({
    brevity: .58,
    questionTolerance: .50,
    playfulness: .55,
    empathy: .60,
    directness: .60,
    initiative: .52,
    roughness: .12,
    formality: .18,
    punctuationAffinity: .20,
    slang: .20,
    lowEffort: .12,
    roughStreak: 0,
    kindness: .50,
    gratitude: .20,
    hostility: .06,
    mannerTurns: 0
  });

  const ctxByUser = new Map(), stateByUser = new Map(), learnedByUser = new Map(), learnedIndexByUser = new Map();
  const policyByUser = new Map(), expressionByUser = new Map(), profileByUser = new Map(), memoriesByUser = new Map();
  const personalLearningByUser = new Map();
  const recentChoices = new Map(), syncAt = new Map(), syncVersion = new Map();
  const commitQueues = new Map(), commitTimers = new Map(), commitRetryByUser = new Map(), rpsByUser = new Map(), learnedCacheReady = new Map();

  const clean = v => String(v || "").replace(/\s+/g," ").trim();
  const compact = v => (clean(v).normalize?.("NFC") || clean(v)).toLowerCase().replace(/[\s~!！?？.,。·…'"“”‘’]/g,"");
  const clamp = (v,a=0,b=1) => Math.max(a,Math.min(b,Number(v)||0));
  const userKey = () => String(MiniTalk.Store.get("user")?.user_id || "guest");
  const isGuest = () => !!MiniTalk.Store.get("user")?.isGuest || userKey()==="guest";
  const pget = (k,d) => MiniTalk.Persistence.get(k,d), pset=(k,v)=>MiniTalk.Persistence.set(k,v), premove=k=>MiniTalk.Persistence.remove(k);
  const sk = suffix => `moa.v91.${suffix}.${userKey()}`;
  function firstPersisted(keys,fallback,accept){
    for(const key of keys){const value=pget(key,null);if(value!==null&&value!==undefined&&(!accept||accept(value)))return value;}
    return fallback;
  }
  const storedObject=(suffix,key,versions=[91,90,89,88,87])=>firstPersisted(versions.map(v=>`moa.v${v}.${suffix}.${key}`),{},v=>v&&typeof v==="object"&&!Array.isArray(v));
  const storedArray=(suffix,key,versions=[91,90,89,88,87])=>firstPersisted(versions.map(v=>`moa.v${v}.${suffix}.${key}`),[],Array.isArray);

  function profile(){
    const key=userKey();
    if(!profileByUser.has(key))profileByUser.set(key,{...PROFILE_DEFAULTS,...storedObject("profile",key)});
    return profileByUser.get(key);
  }
  function saveProfile(){if(!isGuest())pset(sk("profile"),profile());}
  function memories(){
    const key=userKey();
    if(!memoriesByUser.has(key))memoriesByUser.set(key,storedObject("memories",key));
    return memoriesByUser.get(key);
  }
  function saveMemories(){if(!isGuest())pset(sk("memories"),memories());}
  function personalLearning(){
    const key=userKey();
    if(!personalLearningByUser.has(key)){
      const legacy=storedObject("personalLearning",key,[91,90,89,88,87]);
      personalLearningByUser.set(key,{turns:0,features:{},strategies:{},topics:{},...legacy});
    }
    const l=personalLearningByUser.get(key);
    if(!l.features||typeof l.features!=="object")l.features={};
    if(!l.strategies||typeof l.strategies!=="object")l.strategies={};
    if(!l.topics||typeof l.topics!=="object")l.topics={};
    l.turns=Math.max(0,Number(l.turns||0));
    return l;
  }
  const personalLearningSaveTimers=new Map();
  function flushPersonalLearningSave(key){
    const timer=personalLearningSaveTimers.get(key);if(timer!=null){try{clearTimeout(timer)}catch(e){}personalLearningSaveTimers.delete(key);}
    if(!key||key==="guest")return;const value=personalLearningByUser.get(key);if(value)pset(`moa.v91.personalLearning.${key}`,value);
  }
  function savePersonalLearning(){
    if(isGuest())return;const key=userKey();if(personalLearningSaveTimers.has(key))return;
    // A single turn can reinforce strategy + several expression features + topic.
    // Coalesce those synchronous localStorage writes into one end-of-turn write.
    // Sandboxed/test hosts can omit timers; keep compatibility by flushing immediately.
    if(typeof setTimeout!=="function"){flushPersonalLearningSave(key);return;}
    personalLearningSaveTimers.set(key,setTimeout(()=>flushPersonalLearningSave(key),0));
  }
  function flushAllPersonalLearningSaves(){for(const key of [...personalLearningSaveTimers.keys()])flushPersonalLearningSave(key);}
  try{globalThis?.addEventListener?.("pagehide",flushAllPersonalLearningSaves);}catch(e){}
  function learnedLocalScore(bucket,key){
    const row=personalLearning()?.[bucket]?.[key];if(!row)return 0;
    const pos=Number(row.positive||0),neg=Number(row.negative||0),uses=Number(row.uses||0);
    const confidence=Math.min(1,uses/8),raw=(pos-neg)*2.4*confidence;
    return Math.max(-9,Math.min(11,raw));
  }
  function reinforceLocal(bucket,key,signal,weight=1){
    if(!key)return;const l=personalLearning(),map=l[bucket]||(l[bucket]={}),row=map[key]||(map[key]={positive:0,negative:0,uses:0,lastAt:0});
    row.uses=Math.min(80,Number(row.uses||0)+1);if(signal==="negative")row.negative=Math.min(30,Number(row.negative||0)+Math.abs(weight));else row.positive=Math.min(30,Number(row.positive||0)+Math.abs(weight));row.lastAt=Date.now();
    savePersonalLearning();
  }
  function notePersonalTopic(frame){
    const topic=clean(frame?.topic||"");if(!safeTopicForInitiative(topic))return;
    const l=personalLearning(),row=l.topics[topic]||(l.topics[topic]={turns:0,lastAt:0,positive:0,negative:0});
    row.turns=Math.min(60,Number(row.turns||0)+1);row.lastAt=Date.now();if(frame.affect==="positive")row.positive=Math.min(30,Number(row.positive||0)+1);if(frame.affect==="negative")row.negative=Math.min(30,Number(row.negative||0)+1);
    const keys=Object.keys(l.topics);if(keys.length>30)keys.sort((a,b)=>Number(l.topics[b]?.lastAt||0)-Number(l.topics[a]?.lastAt||0)).slice(30).forEach(k=>delete l.topics[k]);
    l.turns=Math.min(100000,Number(l.turns||0)+1);savePersonalLearning();
  }
  function engagement(){
    const key=userKey(), legacy=pget(`moa.v89.engagement.${key}`,{})||{};
    const e=pget(`moa.v91.engagement.${key}`,null)||pget(`moa.v90.engagement.${key}`,null)||legacy||{};
    if(e.enabled==null)e.enabled=true;
    if(e.quietStart==null)e.quietStart=22;
    if(e.quietEnd==null)e.quietEnd=7;
    if(!Array.isArray(e.recentStarterIds))e.recentStarterIds=[];
    if(!Array.isArray(e.recentInitiativeTexts))e.recentInitiativeTexts=[];
    if(!Array.isArray(e.recentInitiativePatterns))e.recentInitiativePatterns=[];
    e.lastInitiatedAt=Number(e.lastInitiatedAt||0);
    e.lastChanceAt=Number(e.lastChanceAt||0);
    e.lastGreetingAt=Number(e.lastGreetingAt||0);
    e.lastGreetingAttemptAt=Number(e.lastGreetingAttemptAt||0);
    e.lastMannerDiscoveryAt=Number(e.lastMannerDiscoveryAt||0);
    e.lastReadAt=Number(e.lastReadAt||0);
    e.lastUserAt=Number(e.lastUserAt||0);
    e.ignoredStreak=Math.max(0,Math.min(6,Number(e.ignoredStreak||0)));
    e.lastInitiativeType=String(e.lastInitiativeType||"");
    e.lastInitiativeTopic=String(e.lastInitiativeTopic||"");
    return e;
  }
  function saveEngagement(e=engagement()){pset(sk("engagement"),e);}
  function context(){
    const key=userKey();
    if(!ctxByUser.has(key))ctxByUser.set(key,storedArray("context",key));
    return ctxByUser.get(key);
  }
  function state(){
    const key=userKey();
    if(!stateByUser.has(key))stateByUser.set(key,storedObject("state",key));
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

  const PROFANITY=/(?:시발|씨발|ㅅㅂ|존나|좆|개빡|개같|병신|ㅂㅅ|미친|염병|지랄)/i;
  const DIRECTED_ABUSE=/(?:너|니가|넌|모아).{0,8}(?:시발|씨발|병신|ㅂㅅ|멍청|등신|개같)/i;
  function punctuationOnly(raw){
    const t=clean(raw);if(!t||/[0-9A-Za-z가-힣]/.test(t))return "";
    if(/^\.{2,}$/.test(t)||/^…+$/.test(t))return "ellipsis";
    if(/^\?{2,}$/.test(t)||/^？{2,}$/.test(t))return "question";
    if(/^!{2,}$/.test(t)||/^！{2,}$/.test(t))return "bang";
    if(/^;+$/i.test(t)||/^；+$/.test(t))return "semicolon";
    return "punct";
  }
  function localStyleObservation(raw){
    const p=profile(),t=clean(raw),c=compact(raw),pun=punctuationOnly(t);
    const profanity=PROFANITY.test(t), polite=/(?:요|습니다|세요|해줘요|고마워요)[.!?？！]*$/.test(t);
    const slang=/(ㅋㅋ|ㅎㅎ|ㄹㅇ|ㅇㅇ|ㄴㄴ|ㅈㄴ|개웃|개좋|개빡)/i.test(t);
    const low=pun||t.length<=4||/^(응|ㅇㅇ|ㄴㄴ|몰라|그냥|됐어|귀찮아|ㅋ+|ㅎ+)$/.test(c);
    const step=.035;
    const directed=DIRECTED_ABUSE.test(t);
    const streak=Math.max(0,Math.min(24,Number(p.roughStreak||0)));
    // Rough language is a LOCAL style preference only. Repeated casual profanity
    // raises the preference faster, while clean/polite turns cool it down slowly.
    p.roughStreak=profanity&&!directed?Math.min(24,streak+1):Math.max(0,streak-(polite?2:1));
    const streakBoost=profanity&&!directed?Math.min(.035,Number(p.roughStreak||0)*.0025):0;
    p.roughness=clamp(Number(p.roughness??.12)+(profanity?(step*1.8+streakBoost):-step*(polite?.24:.12)));
    p.formality=clamp(Number(p.formality??.18)+(polite?step*1.2:-step*.10));
    p.slang=clamp(Number(p.slang??.20)+(slang?step:-step*.08));
    p.punctuationAffinity=clamp(Number(p.punctuationAffinity??.20)+(pun?step*1.4:-step*.07));
    p.lowEffort=clamp(Number(p.lowEffort??.12)+(low?step:-step*.10));
    const gratitude=/(고마워|고맙|감사|땡큐|thanks|ㄱㅅ)/i.test(t);
    const considerate=/(괜찮아|괜찮아요|부탁|미안|죄송|수고|잘했|좋아요|좋네|도와줘서|덕분)/i.test(t);
    const hostile=directed||/(꺼져|닥쳐|죽어|싫어.*너|너.*싫어|한심|등신|멍청)/i.test(t);
    p.kindness=clamp(Number(p.kindness??.50)+(gratitude?.030:0)+(considerate?.018:0)+(polite?.010:0)-(hostile?.055:0)-(!hostile&&!gratitude&&!considerate?.0015:0));
    p.gratitude=clamp(Number(p.gratitude??.20)+(gratitude?.040:-.0015));
    p.hostility=clamp(Number(p.hostility??.06)+(hostile?.065:-.006));
    p.mannerTurns=Math.max(0,Number(p.mannerTurns||0)+1);
    saveProfile();
    return {pun,profanity,polite,slang,low,directed,gratitude,considerate,hostile};
  }
  function toneMode(){
    const p=profile();
    if(Number(p.formality||0)>.58&&Number(p.roughness||0)<.35)return "gentle";
    if(Number(p.roughness||0)>.58||Number(p.slang||0)>.68)return "rough";
    return "casual";
  }
  function roughReplyRate(){
    const p=profile(),rough=Number(p.roughness||0),streak=Number(p.roughStreak||0),formal=Number(p.formality||0);
    if(formal>.60||rough<.42)return 0;
    // Even a very rough user never forces every reply into profanity. This keeps
    // variety and lets the style cool down naturally when their tone changes.
    return clamp((rough-.38)*.82+Math.min(.30,streak*.027)-Math.max(0,formal-.28)*.45,0,.72);
  }
  function roughFriendlyRewrite(answer,frame,source){
    let out=clean(answer);if(!out)return out;
    if(!String(source||"").startsWith("local")||source==="local-utility"||source==="local-repair"||source==="local-knowledge")return out;
    if(frame.directedAbuse||/(?:요|습니다|세요|해줘요|고마워요)[.!?？！]*$/.test(frame.text)||frame.question||frame.searchCue||/[?？]$/.test(out))return out;
    const rate=roughReplyRate();if(rate<=0||Math.random()>=rate)return out;
    // Friendly/emphatic profanity only: never generate a slur or insult aimed at a person.
    const negative=frame.affect==="negative"||/(짜증|빡|힘들|피곤|별로|아쉽|졌|망)/.test(frame.c);
    const positive=frame.affect==="positive"||/(좋|이겼|성공|만점|칭찬|재밌)/.test(frame.c);
    const family=negative?"negative":positive?"positive":"neutral";
    const options=negative
      ? ["아 씨, 그건 좀 빡치겠다 ㅋㅋ", "시발 그건 좀 짜증나겠다 ㅋㅋ", "아 ㅋㅋ 그건 진짜 개빡세네", "와 씨, 그건 좀 힘들었겠다."]
      : positive
        ? ["와 씨 ㅋㅋ 그건 개좋네", "오 ㅋㅋ 그건 존나 좋았겠다", "와 ㅋㅋ 그건 진짜 개쩐다", "오 씨, 그건 좀 뿌듯하겠다 ㅋㅋ"]
        : ["아 ㅋㅋ 그런 거였구나", "오 씨 ㅋㅋ 그렇구나", "ㅋㅋ 그건 좀 세네", "ㅇㅇ ㅋㅋ 알겠어."];
    return chooseFreshReply(`rough.rewrite.${family}`,options,7)||out;
  }
  function chooseFreshReply(family,rows,limit=7){
    const list=Array.isArray(rows)?rows.filter(Boolean):[];if(!list.length)return "";
    const recent=recentAssistantTurns(limit),recentShapes=new Set(recent.map(v=>normalizedReplyShape(v.text||"")));
    let fresh=list.filter(v=>!recentShapes.has(normalizedReplyShape(v)));
    if(!fresh.length){
      const last=recent.length?normalizedReplyShape(recent[recent.length-1].text||""):"";
      fresh=list.filter(v=>normalizedReplyShape(v)!==last);
    }
    return chooseText(family,fresh.length?fresh:list);
  }
  function styleShortReply(kind){
    const mode=toneMode(),p=profile(),qOK=Number(p.questionTolerance??.5)>.32,qStreak=recentQuestionStreak();
    const pools={
      gentle:{
        ellipsis:["말이 끊겼네요. 천천히 말해도 괜찮아요.","음, 잠깐 말이 멈췄네요. 편하게 있어도 괜찮아요.","괜찮아요. 이어서 말하고 싶을 때 말해 주세요.","조용히 있고 싶은 순간인가 봐요. 그냥 있어도 괜찮아요."],
        question:["응? 뭔가 이상한가요?","어, 뭔가 걸리는 게 있나요?","왜요? 제가 이상하게 답했나요?","응, 무슨 뜻인지 궁금해요.","뭔가 의아한가 보네요."],
        questionNoAsk:["뭔가 의아한가 보네요.","제가 좀 이상하게 답했나 보네요.","응, 뭔가 걸렸나 봐요.","어, 반응을 보니 뭔가 이상했나 보네요."],
        bang:["오, 갑자기 느낌표가 확 늘었네요 ㅎㅎ","오, 텐션이 확 올라왔네요.","앗 ㅎㅎ 갑자기 강조가 세졌네요.","오, 뭔가 강하게 말하고 싶은 느낌이네요."],
        semicolon:["음, 뭔가 애매한 분위기네요.","ㅎㅎ 뭔가 말이 살짝 꼬인 느낌이네요.","어, 미묘한 반응이네요.","음, 뭐라고 할지 애매한 순간인가 봐요."],
        punct:["응, 보고 있어요.","네, 여기 있어요.","응. 계속 보고 있어요.","알겠어요, 보고 있어요."]
      },
      casual:{
        ellipsis:["음... 말이 끊겼네. 천천히 해도 돼.","ㅋㅋ 할 말이 잠깐 사라졌냐","그냥 조용히 있고 싶은 거면 있어도 돼.","음, 이어서 말하고 싶을 때 해.","갑자기 정적이네 ㅋㅋ"],
        question:["응? 뭐가 이상해?","왜 ㅋㅋ 뭔가 이상했어?","응? 내가 뭐 이상하게 말했냐","뭐야 ㅋㅋ 왜 물음표가 늘어나","어, 뭔가 걸렸어?","왜왜 ㅋㅋ"],
        questionNoAsk:["ㅋㅋ 뭔가 이상하긴 했나 보네.","어, 반응 보니까 뭔가 걸렸네.","물음표가 점점 늘어나네 ㅋㅋ","응, 뭔가 의아한가 보네."],
        bang:["오 ㅋㅋ 갑자기 텐션 뭐야","느낌표가 확 늘었네 ㅋㅋ","오, 갑자기 강해졌는데 ㅋㅋ","ㅋㅋ 뭔가 신난 느낌인데"],
        semicolon:["ㅋㅋ 뭔가 애매한 분위기네","세미콜론 뭐야 ㅋㅋ 묘하네","음 ㅋㅋ 뭔가 할 말이 애매하냐","뭔가 살짝 꼬인 느낌인데 ㅋㅋ"],
        punct:["응 ㅋㅋ 보고 있어.","ㅇㅇ 여기 있어.","응, 보고 있음 ㅋㅋ","ㅋㅋ 알겠어. 보고 있어."]
      },
      rough:{
        ellipsis:["ㅋㅋ 왜 갑자기 정적이냐","할 말 없어졌냐 ㅋㅋ 그냥 있어도 돼","ㅋㅋ 말하기 귀찮은 모드네","음 ㅋㅋ 이어서 말하고 싶을 때 해","갑자기 조용해졌네 ㅋㅋ"],
        question:["왜 ㅋㅋ 뭐가 이상해?","뭐야 ㅋㅋ 왜 물음표가 늘어","내가 뭐 이상하게 말했냐 ㅋㅋ","왜왜 ㅋㅋ 뭔데","ㅋㅋ 뭔가 걸렸냐","뭐가 이상한데 ㅋㅋ"],
        questionNoAsk:["ㅋㅋ 뭔가 이상하긴 했나 보네","물음표가 점점 늘어나네 ㅋㅋ","아 ㅋㅋ 뭔가 걸렸구나","반응 보니 좀 이상했나 보네 ㅋㅋ"],
        bang:["오 ㅋㅋ 텐션 뭐냐","느낌표 개많네 ㅋㅋ","ㅋㅋ 갑자기 왜 이렇게 세졌냐","오 씨 ㅋㅋ 뭔가 신났네"],
        semicolon:["ㅋㅋ 뭔가 미묘하게 꼬였네","세미콜론 뭐냐 ㅋㅋ","아 ㅋㅋ 뭔가 애매하네","ㅋㅋ 말 대신 세미콜론이냐"],
        punct:["ㅇㅇ ㅋㅋ 보고 있어","ㅋㅋ 여기 있음","응 ㅋㅋ 뭔데","ㅇㅇ 알겠어 ㅋㅋ"]
      }
    };
    const set=pools[mode]||pools.casual;
    const key=kind==="question"&&(!qOK||qStreak>=1)?"questionNoAsk":kind;
    let rows=(set[key]||set.punct).slice();
    // Fast-path replies used to bypass the normal candidate quality gate entirely.
    // Filter recent exact/shape repeats here so punctuation-only/low-effort users
    // still get varied replies without inventing semantic context.
    return chooseFreshReply(`style.${mode}.${kind}.${key}`,rows,7);
  }
  function profanityOnlyReply(frame){
    if(!frame.profanity)return "";
    const words=frame.text.replace(/[^0-9A-Za-z가-힣]/g," ").trim().split(/\s+/).filter(Boolean);
    const mostly=words.length<=3||frame.text.length<=14;if(!mostly)return "";
    const mode=toneMode(),prev=context().filter(v=>v.role==="assistant").slice(-1)[0];
    if(frame.directedAbuse){
      const rows=mode==="rough"
        ? ["ㅋㅋ 말 세네. 그래도 뭐가 마음에 안 들었는지는 제대로 볼게.","와 말 세다 ㅋㅋ 그래도 어디가 별로였는지는 볼게.","오케이 ㅋㅋ 화난 건 알겠어. 뭐가 문제였는지부터 보자.","ㅋㅋ 나한테 빡친 건 알겠어. 답이 뭐가 이상했는지 다시 볼게."]
        : ["말이 꽤 세네. 뭐가 마음에 안 들었는지는 제대로 볼게.","화난 건 알겠어. 그래도 뭐가 문제였는지부터 볼게.","응, 기분 상한 건 알겠어. 답이 어디서 꼬였는지 다시 볼게.","말은 세지만 무슨 점이 별로였는지는 제대로 볼게."];
      return chooseFreshReply(`style.profanity.directed.${mode}`,rows,7);
    }
    if(prev){
      const rows=mode==="rough"
        ? ["아 ㅋㅋ 그 정도로 빡쳤냐. 방금 뭐가 제일 별로였어?","와 ㅋㅋ 꽤 빡쳤네. 뭐 때문에 그런 건데?","아 씨 ㅋㅋ 많이 짜증났나 보네.","ㅋㅋ 반응 세네. 방금 뭔가 확 거슬렸구나.","오 ㅋㅋ 진짜 별로였나 보네."]
        : mode==="gentle"
          ? ["많이 답답했나 보네요. 어떤 부분이 가장 별로였나요?","기분이 꽤 상했나 봐요. 방금 뭐가 문제였는지 볼게요.","많이 짜증났나 보네요. 제가 놓친 부분이 있으면 다시 볼게요.","반응을 보니 꽤 불편했나 봐요."]
          : ["아, 많이 짜증났구나. 방금 뭐가 제일 별로였어?","와, 꽤 빡쳤나 보네. 뭐 때문에 그래?","아 ㅋㅋ 반응 보니 진짜 별로였나 보네.","응, 많이 거슬렸구나. 방금 흐름 다시 볼게.","오, 반응이 세네. 뭔가 확 짜증났나 보네."];
      return chooseFreshReply(`style.profanity.follow.${mode}`,rows,7);
    }
    const rows=mode==="rough"
      ? ["ㅋㅋ 시작부터 세다. 뭔 일인데","오 ㅋㅋ 뭔가 빡친 일 있냐","와 ㅋㅋ 첫마디부터 세네","아 ㅋㅋ 뭔 일 있었구나"]
      : mode==="gentle"
        ? ["많이 화난 일이 있었나 봐요. 무슨 일인가요?","첫마디부터 꽤 강하네요. 무슨 일 있었어요?","기분이 많이 안 좋은가 봐요. 편하게 말해 주세요."]
        : ["많이 짜증났나 보네. 무슨 일 있었어?","오, 시작부터 반응이 세네. 뭔 일인데?","아 ㅋㅋ 뭔가 화날 일이 있었나 보네.","와, 기분이 꽤 안 좋은가 보네."];
    return chooseFreshReply(`style.profanity.first.${mode}`,rows,7);
  }

  const STOP=new Set("나는 난 내가 내 너 넌 니가 모아 오늘 어제 내일 모레 주말 다음주 지금 진짜 그냥 약간 좀 너무 그리고 그래서 근데 그럼 이거 그거 저거 그것 걔 거기 뭐 왜 어떻게 했다 했어 했는데 있어 없어 같아 같음 사람 이야기 얘기 뭘 뭔 뭔데 뭐를 아니 아오 으 아 야 응 오".split(" "));
  const stripParticle=v=>v.replace(/(?:에게|한테|에서|으로|로|이랑|랑|하고|은|는|이|가|을|를|에|도|만|의)$/," ").trim();
  const normalizeConcept=v=>stripParticle(v).replace(/(?:이야|였어|했어|했지|할거야|하려고|하기로)$/," ").trim();
  function concepts(text){return [...new Set(clean(text).replace(/[^0-9A-Za-z가-힣 ]/g," ").split(/\s+/).map(normalizeConcept).filter(v=>v.length>=2&&!STOP.has(v)))].slice(0,7);}
  function topicFrom(text,cs){
    const quoted=(text.match(/["“‘']([^"”’']{2,30})["”’']/)||[])[1]; if(quoted)return quoted;
    return cs.find(v=>!/^(누구|무엇|뭐야|어디|언제|그게|그거|걔|거기)$/.test(v))||"";
  }

  function detectReaction(raw){
    const c=compact(raw);
    if(/^(좋은아침|굿모닝)/i.test(c))return "morning";
    if(/^(안녕|ㅎㅇ|하이|hello|헬로|반가워)/i.test(c))return "greeting";
    if(/(잘자|굿나잇|자러갈게)/.test(c))return "goodnight";
    if(/(잘가|바이|ㅂㅂ|나갈게|다음에봐|또보자)/.test(c))return "bye";
    if(/(고마워|고맙|감사|땡큐|thanks|ㄱㅅ)/i.test(c))return "thanks";
    if(/(ㅋㅋ|ㅎㅎ|하하|크크)/.test(raw)&&c.length<18)return "laughter";
    if(/^(응|ㅇㅇ|맞아|맞음|그치|그렇지|그래|그랭|ㅇㅋ|오케이|좋아|굿)$/.test(c))return "agreement";
    if(/(그게아니라|아니야|아닌데|잘못알았|잘못알아들|뭔소리|무슨소리|말이안돼|아니라고|내말은|내가말한건|단어가아니잖아|그런단어없|그런말없)/.test(c)||/^아니.+(?:라고|다고|라니까|다니까)$/.test(c))return "correction";
    if(/(멍청|바보|답답|똥멍청|왜이래|헛소리|등신|한심|대답이상|답이상|이상하잖|엉망|왜이렇게답|대답왜|못알아듣|못알아먹)/.test(c))return "insult";
    if(/^(아오+|아휴+|에휴+|으휴+|아이씨+|아씨+)$/.test(c))return "frustration";
    if(/^(아니|아니뭘|아니뭔데|아니뭐)$/.test(c))return "correction";
    if(/(잘하네|잘했|똑똑|천재|대단|최고)/.test(c))return "praise";
    if(/(심심|할거없|노잼)/.test(c))return "bored";
    if(/^(뭐해|뭐하고있어|뭐하는중|모아뭐해)$/.test(c))return "whatdoing";
    if(/(배고파|배고픔|배고프다|뭐먹지)/.test(c)&&c.length<18)return "hungry";
    if(/(긴장돼|긴장된다|떨려|떨린다|걱정돼|걱정된다)/.test(c)&&c.length<22)return "nervous";
    if(/(모르겠어|모르겠다|헷갈려|헷갈린다|이해안돼|이해가안돼|^몰라$)/.test(c)&&c.length<24)return "confused";
    if(/(피곤|졸려|지쳤)/.test(c))return "tired";
    if(/(속상|슬퍼|우울|짜증|화나|열받|서운|아쉽|속상하|실망|기분안좋|별로야)/.test(c))return "sad";
    if(/(기뻐|신나|좋았|재밌었|행복|개좋|기분좋|100점|만점)/.test(c))return "happy";
    if(/^(헐|헉|와|대박|진짜)$/.test(c))return "surprise";
    if(/^(됐어|그만|그만할래)$/.test(c))return "stop";
    if(/^(ㄴㄴ|노노)$/.test(c))return "correction";
    return "";
  }

  function analyze(raw){
    const text=clean(raw),c=compact(text),cs=concepts(text);
    const decisionCue=/(뭐먹지|뭐먹을까|뭘먹지|뭘먹을까|뭐먹을지|뭘먹을지|뭐할까|뭐하지|어디갈까|어디가지|뭘고를까|뭐고르지|어떤게좋을까|뭐가좋을까|뭐부터하지)/.test(c);
    const repairCue=/(물었는데|물어봤는데|물었잖아|물어봤잖아|대답해|대답안|말했잖아|뭐가그렇구나|뭘듣고있|뭘듣고|엉뚱|딴소리|한심|답답|왜이래|못알아듣|왜이렇게답)/.test(c);
    const explicitQuestion=/[?？]$/.test(text)||decisionCue||/^(왜|어떻게|어디|언제|누구|뭐|뭘|무슨|몇|얼마)/.test(c)||/(뭐야|누구야|어디야|언제야|왜|어떻게|어때|알아|알려줘|설명해줘|몇|얼마|맞아|어떡해|어떡하지|할까|해야해|해야돼|좋을까|괜찮을까|맞을까|하지|까|니|냐|나요)$/.test(c);
    const referenceCue=/^(그래서|그다음|그리고|그럼|근데|왜|어떻게|그게|그거|그건|그걸|걔|걔가|거기|그사람|아까)/.test(c);
    const searchCue=/(검색해|검색해줘|찾아줘|찾아봐|알아봐|확인해줘|더자세히|자세히알려|최신|최근|뉴스|날씨|기온|몇도|온도|습도|비와|비올|눈와|눈올|미세먼지|공기질|환율|현지시간|추천해줘|비교해줘)/.test(c);
    let affect="neutral";
    if(/(좋아|재밌|이겼|역전|골넣|성공|신나|기뻐|맛있|잘됐|뿌듯|100점|만점|사줬|선물받|합격|칭찬받|기분좋)/.test(c))affect="positive";
    if(/(싫어|힘들|피곤|실패|속상|짜증|화나|어려|망했|졌어|틀렸|별로|아쉬워|아쉽|싸웠|무시|맛없|기분안좋|큰일|걱정|불안|서운)/.test(c))affect="negative";
    const reaction=detectReaction(text);
    let act=reaction?"social":searchCue?"search":referenceCue?"followup":explicitQuestion?"question":"statement";
    const event=/(했어|갔어|먹었어|봤어|끝냈어|이겼어|졌어|틀렸어|넣었어|역전했어|놀랐어|만들었어|그렸어|놀았어|샀어|왔어|다녀왔어|됐어|받았어|혼났어|어려웠어|쉬웠어|아쉬워했어|맞았어|싸웠어|넘어졌어|무시했어|사줬어|괜찮대|다쳤어)/.test(c)||/(었어|았어|였어)$/.test(c);
    const futureCue=/(내일|모레|주말|다음주|\d{1,2}월\d{1,2}일)/.test(c);
    const scheduledCue=!explicitQuestion&&futureCue&&/(시험|약속|경기|발표|여행|면접|대회)/.test(c);
    const plan=/(할거야|하려고|하기로했어|할예정|갈거야|먹을거야|볼거야|해볼래|하기로|가기로)/.test(c)||(!explicitQuestion&&futureCue&&/(할거|갈거|볼거|먹을거|만날거|시작할|끝낼)/.test(c));
    const preference=/(좋아해|싫어해|재밌어|맛있어|좋더라|별로야|취향)/.test(c);
    const reasonQuestion=explicitQuestion&&/(왜|이유|어째서)/.test(c);
    const opinionQuestion=explicitQuestion&&/(어때|어떻게생각|생각은|괜찮아|좋아보여)/.test(c);
    const factQuestion=explicitQuestion&&!reasonQuestion&&!opinionQuestion&&/(누구|뭐야|무엇|어디|언제|몇|얼마|뜻|알려줘|설명|정의|유래|역사|차이)/.test(c);
    const knowledgeCue=searchCue||factQuestion||reasonQuestion||/(무슨뜻|뜻이뭐|어떤사람|어떤곳|어떤거|차이가뭐|장단점|원리|유래|역사|왜그런|어떻게작동|추천해줘|비교해줘|정리해줘)/.test(c);
    const speechAct=reaction?`social:${reaction}`:plan?"inform:plan":preference?"inform:preference":event?"inform:event":reasonQuestion?"ask:reason":opinionQuestion?"ask:opinion":factQuestion?"ask:fact":act==="followup"?"followup":act==="question"?"ask:question":"inform:statement";
    const punctuation=punctuationOnly(text),profanity=PROFANITY.test(text),directedAbuse=DIRECTED_ABUSE.test(text);
    return {text,c,concepts:cs,topic:topicFrom(text,cs),affect,act,speechAct,reaction,event,plan,scheduledCue,preference,question:explicitQuestion||act==="followup",searchCue,knowledgeCue,referenceCue,decisionCue,repairCue,punctuation,profanity,directedAbuse};
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
    if(!frame.plan&&!frame.scheduledCue)return;const s=state(),topic=frame.topic||s.topic||"";if(!safeTopicForInitiative(topic))return;
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
    noteMemoryFrame(frame);noteInterest(frame,continuity);noteOpenLoop(frame);notePersonalTopic(frame);saveState(); return s;
  }

  function dateTime(raw){
    const c=compact(raw),now=new Date();
    const hour=now.getHours(),minute=now.getMinutes();
    const ampm=hour<12?"오전":"오후",hour12=hour%12||12;
    const timeReply=`지금은 ${ampm} ${hour12}시 ${String(minute).padStart(2,"0")}분이야.`;
    const weekdays=["일요일","월요일","화요일","수요일","목요일","금요일","토요일"];
    const dateReply=d=>`${d.getFullYear()}년 ${d.getMonth()+1}월 ${d.getDate()}일이야.`;
    const dayReply=d=>`${weekdays[d.getDay()]}이야.`;
    const shifted=days=>{const d=new Date(now);d.setDate(d.getDate()+days);return d;};

    if(/^(?:지금|현재)?(?:몇시(?:야|지|니|냐|임|인가|예요|에요)?|시간(?:이)?(?:몇시(?:야|지|니|냐|임)?|뭐야|알려줘)?|현재시간(?:이)?(?:뭐야|몇시야)?|지금시간(?:이)?(?:뭐야|몇시야)?)$/.test(c))return timeReply;
    if(/^(?:오늘|현재)?(?:며칠(?:이야|이지|이니)?|몇일(?:이야|이지|이니)?|날짜(?:가|는)?(?:뭐야|며칠이야|알려줘)?|몇월몇일(?:이야|이지|이니)?|몇월며칠(?:이야|이지|이니)?)$/.test(c))return `오늘은 ${dateReply(now)}`;
    if(/^(?:오늘|현재)?(?:무슨요일(?:이야|이지|이니)?|몇요일(?:이야|이지|이니)?|요일(?:이)?(?:뭐야|어떻게돼|알려줘)?)$/.test(c))return `오늘은 ${dayReply(now)}`;
    if(/^내일(?:은)?(?:무슨요일|몇요일|요일뭐야|요일이뭐야)(?:이야|이지|이니)?$/.test(c))return `내일은 ${dayReply(shifted(1))}`;
    if(/^어제(?:는)?(?:무슨요일|몇요일|요일뭐야|요일이뭐야)(?:이었어|이야|이지|이니)?$/.test(c))return `어제는 ${dayReply(shifted(-1))}`;
    if(/^내일(?:은)?(?:며칠|몇일|날짜뭐야|몇월몇일)$/.test(c))return `내일은 ${dateReply(shifted(1))}`;
    return "";
  }
  function math(raw){
    let s=clean(raw).toLowerCase().replace(/[?？]/g,"").replace(/계산해줘|계산해|얼마야|얼마|답은|결과는/g,"").replace(/더하기|플러스/g,"+").replace(/빼기|마이너스/g,"-").replace(/곱하기|×|x/g,"*").replace(/나누기|÷/g,"/").replace(/,/g,"").replace(/\s+/g,"");
    // 구어체 계산 질문: "1+1은?", "3*4는?", "10/2가?"처럼 식 뒤에 붙은 조사만 제거한다.
    s=s.replace(/(?<=[0-9)%])(?:은|는|이|가)$/u,"");
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
    if(/(너이름|이름뭐|누구야너|넌누구|너누구야|너는누구)/.test(c))return "난 모아야. 여기서 편하게 얘기하면 돼.";
    if(/(?:너(?:밥|아침|점심|저녁)?먹었어|너뭐먹었어|뭐먹었어)/.test(c))return "나는 밥을 먹진 않지만 ㅋㅋ 너는 뭐 먹었어?";
    if(/오늘뭐했어/.test(c))return "나는 오늘도 여기서 얘기 듣고 답해주고 있었지 ㅋㅋ 너는 오늘 뭐 했어?";
    if(/내일뭐해|내일뭐할거/.test(c))return "나는 내일도 여기 있지 ㅋㅋ 네가 오면 또 얘기하면 돼.";
    if(/(몇살|나이가)/.test(c))return "나는 사람처럼 나이가 있는 건 아니야 ㅋㅋ 그냥 모아라고 생각하면 돼.";
    if(/(뭐해|뭐하고있)/.test(c))return chooseText("self.status",["너랑 얘기하는 중이지 ㅋㅋ","지금은 너랑 잡담 중!","네가 뭐 말할지 보고 있었어."]);
    if(/(?:너|넌|모아).*(뭐좋아|좋아하는거|좋아하는음식|좋아하는게임)|(뭐좋아|좋아하는거|좋아하는음식|좋아하는게임).*(너|넌|모아)/.test(c))return chooseText("self.like",["딱 하나 고르긴 어렵네 ㅋㅋ 네 취향 얘기 듣는 건 재밌어.","나는 네가 좋아하는 얘기 듣는 쪽이 더 재밌어 ㅋㅋ"]);
    if(/(뭐가궁금|궁금한거있|뭐궁금)/.test(c))return "나는 네가 요즘 뭐에 관심 있는지나, 오늘 있었던 일 중 뭐가 제일 기억나는지가 궁금해 ㅋㅋ 꼭 대답해야 하는 건 아니고 편한 얘기부터 해도 돼.";
    if(/(뭐할수|할수있는)/.test(c))return "잡담도 하고, 네가 말한 취향이나 대화 흐름을 기억하고, 사실이 필요한 건 공개 자료를 찾아서 내용부터 정리해줄 수 있어.";
    return "";
  }


  function shortUtteranceReply(raw){
    const text=clean(raw),c=compact(text);
    // 한두 단어짜리 감탄/되묻기는 주제로 승격하지 않는다.
    if(!c || c.length>8)return "";
    const mode=toneMode();
    if(/^(뭘|뭐|뭔데|뭐를|무슨말|무슨소리)$/.test(c)){
      const last=context().filter(v=>v.role==="assistant").slice(-1)[0]?.text||"";
      return last
        ? chooseFreshReply(`short.what.after.${mode}`,mode==="gentle"?["제가 방금 말을 애매하게 했네요. 어느 부분인지 다시 정확히 말할게요.","방금 제 말이 헷갈렸나 봐요. 필요한 부분부터 다시 말할게요.","제가 설명을 애매하게 했네요. 앞부분부터 다시 맞춰볼게요."]:["내가 방금 말을 애매하게 했네. 어느 부분인지 다시 정확히 말할게.","아, 방금 내 말이 헷갈렸구나. 필요한 부분부터 다시 말할게.","내가 좀 애매하게 말했네. 앞부분부터 다시 맞춰볼게.","응, 방금 설명이 이상했나 보네. 다시 정확히 갈게."])
        : chooseFreshReply(`short.what.first.${mode}`,mode==="gentle"?["어떤 걸 말하는지 한마디만 더 붙여 주세요.","무엇을 말하는 건지 조금만 더 알려 주세요."]:["어떤 걸 말하는지 한마디만 더 붙여줘.","뭐 말하는 건지 조금만 더 붙여줘.","뭘 말하는 건지 한 조각만 더 줘."]);
    }
    if(/^(아오+|아휴+|에휴+|으휴+)$/.test(c))return chooseFreshReply(`short.sigh.${mode}`,mode==="gentle"?["제가 좀 답답하게 했나 보네요. 방금 흐름부터 다시 맞춰볼게요.","아, 답답했나 봐요. 제가 앞 흐름부터 다시 볼게요.","제가 뭔가 놓쳤나 보네요. 방금 대화부터 다시 맞춰볼게요."]:["내가 답답하게 했네. 방금 흐름부터 다시 맞춰볼게.","아 ㅋㅋ 답답했구나. 내가 앞 흐름 다시 볼게.","내가 뭔가 놓쳤나 보네. 방금 대화부터 다시 맞춰볼게.","아오 나도 방금 답 별로였네 ㅋㅋ 다시 맞춰볼게."]);
    if(/^(아니|아니뭘|아니뭐|아니뭔데)$/.test(c))return chooseFreshReply(`short.no.${mode}`,mode==="gentle"?["네, 제가 방금 잘못 알아들었네요. 앞말 기준으로 다시 볼게요.","아, 제가 포인트를 잘못 잡았네요. 앞에서 한 말 기준으로 다시 볼게요.","맞아요, 제가 잘못 받았네요. 흐름을 다시 맞춰볼게요."]:["응, 내가 방금 잘못 알아들었어. 앞말 기준으로 다시 볼게.","아, 내가 포인트를 잘못 잡았네. 앞에서 한 말로 다시 볼게.","오케이, 내가 잘못 받았어. 흐름 다시 맞출게.","아니 맞네 ㅋㅋ 내가 방금 잘못 알아들었어."]);
    return "";
  }



  function everydayContextReply(raw){
    const c=compact(raw);
    if(/(?:방금|아까)?깼어|잠깼어|막일어났/.test(c))return chooseText("everyday.wakeup.context",["오 이제 깼구나 ㅋㅋ 아직 정신 덜 들었겠다.","방금 깼네. 천천히 정신 차리자.","오 일어났구나. 아직 좀 멍하겠다 ㅋㅋ"]);
    if(/(?:이제|지금).*(?:쉬는중|쉬고있|쉴거)/.test(c))return chooseText("everyday.rest",["오, 이제 좀 쉬는구나. 좋네 ㅋㅋ","드디어 쉬는 시간이네 ㅋㅋ 푹 쉬어.","오케이, 이제 좀 편하게 쉬면 되겠다."]);
    if(/(?:숙제|과제).*(?:끝냈|다했|했어)$/.test(c))return chooseText("everyday.homework",["오, 숙제까지 했네. 이제 좀 편하겠다 ㅋㅋ","숙제 끝냈으면 한결 낫겠다.","오 좋네. 할 일 하나 끝냈구나."]);
    if(/(?:내일|모레|다음주).*(?:시험|발표|경기|약속)/.test(c))return chooseText("everyday.upcoming",["아, 곧 그 일정이 있구나. 신경 좀 쓰이겠다.","오, 그게 곧 있네. 준비할 게 있으면 미리 조금만 챙겨두자.","아, 내일 일정이 있구나. 괜히 신경 쓰일 수 있겠다."]);
    return "";
  }

  function previousUserTexts(limit=4){
    return context().filter(v=>v.role==="user").slice(0,-1).slice(-limit).map(v=>clean(v.text||""));
  }
  function recentUserMentions(rx,limit=4){return previousUserTexts(limit).some(v=>rx.test(compact(v)));}
  function everydayDialogueReply(frame){
    const c=frame.c;
    // 흔한 생활 질문은 일반 fallback보다 먼저 직접 답한다.
    if(/(?:잠이?|잠도?)?(?:안와|안오|못자겠|안자져|안잠).*(?:어떡|어쩌)|(?:잠이?안와|잠이?안오|못자겠어)$/.test(c))
      return "잠이 안 오면 일단 화면 밝기랑 자극을 줄이고 편하게 누워 있어봐. 억지로 자려고 버티기보다 잠깐 조용한 걸 하다가 다시 눕는 것도 괜찮아.";
    if(/학교.*(?:가기싫|가고싶지않).*(?:어떡|어쩌)|학교가기싫.*(?:어떡|어쩌)/.test(c))
      return "가기 싫은 이유가 오늘만 그런 건지, 사람이나 일 때문에 그런 건지 먼저 나눠보는 게 좋아. 오늘 하루가 부담스러운 거면 해야 할 것만 작게 잡고 버텨보자.";
    if(/친구.*사과할까|사과.*해야(?:해|돼)|사과하는게좋을까/.test(c))
      return "네가 잘못한 부분이 있다고 느끼면 짧게라도 사과하는 게 좋아. 변명부터 하기보다 '그건 내가 미안했어'처럼 잘못한 부분을 먼저 말하면 훨씬 낫고.";
    if(/^(?:왜)?하늘(?:은|이)?파래|하늘.*왜.*파/.test(c))
      return "햇빛이 공기 속을 지나갈 때 파란빛이 다른 색보다 더 많이 사방으로 흩어져서 그래. 그래서 낮 하늘이 파랗게 보여.";
    if(/고양이.*왜.*골골|왜.*고양이.*골골/.test(c))
      return "고양이의 골골거림은 편안하거나 만족할 때 많이 나오지만, 긴장하거나 스스로 진정하려 할 때도 나올 수 있어. 그래서 골골거린다고 항상 기분이 좋은 건 아니야.";

    const examSoon=recentUserMentions(/(?:내일|모레|이번주|곧).*(?:시험|발표)|(?:시험|발표).*(?:내일|모레|이번주|곧)/,5);
    if(examSoon&&/(공부.*하나도안했|공부안했|준비하나도안했)/.test(c))
      return "아직 아예 끝난 건 아니야. 지금부터 전부 하려 하지 말고 시험 범위에서 제일 중요한 것 하나부터 잡자.";
    if(examSoon&&/(큰일났|망했다|망했네)/.test(c))
      return "급하긴 한데 아직 할 수 있어. 남은 시간에 전부 보려 하지 말고 자주 틀리는 것이나 핵심 범위부터 챙기는 게 낫겠다.";
    if(examSoon&&/(지금부터할까|공부할까|시작할까)/.test(c))
      return "응, 지금 시작하는 게 제일 나아. 일단 20분만 한 범위에 집중하고, 끝나면 다음 걸 정하자.";
    if(examSoon&&/(뭐부터하지|뭘먼저|어디부터)/.test(c))
      return "시험이면 제일 자신 없는 범위나 선생님이 강조한 부분부터 해. 그것부터 20분 보고, 그다음에 암기할 걸 빠르게 훑는 순서가 좋아.";

    // 일상 사건의 최소한의 자연스러운 맞장구.
    if(/학교(?:갔다왔|다녀왔|끝났)/.test(c))return chooseText("everyday.school",["학교 다녀왔구나. 오늘도 수고했네.","오, 학교 끝나고 왔구나. 이제 좀 쉬겠다."]);
    if(/급식.*맛없/.test(c))return chooseText("everyday.lunch.bad",["아 급식이 별로였구나. 그럼 점심 먹고도 좀 아쉬웠겠다.","으, 급식 맛없으면 은근 하루가 아쉽지 ㅋㅋ"]);
    if(/(?:친구랑|애들이랑)?.*축구했어/.test(c))return chooseText("everyday.soccer",["오 축구했구나 ㅋㅋ","오, 친구들이랑 축구했네. 재밌었겠다."]);
    if(/시험.*(?:100점|만점).*(?:맞았|받았)|(?:100점|만점).*시험/.test(c))return chooseText("everyday.score",["와, 100점이면 제대로 잘했네 ㅋㅋ","오 만점! 그건 좀 뿌듯하겠다."]);
    if(/(?:엄마|아빠|부모님).*(?:치킨|피자|간식|음식).*(?:사줬|시켜줬)/.test(c))return chooseText("everyday.foodgift",["오 그건 좋았겠다 ㅋㅋ 맛있게 먹었어?","오, 그건 기분 좋았겠네 ㅋㅋ"]);
    if(/친구.*싸웠어|싸웠어.*친구/.test(c))return chooseText("everyday.fight",["아, 친구랑 싸웠구나. 그건 마음 좀 불편하겠다.","으, 친구랑 싸우면 계속 신경 쓰이지."]);
    if(/(?:내말|말).*무시했어|무시당했어/.test(c))return chooseText("everyday.ignored",["그건 기분 나빴겠다. 말하는데 무시당하면 짜증나지.","아, 그건 좀 서운했겠다. 네 말을 아예 안 받아준 거네."]);
    if(/괜찮대|괜찮다고했어/.test(c)&&recentUserMentions(/넘어졌|다쳤|아팠/,4))return "다행이다. 크게 다친 건 아니었나 보네.";
    if(/그래서다시했어|다시시작했어|다시했어/.test(c)&&recentUserMentions(/축구|게임|경기|놀/,4))return "아 다행이네. 그래서 다시 이어서 했구나.";
    if(/(?:너무|진짜)?안와|왜이렇게안와/.test(c)&&recentUserMentions(/버스|지하철|기다리는중/,4))return chooseText("context.transit.late",["아직도 안 왔어? 기다리면 그 몇 분이 유난히 길지.","으 계속 기다리는 중이네. 빨리 왔으면 좋겠다.","아 그럼 더 답답하지. 곧 오면 좋겠네."]);
    if(/(?:드디어|이제).*(?:왔다|왔어|옴)/.test(c)&&recentUserMentions(/버스|지하철|기다리는중/,4))return chooseText("context.transit.arrived",["오 드디어 왔네 ㅋㅋ 이제 좀 살겠다.","아 다행이다. 이제 타고 가면 되겠네.","드디어 ㅋㅋ 기다린 보람은 없지만 일단 왔다."]);
    if(/(?:이제)?집이야|집도착|집왔어/.test(c)&&recentUserMentions(/학교|학원|버스|지하철|가는중|이동/,5))return chooseText("context.home.now",["오 이제 집이네. 밖에서 들어오면 확 풀리지.","집 도착했구나 ㅋㅋ 이제 좀 편하게 있어.","오케이, 이제 진짜 쉬어도 되겠다."]);
    if(/(?:내일|나중에).*(?:얘기해볼까|말해볼까|사과해볼까)/.test(c)&&recentUserMentions(/친구.*싸|무시|서운|짜증/,5))return "응, 감정 좀 가라앉은 다음에 내일 차분하게 얘기해보는 건 괜찮아. 네가 서운했던 부분부터 짧게 말해봐.";
    if(/배고프/.test(c)&&recentUserMentions(/일어났|깼어|졸려|피곤/,4))return chooseText("context.hungry",["일어나고 나면 배고프지 ㅋㅋ 뭐라도 간단히 먹자.","아 졸린데 배까지 고프네. 간단한 거라도 먼저 먹는 게 낫겠다.","배고프기도 하구나. 먹을 거 하나 챙기고 천천히 깨자."]);
    if(/^(?:간식|과자|빵|아이스크림|초콜릿|초코)$/.test(c)&&recentUserMentions(/배고프|뭐먹|먹고싶|간식/,4))return chooseText("context.snack.short",["간식 쪽이구나 ㅋㅋ 과자나 빵 같은 거 땡겨?","오 간식! 지금은 달달한 거랑 짭짤한 거 중 뭐가 더 땡겨?","간식이면 부담 없이 하나 먹기 좋지 ㅋㅋ"]);
    if(/(?:간식|과자|빵|아이스크림|초콜릿).*(?:먹고프|먹고싶|땡겨|땡긴)/.test(c))return chooseText("context.snack.want",["ㅋㅋ 간식 땡기는구나. 집에 있는 거 하나 집어먹자.","오 간식 먹고 싶구나. 뭐 있는지부터 한번 보자 ㅋㅋ","그럴 때 있지 ㅋㅋ 과자나 빵 하나 있으면 딱인데."]);
    return "";
  }

  function casualEverydayQuestionReply(frame){
    const c=frame.c;if(!frame.question)return "";
    // 실제 급식표를 모르는 상태에서 사실처럼 꾸며내지 않고, "뭐 나올까"는 가벼운 추측 대화로 받는다.
    if(/급식.*(?:뭐나올까|뭐나오려나|뭐나올지|뭐일까|메뉴뭘까)/.test(c)){
      return chooseText("everyday.lunch.guess",[
        "오늘은 왠지 제육이나 카레 같은 거 나올 것 같은데 ㅋㅋ 그냥 내 촉이야.",
        "급식은 진짜 열어봐야 알지 ㅋㅋ 굳이 찍자면 오늘은 돈까스나 볶음밥 쪽에 한 표.",
        "내가 급식표를 아는 건 아니라 정확히는 못 맞혀 ㅋㅋ 그래도 오늘은 면이나 덮밥류 나올 것 같은 느낌.",
        "그냥 감으로 찍어보면 제육덮밥 같은 든든한 거 ㅋㅋ 맞으면 내가 괜히 뿌듯할 듯."
      ]);
    }
    if(/급식.*(?:뭐야|메뉴뭐|뭐나와|뭐나오니|뭐나옴)/.test(c))return "정확한 급식 메뉴는 학교랑 날짜를 알아야 확인할 수 있어. 학교를 말해주면 찾아볼 수 있어.";
    return "";
  }

  function broadEverydayReply(frame){
    const c=frame.c;if(frame.question||frame.searchCue)return "";
    const rows=(id,arr)=>chooseText(`broad.${id}`,arr);
    if(/(?:학교|학원).*(?:끝났|끝나서|끝남|마쳤|다녀왔)/.test(c))return rows("school.done",["오, 이제 일정 하나 끝났네. 좀 숨 돌리겠다 ㅋㅋ","학교나 학원 끝나고 나면 그때부터가 진짜 내 시간 같지 ㅋㅋ","오 수고했네. 이제 좀 편하게 있어도 되겠다."]);
    if(/(?:숙제|과제|공부).*(?:해야돼|해야해|남았|귀찮)/.test(c))return rows("study.todo",["아 그거 남아 있으면 계속 신경 쓰이지 ㅋㅋ 일단 제일 짧은 것부터 하나 끝내자.","귀찮아도 시작만 해두면 좀 낫더라. 10분만 잡고 해보자.","할 게 남아 있구나. 전부 생각하지 말고 하나만 먼저 치우는 게 낫겠다."]);
    if(/(?:게임|축구|농구|배드민턴).*(?:이겼|승리|잘했)/.test(c))return rows("game.win",["오 이겼네 ㅋㅋ 그럼 기분 좀 좋았겠다.","오 잘했네 ㅋㅋ 그런 판은 끝나고도 계속 생각나지.","이야 결과 좋았네 ㅋㅋ"]);
    if(/(?:게임|축구|농구|배드민턴).*(?:졌|패배|망했)/.test(c))return rows("game.lose",["아 졌구나. 아깝게 졌으면 더 생각나지.","으 결과는 아쉽네. 그래도 다음 판에 바로 복구하면 되지 ㅋㅋ","아 그건 좀 아쉽겠다. 잘 풀리다가 진 거면 더 그렇고."]);
    if(/(?:유튜브|영상|애니|드라마|영화).*(?:봤어|보는중|봤는데)/.test(c))return rows("media.watch",["오 그거 보고 있었구나 ㅋㅋ 재밌었으면 시간 순삭이지.","오 영상 봤네. 괜찮았나 보다.","아 그거 봤구나. 볼 만했어?"]);
    if(/(?:치킨|피자|라면|떡볶이|햄버거|김밥|과자|아이스크림).*(?:먹었|먹는중|먹었다)/.test(c))return rows("food.ate",["오 맛있는 거 먹었네 ㅋㅋ","그건 무난하게 행복한 선택이지 ㅋㅋ","오 먹었구나. 배는 좀 찼겠다."]);
    if(/(?:집에|집).*(?:왔어|도착|가는중|간다|가고있)/.test(c))return rows("home.arrive",["오 집 왔구나. 이제 좀 편하겠다.","집 도착했네 ㅋㅋ 밖에 있다 들어오면 확 풀리지.","오케이, 이제 집 모드네 ㅋㅋ"]);
    if(/(?:씻었|씻고|샤워했|샤워하고|목욕했)/.test(c))return rows("washed",["오 씻고 나면 좀 개운하지 ㅋㅋ","이제 진짜 쉴 준비 끝났네.","오 개운하겠다. 이제 편하게 있으면 되겠네."]);
    if(/(?:자야지|잘거야|이제잘래|자러갈)/.test(c))return rows("sleep.plan",["응, 오늘은 푹 자. 내일 덜 피곤하게 ㅋㅋ","오케이. 이제 폰 조금만 보고 자자 ㅋㅋ","좋아, 오늘은 여기까지 하고 푹 쉬자."]);
    if(/(?:비왔|비오네|눈왔|눈오네|덥다|추워|춥다)/.test(c))return rows("weather.react",["오늘 날씨가 좀 확실하네 ㅋㅋ 밖에 있으면 바로 체감되겠다.","이런 날씨는 밖에 나갈 때 은근 귀찮지.","날씨가 오늘 존재감 세네 ㅋㅋ"]);
    if(/(?:재밌다|재밌네|꿀잼)/.test(c))return rows("fun",["ㅋㅋ 제대로 재밌나 보네.","오 그럼 잘 골랐네 ㅋㅋ","재밌으면 됐지 ㅋㅋ 계속 즐겨."]);
    if(/(?:귀찮아|하기싫어|아무것도하기싫)/.test(c))return rows("lazy",["아 그런 날 있지 ㅋㅋ 꼭 해야 하는 거 아니면 좀 쉬어.","귀찮을 땐 진짜 작은 것 하나만 하고 나머진 미뤄도 돼.","오늘 에너지 없는 날인가 보네. 최소한만 하자 ㅋㅋ"]);
    if(/(?:배불러|배부르다)/.test(c))return rows("full",["ㅋㅋ 잘 먹었네. 이제 좀 가만히 있고 싶겠다.","배부르면 움직이기 싫지 ㅋㅋ","오 든든하게 먹었구나."]);
    if(/(?:버스|지하철|차).*(?:타고가|타는중|기다리는중|왔어)/.test(c))return rows("transit",["오 이동 중이구나. 은근 그 시간이 제일 멍해지지 ㅋㅋ","가는 중이네. 자리 있으면 좀 편하게 가겠다.","오케이, 이동 모드구나. 도착할 때까지 좀 쉬어."]);
    if(/(?:산책|걷기|걷고|걸었|공원).*(?:했어|하는중|갔다왔|다녀왔)/.test(c))return rows("walk",["오 산책했구나. 잠깐이라도 밖에 나가면 머리 좀 맑아지지.","걷고 왔네 ㅋㅋ 괜히 기분 환기될 때 있지.","오 좋네. 가볍게 움직이고 오면 몸도 좀 풀리겠다."]);
    if(/(?:운동|헬스|줄넘기|달리기|런닝|배드민턴|농구).*(?:했어|끝났|하는중)/.test(c))return rows("exercise",["오 운동했네. 끝나고 나면 힘든데 은근 개운하지 ㅋㅋ","수고했네 ㅋㅋ 몸 좀 쓰고 나면 쉬는 맛 있지.","오 오늘 움직였구나. 물 좀 마시고 쉬어."]);
    if(/(?:음악|노래).*(?:듣는중|듣고있|들었어|좋다)/.test(c))return rows("music",["오 노래 듣고 있구나. 분위기 타기 딱 좋지 ㅋㅋ","음악 듣는 중이네. 마음에 드는 곡 나오면 괜히 기분 좋아지지.","오 좋네. 노래 하나 잘 걸리면 한동안 그것만 듣게 되더라 ㅋㅋ"]);
    if(/(?:방청소|청소|정리).*(?:했어|끝냈|하는중)/.test(c))return rows("cleaning",["오 정리했네. 끝내고 나면 공간도 마음도 좀 깔끔해진 느낌이지 ㅋㅋ","청소 끝냈구나. 귀찮은 거 하나 제대로 치웠네.","오 수고했네. 이제 깨끗한 데서 쉬면 되겠다."]);
    if(/(?:간식|과자|빵|아이스크림).*(?:먹는중|먹었어|먹었다)/.test(c))return rows("snack",["오 간식 먹었네 ㅋㅋ 그 정도 행복은 챙겨야지.","간식 타임이었구나. 맛있는 거 먹으면 잠깐 기분 좋아지지.","오 좋네 ㅋㅋ 뭐든 맛있게 먹었으면 됐지."]);
    if(/(?:시험|퀴즈|발표).*(?:끝났|끝냈|보고왔|봤어)/.test(c))return rows("test.done",["오 끝났구나. 결과랑 별개로 일단 큰 거 하나 지나갔네.","드디어 끝났네 ㅋㅋ 이제 그 생각 좀 내려놔도 되겠다.","수고했네. 끝나고 나면 괜히 머리 텅 빈 느낌 들지 ㅋㅋ"]);
    if(/(?:학원|학교|수업).*(?:가는중|가야돼|가야해)/.test(c))return rows("school.going",["아 이제 가야 하는구나. 귀찮아도 다녀오면 또 금방 끝나 있더라.","오 가는 중이네. 일단 오늘 할 것만 하고 오자 ㅋㅋ","학교나 학원 가는 시간이네. 너무 멀리 생각하지 말고 오늘 것만 넘기자."]);
    if(/(?:친구|애들이랑).*(?:놀았|노는중|만났|만나는중)/.test(c))return rows("friends",["오 친구들이랑 있었구나 ㅋㅋ 재밌게 놀았으면 됐지.","친구 만났네. 그런 날은 시간 진짜 빨리 가지 ㅋㅋ","오 좋네. 같이 놀 사람 있으면 심심할 틈이 덜하지."]);
    if(/(?:새로|처음).*(?:샀어|샀다|받았어|생겼어)/.test(c))return rows("newitem",["오 새로 생겼네 ㅋㅋ 괜히 한동안 계속 보게 되지.","오 좋겠다. 새 거 생기면 괜히 기분 좋지 ㅋㅋ","오, 그건 좀 신나겠다. 마음에 들면 제대로 잘 얻은 거네."]);
    if(/(?:실수했|틀렸|깜빡했|잊어버렸)/.test(c))return rows("mistake",["아 그건 좀 아쉽겠다. 한 번 그런 걸로 다 망한 건 아니니까 다음에 그 부분만 챙기면 돼.","으 그건 아쉽네. 그래도 왜 틀렸는지 알면 다음엔 덜 걸릴 거야.","아 그런 실수 은근 계속 생각나지. 아쉽긴 해도 이미 지난 거면 다음 한 번만 잘하면 돼."]);
    if(/(?:기다리는중|기다려야|기다리고있)/.test(c))return rows("waiting",["아 기다리는 중이구나. 애매하게 시간 안 가는 구간이지 ㅋㅋ","기다릴 때가 제일 길게 느껴지지. 그냥 잠깐 수다나 떨자.","오 대기 중이네. 급한 거 아니면 그동안 좀 멍 때려도 되겠다."]);
    if(/(?:방금|아까)?(?:일어났|깼어|잠깼)/.test(c))return rows("wakeup",["오 이제 일어났구나 ㅋㅋ 아직 정신 덜 깼겠다.","방금 일어났네. 물 한 잔 마시면 좀 깰 거야.","오 기상했네 ㅋㅋ 천천히 정신 차리자."]);
    if(/(?:누워있|침대에있|뒹굴|빈둥)/.test(c))return rows("lying",["ㅋㅋ 완전 휴식 모드네. 그럴 땐 괜히 아무것도 하기 싫지.","오 그냥 늘어져 있는 중이구나. 잠깐 그러고 있는 것도 좋지.","침대 모드네 ㅋㅋ 편하게 있어."]);
    if(/(?:오늘|하루종일).*(?:아무것도안했|한게없|별거안했)/.test(c))return rows("nothing",["그런 날도 있지 ㅋㅋ 꼭 매일 뭔가 해내야 하는 건 아니잖아.","오늘은 그냥 쉬는 날이었나 보네. 별거 안 해도 하루는 하루지.","아무것도 안 한 것 같아도 쉬었으면 그걸로 된 날도 있어."]);
    if(/(?:수업|학교|학원).*(?:노잼|재미없|지루|졸려)/.test(c))return rows("class.boring",["아 그 시간 진짜 안 가겠다 ㅋㅋ 지루하면 시계만 자꾸 보게 되지.","으 수업 재미없으면 체감 시간이 두 배지.","ㅋㅋ 그럴 땐 끝나는 시간만 기다리게 되지."]);
    if(/(?:시험|퀴즈).*(?:망했|조졌|못봤|틀린거같)/.test(c))return rows("test.bad",["아 시험이 잘 안 풀렸구나. 끝난 건 너무 오래 붙잡지 말자.","으 그건 아쉽겠다. 결과 나오기 전까진 생각보다 괜찮을 수도 있어.","망한 느낌 들면 계속 생각나지. 일단 끝난 건 내려놓자."]);
    if(/(?:점수|성적).*(?:나왔|떴어|확인했)/.test(c))return rows("score.out",["오 점수 나왔구나. 생각했던 거랑 비슷했어?","결과 떴네. 잘 나왔든 아쉽든 일단 기다리던 건 끝났네.","오 드디어 점수 확인했구나."]);
    if(/(?:게임|롤|발로란트|마크|로블록스).*(?:하는중|하고있|켜놨)/.test(c))return rows("game.playing",["오 게임 중이구나 ㅋㅋ 한 판 쉬는 타이밍에 온 거야?","ㅋㅋ 게임하면서 왔네. 잘 풀리고 있어?","오 플레이 중이네. 오늘 판은 좀 괜찮아?"]);
    if(/(?:친구|애).*(?:웃겨|웃겼|개웃김|웃김)/.test(c))return rows("friend.funny",["ㅋㅋ 친구가 또 한 건 했나 보네.","아 ㅋㅋ 뭔 짓 했길래 그렇게 웃겨.","ㅋㅋ 같이 있으면 계속 터지는 친구 있지."]);
    if(/(?:숙제|과제).*(?:다했|끝냈|끝남|완료)/.test(c))return rows("homework.done.more",["오 다 끝냈네 ㅋㅋ 이제 마음 편하겠다.","좋다. 할 일 끝내고 쉬는 게 제일 편하지.","오 숙제 클리어. 이제 네 시간이다 ㅋㅋ"]);
    if(/(?:배고파|배고프|배고픔)/.test(c))return rows("hungry.plain",["아 배고프구나 ㅋㅋ 뭐 먹을지 생각나는 거 있어?","배고프면 다른 생각 잘 안 나지 ㅋㅋ 간단히라도 뭐 좀 먹자.","오 배고픈 시간이네. 밥이 당겨, 간식이 당겨?"]);
    if(/(?:졸려|졸리다|잠온다|잠와)$/.test(c))return rows("sleepy.plain",["아 졸리구나 ㅋㅋ 가능하면 잠깐이라도 쉬어.","눈 감기기 시작하면 진짜 아무것도 하기 싫지.","졸리면 집중도 안 되지. 조금 쉴 수 있으면 쉬자."]);
    if(/(?:할거없|뭐하지|심심하네|심심해)$/.test(c))return rows("bored.plain",["그럼 나랑 아무 말 대잔치나 하자 ㅋㅋ","심심하면 가볍게 하나 고르자. 게임 한 판, 영상 하나, 아니면 그냥 수다.","오 심심 모드네 ㅋㅋ 내가 말동무 해줄게."]);
    if(/(?:오늘|지금).*(?:기분좋|기분최고|신난|행복)/.test(c))return rows("mood.good",["오 오늘 기분 좋은 날이네 ㅋㅋ 이런 날은 그냥 즐겨야지.","좋네 ㅋㅋ 별일 없어도 기분 좋으면 그게 제일이다.","오 텐션 괜찮네 ㅋㅋ 그대로 가자."]);
    if(/(?:오늘|지금).*(?:기분별로|기분안좋|짜증나|빡쳐)/.test(c))return rows("mood.bad",["아 오늘 좀 꼬이는 날인가 보네. 괜히 다 거슬릴 때 있지.","으 기분 별로구나. 굳이 멀쩡한 척 안 해도 돼.","아 짜증나는 날이네. 여기선 그냥 툭툭 말해도 돼."]);
    return "";
  }

  const COMMON_KNOWLEDGE={
    "피카츄":"피카츄는 포켓몬스터에 등장하는 전기타입 포켓몬이야. 노란 몸, 길고 뾰족한 귀, 번개 모양 꼬리가 특징이고 포켓몬 시리즈를 대표하는 캐릭터 중 하나야.",
    "포켓몬":"포켓몬은 사람과 함께 살아가거나 배틀을 하는 여러 종류의 생물을 중심으로 한 게임·애니메이션 시리즈야. 정식 이름은 포켓몬스터야.",
    "세종대왕":"세종대왕은 조선의 제4대 왕이야. 훈민정음 창제를 이끌었고 과학·문화·농업 같은 여러 분야의 발전을 지원한 왕으로 잘 알려져 있어.",
    "이순신":"이순신은 조선 시대의 장군이야. 임진왜란 때 수군을 이끌며 여러 해전에서 활약한 인물로 알려져 있어.",
    "지구":"지구는 우리가 살고 있는 태양계의 세 번째 행성이야. 표면에 액체 상태의 물이 넓게 존재하고 현재까지 생명체가 사는 것으로 확인된 행성이야.",
    "태양":"태양은 태양계 중심에 있는 별이야. 지구를 포함한 행성들이 태양 주위를 돌고, 태양의 빛과 열은 지구 생명과 기후에 아주 큰 영향을 줘.",
    "달":"달은 지구 주위를 도는 자연위성이야. 스스로 빛을 내는 게 아니라 태양빛을 반사해서 밝게 보여.",
    "공룡":"공룡은 아주 오래전 중생대에 살았던 파충류 무리야. 종류가 매우 다양했고, 새는 공룡의 한 갈래에서 이어진 것으로 봐.",
    "고양이":"고양이는 사람과 함께 사는 대표적인 반려동물 중 하나야. 청각과 균형감각이 뛰어나고 독립적인 행동을 많이 보여.",
    "강아지":"강아지는 개의 어린 개체를 뜻하고, 일상에서는 반려견을 귀엽게 부르는 말로도 자주 써. 개는 사람과 오랫동안 함께 살아온 동물이야.",
    "대한민국":"대한민국은 동아시아 한반도 남부에 있는 나라야. 수도는 서울이고 한국어를 주로 사용해.",
    "한글":"한글은 한국어를 적는 문자 체계야. 훈민정음을 바탕으로 발전했고 자음과 모음을 조합해서 글자를 만드는 방식이야.",
    "무지개":"무지개는 공기 중의 물방울에서 햇빛이 굴절되고 반사되면서 여러 색으로 나뉘어 보이는 현상이야.",
    "번개":"번개는 구름 안이나 구름과 지면 사이에서 큰 전기 방전이 일어날 때 생기는 강한 빛이야. 천둥은 그때 공기가 급격히 팽창하면서 생기는 소리야.",
    "화산":"화산은 지하의 마그마와 가스가 지표로 올라오는 통로와 그 주변에 만들어진 지형이야.",
    "블랙홀":"블랙홀은 중력이 아주 강해서 일정 경계 안에서는 빛조차 빠져나오기 어려운 천체야."
  };
  function localKnowledgeReply(raw){
    const text=clean(raw),c=compact(text);
    if(/(생김새|어떻게생겼|사진|이미지|모습보여|얼굴보여)/.test(c))return "";
    if(!/(뭐야|누구야|무엇이야|설명해줘|알려줘)$/.test(c))return "";
    let q=text.replace(/[?？.!]+$/g,"").replace(/\s*(?:뭐야|누구야|무엇이야|설명해줘|알려줘)$/g,"").trim();
    q=q.replace(/(\S{2,})(?:은|는|이|가)$/,"$1").trim();
    return COMMON_KNOWLEDGE[q]||"";
  }

  function practicalDecisionReply(raw){
    const text=clean(raw),c=compact(text);
    const meal=/(점심|저녁|아침|야식|밥|먹지|먹을까|먹을거|먹을지)/.test(c)&&( /(뭐먹|뭘먹|메뉴|먹지|먹을까|먹을지)/.test(c) );
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
    if(!/(물었는데|물어봤는데|물었잖아|물어봤잖아|대답해|대답안|말했잖아|뭐가그렇구나|뭘듣고있|뭘듣고|엉뚱|딴소리|한심|답답|왜이래|왜이렇게답|못알아듣|멍청|바보)/.test(c))return "";
    let embedded=clean(raw).match(/((?:아침|점심|저녁|야식)?\s*(?:뭐|뭘)\s*먹(?:지|을까|을지))/)?.[1]||"";
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
    morning:["좋은 아침 ㅋㅋ 잘 잤어?","좋은 아침! 오늘도 천천히 시작하자.","굿모닝 ㅋㅋ 아침은 괜찮아?"],
    greeting:["안녕! 편하게 얘기해.","오 안녕 ㅋㅋ 뭐 하다 왔어?","안녕! 오늘은 어땠어?","오 왔네 ㅋㅋ 무슨 얘기부터 할까?","반가워. 궁금한 거 물어봐도 되고 그냥 수다 떨어도 돼.","안녕 ㅋㅋ 오늘 있었던 일 하나만 던져봐.","오 왔구나 ㅋㅋ 그냥 생각나는 말부터 해도 돼.","안녕! 오늘 별일 없었어도 괜찮아. 아무 얘기나 하자.","ㅎㅇ ㅋㅋ 안녕. 지금 기분은 좀 어때?","오 반가워. 오늘 있었던 거 하나씩 얘기해보자."],
    goodnight:["잘 자! 푹 쉬어.","응, 잘 자 ㅋㅋ 내일 보자.","굿나잇. 오늘은 여기까지 하고 푹 쉬자."],
    bye:["응, 다음에 또 얘기하자!","잘 가! 나중에 또 와 ㅋㅋ","오케이. 다음에 보자!","응, 들어가 ㅋㅋ 다음에 이어서 얘기하자.","잘 가! 오늘 얘기 재밌었어.","오케이, 다음에 또 보자."],
    thanks:["뭘 ㅋㅋ 도움이 됐다면 다행이지.","응! 필요하면 또 말해.","별말을 ㅋㅋ","오케이 ㅋㅋ 도움 됐으면 됐지.","응응. 또 궁금한 거 생기면 바로 물어봐.","천만에 ㅋㅋ"],
    laughter:["ㅋㅋㅋ 왜 웃겨","아 ㅋㅋ 그 반응 뭐야","ㅋㅋ 나도 웃기네","ㅋㅋㅋㅋ 그건 인정","아 상황 생각하니까 웃기네 ㅋㅋ","ㅋㅋ 갑자기 분위기 뭐야","ㅋㅋㅋ 반응만 봐도 웃기네","아 ㅋㅋ 그 정도로 웃겼냐","ㅋㅋ 인정. 나도 좀 터졌다","왜 ㅋㅋ 뭔가 생각났어?"],
    agreement:["그치 ㅋㅋ","응, 맞아.","맞아. 딱 그 얘기였어.","ㅇㅇ 나도 그렇게 봐.","응, 그 포인트가 맞아.","그렇지. 그 얘기야.","맞지 ㅋㅋ 딱 그 느낌.","응응, 그건 나도 동의해.","ㅇㅇ 그 얘기면 말 된다.","그치. 그래서 더 그렇게 느껴지는 듯."],
    correction:["아, 내가 잘못 알아들었네. 다시 맞춰볼게.","오케이, 그건 내가 잘못 짚었어.","아니었구나. 그 부분은 다시 볼게.","아 그 뜻이 아니었네. 지금 말한 기준으로 다시 볼게.","응, 내가 앞부분을 엉뚱하게 잡았어.","오케이 수정. 네 말 기준으로 이어갈게."],
    insult:["내 답이 이상했네. 방금 말은 취소할게.","응, 내가 맥락을 잘못 잡았어.","맞아. 방금 답은 제대로 못 알아들은 거야.","그 답은 별로였네. 질문에 바로 맞춰서 다시 갈게.","응, 방금은 내가 헛다리 짚었어."],
    frustration:["아, 내가 답답하게 말했네. 앞 얘기 기준으로 다시 맞춰볼게.","응, 방금 흐름을 놓쳤어. 엉뚱하게 받아치지 않을게.","오케이, 같은 말 돌리지 말고 핵심부터 다시 볼게.","내가 자꾸 빗나갔네. 지금 질문만 정확히 잡아서 답할게."],
    praise:["오 ㅋㅋ 갑자기 칭찬받으니까 좋네.","고마워 ㅋㅋ 계속 잘해볼게.","오, 그 말은 기분 좋다 ㅋㅋ","오 인정받았다 ㅋㅋ","고마워. 다음 답도 제대로 해볼게.","ㅋㅋ 칭찬 접수"],
    bored:["그럼 아무 얘기나 해보자 ㅋㅋ","심심하면 같이 떠들자.","나랑 잡담하자 ㅋㅋ 게임 얘기든 학교 얘기든 아무거나.","그럼 주제 랜덤으로 하나 던질까? 요즘 제일 자주 하는 거 뭐야?","심심할 땐 별거 아닌 얘기가 제일 재밌지 ㅋㅋ 오늘 웃긴 일 없었어?","오케이 내가 상대해줄게 ㅋㅋ 게임, 음식, 학교 중 하나 골라."],
    tired:["아이고, 오늘 좀 빡셌나 보다.","피곤했구나. 좀 쉬어도 되겠다.","오늘 많이 바빴나 보네.","아 피곤하면 말하기도 귀찮지. 짧게 얘기해도 돼.","오늘 에너지 다 썼나 보다.","졸리면 무리해서 버티지 말고 좀 쉬자.","와 오늘 에너지 거의 바닥이네 ㅋㅋ","그 정도면 아무것도 하기 싫겠다. 잠깐 늘어져 있어도 돼.","아 피곤한 날은 진짜 말도 짧아지지. 그냥 편하게 있어.","오늘은 생산성보다 회복이 먼저겠다."],
    sad:["아 그건 기분 별로였겠다.","속상했겠네.","그런 일 있으면 기분 확 가라앉지.","아 그건 좀 마음 쓰였겠다.","그 상황이면 기분 상할 만하네.","응, 그건 쉽게 넘길 일은 아니었겠다.","아 그건 듣기만 해도 좀 찝찝하네.","으, 그런 일 겪으면 한동안 생각나지.","그건 네가 기분 상할 만한 상황이네.","아쉽고 짜증나는 게 같이 올 만하다."],
    happy:["오 좋네 ㅋㅋ","그거 괜찮다! 기분 좋았겠네.","오호 ㅋㅋ 좋은 일 있었네.","오 그건 자랑할 만한데 ㅋㅋ","좋았겠다. 듣는 나도 기분 괜찮네.","오 오늘 건 성공이네 ㅋㅋ","와 그건 기분 좋아질 만하지 ㅋㅋ","오 제대로 잘 풀렸네. 이건 인정.","좋다 ㅋㅋ 이런 얘기는 듣는 나도 신남.","오 오늘 운 좀 따라줬네 ㅋㅋ"],
    surprise:["헐 진짜?","오, 그건 좀 놀랍네.","와 ㅋㅋ 그건 예상 못 했는데.","엥 진짜로?","와 그건 갑자기네 ㅋㅋ","오 그런 일이 있었어?","헉, 그건 예상 밖인데.","와 잠깐 ㅋㅋ 진짜 그런 거야?"],
    whatdoing:["나? 여기서 네 얘기 들을 준비 중 ㅋㅋ","지금은 너랑 얘기하는 중이지 ㅋㅋ","딱히 바쁜 건 없어. 네가 말 걸어서 대화 중!","나는 여기 있어 ㅋㅋ 뭐 하고 있었어?","지금 너한테 답하는 중. 아무 얘기나 던져봐."],
    hungry:["배고프구나 ㅋㅋ 지금 딱 먹고 싶은 거 있어?","아 배고플 때 음식 생각밖에 안 나지 ㅋㅋ","뭐라도 간단히 먹고 싶겠다. 밥 쪽이야 간식 쪽이야?","배고프면 괜히 예민해지기도 하지 ㅋㅋ 먹을 거 생각해보자."],
    nervous:["긴장되는구나. 너무 앞까지 생각하지 말고 바로 다음 한 가지만 보면 좀 낫더라.","아 그럴 때 괜히 심장 빨리 뛰지. 준비한 것부터 하나씩 하면 돼.","걱정되는 일이 있구나. 뭐 때문에 제일 신경 쓰이는지 말해도 돼.","떨리는 건 이해돼. 지금 할 수 있는 것 하나만 먼저 챙겨보자."],
    confused:["헷갈리는구나. 어디부터 꼬였는지 한 부분만 말해주면 같이 정리해볼게.","아 이해가 안 붙는 부분이 있네. 문장이나 문제를 그대로 말해줘도 돼.","모르겠을 땐 한 번에 다 보지 말고 제일 막히는 부분부터 보면 돼.","오케이, 그럼 아는 부분이랑 모르는 부분을 나눠서 같이 보자."],
    stop:["알겠어. 그 얘기는 여기까지 하자.","오케이, 그건 그만 얘기할게.","응, 알겠어. 다른 얘기 하고 싶으면 그때 말해."]
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

  function expressionKey(text){
    const t=clean(text).toLowerCase();let h=2166136261;
    for(let i=0;i<t.length;i++){h^=t.charCodeAt(i);h=Math.imul(h,16777619);}
    return "e"+(h>>>0).toString(36);
  }
  function expressionFeatureKeys(text){
    const t=clean(text),out=[];
    if(/ㅋㅋ|ㅎㅎ/.test(t))out.push("f:laugh");
    if(/[?？]$/.test(t))out.push("f:question");
    if(t.length<=18)out.push("f:short"); else if(t.length>=55)out.push("f:long");
    if(/그랬구나|그렇구나|알겠어|듣고 있어|응/.test(t))out.push("f:ack");
    if(/힘들|속상|신경|기분|아쉽|짜증/.test(t))out.push("f:empathy");
    if(/오 |와 |헐|좋네|잘됐|뿌듯/.test(t))out.push("f:positive-react");
    if(/ㅋㅋ|ㅎㅎ/.test(t)&&t.length<=34)out.push("f:light-humor");
    if(/(?:괜찮|다행|수고|잘했|인정|좋겠다|아쉽)/.test(t))out.push("f:warm-react");
    if(!/[?？]$/.test(t)&&t.length>=12&&t.length<=42)out.push("f:mid-statement");
    return [...new Set(out)].slice(0,6);
  }
  function publicExpressionBoost(text){
    const data=expressionByUser.get(userKey())||{},keys=[expressionKey(text),...expressionFeatureKeys(text)];
    let total=0,count=0;
    for(const key of keys){const row=data[key];if(!row)continue;const pos=Number(row.positiveScore??row.positive??0),neg=Number(row.negativeScore??row.negative??0),tier=String(row.tier||"observing");let raw=(pos-neg)*1.35;
      if(tier==="solo")raw=Math.max(-1.5,Math.min(2.5,raw));else if(tier==="growing")raw=Math.max(-3,Math.min(5,raw));else raw=Math.max(-5,Math.min(8,raw));
      total+=raw;count++;
    }
    return count?Math.max(-7,Math.min(10,total/Math.sqrt(count))):0;
  }
  function weightedPick(items,scoreFn,random=Math.random){
    if(!items?.length)return null;
    const scored=items.map(v=>({v,score:Number(scoreFn(v)||0)}));
    const max=Math.max(...scored.map(x=>x.score)),eligible=scored.filter(x=>x.score>=max-16);
    const weights=eligible.map(x=>Math.max(.02,Math.exp((x.score-max)/5.5))),sum=weights.reduce((a,b)=>a+b,0);
    let r=Math.max(0,Math.min(.999999,Number(random())||0))*sum;
    for(let i=0;i<eligible.length;i++){r-=weights[i];if(r<=0)return eligible[i].v;}
    return eligible[eligible.length-1].v;
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
    for(const name of Object.keys(scores)){if(scores[name]>-900){scores[name]+=publicPolicyBoost(key,name)+learnedLocalScore("strategies",name);scores[name]-=repeatPressure(name)*9;}}
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
    const chosen=weightedPick(pool,v=>publicExpressionBoost(v.text)+expressionFeatureKeys(v.text).reduce((sum,k)=>sum+learnedLocalScore("features",k),0)-(used.includes(v.id)?7:0),Math.random)||items[0]; if(!chosen)return "";
    recentChoices.set(key,[chosen.id,...used.filter(v=>v!==chosen.id)].slice(0,16)); return chosen.text;
  }
  function correctionReply(frame){
    const c=frame.c;
    const m=frame.text.match(/(?:아니\s*)?(.{1,24}?)(?:\s*(?:먹었다고|했다구|했다고|라고|라니까|였다고|이라고))?[.!?]?$/);
    if(/(?:아니)?(?:피자|치킨|떡볶이|라면|김밥|햄버거|국수|밥|급식|과자|빵)(?:먹었다고|먹었어|먹었다니까)/.test(c)){
      const food=(frame.text.match(/(피자|치킨|떡볶이|라면|김밥|햄버거|국수|밥|급식|과자|빵)/)||[])[1];
      if(food)return `아, ${food}였구나. 내가 잘못 알아들었네.`;
    }
    if(/그게아니라/.test(c))return chooseText("social.correction.detail",["아, 내가 앞말을 잘못 잡았네. 지금 말한 내용으로 다시 맞출게.","오케이, 내가 포인트를 잘못 잡았어. 지금 설명한 쪽이 맞는 거네."]);
    return "";
  }

  function socialReactionReply(frame){
    if(!frame?.reaction)return "";
    const previous=context().filter(v=>v.role==="assistant").slice(-1)[0];
    if(frame.reaction==="correction"){const direct=correctionReply(frame);if(direct)return direct;}
    if(frame.reaction==="insult"){
      const complaint=/(왜이렇게답|대답이상|답이상|못알아듣|못알아먹|엉뚱|헛소리|답답)/.test(frame.c);
      if(complaint)return chooseText("social.complaint",["응, 방금 답이 네 말에 안 맞았네. 이번엔 바로 맞춰볼게.","맞아, 방금은 내가 맥락을 놓쳤어. 지금 네 말 기준으로 다시 볼게.","응, 답이 이상했네. 같은 식으로 넘겨짚지 않고 다시 받을게."]);
      const rows=previous
        ? ["아 ㅋㅋ 방금 답이 별로였지. 다시 제대로 할게.","응 ㅋㅋ 방금은 내가 좀 헛다리 짚었네. 다시 맞춰볼게.","그건 인정 ㅋㅋ 방금 답은 이상했어. 이번엔 네 말에 바로 답할게.","아 그 답은 나도 별로다 ㅋㅋ 다시 제대로 갈게."]
        : ["말이 세네 ㅋㅋ 그래도 얘기는 제대로 들어볼게.","오케이 ㅋㅋ 일단 무슨 얘긴지 들어볼게."];
      return chooseText(`social.insult.${previous?"repair":"plain"}`,rows);
    }
    if(frame.reaction==="frustration"){
      const rows=previous
        ? ["아 답답했지. 같은 말 돌리지 말고 바로 맞춰볼게.","응, 방금 흐름 놓쳤어. 이번엔 핵심만 볼게.","오케이. 내가 빙빙 말했네. 바로 다시 갈게."]
        : ["아 뭔가 답답한 일 있나 보네.","에휴 나올 만한 일이 있었나 본데 ㅋㅋ","아이고, 뭐가 그렇게 답답해?"];
      return chooseText(`social.frustration.${previous?"repair":"plain"}`,rows);
    }
    if(frame.reaction==="sad"&&/^아쉽/.test(frame.c))return chooseText("social.sad.regret",["아, 그건 좀 아쉽겠다.","으, 그건 아쉽네.","아쉽긴 하겠다. 생각한 대로 안 된 거네."]);
    if(frame.reaction==="sad"&&/^짜증/.test(frame.c))return chooseText("social.sad.annoyed",["아, 짜증났구나.","으, 그건 짜증날 만하네.","아이고, 지금 좀 짜증난 상태구나."]);
    if(frame.reaction==="sad"&&/기분안좋/.test(frame.c))return chooseText("social.sad.mood",["아, 오늘 기분이 좀 안 좋구나.","기분이 별로구나. 괜히 더 지치는 날 있지.","아, 마음이 좀 가라앉아 있구나."]);
    if(frame.reaction==="sad"&&/^그냥별로/.test(frame.c))return chooseText("social.sad.meh",["아, 그냥 별로였구나.","응, 딱히 좋진 않았던 거네.","아, 그냥 마음에 안 들었구나."]);
    if(frame.reaction==="happy"&&/재밌었/.test(frame.c))return chooseText("social.happy.fun",["오, 재밌었구나 ㅋㅋ","오 좋네 ㅋㅋ 제대로 재밌었나 보다.","ㅋㅋ 재밌게 했네."]);
    if(frame.reaction==="happy"&&/(100점|만점)/.test(frame.c))return chooseText("social.happy.score",["와, 만점이면 제대로 잘했네 ㅋㅋ","오 100점! 그건 뿌듯하겠다.","와 잘했다 ㅋㅋ 만점은 인정이지."]);
    if(frame.reaction==="happy"&&/기분좋/.test(frame.c))return chooseText("social.happy.mood",["오, 기분 좋구나 ㅋㅋ 좋네.","좋네 ㅋㅋ 오늘은 기분 괜찮은 날인가 보다.","오 좋다. 그런 날은 그냥 즐기면 되지 ㅋㅋ"]);
    const rows=BASE[frame.reaction]||[];
    return rows.length?chooseText(`social.${frame.reaction}`,rows):"";
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
      else add("clarify.general",["어느 부분을 말하는지 조금만 더 알려줘.","그 상황을 한마디만 더 붙여주면 제대로 이어갈게.","누구나 어떤 일을 말하는지만 짚어주면 바로 이어서 답할게.","한 단어만 더 붙여줘도 돼. 그걸 기준으로 맞춰볼게."]);
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
      else if(frame.topic&&frame.text.length>8)add("ack.topic",[`아, ${frame.topic} 얘기구나.`,`응, ${frame.topic} 얘기였구나.`]);
      else add("ack.general",["응. 조금 더 말해줘.","응, 이어서 말해도 돼.","응응, 듣고 있어.","오케이. 그 얘기 계속해봐.","그래, 무슨 말인지 따라가고 있어."]);
    }
    if(strategy==="playful")add("playful",["오 ㅋㅋ 그건 좀 웃기네.","아 ㅋㅋ 상황이 그려진다.","ㅋㅋㅋ 그랬구나."]);
    if(strategy==="continue"){
      if(/^(그래서|그다음|그리고|그럼|근데)$/.test(frame.c))add("continue",["응응, 듣고 있어.","응, 계속 말해봐.","그래서 어떻게 됐어?"]);
      else add("continue.ref",["응, 아까 얘기 이어서 말해봐.","응응, 그 얘기 계속해도 돼."]);
    }
    if(strategy==="explore"){
      if(frame.affect==="negative")add("explore.neg",["그중에 뭐가 제일 힘들었어?","그때 기분이 어땠어?","무슨 일이 있었는데?"]);
      else if(frame.event)add("explore.event",["그다음엔 어떻게 됐어?","뭐가 제일 기억나?","같이 한 사람도 있었어?"]);
      else add("explore.general",["넌 그중에 뭐가 제일 좋았어?","그건 왜 그렇게 생각했어?","조금 더 얘기해봐 ㅋㅋ","그중에서 제일 기억나는 건 뭐야?","너는 그걸 어떻게 느꼈어?","그 얘기 들으니까 뒤가 궁금하네 ㅋㅋ"]);
    }
    if(strategy==="direct"){
      if(frame.act==="question"&&!frame.knowledgeCue)add("direct.question",s.lastStatement?["앞 얘기랑 이어지는 질문이네. 지금 말한 상황 기준으로 보면 한 가지로 딱 잘라 말하긴 어려워.","앞 얘기 기준으로 답하려면 조건이 하나만 더 있으면 좋겠어."]:["그건 상황에 따라 달라질 수 있어. 어떤 상황인지 한 줄만 더 말해줘.","조건에 따라 답이 달라져. 지금 상황을 조금만 더 알려줘."]);
      else if(frame.event&&frame.topic)add("direct.event",frame.affect==="positive"?[`${frame.topic} 쪽은 결과가 괜찮았던 거네 ㅋㅋ`,`오, ${frame.topic} 얘기는 잘 풀렸구나.`]:frame.affect==="negative"?[`${frame.topic} 때문에 꽤 신경 쓰였겠네.`,`아, ${frame.topic} 쪽에서 일이 꼬였구나.`]:[`${frame.topic}에서 그런 일이 있었구나.`,`아, ${frame.topic} 얘기였구나.`]);
      else if(frame.plan&&frame.topic)add("direct.plan",[`그럼 다음엔 ${frame.topic} 쪽으로 해보려는 거네.`,`오케이, ${frame.topic} 계획까지 잡아둔 거구나.`]);
      else if(frame.preference&&frame.topic)add("direct.preference",frame.affect==="negative"?[`${frame.topic} 쪽은 취향이 아닌 거네.`]:[`${frame.topic} 쪽을 좋아하는구나. 그건 기억해둘게.`]);
      else if(frame.topic&&frame.text.length>8&&frame.text.length<=24)add("direct.topic",[`응, ${frame.topic} 얘기였구나.`,`아, ${frame.topic} 쪽이구나.`]);
      else add("direct.general",["조금 더 말해줘. 지금 문장만으로는 뜻을 단정하지 않을게.","한마디만 더 붙여주면 거기에 맞춰 답할게.","응, 지금 말만 보고 넘겨짚진 않을게. 맥락을 조금만 더 줘.","무슨 쪽 얘긴지는 알겠는데 한 조각만 더 있으면 정확히 답할 수 있어."]);
    }
    if(!out.length){
      if(frame.topic&&frame.text.length>8)add("fallback.topic",[`응, ${frame.topic} 얘기였구나.`,`아, ${frame.topic} 쪽이구나.`],"direct");
      else add("fallback",["조금 더 말해줘. 짧은 말만 보고 뜻을 지어내진 않을게.","한마디만 더 붙여줘. 그걸 기준으로 답할게.","응, 듣고 있어. 무슨 얘긴지 한 조각만 더 말해줘.","짧게 말해도 돼. 대상을 하나만 알려주면 바로 이어갈게."],"clarify");
    }
    return out;
  }

  function semanticLemma(token){
    let t=clean(token).toLowerCase().replace(/[^0-9a-z가-힣ㅋㅎㅜㅠ]/gi,"");if(!t)return "";
    const direct={좋아해:"좋아하다",좋아함:"좋아하다",좋아한다:"좋아하다",좋아하는:"좋아하다",좋음:"좋아하다",싫어해:"싫어하다",싫어함:"싫어하다",먹었어:"먹다",먹었다:"먹다",먹음:"먹다",먹고:"먹다",피곤해:"피곤하다",피곤함:"피곤하다",지쳤어:"지치다",졸려:"졸리다",재밌어:"재미있다",재밌다:"재미있다",맛있어:"맛있다",맛있다:"맛있다",끝났어:"끝나다",끝남:"끝나다",왔어:"오다",갔어:"가다",이겼어:"이기다",졌어:"지다"};
    if(direct[t])return direct[t];t=t.replace(/(?:에게|한테|에서|으로|이랑|랑|하고|부터|까지|보다|처럼|은|는|이|가|을|를|에|도|만|의)$/g,"");return t;
  }
  function semanticTokens(text){const stop=new Set(["나는","난","내가","너","넌","니가","오늘","진짜","그냥","근데","그래서","그리고","이거","그거","저거","뭐","왜","어떻게","좀","너무","완전"]),seen=new Set(),out=[];clean(text).replace(/\[[^\]]+\]/g," ").replace(/[^0-9A-Za-z가-힣ㅋㅎㅜㅠ ]/g," ").split(/\s+/).forEach(x=>{const t=semanticLemma(x);if(t.length<2||stop.has(t)||seen.has(t))return;seen.add(t);out.push(t)});return out.slice(0,12)}
  function semanticCategories(tokens,text=""){const s=` ${tokens.join(" ")} ${clean(text).toLowerCase()}`,out=[];const defs={fruit:/사과|복숭아|딸기|포도|수박|참외|바나나|귤|오렌지|과일/,food:/치킨|피자|떡볶이|라면|김밥|햄버거|밥|급식|과자|빵|음식|먹다|마시다|맛있다/,school:/학교|학원|수업|숙제|시험|공부|선생|급식/,game:/게임|플레이|랭크|승리|패배|이기다|지다|캐릭터/,friend:/친구|친구들|반친구|짝꿍/,travel:/버스|지하철|택시|기차|정류장|역|귀가|오다|가다/,emotion:/피곤하다|지치다|졸리다|기쁘|속상|짜증|화나|신나|재미있다|웃기다/,preference:/좋아하다|싫어하다|취향|선호/};Object.entries(defs).forEach(([k,re])=>{if(re.test(s))out.push(k)});return out}
  function semanticIntent(frame){const ts=semanticTokens(frame.text),joined=ts.join(" ");if(/좋아하다|싫어하다|취향|선호/.test(joined)&&frame.question)return "ask:preference";if(frame.question)return "ask:question";if(/좋아하다|싫어하다|취향|선호/.test(joined))return "inform:preference";if(frame.affect!=="neutral")return "inform:emotion";return frame.speechAct||frame.act||"inform:statement"}
  function learnedSemanticKey(p){const sem=p?.semantic||{},tokens=(Array.isArray(sem.tokens)&&sem.tokens.length?sem.tokens:semanticTokens(p?.trigger||"")).slice(0,8),replyTokens=semanticTokens(p?.reply||"").slice(0,8),intent=String(sem.intent||p?.act||""),strategy=String(p?.strategy||"direct");return [intent,tokens.join("|"),replyTokens.join("|"),strategy].join("\u001f")}
  function mergeLearnedPatterns(base,delta){const byId=new Map(),bySemantic=new Map(),rank={confirmed:3,growing:2,solo:1,observing:0};const put=p=>{if(!p||!p.id)return;const old=byId.get(p.id),chosen=!old||((rank[p.tier]||0)>(rank[old.tier]||0))||Number(p.evidenceCount||0)>=Number(old.evidenceCount||0)?p:old;byId.set(p.id,chosen)};(base||[]).forEach(put);(delta||[]).forEach(put);const out=[];[...byId.values()].forEach(p=>{const skey=learnedSemanticKey(p),old=bySemantic.get(skey);if(!old){bySemantic.set(skey,p);return}const better=((rank[p.tier]||0)>(rank[old.tier]||0))||((rank[p.tier]||0)===(rank[old.tier]||0)&&Number(p.evidenceCount||0)>Number(old.evidenceCount||0));if(better)bySemantic.set(skey,p)});bySemantic.forEach(p=>out.push(p));out.sort((a,b)=>(rank[b.tier]||0)-(rank[a.tier]||0)||Number(b.evidenceCount||0)-Number(a.evidenceCount||0));return out.slice(0,1400)}
  const PUBLIC_PATTERN_CACHE_KEY="__public__";
  async function cachedLearnedPatterns(key){
    // The corpus is public/common learning, not personal memory. Store one shared device
    // copy so account switching on a classroom/shared device does not duplicate 1,400
    // patterns in IndexedDB. Personal scores and memories remain keyed per user.
    try{const shared=await MiniTalk.DataCache?.get?.("moa-learning-patterns",PUBLIC_PATTERN_CACHE_KEY,null);if(Array.isArray(shared))return shared}catch(e){console.warn("모아 IndexedDB 학습 캐시 읽기 실패",e)}
    try{const oldPerUser=await MiniTalk.DataCache?.get?.("moa-learning-patterns",key,null);if(Array.isArray(oldPerUser)){await MiniTalk.DataCache?.put?.("moa-learning-patterns",PUBLIC_PATTERN_CACHE_KEY,oldPerUser);MiniTalk.DataCache?.remove?.("moa-learning-patterns",key).catch?.(()=>{});return oldPerUser}}catch(e){}
    let legacy=[];for(const v of [92,91,90,89,88,87]){const value=pget(`moa.v${v}.patterns.${key}`,null);if(Array.isArray(value)){legacy=value;break}}
    if(legacy.length){try{await MiniTalk.DataCache?.put?.("moa-learning-patterns",PUBLIC_PATTERN_CACHE_KEY,legacy)}catch(e){};for(const v of [92,91,90,89,88,87])premove(`moa.v${v}.patterns.${key}`)}
    return legacy;
  }
  async function withPublicCacheWriteLock(work){
    const locks=globalThis?.navigator?.locks;
    if(locks?.request){
      let entered=false;
      try{return await locks.request("moa-public-learning-cache",{mode:"exclusive"},async()=>{entered=true;return work();})}
      catch(e){if(entered)throw e;console.warn("모아 공통학습 캐시 잠금 시작 실패 - 안전 fallback 사용",e)}
    }
    return work();
  }
  async function persistLearnedPatterns(key,patterns){
    const safe=Array.isArray(patterns)?patterns.slice(0,1400):[];
    try{if(MiniTalk.DataCache?.put){await MiniTalk.DataCache.put("moa-learning-patterns",PUBLIC_PATTERN_CACHE_KEY,safe);MiniTalk.DataCache?.remove?.("moa-learning-patterns",key).catch?.(()=>{});for(const v of [92,91,90,89,88,87])premove(`moa.v${v}.patterns.${key}`);return true}}catch(e){console.warn("모아 IndexedDB 학습 캐시 저장 실패",e)}
    // Very old/private-browser fallback: keep only a compact emergency subset so MOA
    // never crowds other features out of localStorage.
    try{for(const v of [91,90,89,88,87])premove(`moa.v${v}.patterns.${key}`);pset(`moa.v92.patterns.${key}`,safe.slice(0,180));return true}catch(e){console.warn("모아 축소 학습 캐시 저장 실패",e);return false}
  }
  async function ensureCachedLearningReady(){
    const key=userKey();if(learnedByUser.has(key))return;
    let task=learnedCacheReady.get(key);if(!task){task=(async()=>{const cached=await cachedLearnedPatterns(key),initial=mergeLearnedPatterns([],cached);if(!learnedByUser.has(key)){learnedByUser.set(key,{patterns:initial});rebuildLearnedIndex(key,initial)}})().finally(()=>learnedCacheReady.delete(key));learnedCacheReady.set(key,task)}
    try{await task}catch(e){console.warn("모아 첫 응답 학습 캐시 준비 실패",e)}
  }
  function rebuildLearnedIndex(key,patterns){const map=new Map(),add=(k,p)=>{if(!k)return;const row=map.get(k)||[];row.push(p);map.set(k,row)};(patterns||[]).forEach(p=>{const sem=p.semantic||{},tokens=Array.isArray(sem.tokens)&&sem.tokens.length?sem.tokens:semanticTokens(p.trigger||""),cats=Array.isArray(sem.categories)&&sem.categories.length?sem.categories:semanticCategories(tokens,p.trigger||""),act=String(sem.intent||p.act||"");add(`x:${compact(p.trigger||"")}`,p);tokens.slice(0,5).forEach(t=>add(`t:${t}`,p));cats.forEach(c=>add(`c:${c}`,p));add(`a:${act}`,p)});learnedIndexByUser.set(key,map)}
  function learnedPatternPool(frame,ts,cats){
    const key=userKey(),data=learnedByUser.get(key)||{patterns:[]};let index=learnedIndexByUser.get(key);if(!index){rebuildLearnedIndex(key,data.patterns);index=learnedIndexByUser.get(key)}
    ts=Array.isArray(ts)?ts:semanticTokens(frame.text);cats=Array.isArray(cats)?cats:semanticCategories(ts,frame.text);
    const seen=new Set(),out=[];const take=(k,limit=Infinity)=>{let n=0;for(const p of (index?.get(k)||[])){if(seen.has(p.id))continue;seen.add(p.id);out.push(p);if(++n>=limit)break;}};
    // Exact/token/category indexes are sufficient for a pattern to reach the score gate.
    // Intent-only buckets mostly add dozens of irrelevant rows and cost CPU without ever
    // becoming viable replies, so they are deliberately not scanned on every turn.
    take(`x:${compact(frame.text)}`,8);ts.slice(0,4).forEach(t=>take(`t:${t}`,12));cats.forEach(c=>take(`c:${c}`,10));
    return out.slice(0,48);
  }
  function personalTopicBoostForPattern(ptn){const l=personalLearning(),hay=`${ptn.trigger||""} ${ptn.reply||""}`;let best=0;Object.entries(l.topics||{}).forEach(([topic,row])=>{if(!topic||!hay.includes(topic))return;const score=Math.min(7,(Number(row.turns||0)*.18)+(Number(row.positive||0)-Number(row.negative||0))*.8);if(score>best)best=score});return best}
  function personalStyleBoostForPattern(ptn){const p=profile(),text=String(ptn.reply||"");let score=0;if(text.length<=26)score+=(p.brevity-.5)*5;if(/ㅋㅋ|ㅎㅎ/.test(text))score+=(p.playfulness-.5)*4;if(String(ptn.strategy||"")==="empathy")score+=(p.empathy-.5)*5;if(String(ptn.strategy||"")==="direct")score+=(p.directness-.5)*4;return score}
  function adaptLearnedReply(ptn,frame){let reply=String(ptn.reply||"");if(!ptn.humanChat||String(ptn.tier||"")==="solo")return reply;const pTokens=Array.isArray(ptn.semantic?.tokens)?ptn.semantic.tokens:semanticTokens(ptn.trigger||""),cTokens=semanticTokens(frame.text),pCats=semanticCategories(pTokens,ptn.trigger||""),cCats=semanticCategories(cTokens,frame.text);const commonCat=pCats.find(x=>cCats.includes(x));if(!commonCat)return reply;const verbs=new Set(["좋아하다","싫어하다","먹다","마시다","피곤하다","지치다","졸리다","재미있다","맛있다","이기다","지다","오다","가다"]);const pAnchor=pTokens.find(t=>!verbs.has(t)&&String(ptn.reply||"").includes(t)),cAnchor=cTokens.find(t=>!verbs.has(t));if(pAnchor&&cAnchor&&pAnchor!==cAnchor&&pAnchor.length>=2){reply=reply.replace(new RegExp(pAnchor.replace(/[.*+?^${}()|[\]\\]/g,"\\$&"),"g"),cAnchor)}return reply}

  function learnedCandidates(frame,policy,ref){
    const data=learnedByUser.get(userKey())||{patterns:[]},input=frame.c,out=[],eligible=responseMoveEligibility(frame,ref),fTokens=semanticTokens(frame.text),fCats=semanticCategories(fTokens,frame.text),fIntent=semanticIntent(frame);
    for(const ptn of learnedPatternPool(frame,fTokens,fCats)){
      const trig=compact(ptn.trigger);if(!trig||!ptn.reply)continue;if(ptn.humanChat&&frame.knowledgeCue)continue;
      const exact=input===trig;let strategy=ptn.strategy||policy.strategy;
      // A human-chat reply strategy is descriptive metadata, not a hard routing rule.
      // Exact learned phrases must remain usable even when the current affect classifier
      // would normally disable that strategy (for example "버스 왜 안 와" learned as empathy).
      if(eligible[strategy]===false){if(ptn.humanChat&&exact)strategy=policy.strategy;else continue;}
      let score=0;
      if(exact)score=94;else if(input.includes(trig)||trig.includes(input))score=50;
      const pw=concepts(ptn.trigger),overlap=frame.concepts.filter(v=>pw.includes(v)).length;score+=overlap*11;
      const pSem=ptn.semantic||{},pTokens=Array.isArray(pSem.tokens)?pSem.tokens:semanticTokens(ptn.trigger),semOverlap=fTokens.filter(v=>pTokens.includes(v)).length,pCats=Array.isArray(pSem.categories)?pSem.categories:semanticCategories(pTokens,ptn.trigger),catOverlap=fCats.filter(v=>pCats.includes(v)).length,pIntent=String(pSem.intent||"");
      score+=semOverlap*13+catOverlap*10;if(pIntent&&pIntent===fIntent)score+=20;if(ptn.humanChat&&pIntent===fIntent&&catOverlap>0)score+=18;
      score+=(Number(ptn.confidence||0)-.5)*26;
      const tier=String(ptn.tier||"confirmed");if(tier==="solo")score-=4;else if(tier==="growing")score+=1;else if(tier==="confirmed")score+=4;
      if(ptn.act&&ptn.act!==frame.act&&(!pIntent||pIntent!==semanticIntent(frame)))score-=24;if(ptn.affect&&ptn.affect!=="neutral"&&ptn.affect!==frame.affect)score-=18;
      if(input!==trig&&overlap===0&&semOverlap===0&&catOverlap===0)score-=16;
      if(score>=62){score+=personalTopicBoostForPattern(ptn)+personalStyleBoostForPattern(ptn);out.push(candidate(adaptLearnedReply(ptn,frame),ptn.id||"learned",strategy,score,{source:ptn.humanChat?"learned-human":"learned",learningTier:tier}));}
    }
    return out.sort((a,b)=>b.score-a.score).slice(0,4);
  }
  function learnedConversationChoice(frame,ref,answer,source,strategy,socialText){
    if(!answer||frame.knowledgeCue||frame.searchCue)return null;
    const safeSocial=source==="local"&&socialText&&answer===socialText&&!/(insult|frustration)/.test(String(frame.reaction||""));
    if(!(source==="local-everyday"||source==="local-decision"||safeSocial))return null;
    const policy=pickStrategy(frame,ref),learned=learnedCandidates(frame,policy,ref);if(!learned.length)return null;
    const localScore=source==="local-decision"?94:source==="local-everyday"?90:92;
    const local=candidate(answer,`soft-local:${source}:${strategy}`,strategy,localScore,{source});
    const chosen=weightedPick([local,...learned],v=>v.score,Math.random);
    return chosen&&chosen.source==="learned-human"?chosen:null;
  }

  function recentAssistantTurns(limit=4){return context().filter(v=>v.role==="assistant").slice(-limit);}
  function normalizedReplyShape(text){
    return compact(text).replace(/[0-9]+/g,"#").replace(/ㅋㅋ+/g,"ㅋ").replace(/ㅎㅎ+/g,"ㅎ");
  }
  function recentQuestionStreak(){
    let n=0;for(const row of recentAssistantTurns(4).slice().reverse()){if(row.question===true||/[?？]$/.test(row.text||""))n++;else break;}return n;
  }
  function conversationalPenalty(frame,c){
    let penalty=0;const text=String(c.text||""),shape=normalizedReplyShape(text),recent=recentAssistantTurns(5),q=questionPressure(),qStreak=recentQuestionStreak();
    const shortPlain=!frame.question&&!frame.event&&!frame.plan&&!frame.preference&&frame.affect==="neutral"&&frame.text.length<=12;
    if(recent.some(v=>normalizedReplyShape(v.text||"")===shape))penalty+=70;
    if(recent.some(v=>{const a=normalizedReplyShape(v.text||""),b=shape;return a&&b&&a.length>10&&b.length>10&&(a.includes(b)||b.includes(a));}))penalty+=24;
    if(c.question&&qStreak>=1&&!frame.question)penalty+=18*qStreak;
    if(c.question&&q>.34&&!frame.question)penalty+=22;
    if(shortPlain&&c.question)penalty+=58;
    if(/어떤 느낌|어떻게 느꼈|기분이 어땠|제일 힘들었|왜 그렇게 생각했|너는 그걸 어떻게/.test(text)&&frame.affect==="neutral"&&!frame.event&&!frame.preference)penalty+=95;
    if(/조금 더 말해줘|한마디만 더|한 조각만 더|맥락을 조금만/.test(text)&&(frame.event||frame.plan||frame.preference))penalty+=44;
    if(/^(응|응응|그래|오케이)[,. ]*(?:조금 더|이어서|계속)/.test(text)&&recent.some(v=>/^(응|응응|그래|오케이)/.test(v.text||"")))penalty+=30;
    return penalty;
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
      c.score-=conversationalPenalty(frame,c);
    }
    for(const c of candidates)c.score+=publicExpressionBoost(c.text)+expressionFeatureKeys(c.text).reduce((sum,k)=>sum+learnedLocalScore("features",k),0);
    candidates.sort((a,b)=>b.score-a.score); const viable=candidates.filter(v=>v.score>-35),pool=(viable.length?viable:candidates).slice(0,5);
    const best=weightedPick(pool,v=>v.score,Math.random)||pool[0];
    if(best){recentChoices.set(userKey(),[best.id,...used.filter(v=>v!==best.id)].slice(0,16));}
    return best;
  }

  function spontaneousAside(answer,frame,source,random=Math.random){
    const src=String(source||"");
    // 사실/계산/검색/수정/부정 감정에는 돌발 멘트를 붙이지 않는다. 생활 잡담에서만 낮은 확률로 사용한다.
    if(!answer||frame.question||frame.knowledgeCue||frame.affect==="negative"||!(src==="local-everyday"||src==="local-decision"||src==="local"))return answer;
    if(Number(random())>=.12)return answer;
    const c=frame.c;let rows=[];
    if(/급식|점심|밥|먹|간식|라면|치킨|피자/.test(c))rows=["급식이나 메뉴는 진짜 한 끼로 기분 갈리긴 해 ㅋㅋ","먹는 얘기 나오면 갑자기 메뉴 고민 시작됨 ㅋㅋ"];
    else if(/게임|롤|마크|축구|농구|경기/.test(c))rows=["이런 얘기 들으면 한 판만 더가 왜 생기는지 알겠다 ㅋㅋ","게임 얘기는 결과보다 중간 사건이 더 웃길 때 많더라 ㅋㅋ"];
    else if(/학교|학원|수업|숙제|시험/.test(c))rows=["학교 얘기는 하루만 지나도 사건 하나씩 생기네 ㅋㅋ","학교는 별일 없는 날도 은근 얘깃거리가 생김 ㅋㅋ"];
    else if(frame.affect==="positive")rows=["오 이런 건 괜히 나까지 기분 좋네 ㅋㅋ","이런 소식은 갑자기 분위기 좋아지지 ㅋㅋ"];
    if(!rows.length)return answer;
    const aside=rows[Math.min(rows.length-1,Math.floor(Math.max(0,Math.min(.999999,Number(random())||0))*rows.length))];
    if(!aside||recentAssistantTurns(3).some(v=>normalizedReplyShape(v.text||"")===normalizedReplyShape(aside)))return answer;
    return `${answer} ${aside}`;
  }

  function qualityGate(answer,frame,source,strategy){
    let out=clean(answer);if(!out)return out;
    const gateSource=String(source||"");
    if(!(gateSource.startsWith("local")||gateSource==="learned-human")||source==="local-utility"||source==="local-style")return out;
    const recent=recentAssistantTurns(5),shape=normalizedReplyShape(out),qStreak=recentQuestionStreak();
    const repeated=recent.some(v=>normalizedReplyShape(v.text||"")===shape);
    const neutralShort=!frame.question&&!frame.event&&!frame.plan&&!frame.preference&&frame.affect==="neutral"&&frame.text.length<=12;
    const intrusive=/어떤 느낌|어떻게 느꼈|기분이 어땠|왜 그렇게 생각했|제일 힘들었/.test(out);
    if(!frame.question&&/[?？]$/.test(out)&&(neutralShort||qStreak>=2||intrusive)){
      const pool=frame.reaction?[]:frame.event?["오, 그런 일이 있었구나.","아, 그랬구나.","오 그렇구나 ㅋㅋ"]:frame.plan?["오, 그렇게 해보려는 거구나.","좋네. 계획은 잡혀 있네."]:frame.preference?["오, 그쪽 취향이구나.","아, 그건 취향이 확실하네."]:["응, 알겠어.","오 그렇구나.","응응, 무슨 말인지는 알겠어."];
      if(pool.length)out=chooseText("quality.no-question",pool);
    }
    if(repeated&&!frame.question&&!frame.reaction){
      const pool=frame.affect==="negative"?["아, 그건 좀 별로였겠다.","으, 그건 신경 쓰였겠네."]:frame.affect==="positive"?["오, 그건 좋았겠다 ㅋㅋ","오 잘됐네 ㅋㅋ"]:["오 그렇구나.","응, 알겠어.","아 그랬구나."];
      out=chooseText("quality.repeat",pool);
    }
    if(frame.repairCue&&/질문을 다시|다시 한 번만 말해/.test(out)&&priorUserPrompt()){
      const direct=practicalDecisionReply(priorUserPrompt());if(direct)out=`맞아, 방금 내가 엉뚱하게 받았어. ${direct}`;
    }
    // 사건을 이미 충분히 설명했는데 명사 한 조각만 되풀이하는 어색한 답을 보정한다.
    if(frame.event&&!frame.question&&frame.text.length>=7&&/(?:얘기|쪽)(?:이었구나|였구나|이구나|구나|이었어|였어)[.!]?$/.test(out)){
      if(frame.affect==="positive")out=chooseText("quality.event.positive",["오, 그건 잘됐네 ㅋㅋ","오 좋았겠다. 꽤 기억에 남았겠네.","오, 그건 기분 좋았겠다 ㅋㅋ"]);
      else if(frame.affect==="negative")out=chooseText("quality.event.negative",["아, 그건 좀 아쉬웠겠다.","으, 그건 신경 쓰였겠네.","아 그랬구나. 기분이 좀 별로였겠다."]);
      else out=chooseText("quality.event.neutral",["아, 그런 일이 있었구나.","오 그렇구나. 상황은 알겠어.","아 그랬구나."]);
    }
    return out;
  }

  function normalizeMemoryList(value){
    if(Array.isArray(value))return value.map(v=>typeof v==="string"?{value:v,updatedAt:0}:v).filter(v=>clean(v?.value)).slice(-12);
    if(value&&typeof value==="object"&&clean(value.value))return [value];
    if(typeof value==="string"&&clean(value))return [{value:clean(value),updatedAt:0}];
    return [];
  }
  function rememberPreference(key,value,label){
    const mem=memories(),list=normalizeMemoryList(mem[key]),v=clean(value);if(!v)return;
    const next=[...list.filter(x=>compact(x.value)!==compact(v)),{value:v,label,updatedAt:Date.now()}].slice(-12);mem[key]=next;saveMemories();
  }
  function inferMemory(raw){
    const t=clean(raw);let m;
    if((m=t.match(/^(?:나는|난)\s+(.{1,35}?)\s*(?:을|를)?\s*좋아해(?:요)?[.!?]?$/)))return {key:"like",value:clean(m[1]),label:"좋아하는 것",multi:true};
    if((m=t.match(/^(?:나는|난)\s+(.{1,35}?)\s*(?:을|를)?\s*싫어해(?:요)?[.!?]?$/)))return {key:"dislike",value:clean(m[1]),label:"싫어하는 것",multi:true};
    if((m=t.match(/^(?:요즘|최근에)\s+(.{1,35}?)\s*(?:에|을|를)?\s*(?:빠졌어|자주해|많이해|즐겨해)[.!?]?$/)))return {key:"interest",value:clean(m[1]),label:"요즘 관심사",multi:true};
    if((m=t.match(/^(?:내\s*별명은|내별명은)\s*(.{1,20}?)(?:이야|야)?[.!?]?$/)))return {key:"nickname",value:clean(m[1]),label:"별명",multi:false};
    return null;
  }
  function memoryQuestion(raw){const c=compact(raw);if(/내가뭐좋아|내가좋아하는거|내취향/.test(c))return "like";if(/내가뭐싫어|내가싫어하는거/.test(c))return "dislike";if(/내별명/.test(c))return "nickname";if(/내가요즘뭐|내요즘관심|내관심사/.test(c))return "interest";return "";}
  function memoryAnswer(key){
    const mem=memories();
    if(key==="nickname"){const v=mem.nickname?.value||mem.nickname||"";return v?`응. 네 별명은 ${v}라고 했었어.`:"아직 별명은 기억해둔 게 없어.";}
    const list=normalizeMemoryList(mem[key]);if(!list.length)return "아직 그건 기억해둔 게 없어.";
    const vals=list.slice(-5).map(v=>v.value),joined=vals.length===1?vals[0]:vals.slice(0,-1).join(", ")+" 그리고 "+vals.at(-1);
    if(key==="like")return `응. 지금 기억하는 건 ${joined} 좋아한다고 했어.`;
    if(key==="dislike")return `응. ${joined} 쪽은 싫어한다고 했어.`;
    return `요즘 관심 있다고 기억하는 건 ${joined}야.`;
  }
  function episodeRecall(raw){
    const c=compact(raw);if(!/(아까|전에|이전에).*(뭐|무슨|얘기|말)|뭐얘기했지|내가뭐했다고/.test(c))return "";
    const eps=state().episodes||[];if(!eps.length)return "아직 꺼내볼 만한 지난 얘기가 많진 않아.";
    const rows=eps.slice(-3).map(v=>v.text);return rows.length===1?`아까는 ${rows[0]}라고 했어.`:`최근에는 ${rows.join(" / ")} 얘기를 했어.`;
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
  function publicExampleText(text,maxLen=120){
    let s=clean(text);if(s.length<2||s.length>maxLen)return "";
    // Common learning is deliberately narrower than local memory. Anything that
    // could directly identify a person or reveal sensitive personal data stays local.
    if(/https?:\/\/|www\.|@[A-Za-z0-9_.-]+|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/i.test(s))return "";
    if(/(?:01[016789])[- .]?\d{3,4}[- .]?\d{4}|\d{2,4}[- ]\d{3,4}[- ]\d{4}/.test(s))return "";
    if(/(?:비밀번호|패스워드|주민(?:등록)?번호|계좌번호|카드번호|전화번호|휴대폰번호|집주소|주소는|사는곳|사는 곳|내이름|내 이름|이름은|학교이름|학교 이름|반번호|학번|생년월일|생일은)/i.test(s))return "";
    if(/^(?:나는|난|제가|저는)\s*.{1,24}(?:이야|야|예요|입니다)[.!?]?$/i.test(s))return "";
    if(/[가-힣A-Za-z0-9]{2,20}(?:초등학교|중학교|고등학교|학교)\b/.test(s))return "";
    if(/(?:우리집|우리 집|집은|사는 동네|사는동네|사는 지역|사는지역)\s*(?:은|는|이|가)?\s*[^,.!?]{1,30}/.test(s))return "";
    if(/(?:진단|병원|처방|복용|약먹|약 먹|자해|죽고싶|죽고 싶|성관계|성적관계|성적 관계)/i.test(s))return "";
    if(/(?:\b\d{5,}\b|[가-힣]+(?:로|길)\s*\d{1,4}(?:-\d{1,4})?)/.test(s))return "";
    return s.replace(/\d+/g,"#").slice(0,maxLen);
  }
  function commonDialogueExampleEvent(currentFrame,ex,signal,evidenceKey){
    if(!ex?.user?.text||!ex?.assistant?.text)return null;
    const trigger=publicExampleText(ex.user.text,90),reply=publicExampleText(ex.assistant.text,140);if(!trigger||!reply)return null;
    // Search/utility outputs are factual/transient and should not become conversational exemplars.
    if(/^(search|local-utility|local-knowledge)/.test(String(ex.assistant.source||"")))return null;
    return {type:"dialogue_example",signal:signal==="negative"?"negative":"positive",weight:signal==="continue"?.42:1,evidenceKey,trigger,reply,act:ex.user.intent||"statement",affect:ex.user.affect||"neutral",strategy:ex.assistant.strategy||"direct"};
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
    try{await MiniTalk.AuthApi.moaCommit({userId:key,events:q});commitRetryByUser.set(key,0);syncAt.set(key,0);}catch(e){
      console.warn("모아 학습 묶음 저장 실패",e);commitQueues.set(key,[...q,...(commitQueues.get(key)||[])].slice(-30));
      // Admin batch learning deliberately owns the MOA write lease. Do not lose normal
      // user feedback while it runs; retry in the background without blocking replies.
      const attempt=Math.min(5,Number(commitRetryByUser.get(key)||0)+1);commitRetryByUser.set(key,attempt);
      if(!commitTimers.get(key)){const delay=Math.min(30000,1500*Math.pow(2,attempt-1));commitTimers.set(key,setTimeout(()=>{commitTimers.delete(key);flushCommit();},delay));}
    }
  }
  function observePreviousTurn(currentFrame){
    const ex=previousExchange();if(!ex)return;
    if(ex.assistant.proactive===true||ex.assistant.source==="proactive"){noteProactiveResponse(proactiveResponseSignal(currentFrame),ex.assistant.candidateId||"");return;}
    const explicit=explicitSignal(currentFrame.text);const cont=explicit?"":continuationSignal(currentFrame,ex);
    const signal=explicit||cont;if(!signal)return;
    adaptProfile(signal,ex.assistant);
    const localSignal=signal==="negative"?"negative":"positive",localWeight=signal==="continue"?.45:1;
    reinforceLocal("strategies",ex.assistant.strategy||"ack",localSignal,localWeight);
    expressionFeatureKeys(ex.assistant.text||"").forEach(k=>reinforceLocal("features",k,localSignal,localWeight));
    const quality=signal==="positive"?1:signal==="negative"?-1:.35,evidenceKey=feedbackEvidenceKey(currentFrame,ex,signal);
    queueCommit({type:"policy_feedback",signal:signal==="negative"?"negative":"positive",weight:quality,evidenceKey,strategy:ex.assistant.strategy||"ack",policyKey:ex.assistant.policyKey||"",expressionKey:expressionKey(ex.assistant.text||""),featureKeys:expressionFeatureKeys(ex.assistant.text||""),frameKey:`${ex.user.intent||"statement"}|${ex.user.affect||"neutral"}`});
    const commonExample=commonDialogueExampleEvent(currentFrame,ex,signal,evidenceKey);if(commonExample)queueCommit(commonExample);
  }


  function mannerScore(){
    const p=profile(),turns=Math.max(0,Number(p.mannerTurns||0));
    const kindness=Number(p.kindness??.50),gratitude=Number(p.gratitude??.20),hostility=Number(p.hostility??.06);
    const formal=Number(p.formality??.18),rough=Number(p.roughness??.12);
    // Friendly rough language is style, not bad manners. Direct hostility carries
    // most of the penalty; gratitude/consideration are the strongest positives.
    const raw=68+kindness*17+gratitude*8+Math.min(.8,formal)*5-hostility*31-Math.max(0,rough-.72)*4;
    const confidence=clamp(turns/45,0,1);
    const score=Math.round(70+(raw-70)*(.35+.65*confidence));
    return {score:Math.max(0,Math.min(100,score)),confidence,turns,kindness,gratitude,hostility,formality:formal,roughness:rough};
  }
  function mannerQuestion(text){
    const c=compact(text);
    return /(내|나의)?(?:대화)?(?:매너|예의|말투)(?:점수|평가|등급)|내점수|나말예쁘게|말예쁘게해|대화습관어때|내말투어때|매너어때/.test(c);
  }
  function mannerAdviceText(random=Math.random){
    const m=mannerScore(),p=profile(),mode=toneMode(),score=m.score;
    const bands=score>=92?["상당히 부드러운 편","대화 분위기 진짜 편안한 편","말을 꽤 배려 있게 하는 편"]:score>=80?["전체적으로 매너 좋은 편","편하게 말해도 선을 잘 지키는 편","대화 분위기가 좋은 편"]:score>=65?["솔직하고 편한 스타일","꽤 직설적인 편이지만 무난한 편","편한 말투 쪽에 가까운 편"]:["요즘 말이 꽤 센 편","직설적인 표현이 많이 잡혀","상대에게 세게 말하는 비율이 조금 높은 편"];
    const reasons=[];
    if(m.gratitude>.34)reasons.push("감사 표현을 자주 쓰는 게 플러스야");
    if(m.kindness>.62)reasons.push("상대를 배려하는 표현이 꽤 많아");
    if(m.formality>.55)reasons.push("존댓말을 꾸준히 쓰는 편이야");
    if(m.hostility>.25)reasons.push("상대에게 직접 세게 말하는 표현 때문에 조금 깎였어");
    if(m.roughness>.65&&m.hostility<.18)reasons.push("욕은 좀 섞지만 친근한 강조 쪽이라 감점은 크지 않아");
    if(!reasons.length)reasons.push("아직 특정 습관이 아주 강하게 잡히진 않았어");
    const tips=m.hostility>.25?["상대한테 직접 꽂는 말만 조금 줄이면 금방 올라가","짜증나도 사람 말고 상황 쪽으로 욕하면 점수 방어됨 ㅋㅋ"]:m.gratitude<.25?["고맙다거나 괜찮냐는 표현이 조금 늘면 더 올라갈 듯","지금도 무난한데 감사 표현이 늘면 점수가 잘 올라가"]:["지금 스타일이면 굳이 억지로 바꿀 건 없어","지금처럼 말하면 돼. 점수보다 네 대화 스타일 보는 재미로 보면 됨"];
    const band=pickOne(bands,random),reason=pickOne(reasons,random),tip=pickOne(tips,random);
    if(mode==="gentle"){
      const politeReason=reason.replace(/플러스야$/,"플러스예요").replace(/많아$/,"많아요").replace(/편이야$/,"편이에요").replace(/깎였어$/,"깎였어요").replace(/크지 않아$/,"크지 않아요").replace(/잡히진 않았어$/,"잡히진 않았어요");
      const politeTip=tip.replace(/올라가$/,"올라가요").replace(/방어됨 ㅋㅋ$/,"영향을 덜 받아요").replace(/올라갈 듯$/,"올라갈 거예요").replace(/잘 올라가$/,"잘 올라가요").replace(/없어$/,"없어요").replace(/보면 됨$/,"보면 돼요").replace(/바꾸면 돼$/,"바꾸면 돼요").replace(/말하면 돼$/,"말하면 돼요").replace(/하면 돼$/,"하면 돼요");
      return `지금 대화매너 점수는 ${score}점이에요. ${band}이에요. ${politeReason}. ${politeTip}.`;
    }
    if(mode==="rough")return `지금 매너점수 ${score}점 ㅋㅋ ${band}이네. ${reason}. ${tip}.`;
    return `지금 대화매너 ${score}점. ${band}이야. ${reason}. ${tip}.`;
  }
  function mannerDiscoveryCandidate(now,e){
    const p=profile(),turns=Number(p.mannerTurns||0),last=Number(e.lastMannerDiscoveryAt||0);
    if(turns<12||now-last<5*86400000)return null;
    return {id:"feature:manner-score",type:"feature-discovery",frame:"manner-score",topic:"대화매너",priority:18};
  }
  function composeMannerDiscovery(now,e,random=Math.random){
    const mode=toneMode(),m=mannerScore(),p=profile();
    const intro=mode==="gentle"?[
      {key:"i0",text:"참, 대화를 하다 보니 작은 기능 하나 알려드릴 게 있어요."},
      {key:"i1",text:"그러고 보니 지금까지의 대화로 볼 수 있는 재미있는 기능이 있어요."},
      {key:"i2",text:"아, 혹시 궁금하실까 봐 하나 말씀드리면요."},
      {key:"i3",text:"대화하다 생각났는데, 가볍게 볼 만한 기능이 하나 있어요."}
    ]:mode==="rough"?[
      {key:"i0",text:"아 맞다 ㅋㅋ 이런 것도 있음."},{key:"i1",text:"그러고 보니 너 이거 알았냐 ㅋㅋ"},
      {key:"i2",text:"갑자기 생각났는데 재밌는 거 하나 있음 ㅋㅋ"},{key:"i3",text:"참고로 나 은근 이런 것도 보고 있음 ㅋㅋ"}
    ]:[
      {key:"i0",text:"아 맞다, 이런 기능도 있어."},{key:"i1",text:"그러고 보니 재밌는 거 하나 알려줄까."},
      {key:"i2",text:"대화하다 생각났는데 이런 것도 볼 수 있어."},{key:"i3",text:"참, 나랑 얘기하다 보면 이런 것도 쌓여."}
    ];
    const body=mode==="gentle"?[
      {key:"b0",text:"지금까지의 말투를 바탕으로 대화매너 점수를 가볍게 계산해 볼 수 있어요."},
      {key:"b1",text:"감사 표현이나 배려, 말투 같은 걸 종합한 대화매너 점수를 볼 수 있어요."},
      {key:"b2",text:"대화 습관을 바탕으로 재미로 보는 매너 점수와 간단한 설명을 만들어 드릴 수 있어요."},
      {key:"b3",text:"제가 기억한 이 기기의 대화 스타일로 매너 점수와 말투 특징을 볼 수 있어요."}
    ]:mode==="rough"?[
      {key:"b0",text:"우리 대화 쌓인 걸로 네 대화매너 점수도 뽑아볼 수 있음."},
      {key:"b1",text:"욕 얼마나 하냐만 보는 건 아니고 배려나 감사 같은 것도 합쳐서 매너점수가 나옴 ㅋㅋ"},
      {key:"b2",text:"지금 말투 데이터로 네 매너점수랑 대화 스타일을 재미로 볼 수 있어."},
      {key:"b3",text:"내가 네 말투 습관 좀 쌓아둬서 매너점수 같은 것도 보여줄 수 있음 ㅋㅋ"}
    ]:[
      {key:"b0",text:"지금까지 대화한 걸로 네 대화매너 점수도 볼 수 있어."},
      {key:"b1",text:"감사나 배려, 거친 말투 같은 걸 합쳐서 재미용 매너점수를 계산할 수 있거든."},
      {key:"b2",text:"네 대화 스타일이 쌓이면 매너점수랑 특징도 같이 볼 수 있어."},
      {key:"b3",text:"말투 습관을 바탕으로 매너점수랑 간단한 조언도 볼 수 있어."}
    ];
    const tail=mode==="gentle"?[
      {key:"t0",text:"궁금할 때 '내 매너점수 알려줘'라고 물어보시면 돼요."},
      {key:"t1",text:"나중에 '내 점수 어때요?'라고 물어보시면 이유도 같이 알려드릴게요."},
      {key:"t2",text:"원하실 때 매너점수를 물어보시면 어떤 부분이 반영됐는지도 설명해 드려요."}
    ]:mode==="rough"?[
      {key:"t0",text:"궁금하면 그냥 '내 매너점수 뭐냐' 해봐 ㅋㅋ"},
      {key:"t1",text:"나중에 내 점수 물어보면 왜 그렇게 나왔는지도 까줌 ㅋㅋ"},
      {key:"t2",text:"궁금할 때 점수 물어봐. 뭐 때문에 오르고 깎였는지도 알려줌."}
    ]:[
      {key:"t0",text:"궁금하면 '내 매너점수 뭐야?'라고 물어봐."},
      {key:"t1",text:"나중에 내 점수 물어보면 이유도 같이 알려줄게."},
      {key:"t2",text:"궁금할 때 점수 물어봐. 어떤 습관이 반영됐는지도 알려줄게."}
    ];
    const result=assembleUnique(e,[intro,body,tail],random,`feature:manner:${mode}`);
    if(result.text){e.lastMannerDiscoveryAt=now;rememberInitiativeVariant(e,result.text,result.pattern);saveEngagement(e);}
    return result;
  }

  function initiativeSettings(){const e=engagement();return {enabled:e.enabled!==false,quietStart:Number(e.quietStart||22),quietEnd:Number(e.quietEnd||7)};}
  function setInitiativeSettings(next={}){
    const e=engagement();if(next.enabled!=null)e.enabled=!!next.enabled;
    if(Number.isFinite(Number(next.quietStart)))e.quietStart=Math.max(0,Math.min(23,Number(next.quietStart)));
    if(Number.isFinite(Number(next.quietEnd)))e.quietEnd=Math.max(0,Math.min(23,Number(next.quietEnd)));
    saveEngagement(e);return initiativeSettings();
  }
  function inQuietHours(now,e){const h=new Date(now).getHours(),a=Number(e.quietStart||22),b=Number(e.quietEnd||7);return a===b?false:a>b?(h>=a||h<b):(h>=a&&h<b);}
  function randomFn(options={}){return typeof options.random==="function"?options.random:Math.random;}
  function pickOne(rows,random=Math.random){return rows&&rows.length?rows[Math.min(rows.length-1,Math.floor(Math.max(0,Math.min(.999999,Number(random())||0))*rows.length))]:"";}
  function hangulHasBatchim(word){const t=clean(word),c=t.charCodeAt(t.length-1);return c>=0xAC00&&c<=0xD7A3?((c-0xAC00)%28)!==0:false;}
  function withJosa(word,batchim,noBatchim){const t=clean(word);return t+(hangulHasBatchim(t)?batchim:noBatchim);}
  function rememberInitiativeVariant(e,text,pattern){
    const t=clean(text);e.recentInitiativeTexts=[t,...(e.recentInitiativeTexts||[]).filter(v=>v!==t)].slice(0,48);
    if(pattern)e.recentInitiativePatterns=[pattern,...(e.recentInitiativePatterns||[]).filter(v=>v!==pattern)].slice(0,18);
  }
  function assembleUnique(e,groups,random=Math.random,prefix="initiative"){
    const recentText=e.recentInitiativeTexts||[],recentPatterns=e.recentInitiativePatterns||[];
    let last=null;
    for(let attempt=0;attempt<24;attempt++){
      const parts=[],keys=[];
      for(const g of groups){const rows=typeof g==="function"?g():g;if(!rows||!rows.length)continue;const i=Math.min(rows.length-1,Math.floor(Math.max(0,Math.min(.999999,Number(random())||0))*rows.length));const row=rows[i];if(row&&typeof row==="object"){if(row.text)parts.push(row.text);keys.push(row.key||String(i));}else if(row){parts.push(String(row));keys.push(String(i));}}
      const text=clean(parts.filter(Boolean).join(" ")).replace(/\s+([,.!?])/g,"$1"),pattern=`${prefix}:${keys.join("|")}`;last={text,pattern};
      if(text&&!recentText.includes(text)&&!recentPatterns.slice(0,8).includes(pattern))return last;
    }
    return last||{text:"",pattern:`${prefix}:fallback`};
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
  function rememberedInterest(){
    const row=memories().like,topic=clean(row&&typeof row==="object"?row.value:row);return safeTopicForInitiative(topic)?topic:"";
  }
  function proactiveCandidates(now,lastUserAt){
    const d=new Date(now),hour=d.getHours(),day=d.getDay(),date=d.getDate(),idle=now-lastUserAt,out=[];
    const loop=dueOpenLoop(now);if(loop)out.push({id:`followup:${loop.id}`,type:"open-loop",priority:98,topic:loop.topic,loop});
    const interest=strongestInterest(now);if(interest&&idle>=PROACTIVE_RETURN_GAP)out.push({id:`interest:${interest.topic}`,type:"interest",priority:68+Math.min(14,interest.score),topic:interest.topic});
    const remembered=rememberedInterest();if(remembered&&(!interest||remembered!==interest.topic)&&idle>=PROACTIVE_RETURN_GAP)out.push({id:`memory-interest:${remembered}`,type:"interest",priority:61,topic:remembered});
    if(day===1&&hour>=7&&hour<13)out.push({id:"calendar:monday",type:"calendar",frame:"monday",priority:55,topic:"이번 주"});
    if(day===5&&hour>=15&&hour<22)out.push({id:"calendar:friday",type:"calendar",frame:"friday",priority:58,topic:"금요일"});
    if((day===0||day===6)&&hour>=10&&hour<21)out.push({id:`calendar:weekend:${day}`,type:"calendar",frame:"weekend",priority:54,topic:"주말"});
    if(date<=3)out.push({id:"calendar:month-start",type:"calendar",frame:"month-start",priority:45,topic:"이번 달"});
    if(date>=27)out.push({id:"calendar:month-end",type:"calendar",frame:"month-end",priority:46,topic:"이번 달"});
    if(hour>=7&&hour<11)out.push({id:"daypart:morning",type:"daypart",frame:"morning",priority:43,topic:"아침"});
    if(hour>=11&&hour<14)out.push({id:"daypart:lunch",type:"daypart",frame:"lunch",priority:41,topic:"점심"});
    if(hour>=14&&hour<18)out.push({id:"daypart:afternoon",type:"daypart",frame:"afternoon",priority:42,topic:"오후"});
    if(hour>=18&&hour<22)out.push({id:"daypart:evening",type:"daypart",frame:"evening",priority:44,topic:"저녁"});
    if(idle>=3*86400000)out.push({id:"return:3d",type:"return",frame:"long-return",priority:64,topic:"근황"});
    else if(idle>=24*60*60*1000)out.push({id:"return:1d",type:"return",frame:"return",priority:48,topic:"근황"});
    out.forEach(v=>{v.priority+=publicPolicyBoost(`initiative|${v.type}`,"initiative");});
    const manner=mannerDiscoveryCandidate(now,engagement());if(manner)out.push(manner);
    return out.sort((a,b)=>b.priority-a.priority);
  }
  function composeInitiative(candidate,now,e,random=Math.random,mode="proactive"){
    if(candidate&&candidate.type==="feature-discovery"&&candidate.frame==="manner-score")return composeMannerDiscovery(now,e,random);
    const p=profile(),d=new Date(now),hour=d.getHours(),playful=Number(p.playfulness??.55)>.48,ask=Number(p.questionTolerance??.5)>.30,topic=clean(candidate.topic||""),tone=toneMode();
    const soft=tone==="rough"?[{key:"s0",text:""},{key:"s1",text:"ㅋㅋ"},{key:"s2",text:"야 문득 생각났는데,"}]:tone==="gentle"?[{key:"s0",text:""},{key:"s3",text:"문득 생각났어요."},{key:"s4",text:"그러고 보니,"}]:playful?[{key:"s0",text:""},{key:"s1",text:"ㅋㅋ"},{key:"s2",text:"문득 생각났는데,"}]:[{key:"s0",text:""},{key:"s3",text:"문득,"},{key:"s4",text:"그러고 보니,"}];
    let body=[],tail=[];
    if(candidate.type==="open-loop"){
      body=[{key:"b0",text:`전에 ${topic} 얘기했었잖아.`},{key:"b1",text:`전에 말했던 ${topic}, 문득 생각났어.`},{key:"b2",text:`아까부터 ${topic} 얘기가 좀 기억나더라.`}];
      tail=ask?[{key:"q0",text:"그 뒤엔 어떻게 됐어?"},{key:"q1",text:"지금은 좀 달라졌어?"},{key:"q2",text:"결국 어떻게 됐는지 궁금하네."}]:[{key:"n0",text:"잘 풀렸으면 좋겠다."},{key:"n1",text:"그 뒤 얘기도 나중에 편할 때 들려줘."}];
    }else if(candidate.type==="interest"){
      const jt=withJosa(topic,"은","는");body=[{key:"b0",text:`${jt} 예전에 꽤 얘기했었지.`},{key:"b1",text:`요즘도 ${topic} 쪽은 계속 생각나?`},{key:"b2",text:`전에 ${topic} 얘기할 때 꽤 관심 있어 보였어.`}];
      tail=ask?[{key:"q0",text:"요즘은 어때?"},{key:"q1",text:"최근에 뭐 달라진 거 있어?"},{key:"q2",text:"아직도 재밌어?"}]:[{key:"n0",text:"또 얘기하고 싶을 때 이어가자."},{key:"n1",text:"그 얘기 다시 꺼내도 재밌을 것 같네."}];
    }else if(candidate.frame==="morning"){
      body=[{key:"b0",text:"아침이네."},{key:"b1",text:"오늘도 하루 시작했네."},{key:"b2",text:"아침 공기 느껴질 시간이네."}];tail=ask?[{key:"q0",text:"오늘 제일 먼저 할 건 뭐야?"},{key:"q1",text:"오늘 좀 기대되는 거 있어?"},{key:"q2",text:"컨디션은 어때?"}]:[{key:"n0",text:"오늘은 너무 빡빡하지 않았으면 좋겠다."},{key:"n1",text:"천천히 시동 걸어도 되지 ㅋㅋ"}];
    }else if(candidate.frame==="lunch"){
      body=[{key:"b0",text:"벌써 점심때네."},{key:"b1",text:"딱 배고플 시간이다."},{key:"b2",text:"점심 생각날 시간이네."}];tail=ask?[{key:"q0",text:"뭐 먹을지 정했어?"},{key:"q1",text:"점심은 먹었어?"},{key:"q2",text:"오늘 먹고 싶은 거 있어?"}]:[{key:"n0",text:"맛있는 거 하나 챙겨 먹자."},{key:"n1",text:"밥은 거르지 말고 ㅋㅋ"}];
    }else if(candidate.frame==="afternoon"){
      body=[{key:"b0",text:"오후도 꽤 흘렀네."},{key:"b1",text:"하루 절반은 지난 느낌이다."},{key:"b2",text:"이 시간쯤 되면 오전 일이 좀 멀게 느껴지지."}];tail=ask?[{key:"q0",text:"지금까지 제일 기억나는 일 있었어?"},{key:"q1",text:"오늘은 무난하게 가는 중이야?"},{key:"q2",text:"지금 뭐 하다가 왔어?"}]:[{key:"n0",text:"남은 시간은 좀 편했으면 좋겠다."},{key:"n1",text:"이제 남은 건 천천히 해도 되지."}];
    }else if(candidate.frame==="evening"){
      body=[{key:"b0",text:"저녁까지 왔네."},{key:"b1",text:"오늘도 거의 다 지나갔다."},{key:"b2",text:"슬슬 하루 정리할 시간이네."}];tail=ask?[{key:"q0",text:"오늘 괜찮았던 순간 하나 있었어?"},{key:"q1",text:"오늘은 어땠어, 한마디로?"},{key:"q2",text:"지금은 좀 쉬는 중이야?"}]:[{key:"n0",text:"이제는 좀 쉬어도 되겠다."},{key:"n1",text:"오늘 몫은 거의 다 한 셈이지."}];
    }else if(candidate.frame==="friday"){
      body=[{key:"b0",text:"금요일이다."},{key:"b1",text:"이번 주도 거의 끝이네."},{key:"b2",text:"금요일 느낌 좀 난다 ㅋㅋ"}];tail=ask?[{key:"q0",text:"이번 주에 제일 괜찮았던 일 뭐였어?"},{key:"q1",text:"주말에 뭐 하고 싶어?"},{key:"q2",text:"이번 주는 빨리 간 편이야?"}]:[{key:"n0",text:"주말은 좀 느긋했으면 좋겠다."},{key:"n1",text:"이번 주도 어쨌든 여기까지 왔네."}];
    }else if(candidate.frame==="weekend"){
      body=[{key:"b0",text:"주말이네."},{key:"b1",text:"오늘은 평일보다 좀 느슨한 날이지."},{key:"b2",text:"주말 분위기다 ㅋㅋ"}];tail=ask?[{key:"q0",text:"오늘 뭐 하면서 보내고 있어?"},{key:"q1",text:"밖에 나갈 거야, 집에 있을 거야?"},{key:"q2",text:"주말에 하고 싶던 거 있었어?"}]:[{key:"n0",text:"오늘은 좀 늘어져도 괜찮지."},{key:"n1",text:"주말답게 천천히 가자."}];
    }else if(candidate.frame==="monday"){
      body=[{key:"b0",text:"새 주 시작이네."},{key:"b1",text:"월요일이 다시 왔다 ㅋㅋ"},{key:"b2",text:"이번 주도 시작됐네."}];tail=ask?[{key:"q0",text:"이번 주에 기대되는 거 하나 있어?"},{key:"q1",text:"이번 주는 뭐가 제일 먼저 떠올라?"},{key:"q2",text:"오늘 일정은 빡빡해?"}]:[{key:"n0",text:"첫날부터 너무 힘 빼진 말자."},{key:"n1",text:"이번 주도 하나씩 가면 되지."}];
    }else if(candidate.frame==="month-start"||candidate.frame==="month-end"){
      const end=candidate.frame==="month-end";body=end?[{key:"b0",text:"이번 달도 거의 끝나가네."},{key:"b1",text:`벌써 ${d.getMonth()+1}월 막바지네.`}]:[{key:"b0",text:"새 달 시작한 지 얼마 안 됐네."},{key:"b1",text:`${d.getMonth()+1}월도 시작됐네.`}];tail=ask?[{key:"q0",text:end?"이번 달에 제일 기억나는 건 뭐야?":"이번 달에 해보고 싶은 거 있어?"},{key:"q1",text:end?"시간 빠르게 간 것 같아?":"이번 달은 어떤 느낌으로 시작했어?"}]:[{key:"n0",text:end?"이번 달도 꽤 많은 일이 있었겠다.":"이번 달은 좀 괜찮게 흘렀으면 좋겠다."}];
    }else if(candidate.type==="return"){
      body=candidate.frame==="long-return"?[{key:"b0",text:"오랜만이네."},{key:"b1",text:"며칠 만에 다시 보네."},{key:"b2",text:"오, 좀 오랜만이다 ㅋㅋ"}]:[{key:"b0",text:"다시 왔네."},{key:"b1",text:"오늘도 보네."},{key:"b2",text:"오, 왔구나 ㅋㅋ"}];tail=ask?[{key:"q0",text:"그동안 뭐 기억나는 일 있었어?"},{key:"q1",text:"요즘은 어떻게 지내?"},{key:"q2",text:"최근에 재밌던 거 하나 있었어?"}]:[{key:"n0",text:"편할 때 아무 얘기부터 이어가자."},{key:"n1",text:"또 편하게 얘기하면 되지."}];
    }else{
      body=[{key:"b0",text:hour<12?"오늘은 어떻게 시작했어?":hour<18?"오늘은 어떻게 흘러가고 있어?":"오늘 하루는 어땠어?"}];tail=[];
    }
    const composed=assembleUnique(e,[soft,body,tail],random,`${mode}:${candidate.type}:${candidate.frame||candidate.topic||"general"}`);return composed;
  }
  function proactiveChance(now,lastUserAt,e,p,candidates){
    const idle=now-lastUserAt,due=candidates.some(v=>v.type==="open-loop"&&v.priority>=90),ignored=Number(e.ignoredStreak||0);
    return Math.max(.18,Math.min(.82,.52+(Number(p.initiative??.52)-.5)*.58+(idle>=48*3600000?.10:0)+(due?.12:0)-ignored*.075));
  }
  function chooseInitiativeCandidate(rows,e,random=Math.random){
    if(!rows.length)return null;const used=e.recentStarterIds||[],fresh=rows.filter(v=>!used.slice(0,8).includes(v.id)),src=fresh.length?fresh:rows;
    const best=src[0].priority,short=src.filter(v=>v.priority>=best-9),chosen=pickOne(short,random)||src[0];e.recentStarterIds=[chosen.id,...used.filter(v=>v!==chosen.id)].slice(0,16);return chosen;
  }
  function maybeInitiate(options={}){
    const now=Number(options.now||Date.now()),force=!!options.force,e=engagement(),p=profile(),s=state(),random=randomFn(options);if(e.enabled===false||(!force&&inQuietHours(now,e))||options.hasUnreadProactive)return null;
    const lastUserAt=Math.max(Number(options.lastUserAt||0),Number(e.lastUserAt||0),Number(s.lastUserAt||0));if(!lastUserAt||Number(s.turn||0)<1)return null;
    if(!force&&now-lastUserAt<PROACTIVE_ACTIVE_COOLDOWN)return null;
    if(!force&&now-Number(e.lastChanceAt||0)<PROACTIVE_CHANCE_GAP)return null;
    if(!force){e.lastChanceAt=now;saveEngagement(e);}
    const candidates=proactiveCandidates(now,lastUserAt);if(!candidates.length)return null;
    const chance=proactiveChance(now,lastUserAt,e,p,candidates);if(!force&&random()>chance)return null;
    const chosen=chooseInitiativeCandidate(candidates,e,random);if(!chosen)return null;
    const composed=composeInitiative(chosen,now,e,random,"proactive");if(!composed.text)return null;
    e.lastInitiatedAt=now;e.lastInitiativeType=chosen.type;e.lastInitiativeTopic=chosen.topic||"";if(force)e.lastChanceAt=now;rememberInitiativeVariant(e,composed.text,composed.pattern);saveEngagement(e);
    if(chosen.loop){chosen.loop.askedAt=now;saveState();}
    remember("assistant",composed.text,{source:"proactive",candidateId:chosen.id,intent:"initiative",affect:"neutral",strategy:"initiative",policyKey:`initiative|${chosen.type}`,question:/[?？]$/.test(composed.text),proactive:true,initiativeType:chosen.type,initiativeTopic:chosen.topic||""});
    return {reply:composed.text,source:"proactive",candidateId:chosen.id,strategy:"initiative",type:chosen.type,topic:chosen.topic||"",createdAt:now,chance};
  }
  function connectionCandidates(now,lastUserAt){
    const d=new Date(now),hour=d.getHours(),idle=now-lastUserAt,interest=strongestInterest(now),remembered=rememberedInterest(),out=[];
    if(interest&&safeTopicForInitiative(interest.topic))out.push({id:`greet:interest:${interest.topic}`,type:"greeting",frame:"interest-greeting",topic:interest.topic,priority:68});
    if(remembered&&(!interest||remembered!==interest.topic))out.push({id:`greet:memory:${remembered}`,type:"greeting",frame:"interest-greeting",topic:remembered,priority:60});
    if(idle>=3*86400000)out.push({id:"greet:return-long",type:"greeting",frame:"long-return",topic:"근황",priority:70});
    else if(idle>=10*3600000)out.push({id:"greet:return",type:"greeting",frame:"return",topic:"근황",priority:55});
    out.push({id:`greet:${hour<11?"morning":hour<14?"lunch":hour<18?"afternoon":"evening"}`,type:"greeting",frame:hour<11?"morning":hour<14?"lunch":hour<18?"afternoon":"evening",topic:hour<11?"아침":hour<14?"점심":hour<18?"오후":"저녁",priority:48});
    return out;
  }
  function composeConnectionGreeting(candidate,now,e,random=Math.random){
    const d=new Date(now),p=profile(),topic=clean(candidate.topic||""),playful=Number(p.playfulness??.55)>.45,tone=toneMode();
    const hello=tone==="rough"?[{key:"h0",text:"오 왔냐 ㅋㅋ"},{key:"h1",text:"왔네 ㅋㅋ"},{key:"h2",text:"오 또 왔구만"},{key:"h3",text:"ㅎㅇ ㅋㅋ"}]:tone==="gentle"?[{key:"h0",text:"안녕하세요."},{key:"h1",text:"다시 왔네요."},{key:"h2",text:"반가워요."},{key:"h3",text:"또 보네요."}]:playful?[{key:"h0",text:"오, 왔네 ㅋㅋ"},{key:"h1",text:"안녕 ㅋㅋ"},{key:"h2",text:"오, 또 보네."},{key:"h3",text:"왔구나 ㅋㅋ"}]:[{key:"h0",text:"안녕."},{key:"h1",text:"왔네."},{key:"h2",text:"반가워."},{key:"h3",text:"다시 보네."}];
    let context=[];
    if(candidate.frame==="interest-greeting")context=[{key:"c0",text:`전에 ${topic} 얘기했던 게 생각났어.`},{key:"c1",text:`${withJosa(topic,"은","는")} 요즘도 관심 있어?`},{key:"c2",text:`전에 얘기한 ${topic}, 아직 기억나더라.`}];
    else if(candidate.frame==="long-return")context=[{key:"c0",text:"좀 오랜만이다."},{key:"c1",text:"며칠 만에 보는 느낌이네."},{key:"c2",text:"한동안 조용했네."}];
    else if(candidate.frame==="return")context=[{key:"c0",text:"오늘 다시 보네."},{key:"c1",text:"다시 들어왔구나."},{key:"c2",text:"또 만났네."}];
    else if(candidate.frame==="morning")context=[{key:"c0",text:"아침이네."},{key:"c1",text:"오늘 하루 시작했구나."},{key:"c2",text:"아침부터 보네."}];
    else if(candidate.frame==="lunch")context=[{key:"c0",text:"점심때 딱 왔네."},{key:"c1",text:"배고플 시간이다."},{key:"c2",text:"벌써 점심이네."}];
    else if(candidate.frame==="afternoon")context=[{key:"c0",text:"오후에 다시 보네."},{key:"c1",text:"하루 절반쯤 지나서 왔네."},{key:"c2",text:"오후다."}];
    else context=[{key:"c0",text:"저녁에 왔네."},{key:"c1",text:"오늘도 하루 거의 다 갔다."},{key:"c2",text:"슬슬 쉬고 싶을 시간이네."}];
    const tail=Number(p.questionTolerance??.5)>.38?[{key:"t0",text:"뭐 하다가 왔어?"},{key:"t1",text:"오늘은 좀 어땠어?"},{key:"t2",text:"지금은 뭐 하고 있어?"},{key:"t3",text:"아무 얘기 하나 할래?"}]:[{key:"t0",text:"편하게 있다 가."},{key:"t1",text:"할 말 생기면 아무거나 던져."},{key:"t2",text:"그냥 잠깐 있어도 되고 ㅋㅋ"}];
    return assembleUnique(e,[hello,context,tail],random,`connection:${candidate.frame}:${d.getDay()}`);
  }
  function maybeConnectionGreeting(options={}){
    const now=Number(options.now||Date.now()),force=!!options.force,e=engagement(),p=profile(),s=state(),random=randomFn(options);if(e.enabled===false||(!force&&inQuietHours(now,e))||options.hasUnreadProactive||Number(s.turn||0)<1)return null;
    const lastUserAt=Math.max(Number(options.lastUserAt||0),Number(e.lastUserAt||0),Number(s.lastUserAt||0));if(!lastUserAt)return null;
    if(!force&&now-lastUserAt<20*60*1000)return null;
    if(!force&&now-Number(e.lastGreetingAt||0)<CONNECTION_GREETING_GAP)return null;
    if(!force&&now-Number(e.lastGreetingAttemptAt||0)<30*60*1000)return null;
    if(!force){e.lastGreetingAttemptAt=now;saveEngagement(e);}
    const chance=Math.max(.08,Math.min(.52,.29+(Number(p.initiative??.52)-.5)*.35-Number(e.ignoredStreak||0)*.045+(now-lastUserAt>=48*3600000?.07:0)));if(!force&&random()>chance)return null;
    const candidates=connectionCandidates(now,lastUserAt),chosen=chooseInitiativeCandidate(candidates,e,random);if(!chosen)return null;const composed=composeConnectionGreeting(chosen,now,e,random);if(!composed.text)return null;
    e.lastGreetingAt=now;e.lastInitiatedAt=now;e.lastChanceAt=now;e.lastInitiativeType="greeting";e.lastInitiativeTopic=chosen.topic||"";rememberInitiativeVariant(e,composed.text,composed.pattern);saveEngagement(e);
    remember("assistant",composed.text,{source:"proactive",candidateId:chosen.id,intent:"initiative",affect:"neutral",strategy:"initiative",policyKey:"initiative|greeting",question:/[?？]$/.test(composed.text),proactive:true,initiativeType:"greeting",initiativeTopic:chosen.topic||""});
    return {reply:composed.text,source:"proactive",candidateId:chosen.id,strategy:"initiative",type:"greeting",topic:chosen.topic||"",createdAt:now,chance};
  }
  function proactiveResponseSignal(frame){
    const c=compact(frame.text),explicit=explicitSignal(frame.text);if(explicit==="negative")return "negative";if(/^(몰라|모름|그냥|귀찮아|귀찮|됐어|됐음|ㄴㄴ|노|싫어|싫음|말하기싫|나중에|패스)$/.test(c)||/(귀찮|말하기싫|묻지마|그만물)/.test(c))return "negative";
    if(explicit==="positive"||frame.affect==="positive")return "positive";if(frame.text.length<=5||frame.reaction==="agreement")return "neutral";return "positive";
  }
  function noteProactiveResponse(signal="positive",messageId=""){
    const p=profile(),e=engagement(),type=e.lastInitiativeType||"general",bucket=Math.floor(Date.now()/(6*60*60*1000));
    if(signal==="negative"){p.initiative=clamp(Number(p.initiative??.52)-.035);e.ignoredStreak=Math.min(6,Number(e.ignoredStreak||0)+1);}else if(signal==="neutral"){p.initiative=clamp(Number(p.initiative??.52)+.004);e.ignoredStreak=Math.max(0,Number(e.ignoredStreak||0)-1);}else{p.initiative=clamp(Number(p.initiative??.52)+.025);e.ignoredStreak=Math.max(0,Number(e.ignoredStreak||0)-2);}
    saveProfile();saveEngagement(e);queueCommit({type:"policy_feedback",signal:signal==="negative"?"negative":"positive",weight:signal==="negative"?-.45:signal==="neutral"?.12:.48,evidenceKey:`initiative|${bucket}|${messageId||type}`,strategy:"initiative",policyKey:`initiative|${type}`});
  }
  function markProactiveIgnored(){const p=profile(),e=engagement(),type=e.lastInitiativeType||"general",bucket=Math.floor(Date.now()/(6*60*60*1000));p.initiative=clamp(Number(p.initiative??.52)-.02);e.ignoredStreak=Math.min(6,Number(e.ignoredStreak||0)+1);saveProfile();saveEngagement(e);queueCommit({type:"policy_feedback",signal:"negative",weight:-.32,evidenceKey:`initiative-ignore|${bucket}|${type}`,strategy:"initiative",policyKey:`initiative|${type}`});}
  function proactiveFollowupReply(frame){
    const ex=previousExchange();if(!ex||!(ex.assistant.proactive===true||ex.assistant.source==="proactive")||frame.question)return "";const c=compact(frame.text),type=String(ex.assistant.initiativeType||engagement().lastInitiativeType||"general"),topic=String(ex.assistant.initiativeTopic||engagement().lastInitiativeTopic||"");
    if(/^(몰라|모름|그냥|귀찮아|귀찮|됐어|됐음|ㄴㄴ|노|싫어|싫음|말하기싫|나중에|패스)$/.test(c)||/(그만물|묻지마|귀찮)/.test(c))return pickOne(["오케이 ㅋㅋ 그럼 이 얘긴 넘기자.","알겠어. 굳이 얘기 안 해도 돼.","ㅇㅋ, 그건 패스하자 ㅋㅋ","좋아. 다른 얘기 하고 싶을 때 바꾸면 돼."]);
    if(frame.text.length<=3||frame.reaction==="agreement")return pickOne(["응 ㅋㅋ 그냥 편하게 있어.","오케이. 더 말하고 싶을 때 이어가자.","ㅇㅇ, 굳이 길게 말 안 해도 돼.","좋아 ㅋㅋ 그냥 이대로 있어도 돼."]);
    if(frame.affect==="negative")return type==="open-loop"&&topic?`${topic} 쪽은 아직 좀 신경 쓰이는구나. 굳이 자세히 말 안 해도 돼.`:pickOne(["아, 그랬구나. 괜히 더 캐묻진 않을게.","그건 좀 별로였겠다. 편할 만큼만 얘기해.","아하, 좋은 쪽은 아니었네. 다른 얘기로 넘어가도 돼."]);
    if(frame.affect==="positive")return pickOne(["오 그건 괜찮았네 ㅋㅋ","좋네 ㅋㅋ 그럼 좀 기분 풀렸겠다.","오, 그건 듣기 좋다.","잘됐네 ㅋㅋ"]);
    if(topic&&frame.topic&&frame.topic!==topic&&!(frame.concepts||[]).includes(topic))return "";
    if(type==="open-loop"&&topic)return `${topic} 얘기가 그렇게 이어졌구나. 기억해둘게.`;
    if(type==="greeting")return "";
    return "";
  }
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
      await ensureCachedLearningReady();const cached=(learnedByUser.get(key)||{patterns:[]}).patterns||[],storedKnown=Number(pget(`moa.v92.syncVersion.${key}`,0)||pget(`moa.v91.syncVersion.${key}`,0)||pget(`moa.v90.syncVersion.${key}`,0)||pget(`moa.v89.syncVersion.${key}`,0)||pget(`moa.v88.syncVersion.${key}`,0)||pget(`moa.v87.syncVersion.${key}`,0)||0),publicKnown=Number(pget("moa.v93.publicPatternVersion",0)||0),known=syncVersion.get(key)||((cached&&cached.length)?(publicKnown||storedKnown):0),storedCore=Number(pget(`moa.v92.coreSyncVersion.${key}`,0)||0);
      const d=await MiniTalk.AuthApi.moaSync(key,known,storedCore),responseVersion=Number(d?.version||0);
      if(Array.isArray(d?.patterns)||Array.isArray(d?.patternDelta)){
        await withPublicCacheWriteLock(async()=>{
          const sharedVersion=Number(pget("moa.v93.publicPatternVersion",0)||0);
          // Another tab may have completed a newer sync while this request was in flight.
          // Never let the late/older response overwrite the shared IndexedDB corpus.
          if(responseVersion&&sharedVersion>responseVersion){const latest=await cachedLearnedPatterns(key),fresh=mergeLearnedPatterns([],latest);learnedByUser.set(key,{patterns:fresh});rebuildLearnedIndex(key,fresh);return;}
          const latestShared=await cachedLearnedPatterns(key),current=(latestShared&&latestShared.length)?latestShared:((learnedByUser.get(key)||{patterns:cached}).patterns||[]),next=Array.isArray(d?.patterns)?mergeLearnedPatterns([],d.patterns):mergeLearnedPatterns(current,d.patternDelta),saved=await persistLearnedPatterns(key,next);
          learnedByUser.set(key,{patterns:next});rebuildLearnedIndex(key,next);
          if(saved&&responseVersion)pset("moa.v93.publicPatternVersion",Math.max(sharedVersion,responseVersion));
        });
      }
      if(d?.policy&&typeof d.policy==="object"){policyByUser.set(key,d.policy);pset(`moa.v92.policy.${key}`,d.policy);}else if(!policyByUser.has(key)){let cachedPolicy={};for(const v of [92,91,90,89,88]){const value=pget(`moa.v${v}.policy.${key}`,null);if(value&&typeof value==="object"&&Object.keys(value).length){cachedPolicy=value;break}}policyByUser.set(key,cachedPolicy)}
      if(d?.expressionWeights&&typeof d.expressionWeights==="object"){expressionByUser.set(key,d.expressionWeights);pset(`moa.v92.expressionWeights.${key}`,d.expressionWeights);}else if(!expressionByUser.has(key)){let cachedExpression={};for(const v of [92,91]){const value=pget(`moa.v${v}.expressionWeights.${key}`,null);if(value&&typeof value==="object"&&Object.keys(value).length){cachedExpression=value;break}}expressionByUser.set(key,cachedExpression)}
      if(Number.isFinite(Number(d?.coreVersion))){pset(`moa.v92.coreSyncVersion.${key}`,Number(d.coreVersion));}
      if(responseVersion){const effective=Math.max(responseVersion,Number(pget("moa.v93.publicPatternVersion",0)||0));syncVersion.set(key,effective);pset(`moa.v92.syncVersion.${key}`,effective);}
    }catch(e){console.warn("모아 학습 동기화 실패",e);syncAt.set(key,Date.now()-SYNC_TTL+30000);}
  }
  function warmup(){sync(false);}

  async function reply(raw){
    const text=clean(raw);if(!text)return {reply:"응?",source:"local"};
    await ensureCachedLearningReady();
    const frame=analyze(text);observePreviousTurn(frame);localStyleObservation(text);updateDialogueState(frame);remember("user",text,{intent:frame.act,affect:frame.affect,topic:frame.topic});
    const ref=resolveReference(frame);const searchMode=searchPolicy(frame,ref);
    let answer="",source="local",candidateId="",strategy="direct",policyKeyValue=policyKey(frame),imageUrl="",imageSearchUrl="",sourceUrl="";

    const manner=mannerQuestion(text)?mannerAdviceText():null;
    const dt=dateTime(text),calc=math(text),game=rps(text),punct=frame.punctuation?styleShortReply(frame.punctuation):"",profane=profanityOnlyReply(frame),proactiveFollowup=proactiveFollowupReply(frame),social=frame.decisionCue?"":socialReactionReply(frame),short=shortUtteranceReply(text),self=selfReply(text),repair=repairConversation(text),decision=practicalDecisionReply(text),everyday=everydayContextReply(text),everydayQuestion=casualEverydayQuestionReply(frame),everydayDialogue=everydayDialogueReply(frame),broadEveryday=broadEverydayReply(frame),knowledge=localKnowledgeReply(text);
    if(manner){answer=manner;source="local-manner";strategy="direct";}else if(dt){answer=dt;source="local-utility";strategy="direct";}else if(calc){answer=calc;source="local-utility";strategy="direct";}else if(game)answer=game;else if(punct){answer=punct;source="local-style";strategy="social";}else if(profane){answer=profane;source="local-style";strategy="social";}else if(proactiveFollowup){answer=proactiveFollowup;source="local-proactive-followup";strategy="social";}else if(social){answer=social;source="local";strategy="social";}else if(short){answer=short;source="local-short";strategy="clarify";}else if(self)answer=self;else if(repair){answer=repair;source="local-repair";strategy="direct";}else if(decision){answer=decision;source="local-decision";strategy="direct";}else if(everyday){answer=everyday;source="local-everyday";strategy="direct";}else if(everydayQuestion){answer=everydayQuestion;source="local-everyday";strategy="direct";}else if(everydayDialogue){answer=everydayDialogue;source="local-everyday";strategy="direct";}else if(broadEveryday){answer=broadEveryday;source="local-everyday";strategy="direct";}else if(knowledge){answer=knowledge;source="local-knowledge";strategy="direct";}

    const recall=episodeRecall(text);if(!answer&&recall){answer=recall;source="episode";strategy="direct";}
    const memQ=memoryQuestion(text);
    if(!answer&&memQ){answer=memoryAnswer(memQ);source="memory";strategy="direct";}

    if(!answer&&searchMode!=="forbidden"){
      if(ref.ambiguous){answer="아까 말한 대상 중에서 어느 걸 말하는 거야?";source="local";strategy="clarify";}
      else {
        const q=searchQuery(frame,ref);
        if(!q){answer="뭘 찾아볼까? 궁금한 대상이나 주제를 말해줘.";source="local";strategy="clarify";}
        else try{const d=await MiniTalk.AuthApi.moaSearch({userId:userKey(),text,query:q,context:context().slice(-8)});if(d?.reply){answer=d.reply;source=d.source||"search";candidateId=`search:${d.kind||"general"}`;strategy="search";imageUrl=String(d.image_url||"");imageSearchUrl=String(d.image_search_url||"");sourceUrl=String(d.source_url||"");}}catch(e){console.warn("모아 검색 실패",e);}
      }
    }
    if(!answer&&frame.searchCue&&/(날씨|기온|몇도|온도|습도|비와|비올|눈와|눈올)/.test(frame.c)){
      answer="날씨 정보를 바로 못 가져왔어. 지역을 붙여서 '서울 오늘 날씨'처럼 말해주면 다시 확인할게.";source="local-repair";strategy="direct";
    }

    if(answer){
      const learnedChoice=learnedConversationChoice(frame,ref,answer,source,strategy,social);
      if(learnedChoice){answer=learnedChoice.text;source=learnedChoice.source;candidateId=learnedChoice.id;strategy=learnedChoice.strategy||strategy;}
    }

    if(!answer){
      const policy=pickStrategy(frame,ref);strategy=policy.strategy;policyKeyValue=policy.policyKey;
      const chosen=chooseCandidate(frame,policy,[...generateCandidates(frame,ref,policy),...learnedCandidates(frame,policy,ref)]);
      answer=chosen?.text||"한마디만 더 붙여줘. 짧은 말만 보고 뜻을 지어내진 않을게.";source=chosen?.source||"local";candidateId=chosen?.id||"fallback";strategy=chosen?.strategy||strategy;
    }

    answer=qualityGate(answer,frame,source,strategy);
    answer=roughFriendlyRewrite(answer,frame,source);
    answer=spontaneousAside(answer,frame,source);
    const m=inferMemory(text);if(m){if(m.multi)rememberPreference(m.key,m.value,m.label);else{memories()[m.key]={value:m.value,label:m.label,updatedAt:Date.now()};saveMemories();}}
    const s=state();s.strategyHistory.push(strategy);while(s.strategyHistory.length>12)s.strategyHistory.shift();
    if(frame.question)s.initiative.userQuestions=Number(s.initiative.userQuestions||0)+1;
    if(/[?？]$/.test(answer))s.initiative.assistantQuestions=Number(s.initiative.assistantQuestions||0)+1;
    saveState();
    remember("assistant",answer,{source,candidateId,intent:frame.act,affect:frame.affect,strategy,policyKey:policyKeyValue,question:/[?？]$/.test(answer)});
    return {reply:answer,source,candidateId,strategy,searchMode,referenceConfidence:ref.confidence,imageUrl,imageSearchUrl,sourceUrl,profile:{...profile()}};
  }

  function clearContext(){
    const key=userKey();ctxByUser.delete(key);stateByUser.delete(key);recentChoices.delete(key);rpsByUser.delete(key);
    premove(`moa.v91.context.${key}`);premove(`moa.v91.state.${key}`);premove(`moa.v90.context.${key}`);premove(`moa.v90.state.${key}`);
    ["moa.v89.context.","moa.v89.state.","moa.v88.context.","moa.v88.state.","moa.v87.context.","moa.v87.state.","moa.v86.context.","moa.v86.state.","moa.context."].forEach(prefix=>premove(prefix+key));
  }
  function debugSnapshot(){return {version:VERSION,manner:mannerScore(),ownership:{personal:"local-only",server:"public-learning-only"},state:{...state()},profile:{...profile()},memories:{...memories()},engagement:{...engagement()},personalLearning:JSON.parse(JSON.stringify(personalLearning())),context:context().slice(),patterns:(learnedByUser.get(userKey())||{patterns:[]}).patterns.slice(0,5),policy:policyByUser.get(userKey())||{},expressionWeights:expressionByUser.get(userKey())||{},queued:(commitQueues.get(userKey())||[]).length};}
  return {reply,warmup,sync,flushCommit,clearContext,analyze,resolveReference,maybeInitiate,maybeConnectionGreeting,initiativeSettings,setInitiativeSettings,markProactiveIgnored,starterSuggestions,mannerScore,composeMannerDiscovery,debugSnapshot};
})();
