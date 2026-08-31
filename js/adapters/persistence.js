/* 기기별 설정 저장. 쿠키보다 구조화 데이터에 적합한 localStorage를 사용합니다. */
MiniTalk.Persistence=(()=>{const prefix="miniTalk.v3.";return{get(key,fallback=null){try{const v=localStorage.getItem(prefix+key);return v===null?fallback:JSON.parse(v)}catch{return fallback}},set(key,value){localStorage.setItem(prefix+key,JSON.stringify(value))},remove:key=>localStorage.removeItem(prefix+key)}})();
