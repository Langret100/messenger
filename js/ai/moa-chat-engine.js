/* ============================================================
   MOA CHAT ENGINE
   - Firebase를 사용하지 않는 모아 1:1 학습형 대화 클라이언트 엔진
   - 기본 회화/계산/시간/검색은 기기에서 먼저 처리하고, 공용 학습 조회만 Apps Script 사용

   [모아 AI 기능 완전 제거 방법]
   1) 이 파일(js/ai/moa-chat-engine.js) 삭제
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

  const pick = arr => arr[Math.floor(Math.random() * arr.length)];
  const clean = text => String(text || "").replace(/\s+/g, " ").trim();
  const compact = text => clean(text).toLowerCase().replace(/\s+/g, "");
  function userKey(){ return String(MiniTalk.Store.get("user")?.user_id || "guest"); }

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
  function clearContext(){const key=userKey();recentByUser.set(key,[]);MiniTalk.Persistence.remove(`moa.context.${key}`)}

  function detectDateTime(text){
    const c=compact(text), now=new Date();
    if(/지금몇시|몇시야|현재시간|지금시간/.test(c)) return `지금은 ${now.getHours()}시 ${String(now.getMinutes()).padStart(2,"0")}분이야.`;
    if(/오늘날짜|오늘며칠|오늘몇일|현재날짜/.test(c)) return `오늘은 ${now.getFullYear()}년 ${now.getMonth()+1}월 ${now.getDate()}일이야.`;
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

  /* 처음부터 대화가 되도록 넣어 둔 로컬 기본 회화.
     기존 미나/기존 '대화' 시트와 무관하며, 이후 공용 학습은 모아 전용 시트에만 누적됩니다. */
  function builtinReply(text){
    const c=compact(text);
    const out=(id,replies)=>({id:`builtin:${id}`,reply:pick(replies)});
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
    if(/학교어땠|학교.*재밌|오늘학교/.test(c)) return out("school",["오늘 학교에서 제일 기억나는 일이 뭐였어?","학교 얘기 좋지. 오늘 재밌는 일 있었어?","오늘 수업 중엔 뭐가 제일 괜찮았어?"]);
    if(/시험|문제어려|공부힘/.test(c)) return out("study",["어떤 부분이 제일 어려웠어? 같이 정리해보자.","공부 얘기구나. 막힌 데부터 하나씩 보자.","괜찮아. 어떤 문제였는지 말해주면 같이 생각해볼게."]);
    if(/친구|친구랑/.test(c)) return out("friend",["친구랑 무슨 일 있었어?","오, 친구 얘기구나. 계속 말해봐.","그 친구랑은 평소에 어때?"]);
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
    const patterns=[/(.*?)\s*(?:검색해줘|검색해|찾아줘|찾아봐|알아봐줘|설명해줘)$/,/^(.*?)\s*(?:가|이|은|는)?\s*(?:뭐야|누구야|궁금해)$/];
    for(const re of patterns){const m=raw.match(re);if(m&&clean(m[1]).length>=2)return clean(m[1]).replace(/[이가은는을를]$/g,"")}
    return "";
  }
  async function wikiSearch(query){
    if(!query)return null;
    const url="https://ko.wikipedia.org/api/rest_v1/page/summary/"+encodeURIComponent(query);
    try{const res=await fetch(url);if(!res.ok)return null;const data=await res.json();if(!data?.extract)return null;let text=String(data.extract).replace(/\s+/g," ").trim();if(text.length>360)text=text.slice(0,357).replace(/\s+\S*$/,'')+"…";return text}catch{return null}
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

  function reactionSignal(text){
    const c=compact(text);
    if(/^(맞아|응맞아|그래맞아|오맞아|고마워|땡큐|정답|ㅇㅇ)/.test(c))return "positive";
    if(/^(아니|아닌데|그게아니라|틀렸어|ㄴㄴ)/.test(c))return "correction";
    return "";
  }

  async function sendNaturalFeedback(text){
    const prev=lastReplyByUser.get(userKey()), signal=reactionSignal(text);
    if(!prev||!signal||MiniTalk.Store.get("user")?.isGuest)return;
    try{await MiniTalk.AuthApi.moaFeedback({userId:userKey(),reaction:signal,candidateId:prev.candidateId||"",previousUserText:prev.userText||"",previousReply:prev.reply||"",previousSource:prev.source||"",followup:text})}catch(e){console.warn("모아 자연학습 피드백 저장 실패",e)}
  }

  async function reply(text){
    const raw=clean(text);if(!raw)return null;
    await sendNaturalFeedback(raw);
    remember("user",raw);
    let answer="",source="local",candidateId="";

    answer=detectDateTime(raw)||calculate(raw)||rps(raw);
    if(answer)candidateId="local:utility";
    if(!answer){const builtin=builtinReply(raw);if(builtin){answer=builtin.reply;candidateId=builtin.id;source="builtin"}}

    const memAsk=memoryQuestion(raw);
    if(!answer&&memAsk&&!MiniTalk.Store.get("user")?.isGuest){
      try{const data=await MiniTalk.AuthApi.moaMemoryGet(userKey(),memAsk);if(data?.value){answer=memAsk==="like"?`${data.value} 좋아한다고 했었어.`:`${data.label||"기억"}은 ${data.value}라고 했어.`;source="memory";candidateId="memory:"+memAsk}}catch(e){console.warn("모아 개인기억 조회 실패",e)}
    }

    if(!answer){
      const q=extractSearchQuery(raw);
      if(q){const found=await wikiSearch(q);if(found){answer=found;source="wiki";candidateId="wiki"}}
    }

    if(!answer&&!MiniTalk.Store.get("user")?.isGuest){
      try{
        const data=await MiniTalk.AuthApi.moaChat({userId:userKey(),text:raw,context:context().slice(-6)});
        if(data?.reply){answer=data.reply;source=data.source||"learned";candidateId=data.candidate_id||""}
      }catch(e){console.warn("모아 학습대화 조회 실패",e)}
    }

    if(!answer){
      const prev=context().slice().reverse().find(x=>x.role==="user"&&x.text!==raw);
      answer=prev?pick([`아까 ${prev.text} 얘기하다가 여기로 이어졌네. 조금만 더 말해줘.`,`응, 듣고 있어. ${raw}에 대해 조금만 더 알려줘.`]):pick(["그건 아직 잘 모르겠어. 조금만 더 알려줄래?","응? 그 말은 아직 익숙하지 않아. 무슨 뜻인지 조금 더 말해줘.","내가 아직 잘 못 알아들었어. 다른 말로 한 번만 더 말해줘."]);
      source="fallback";candidateId="fallback";
    }

    const memory=detectPersonalMemory(raw);
    if(memory&&!MiniTalk.Store.get("user")?.isGuest){
      MiniTalk.AuthApi.moaMemorySet({userId:userKey(),key:memory.key,value:memory.value,label:memory.label}).catch(e=>console.warn("모아 개인기억 저장 실패",e));
      if(source==="fallback")answer=`알겠어. ${memory.value}${memory.key==="like"?" 좋아하는구나.":memory.key==="dislike"?" 별로 안 좋아하는구나.":"라고 기억해둘게."}`;
    }

    remember("assistant",answer,{source,candidateId});
    lastReplyByUser.set(userKey(),{reply:answer,userText:raw,source,candidateId});
    return {reply:answer,source,candidateId};
  }

  return {reply,context,clearContext};
})();
