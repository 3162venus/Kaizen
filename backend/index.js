const express   = require('express');
const http      = require('http');
const WebSocket = require('ws');
const cors      = require('cors');
const bcrypt    = require('bcryptjs');
const jwt       = require('jsonwebtoken');

const app    = express();
const server = http.createServer(app);
const wss    = new WebSocket.Server({ server });
const PORT   = process.env.PORT       || 3001;
const SECRET = process.env.JWT_SECRET || 'kaizen-dev-secret-change-in-prod';

app.use(cors({ origin: '*' }));
app.use(express.json());

const memUsers   = {};
const memRooms   = {};
const memFriends = {};

function genKzenID() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let id = 'KZEN#';
  for (let i = 0; i < 8; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

function sign(payload) {
  return jwt.sign(payload, SECRET, { expiresIn: '30d' });
}

function getUser(identifier) {
  return memUsers[identifier.toLowerCase()] ||
    Object.values(memUsers).find(u => u.email.toLowerCase() === identifier.toLowerCase()) ||
    null;
}

const rooms       = {};
const battles     = {};
const lobby       = new Set();
const rates       = new Map();
const userSockets = new Map();

function roomClients(id) {
  if (!rooms[id]) rooms[id] = new Map();
  return rooms[id];
}

function roomList(id) {
  const out = [];
  roomClients(id).forEach(d => out.push({ username:d.username, xp:d.xp, focusing:d.focusing, cameraOn:d.cameraOn }));
  return out;
}

function broadcast(id, msg) {
  const p = JSON.stringify(msg);
  roomClients(id).forEach((_, ws) => { if (ws.readyState === 1) ws.send(p); });
}

function broadcastLobby(msg) {
  const p = JSON.stringify(msg);
  lobby.forEach(ws => { if (ws.readyState === 1) ws.send(p); });
}

function broadcastAll(msg) {
  const p = JSON.stringify(msg);
  wss.clients.forEach(ws => { if (ws.readyState === 1) ws.send(p); });
}

function liveCount() {
  let n = lobby.size;
  Object.values(rooms).forEach(m => { n += m.size; });
  return n;
}

function limited(ws) {
  const now = Date.now();
  let r = rates.get(ws);
  if (!r || now > r.reset) { r = { c:0, reset:now+1000 }; rates.set(ws, r); }
  return ++r.c > 40;
}

function broadcastRoomUpdate(roomId) {
  const users = roomList(roomId);
  if (memRooms[roomId]) memRooms[roomId].users = users.length;
  broadcast(roomId, { type:'room_users', users, count:users.length });
  broadcastLobby({ type:'room_count_update', roomId, count:users.length });
}

function endBattle(battleId, forfeitUser = null) {
  const b = battles[battleId];
  if (!b) return;
  clearTimeout(b.timer);

  let winner, loser, winnerXp, loserXp;
  if (forfeitUser) {
    loser    = forfeitUser;
    winner   = forfeitUser === b.challenger ? b.opponent : b.challenger;
    loserXp  = loser  === b.challenger ? b.challengerXp : b.opponentXp;
    winnerXp = winner === b.challenger ? b.challengerXp : b.opponentXp;
  } else {
    if (b.challengerXp >= b.opponentXp) {
      winner = b.challenger; loser = b.opponent;
      winnerXp = b.challengerXp; loserXp = b.opponentXp;
    } else {
      winner = b.opponent; loser = b.challenger;
      winnerXp = b.opponentXp; loserXp = b.challengerXp;
    }
  }

  const result = { type:'battle_end', battleId, winner, loser, winnerXp, loserXp, totalXp:winnerXp+loserXp, forfeit:!!forfeitUser };
  const wWs = userSockets.get(winner);
  const lWs = userSockets.get(loser);
  if (wWs?.readyState === 1) wWs.send(JSON.stringify(result));
  if (lWs?.readyState  === 1) lWs.send(JSON.stringify(result));

  const wu = memUsers[winner?.toLowerCase()];
  if (wu) wu.battles_won++;
  delete battles[battleId];
}

wss.on('connection', ws => {
  let S = { userId:null, username:null, roomId:null, joinedAt:Date.now(), lastXp:0, battleId:null };
  lobby.add(ws);
  broadcastAll({ type:'live_count', count:liveCount() });

  ws.on('message', raw => {
    if (limited(ws)) return;
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    if (msg.type === 'auth') {
      try {
        const p    = jwt.verify(msg.token, SECRET);
        S.userId   = p.userId;
        S.username = p.username;
        userSockets.set(S.username, ws);
        ws.send(JSON.stringify({ type:'auth_ok' }));
      } catch { ws.send(JSON.stringify({ type:'auth_fail' })); }
      return;
    }

    if (msg.type === 'join_room') {
      if (S.roomId) { roomClients(S.roomId).delete(ws); broadcastRoomUpdate(S.roomId); }
      lobby.delete(ws);
      S.roomId   = msg.roomId;
      S.joinedAt = Date.now();
      S.lastXp   = 0;
      roomClients(S.roomId).set(ws, { username:S.username||'Guest', xp:0, focusing:false, cameraOn:false });
      broadcastRoomUpdate(S.roomId);
      broadcastAll({ type:'live_count', count:liveCount() });
      ws.send(JSON.stringify({ type:'room_joined', users:roomList(S.roomId) }));
      return;
    }

    if (msg.type === 'xp_update') {
      if (!S.roomId) return;
      const xp      = parseInt(msg.xp) || 0;
      const elapsed = (Date.now() - S.joinedAt) / 1000;
      if (xp > elapsed * 3 + 20) { ws.send(JSON.stringify({ type:'xp_cheat' })); return; }
      S.lastXp = xp;
      const d = roomClients(S.roomId).get(ws);
      if (d) { d.xp = xp; roomClients(S.roomId).set(ws, d); }
      if (xp % 5 === 0) broadcastRoomUpdate(S.roomId);

      if (S.battleId && battles[S.battleId]) {
        const b    = battles[S.battleId];
        const side = b.challenger === S.username ? 'challengerXp' : 'opponentXp';
        b[side] = xp;
        const other   = userSockets.get(b.challenger === S.username ? b.opponent : b.challenger);
        const payload = JSON.stringify({ type:'battle_xp_update', challengerXp:b.challengerXp, opponentXp:b.opponentXp });
        if (other?.readyState === 1) other.send(payload);
        ws.send(payload);
      }
      return;
    }

    if (msg.type === 'focus_status') {
      if (!S.roomId) return;
      const d = roomClients(S.roomId).get(ws);
      if (d) { d.focusing = !!msg.focusing; d.cameraOn = !!msg.cameraOn; roomClients(S.roomId).set(ws, d); }
      broadcastRoomUpdate(S.roomId);
      return;
    }

    if (msg.type === 'leave_room') {
      if (S.roomId) {
        if (S.lastXp > 0 && S.username) {
          const u = memUsers[S.username.toLowerCase()];
          if (u) { u.xp_total += S.lastXp; u.xp_daily += S.lastXp; }
        }
        roomClients(S.roomId).delete(ws);
        broadcastRoomUpdate(S.roomId);
        S.roomId = null;
      }
      lobby.add(ws);
      broadcastAll({ type:'live_count', count:liveCount() });
      return;
    }

    if (msg.type === 'battle_challenge') {
      if (!S.username) return;
      const targetWs = userSockets.get(msg.opponent);
      if (!targetWs || targetWs.readyState !== 1) {
        ws.send(JSON.stringify({ type:'battle_error', message:'User is offline' }));
        return;
      }
      targetWs.send(JSON.stringify({ type:'battle_invite', challenger:S.username, duration:msg.duration }));
      return;
    }

    if (msg.type === 'battle_accept') {
      const challengerWs = userSockets.get(msg.challenger);
      if (!challengerWs || challengerWs.readyState !== 1) {
        ws.send(JSON.stringify({ type:'battle_error', message:'Challenger went offline' }));
        return;
      }
      const battleId = 'b_' + Date.now();
      battles[battleId] = { id:battleId, challenger:msg.challenger, opponent:S.username, duration:msg.duration, challengerXp:0, opponentXp:0, timer:null };
      S.battleId = battleId;
      const payload = JSON.stringify({ type:'battle_start', battleId, challenger:msg.challenger, opponent:S.username, duration:msg.duration });
      challengerWs.send(payload);
      ws.send(payload);
      battles[battleId].timer = setTimeout(() => endBattle(battleId), msg.duration * 60 * 1000);
      return;
    }

    if (msg.type === 'battle_decline') {
      const cWs = userSockets.get(msg.challenger);
      if (cWs?.readyState === 1) cWs.send(JSON.stringify({ type:'battle_declined', opponent:S.username }));
      return;
    }

    if (msg.type === 'battle_forfeit') {
      if (S.battleId) { endBattle(S.battleId, S.username); S.battleId = null; }
      return;
    }

    if (msg.type === 'ping') ws.send(JSON.stringify({ type:'pong' }));
  });

  ws.on('close', () => {
    if (S.roomId) {
      if (S.lastXp > 0 && S.username) {
        const u = memUsers[S.username.toLowerCase()];
        if (u) { u.xp_total += S.lastXp; u.xp_daily += S.lastXp; }
      }
      roomClients(S.roomId).delete(ws);
      broadcastRoomUpdate(S.roomId);
    }
    if (S.battleId) { endBattle(S.battleId, S.username); S.battleId = null; }
    if (S.username) userSockets.delete(S.username);
    lobby.delete(ws);
    rates.delete(ws);
    broadcastAll({ type:'live_count', count:liveCount() });
  });

  ws.on('error', () => {});
});

app.post('/api/register', async (req, res) => {
  const { username, email, password, mode, year, school, major } = req.body;
  if (!username || !email || !password)
    return res.status(400).json({ ok:false, error:'Missing fields' });
  if (!/^[a-zA-Z0-9_]{3,20}$/.test(username))
    return res.status(400).json({ ok:false, error:'Invalid username — letters, numbers, _ only' });
  if (password.length < 8)
    return res.status(400).json({ ok:false, error:'Password must be 8+ characters' });
  if (memUsers[username.toLowerCase()])
    return res.status(409).json({ ok:false, error:'Username already taken' });
  if (Object.values(memUsers).find(u => u.email.toLowerCase() === email.toLowerCase()))
    return res.status(409).json({ ok:false, error:'Email already registered' });

  const hash   = await bcrypt.hash(password, 10);
  const userId = Date.now();
  const kzenId = genKzenID();

  memUsers[username.toLowerCase()] = {
    id:userId, username, email, password_hash:hash, kzen_id:kzenId,
    mode:mode||'student', year:year||'freshman', school:school||'SSE', major:major||'',
    theme:'blue', dark:false, status:'focus',
    xp_total:0, xp_daily:0, hp:100, streak:0, sessions:0, battles_won:0,
  };
  memFriends[userId] = [];

  const token = sign({ userId, username, kzenId });
  res.json({ ok:true, token, username, kzenId, userId, mode:mode||'student', year:year||'freshman', school:school||'SSE', major:major||'' });
});

app.post('/api/login', async (req, res) => {
  const { identifier, password } = req.body;
  if (!identifier || !password)
    return res.status(400).json({ ok:false, error:'Missing fields' });

  const user = getUser(identifier);
  if (!user) return res.status(401).json({ ok:false, error:'Account not found' });
  if (!await bcrypt.compare(password, user.password_hash))
    return res.status(401).json({ ok:false, error:'Wrong password' });

  const token = sign({ userId:user.id, username:user.username, kzenId:user.kzen_id });
  res.json({ ok:true, token, username:user.username, kzenId:user.kzen_id, userId:user.id, mode:user.mode, year:user.year, school:user.school, major:user.major, theme:user.theme, dark:user.dark, status:user.status });
});

app.get('/api/me', (req, res) => {
  const h = req.headers.authorization;
  if (!h?.startsWith('Bearer ')) return res.status(401).json({ ok:false });
  try {
    const p    = jwt.verify(h.slice(7), SECRET);
    const user = Object.values(memUsers).find(u => u.id === p.userId);
    if (!user) return res.status(404).json({ ok:false });
    res.json({ ok:true, user:{ username:user.username, kzenId:user.kzen_id, mode:user.mode, year:user.year, school:user.school, major:user.major, theme:user.theme, dark:user.dark, status:user.status, xp_total:user.xp_total, xp_daily:user.xp_daily, hp:user.hp, streak:user.streak, sessions:user.sessions, battles_won:user.battles_won } });
  } catch { res.status(401).json({ ok:false }); }
});

app.get('/api/rooms', (req, res) => {
  const list = Object.values(memRooms).map(r => ({ ...r, users:roomClients(r.id).size }));
  res.json({ ok:true, rooms:list });
});

app.post('/api/rooms', (req, res) => {
  const h = req.headers.authorization;
  if (!h?.startsWith('Bearer ')) return res.status(401).json({ ok:false, error:'Login required' });
  try {
    const p = jwt.verify(h.slice(7), SECRET);
    const { name, subject, maxUsers, cameraRequired } = req.body;
    if (!name || !subject) return res.status(400).json({ ok:false, error:'Name and subject required' });
    const exists = Object.values(memRooms).find(r => r.name.toLowerCase() === name.toLowerCase());
    if (exists) return res.status(409).json({ ok:false, error:'Room name already taken — choose another' });
    const id   = 'r_' + Date.now() + '_' + Math.random().toString(36).slice(2,6);
    const room = { id, name, subject, max_users:Math.min(20,Math.max(2,parseInt(maxUsers)||10)), camera_required:!!cameraRequired, creator_name:p.username, users:0, created_at:new Date().toISOString() };
    memRooms[id] = room;
    broadcastLobby({ type:'new_room', room });
    res.json({ ok:true, room });
  } catch { res.status(500).json({ ok:false, error:'Server error' }); }
});

app.get('/api/users/search', (req, res) => {
  const q = String(req.query.q || '').trim().toLowerCase();
  if (q.length < 2) return res.status(400).json({ ok:false, error:'Too short' });
  const users = Object.values(memUsers)
    .filter(u => u.username.toLowerCase().includes(q) || (u.kzen_id||'').toLowerCase().includes(q))
    .map(u => ({ id:u.id, username:u.username, kzen_id:u.kzen_id, xp_total:u.xp_total, streak:u.streak }))
    .slice(0, 8);
  res.json({ ok:true, users });
});

app.post('/api/friends', (req, res) => {
  const h = req.headers.authorization;
  if (!h?.startsWith('Bearer ')) return res.status(401).json({ ok:false });
  try {
    const p = jwt.verify(h.slice(7), SECRET);
    if (!memFriends[p.userId]) memFriends[p.userId] = [];
    const fid = req.body.friendId;
    if (!memFriends[p.userId].includes(fid)) memFriends[p.userId].push(fid);
    if (!memFriends[fid]) memFriends[fid] = [];
    if (!memFriends[fid].includes(p.userId)) memFriends[fid].push(p.userId);
    res.json({ ok:true });
  } catch { res.status(500).json({ ok:false }); }
});

app.get('/api/friends', (req, res) => {
  const h = req.headers.authorization;
  if (!h?.startsWith('Bearer ')) return res.status(401).json({ ok:false });
  try {
    const p       = jwt.verify(h.slice(7), SECRET);
    const ids     = memFriends[p.userId] || [];
    const friends = ids.map(id => {
      const u = Object.values(memUsers).find(x => x.id === id);
      if (!u) return null;
      return { id:u.id, username:u.username, kzen_id:u.kzen_id, xp_total:u.xp_total, streak:u.streak, status:u.status };
    }).filter(Boolean);
    res.json({ ok:true, friends });
  } catch { res.status(500).json({ ok:false }); }
});

app.post('/api/xp', (req, res) => {
  const h = req.headers.authorization;
  if (!h?.startsWith('Bearer ')) return res.status(401).json({ ok:false });
  try {
    const p  = jwt.verify(h.slice(7), SECRET);
    const xp = parseInt(req.body.xp) || 0;
    if (xp < 0 || xp > 50000) return res.status(400).json({ ok:false });
    const u = Object.values(memUsers).find(x => x.id === p.userId);
    if (u) { u.xp_total += xp; u.xp_daily += xp; }
    res.json({ ok:true });
  } catch { res.status(500).json({ ok:false }); }
});

app.get('/api/leaderboard', (req, res) => {
  const users = Object.values(memUsers)
    .sort((a,b) => b.xp_daily - a.xp_daily)
    .map(u => ({ username:u.username, kzen_id:u.kzen_id, xp:u.xp_daily, battles_won:u.battles_won }));
  res.json({ ok:true, data:users });
});

app.get('/health', (req, res) => res.json({ ok:true, live:liveCount(), users:Object.keys(memUsers).length }));

server.listen(PORT, () => {
  console.log(`\n  ╔════════════════════════════════╗`);
  console.log(`  ║  Kaizen — Port ${PORT}             ║`);
  console.log(`  ║  No database — in-memory mode  ║`);
  console.log(`  ║  Accounts reset on restart     ║`);
  console.log(`  ╚════════════════════════════════╝\n`);
});
