const fs=require('fs');
const path=require('path');
const src=fs.readFileSync(path.join(__dirname,'..','js','features','chats.js'),'utf8');
if(!src.includes('nodes.forEach(node=>node?.classList?.remove("conversation-enter"))')) throw new Error('refresh animation suppression missing');
console.log('ROOM_LIST_NO_REFRESH_ANIMATION_OK');
