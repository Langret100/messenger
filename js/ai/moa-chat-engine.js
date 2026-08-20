/* ============================================================
   MOA CHAT ENGINE
   - Firebase를 사용하지 않는 모아 1:1 학습형 대화 클라이언트 엔진
   - 기본 회화/계산/시간/검색은 기기에서 먼저 처리하고, 공용 학습 조회만 Apps Script 사용

   [모아 AI 기능 완전 제거 방법]
   1) 이 파일(js/ai/moa-chat-engine.js) + js/ai/moa-dialogue-core.js 삭제
   2) js/features/moa-chat.js, css/features/moa-chat.css 삭제
   3) index.html에서 위 3개 파일의 <script>/<link> 제거
   4) js/features/chats.js의 MOA_CHAT_INTEGRATION 주석 블록 제거
   5) js/adapters/auth-api.js의 MOA_CHAT_INTEGRATION 주석 블록 제거
   6) sw.js CORE에서 모아 AI 3개 파일 경로 제거
   7) Apps Script 쪽 제거는 docs/apps-script/MOA_CHAT.gs 상단 안내 참고
   - Firebase 경로/Rules는 애초에 사용하지 않으므로 Firebase 삭제 작업은 없음.
   ============================================================ */
MiniTalk.AI = MiniTalk.AI || {};
MiniTalk.AI.MoaChatEngine = (() => {
  const MAX_CONTEXT = 8;
  const recentByUser = new Map();
  const lastReplyByUser = new Map();
  const rpsState = new Map();
  const conversationState = new Map();

  const pick = arr => arr[Math.floor(Math.random() * arr.length)];
  const clean = text => String(text || "").replace(/\s+/g, " ").trim();
  const compact = text => clean(text).toLowerCase().replace(/\s+/g, "");
  const learnedReactionLexicon = new Map();
  let reactionLexiconLoaded=false, reactionLexiconLoading=null;

  /*
   * v80 반응 정규화
   * - NFC로 한글/호환 자모를 보존하며 정리하고, 과도한 ㅋㅋㅋㅋ/ㅎㅎㅎㅎ/아아아 같은 반복은 의미를 보존한 채 축약합니다.
   * - 오타/채팅체는 검증된 명시적 alias로만 흡수합니다. 일반 단어를 오인할 수 있는 편집거리 추정은 사용하지 않습니다.
   * - 이해용 사전과 모아가 실제로 말하는 문장은 분리합니다. 학습된 은어를 모아가 그대로 따라 하지는 않습니다.
   */
  function normalizeReactionText(text){
    let s=clean(text).normalize?.("NFC")||clean(text);
    s=s.toLowerCase().replace(/[“”‘’]/g,'').replace(/\s+/g,' ').trim();
    s=s.replace(/ㅋ{4,}/g,'ㅋㅋㅋ').replace(/ㅎ{4,}/g,'ㅎㅎㅎ').replace(/ㅠ{3,}/g,'ㅠㅠ').replace(/ㅜ{3,}/g,'ㅜㅜ');
    s=s.replace(/([가-힣a-z])\1{3,}/gi,'$1$1');
    return s;
  }
  function reactionCompact(text){return normalizeReactionText(text).replace(/[\s~!@#$%^&*()_+={}\[\]|\\:;"'<>,.·…！？。]/g,'').replace(/\?+/g,'?');}
  const reactionAliasGroups={
    agreement:[
      'ㅇㅇ','ㅇㅋ','오케이','오케','오키','오키도키','오키오키','오케바리','okay','ok','예스','yes','yep','넵','넹','넵넵','웅','엉','어어','콜','콜임',
      '맞아','맞음','맞네','맞지','마즘','맞는듯','맞는거같아','그치','글치','그렇지','그러게','옳지','정답','정답임','인정','ㅇㅈ','쌉인정','완전인정','개인정','ㄹㅇ','레알','팩트','팩트임','맞말','그거지','그거야','바로그거','바로이거','딱그거','응그거','그래그거',
      '좋아','좋네','좋다','좋음','굿','good','나이스','nice','맘에들어','마음에들어','괜찮네','괜찮다','오좋다','개좋네','개좋아','좋구만','굳','굳굳','오졌다','쩐다','지린다','폼미쳤다'
    ],
    negative:[
      '별로','별론데','별로야','별루','노잼','재미없어','재미없음','이상해','이상한데','말이안돼','말도안돼','뭔소리','무슨소리','뭔말','헛소리','노답','왜이래','에바','에반데','싫은데','그건별로','별로임','구림','구리네','별론듯'
    ],
    correction:[
      'ㄴㄴ','노노','노우','nope','아니','아니야','아님','아닌데','아닌듯','그게아니라','그거아니야','그건아니야','그건아님','틀렸어','틀림','오답','잘못됐어','잘못알았어','정정','반대야','반대임','다시봐','다시생각해'
    ],
    laughter:['ㅋㅋ','ㅋㅋㅋ','ㅎㅎ','ㅎㅎㅎ','크크','키키','하하','헤헤','풉','푸핫','웃김','웃기네','웃겨','개웃겨','개웃기네','빵터짐','웃참실패','ㅋㄷㅋㄷ'],
    gratitude:['고마워','고맙다','고맙','감사','감사해','감사함','감사요','감사감사','땡큐','thanks','thx','ㄱㅅ','ㄳ','감삼','도움됐어','도움됨','덕분에'],
    praise:['잘했네','잘한다','잘하네','대단해','대단하네','최고네','최고다','천재냐','천재네','멋지네','멋지다','완벽해','완벽함','센스있네','센스좋네'],
    surprise:['헐','헉','오','와','우와','대박','와우','헐랭','와씨','진짜네','어머','세상에','뭐야대박'],
    uncertain:['글쎄','흠','음','그런가','모르겠어','모르겠음','몰루','몰?루','애매','애매한데','애매함','아리송','긴가민가','잘모르겠어'],
    continue:['그래서','그다음','다음은','근데','그런데','그리고','그러면','그럼','더말해','계속해','계속','또','그래?','그래서?','그다음은?']
  };
  const reactionAliasToTag=new Map();
  Object.entries(reactionAliasGroups).forEach(([tag,list])=>list.forEach(v=>reactionAliasToTag.set(reactionCompact(v),tag)));
  /* v80: 편집거리 기반 퍼지 판정 대신 실제 채팅에서 흔한 오타/변형만 명시적으로 허용합니다.
     '오리→오키', '콜라→콜' 같은 정상 단어 오인을 구조적으로 막습니다. */
  const reactionTypoAliases=new Map(Object.entries({
    '마자':'agreement','맞앙':'agreement','맞엉':'agreement','맞넹':'agreement','맞지롱':'agreement',
    '오께이':'agreement','오께':'agreement','오키여':'agreement','오키용':'agreement','조아':'agreement','조음':'agreement','조타':'agreement',
    '그츄':'agreement','그쵸':'agreement','글쵸':'agreement','인정쓰':'agreement','ㅇㅈ쓰':'agreement',
    '감솨':'gratitude','감쟈':'gratitude','고맙슴':'gratitude','고맙습':'gratitude','땡큐베리':'gratitude',
    '아뉨':'correction','아닝':'correction','아니얌':'correction','틀렷어':'correction','틀렷음':'correction',
    '별루야':'negative','별루임':'negative','노잼임':'negative'
  }).map(([k,v])=>[reactionCompact(k),v]));
  const reactionStopTokens=new Set(['진짜','완전','약간','좀','그냥','이거','그거','저거','아','어','음','야','근데','그래도','그래서','그리고','그럼','그러면','너','모아','오늘','지금','너무','개','겁나','엄청','진심','ㄹㅇ','그건','그게','그걸']);
  function anchoredReactionTag(c){
    if(!c||c.length<4||c.length>20)return '';
    let best='',bestLen=0;
    for(const [alias,tag] of reactionAliasToTag){
      if(alias.length<2||alias.length>=c.length||!['agreement','negative','correction','gratitude','praise'].includes(tag))continue;
      if((c.startsWith(alias)||c.endsWith(alias))&&alias.length>bestLen){best=tag;bestLen=alias.length;}
    }
    return best;
  }

  /* 자동 신조어 후보는 아무 일반명사나 수집하지 않습니다.
     자모 축약, 반복형, 또는 실제 채팅 은어에서 흔한 형태 단서가 있는 짧은 토큰만 '문맥 증거' 대상으로 허용합니다.
     형태 단서가 없는 낯선 단어는 단독 반응으로 쓰였을 때만 unknown 관찰에 남고, 의미는 추측하지 않습니다. */
  function isAdaptiveReactionCandidate(c){
    if(!c||c.length<2||c.length>10||/^\d+$/.test(c))return false;
    if(/[ㄱ-ㅎㅏ-ㅣ]/.test(c))return true;
    if(/([가-힣a-z])\1/i.test(c))return true;
    if(/^(?:개|쌉|킹|핵|존|짱|레알|억까|억빠|노답|꿀|갓)[가-힣a-z]{1,7}$/i.test(c))return true;
    if(/[가-힣a-z](?:임|각|추|잼|굿|킹|쥬|욤|쓰)$/i.test(c))return true;
    return false;
  }
  function reactionEvidenceKey(text,signal){
    const normalized=normalizeReactionText(text);
    const known=[];
    for(const token of normalized.replace(/[?？!！.,~…]/g,' ').split(/\s+/)){
      const c=reactionCompact(token);if(!c)continue;
      const tag=reactionAliasToTag.get(c)||reactionTypoAliases.get(c)||learnedReactionLexicon.get(c)?.tag||'';
      if(tag===signal?.tag&&!known.includes(c))known.push(c);
    }
    return `${signal?.tag||'unknown'}:${known.slice(0,2).join('+')||'context'}`.slice(0,64);
  }

  function userKey(){ return String(MiniTalk.Store.get("user")?.user_id || "guest"); }

  async function ensureReactionLexicon(){
    if(reactionLexiconLoaded||MiniTalk.Store.get("user")?.isGuest)return;
    if(reactionLexiconLoading)return reactionLexiconLoading;
    reactionLexiconLoading=(async()=>{
      try{const data=await MiniTalk.AuthApi.moaReactionLexicon?.(userKey());for(const row of data?.entries||[]){const key=reactionCompact(row.expression);if(key&&row.tag)learnedReactionLexicon.set(key,{tag:String(row.tag),confidence:Number(row.confidence||.7)})}}
      catch(e){console.warn("모아 반응사전 조회 실패",e)}finally{reactionLexiconLoaded=true;reactionLexiconLoading=null}
    })();
    return reactionLexiconLoading;
  }

  function context(){
    const key=userKey();
    if(!recentByUser.has(key)) recentByUser.set(key, MiniTalk.Persistence.get(`moa.context.${key}`,[])||[]);
    return recentByUser.get(key);
  }
  function remember(role,text,meta={}){
    const key=userKey(), list=context();
    list.push({role,text:clean(text),ts:Date.now(),...meta});
    while(list.length>MAX_CONTEXT) list.shift();
    if(key!=="guest") MiniTalk.Persistence.set(`moa.context.${key}`,list);
  }
  function clearContext(){
    const key=userKey();
    recentByUser.set(key,[]);
    conversationState.delete(key);
    lastReplyByUser.delete(key);
    rpsState.delete(key);
    MiniTalk.AI.MoaDialogueCore?.clear?.(key);
    MiniTalk.Persistence.remove(`moa.context.${key}`);
  }

  function detectDateTime(text){
    const c=compact(text), now=new Date();
    /* 도시명이 붙은 "뉴욕 지금 몇 시" 같은 문장은 검색 보조가 처리하도록 로컬 시간 질문만 정확히 잡습니다. */
    if(/^(지금몇시|몇시야|현재시간|지금시간)$/.test(c)) return `지금은 ${now.getHours()}시 ${String(now.getMinutes()).padStart(2,"0")}분이야.`;
    if(/^(오늘날짜|오늘며칠|오늘몇일|현재날짜)$/.test(c)) return `오늘은 ${now.getFullYear()}년 ${now.getMonth()+1}월 ${now.getDate()}일이야.`;
    return "";
  }

  function normalizeMathExpression(text){
    let raw=clean(text).toLowerCase();
    if(!raw)return null;
    raw=raw.replace(/[?？!！]/g," ")
      .replace(/계산(?:해줘|해|좀)?|얼마(?:야)?|답(?:은|이)?|결과(?:는|가)?|알려줘|말해줘|뭐야|뭐지/g," ")
      .replace(/더하기|플러스/g,"+").replace(/빼기|마이너스/g,"-")
      .replace(/곱하기|곱해|×|x/g,"*").replace(/나누기|나눠|÷/g,"/")
      .replace(/제곱/g,"**").replace(/,/g,"").replace(/\s+/g,"");
    if(!/[+\-*/()%]/.test(raw)||!/^[0-9+\-*/().%*]+$/.test(raw))return null;
    return raw;
  }
  function calculate(text){
    const expr=normalizeMathExpression(text);if(!expr)return null;
    try{
      const value=Function('"use strict";return ('+expr+')')();
      if(typeof value!=="number"||!Number.isFinite(value))return null;
      const rounded=Math.round(value*1000000)/1000000;
      return `${rounded}이야.`;
    }catch{return "계산식이 조금 헷갈려. 12+7이나 (3+4)*5처럼 적어줘."}
  }


  function timerAssist(text){
    const raw=clean(text), c=compact(text), timer=MiniTalk.Tools?.TimerAlarm;
    if(!timer)return "";
    if(/^(타이머|카운트)(중지|정지|꺼|꺼줘|취소)$/.test(c)){timer.stopTimer(false);return "타이머 껐어."}
    const m=raw.match(/(\d+(?:\.\d+)?)\s*(시간|분|초)\s*(?:짜리\s*)?(?:타이머|카운트|재줘|세어줘|맞춰줘|설정해줘)/);
    if(!m)return "";
    const amount=Number(m[1]),unit=m[2],seconds=Math.round(amount*(unit==="시간"?3600:unit==="분"?60:1));
    if(!Number.isFinite(seconds)||seconds<1||seconds>86400)return "타이머는 1초부터 24시간까지 맞출 수 있어.";
    timer.startTimer(seconds,`${m[1]}${unit} 타이머`);return `${m[1]}${unit} 타이머 시작했어.`;
  }
  function alarmAssist(text){
    const raw=clean(text), c=compact(text), timer=MiniTalk.Tools?.TimerAlarm;
    if(!timer)return "";
    if(/^(알람|알림)(해제|중지|꺼|꺼줘|취소)$/.test(c)){timer.clearAlarm(false);return "알람 해제했어."}
    const m=raw.match(/(?:(오전|오후)\s*)?(\d{1,2})\s*시(?:\s*(\d{1,2})\s*분)?\s*(?:에\s*)?(?:알람|알림)(?:을|를)?\s*(?:맞춰줘|설정해줘|해줘|맞춰|설정)?/);
    if(!m)return "";
    let hour=Number(m[2]),minute=Number(m[3]||0);if(m[1]==="오후"&&hour<12)hour+=12;if(m[1]==="오전"&&hour===12)hour=0;
    if(hour<0||hour>23||minute<0||minute>59)return "알람 시간을 다시 말해줘. 예: 오후 7시 30분 알람 맞춰줘.";
    const hh=String(hour).padStart(2,"0"),mm=String(minute).padStart(2,"0");timer.setAlarm(`${hh}:${mm}`,"모아 알람");return `${m[1]?m[1]+" ":""}${m[2]}시${minute?` ${minute}분`:""}에 알람 맞췄어.`;
  }
  function unitConvert(text){
    const raw=clean(text).toLowerCase().replace(/,/g,"");
    const aliases={
      mm:["length",.001,"mm"],cm:["length",.01,"cm"],m:["length",1,"m"],km:["length",1000,"km"],
      "밀리미터":["length",.001,"mm"],"센티미터":["length",.01,"cm"],"미터":["length",1,"m"],"킬로미터":["length",1000,"km"],
      g:["mass",1,"g"],kg:["mass",1000,"kg"],"그램":["mass",1,"g"],"킬로그램":["mass",1000,"kg"],
      ml:["volume",1,"mL"],l:["volume",1000,"L"],"밀리리터":["volume",1,"mL"],"리터":["volume",1000,"L"]
    };
    const unitPattern="킬로미터|센티미터|밀리미터|킬로그램|밀리리터|미터|그램|리터|km|cm|mm|kg|ml|m|g|l";
    const m=raw.match(new RegExp(`(\\d+(?:\\.\\d+)?)\\s*(${unitPattern})\\s*(?:는|은|을|를)?\\s*(?:몇|얼마|어느 정도)?\\s*(${unitPattern})(?:로|으로)?`));
    if(m){const a=aliases[m[2]],b=aliases[m[3]];if(!a||!b||a[0]!==b[0])return "같은 종류의 단위끼리 바꿔줘. 예: 2km는 몇 m";const value=Number(m[1])*a[1]/b[1];return `${m[1]}${a[2]}는 ${Math.round(value*1000000)/1000000}${b[2]}야.`}
    const temp=raw.match(/(-?\d+(?:\.\d+)?)\s*(?:도\s*)?(c|f|섭씨|화씨)\s*(?:는|은)?\s*(?:몇|얼마)?\s*(?:도\s*)?(c|f|섭씨|화씨)/);
    if(temp){const value=Number(temp[1]),from=temp[2],to=temp[3],fromC=from==="c"||from==="섭씨",toC=to==="c"||to==="섭씨";if(fromC===toC)return `${value}도야.`;const result=fromC?value*9/5+32:(value-32)*5/9;return `${Math.round(result*10)/10}도 ${toC?"섭씨":"화씨"}야.`}
    return "";
  }
  function randomAssist(text){
    const raw=clean(text),c=compact(text);
    if(/주사위(?:굴려|던져|해줘|한번)?/.test(c))return `주사위는 ${1+Math.floor(Math.random()*6)} 나왔어!`;
    if(/동전(?:던져|뒤집어|해줘|한번)?/.test(c))return `동전은 ${Math.random()<.5?"앞면":"뒷면"}!`;
    let m=raw.match(/(-?\d+)\s*(?:부터|~|에서)\s*(-?\d+)\s*(?:까지)?\s*(?:중|사이)?\s*(?:랜덤|무작위|하나 골라|숫자 골라)/);if(m){let a=Number(m[1]),b=Number(m[2]);if(a>b)[a,b]=[b,a];if(b-a>1000000)return "범위가 너무 커. 조금만 줄여줘.";return `${a+Math.floor(Math.random()*(b-a+1))} 골랐어.`}
    m=raw.match(/(.+?)\s*(?:중에서|중)\s*(?:하나|한 개)?\s*(?:골라줘|선택해줘|뽑아줘)/);if(m){const options=m[1].split(/[,/]|\s+또는\s+|\s+아니면\s+/).map(v=>v.trim()).filter(v=>v.length>0&&v.length<=40);if(options.length>=2&&options.length<=20)return `${pick(options)}! 이걸로 가자.`}
    return "";
  }

  /* 처음부터 대화가 되도록 넣어 둔 로컬 기본 회화.
     기존 미나/기존 '대화' 시트와 무관하며, 이후 공용 학습은 모아 전용 시트에만 누적됩니다. */
  function builtinReply(text){
    const c=compact(text);
    const out=(id,replies)=>{const index=Math.floor(Math.random()*replies.length);return {id:`builtin:${id}:${index}`,reply:replies[index]};};
    if(/^(안녕|ㅎㅇ|하이|hello|hi|반가워)/.test(c)) return out("hello",["안녕! 오늘은 무슨 얘기 할래?","왔구나! 편하게 말해줘.","안녕! 나 여기 있어. 뭐부터 얘기할까?"]);
    if(/잘자|자러갈|졸려서잘/.test(c)) return out("goodnight",["응, 푹 자. 내일 또 얘기하자!","잘 자! 오늘도 고생했어.","좋은 꿈 꿔. 다음에 또 보자!"]);
    if(/^(고마워|고맙다|땡큐|감사)/.test(c)) return out("thanks",["응! 또 필요한 거 있으면 말해.","뭘, 같이 보면 되지.","좋아! 도움이 됐다니 다행이야."]);
    if(/^(응|ㅇㅇ|맞아|그래|그렇지|오케이)/.test(c)) return out("agree",["응응, 계속 말해봐.","맞아. 그 다음은?","좋아, 듣고 있어."]);
    if(/^(아니|ㄴㄴ|아닌데|틀렸어)/.test(c)) return out("disagree",["아, 내가 잘못 짚었네. 어떻게 다른지 말해줘.","오케이, 그건 아니구나. 바로잡아줘.","알겠어. 내가 놓친 부분을 말해줘."]);
    if(/심심/.test(c)) return out("bored",["그럼 나랑 얘기하자. 오늘 있었던 일 하나만 말해봐.","좋지. 아무 말이나 던져봐, 내가 받아줄게.","심심할 땐 수다지. 요즘 제일 재밌는 게 뭐야?"]);
    if(/피곤|힘들|지쳤/.test(c)) return out("tired",["오늘 좀 빡셌나 보네. 뭐 때문에 제일 힘들었어?","고생했네. 잠깐이라도 쉬었어?","많이 지쳤구나. 오늘 있었던 일부터 천천히 말해봐."]);
    if(/기분좋|신나|기뻐|좋은일/.test(c)) return out("happy",["오, 좋은 일 있었구나! 뭐가 제일 좋았어?","좋다! 나도 같이 기분 좋아지네. 무슨 일이었어?","완전 좋네. 더 얘기해봐!"]);
    if(/속상|슬퍼|우울|짜증|화나/.test(c)) return out("upset",["아이고, 마음에 걸리는 일이 있었구나. 무슨 일이야?","그랬구나. 그냥 편하게 말해봐, 내가 듣고 있을게.","속상했겠다. 뭐 때문에 그런지 얘기해줄래?"]);
    if(/배고파|뭐먹지|먹을거추천/.test(c)) return out("hungry",["배고프면 아무거나 생각나지. 지금 제일 당기는 건 뭐야?","음, 밥 쪽이야 간식 쪽이야?","먹을 거 고민 중이구나. 좋아하는 거부터 골라보자."]);
    if(/학교어땠|학교생활어때|오늘학교(?:어땠|재밌었)/.test(c)) return out("school",["오늘 학교에서 제일 기억나는 일이 뭐였어?","학교 얘기 좋지. 오늘 재밌는 일 있었어?","오늘 수업 중엔 뭐가 제일 괜찮았어?"]);
    if(/시험|문제어려|공부힘/.test(c)) return out("study",["어떤 부분이 제일 어려웠어? 같이 정리해보자.","공부 얘기구나. 막힌 데부터 하나씩 보자.","괜찮아. 어떤 문제였는지 말해주면 같이 생각해볼게."]);
    if(/친구(?:랑)?(?:싸웠|문제|고민|어때|사이)|친구때문/.test(c)) return out("friend",["친구랑 무슨 일 있었어?","오, 친구 얘기구나. 계속 말해봐.","그 친구랑은 평소에 어때?"]);
    if(/뭐좋아|좋아하는거/.test(c)) return out("preference",["나는 네가 좋아하는 얘기 듣는 게 재밌어. 넌 요즘 뭐가 제일 좋아?","좋아하는 거 얘기해보자. 게임, 음식, 운동 중엔 뭐가 제일 좋아?","난 딱 하나를 고르기 어렵네. 너는 뭐 좋아해?"]);
    if(/취미|쉬는날뭐/.test(c)) return out("hobby",["쉬는 날엔 뭐 하면서 노는 게 제일 좋아?","취미 얘기 좋지. 요즘 자주 하는 거 있어?","나는 네 취미 얘기 듣는 게 궁금해. 뭐 좋아해?"]);
    if(/재밌는얘기|웃긴얘기/.test(c)) return out("funny",["갑자기 시키니까 나도 긴장되네 ㅋㅋ 너부터 오늘 웃겼던 일 하나 말해봐.","웃긴 얘기? 좋아. 최근에 빵 터진 일 있었어?","그럼 서로 하나씩 얘기하자. 네가 먼저!"]);
    if(/기분어때|뭐해|뭐하고있/.test(c)) return out("status",["난 여기서 네 얘기 기다리고 있었지.","그냥 네가 뭐 말할지 기다리는 중이야.","나는 괜찮아. 너는 오늘 어때?"]);
    if(/너누구|넌누구|모아가뭐|자기소개/.test(c)) return out("identity",["난 모아야. 여기서 너랑 얘기하고, 대화하면서 조금씩 더 잘 알아듣게 될 거야."]);
    if(/잘했|칭찬해|나잘했/.test(c)) return out("praise",["그럼! 잘했네. 스스로도 좀 뿌듯하지?","오, 그건 칭찬받아야지. 잘했어!","좋은데? 계속 그렇게 해보자!"]);
    if(/몰라|모르겠/.test(c)) return out("dontknow",["괜찮아. 같이 하나씩 생각해보자.","모를 수도 있지. 어디부터 헷갈리는지 말해봐.","그럼 내가 같이 정리해볼게. 뭐가 제일 헷갈려?"]);
    return null;
  }

  function rps(text){
    const key=userKey(), c=compact(text);
    if(c.includes("가위바위보")){rpsState.set(key,true);return "좋아! 가위, 바위, 보 중 하나 말해봐."}
    if(!rpsState.get(key))return "";
    const move=["가위","바위","보"].find(v=>c.includes(v));if(!move)return "가위, 바위, 보 중 하나 골라줘.";
    const mine=pick(["가위","바위","보"]);rpsState.delete(key);
    if(move===mine)return `너는 ${move}, 나는 ${mine}! 비겼네. 한 번 더 할래?`;
    const win=(move==="가위"&&mine==="보")||(move==="바위"&&mine==="가위")||(move==="보"&&mine==="바위");
    return `너는 ${move}, 나는 ${mine}! ${win?"네가 이겼어!":"이번엔 내가 이겼다!"}`;
  }

  function extractSearchQuery(text){
    const raw=clean(text).replace(/[?!。.]$/g,"");
    const patterns=[
      /^(.*?)\s*(?:검색해줘|검색해|찾아줘|찾아봐|알아봐줘|알아봐|조사해줘|검색좀|정보알려줘|알려줘)$/,
      /^(.*?)\s*(?:가|이|은|는)?\s*(?:뭐야|누구야|어디야|언제야|궁금해|설명해줘)$/,
      /^(.*?)\s*(?:최신|최근)\s*(?:정보|소식|내용)(?:을|를)?\s*(?:찾아줘|알려줘)?$/
    ];
    for(const re of patterns){const m=raw.match(re);if(m&&clean(m[1]).length>=2)return clean(m[1]).replace(/[이가은는을를]$/g,"")}
    if(/날씨|기온|환율|달러|원화|엔화|유로|위안|파운드|usd|krw|jpy|eur|cny|gbp|몇도|미세먼지|공기질|초미세먼지|뉴스|소식|검색|찾아|알아봐|최신정보|최근정보|지도|길찾|유튜브|영상|이미지|사진검색|사전|뜻찾|현지시간|몇\s*시/.test(raw))return raw;
    return "";
  }
  function isContextualFollowup(text){
    const c=compact(text);
    return /^(응|어|그래|맞아|근데|그래서|그러면|그럼|왜|어떻게|그거|그건|그게|걔|걔가|거기|그사람|그때|다음은|그리고)/.test(c)||/(그거|그게|걔|거기|아까|방금)/.test(c);
  }
  async function searchAssist(text,query){
    try{
      const data=await MiniTalk.AuthApi.moaSearch({userId:userKey(),text,query:query||text,context:context().slice(-6)});
      if(data?.reply)return {reply:data.reply,source:data.source||"search",candidateId:"search:"+(data.kind||"general")};
    }catch(e){console.warn("모아 검색 보조 실패",e)}
    return null;
  }

  function shouldTryLearnedFirst(text){
    const c=compact(text), r=reactionSignal(text);
    if(c.length<2||c.length>140)return false;
    /* 순수 반응은 socialReactionReply가 바로 받아치므로 서버 조회를 낭비하지 않습니다. */
    if(["laughter","playful_positive","gratitude","praise","agreement","surprise","uncertain","playful"].includes(r.tag))return false;
    return true;
  }

  function detectPersonalMemory(text){
    const raw=clean(text);
    let m=raw.match(/^(?:나는|난)\s+(.{1,30}?)\s*(?:을|를)?\s*좋아해(?:요)?[.!?]?$/);
    if(m)return {key:"like",value:clean(m[1]),label:"좋아하는 것"};
    m=raw.match(/^(?:나는|난)\s+(.{1,30}?)\s*(?:을|를)?\s*싫어해(?:요)?[.!?]?$/);
    if(m)return {key:"dislike",value:clean(m[1]),label:"싫어하는 것"};
    m=raw.match(/^(?:내\s*별명은|나는\s*별명이)\s*(.{1,20}?)(?:이야|야|야\.|이야\.)?$/);
    if(m)return {key:"nickname",value:clean(m[1]),label:"별명"};
    m=raw.match(/^(?:내\s*취미는|나는\s*취미가)\s*(.{1,30}?)(?:이야|야|야\.|이야\.)?$/);
    if(m)return {key:"hobby",value:clean(m[1]),label:"취미"};
    return null;
  }

  function memoryQuestion(text){
    const c=compact(text);
    if(/내가뭐좋아|뭘좋아한다고|좋아하는거뭐/.test(c))return "like";
    if(/내별명|별명이뭐/.test(c))return "nickname";
    if(/내취미|취미가뭐/.test(c))return "hobby";
    return "";
  }

  /*
   * v80 하이브리드 반응 분류기.
   * 1) 강한 정정/부정과 문장 반전 -> 2) 고정/명시적 오타/동적학습 -> 3) 문맥성 반응
   * 순서로 판정합니다. 애매하면 polarity를 주지 않는 것이 원칙입니다.
   */
  function reactionSignal(text){
    const raw=normalizeReactionText(text), c=reactionCompact(raw), short=c.length<=34, asked=/[?？]/.test(String(text||''));
    if(!c)return {feedback:'',tag:'neutral',confidence:0,known:false};

    /* 'ㅇㅋ 근데 그건 아님'처럼 반전 접속사 뒤에 강한 판정이 있으면 뒤쪽을 우선합니다. */
    const contrast=raw.split(/(?:\s|^)(?:근데|그런데|하지만|다만|그래도|아니\s*근데)(?:\s|$)/i);
    if(contrast.length>1){
      const tail=contrast.slice(1).join(' ').trim();
      if(tail&&tail!==raw){const t=reactionSignal(tail);if(['correction','negative'].includes(t.tag)&&t.confidence>=.8)return {...t,contrast:true};}
    }

    const correction=/(그게\s*아니라|그거\s*아니야|그건\s*아니야|그건\s*아님|그건\s*아닌듯|아닌\s*거\s*같|아니거든|아닌데|아닌듯|아님|틀렸|틀림|오답|잘못됐|잘못알|정정|반대야|반대임|다시\s*봐|다시\s*생각|^ㄴㄴ+|^노노|^노우|^nope|^아니(?:야)?$|아니.*그게)/i;
    if(correction.test(raw))return {feedback:'correction',tag:'correction',confidence:.99,known:true};

    const negative=/(^|\s)(별로(?:야|임|인데|인듯)?|별루|노잼(?:인데|이야|임)?|재미없|이상해|이상한데|말이\s*안\s*돼|말도\s*안\s*돼|뭔\s*소리|무슨\s*소리|뭔\s*말|답(?:변)?이?\s*이상|못\s*알아듣|이해\s*안\s*됨|헛소리|노답|왜\s*이래|에바(?:인데)?|싫은데|구리네|구림)(?:$|\s)/i;
    if(short&&negative.test(' '+raw+' '))return {feedback:'negative',tag:'negative',confidence:.94,known:true};

    /* 물음표가 붙은 동의형은 확정 긍정으로 학습하지 않습니다. */
    const uncertain=/^(글쎄|음+|흠+|그런가(?:봐)?|모르겠(?:어|음)?|몰루|몰\?루|애매(?:한데|함)?|아리송|긴가민가|잘\s*모르겠(?:어)?)[?？]?$/i;
    if((asked&&/^(맞|그렇|진짜|ㄹㅇ|레알|확실|맞나)/.test(c))||uncertain.test(raw))return {feedback:'',tag:'uncertain',confidence:.82,known:true};

    const exact=reactionAliasToTag.get(c)||reactionTypoAliases.get(c)||learnedReactionLexicon.get(c)?.tag||'';
    const exactConfidence=learnedReactionLexicon.get(c)?.confidence||.97;
    if(exact){
      if(exact==='correction')return {feedback:'correction',tag:'correction',confidence:exactConfidence,known:true};
      if(exact==='negative')return {feedback:'negative',tag:'negative',confidence:exactConfidence,known:true};
      if(exact==='agreement'||exact==='laughter'||exact==='gratitude'||exact==='praise')return {feedback:'positive',tag:exact,confidence:exactConfidence,known:true};
      return {feedback:'',tag:exact,confidence:exactConfidence,known:true};
    }

    const laughter=/(ㅋ{2,}|ㅎ{2,}|크크|키키|하하|헤헤|웃기|개웃|빵\s*터|웃김|웃참|풉|푸핫|ㅋㄷㅋㄷ)/i;
    const playfulNegative=/(미쳤(?:냐|네|다)?|돌았(?:냐|네)?|킹받|어이없|뭐래|장난하냐|놀리냐)/i;
    if(laughter.test(raw)){
      if(playfulNegative.test(raw))return {feedback:'positive',tag:'playful_positive',confidence:.84,known:true};
      return {feedback:'positive',tag:'laughter',confidence:.95,known:true};
    }

    const gratitude=/(^|\s)(고마워|고맙|감사|땡큐|thanks|thx|ㄱㅅ|ㄳ|감삼|도움\s*됐|덕분에)(?:$|\s)/i;
    if(gratitude.test(' '+raw+' '))return {feedback:'positive',tag:'gratitude',confidence:.97,known:true};
    const praise=/(잘했네|잘한다|잘하네|대단하네|대단해|최고네|완벽|센스\s*있네|센스\s*좋네|천재네|멋지네)/i;
    if(short&&praise.test(raw))return {feedback:'positive',tag:'praise',confidence:.9,known:true};

    const agreement=/(^|\s)(ㅇㅇ+|ㅇㅋ+|오케이|오키(?:도키)?|오케바리|okay|ok|예스|yes|yep|넵+|넹|웅|엉|콜|좋아|좋네|굿|good|나이스|nice|맞아|맞음|맞네|맞지|마즘|그치|글치|그렇지|그러게|옳지|정답|인정|ㅇㅈ|쌉인정|개인정|ㄹㅇ|레알|팩트|맞말|그거지|그거야|바로\s*그거|딱\s*그거|맘에\s*들어|마음에\s*들어|괜찮네|굳+)(?:$|\s)/i;
    if(!asked&&short&&agreement.test(' '+raw+' '))return {feedback:'positive',tag:'agreement',confidence:.95,known:true};

    const anchored=anchoredReactionTag(c);
    if(anchored&&!asked){
      if(anchored==='negative')return {feedback:'negative',tag:'negative',confidence:.82,known:true,anchored:true};
      if(anchored==='correction')return {feedback:'correction',tag:'correction',confidence:.84,known:true,anchored:true};
      if(['agreement','gratitude','praise'].includes(anchored))return {feedback:'positive',tag:anchored,confidence:.82,known:true,anchored:true};
    }

    const surprise=/^(헐+|헉+|오+|와+|우와+|대박|와우|헐랭|와씨|진짜네|어머|세상에|뭐야\s*대박)/i;
    if(short&&surprise.test(raw))return {feedback:'',tag:'surprise',confidence:.84,known:true};
    const playful=/^(에이|쳇|메롱|어이|야\s*너|장난이지|농담이지|웃기고\s*있네|뭐래|어쩔|저쩔|흥|삐짐|놀리냐)/i;
    if(short&&playful.test(raw))return {feedback:'',tag:'playful',confidence:.73,known:true};
    const continuation=/^(그래서|그\s*다음|다음은|근데|그런데|그리고|그래가지고|그래서\s*말인데|그러면|그럼|왜|어떻게|더\s*말해|계속해|계속|또)/i;
    if(continuation.test(raw))return {feedback:'',tag:'continue',confidence:.74,known:true};

    /* 짧은 낯선 표현은 '모름'으로 명시해서 사전 오염 없이 관찰 후보로만 보냅니다. */
    if(short&&!asked&&raw.split(/\s+/).length<=4)return {feedback:'',tag:'unknown',confidence:.15,known:false};
    return {feedback:'',tag:'neutral',confidence:0,known:false};
  }

  function extractUnknownReactionTerms(text,signal){
    if(!signal||!['agreement','laughter','gratitude','praise','negative','correction','playful_positive'].includes(signal.tag))return [];
    const normalized=normalizeReactionText(text);
    const tokens=normalized.replace(/[?？!！.,~…]/g,' ').split(/\s+/).map(v=>v.replace(/[^0-9a-z가-힣ㄱ-ㅎㅏ-ㅣ]/gi,'')).filter(Boolean);
    const out=[];
    for(const token of tokens){
      const c=reactionCompact(token);
      if(c.length<2||c.length>10||reactionStopTokens.has(c)||reactionAliasToTag.has(c)||reactionTypoAliases.has(c)||learnedReactionLexicon.has(c)||/^([ㅋㅎㅠㅜ])\1+$/.test(c)||/^\d+$/.test(c))continue;
      /* v80: '축구 맞아', '숙제 맞아'에서 축구/숙제를 반응어 후보로 만들지 않습니다.
         자동 의미 증거는 형태상 채팅 반응어 가능성이 있는 토큰에만 수집합니다. */
      if(!isAdaptiveReactionCandidate(c))continue;
      if(!out.includes(c))out.push(c);if(out.length>=2)break;
    }
    return out;
  }

  function observeUnknownReaction(text,signal){
    if(MiniTalk.Store.get("user")?.isGuest||!MiniTalk.AuthApi.moaReactionObserve)return;
    const raw=normalizeReactionText(text);
    if(raw.length>48)return;
    const terms=extractUnknownReactionTerms(raw,signal);
    const standaloneUnknown=signal.tag==='unknown'&&!/[\s]/.test(raw)&&reactionCompact(raw).length<=10;
    if(!terms.length&&!standaloneUnknown)return;
    MiniTalk.AuthApi.moaReactionObserve({
      userId:userKey(),expression:raw,
      suggestedTag:signal.tag==='unknown'?'':signal.tag,
      confidence:signal.confidence||0,
      unknownTerms:standaloneUnknown?[reactionCompact(raw)]:terms,
      observationMode:standaloneUnknown?'standalone':'contextual',
      evidenceKey:standaloneUnknown?'standalone':reactionEvidenceKey(raw,signal)
    }).catch(e=>console.warn("모아 새 반응표현 관찰 저장 실패",e));
  }

  function isPureReaction(text, signal){
    const raw=normalizeReactionText(text), c=reactionCompact(raw), r=signal||reactionSignal(raw);
    if(!r||!["agreement","laughter","playful_positive","gratitude","praise","negative","correction","surprise","uncertain","playful"].includes(r.tag))return false;
    if(raw.length>32)return false;
    if(reactionAliasToTag.has(c)||reactionTypoAliases.has(c)||learnedReactionLexicon.has(c))return true;
    /* 문장 속 ㅋㅋ/맞아가 아니라, 실제로 '반응만 한 문장'인지 잔여 토큰으로 확인합니다. */
    const tokens=raw.replace(/[?？!！.,~…]/g,' ').split(/\s+/).map(reactionCompact).filter(Boolean);
    const residual=[];
    for(const t of tokens){
      if(reactionAliasToTag.has(t)||reactionTypoAliases.has(t)||learnedReactionLexicon.has(t)||reactionStopTokens.has(t)||/^ㅋ+$/.test(t)||/^ㅎ+$/.test(t))continue;
      residual.push(t);
    }
    if(r.tag==='playful_positive'&&/(미쳤(?:냐|네|다)?|돌았(?:냐|네)?|킹받|어이없|뭐래|장난하냐|놀리냐)/i.test(raw))return residual.join('').length<=10;
    if((r.tag==='negative'||r.tag==='correction')&&state().mode==='joke'&&/^(?:아\s*)?(?:(?:그건|이건|그거|방금(?:건|거)?)\s*)?(?:좀\s*)?(?:노잼(?:인데|이야|임)?|별로(?:야|인데|임)?|구리(?:네|다)?|에바(?:인데|야)?|아님|아닌데|안\s*웃겨|재미없(?:어|네|다|는데)?|틀렸(?:어|네|다)?)(?:\s*[ㅋㅎ]+)?[.!~]*$/i.test(raw))return true;
    if(r.tag==='negative'&&/(답(?:변)?이?\s*이상|못\s*알아듣|이해\s*안\s*됨|헛소리|노답|왜\s*이래|말이\s*안\s*돼)/i.test(raw))return true;
    if(r.tag==='laughter')return residual.length===0;
    /* '개추 인정'처럼 반응어 형태인 미지 토큰은 허용하지만 '축구 맞아' 같은 일반명사는 제외합니다. */
    if(residual.length&&residual.every(isAdaptiveReactionCandidate))return true;
    return residual.length===0;
  }

  function state(){
    return MiniTalk.AI.MoaDialogueCore?.state?.(userKey()) || (()=>{const k=userKey();if(!conversationState.has(k))conversationState.set(k,{mode:'',topic:'',person:'',lastUserStatement:'',lastIntent:''});return conversationState.get(k)})();
  }
  function isJokeCommand(text){return /(농담|웃겨봐|개그|아재개그|드립|웃긴말|재밌는말)/.test(compact(text))}
  function isJokeRetry(text){return /(다른거|다른거해봐|다시해|하나더|또해|다른농담)/.test(compact(text))}
  function isJokeFeedback(text){
    const raw=normalizeReactionText(text), r=reactionSignal(raw);
    if(!['negative','correction','laughter','playful_positive','agreement'].includes(r.tag))return false;
    if(r.tag==='negative'||r.tag==='correction')return /^(?:아\s*)?(?:(?:그건|이건|그거|방금(?:건|거)?)\s*)?(?:좀\s*)?(?:노잼(?:인데|이야|임)?|별로(?:야|인데|임)?|구리(?:네|다)?|에바(?:인데|야)?|아님|아닌데|안\s*웃겨|재미없(?:어|네|다|는데)?|틀렸(?:어|네|다)?)(?:\s*[ㅋㅎ]+)?[.!~]*$/i.test(raw);
    return isPureReaction(raw,r);
  }
  function updateConversationState(text){
    const sig=reactionSignal(text), core=MiniTalk.AI.MoaDialogueCore, st=core?.update?.(userKey(),text,sig)||state();
    const jokeCmd=isJokeCommand(text), jokeRetry=st.mode==='joke'&&isJokeRetry(text), jokeFeedback=st.mode==='joke'&&isJokeFeedback(text);
    if(st.mode==='joke'&&!jokeCmd&&!jokeRetry&&!jokeFeedback)core?.clearMode?.();
    if(jokeCmd||jokeRetry)core?.setMode?.('joke',90000);
    return state();
  }
  function selfPreferenceReply(text){return MiniTalk.AI.MoaDialogueCore?.selfReply?.(text)||''}
  function genericStatementReply(text,hints=[]){const core=MiniTalk.AI.MoaDialogueCore,frame=core?.analyze?.(text);return core?.genericReply?.(text,frame,hints)||''}
  function naturalStatementReply(text,hints=[]){
    const core=MiniTalk.AI.MoaDialogueCore, frame=core?.analyze?.(text);
    return core?.contextReply?.(text,frame,hints)||core?.genericReply?.(text,frame,hints)||'';
  }

  function socialReactionReply(text){
    const r=reactionSignal(text), c=compact(text);
    if(!isPureReaction(text,r))return "";
    if(r.tag==="laughter"||r.tag==="playful_positive")return pick(["ㅋㅋㅋ 그치?", "ㅋㅋ 나도 좀 웃겼어.", "ㅋㅋㅋ 반응 좋네.", "아 ㅋㅋ 그건 좀 웃겼다."]);
    if(r.tag==="gratitude")return pick(["뭘 ㅎㅎ 또 물어봐.", "오케이, 도움 됐으면 됐지!", "좋지. 또 필요하면 불러.", "응! 같이 해결하면 되지."]);
    if(r.tag==="praise")return pick(["오 ㅋㅋ 칭찬 고마운데?", "좋아, 그 말은 좀 뿌듯한데.", "ㅋㅋ 고마워. 계속 잘해볼게."]);
    if(r.tag==="agreement"&&c.length<=14)return pick(["그치 ㅋㅋ", "ㅇㅇ 딱 그거야.", "좋아, 통했네.", "맞지. 계속 얘기해봐.", "오케이, 그걸로 가자."]);
    if(r.tag==="surprise"&&c.length<=10)return pick(["ㅋㅋ 놀랐지?", "나도 그건 좀 오 했어.", "그치? 생각보다 그렇더라.", "오 반응 큰데 ㅋㅋ"]);
    if(r.tag==="uncertain"&&c.length<=18)return pick(["애매하지? 확실한 부분만 다시 보자.", "그럴 수 있어. 뭐가 제일 걸려?", "응, 확신 안 들면 한 번 더 확인해보자."]);
    if((r.tag==="negative"||r.tag==="correction")&&state().mode==="joke")return pick(["ㅋㅋ 인정. 이건 접고 다른 걸로 간다.","오케이 이건 실패 ㅋㅋ 다른 거 해볼게.","인정, 방금 건 좀 약했다 ㅋㅋ 하나 더 갈까?"]);
    if(r.tag==="playful"&&c.length<=16)return pick(["ㅋㅋ 왜 그래", "에이 ㅋㅋ 장난이지?", "ㅋㅋ 나한테 그러기야?", "오호, 도발인가 ㅋㅋ"]);
    return "";
  }

  function jokeAssist(text){
    const c=compact(text), st=state();
    const retry=st.mode==='joke'&&isJokeRetry(text);
    if(!retry&&!isJokeCommand(text))return "";
    MiniTalk.AI.MoaDialogueCore?.setMode?.('joke',90000); st.mode='joke';
    return pick([
      "세상에서 제일 뜨거운 복숭아가 뭔지 알아? 천도복숭아 ㅋㅋ",
      "왕이 넘어지면? 킹콩 ㅋㅋ 이건 좀 오래됐지.",
      "자동차가 놀라면? 카놀라유... 미안 ㅋㅋ",
      "오리가 얼면? 언덕. ...나도 말하고 조금 후회했어 ㅋㅋ",
      "세상에서 제일 억울한 도형은? 원통해 ㅋㅋ"
    ]);
  }

  function observeConversationTopics(text,signal){
    if(MiniTalk.Store.get("user")?.isGuest||!MiniTalk.AuthApi.moaTopicObserve)return;
    const payload=MiniTalk.AI.MoaDialogueCore?.observation?.(text,signal);if(!payload)return;
    MiniTalk.AuthApi.moaTopicObserve({userId:userKey(),...payload}).catch(e=>console.warn("모아 주제관계 관찰 저장 실패",e));
  }

  function sendNaturalFeedback(text){
    const prev=lastReplyByUser.get(userKey()), signal=reactionSignal(text);
    if(!prev||MiniTalk.Store.get("user")?.isGuest)return signal;
    const explicitCorrection=signal.tag==='correction'&&/^(?:아니|ㄴㄴ|노노|그게\s*아니라|그거\s*아니|그건\s*아니|틀렸|정정)/i.test(normalizeReactionText(text));
    const pure=isPureReaction(text,signal);
    if(pure||signal.tag==='unknown')observeUnknownReaction(text,signal);
    if(!signal.feedback||(!pure&&!explicitCorrection))return signal;
    /* 학습 저장 때문에 현재 대화 응답이 늦어지지 않게 비동기로 기록합니다. */
    MiniTalk.AuthApi.moaFeedback({userId:userKey(),reaction:signal.feedback,reactionTag:signal.tag,candidateId:prev.candidateId||"",previousUserText:prev.userText||"",previousReply:prev.reply||"",previousSource:prev.source||"",followup:text}).catch(e=>console.warn("모아 자연학습 피드백 저장 실패",e));
    return signal;
  }

  async function reply(text){
    const raw=clean(text);if(!raw)return null;
    const feedbackSignal=sendNaturalFeedback(raw);
    observeConversationTopics(raw,feedbackSignal);
    remember("user",raw);
    updateConversationState(raw);
    let answer="",source="local",candidateId="",topicHints=[];

    /* 1. 즉시 실행 도구/게임/명확한 자기질문만 로컬에서 먼저 처리합니다. */
    answer=timerAssist(raw)||alarmAssist(raw)||detectDateTime(raw)||calculate(raw)||unitConvert(raw)||randomAssist(raw)||rps(raw)||jokeAssist(raw)||selfPreferenceReply(raw);
    if(answer){
      const isJoke=isJokeCommand(raw)||state().mode==='joke'&&isJokeRetry(raw);
      candidateId=isJoke?"builtin:joke:"+Math.abs(answer.split("").reduce((a,ch)=>((a*31)+ch.charCodeAt(0))|0,7)):"local:utility";
      if(isJoke)source="builtin_joke";
    }

    /* 2. 순수 맞장구는 서버 왕복 없이 처리하되, 일반 문장 속 ㅋㅋ/맞음은 반응으로 오인하지 않습니다. */
    if(!answer){const social=socialReactionReply(raw);if(social){answer=social;source="builtin_social";candidateId="builtin:social:"+reactionSignal(raw).tag+":"+Math.abs(social.split("").reduce((a,ch)=>((a*31)+ch.charCodeAt(0))|0,11));}}

    const memAsk=memoryQuestion(raw);
    if(!answer&&memAsk&&!MiniTalk.Store.get("user")?.isGuest){
      try{const data=await MiniTalk.AuthApi.moaMemoryGet(userKey(),memAsk);if(data?.value){answer=memAsk==="like"?`${data.value} 좋아한다고 했었어.`:`${data.label||"기억"}은 ${data.value}라고 했어.`;source="memory";candidateId="memory:"+memAsk}}catch(e){console.warn("모아 개인기억 조회 실패",e)}
    }

    /* 3. 날씨/뉴스/환율 등 명확한 검색성 질문은 검색 보조로 보냅니다. */
    const q=!answer?extractSearchQuery(raw):"";
    if(!answer&&q){const found=await searchAssist(raw,q);if(found){answer=found.reply;source=found.source;candidateId=found.candidateId}}

    /* 4. 의미 있는 대화는 서버의 검증된 표현학습 + 공용 주제관계 힌트를 한 번 조회합니다.
       답변이 없더라도 topic_hints는 아래 공통 대화 플래너가 사용합니다. */
    let learnedTried=false;
    if(!answer&&!MiniTalk.Store.get("user")?.isGuest&&shouldTryLearnedFirst(raw)){
      learnedTried=true;
      try{
        const frame=MiniTalk.AI.MoaDialogueCore?.analyze?.(raw)||{};
        const data=await MiniTalk.AuthApi.moaChat({userId:userKey(),text:raw,context:context().slice(-6),semantic:frame});
        topicHints=Array.isArray(data?.topic_hints)?data.topic_hints:[];
        if(data?.reply){answer=data.reply;source=data.source||"learned";candidateId=data.candidate_id||""}
      }catch(e){console.warn("모아 학습/주제대화 조회 실패",e)}
    }

    /* 5. 특정 주제 하드코딩 대신 문장 소재/행동/결과/감정/문맥을 이용하는 공통 대화 레이어. */
    if(!answer){const natural=naturalStatementReply(raw,topicHints);if(natural){answer=natural;source="dialogue_core";candidateId="dialogue:"+(MiniTalk.AI.MoaDialogueCore?.analyze?.(raw)?.action||"statement")}}

    /* 6. 초기 부트스트랩 회화는 안전망으로만 사용합니다. */
    if(!answer){const builtin=builtinReply(raw);if(builtin){answer=builtin.reply;candidateId=builtin.id;source="builtin"}}

    if(!answer&&!learnedTried&&!MiniTalk.Store.get("user")?.isGuest){
      try{const frame=MiniTalk.AI.MoaDialogueCore?.analyze?.(raw)||{},data=await MiniTalk.AuthApi.moaChat({userId:userKey(),text:raw,context:context().slice(-6),semantic:frame});topicHints=Array.isArray(data?.topic_hints)?data.topic_hints:topicHints;if(data?.reply){answer=data.reply;source=data.source||"learned";candidateId=data.candidate_id||""}}catch(e){console.warn("모아 학습대화 조회 실패",e)}
    }

    if(!answer){
      const natural=naturalStatementReply(raw,topicHints);
      if(natural){answer=natural;source="dialogue_core";candidateId="dialogue:generic"}
      else if(raw.length<=32&&!/[?？]/.test(raw))answer=pick(["응응, 계속 말해봐.","오 그랬구나. 그다음은?","그래? 조금 더 들어볼래."]);
      else answer=pick(["잠깐, 이건 내가 제대로 못 잡았어. 조금만 다르게 말해줄래?","이건 내가 아직 잘 못 알아들었어. 다른 말로 한 번만 말해줘."]);
      source=source==="local"?"fallback":source;candidateId=candidateId||"fallback";
    }

    const memory=detectPersonalMemory(raw);
    if(memory&&!MiniTalk.Store.get("user")?.isGuest){
      MiniTalk.AuthApi.moaMemorySet({userId:userKey(),key:memory.key,value:memory.value,label:memory.label}).catch(e=>console.warn("모아 개인기억 저장 실패",e));
      if(source==="fallback")answer=`알겠어. ${memory.value}${memory.key==="like"?" 좋아하는구나.":memory.key==="dislike"?" 별로 안 좋아하는구나.":"라고 기억해둘게."}`;
    }

    remember("assistant",answer,{source,candidateId});
    lastReplyByUser.set(userKey(),{reply:answer,userText:raw,source,candidateId,ts:Date.now()});
    return {reply:answer,source,candidateId};
  }

  function warmup(){return ensureReactionLexicon();}
  return {reply,context,clearContext,warmup};
})();
