const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const MiniTalk={};vm.runInNewContext(fs.readFileSync('js/ui/video-codec.js','utf8'),{MiniTalk});
function fake(supported,throws=[]){return class{static isTypeSupported(m){return supported.includes(m)}constructor(stream,options){if(throws.includes(options.mimeType))throw Error('unsupported');this.options=options;this.stream=stream}}}
const create=MiniTalk.Video.createRecorder,stream={};
assert.equal(create(stream,fake(['video/webm;codecs=vp9'])).options.videoBitsPerSecond,280000);
assert.equal(create(stream,fake(['video/webm;codecs=vp8'])).options.mimeType,'video/webm;codecs=vp8');
assert.equal(create(stream,fake(['video/webm;codecs=vp9','video/mp4'],['video/webm;codecs=vp9'])).options.mimeType,'video/mp4');
assert.equal(create(stream,fake([])).options.mimeType,undefined);
console.log('video codec selection and constructor fallback passed');
