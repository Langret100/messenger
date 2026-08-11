/* ============================================================
   전역 설정
   - 외부 주소와 기능 플래그만 둡니다.
   - 상업/공개 운영 시 관리자 인증·코인 변경 검증은 서버로 이전해야 합니다.
   ============================================================ */
window.MiniTalkConfig={
  version:"3.27.0-prefilled-login-topmost",
  appName:"모아루",
  sheetUrl:"https://script.google.com/macros/s/AKfycbz6PjWqKuoTmTalX7ieq3NuhJr-6DPwFQI3c7sDCu9cSCFDt90DP4Ju0yIjfjOgyNoI6w/exec",
  firebase:{apiKey:"__FIREBASE_API_KEY__",authDomain:"web-ghost-c447b.firebaseapp.com",databaseURL:"https://web-ghost-c447b-default-rtdb.firebaseio.com",projectId:"web-ghost-c447b",storageBucket:"web-ghost-c447b.firebasestorage.app",messagingSenderId:"198377381878",appId:"1:198377381878:web:83b56b1b4d63138d27b1d7"},
  paths:{rooms:"rooms",globalMessages:"socialChat",roomMessages:"socialChatRooms",presence:"mini_talk/v3/presence",commands:"mini_talk/v3/commands",tasks:"mini_talk/v3/tasks",profiles:"mini_talk/v3/profiles",shopInventory:"mini_talk/v3/shop/inventory"},
  sites:[{name:"Google",url:"https://www.google.com"},{name:"네이버",url:"https://www.naver.com"},{name:"YouTube",url:"https://www.youtube.com"},{name:"Classroom",url:"https://classroom.google.com"},{name:"Padlet",url:"https://padlet.com"},{name:"Canva",url:"https://www.canva.com"}]
};
