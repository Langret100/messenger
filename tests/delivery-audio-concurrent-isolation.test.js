const fs=require('fs'),path=require('path');
const src=fs.readFileSync(path.resolve(__dirname,'../js/features/shopping.js'),'utf8');
function ok(v,m){if(!v)throw new Error(m)}
ok(src.includes('const preload = deliveryAudioPool.get(src);'),'delivery prime no longer uses preloaded media template');
ok(src.includes('preload?.cloneNode ? preload.cloneNode(true) : new Audio(src)'),'delivery requests are sharing the pooled Audio instance');
ok(!src.includes('const audio = deliveryAudioPool.get(src) || new Audio(src);\n      audio.preload = \'auto\';\n      deliveryAudioPool.set(src, audio);\n      const prime'), 'old shared-prime implementation remains');
console.log('DELIVERY_AUDIO_CONCURRENT_ISOLATION_OK');
