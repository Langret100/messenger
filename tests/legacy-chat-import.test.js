const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const calls = [];
const responses = [
  { ok: true, rooms: [{ room_id: 'r_old', name: '토리방', participants: ['토리', '친구'], creator: '토리', has_password: false }] },
  { ok: true, messages: [{ ts: 123, nickname: '토리', user_id: '', text: '안녕' }] },
  { ok: true, entered: true }
];
const context = {
  console, URLSearchParams, TextEncoder, AbortController,
  setTimeout, clearTimeout,
  MiniTalkConfig: { sheetUrl: 'https://example.test/exec' },
  MiniTalk: { Chat: {} },
  fetch: async (_url, options) => {
    calls.push(Object.fromEntries(options.body.entries()));
    return { ok: true, json: async () => responses.shift() };
  }
};
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(root, 'js/chat/legacy-import.js'), 'utf8'), context);

(async () => {
  const user = { user_id: 'u1', nickname: '토리' };
  const rooms = await context.MiniTalk.Chat.LegacyImport.rooms(user);
  if (!rooms.some(room => room.id === 'global')) throw new Error('global room fallback missing');
  const room = rooms.find(item => item.id === 'r_old');
  if (!room || room.title !== '토리방' || !room.members.u1) throw new Error('legacy room normalization failed');

  const messages = await context.MiniTalk.Chat.LegacyImport.messages('r_old', user);
  if (messages[0].user_id !== 'u1' || messages[0].text !== '안녕') throw new Error('legacy message normalization failed');
  await context.MiniTalk.Chat.LegacyImport.enter('r_old', user, '1234');
  if (calls[0].mode !== 'social_rooms' || calls[1].mode !== 'social_recent_room' || calls[2].mode !== 'social_room_enter') throw new Error('legacy API mode mismatch');
  console.log('LEGACY_CHAT_IMPORT_OK');
})().catch(error => { console.error(error); process.exit(1); });
