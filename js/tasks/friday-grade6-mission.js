/* 금요일 09:00~23:59에만 열리는 초6 격주 과목 20문항 주간 미션.
 * 2026-08-17 주간을 수학 시작점으로 삼아 수학 20문항 ↔ 국어 20문항을 매주 교대합니다.
 * PC/웨일북에서는 시험지처럼 한 화면에 20문항을 펼친 별도 창으로 열고,
 * 모바일에서는 같은 시험지 UI를 앱 모달 안에 표시합니다.
 * 시간 판단과 카운트다운은 사용 중인 기기의 로컬 시간을 기준으로 합니다.
 */
MiniTalk.Tasks=MiniTalk.Tasks||{};
MiniTalk.Tasks.FridayGrade6Mission=(()=>{
  const OPEN_HOUR=9,TOTAL=20,PATH="moaru/v3/fridayMission",REWARD_TYPE="WEEKLY_CHECK_OVER80",REWARD_COIN=3,ALT_ANCHOR_WEEK="2026-08-17";
  const mathCats=["분수·소수","비와 비율","도형","자료 해석","문장제"];
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
  function makeMathQuestion(cat,r){
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

  function makeQuestions(){
    const subject=missionSubject(),r=rng(hash(`${weekKey()}|${user().user_id||"guest"}|grade6-worksheet-v4|${subject}`)),rows=[];
    if(subject==="수학"){
      const cats=[];for(const cat of mathCats)for(let i=0;i<4;i++)cats.push(cat);
      shuffle(cats,r).forEach(cat=>rows.push(makeMathQuestion(cat,r)));
    }else{
      shuffle(korBank,r).slice(0,TOTAL).forEach(([cat,text,ans,choices])=>rows.push(q("국어",cat,text,ans,choices,r,/다음 글|다음 내용|다음 문장|짐작|요약/.test(text)?"passage":"short")));
    }
    return rows.slice(0,TOTAL).map((x,i)=>({...x,id:`q${i+1}`}));
  }

  function answerMap(saved){const map={};for(const item of Array.isArray(saved?.answers)?saved.answers:[]){if(item?.id&&item.answer!=null)map[item.id]=String(item.answer)}return map}
  function serializeAnswers(questions,selections){return questions.filter(item=>selections[item.id]!=null).map(item=>({id:item.id,subject:item.subject,category:item.category,correct:String(selections[item.id])===String(item.answer),answer:String(selections[item.id])}))}
  async function saveDraft(questions,selections){
    const answers=serializeAnswers(questions,selections),key=path();
    return MiniTalk.Realtime.cloudTransaction(key,current=>{
      if(current?.completed)return current;
      return{week:weekKey(),subject:missionSubject(),index:answers.length,answers,completed:false,updatedAt:nowMs()}
    })
  }
  function scheduleDraftSave(questions,selections){
    clearTimeout(draftTimer);draftTimer=setTimeout(()=>{draftPromise=saveDraft(questions,selections).catch(error=>console.warn("주간 미션 임시저장 실패",error))},350)
  }
  async function flushDraft(questions,selections){clearTimeout(draftTimer);draftTimer=0;await draftPromise.catch(()=>{});return saveDraft(questions,selections)}

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
    doc.open();doc.write(`<!doctype html><html lang="ko" data-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><base href="${base}"><title>모아루 주간 학습점검</title><link rel="stylesheet" href="css/tokens.css?v=7"><link rel="stylesheet" href="css/app.css?v=64.5.11"><link rel="stylesheet" href="css/features/math-quest.css?v=23"><link rel="stylesheet" href="css/features/feed-classinfo-weekly.css?v=65.0.21"></head><body class="weekly-exam-popup"><main id="weeklyExamRoot" class="weekly-exam-root"></main></body></html>`);doc.close();enforcePopupBounds(win);
    win.addEventListener("pagehide",()=>{if(worksheetWindow===win)worksheetWindow=null},{once:true});try{win.focus()}catch{}return win
  }
  function closeWorksheet(){try{if(worksheetWindow&&!worksheetWindow.closed)worksheetWindow.close()}catch{}worksheetWindow=null;try{window.focus()}catch{}}

  function renderWorksheet(doc,host,questions,selections,onSubmit){
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
          selections[item.id]=choice;choices.querySelectorAll(".weekly-exam-choice").forEach(x=>{const yes=x.dataset.value===choice;x.classList.toggle("selected",yes);x.setAttribute("aria-pressed",yes?"true":"false")});card.classList.remove("missing");updateCount();status.textContent="저장 중…";scheduleDraftSave(questions,selections);setTimeout(()=>{if(status.isConnected)status.textContent="선택한 답은 자동 저장됩니다."},650)
        }},[node(doc,"span",{class:"weekly-choice-letter",text:["①","②","③","④"][choiceIndex]}),node(doc,"span",{text:choice})]);
        button.dataset.value=choice;choices.append(button)
      });
      card.append(node(doc,"div",{class:"weekly-question-heading"},[node(doc,"b",{class:"weekly-question-number",text:`${index+1}.`}),node(doc,"span",{class:"weekly-question-category",text:item.category})]),node(doc,"p",{class:`weekly-question-text ${item.format==="word"||item.format==="passage"?"sentence-form":""}`,text:item.text}),choices);sheet.append(card)
    });
    const submit=node(doc,"button",{class:"button primary weekly-exam-submit",type:"button",text:"답안 제출하기",onclick:async()=>{
      const missing=questions.filter(q=>selections[q.id]==null);host.querySelectorAll(".weekly-exam-question.missing").forEach(x=>x.classList.remove("missing"));
      if(missing.length){for(const q of missing)host.querySelector(`#weekly-${q.id}`)?.classList.add("missing");const first=host.querySelector(`#weekly-${missing[0].id}`);first?.scrollIntoView?.({behavior:"smooth",block:"center"});status.textContent=`아직 ${missing.length}문제가 남아 있어요.`;return}
      submit.disabled=true;submit.textContent="제출 중…";try{await flushDraft(questions,selections);await onSubmit(serializeAnswers(questions,selections))}catch(error){console.warn("주간 미션 제출 실패",error);submit.disabled=false;submit.textContent="답안 제출하기";status.textContent="제출하지 못했습니다. 다시 눌러주세요."}
    }});
    host.replaceChildren(node(doc,"header",{class:"weekly-exam-header"},[node(doc,"div",{},[node(doc,"div",{class:"friday-mission-eyebrow",text:"주간 미션 · 시험지형"}),node(doc,"h1",{text:`초6 ${subject} 학습점검`}),node(doc,"p",{class:"muted",text:`20문항을 모두 펼쳐 보고 풀 수 있어요. 80점 이상이면 주 1회 🪙 +${REWARD_COIN}`})]),node(doc,"div",{class:"weekly-exam-meta"},[count,status])]),sheet,node(doc,"footer",{class:"weekly-exam-footer"},[node(doc,"div",{class:"weekly-exam-footer-copy"},[node(doc,"strong",{text:"답안을 확인한 뒤 제출하세요."}),node(doc,"span",{class:"muted",text:"제출 전에는 언제든 답을 바꿀 수 있어요."})]),submit]));
  }

  async function open(){
    if(user().isGuest)return MiniTalk.UI.Shell.toast("로그인 후 참여할 수 있습니다.");
    const gate=windowInfo();if(!gate.open)return MiniTalk.UI.Shell.toast(`금요일 오전 9시까지 ${remainLabel()} 남았습니다.`);

    // 팝업 차단 방지: PC/웨일북은 사용자 클릭 동기 구간에서 창을 먼저 확보합니다.
    const wantsPopup=desktopWorksheet(),popup=wantsPopup?preparePopup():null;
    if(popup){const loading=popup.document.getElementById("weeklyExamRoot");if(loading)loading.textContent="주간 학습점검 문제를 준비하고 있어요…"}
    else if(wantsPopup)MiniTalk.UI.Shell.toast("별도 창을 열 수 없어 현재 창에서 문제를 보여드려요.");

    let saved;
    const questions=makeQuestions();
    try{saved=await MiniTalk.Realtime.cloudGet(path(),null)}catch(error){closeWorksheet();MiniTalk.UI.Shell.toast("저장된 주간 미션을 불러오지 못했습니다. 다시 시도해주세요.");throw error}
    if(saved?.completed){closeWorksheet();const checked=await ensureWeeklyReward(saved);return showReport(checked||saved)}
    const selections=answerMap(saved);
    async function finish(answers){
      if(!windowInfo().open){MiniTalk.UI.Shell.toast("이번 주 학습점검 시간이 끝났습니다.");closeWorksheet();return}
      const report=buildReport(answers),record={week:weekKey(),subject:missionSubject(),index:questions.length,answers,completed:true,report,completedAt:nowMs(),updatedAt:nowMs()};
      const savedFinal=await MiniTalk.Realtime.cloudTransaction(path(),current=>current?.completed?current:{...record,answers});
      const rewarded=await ensureWeeklyReward(savedFinal||record);MiniTalk.UI.Shell.closeModal();closeWorksheet();showReport(rewarded||savedFinal||record)
    }
    if(popup&&!popup.closed){const host=popup.document.getElementById("weeklyExamRoot");renderWorksheet(popup.document,host,questions,selections,finish);try{popup.focus()}catch{}return}
    const D=MiniTalk.UI.Dom,body=D.el("div",{class:"weekly-exam-modal"});MiniTalk.UI.Shell.modal("금요일 초6 학습점검",body);renderWorksheet(MiniTalk.UI.Dom.doc(),body,questions,selections,finish)
  }

  function scorePercent(record){const r=record?.report||buildReport(record?.answers||[]);return r.total?Math.round((Number(r.score)||0)/(Number(r.total)||1)*100):0}
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

  function buildReport(answers){const groups={};answers.forEach(a=>{const key=`${a.subject} · ${a.category}`,g=groups[key]||(groups[key]={correct:0,total:0});g.total++;if(a.correct)g.correct++});const rows=Object.entries(groups).map(([name,g])=>({name,...g,rate:Math.round(g.correct/g.total*100)})).sort((a,b)=>a.rate-b.rate),score=answers.filter(a=>a.correct).length;return{score,total:answers.length,rows,weak:rows.slice(0,3).map(r=>r.name),strong:[...rows].sort((a,b)=>b.rate-a.rate).slice(0,3).map(r=>r.name)}}
  function showReport(record){const D=MiniTalk.UI.Dom,r=record.report||buildReport(record.answers||[]),percent=scorePercent(record),eligible=percent>=80,reward=record.reward||{},rewardText=eligible?(reward.acknowledged?`보상 ${REWARD_COIN}코인 · ${reward.granted?"적립 완료":"이미 적립됨"}`:`보상 ${REWARD_COIN}코인 · 적립 확인 중`):`80점 이상이면 보상 ${REWARD_COIN}코인을 받을 수 있어요`,body=D.el("div",{class:"friday-report modal-stack"},[D.el("div",{class:"friday-complete-mark"},[D.el("img",{class:"quest-complete-stamp",src:"assets/ui/quest-stamp.png",alt:"주간 미션 완료 도장"}),D.el("div",{},[D.el("strong",{text:"이번 주 학습점검 완료"}),D.el("small",{class:"muted",text:"20문항 제출이 완료되어 도장을 받았어요."})])]),D.el("h3",{text:`이번 주 ${record.subject||missionSubject()} · ${r.score}/${r.total}문항 정답 · ${percent}점`}),D.el("section",{class:`friday-reward-card section-card ${eligible?"earned":"missed"}`},[D.el("div",{class:"friday-reward-title"},[D.el("img",{src:"assets/ui/notebook-coin.svg",alt:""}),D.el("strong",{text:eligible?`주간 보상 +${REWARD_COIN}`:"주간 보상"})]),D.el("p",{text:rewardText}),D.el("small",{class:"muted",text:"금요일 학습점검은 80점 이상이면 주 1회 보상됩니다."})]),D.el("div",{class:"friday-bars"},r.rows.map(x=>D.el("div",{class:"friday-bar-row"},[D.el("span",{text:x.name}),D.el("i",{style:`--rate:${x.rate}%`}),D.el("b",{text:`${x.rate}%`})]))),D.el("section",{class:"section-card"},[D.el("strong",{text:"잘한 점"}),D.el("p",{text:(r.strong||[]).join(", ")||"영역별 기록을 더 모아보세요."})]),D.el("section",{class:"section-card"},[D.el("strong",{text:"보완하면 좋은 점"}),D.el("p",{text:(r.weak||[]).join(", ")||"특별히 낮은 영역이 없습니다."}),D.el("small",{class:"muted",text:"낮은 영역의 기본 개념을 다시 확인하고 비슷한 문제를 천천히 풀어보세요."})])]);MiniTalk.UI.Shell.modal("이번 주 학습 피드백",body)}
  function render(){const D=MiniTalk.UI.Dom,info=windowInfo(),subject=missionSubject(),desktop=desktopWorksheet(),accordion=MiniTalk.Tasks.QuestAccordion,compact=Boolean(accordion?.active?.()&&accordion.active()!=="weekly");const restore=D.el("button",{class:"friday-mission-compact-toggle",type:"button","data-no-drag-scroll":"true","aria-label":`주간 미션 펼치기 · 금요일 초6 ${subject} 학습점검`,onclick:event=>{event.preventDefault();event.stopPropagation();accordion?.activate?.("weekly")}},[D.el("span",{class:"friday-compact-badge",text:"주간"}),D.el("span",{class:"friday-compact-copy"},[D.el("strong",{text:`금요일 초6 ${subject} 학습점검`}),D.el("small",{text:info.open?"시험지형 20문항 · 80점 이상 +3코인":`금요일 ${OPEN_HOUR}시부터 열려요`})]),D.el("span",{class:"friday-compact-arrow",text:"⌄","aria-hidden":"true"})]);const card=D.el("section",{class:`friday-mission-card section-card ${info.open?"open":"locked"}${compact?" quest-compact":""}`,"data-quest-key":"weekly"},[restore,D.el("div",{class:"friday-mission-copy"},[D.el("div",{class:"friday-mission-eyebrow",text:"주간 미션"}),D.el("strong",{text:`금요일 초6 ${subject} 학습점검`}),D.el("small",{class:"muted",text:`${subject} 20문항 · 시험지형 · ${desktop?"큰 별도 창":"한 화면에 전체 문제"} · 다음 주 ${subject==="수학"?"국어":"수학"} · 80점 이상 시 🪙 +${REWARD_COIN}`}),D.el("b",{class:"friday-countdown",text:info.open?"오늘 자정 전까지 참여 가능":`열리기까지 ${remainLabel()}`})]),info.open?D.el("button",{class:"button primary compact-button friday-start-button",type:"button",text:desktop?"시험지 열기":"시작",disabled:user().isGuest,onclick:open}):D.el("div",{class:"friday-lock-overlay","aria-hidden":"true"},[D.el("span",{text:"🔒"})])]);if(!info.open){const label=card.querySelector(".friday-countdown"),timer=setInterval(()=>{if(!card.isConnected)return clearInterval(timer);const next=windowInfo();if(next.open){clearInterval(timer);if(MiniTalk.Store.get("route")==="tasks")MiniTalk.Features.Tasks.render(MiniTalk.UI.Dom.byId("viewHost"));return}label.textContent=`열리기까지 ${remainLabel()}`},30000)}return card}
  return{render,open,windowInfo,makeQuestions,buildReport,weekKey,missionSubject,scorePercent,rewardEligible,ensureWeeklyReward,desktopWorksheet,serializeAnswers};
})();
