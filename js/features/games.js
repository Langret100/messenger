/* ============================================================
   GAMES FEATURE
   역할:
   - 메신저의 '게임' 메뉴와 게임 목록만 담당합니다.
   - 실행 자체는 MiniTalk.GameHost 어댑터에 위임합니다.
   - 게임 추가/삭제는 GAMES 배열 한 곳만 수정하면 됩니다.

   원본:
   - vtub-tori-main의 독립 HTML 게임을 가져와 파일명을 정리했습니다.
   - 메신저/social-messenger는 현재 프로그램 자체 기능과 중복되어 제외했습니다.
   ============================================================ */
MiniTalk.Features.Games=(()=>{
  const GAMES=[
    {id:"gugudan",title:"구구단 게임",rankingName:"구구단게임",desc:"빠르게 곱셈 문제를 풀어 점수를 올리는 게임",icon:"×",url:"games/gugudan.html",tag:"계산",bgm:"assets/sounds/games/game1.mp3"},
    {id:"dice",title:"주사위 합 맞추기",rankingName:"덧셈주사위",desc:"주사위 눈의 합을 계산하는 짧은 수학 게임",icon:"⚄",url:"games/dice-sum.html",tag:"계산",bgm:"assets/sounds/games/game2.mp3"},
    {id:"shape",title:"도형 추적자",rankingName:"꿈틀이도형추적자",desc:"움직이는 도형을 관찰하고 찾아내는 게임",icon:"◇",url:"games/shape-tracker.html",tag:"도형",bgm:"assets/sounds/games/game3.mp3"},
    {id:"explorer",title:"수학 탐험대",rankingName:"수학탐험대",desc:"전투와 수학 문제를 결합한 긴 플레이 게임",icon:"⚔",url:"games/math-explorer.html",tag:"탐험"},
    {id:"tamagotchi",title:"마이 다마고치",rankingName:"마이다마고치",desc:"작은 캐릭터를 돌보며 즐기는 미니 게임",icon:"◉",url:"games/tamagotchi.html",tag:"육성"}
  ];

  function render(host){
    MiniTalk.UI.Shell.setHeader("게임",[],{back:()=>MiniTalk.Router.go("tools")});
    const D=MiniTalk.UI.Dom;
    const view=D.el("section",{class:"view game-library"});
    const intro=D.el("div",{class:"game-library-head"},[
      D.el("div",{},[D.el("h2",{text:"게임"}),D.el("p",{class:"muted",text:"플레이하고 기록을 랭킹과 게시판에서 확인하세요."})]),
      D.el("div",{class:"game-community-actions"},[
        D.el("button",{class:"mini-pill",type:"button",text:"♛ 랭킹",onclick:()=>MiniTalk.Games.Ranking.open()}),
        D.el("button",{class:"mini-pill",type:"button",text:"▤ 게시판",onclick:()=>MiniTalk.Games.Board.open()})
      ])
    ]);
    const list=D.el("div",{class:"game-grid"});
    GAMES.forEach((game,index)=>{
      const card=D.el("button",{class:`game-card game-card-${(index%4)+1}`,type:"button",onclick:()=>MiniTalk.GameHost.open(game)});
      card.append(
        D.el("span",{class:"game-card-icon",text:game.icon}),
        D.el("span",{class:"game-card-body"},[
          D.el("span",{class:"game-card-line"},[D.el("strong",{text:game.title}),D.el("small",{text:game.tag})]),
          D.el("span",{class:"game-card-desc",text:game.desc})
        ]),
        D.el("span",{class:"game-card-arrow",text:"›"})
      );
      list.append(card);
    });
    view.append(intro,list);
    host.replaceChildren(view);
  }

  return{id:"games",title:"게임",icon:"▣",nav:false,render,list:()=>GAMES.slice()};
})();
MiniTalk.Registry.register(MiniTalk.Features.Games);
