/* 금요일 09:00~23:59에만 열리는 초6 격주 과목 20문항 주간 미션.
 * 2026-08-17 주간을 수학 시작점으로 삼아 수학 20문항 ↔ 국어 20문항을 매주 교대합니다.
 * PC/웨일북에서는 시험지처럼 한 화면에 20문항을 펼친 별도 창으로 열고,
 * 모바일에서는 같은 시험지 UI를 앱 모달 안에 표시합니다.
 * 시간 판단과 카운트다운은 사용 중인 기기의 로컬 시간을 기준으로 합니다.
 */
MiniTalk.Tasks=MiniTalk.Tasks||{};
MiniTalk.Tasks.FridayGrade6Mission=(()=>{
  const OPEN_HOUR=9,TOTAL=20,PATH="moaru/v3/fridayMission",REWARD_TYPE="WEEKLY_CHECK_OVER80",REWARD_COIN=5,ALT_ANCHOR_WEEK="2026-08-17";
  const QUESTION_SET_VERSION="v7",mathCats=["분수·소수","비와 비율","도형","자료 해석","문장제"];
  const korBank=[
    ["독해","'비가 와서 운동회가 연기되었다.'에서 운동회가 연기된 까닭은?","비가 와서",["비가 와서","날씨가 더워서","학생이 적어서","운동장이 넓어서"]],
    ["독해","글에서 반복되거나 강조되는 내용을 살펴보는 주된 까닭은?","중심 생각을 찾기 위해",["중심 생각을 찾기 위해","글자 수를 세기 위해","문장부호를 찾기 위해","종이 크기를 알기 위해"]],
    ["독해","설명하는 글을 읽을 때 내용 이해에 가장 도움이 되는 것은?","문단별 핵심 내용을 정리하기",["문단별 핵심 내용을 정리하기","모든 문장을 외우기","제목을 가리기","글자 모양만 살피기"]],
    ["독해","주장하는 글에서 가장 먼저 확인해야 할 것은?","글쓴이의 주장과 근거",["글쓴이의 주장과 근거","문장의 개수","글씨의 크기","사용한 종이"]],
    ["독해","다음 글을 읽고 중심 생각을 고르세요. '학교 텃밭에 물을 주고 잡초를 뽑자 채소가 튼튼하게 자랐다. 친구들은 매일 순서를 정해 텃밭을 돌보았다.'","꾸준히 돌보면 식물이 잘 자란다",["꾸준히 돌보면 식물이 잘 자란다","채소는 잡초보다 작다","학교에는 텃밭이 하나뿐이다","친구들은 물주기를 싫어한다"]],
    ["독해","다음 글의 내용과 일치하는 것은? '민서는 도서관에서 빌린 책을 다 읽은 뒤 반납일보다 이틀 일찍 돌려주었다.'","민서는 반납일 전에 책을 돌려주었다",["민서는 반납일 전에 책을 돌려주었다","민서는 책을 읽지 않았다","민서는 책을 샀다","민서는 반납일을 넘겼다"]],
    ["어휘","'성실하다'와 뜻이 가장 가까운 말은?","부지런하다",["부지런하다","게으르다","시끄럽다","급하다"]],
    ["어휘","'예상'의 뜻으로 알맞은 것은?","앞으로의 일을 미리 생각함",["앞으로의 일을 미리 생각함","지난 일을 모두 잊음","소리를 크게 냄","물건을 나누어 줌"]],
    ["어휘","'갈등'의 뜻으로 가장 알맞은 것은?","서로 생각이나 마음이 맞지 않아 부딪힘",["서로 생각이나 마음이 맞지 않아 부딪힘","모두 같은 의견을 가짐","아무 일도 일어나지 않음","즐겁게 놀이를 함"]],
    ["어휘","'근거'의 뜻으로 알맞은 것은?","주장이나 판단을 뒷받침하는 까닭",["주장이나 판단을 뒷받침하는 까닭","글의 제목을 꾸미는 그림","문장을 짧게 만드는 부호","모르는 낱말의 발음"]],
    ["어휘","'간결하다'의 뜻으로 가장 알맞은 것은?","짧고 분명하다",["짧고 분명하다","길고 복잡하다","소리가 매우 크다","색이 아주 진하다"]],
    ["어휘","'대조하다'의 뜻으로 알맞은 것은?","둘 이상의 차이점을 비교해 살피다",["둘 이상의 차이점을 비교해 살피다","한 가지를 그대로 외우다","순서를 무작위로 바꾸다","내용을 모두 지우다"]],
    ["문법","문장에서 주어를 고르세요. '민지가 책을 읽었다.'","민지가",["민지가","책을","읽었다","책을 읽었다"]],
    ["문법","'아주 예쁜 꽃'에서 '꽃'을 꾸며 주는 말은?","예쁜",["예쁜","꽃","아주","아주 꽃"]],
    ["문법","'철수가 운동장에서 공을 찼다.'에서 목적어는?","공을",["철수가","운동장에서","공을","찼다"]],
    ["문법","다음 중 높임 표현이 바른 문장은?","할머니께서 진지를 드십니다.",["할머니께서 진지를 드십니다.","할머니가 밥을 먹어.","할머니께서 밥을 먹는다.","할머니가 진지를 먹는다."]],
    ["문법","다음 중 이어 주는 말의 쓰임이 자연스러운 문장은?","비가 왔다. 그래서 우산을 썼다.",["비가 왔다. 그래서 우산을 썼다.","비가 왔다. 그러나 우산을 썼다.","비가 왔다. 예를 들면 우산을 썼다.","비가 왔다. 한편 우산이 비다."]],
    ["문법","'나는 책을 읽고 동생은 그림을 그렸다.'에서 두 문장을 이어 주는 말은?","-고",["-고","나는","동생은","그렸다"]],
    ["맞춤법","맞춤법이 바른 것은?","할게요",["할게요","할께요","할 게요","할께 요"]],
    ["맞춤법","띄어쓰기가 바른 것은?","할 수 있다",["할 수 있다","할수 있다","할 수있다","할수있다"]],
    ["맞춤법","맞춤법이 바른 낱말은?","며칠",["며칠","몇일","몃일","몇 칠"]],
    ["맞춤법","다음 중 바르게 쓴 것은?","금세",["금세","금새","금 쎄","금쌔"]],
    ["맞춤법","다음 중 띄어쓰기가 바른 문장은?","나는 밥을 먹은 뒤에 운동했다.",["나는 밥을 먹은 뒤에 운동했다.","나는 밥을 먹은뒤에 운동했다.","나는밥을 먹은 뒤에 운동했다.","나는 밥을먹은뒤에 운동했다."]],
    ["추론","'우산을 든 사람들이 많고 길이 젖어 있다.'에서 짐작할 수 있는 것은?","비가 왔거나 오고 있다",["비가 왔거나 오고 있다","눈이 많이 왔다","날씨가 매우 덥다","바람이 전혀 없다"]],
    ["추론","등장인물이 문을 세게 닫고 대답을 짧게 했다면 짐작할 수 있는 마음은?","화가 났다",["화가 났다","매우 즐겁다","졸리다","배가 고프다"]],
    ["추론","친구가 계속 시계를 보며 발을 동동 구르고 있다. 가장 알맞은 짐작은?","시간에 늦을까 걱정하고 있다",["시간에 늦을까 걱정하고 있다","잠이 들어 있다","배가 아주 부르다","날씨가 추워 즐겁다"]],
    ["추론","식물의 잎이 축 늘어지고 흙이 매우 말라 있다. 가장 먼저 할 일은?","물을 주고 상태를 살핀다",["물을 주고 상태를 살핀다","잎을 모두 떼어 낸다","햇빛을 완전히 가린다","화분을 버린다"]],
    ["추론","'지우는 평소보다 일찍 집을 나섰지만 버스 정류장에 사람이 길게 줄을 서 있었다.' 뒤에 일어날 가능성이 가장 큰 일은?","버스를 기다리는 시간이 길어질 수 있다",["버스를 기다리는 시간이 길어질 수 있다","정류장이 갑자기 사라진다","모든 사람이 동시에 집에 간다","버스를 타지 않아도 바로 학교에 도착한다"]],
    ["요약","다음 내용의 요약으로 가장 알맞은 것은? '우리 반은 종이 사용을 줄이기 위해 이면지를 모아 쓰고, 안내문은 가능한 전자 문서로 확인하기로 했다.'","우리 반은 종이 사용을 줄이는 방법을 실천한다",["우리 반은 종이 사용을 줄이는 방법을 실천한다","우리 반은 종이를 더 많이 산다","전자 문서는 사용할 수 없다","이면지는 모두 버려야 한다"]],
    ["요약","다음 글의 핵심 내용은? '아침 식사를 하면 오전 활동에 필요한 에너지를 얻을 수 있고 규칙적인 생활에도 도움이 된다.'","아침 식사는 하루 생활에 도움이 된다",["아침 식사는 하루 생활에 도움이 된다","아침에는 운동하면 안 된다","오전에는 에너지가 필요 없다","식사는 밤에만 해야 한다"]]
  ];

  let worksheetWindow=null,draftTimer=0,draftPromise=Promise.resolve();
  const nowMs=()=>Date.now();
  const nowDate=()=>new Date();
  function weekKey(d=nowDate()){const x=new Date(d);const day=(x.getDay()+6)%7;x.setDate(x.getDate()-day);return`${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,"0")}-${String(x.getDate()).padStart(2,"0")}`}
  function weekNumberFromAnchor(d=nowDate()){const current=new Date(`${weekKey(d)}T00:00:00`),anchor=new Date(`${ALT_ANCHOR_WEEK}T00:00:00`);return Math.floor((current-anchor)/604800000)}
  function missionSubject(d=nowDate()){return Math.abs(weekNumberFromAnchor(d)%2)===0?"수학":"국어"}
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
  function q(subject,category,text,answer,choices,r,format="short"){
    const unique=[...new Set(choices.map(String))];while(unique.length<4)unique.push(`${answer} ${unique.length}`);
    return{subject,category,text,answer:String(answer),choices:shuffle(unique.slice(0,4),r),format}
  }
  function percentChoices(answer,r){const values=new Set([answer]);for(const add of [-20,-10,10,20,25]){const v=Math.max(0,Math.min(100,Number(answer.replace("%",""))+add));values.add(`${v}%`);if(values.size>=4)break}return shuffle([...values].slice(0,4),r)}
  function makeMathQuestionV4(cat,r){
    if(cat==="분수·소수"){
      if(r()<.55){const a=between(r,8,48)/10,b=between(r,2,19)/10,ans=(a+b).toFixed(1);return q("수학",cat,`주스가 ${a.toFixed(1)}L 있었는데 ${b.toFixed(1)}L를 더 부었습니다. 지금 주스는 모두 몇 L인가요?`,ans,[ans,(a+b+.1).toFixed(1),(Math.max(0,a+b-.1)).toFixed(1),(Math.max(0,a-b)).toFixed(1)],r,"word")}
      const d=between(r,4,10),n=between(r,1,d-1),extra=between(r,1,d-n),ans=`${n+extra}/${d}`;return q("수학",cat,`한 판을 ${d}등분한 피자에서 처음 ${n}조각, 나중에 ${extra}조각을 먹었습니다. 먹은 양을 분수로 나타내면?`,ans,[ans,`${n}/${d}`,`${extra}/${d}`,`${d}/${n+extra}`],r,"word")
    }
    if(cat==="비와 비율"){
      const totals=[20,40],total=totals[between(r,0,totals.length-1)],rates=[20,25,40,50,60,75,80],rate=rates[between(r,0,rates.length-1)],part=total*rate/100,ans=`${rate}%`;
      return q("수학",cat,`동아리 학생 ${total}명 중 ${part}명이 발표에 참여했습니다. 참여한 학생의 비율은 몇 %인가요?`,ans,percentChoices(ans,r),r,"word")
    }
    if(cat==="도형"){
      const w=between(r,4,15),h=between(r,3,12);
      if(r()<.5){const ans=String(w*h);return q("수학",cat,`가로 ${w}cm, 세로 ${h}cm인 직사각형 모양 종이의 넓이는 몇 ㎠인가요?`,ans,[ans,String(2*(w+h)),String(w+h),String(w*h+h)],r,"word")}
      const ans=String(2*(w+h));return q("수학",cat,`가로 ${w}m, 세로 ${h}m인 직사각형 화단 둘레에 끈을 한 바퀴 두르려고 합니다. 필요한 끈의 길이는 몇 m인가요?`,ans,[ans,String(w*h),String(w+h),String(2*w+h)],r,"word")
    }
    if(cat==="자료 해석"){
      let vals=[between(r,20,95),between(r,20,95),between(r,20,95),between(r,20,95)];while(new Set(vals).size<4)vals=[between(r,20,95),between(r,20,95),between(r,20,95),between(r,20,95)];
      if(r()<.5){const max=Math.max(...vals),ans=String(vals.indexOf(max)+1);return q("수학",cat,`1~4모둠의 재활용품 수가 차례로 ${vals.join(", ")}개입니다. 가장 많이 모은 모둠은 몇 모둠인가요?`,ans,["1","2","3","4"],r,"word")}
      const max=Math.max(...vals),min=Math.min(...vals),ans=String(max-min);return q("수학",cat,`네 모둠의 독서 기록이 ${vals.join(", ")}권입니다. 가장 많은 기록과 가장 적은 기록의 차이는 몇 권인가요?`,ans,[ans,String(max),String(min),String(max-min+5)],r,"word")
    }
    const mode=between(r,0,3);
    if(mode===0){const price=between(r,2,9)*500,count=between(r,2,6),paid=Math.ceil(price*count/5000)*5000,ans=String(paid-price*count);return q("수학",cat,`${price}원짜리 공책 ${count}권을 사고 ${paid}원을 냈습니다. 거스름돈은 얼마인가요?`,ans,[ans,String(price*count),String(paid-price),String(Math.max(0,paid-price*count-500))],r,"word")}
    if(mode===1){const per=between(r,3,8),boxes=between(r,2,6),used=between(r,1,per*boxes-1),ans=String(per*boxes-used);return q("수학",cat,`한 상자에 귤이 ${per}개씩 든 상자가 ${boxes}개 있습니다. 그중 ${used}개를 먹었다면 남은 귤은 몇 개인가요?`,ans,[ans,String(per*boxes),String(used),String(per+boxes-used)],r,"word")}
    if(mode===2){const each=between(r,4,9)*100,people=between(r,3,7),ans=String(each*people);return q("수학",cat,`한 사람에게 ${each}원씩 간식비를 나누어 주려고 합니다. ${people}명에게 필요한 돈은 모두 얼마인가요?`,ans,[ans,String(each+people),String(each*(people-1)),String(each*people+100)],r,"word")}
    const distance=between(r,3,8)*120,time=between(r,2,4),ans=String(distance/time);return q("수학",cat,`자전거를 타고 ${time}시간 동안 ${distance}km를 같은 빠르기로 이동했습니다. 한 시간에 몇 km씩 이동한 셈인가요?`,ans,[ans,String(distance),String(distance-time),String(distance/time+10)],r,"word")
  }


  const korExtra=[
    ["독해","다음 글에서 알 수 있는 사실은? '지민이는 아침마다 창문을 열어 날씨를 확인한 뒤 기온에 맞는 옷을 골라 입는다.'","지민이는 날씨를 확인하고 옷을 고른다",["지민이는 날씨를 확인하고 옷을 고른다","지민이는 매일 같은 옷을 입는다","지민이는 창문을 열지 않는다","지민이는 밤에만 날씨를 확인한다"]],
    ["독해","다음 글의 중심 내용으로 가장 알맞은 것은? '우리 동네에서는 토요일마다 주민들이 공원에 모여 쓰레기를 줍고 화단을 돌본다. 덕분에 공원이 한결 깨끗해졌다.'","주민들이 함께 공원을 깨끗하게 가꾼다",["주민들이 함께 공원을 깨끗하게 가꾼다","토요일에는 공원에 갈 수 없다","화단에는 꽃이 피지 않는다","주민들은 공원에서 운동만 한다"]],
    ["독해","안내문을 읽을 때 가장 먼저 확인하면 좋은 것은?","무엇을 언제 어떻게 해야 하는지",["무엇을 언제 어떻게 해야 하는지","글자 수가 몇 개인지","종이의 색이 무엇인지","쓴 사람의 글씨체가 어떤지"]],
    ["독해","이야기에서 사건의 순서를 파악하는 데 가장 도움이 되는 말은?","먼저, 그다음, 마지막으로",["먼저, 그다음, 마지막으로","매우, 아주, 정말","크다, 작다, 길다","나, 너, 우리"]],
    ["어휘","'신중하다'의 뜻으로 가장 알맞은 것은?","조심스럽게 깊이 생각하다",["조심스럽게 깊이 생각하다","아무 생각 없이 서두르다","큰 소리로 말하다","쉽게 포기하다"]],
    ["어휘","'공감하다'의 뜻으로 가장 알맞은 것은?","다른 사람의 생각이나 감정을 이해하고 함께 느끼다",["다른 사람의 생각이나 감정을 이해하고 함께 느끼다","상대의 말을 일부러 무시하다","혼자서만 결정하다","모든 일을 빠르게 끝내다"]],
    ["어휘","'원인'과 뜻의 관계가 가장 가까운 말은?","어떤 일이 생긴 까닭",["어떤 일이 생긴 까닭","어떤 일이 끝난 결과","글의 첫 문장","사람의 이름"]],
    ["어휘","'효율적이다'의 뜻으로 가장 알맞은 것은?","적은 노력으로 좋은 결과를 얻는다",["적은 노력으로 좋은 결과를 얻는다","시간을 오래 끌기만 한다","같은 일을 계속 반복한다","계획 없이 시작한다"]],
    ["문법","'동생이 운동장에서 신나게 달린다.'에서 서술어는?","달린다",["동생이","운동장에서","신나게","달린다"]],
    ["문법","'나는 숙제를 끝냈지만 동생은 아직 공부하고 있다.'에서 두 내용을 이어 주는 말은?","-지만",["-지만","나는","아직","공부하고"]],
    ["문법","다음 중 시간의 흐름에 맞게 이어 주는 표현은?","먼저 손을 씻고, 그다음 식사를 했다.",["먼저 손을 씻고, 그다음 식사를 했다.","먼저 식사를 했지만, 그래서 손을 씻었다.","그러나 손을 씻고, 예를 들면 식사를 했다.","한편 먼저, 하지만 그다음이다."]],
    ["문법","'새빨간 사과가 바구니에 놓여 있다.'에서 '사과'를 꾸며 주는 말은?","새빨간",["새빨간","사과가","바구니에","놓여 있다"]],
    ["맞춤법","다음 중 바르게 쓴 문장은?","웬일로 일찍 왔니?",["웬일로 일찍 왔니?","왠일로 일찍 왔니?","웬 일로 일찍왔니?","왠 일로 일찍 왔니?"]],
    ["맞춤법","다음 중 바르게 쓴 것은?","돼요",["돼요","되요","됬어요","됬다"]],
    ["맞춤법","띄어쓰기가 바른 문장은?","한 번 더 생각해 보자.",["한 번 더 생각해 보자.","한번 더 생각해보자.","한 번더 생각해 보자.","한번더 생각해보자."]],
    ["맞춤법","다음 중 바르게 쓴 낱말은?","어떻게",["어떻게","어떡해로","어떻해","어떡게"]],
    ["추론","교실 불은 켜져 있고 책상 위에 펼친 공책과 연필이 있다. 가장 자연스러운 짐작은?","누군가 공부하다가 잠시 자리를 비웠다",["누군가 공부하다가 잠시 자리를 비웠다","교실을 아무도 사용하지 않았다","공책은 새것이라 한 번도 펼치지 않았다","교실에는 책상이 없다"]],
    ["추론","친구가 우산을 접으며 옷에 묻은 물을 털고 들어왔다. 밖의 날씨로 가장 알맞은 것은?","비가 오고 있거나 조금 전까지 왔다",["비가 오고 있거나 조금 전까지 왔다","눈이 많이 쌓였다","하늘이 하루 종일 맑았다","바람이 전혀 불지 않았다"]],
    ["추론","운동장에 물웅덩이가 많고 체육 수업이 강당으로 바뀌었다. 그 까닭으로 가장 알맞은 것은?","비 때문에 운동장 사용이 어려워졌다",["비 때문에 운동장 사용이 어려워졌다","운동장이 새로 생겼다","학생들이 모두 집에 갔다","강당을 철거하기로 했다"]],
    ["추론","민호가 시험지를 받은 뒤 어려운 문제에 표시를 하고 쉬운 문제부터 풀었다. 민호의 행동에서 알 수 있는 점은?","시간을 효율적으로 쓰려고 한다",["시간을 효율적으로 쓰려고 한다","시험을 포기하려고 한다","문제를 읽지 않으려고 한다","답을 모두 알고 있다"]],
    ["요약","다음 글의 요약으로 가장 알맞은 것은? '반 친구들은 역할을 나누어 교실을 청소했다. 창문을 닦는 친구, 바닥을 쓰는 친구, 책상을 정리하는 친구가 힘을 합치자 금방 깨끗해졌다.'","역할을 나누어 함께 청소하면 일을 효율적으로 할 수 있다",["역할을 나누어 함께 청소하면 일을 효율적으로 할 수 있다","청소는 혼자 해야 가장 빠르다","창문 청소만 하면 교실이 깨끗해진다","책상은 정리할 필요가 없다"]],
    ["요약","다음 글의 핵심 내용은? '물을 아껴 쓰려면 양치할 때 컵을 사용하고, 비누칠하는 동안에는 수도꼭지를 잠그는 습관이 필요하다.'","생활 속 작은 습관으로 물을 절약할 수 있다",["생활 속 작은 습관으로 물을 절약할 수 있다","양치할 때 물을 계속 틀어야 한다","비누칠할 때 물을 더 많이 써야 한다","물 절약은 생활과 관계없다"]],
    ["요약","다음 내용의 요약으로 알맞은 것은? '도서관에서는 책을 조용히 읽고, 빌린 책은 정해진 날짜 안에 돌려주며, 다른 사람이 읽을 수 있도록 깨끗하게 사용해야 한다.'","도서관 책을 이용할 때 지켜야 할 예절이 있다",["도서관 책을 이용할 때 지켜야 할 예절이 있다","도서관에서는 책을 살 수만 있다","책은 빌린 뒤 돌려주지 않아도 된다","도서관에서는 큰 소리로 읽어야 한다"]],
    ["요약","다음 글의 중심 내용을 한 문장으로 줄이면? '충분히 잠을 자면 몸의 피로가 풀리고 다음 날 집중하는 데 도움이 된다. 일정한 시간에 자고 일어나는 습관도 중요하다.'","규칙적으로 충분히 자는 것은 건강과 집중에 도움이 된다",["규칙적으로 충분히 자는 것은 건강과 집중에 도움이 된다","잠은 적게 잘수록 집중이 잘된다","잠자는 시간은 매일 달라야 한다","피곤할수록 늦게 자는 것이 좋다"]]
  ];


  /* v6까지의 기존 국어 주간 시험지를 그대로 재현하기 위한 호환 풀입니다.
   * v7부터는 아래 사용자별 대형 생성 풀에서 국어 주차마다 겹치지 않는 20문항 구간을 사용합니다. */
  const korCycleExtra=[
    ["독해","다음 글의 중심 생각으로 알맞은 것은? '학교 방송부는 매일 점심시간에 급식 안내와 학교 소식을 전한다. 학생들은 방송을 들으며 필요한 정보를 확인한다.'","학교 방송은 학생들에게 필요한 정보를 전한다",["학교 방송은 학생들에게 필요한 정보를 전한다","방송부는 급식을 직접 만든다","학생들은 방송을 들을 수 없다","학교 소식은 점심시간과 관계없다"]],
    ["독해","다음 글에서 알 수 있는 사실은? '서연이는 식물 관찰일지를 쓰기 위해 매주 월요일 화분의 높이와 잎 수를 기록했다.'","서연이는 정해진 날에 식물의 변화를 기록했다",["서연이는 정해진 날에 식물의 변화를 기록했다","서연이는 화분에 물을 주지 않았다","식물의 잎 수는 늘 같았다","관찰일지는 하루만 썼다"]],
    ["독해","다음 글의 중심 내용은? '자전거를 타기 전에는 브레이크가 잘 작동하는지 확인하고, 어두운 곳에서는 밝은 옷이나 반사 장치를 사용하는 것이 안전하다.'","자전거를 탈 때는 안전을 위한 준비가 필요하다",["자전거를 탈 때는 안전을 위한 준비가 필요하다","자전거는 어두운 곳에서만 타야 한다","브레이크는 확인할 필요가 없다","밝은 옷은 자전거와 관계없다"]],
    ["독해","다음 안내의 목적으로 가장 알맞은 것은? '체육관 공사로 이번 주 농구 동아리 활동 장소를 운동장으로 변경합니다.'","활동 장소가 바뀌었음을 알리기 위해",["활동 장소가 바뀌었음을 알리기 위해","농구 규칙을 설명하기 위해","체육관을 소개하기 위해","동아리를 없애기 위해"]],
    ["어휘","'협력하다'의 뜻으로 가장 알맞은 것은?","힘을 합하여 함께 일하다",["힘을 합하여 함께 일하다","혼자 모든 일을 맡다","서로의 일을 방해하다","하던 일을 바로 그만두다"]],
    ["어휘","'구체적이다'의 뜻으로 가장 알맞은 것은?","내용이 실제적이고 자세하다",["내용이 실제적이고 자세하다","뜻이 전혀 드러나지 않는다","매우 짧아서 내용이 없다","소리만 크고 뜻이 없다"]],
    ["어휘","'보완하다'의 뜻으로 알맞은 것은?","부족한 부분을 보태어 채우다",["부족한 부분을 보태어 채우다","완성된 것을 모두 없애다","아무 변화 없이 그대로 두다","서로 다른 것을 무조건 바꾸다"]],
    ["어휘","'관찰하다'의 뜻으로 가장 알맞은 것은?","대상을 자세히 살펴보다",["대상을 자세히 살펴보다","대상을 보지 않고 짐작하다","소리를 크게 내다","내용을 전부 외우다"]],
    ["문법","'작은 새가 나뭇가지에 앉았다.'에서 주어는?","작은 새가",["작은 새가","나뭇가지에","앉았다","작은"]],
    ["문법","'친구가 매우 빠르게 달렸다.'에서 '빠르게'를 꾸며 주는 말은?","매우",["매우","친구가","빠르게","달렸다"]],
    ["문법","다음 중 까닭과 결과가 자연스럽게 이어진 문장은?","비가 많이 와서 운동장이 젖었다.",["비가 많이 와서 운동장이 젖었다.","비가 많이 왔지만 운동장이 젖었다는 까닭이다.","운동장이 젖어서 비가 오기 시작했다.","비가 왔거나 그래서 맑았다."]],
    ["문법","'나는 우산을 챙겼다. 비가 올 것 같았기 때문이다.'에서 뒤 문장의 역할은?","앞 행동의 까닭을 설명한다",["앞 행동의 까닭을 설명한다","앞 행동과 반대되는 내용을 말한다","선택 가능한 두 가지를 제시한다","시간의 순서만 나타낸다"]],
    ["맞춤법","다음 중 바르게 쓴 것은?","반드시 확인하다",["반드시 확인하다","반듯이 확인하다","반드시 확닌하다","반드 시 확인하다"]],
    ["맞춤법","다음 중 바르게 쓴 낱말은?","곰곰이",["곰곰이","곰곰히","곰고미","곰곰 리"]],
    ["맞춤법","띄어쓰기가 바른 문장은?","공책 두 권을 샀다.",["공책 두 권을 샀다.","공책두 권을 샀다.","공책 두권을 샀다.","공책두권을 샀다."]],
    ["맞춤법","다음 중 바르게 쓴 문장은?","왠지 기분이 좋다.",["왠지 기분이 좋다.","웬지 기분이 좋다.","왠 지 기분이 좋다.","웬 지 기분이 좋다."]],
    ["추론","책상 위에 물감과 붓, 물통이 놓여 있고 도화지에는 색칠하다 만 그림이 있다. 가장 자연스러운 짐작은?","누군가 그림을 그리다가 잠시 자리를 비웠다",["누군가 그림을 그리다가 잠시 자리를 비웠다","아무도 미술 활동을 하지 않았다","도화지는 한 번도 사용하지 않았다","물감은 체육 수업에 쓰였다"]],
    ["추론","운동장에 그늘막이 설치되고 학생들이 물병을 자주 마신다. 날씨로 가장 알맞은 짐작은?","날씨가 덥고 햇빛이 강하다",["날씨가 덥고 햇빛이 강하다","눈이 많이 내리고 있다","기온이 매우 낮다","비가 계속 내려 운동장을 쓸 수 없다"]],
    ["추론","도서관 문 앞에 '오늘은 오후 3시에 문을 닫습니다'라는 안내가 붙어 있다. 가장 알맞은 행동은?","필요한 책은 오후 3시 전에 빌린다",["필요한 책은 오후 3시 전에 빌린다","오후 3시 이후에만 방문한다","안내를 무시하고 늦게 간다","도서관이 하루 종일 연다고 생각한다"]],
    ["추론","친구가 발표 순서를 기다리며 손에 든 종이를 여러 번 확인하고 깊게 숨을 쉰다. 친구의 마음으로 알맞은 것은?","긴장되지만 발표를 잘하려고 준비하고 있다",["긴장되지만 발표를 잘하려고 준비하고 있다","발표에 전혀 관심이 없다","발표 내용을 모두 잊고 포기했다","친구들과 놀 생각만 하고 있다"]],
    ["요약","다음 글의 핵심 내용은? '인터넷 자료를 사용할 때는 누가 만든 정보인지, 언제 작성되었는지, 다른 믿을 만한 자료와 내용이 맞는지 확인하는 습관이 필요하다.'","인터넷 정보는 출처와 내용을 확인하며 사용해야 한다",["인터넷 정보는 출처와 내용을 확인하며 사용해야 한다","인터넷에 있는 정보는 모두 정확하다","작성 날짜는 확인할 필요가 없다","자료는 한 곳에서만 찾아야 한다"]],
    ["요약","다음 글의 요약으로 가장 알맞은 것은? '모둠 활동에서는 역할을 나누고 서로의 의견을 들으며, 맡은 일을 끝낸 뒤 진행 상황을 함께 확인하면 더 좋은 결과를 만들 수 있다.'","역할 분담과 소통은 모둠 활동을 원활하게 한다",["역할 분담과 소통은 모둠 활동을 원활하게 한다","모둠 활동은 한 사람이 모두 해야 한다","의견은 서로 듣지 않는 것이 좋다","맡은 일은 확인하지 않아도 된다"]]
  ];

  function subjectRunIndex(){return Math.floor(weekNumberFromAnchor()/2)}
  function cycleKoreanQuestions(bank,r){
    const ordered=shuffle(bank,rng(hash(`${user().user_id||"guest"}|weekly-korean-cycle-v2`))),run=subjectRunIndex(),blockCount=Math.max(1,Math.floor(ordered.length/TOTAL)),epoch=Math.floor(run/blockCount),start=(((run*TOTAL)+(epoch*7))%ordered.length+ordered.length)%ordered.length,out=[];
    for(let i=0;i<TOTAL;i+=1)out.push(ordered[(start+i)%ordered.length]);
    return out;
  }

  function makeMathQuestion(cat,r,variant=null){
    if(cat==="분수·소수"){
      const mode=variant==null?between(r,0,4):(variant+Math.abs(weekNumberFromAnchor()))%5;
      if(mode===0){const a=between(r,8,48)/10,b=between(r,2,19)/10,ans=(a+b).toFixed(1);return q("수학",cat,`주스가 ${a.toFixed(1)}L 있었는데 ${b.toFixed(1)}L를 더 부었습니다. 지금 주스는 모두 몇 L인가요?`,ans,[ans,(a+b+.1).toFixed(1),(Math.max(0,a+b-.1)).toFixed(1),(Math.max(0,a-b)).toFixed(1)],r,"word")}
      if(mode===1){const a=between(r,25,90)/10,b=between(r,5,Math.max(5,Math.floor(a*10)-5))/10,ans=(a-b).toFixed(1);return q("수학",cat,`${a.toFixed(1)}kg의 밀가루 중 ${b.toFixed(1)}kg을 사용했습니다. 남은 밀가루는 몇 kg인가요?`,ans,[ans,(a+b).toFixed(1),(Math.max(0,a-b+.1)).toFixed(1),(Math.max(0,a-b-.1)).toFixed(1)],r,"word")}
      if(mode===2){const d=between(r,4,10),n=between(r,1,d-2),extra=between(r,1,d-n),ans=`${n+extra}/${d}`;return q("수학",cat,`한 판을 ${d}등분한 피자에서 처음 ${n}조각, 나중에 ${extra}조각을 먹었습니다. 먹은 양을 분수로 나타내면?`,ans,[ans,`${n}/${d}`,`${extra}/${d}`,`${d}/${n+extra}`],r,"word")}
      if(mode===3){const d=[4,5,10][between(r,0,2)],n=between(r,1,d-1),ans=(n/d).toFixed(d===10?1:2).replace(/0+$/,'').replace(/\.$/,'');return q("수학",cat,`분수 ${n}/${d}를 소수로 나타내면?`,ans,[ans,(n/d+.1).toFixed(2).replace(/0+$/,'').replace(/\.$/,''),String(n*d),`${d}/${n}`],r)}
      const whole=between(r,2,7),d=between(r,3,8),n=between(r,1,d-1),ans=`${whole} ${n}/${d}`;return q("수학",cat,`${whole*d+n}/${d}를 대분수로 나타내면?`,ans,[ans,`${whole+1} ${n}/${d}`,`${whole} ${d-n}/${d}`,`${n} ${whole}/${d}`],r)
    }
    if(cat==="비와 비율"){
      const mode=variant==null?between(r,0,3):(variant+Math.abs(weekNumberFromAnchor()))%4;
      if(mode===0){const totals=[20,40,50,80],total=totals[between(r,0,totals.length-1)],rates=[20,25,40,50,60,75,80],rate=rates[between(r,0,rates.length-1)],part=total*rate/100,ans=`${rate}%`;return q("수학",cat,`동아리 학생 ${total}명 중 ${part}명이 발표에 참여했습니다. 참여한 학생의 비율은 몇 %인가요?`,ans,percentChoices(ans,r),r,"word")}
      if(mode===1){const total=[20,40,50,100][between(r,0,3)],rate=[10,20,25,30,40,50,60][between(r,0,6)],ans=String(total*rate/100);return q("수학",cat,`${total}개의 구슬 중 ${rate}%가 파란색입니다. 파란 구슬은 몇 개인가요?`,ans,[ans,String(total-rate),String(rate),String(total*rate/100+5)],r,"word")}
      if(mode===2){const pairs=[[2,3],[2,5],[3,4],[3,5],[4,5],[5,6]],pair=pairs[between(r,0,pairs.length-1)],a=pair[0],b=pair[1],k=between(r,2,5),ans=`${a}:${b}`;return q("수학",cat,`빨간 블록 ${a*k}개와 파란 블록 ${b*k}개의 수를 가장 간단한 비로 나타내면?`,ans,[ans,`${a*k}:${b*k}`,`${b}:${a}`,`${a+b}:${b}`],r,"word")}
      const original=between(r,4,9)*1000,discount=[10,20,25][between(r,0,2)],ans=String(original*(100-discount)/100);return q("수학",cat,`${original}원인 물건을 ${discount}% 할인합니다. 할인된 가격은 얼마인가요?`,ans,[ans,String(original*discount/100),String(original-discount),String(original*(100-discount)/100+500)],r,"word")
    }
    if(cat==="도형"){
      const mode=variant==null?between(r,0,4):(variant+Math.abs(weekNumberFromAnchor()))%5,w=between(r,4,15),h=between(r,3,12);
      if(mode===0){const ans=String(w*h);return q("수학",cat,`가로 ${w}cm, 세로 ${h}cm인 직사각형 모양 종이의 넓이는 몇 ㎠인가요?`,ans,[ans,String(2*(w+h)),String(w+h),String(w*h+h)],r,"word")}
      if(mode===1){const ans=String(2*(w+h));return q("수학",cat,`가로 ${w}m, 세로 ${h}m인 직사각형 화단 둘레에 끈을 한 바퀴 두르려고 합니다. 필요한 끈의 길이는 몇 m인가요?`,ans,[ans,String(w*h),String(w+h),String(2*w+h)],r,"word")}
      if(mode===2){const side=between(r,4,14),ans=String(side*side);return q("수학",cat,`한 변의 길이가 ${side}cm인 정사각형의 넓이는 몇 ㎠인가요?`,ans,[ans,String(side*4),String(side*2),String(side*side+side)],r,"word")}
      if(mode===3){const base=between(r,4,16)*2,height=between(r,3,10),ans=String(base*height/2);return q("수학",cat,`밑변 ${base}cm, 높이 ${height}cm인 삼각형의 넓이는 몇 ㎠인가요?`,ans,[ans,String(base*height),String(base+height),String(base*height/2+height)],r,"word")}
      const side=between(r,3,10),count=between(r,2,5),ans=String(side*count);return q("수학",cat,`한 변이 ${side}cm인 정사각형 ${count}개를 겹치지 않게 한 줄로 이어 붙였습니다. 전체 가로 길이는 몇 cm인가요?`,ans,[ans,String(side+count),String(side*count*2),String(side*side)],r,"word")
    }
    if(cat==="자료 해석"){
      let vals=[between(r,20,95),between(r,20,95),between(r,20,95),between(r,20,95)];while(new Set(vals).size<4)vals=[between(r,20,95),between(r,20,95),between(r,20,95),between(r,20,95)];
      const mode=variant==null?between(r,0,3):(variant+Math.abs(weekNumberFromAnchor()))%4,max=Math.max(...vals),min=Math.min(...vals),sum=vals.reduce((a,b)=>a+b,0);
      if(mode===0){const ans=String(vals.indexOf(max)+1);return q("수학",cat,`1~4모둠의 재활용품 수가 차례로 ${vals.join(", ")}개입니다. 가장 많이 모은 모둠은 몇 모둠인가요?`,ans,["1","2","3","4"],r,"word")}
      if(mode===1){const ans=String(max-min);return q("수학",cat,`네 모둠의 독서 기록이 ${vals.join(", ")}권입니다. 가장 많은 기록과 가장 적은 기록의 차이는 몇 권인가요?`,ans,[ans,String(max),String(min),String(max-min+5)],r,"word")}
      if(mode===2){const ans=String(sum);return q("수학",cat,`월~목요일에 모은 우유갑 수가 각각 ${vals.join(", ")}개입니다. 나흘 동안 모두 몇 개를 모았나요?`,ans,[ans,String(max),String(sum-min),String(sum+10)],r,"word")}
      const even=[20,30,40,50,60,70,80,90],data=shuffle(even,r).slice(0,4),avg=data.reduce((a,b)=>a+b,0)/4,ans=String(avg);return q("수학",cat,`네 번의 기록이 ${data.join(", ")}점입니다. 평균은 몇 점인가요?`,ans,[ans,String(Math.max(...data)),String(Math.min(...data)),String(avg+5)],r,"word")
    }
    const mode=variant==null?between(r,0,6):(variant+Math.abs(weekNumberFromAnchor()))%7;
    if(mode===0){const price=between(r,2,9)*500,count=between(r,2,6),paid=Math.ceil(price*count/5000)*5000,ans=String(paid-price*count);return q("수학",cat,`${price}원짜리 공책 ${count}권을 사고 ${paid}원을 냈습니다. 거스름돈은 얼마인가요?`,ans,[ans,String(price*count),String(paid-price),String(Math.max(0,paid-price*count-500))],r,"word")}
    if(mode===1){const per=between(r,3,8),boxes=between(r,2,6),used=between(r,1,per*boxes-1),ans=String(per*boxes-used);return q("수학",cat,`한 상자에 귤이 ${per}개씩 든 상자가 ${boxes}개 있습니다. 그중 ${used}개를 먹었다면 남은 귤은 몇 개인가요?`,ans,[ans,String(per*boxes),String(used),String(per+boxes-used)],r,"word")}
    if(mode===2){const each=between(r,4,9)*100,people=between(r,3,7),ans=String(each*people);return q("수학",cat,`한 사람에게 ${each}원씩 간식비를 나누어 주려고 합니다. ${people}명에게 필요한 돈은 모두 얼마인가요?`,ans,[ans,String(each+people),String(each*(people-1)),String(each*people+100)],r,"word")}
    if(mode===3){const speed=between(r,3,8)*10,time=between(r,2,4),distance=speed*time,ans=String(speed);return q("수학",cat,`자전거를 타고 ${time}시간 동안 ${distance}km를 같은 빠르기로 이동했습니다. 한 시간에 몇 km씩 이동한 셈인가요?`,ans,[ans,String(distance),String(distance-time),String(speed+10)],r,"word")}
    if(mode===4){const total=between(r,5,12)*6,groups=[2,3,4,6][between(r,0,3)],ans=String(total/groups);return q("수학",cat,`학생 ${total}명을 ${groups}개 모둠에 똑같이 나누면 한 모둠은 몇 명인가요?`,ans,[ans,String(total-groups),String(total/groups+groups),String(groups)],r,"word")}
    if(mode===5){const start=between(r,7,10),duration=between(r,25,55),hourAdd=Math.floor((duration)/60),minute=(duration)%60,ans=`${start+hourAdd}시 ${String(minute).padStart(2,'0')}분`;return q("수학",cat,`오전 ${start}시 00분에 시작한 활동을 ${duration}분 동안 했습니다. 끝난 시각은?`,ans,[ans,`${start}시 ${String(duration).padStart(2,'0')}분`,`${start+1}시 00분`,`${start}시 ${String(Math.max(0,duration-10)).padStart(2,'0')}분`],r,"word")}
    const packs=between(r,2,5),per=between(r,6,12),give=between(r,2,Math.min(8,packs*per-1)),ans=String(packs*per-give);return q("수학",cat,`색종이가 한 묶음에 ${per}장씩 ${packs}묶음 있습니다. 친구에게 ${give}장을 주면 몇 장이 남나요?`,ans,[ans,String(packs*per),String(give),String(packs+per-give)],r,"word")
  }

  function makeKoreanGeneratedQuestion(cat,r,variant=0){
    const names=["민서","지우","서연","도윤","하린","민준","수아","현우","채원","예준","지민","유나"];
    const places=["도서관","과학실","운동장","미술실","학교 텃밭","체육관","교실","박물관","생태 공원","마을 도서관"];
    const pick=a=>a[between(r,0,a.length-1)],name=pick(names),place=pick(places),mode=Math.abs(Number(variant)||0);
    if(cat==="독해"){
      const activities=[
        ["식물의 키와 잎 수를 기록했다","식물의 변화를 꾸준히 관찰했다"],["빌린 책의 반납 날짜를 확인했다","책을 제때 돌려주려고 했다"],
        ["발표 자료의 출처와 작성 날짜를 확인했다","자료가 믿을 만한지 살폈다"],["운동 전에 준비 운동을 하고 물을 챙겼다","안전하게 운동할 준비를 했다"],
        ["분리배출 표시를 보고 쓰레기를 종류별로 나누었다","올바르게 분리배출했다"],["모둠 친구들의 의견을 메모하고 공통점을 정리했다","여러 의견을 비교해 정리했다"],
        ["비가 올 가능성을 확인한 뒤 우산을 챙겼다","날씨에 맞게 준비했다"],["체험학습 안내문에서 시간과 준비물을 표시했다","필요한 정보를 미리 확인했다"]
      ],pair=pick(activities);
      if(mode%3===0)return q("국어",cat,`${name}는 ${place}에서 ${pair[0]}. 이 글에서 알 수 있는 것은?`,pair[1],[pair[1],"아무 준비 없이 활동했다","활동 내용을 전혀 확인하지 않았다","약속된 규칙을 무시했다"],r,"passage");
      if(mode%3===1)return q("국어",cat,`다음 글의 중심 내용은? '${name}는 ${pair[0]}. 이후 필요한 일을 빠뜨리지 않고 처리했다.'`,pair[1],[pair[1],"활동은 준비할 필요가 없다","기록은 내용을 이해하는 데 방해가 된다","안내는 확인하지 않아도 된다"],r,"passage");
      return q("국어",cat,`'${name}는 ${pair[0]}.'에서 ${name}의 행동을 가장 잘 설명한 것은?`,pair[1],[pair[1],"계획 없이 행동했다","해야 할 일을 피했다","다른 사람의 일을 방해했다"],r,"passage");
    }
    if(cat==="어휘"){
      const vocab=[
        ["성실하다","맡은 일을 꾸준하고 책임감 있게 하다"],["협력하다","힘을 합하여 함께 일하다"],["간결하다","짧고 분명하다"],["구체적이다","내용이 실제적이고 자세하다"],
        ["보완하다","부족한 부분을 보태어 채우다"],["관찰하다","대상을 자세히 살펴보다"],["예상하다","앞으로 일어날 일을 미리 생각하다"],["근거","주장이나 판단을 뒷받침하는 까닭"],
        ["갈등","생각이나 마음이 맞지 않아 부딪히는 상태"],["대조하다","둘 이상의 차이점을 비교하여 살피다"],["요약하다","중요한 내용을 간추려 짧게 나타내다"],["분석하다","내용을 나누어 관계와 특징을 자세히 살피다"],
        ["배려하다","다른 사람의 처지나 마음을 생각해 돌보다"],["검토하다","내용에 잘못이나 빠진 점이 없는지 살피다"],["분류하다","공통된 특징에 따라 나누다"],["추론하다","주어진 정보를 바탕으로 알 수 있는 내용을 짐작하다"],
        ["설득하다","까닭과 근거를 들어 상대가 동의하도록 하다"],["인용하다","다른 사람의 말이나 글을 가져와 쓰다"],["존중하다","가치와 의견을 소중하게 여기다"],["실천하다","생각하거나 계획한 일을 실제로 행하다"]
      ],item=vocab[(mode+between(r,0,vocab.length-1))%vocab.length],wrong=shuffle(vocab.filter(x=>x!==item).map(x=>x[1]),r).slice(0,3);
      return q("국어",cat,`'${item[0]}'의 뜻으로 가장 알맞은 것은?`,item[1],[item[1],...wrong],r);
    }
    if(cat==="문법"){
      const nouns=["민지가","지우가","서연이가","도윤이가","고양이가","학생들이","선생님이","동생이"],objects=["책을","공을","편지를","그림을","자료를","화분을","창문을","문제를"],verbs=["읽었다","찼다","썼다","그렸다","정리했다","옮겼다","열었다","풀었다"],idx=between(r,0,nouns.length-1),sub=nouns[idx],obj=objects[idx],verb=verbs[idx];
      if(mode%4===0)return q("국어",cat,`'${sub} ${obj} ${verb}'에서 주어는?`,sub,[sub,obj,verb,`${obj} ${verb}`],r);
      if(mode%4===1)return q("국어",cat,`'${sub} ${obj} ${verb}'에서 목적어는?`,obj,[sub,obj,verb,`${sub} ${verb}`],r);
      if(mode%4===2){const adverbs=["천천히","빠르게","조용히","꼼꼼히","힘차게","차분히"],adv=pick(adverbs);return q("국어",cat,`'${sub} ${adv} ${verb}'에서 행동의 모습을 꾸며 주는 말은?`,adv,[adv,sub,verb,obj],r)}
      return q("국어",cat,"다음 중 높임 표현이 자연스러운 문장은?","할머니께서 진지를 드십니다.",["할머니께서 진지를 드십니다.","할머니가 진지를 먹어.","할머니께서 밥을 먹는다.","할머니가 진지를 먹는다."],r);
    }
    if(cat==="맞춤법"){
      const forms=[
        ["웬일이야",["왠일이야","웬일이야","웬 일이야","왠 일이야"]],["며칠",["몇일","며칠","몃일","몇 칠"]],["금세",["금새","금세","금 쎄","금쌔"]],
        ["깨끗이",["깨끗히","깨끗이","깨끄시","깨끗 이"]],["곰곰이",["곰곰히","곰곰이","곰고미","곰곰 이"]],["왠지",["웬지","왠지","왠 지","웬 지"]],
        ["오랜만",["오랫만","오랜만","오랜 만","오랫 만"]],["어쨌든",["어쨋든","어쨌든","어째든","어쨌던"]],["설렘",["설레임","설렘","설램","설 렘"]],
        ["되도록",["돼도록","되도록","되도 록","됄도록"]],["반드시",["반듯이","반드시","반드 시","반듯히"]],["어이없다",["어의없다","어이없다","어이 업다","어의 업다"]],
        ["할 수 있다",["할수 있다","할 수있다","할 수 있다","할수있다"]],["두 번째",["두번째","두 번째","두번 째","둘 번째"]],["먹어 본 적",["먹어본 적","먹어 본적","먹어 본 적","먹어본적"]]
      ],item=forms[(mode+between(r,0,forms.length-1))%forms.length],wrong=item[1].find(x=>x!==item[0])||item[1][0];return q("국어",cat,`‘${wrong}’을 바르게 고친 것은?`,item[0],item[1],r);
    }
    if(cat==="추론"){
      const scenarios=[
        ["운동장 바닥이 젖어 있고 학생들이 우산을 접고 건물 안으로 들어온다","비가 왔거나 조금 전까지 내렸다"],
        ["친구가 발표 순서를 기다리며 원고를 여러 번 읽고 깊게 숨을 쉰다","발표를 앞두고 긴장하면서 준비하고 있다"],
        ["화분의 흙이 바싹 말라 있고 잎이 축 늘어져 있다","식물이 물이 필요한 상태일 수 있다"],
        ["도서관 입구에 오늘은 오후 3시에 문을 닫는다는 안내가 붙어 있다","필요한 책은 오후 3시 전에 빌리는 것이 좋다"],
        ["교실 창문이 열려 있고 커튼이 크게 흔들린다","바람이 강하게 불고 있다"],
        ["책상 위에 붓과 물감이 놓여 있고 도화지에는 색칠하다 만 그림이 있다","누군가 그림을 그리다가 잠시 자리를 비웠다"],
        ["버스 정류장에 평소보다 긴 줄이 있고 도착 예정 시간이 계속 늦춰진다","버스를 오래 기다릴 가능성이 있다"],
        ["운동장에 그늘막이 설치되고 학생들이 물을 자주 마신다","날씨가 덥고 햇빛이 강할 가능성이 있다"]
      ],item=scenarios[(mode+between(r,0,scenarios.length-1))%scenarios.length];return q("국어",cat,`${item[0]}. 가장 자연스럽게 짐작할 수 있는 것은?`,item[1],[item[1],"상황과 관계없는 일이 곧 일어난다","아무런 변화도 없다고 단정할 수 있다","주어진 정보와 반대되는 상황이다"],r,"passage");
    }
    const summaries=[
      ["우리 반은 종이 사용을 줄이려고 이면지를 모아 쓰고 안내문은 가능한 전자 문서로 확인한다","우리 반은 종이 사용을 줄이는 방법을 실천한다"],
      ["충분히 잠을 자면 피로가 풀리고 다음 날 집중하는 데 도움이 되며 일정한 시간에 자고 일어나는 습관도 중요하다","규칙적으로 충분히 자는 것은 건강과 집중에 도움이 된다"],
      ["인터넷 자료는 누가 만들었는지와 작성 날짜를 살피고 다른 믿을 만한 자료와 비교해 확인해야 한다","인터넷 정보는 출처와 내용을 확인하며 사용해야 한다"],
      ["모둠 활동에서는 역할을 나누고 서로 의견을 들으며 맡은 일을 끝낸 뒤 진행 상황을 함께 확인하는 것이 좋다","역할 분담과 소통은 모둠 활동을 원활하게 한다"],
      ["자전거를 타기 전에는 브레이크를 확인하고 보호 장비를 착용하며 어두운 곳에서는 잘 보이는 옷을 입는 것이 안전하다","자전거를 탈 때는 안전을 위한 준비가 필요하다"],
      ["도서관에서는 조용히 책을 읽고 빌린 책은 정해진 날짜에 돌려주며 깨끗하게 사용해야 한다","도서관 책을 이용할 때 지켜야 할 예절이 있다"],
      ["식물을 건강하게 기르려면 알맞은 양의 물과 햇빛을 주고 잎과 흙의 상태를 꾸준히 살펴야 한다","식물은 알맞은 환경을 마련하고 꾸준히 관찰해야 잘 자란다"],
      ["규칙적인 운동은 체력을 기르는 데 도움이 되지만 몸 상태에 맞게 하고 운동 전후에 준비와 정리 운동을 해야 한다","운동은 몸 상태를 고려해 안전하게 꾸준히 해야 한다"]
    ],item=summaries[(mode+between(r,0,summaries.length-1))%summaries.length];return q("국어","요약",`다음 글의 핵심 내용을 가장 잘 요약한 것은? '${item[0]}.'`,item[1],[item[1],"글의 일부 내용만 지나치게 강조한다","글의 내용과 반대되는 행동을 권한다","글에서 다루지 않은 내용을 중심으로 말한다"],r,"passage");
  }

  function makeGeneratedKoreanQuestions(){
    const cats=["독해","어휘","문법","맞춤법","추론","요약"],pool=[],seen=new Set(),orderR=rng(hash(`${user().user_id||"guest"}|weekly-korean-generated-pool-v7`));let guard=0;
    while(pool.length<520&&guard<30000){guard+=1;const cat=cats[guard%cats.length],item=makeKoreanGeneratedQuestion(cat,orderR,guard),key=`${item.text}|${item.answer}`;if(seen.has(key))continue;seen.add(key);pool.push(item)}
    const run=subjectRunIndex(),start=(((run*TOTAL)%pool.length)+pool.length)%pool.length,rows=[];
    for(let i=0;i<TOTAL;i+=1)rows.push(pool[(start+i)%pool.length]);
    return rows;
  }

  function makeQuestions(version=QUESTION_SET_VERSION){
    const subject=missionSubject(),legacy=version==="v4",previous=version==="v5",previous6=version==="v6",seedVersion=legacy?"v4":previous?"v5":previous6?"v6":"v7",r=rng(hash(`${weekKey()}|${user().user_id||"guest"}|grade6-worksheet-${seedVersion}|${subject}`)),rows=[];
    if(subject==="수학"){
      const cats=[];for(const cat of mathCats)for(let i=0;i<4;i++)cats.push({cat,variant:i});
      shuffle(cats,r).forEach(item=>rows.push(legacy?makeMathQuestionV4(item.cat,r):makeMathQuestion(item.cat,r,item.variant)));
    }else if(!legacy&&!previous&&!previous6){
      rows.push(...makeGeneratedKoreanQuestions());
    }else{
      const bank=legacy?korBank:previous?korBank.concat(korExtra):korBank.concat(korExtra,korCycleExtra),selected=(legacy||previous)?shuffle(bank,r).slice(0,TOTAL):cycleKoreanQuestions(bank,r);
      selected.forEach(([cat,text,ans,choices])=>rows.push(q("국어",cat,text,ans,choices,r,/다음 글|다음 내용|다음 문장|짐작|요약|안내문/.test(text)?"passage":"short")));
    }
    return rows.slice(0,TOTAL).map((x,i)=>({...x,id:`q${i+1}`}));
  }

  function answerMap(saved){const map={};for(const item of Array.isArray(saved?.answers)?saved.answers:[]){if(item?.id&&item.answer!=null)map[item.id]=String(item.answer)}return map}
  function serializeAnswers(questions,selections){return questions.filter(item=>selections[item.id]!=null).map(item=>({id:item.id,subject:item.subject,category:item.category,correct:String(selections[item.id])===String(item.answer),answer:String(selections[item.id]),correctAnswer:String(item.answer),question:String(item.text||""),format:item.format||"short"}))}
  async function saveDraft(questions,selections,setVersion=QUESTION_SET_VERSION){
    const answers=serializeAnswers(questions,selections),key=path();
    return MiniTalk.Realtime.cloudTransaction(key,current=>{
      if(current?.completed)return current;
      return{week:weekKey(),subject:missionSubject(),questionSetVersion:setVersion,index:answers.length,answers,completed:false,updatedAt:nowMs()}
    })
  }
  function scheduleDraftSave(questions,selections,setVersion=QUESTION_SET_VERSION){
    clearTimeout(draftTimer);draftTimer=setTimeout(()=>{draftPromise=saveDraft(questions,selections,setVersion).catch(error=>console.warn("주간 미션 임시저장 실패",error))},350)
  }
  async function flushDraft(questions,selections,setVersion=QUESTION_SET_VERSION){clearTimeout(draftTimer);draftTimer=0;await draftPromise.catch(()=>{});return saveDraft(questions,selections,setVersion)}

  function node(doc,tag,attrs={},children=[]){
    const el=doc.createElement(tag);
    for(const [key,value] of Object.entries(attrs||{})){
      if(value==null)continue;
      if(key==="class")el.className=value;else if(key==="text")el.textContent=value;else if(key==="html")el.innerHTML=value;else if(key==="onclick")el.onclick=value;else if(key==="style")el.setAttribute("style",value);else if(key in el&&typeof value!=="object")try{el[key]=value}catch{el.setAttribute(key,String(value))}else el.setAttribute(key,String(value));
    }
    for(const child of Array.isArray(children)?children:[children])if(child!=null)el.append(child.nodeType?child:doc.createTextNode(String(child)));
    return el
  }
  function desktopWorksheet(){return !(MiniTalk.MobileImmersive?.isMobile?.())&&(window.innerWidth>=760||window.matchMedia?.("(pointer:fine)")?.matches)}
  function popupBounds(){
    // PiP/팝업 안에서 실행 중이면 현재 메신저가 실제로 떠 있는 창을 기준으로 계산한다.
    // 원래 탭 window 좌표를 쓰면 주간미션 시험지가 메신저 옆에 달라붙거나 겹칠 수 있다.
    const sourceView=MiniTalk.UI.Dom.doc()?.defaultView||window,scr=sourceView.screen||{},availLeft=Number(scr.availLeft)||0,availTop=Number(scr.availTop)||0,availW=Math.max(640,Number(scr.availWidth)||1200),availH=Math.max(520,Number(scr.availHeight)||850);
    const messengerLeft=Number(sourceView.screenX??sourceView.screenLeft)||availLeft,messengerTop=Number(sourceView.screenY??sourceView.screenTop)||availTop,messengerW=Math.max(320,Number(sourceView.outerWidth)||Math.min(520,availW*.42)),messengerH=Math.max(420,Number(sourceView.outerHeight)||availH*.8);
    const gap=42,rightStart=Math.min(availLeft+availW,messengerLeft+messengerW+gap),rightSpace=Math.max(0,(availLeft+availW)-rightStart),leftSpace=Math.max(0,messengerLeft-gap-availLeft),bottomStart=Math.min(availTop+availH,messengerTop+messengerH+gap),bottomSpace=Math.max(0,(availTop+availH)-bottomStart),topSpace=Math.max(0,messengerTop-gap-availTop);
    const desiredW=Math.min(1180,Math.max(720,Math.round(availW*.66))),desiredH=Math.min(900,Math.max(600,Math.round(availH*.86))),minSideW=Math.min(620,Math.max(480,Math.round(availW*.34)));
    let width,height,left,top;
    if(Math.max(rightSpace,leftSpace)>=minSideW){const useRight=rightSpace>=leftSpace;const sideSpace=useRight?rightSpace:leftSpace;width=Math.min(desiredW,sideSpace);height=Math.min(desiredH,availH-24);left=useRight?rightStart:messengerLeft-gap-width;top=Math.max(availTop+8,Math.min(messengerTop,availTop+availH-height-8));}
    else if(Math.max(bottomSpace,topSpace)>=420){const useBottom=bottomSpace>=topSpace;width=Math.min(desiredW,availW-24);height=Math.min(desiredH,useBottom?bottomSpace:topSpace);left=Math.max(availLeft+8,Math.min(messengerLeft,availLeft+availW-width-8));top=useBottom?bottomStart:messengerTop-gap-height;}
    else{width=Math.min(Math.max(620,Math.round(availW*.58)),availW-24);height=Math.min(desiredH,availH-24);const messengerCenter=messengerLeft+messengerW/2,screenCenter=availLeft+availW/2;left=messengerCenter<=screenCenter?availLeft+availW-width-8:availLeft+8;top=Math.max(availTop+8,Math.min(messengerTop,availTop+availH-height-8));}
    return{width:Math.round(Math.max(480,width)),height:Math.round(Math.max(520,height)),left:Math.round(left),top:Math.round(top)}
  }
  function popupFeatures(){const b=popupBounds();return`popup=yes,toolbar=no,location=no,menubar=no,status=no,scrollbars=yes,resizable=yes,width=${b.width},height=${b.height},left=${b.left},top=${b.top}`}
  function enforcePopupBounds(win){const b=popupBounds(),apply=()=>{try{win.resizeTo(b.width,b.height);win.moveTo(b.left,b.top)}catch{}};apply();setTimeout(apply,80);setTimeout(apply,260)}
  function preparePopup(){
    try{if(worksheetWindow&&!worksheetWindow.closed){worksheetWindow.focus();return worksheetWindow}}catch{worksheetWindow=null}
    let win=null;try{win=window.open("","MoaruWeeklyWorksheet",popupFeatures())}catch{}
    if(!win)return null;worksheetWindow=win;enforcePopupBounds(win);
    const base=new URL("./",location.href).href,doc=win.document;
    doc.open();doc.write(`<!doctype html><html lang="ko" data-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><base href="${base}"><title>모아루 주간 학습점검</title><link rel="stylesheet" href="css/tokens.css?v=7"><link rel="stylesheet" href="css/app.css?v=64.5.11"><link rel="stylesheet" href="css/features/math-quest.css?v=23"><link rel="stylesheet" href="css/features/feed-classinfo-weekly.css?v=65.0.26"></head><body class="weekly-exam-popup"><main id="weeklyExamRoot" class="weekly-exam-root"></main></body></html>`);doc.close();enforcePopupBounds(win);
    win.addEventListener("pagehide",()=>{if(worksheetWindow===win)worksheetWindow=null},{once:true});try{win.focus()}catch{}return win
  }
  function closeWorksheet(){try{if(worksheetWindow&&!worksheetWindow.closed)worksheetWindow.close()}catch{}worksheetWindow=null;try{window.focus()}catch{}}

  function renderWorksheet(doc,host,questions,selections,onSubmit,setVersion=QUESTION_SET_VERSION){
    const subject=missionSubject(),answered=()=>Object.keys(selections).filter(id=>selections[id]!=null).length;
    const count=node(doc,"strong",{class:"weekly-exam-count",text:`${answered()} / ${TOTAL} 답변`});
    const status=node(doc,"span",{class:"weekly-exam-save muted",text:"선택한 답은 자동 저장됩니다."});
    const sheet=node(doc,"section",{class:"weekly-exam-sheet"});
    function updateCount(){count.textContent=`${answered()} / ${TOTAL} 답변`}
    questions.forEach((item,index)=>{
      const card=node(doc,"article",{class:"weekly-exam-question",id:`weekly-${item.id}`});
      const choices=node(doc,"div",{class:"weekly-exam-choices",role:"group","aria-label":`${index+1}번 보기`});
      item.choices.forEach((choice,choiceIndex)=>{
        const button=node(doc,"button",{class:`weekly-exam-choice${selections[item.id]===choice?" selected":""}`,type:"button","aria-pressed":selections[item.id]===choice?"true":"false",onclick:()=>{
          selections[item.id]=choice;choices.querySelectorAll(".weekly-exam-choice").forEach(x=>{const yes=x.dataset.value===choice;x.classList.toggle("selected",yes);x.setAttribute("aria-pressed",yes?"true":"false")});card.classList.remove("missing");updateCount();status.textContent="저장 중…";scheduleDraftSave(questions,selections,setVersion);setTimeout(()=>{if(status.isConnected)status.textContent="선택한 답은 자동 저장됩니다."},650)
        }},[node(doc,"span",{class:"weekly-choice-letter",text:["①","②","③","④"][choiceIndex]}),node(doc,"span",{text:choice})]);
        button.dataset.value=choice;choices.append(button)
      });
      card.append(node(doc,"div",{class:"weekly-question-heading"},[node(doc,"b",{class:"weekly-question-number",text:`${index+1}.`}),node(doc,"span",{class:"weekly-question-category",text:item.category})]),node(doc,"p",{class:`weekly-question-text ${item.format==="word"||item.format==="passage"?"sentence-form":""}`,text:item.text}),choices);sheet.append(card)
    });
    const submit=node(doc,"button",{class:"button primary weekly-exam-submit",type:"button",text:"답안 제출하기",onclick:async()=>{
      const missing=questions.filter(q=>selections[q.id]==null);host.querySelectorAll(".weekly-exam-question.missing").forEach(x=>x.classList.remove("missing"));
      if(missing.length){for(const q of missing)host.querySelector(`#weekly-${q.id}`)?.classList.add("missing");const first=host.querySelector(`#weekly-${missing[0].id}`);first?.scrollIntoView?.({behavior:"smooth",block:"center"});status.textContent=`아직 ${missing.length}문제가 남아 있어요.`;return}
      submit.disabled=true;submit.textContent="제출 중…";try{await flushDraft(questions,selections,setVersion);await onSubmit(serializeAnswers(questions,selections))}catch(error){console.warn("주간 미션 제출 실패",error);submit.disabled=false;submit.textContent="답안 제출하기";status.textContent="제출하지 못했습니다. 다시 눌러주세요."}
    }});
    host.replaceChildren(node(doc,"header",{class:"weekly-exam-header"},[node(doc,"div",{},[node(doc,"div",{class:"friday-mission-eyebrow",text:"주간 미션"}),node(doc,"h1",{text:`초6 ${subject} 학습점검`}),node(doc,"p",{class:"muted",text:`20문항을 모두 펼쳐 보고 풀 수 있어요. 80점 이상이면 주 1회 🪙 +${REWARD_COIN}`})]),node(doc,"div",{class:"weekly-exam-meta"},[count,status])]),sheet,node(doc,"footer",{class:"weekly-exam-footer"},[node(doc,"div",{class:"weekly-exam-footer-copy"},[node(doc,"strong",{text:"답안을 확인한 뒤 제출하세요."}),node(doc,"span",{class:"muted",text:"제출 전에는 언제든 답을 바꿀 수 있어요."})]),submit]));
  }

  async function open(){
    if(user().isGuest)return MiniTalk.UI.Shell.toast("로그인 후 참여할 수 있습니다.");
    const gate=windowInfo();if(!gate.open)return MiniTalk.UI.Shell.toast(`금요일 오전 9시까지 ${remainLabel()} 남았습니다.`);

    // 팝업 차단 방지: PC/웨일북은 사용자 클릭 동기 구간에서 창을 먼저 확보합니다.
    const wantsPopup=desktopWorksheet(),popup=wantsPopup?preparePopup():null;
    if(popup){const loading=popup.document.getElementById("weeklyExamRoot");if(loading)loading.textContent="주간 학습점검 문제를 준비하고 있어요…"}
    else if(wantsPopup)MiniTalk.UI.Shell.toast("별도 창을 열 수 없어 현재 창에서 문제를 보여드려요.");

    let saved;
    try{saved=await MiniTalk.Realtime.cloudGet(path(),null)}catch(error){closeWorksheet();MiniTalk.UI.Shell.toast("저장된 주간 미션을 불러오지 못했습니다. 다시 시도해주세요.");throw error}
    if(saved?.completed){closeWorksheet();const checked=await ensureWeeklyReward(saved);return showReport(checked||saved)}
    const setVersion=saved?.questionSetVersion||(Array.isArray(saved?.answers)&&saved.answers.length?"v4":QUESTION_SET_VERSION),questions=makeQuestions(setVersion),selections=answerMap(saved);
    async function finish(answers){
      if(!windowInfo().open){MiniTalk.UI.Shell.toast("이번 주 학습점검 시간이 끝났습니다.");closeWorksheet();return}
      const report=buildReport(answers,setVersion),record={week:weekKey(),subject:missionSubject(),questionSetVersion:setVersion,index:questions.length,answers,completed:true,report,completedAt:nowMs(),updatedAt:nowMs()};
      const savedFinal=await MiniTalk.Realtime.cloudTransaction(path(),current=>current?.completed?current:{...record,answers});
      const rewarded=await ensureWeeklyReward(savedFinal||record);MiniTalk.UI.Shell.closeModal();closeWorksheet();showReport(rewarded||savedFinal||record)
    }
    if(popup&&!popup.closed){const host=popup.document.getElementById("weeklyExamRoot");renderWorksheet(popup.document,host,questions,selections,finish,setVersion);try{popup.focus()}catch{}return}
    const D=MiniTalk.UI.Dom,body=D.el("div",{class:"weekly-exam-modal"});MiniTalk.UI.Shell.modal("금요일 초6 학습점검",body);renderWorksheet(MiniTalk.UI.Dom.doc(),body,questions,selections,finish,setVersion)
  }

  function scorePercent(record){const r=record?.report||buildReport(record?.answers||[],record?.questionSetVersion||"v4");return r.total?Math.round((Number(r.score)||0)/(Number(r.total)||1)*100):0}
  function rewardEligible(record){return scorePercent(record)>=80}
  async function ensureWeeklyReward(record){
    if(!record?.completed||!rewardEligible(record))return record;
    const currentUser=user();if(!currentUser?.user_id||currentUser.isGuest)return record;
    if(record?.reward?.acknowledged===true){MiniTalk.Economy.CoinWallet?.refresh?.(true).catch(()=>{});return record}
    let lastError=null;
    for(let attempt=0;attempt<2;attempt++){
      try{
        const body=new URLSearchParams({mode:"coin_reward",user_id:String(currentUser.user_id),reward_type:REWARD_TYPE,reward_key:String(record.week||weekKey()),score_percent:String(scorePercent(record))});
        const response=await fetch(MiniTalkConfig.sheetUrl,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded;charset=UTF-8"},body});
        if(!response.ok)throw new Error(`HTTP_${response.status}`);const result=await response.json();
        if(!result||result.ok===false){const error=new Error(result?.error||"주간 보상 요청 실패");error.code=result?.error||"WEEKLY_REWARD_FAILED";throw error}
        const granted=result.applied!==false&&result.granted!==false,reward={eligible:true,amount:REWARD_COIN,acknowledged:true,granted,updatedAt:nowMs()};
        const saved=await MiniTalk.Realtime.cloudTransaction(path(),current=>current?.completed?{...current,reward}:current),nextCoin=Number(result.newCoin);
        if(Number.isFinite(nextCoin))MiniTalk.Economy.CoinWallet?.setLocal?.(nextCoin,"friday-weekly-reward");else await MiniTalk.Economy.CoinWallet?.refresh?.(true).catch(()=>{});
        if(granted)MiniTalk.UI.Shell.toast(`금요일 학습점검 보상 · 코인 ${REWARD_COIN}개 적립!`);return saved||{...record,reward}
      }catch(error){lastError=error;const retryable=attempt===0&&(error?.code==="COIN_BUSY"||error?.code==="COIN_SHEET_TEMPORARY_ERROR"||/^HTTP_5\d\d$/.test(String(error?.message||""))||error instanceof TypeError);if(!retryable)break;await new Promise(resolve=>setTimeout(resolve,450))}
    }
    console.warn("금요일 학습점검 코인 보상 실패",lastError);MiniTalk.UI.Shell.toast("점검 결과는 저장됐지만 코인 보상 확인이 지연되고 있습니다. 다시 열면 재확인합니다.");return record
  }

  const REPORT_GUIDE={
    "수학 · 분수·소수":{skill:"분수와 소수의 양을 읽고 계산하는 힘",review:"계산 전에 단위를 확인하고, 소수점 자리와 분모가 같은지 차근차근 확인해보세요."},
    "수학 · 비와 비율":{skill:"전체와 부분의 관계를 비율로 바꾸는 힘",review:"전체가 몇인지 먼저 표시한 뒤 ‘부분 ÷ 전체 × 100’을 떠올리면 실수가 줄어요."},
    "수학 · 도형":{skill:"넓이와 둘레에 맞는 식을 구분하는 힘",review:"문제에서 ‘넓이’인지 ‘둘레’인지 먼저 동그라미 치고 공식을 고르세요."},
    "수학 · 자료 해석":{skill:"표나 수치를 비교해 필요한 정보를 찾는 힘",review:"가장 큰 값·가장 작은 값·차이를 문제에서 무엇을 묻는지 먼저 표시하고 계산해보세요."},
    "수학 · 문장제":{skill:"문장 속 조건을 식으로 바꾸는 힘",review:"주어진 수, 해야 할 계산, 마지막에 묻는 것을 세 줄로 나눠 적으면 훨씬 쉬워져요."},
    "국어 · 독해":{skill:"글의 중심 내용과 근거를 찾는 힘",review:"문단마다 ‘누가/무엇을/왜’만 짧게 표시하고 마지막에 공통 내용을 묶어보세요."},
    "국어 · 어휘":{skill:"낱말의 뜻을 문맥에 맞게 구별하는 힘",review:"뜻만 외우기보다 짧은 예문 하나와 반대말·비슷한 말을 같이 묶어 익혀보세요."},
    "국어 · 문법":{skill:"문장 성분과 표현의 역할을 구별하는 힘",review:"누가/무엇을/어찌하다 순서로 문장을 나눠 보고 꾸며 주는 말을 따로 표시해보세요."},
    "국어 · 맞춤법":{skill:"맞춤법과 띄어쓰기를 정확히 적용하는 힘",review:"틀린 표현만 따로 모아 바른 표현과 한 쌍으로 읽고 직접 한 문장씩 써보세요."},
    "국어 · 추론":{skill:"글에 직접 쓰이지 않은 상황을 근거로 짐작하는 힘",review:"짐작하기 전에 글 속 단서 두 개를 먼저 찾고, 그 단서로 설명되는 선택지를 고르세요."},
    "국어 · 요약":{skill:"여러 문장을 핵심 한 문장으로 줄이는 힘",review:"반복되는 핵심 낱말을 찾고 예시·꾸밈말을 빼서 한 문장으로 다시 말해보세요."}
  };
  function answerDetails(answers,version=QUESTION_SET_VERSION){
    const qmap=new Map(makeQuestions(version).map((q,i)=>[q.id,{...q,number:i+1}]));
    return (Array.isArray(answers)?answers:[]).map((a,i)=>{const q=qmap.get(a.id)||{};return{...a,number:q.number||i+1,question:a.question||q.text||"문제 내용을 다시 열어 확인해보세요.",correctAnswer:a.correctAnswer!=null?String(a.correctAnswer):String(q.answer??""),answer:a.answer!=null?String(a.answer):"",subject:a.subject||q.subject||missionSubject(),category:a.category||q.category||"기타"}})
  }
  function buildReport(answers,version=QUESTION_SET_VERSION){
    const details=answerDetails(answers,version),groups={};
    details.forEach(a=>{const key=`${a.subject} · ${a.category}`,g=groups[key]||(groups[key]={correct:0,total:0,wrong:[]});g.total++;if(a.correct)g.correct++;else g.wrong.push(a)});
    const rows=Object.entries(groups).map(([name,g])=>({name,...g,rate:Math.round(g.correct/g.total*100),guide:REPORT_GUIDE[name]||{skill:"해당 영역의 핵심 개념을 적용하는 힘",review:"틀린 문제를 다시 풀며 어떤 조건을 놓쳤는지 확인해보세요."}})).sort((a,b)=>a.rate-b.rate||a.name.localeCompare(b.name)),score=details.filter(a=>a.correct).length;
    const strong=[...rows].filter(x=>x.rate>=75).sort((a,b)=>b.rate-a.rate).slice(0,3);
    const weak=[...rows].filter(x=>x.rate<100).sort((a,b)=>a.rate-b.rate).slice(0,3);
    return{score,total:details.length,rows,strong,weak,wrong:details.filter(a=>!a.correct)}
  }
  function feedbackLine(row,strong=false){
    const label=row.name.replace(/^수학 · |^국어 · /,"");
    if(strong){if(row.rate===100)return`${label}: ${row.total}문제를 모두 맞혔어요. ${row.guide.skill}이 안정적이에요.`;if(row.rate>=75)return`${label}: ${row.correct}/${row.total}문제를 맞혔어요. ${row.guide.skill}이 잘 잡혀 있어요.`;return`${label}: 이번 점검에서 상대적으로 가장 잘한 영역이에요. ${row.correct}/${row.total}문제를 맞혔고, 틀린 문제를 한 번 더 확인하면 좋아요.`}
    return`${label}: ${row.wrong.length}문제를 틀렸어요. ${row.guide.review}`
  }
  function wrongReviewCard(D,item){
    const detail=D.el("div",{class:"friday-wrong-detail"},[
      D.el("p",{class:"friday-wrong-question",text:item.question}),
      D.el("div",{class:"friday-answer-compare"},[
        D.el("div",{class:"friday-answer-box mine"},[D.el("span",{text:"내 답"}),D.el("b",{text:item.answer||"답 없음"})]),
        D.el("div",{class:"friday-answer-box correct"},[D.el("span",{text:"정답"}),D.el("b",{text:item.correctAnswer||"확인 필요"})])
      ]),
      D.el("p",{class:"friday-wrong-tip",text:(REPORT_GUIDE[`${item.subject} · ${item.category}`]||{}).review||"문제에서 묻는 조건을 다시 표시한 뒤 같은 유형을 한 번 더 풀어보세요."})
    ]);
    const button=D.el("button",{class:"friday-wrong-toggle",type:"button","aria-expanded":"false","data-no-drag-scroll":"true",onclick:()=>{const open=button.getAttribute("aria-expanded")==="true";button.setAttribute("aria-expanded",open?"false":"true");detail.hidden=open;button.querySelector("i").textContent=open?"⌄":"⌃"}},[D.el("span",{},[D.el("b",{text:`${item.number}번 · ${item.category}`}),D.el("small",{class:"muted",text:`내 답 ${item.answer||"답 없음"}`})]),D.el("i",{text:"⌄","aria-hidden":"true"})]);
    detail.hidden=true;return D.el("article",{class:"friday-wrong-item"},[button,detail])
  }
  function showReport(record){
    const D=MiniTalk.UI.Dom,r=buildReport(record.answers||[],record.questionSetVersion||"v4"),percent=r.total?Math.round(r.score/r.total*100):0,eligible=percent>=80,reward=record.reward||{},rewardText=eligible?(reward.acknowledged?`보상 ${REWARD_COIN}코인 · ${reward.granted?"적립 완료":"이미 적립됨"}`:`보상 ${REWARD_COIN}코인 · 적립 확인 중`):`80점 이상이면 보상 ${REWARD_COIN}코인을 받을 수 있어요`;
    const strongRows=r.strong.length?r.strong:r.rows.slice().sort((a,b)=>b.rate-a.rate).slice(0,1),weakRows=r.weak;
    const strongBox=D.el("section",{class:"section-card friday-feedback-card"},[D.el("strong",{text:"잘한 점"}),D.el("div",{class:"friday-feedback-list"},strongRows.map(x=>D.el("p",{text:feedbackLine(x,true)})))]);
    const weakBox=D.el("section",{class:"section-card friday-feedback-card"},[D.el("strong",{text:"보완하면 좋은 점"}),weakRows.length?D.el("div",{class:"friday-feedback-list"},weakRows.map(x=>D.el("p",{text:feedbackLine(x,false)}))):D.el("p",{text:"이번 점검에서는 모든 영역을 100% 맞혔어요. 다음에는 풀이 속도와 실수 없이 설명하는 연습까지 해보면 좋아요."})]);
    const wrongBox=D.el("section",{class:"section-card friday-wrong-review"},[D.el("div",{class:"friday-review-title"},[D.el("strong",{text:"오답 확인"}),D.el("span",{class:"friday-wrong-count",text:`${r.wrong.length}문제`})]),r.wrong.length?D.el("div",{class:"friday-wrong-list"},r.wrong.map(x=>wrongReviewCard(D,x))):D.el("p",{class:"muted",text:"틀린 문제가 없어요. 전부 맞혔습니다!"})]);
    const body=D.el("div",{class:"friday-report modal-stack"},[D.el("div",{class:"friday-complete-mark"},[D.el("img",{class:"quest-complete-stamp",src:"assets/ui/quest-stamp.png",alt:"주간 미션 완료 도장"}),D.el("div",{},[D.el("strong",{text:"이번 주 학습점검 완료"}),D.el("small",{class:"muted",text:"20문항 제출이 완료되어 도장을 받았어요."})])]),D.el("h3",{text:`이번 주 ${record.subject||missionSubject()} · ${r.score}/${r.total}문항 정답 · ${percent}점`}),D.el("section",{class:`friday-reward-card section-card ${eligible?"earned":"missed"}`},[D.el("div",{class:"friday-reward-title"},[D.el("img",{src:"assets/ui/notebook-coin.svg",alt:""}),D.el("strong",{text:eligible?`주간 보상 +${REWARD_COIN}`:"주간 보상"})]),D.el("p",{text:rewardText}),D.el("small",{class:"muted",text:"금요일 학습점검은 80점 이상이면 주 1회 보상됩니다."})]),D.el("div",{class:"friday-bars"},r.rows.map(x=>D.el("div",{class:"friday-bar-row"},[D.el("span",{text:x.name}),D.el("i",{style:`--rate:${x.rate}%`}),D.el("b",{text:`${x.correct}/${x.total}`})]))),strongBox,weakBox,wrongBox]);
    MiniTalk.UI.Shell.modal("이번 주 학습 피드백",body)
  }
  function render(){const D=MiniTalk.UI.Dom,info=windowInfo(),subject=missionSubject(),desktop=desktopWorksheet(),accordion=MiniTalk.Tasks.QuestAccordion;const restore=D.el("button",{class:"friday-mission-compact-toggle",type:"button","data-no-drag-scroll":"true","aria-label":`금요일 초6 ${subject} 학습점검 펼치기`,onclick:event=>{event.preventDefault();event.stopPropagation();accordion?.activate?.("weekly")}},[D.el("span",{class:"friday-compact-copy"},[D.el("strong",{text:`금요일 초6 ${subject} 학습점검`}),D.el("small",{text:info.open?`20문항 · 80점 이상 · 🪙 +${REWARD_COIN}`:`금요일 ${OPEN_HOUR}시부터 열려요`})]),D.el("span",{class:"friday-compact-arrow",text:"⌄","aria-hidden":"true"})]);const copy=D.el("div",{class:"friday-mission-copy"},[D.el("div",{class:"friday-mission-eyebrow",text:"주간 미션"}),D.el("strong",{text:`금요일 초6 ${subject} 학습점검`}),D.el("div",{class:"friday-mission-meta"},[D.el("span",{text:`${subject} · 20문항`}),D.el("span",{text:"80점 이상"}),D.el("span",{class:"friday-reward-pill"},[D.el("img",{src:"assets/ui/notebook-coin.svg",alt:""}),D.el("b",{text:`+${REWARD_COIN}`})])]),D.el("b",{class:"friday-countdown",text:info.open?"오늘 자정까지 참여할 수 있어요":`열리기까지 ${remainLabel()}`})]);const action=info.open?D.el("div",{class:"friday-mission-action"},[D.el("button",{class:"button primary compact-button friday-start-button",type:"button",text:desktop?"시험지 열기":"시작하기",disabled:user().isGuest,onclick:open})]):D.el("div",{class:"friday-lock-overlay","aria-hidden":"true"},[D.el("span",{text:"🔒"})]);const card=D.el("section",{class:`friday-mission-card section-card ${info.open?"open":"locked"}`,"data-quest-key":"weekly"},[restore,copy,action]);if(!info.open){const label=card.querySelector(".friday-countdown"),timer=setInterval(()=>{if(!card.isConnected)return clearInterval(timer);const next=windowInfo();if(next.open){clearInterval(timer);if(MiniTalk.Store.get("route")==="tasks")MiniTalk.Features.Tasks.render(MiniTalk.UI.Dom.byId("viewHost"));return}label.textContent=`열리기까지 ${remainLabel()}`},30000)}return card}
  return{render,open,windowInfo,makeQuestions,buildReport,weekKey,missionSubject,scorePercent,rewardEligible,ensureWeeklyReward,desktopWorksheet,serializeAnswers};
})();
