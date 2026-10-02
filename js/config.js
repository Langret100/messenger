/* ============================================================
   전역 설정
   - 외부 주소와 기능 플래그만 둡니다.
   - 상업/공개 운영 시 관리자 인증·코인 변경 검증은 서버로 이전해야 합니다.
   ============================================================ */
window.MiniTalkConfig={
  version:"3.44.0-server-source-integration",
  appName:"모아루",
  mathPetUrl:"https://langret100.github.io/MATH_PET/",
  sheetUrl:"https://script.google.com/macros/s/AKfycbz6PjWqKuoTmTalX7ieq3NuhJr-6DPwFQI3c7sDCu9cSCFDt90DP4Ju0yIjfjOgyNoI6w/exec",
  firebase:{apiKey:"__FIREBASE_API_KEY__",authDomain:"web-ghost-c447b.firebaseapp.com",databaseURL:"https://web-ghost-c447b-default-rtdb.firebaseio.com",projectId:"web-ghost-c447b",storageBucket:"web-ghost-c447b.firebasestorage.app",messagingSenderId:"198377381878",appId:"1:198377381878:web:83b56b1b4d63138d27b1d7"},
  paths:{rooms:"rooms",roomSummaries:"moaru/v3/roomSummaries",userRooms:"moaru/v3/userRooms",roomSchema:"moaru/v3/schema/roomSummaryVersion",roomIndexUsers:"moaru/v3/roomIndexUsers",globalMessages:"socialChat",roomMessages:"socialChatRooms",legacyProfiles:"profiles",presence:"moaru/v3/presence",commands:"moaru/v3/commands",tasks:"moaru/v3/tasks",profiles:"moaru/v3/profiles",shopInventory:"moaru/v3/shop/inventory",economyRuntime:"moaru/v3/economyRuntime"},
  sites:[{name:"토리의 방송방",url:"https://langret100.github.io/vtub-tori/",category:"play",popup:true,icon:"◉",description:"토리와 함께하는 방송 놀이"},{name:"돌림판",url:"https://langret100.github.io/picker/",category:"play",popup:true,icon:"↻",description:"항목을 넣고 돌려서 하나 뽑기"},{name:"백룸 싱글모드",url:"https://langret100.github.io/test-rabbitrun/",category:"play",popup:true,icon:"▣",description:"혼자 플레이하는 백룸 모드"},{name:"동작 인식 게임",url:"https://langret100.github.io/Math-in-Math/"},{name:"페이스 체인지",tool:"face-toy"},{name:"Google",url:"https://www.google.com",category:"links",icon:"G",description:"웹 검색"},{name:"네이버",url:"https://www.naver.com",category:"links",icon:"N",description:"검색과 포털"},{name:"YouTube",url:"https://www.youtube.com",category:"links",icon:"▶",description:"동영상 보기"},{name:"Classroom",url:"https://classroom.google.com",category:"links",icon:"C",description:"Google Classroom 열기"},{name:"Padlet",url:"https://padlet.com",category:"links",icon:"P",description:"Padlet 열기"},{name:"Canva",url:"https://www.canva.com",category:"links",icon:"C",description:"Canva 열기"}]
};
