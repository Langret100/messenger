/* Device-only recording. Prefer VP9's smaller WebM stream; fall back to a
   codec the current browser can encode. The existing upload cap still applies. */
MiniTalk.Video=(()=>{
  function createRecorder(stream,Recorder=MediaRecorder){
    const choices=[['video/webm;codecs=vp9',280000],['video/webm;codecs=vp8',320000],['video/webm',320000],['video/mp4;codecs=avc1.42E01E',320000],['video/mp4',320000]];
    for(const [mimeType,videoBitsPerSecond] of choices){
      if(typeof Recorder.isTypeSupported==='function'&&!Recorder.isTypeSupported(mimeType))continue;
      try{return new Recorder(stream,{mimeType,videoBitsPerSecond})}catch{}
    }
    return new Recorder(stream,{videoBitsPerSecond:320000});
  }
  return{createRecorder};
})();
