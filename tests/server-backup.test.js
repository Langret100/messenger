const fs = require('fs');
const vm = require('vm');
const path = require('path');

const root = path.resolve(__dirname, '..');
const requests = [];
let transport = 'local';
const state = { user: { user_id: 'user-1', nickname: '토리' } };
const ctx = {
  console,
  URLSearchParams,
  fetch: async (url, options) => { requests.push({ url, options }); return { ok: true }; },
  MiniTalkConfig: { sheetUrl: 'https://example.test/apps-script' },
  MiniTalk: {
    Chat: {},
    Realtime: { getMode: () => transport },
    Store: { get: key => state[key] }
  }
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(root, 'js/chat/server-backup.js'), 'utf8'), ctx);

if (ctx.MiniTalk.Chat.ServerBackup.message({ id: 'local-message' }) !== false || requests.length) {
  throw new Error('local mode must not create a Sheet backup request');
}

transport = 'firebase';
ctx.MiniTalk.Chat.ServerBackup.room('UPSERT', {
  id: 'room-1', title: '우리방', creator: 'user-1', updatedAt: 123,
  members: { one: { user_id: 'user-1', nickname: '토리', role: 'owner', passwordHash: 'secret' } }
});
ctx.MiniTalk.Chat.ServerBackup.message({
  id: 'message-1', roomId: 'room-1', user_id: 'user-1', nickname: '토리',
  type: 'image', text: '사진', imageUrl: 'data:image/webp;base64,AAAA', ts: 456
});

if (requests.length !== 2) throw new Error(`expected two asynchronous backup requests, got ${requests.length}`);
for (const request of requests) {
  if (request.options.mode !== 'no-cors' || request.options.keepalive !== true) throw new Error('backup must be non-blocking and keepalive');
}
const roomBody = requests[0].options.body;
if (roomBody.get('mode') !== 'mini_talk_room_backup') throw new Error('room backup mode mismatch');
if (roomBody.get('members_json').includes('secret')) throw new Error('room password metadata leaked into backup');
const messageBody = requests[1].options.body;
if (messageBody.get('mode') !== 'mini_talk_message_backup') throw new Error('message backup mode mismatch');
if (messageBody.get('image_url') !== '') throw new Error('base64 message image must not be copied to Sheets');

console.log('SERVER_BACKUP_OK');
