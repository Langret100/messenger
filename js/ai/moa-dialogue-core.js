/* ============================================================
   MOA DIALOGUE CORE
   - 특정 주제 하드코딩이 아니라 문장 구조/소재/행동/감정/문맥으로 잡담을 처리합니다.
   - 원문 전체를 공용 학습용으로 보내지 않고, 의미 있는 소재/관계만 topic observation으로 넘길 수 있게 구조화합니다.
   ============================================================ */
MiniTalk.AI = MiniTalk.AI || {};
MiniTalk.AI.MoaDialogueCore = (() => {
  const states = new Map();
  const STOP = new Set([
    '오늘','어제','내일','아까','방금','지금','이번','저번','요즘','마지막','우리가','우리팀','생각보다','은근','다른','아니라','진짜','완전','엄청','너무','약간','조금','좀','그냥','근데','그런데','그래서','그리고','그러면','그럼','나는','난','내가','나도','너는','넌','네가','모아','우리','우리들','친구','그거','그게','그건','저거','이거','걔','거기','뭐','무슨','어떤','어떻게','왜','언제','어디','누구','정도','하나','정말','레알','ㄹㅇ','ㅋㅋ','ㅋㅋㅋ','ㅎㅎ','ㅎㅎㅎ'
  ]);
  const PARTICLES = ['으로부터','한테서','에게서','에서는','으로는','한테','에게','에서','까지','부터','처럼','보다','으로','로는','에는','에는','이랑','랑','하고','와','과','은','는','가','을','를','에','의','도','만'];
  const VERBISH = /(?:했어|했음|했다|했지|했는데|했거든|하는중|하고있|해봤어|해봄|할거야|하려고|하고싶어|됐어|됐음|되었어|그렸어|만들었어|끝냈어|풀었어|배웠어|연습했어|놀았어|먹었어|마셨어|봤어|읽었어|들었어|갔어|갔다|다녀왔어|왔어|이겼어|성공했어|실패했어|좋았어|싫었어|재밌었어|힘들었어|어려웠어|피곤했어|졸려|속상했어|화났어|짜증났어|놀랐어|말했어|얘기했어|넣었어|넣었지|숨겼어|찾았어|발견했어|매웠는데|어렵더라|잘하더라|였어|이었어|었어|았어|었지|았지|었음|았음|는데|더라|더라고|다가|려고|거야|어졌어|아졌어|려졌어|해졌어)$/;
  const TIME = /^(오늘|어제|내일|아까|방금|지금|주말|이번주|다음주|저번주)$/;
  const clean = text => String(text || '').replace(/\s+/g,' ').trim();
  const pick = arr => arr[Math.floor(Math.random()*arr.length)];
  function key(){return String(MiniTalk.Store.get('user')?.user_id || 'guest')}
  function state(userId=key()){
    if(!states.has(userId)) states.set(userId,{topics:[],lastPerson:'',lastIntent:'',lastAction:'',lastAffect:'neutral',mode:'',modeUntil:0,lastStatement:'',turn:0});
    const s=states.get(userId); if(s.mode && s.modeUntil && Date.now()>s.modeUntil){s.mode='';s.modeUntil=0;} return s;
  }
  function clear(userId=key()){states.delete(userId)}
  function stripParticle(token){
    let t=token;
    if(/(?:다가|더라|더라고|는데|었어|았어|했어|했지|했음|거야|려고)$/.test(t))return t;
    for(const p of PARTICLES){if(t.length>p.length && t.endsWith(p)){t=t.slice(0,-p.length);break}}
    return t;
  }
  function tokens(text){
    return clean(text).normalize?.('NFC').toLowerCase().replace(/[^0-9a-z가-힣ㄱ-ㅎㅏ-ㅣ\s]/gi,' ').split(/\s+/).map(stripParticle).filter(Boolean);
  }
  function concepts(text){
    const out=[];
    for(const token0 of tokens(text)){
      let token=token0.replace(/[ㅋㅎㅠㅜ]+$/,'');
      const nominal=token.match(/^([0-9a-z가-힣]{2,12})(?:했어|했음|했다|했지|했는데|하는중)$/);
      if(nominal)token=nominal[1];
      if(token.length<2||token.length>16||STOP.has(token)||TIME.test(token)||VERBISH.test(token)||/^\d+$/.test(token)) continue;
      if(/^(맞아|맞음|아니|아님|오케이|오키|고마워|감사|노잼|별로|대박|헐|발견|생각|말|얘기)$/.test(token))continue;
      if(!out.includes(token))out.push(token);
      if(out.length>=5)break;
    }
    const low=new Set(['학교','수업','시간','친구','사람','과학실','교실']);
    out.sort((a,b)=>(low.has(a)?1:0)-(low.has(b)?1:0));
    return out;
  }
  function detectPerson(text){
    const raw=clean(text);
    const named=raw.match(/([가-힣]{2,4})(?:이가|가|이는|는|이)\s+(?:말했|했|갔|왔|잘하|좋아하|싫어하|넣었|봤|먹었|만들)/);
    if(named && !/^(오늘|어제|내일|친구|선생님|엄마|아빠)$/.test(named[1]))return named[1];
    if(/내\s*친구|친구가|친구는|친구랑/.test(raw))return '친구';
    return '';
  }
  function analyze(text){
    const raw=clean(text), lower=raw.toLowerCase(), cs=concepts(raw), question=/[?？]$/.test(raw)||/(뭐야|뭔데|누구|어디|언제|왜|어떻게|몇\s*|알려줘|설명해줘|좋아해\??$|어때\??$)/.test(raw);
    let affect='neutral';
    if(/재밌|즐거|신나|좋았|좋아|맛있|성공|잘됐|이겼|붙었|통과|대박|최고|뿌듯|행복|(?:생각보다\s*)?잘\s+[^.!?]{1,18}(?:됐어|나왔어|졌어|풀렸어|끝났어)/.test(raw))affect='positive';
    if(/힘들|어려|어렵|이상|실패|망했|아쉽|별로|노잼|재미없|피곤|지쳤|속상|슬프|우울|짜증|화나|싫었|아파/.test(raw)||/(?:^|\s)(?:졌어|졌다|졌음)(?:$|[.!~])/u.test(raw))affect='negative';
    let action='statement';
    if(/성공|잘\s*됐|잘됐|해냈|완성|끝냈|통과|붙었|이겼|우승|(?:생각보다\s*)?잘\s+[^.!?]{1,18}(?:됐어|나왔어|졌어|풀렸어|끝났어)/.test(raw))action='success';
    else if(/실패|망했|못했|틀렸|막혔/.test(raw)||/(?:^|\s)(?:졌어|졌다|졌음)(?:$|[.!~])/u.test(raw))action='failure';
    else if(/(?:^|\s)(?:먹었어|먹었음|먹었다|마셨어|마셨다|먹어봤어)(?:$|[.!~])/u.test(raw))action='consume';
    else if(/(?:^|\s)(?:봤어|봤음|봤다|읽었어|읽었다|들었어|들었다)(?:$|[.!~])/u.test(raw))action='consume_media';
    else if(/(?:^|\s)(?:갔어|갔다|다녀왔어|왔다)(?:$|[.!~])/u.test(raw))action='go';
    else if(/(?:할|갈|볼|먹을|만날|놀|쉴)\s*거야|[가-힣]{1,10}려고(?:\s|$)|하고\s*싶|가고\s*싶|먹고\s*싶|보고\s*싶/.test(raw))action='plan';
    else if(/좋아해|싫어해/.test(raw)&&!question)action='preference';
    else if(/했어|했음|했다|했지|했는데|해봤|그렸|만들었|끝냈|풀었|배웠|연습했|놀았|넣었|숨겼|찾았|발견했|[가-힣]{1,10}는\s*중|[가-힣]{1,10}(?:었어|았어|었지|았지|었음|았음)(?:$|[.!~])/.test(raw))action='activity';
    const selfQuestion=question&&(/(?:^|\s)(너|넌|네가|모아)(?:\s|$)|너는|넌|모아는/.test(raw)||/^(뭐하고\s*놀까|뭐\s*할까|심심해|놀아줘)/.test(raw));
    const pronoun=/^(걔|그애|그친구|그사람|그거|그게|그건|거기|아까그거|방금그거)/.test(lower.replace(/\s+/g,''));
    return {raw,concepts:cs,question,selfQuestion,affect,action,person:detectPerson(raw),pronoun,intent:question?'question':action};
  }
  function update(userId,text,signal){
    const s=state(userId), f=analyze(text); s.turn++;
    if(f.person)s.lastPerson=f.person;
    if(f.concepts.length&&!f.pronoun){const merged=[...f.concepts,...s.topics];s.topics=[...new Set(merged)].slice(0,6)}
    if(!f.question && !(signal&&['agreement','laughter','gratitude','praise','negative','correction','surprise','uncertain','playful_positive'].includes(signal.tag)))s.lastStatement=f.raw;
    s.lastIntent=f.intent;s.lastAction=f.action;s.lastAffect=f.affect;
    return s;
  }
  function setMode(mode,ttlMs=90000){const s=state();s.mode=mode;s.modeUntil=Date.now()+ttlMs;return s}
  function clearMode(){const s=state();s.mode='';s.modeUntil=0;return s}
  function topicLabel(frame,s){return frame.concepts[0]||s.topics[0]||''}
  function selfReply(text,frame=analyze(text)){
    const raw=frame.raw;
    if(/뭐하고\s*놀까|뭐\s*할까|뭐하지|심심해|놀아줘/.test(raw))return pick(['가위바위보 할래, 농담 하나 들을래, 아니면 그냥 수다 떨까?','그냥 수다도 좋고, 가위바위보·농담·랜덤 고르기도 할 수 있어. 뭐가 당겨?']);
    if(!frame.selfQuestion)return '';
    if(/이름|누구/.test(raw))return pick(['난 모아야. 그냥 모아라고 부르면 돼 ㅋㅋ','모아! 여기서 너랑 얘기하고 필요한 것도 도와주는 역할이야.']);
    if(/몇\s*살|나이/.test(raw))return '나는 사람처럼 나이를 세진 않아. 모아루 안에서 계속 배우면서 지내는 모아야.';
    if(/뭐\s*할\s*수|뭘\s*할\s*수|기능|할\s*줄/.test(raw))return '잡담, 계산, 단위변환, 타이머·알람, 날씨·공기질·환율·뉴스·검색 같은 걸 도와줄 수 있어. 그냥 평소처럼 말해봐.';
    if(/뭐해|뭐\s*하고/.test(raw))return pick(['지금 너랑 얘기하고 있지 ㅋㅋ 너는 뭐 해?','너랑 수다 중이지. 무슨 얘기할래?']);
    if(/좋아해|싫어해/.test(raw)){
      const t=frame.concepts.find(v=>!['좋아','싫어'].includes(v));
      return t?`나는 직접 해보거나 먹진 못하지만 ${t} 얘기 같이 하는 건 좋아해. 너는 ${t} 좋아해?`:'나는 네가 관심 있는 얘기를 같이 이어가는 게 좋아.';
    }
    return '';
  }
  function contextReply(text,frame=analyze(text),hints=[]){
    const s=state(), compact=frame.raw.replace(/\s+/g,'');
    if(/^(걔|그애|그친구|그사람)/.test(compact)&&s.lastPerson)return `${s.lastPerson} 얘기지? 응, 계속 말해봐.`;
    if(/^(그거|그게|그건|아까그거|방금그거)/.test(compact)&&s.topics[0])return `아까 ${s.topics[0]} 얘기 말하는 거지? 응, 계속 얘기해봐.`;
    return '';
  }
  function genericReply(text,frame=analyze(text),hints=[]){
    const s=state(), topic=topicLabel(frame,s), t=topic?` ${topic}`:'', related=(hints||[]).map(v=>typeof v==='string'?v:v?.term).filter(Boolean).find(v=>v!==topic);
    const relQ=related?` ${related}도 같이 나왔어?`:'';
    if(frame.question)return '';
    if(frame.action==='success')return pick([`오${t} 잘됐네 ㅋㅋ 그건 좀 뿌듯했겠다.`,topic?`좋았겠다. ${topic}에서 뭐가 제일 잘됐어?`:'좋았겠다. 뭐가 제일 잘됐어?',`오 성공했네. 생각했던 것보다 잘된 거야?`]);
    if(frame.action==='failure'||frame.affect==='negative')return pick([`아${t} 그건 좀 아쉽거나 힘들었겠다. 지금은 괜찮아?`,`으, 그건 좀 빡셌겠다. 뭐가 제일 힘들었어?`,`아쉽거나 좀 힘들었겠다. 얘기하고 싶으면 계속 말해봐.`]);
    if(frame.affect==='positive')return pick([`오${t} 좋았나 보네 ㅋㅋ 뭐가 제일 좋았어?`,`ㅋㅋ 말투부터 괜찮았던 게 느껴지는데. 뭐가 제일 기억나?`,`좋았겠다.${relQ||' 더 얘기해봐.'}`]);
    if(frame.action==='consume')return pick([`오${topic?' '+topic:' 그거'} 먹었구나. 맛은 어땠어?`,`${topic?topic+' ':''}좋네 ㅋㅋ 또 먹을 만했어?`,`오${topic?' '+topic:''} 먹었네.${related?` ${related}랑 같이 먹은 거야?`:' 제일 맛있던 건 뭐였어?'}`]);
    if(frame.action==='consume_media')return pick([`오${t||' 그거'} 봤구나. 어땠어?`,`볼 만했어? 뭐가 제일 기억나?`,`오 그거 봤네 ㅋㅋ${related?` ${related} 얘기도 나와?`:' 재밌었어?'}`]);
    if(frame.action==='go')return pick([`오${t?` ${topic}`:''} 다녀왔구나. 어땠어?`,`거기서 뭐가 제일 기억나?`,`오 갔다 왔네.${relQ||' 괜찮았어?'}`]);
    if(frame.action==='plan')return pick([`오 계획 있네. 기대돼?`,`좋네. 제일 기대되는 게 뭐야?`,`오케이 ㅋㅋ 잘 하고 와. 나중에 어땠는지도 말해줘.`]);
    if(frame.action==='preference')return topic?`오, ${topic} 쪽을 그렇게 생각하는구나. 어떤 점 때문에 그래?`:'오, 취향 얘기네. 어떤 점이 제일 좋아?';
    if(frame.action==='activity')return pick([topic?`오, ${topic} 얘기네. 그래서 어떻게 됐어?`:'오, 그래서 어떻게 됐어?',topic?`${topic} 쪽 얘기구나. 그다음은?`:'응응, 그다음은?',`오 ㅋㅋ ${topic?topic+' ':''}그 뒤엔 어떻게 됐어?${relQ}`]);
    if(frame.concepts.length)return pick([`오, ${topic} 얘기구나. 그래서 어떻게 됐어?`,`${topic} 쪽 얘기네. 계속 말해봐 ㅋㅋ`,`오 ${topic}.${related?` ${related}랑도 관련 있어?`:' 그다음은?'}`]);
    return '';
  }
  function observation(text,signal){
    const f=analyze(text); if(f.question||f.raw.length<4)return null;
    const pure=signal&&['agreement','laughter','gratitude','praise','negative','correction','surprise','uncertain','playful_positive'].includes(signal.tag)&&f.concepts.length===0;
    if(pure||!f.concepts.length)return null;
    return {concepts:f.concepts.slice(0,4),action:f.action,affect:f.affect,intent:f.intent};
  }
  return {analyze,concepts,state,clear,update,setMode,clearMode,selfReply,contextReply,genericReply,observation};
})();
