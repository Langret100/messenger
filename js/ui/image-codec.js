/* Image conversion happens entirely on the device. Probe support once, then
   preserve the caller's dimensions and byte budget. No network/storage calls. */
MiniTalk.Images=(()=>{
  let cachedMime;
  function preferredMime(){
    if(cachedMime)return cachedMime;
    try{const probe=document.createElement("canvas");probe.width=probe.height=1;cachedMime=probe.toDataURL("image/webp",.5).startsWith("data:image/webp;")?"image/webp":"image/jpeg"}
    catch{cachedMime="image/jpeg"}
    return cachedMime;
  }
  return{get mime(){return preferredMime()}};
})();
