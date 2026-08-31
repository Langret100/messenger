/* 오늘의 타로 데이터와 결정 규칙. UI와 분리해 같은 날짜의 결과를 안정적으로 유지합니다. */
MiniTalk.Tools=MiniTalk.Tools||{};
MiniTalk.Tools.Tarot=(()=>{
  const CARDS=[
    {id:"sun",title:"태양",symbol:"☀",keywords:"활력 · 자신감 · 좋은 소식",upright:"오늘은 솔직한 표현과 적극적인 선택이 좋은 흐름을 만듭니다. 작게라도 먼저 움직이면 주변의 반응이 따라올 가능성이 커요.",reversed:"의욕은 충분하지만 서두르면 중요한 부분을 놓칠 수 있어요. 잠시 속도를 낮추고 가장 즐거운 한 가지부터 시작해 보세요.",advice:"기분 좋아지는 일을 하나 먼저 끝내 보세요.",color:"골드"},
    {id:"moon",title:"달",symbol:"☾",keywords:"직감 · 감정 · 숨은 단서",upright:"눈에 보이는 정보보다 마음이 보내는 작은 신호가 중요한 날입니다. 애매한 상황은 바로 결론내기보다 한 번 더 살펴보세요.",reversed:"걱정이 실제보다 커 보일 수 있어요. 추측과 사실을 나눠 적어 보면 생각보다 답이 단순해집니다.",advice:"결정 전 조용한 시간을 10분 가져보세요.",color:"라벤더"},
    {id:"star",title:"별",symbol:"✦",keywords:"희망 · 회복 · 새로운 가능성",upright:"기대하지 않았던 작은 기회가 보일 수 있어요. 완벽하지 않아도 원하는 방향을 주변에 이야기하면 도움이 연결됩니다.",reversed:"목표가 멀게 느껴져도 진전이 없는 것은 아니에요. 남과 비교하기보다 어제의 나보다 한 걸음만 나아가 보세요.",advice:"바라는 일을 한 문장으로 적어 보세요.",color:"스카이 블루"},
    {id:"wheel",title:"운명의 수레바퀴",symbol:"◎",keywords:"변화 · 타이밍 · 전환점",upright:"익숙한 흐름이 새 방향으로 움직이기 시작합니다. 예상 밖의 제안이나 일정 변경을 유연하게 받아들이면 행운이 될 수 있어요.",reversed:"계획이 잠시 꼬일 수 있지만 실패를 뜻하지는 않아요. 통제할 수 있는 작은 부분부터 다시 정리하세요.",advice:"우연히 생긴 선택지를 가볍게 검토해 보세요.",color:"코발트 블루"},
    {id:"strength",title:"힘",symbol:"∞",keywords:"용기 · 인내 · 부드러운 설득",upright:"강하게 밀어붙이기보다 차분하고 꾸준한 태도가 더 큰 힘을 발휘합니다. 자신을 믿고 어려운 대화를 부드럽게 시작해 보세요.",reversed:"지치거나 자신감이 흔들릴 수 있어요. 오늘은 모든 것을 해내려 하지 말고 에너지를 회복하는 것도 중요한 선택입니다.",advice:"가장 부담되는 일을 작은 단계로 나눠 보세요.",color:"코랄"},
    {id:"hermit",title:"은둔자",symbol:"◇",keywords:"집중 · 성찰 · 나만의 답",upright:"조용히 혼자 집중할 때 좋은 답이 나오는 날입니다. 주변의 속도에 휩쓸리지 말고 이미 알고 있는 지혜를 믿어 보세요.",reversed:"혼자 고민하는 시간이 너무 길어질 수 있어요. 믿을 만한 사람 한 명에게 생각을 말하면 막힌 부분이 풀립니다.",advice:"알림을 잠시 끄고 한 가지에 집중해 보세요.",color:"딥 네이비"},
    {id:"lovers",title:"연인",symbol:"♡",keywords:"관계 · 선택 · 마음의 일치",upright:"진심을 나누는 대화가 관계를 가깝게 합니다. 중요한 선택에서는 남의 기대보다 내가 중요하게 생각하는 기준을 확인하세요.",reversed:"말하지 않은 기대 때문에 오해가 생길 수 있어요. 상대의 마음을 단정하지 말고 짧게라도 직접 물어보세요.",advice:"고마운 사람에게 먼저 안부를 전해 보세요.",color:"로즈 핑크"},
    {id:"world",title:"세계",symbol:"○",keywords:"완성 · 성취 · 다음 단계",upright:"그동안 이어온 일이 의미 있는 결실로 연결될 수 있어요. 끝낸 일을 충분히 인정한 뒤 다음 목표를 천천히 정해 보세요.",reversed:"마무리 직전의 작은 일이 남아 있을 수 있어요. 새 일을 벌이기 전에 미뤄둔 한 가지를 정리하면 흐름이 가벼워집니다.",advice:"오늘 끝낼 수 있는 일을 하나 완결해 보세요.",color:"민트"}
  ];
  function hash(text){let value=2166136261;for(const char of String(text)){value^=char.charCodeAt(0);value=Math.imul(value,16777619)}return value>>>0}
  function draw(dateKey,userId,choice=0){const seed=hash(`${dateKey}|${userId||"guest"}|${Number(choice)||0}`),card=CARDS[seed%CARDS.length],reversed=((seed>>>5)%5)===0;return{...card,reversed,meaning:reversed?card.reversed:card.upright,luckyNumber:(seed%9)+1}}
  return{cards:()=>CARDS.map(card=>({...card})),draw,hash};
})();
