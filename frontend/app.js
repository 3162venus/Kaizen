const API    = `http://${location.hostname}:3001`;
const WS_URL = `ws://${location.hostname}:3001`;

const S = {
  token:'', userId:null, username:'', kzenId:'', isGuest:false,
  mode:'student', theme:'blue', dark:false,
  year:'freshman', school:'SSE', major:'', status:'focus',
  xp:0, hp:100, streak:0, sessions:0, battlesWon:0,
  currentRoom:null, isFocusing:false, focusSeconds:0, sessionXp:0,
  timerInterval:null, cameraOn:false, cameraStream:null,
  distractSecs:0, distractWarned:false, cameraFrameCount:0,
  roomUsers:[],
  rooms:[], friends:[],
  ws:null,
  battleId:null, battleDuration:25, battleOpponent:'',
  battleIsFocusing:false, battleTimer:null, battleSeconds:0,
  battleMyXp:0, battleOppXp:0,
  lbData:{ daily:[], monthly:[] }, lbTab:'daily',
};

const MAJORS = {
  SSE:['Computer Science','Software Engineering','Electrical Engineering','Mechanical Engineering','Civil Engineering','Mathematics','Physics','Biology','Chemistry','Environmental Science'],
  SB:['Business Administration','Finance','Accounting','Marketing','Management','International Business','Entrepreneurship','Economics'],
  SHSS:['International Studies','Political Science','Psychology','Sociology','Arabic Studies','Communication Studies','Philosophy','History','English Literature','French Studies'],
  SL:['Law','International Law','Business Law'],
};

const SUBJ_EMOJI = {math:'📐',cs:'💻',physics:'⚛️',chemistry:'🧪',biology:'🧬',econ:'📊',management:'🏢',law:'⚖️',arabic:'🌙',french:'🇫🇷',english:'📝',history:'📜',open:'✨'};

const YEAR_SUBJ = {
  freshman:['math','physics','chemistry','english','arabic','french'],
  sophomore:['math','cs','physics','chemistry','biology','econ'],
  junior:['cs','econ','management','history','law','french'],
  senior:['cs','management','law','english','history','open'],
};

const RANKS = [
  {name:'Bronze',min:0,max:500,icon:'🥉',color:'#c4956a'},
  {name:'Silver',min:500,max:1500,icon:'🥈',color:'#94a3b8'},
  {name:'Gold',min:1500,max:4000,icon:'🥇',color:'#f59e0b'},
  {name:'Platinum',min:4000,max:10000,icon:'💎',color:'#67e8f9'},
  {name:'Legend',min:10000,max:Infinity,icon:'👑',color:'#00ff88'},
];

const CHALLENGES = [
  {id:'c1',icon:'⏱️',title:'Focus for 30 minutes',sub:'In any room',reward:'+50 XP',val:50,done:false,target:30},
  {id:'c2',icon:'🔥',title:'Maintain a 3-day streak',sub:'Study 3 days in a row',reward:'+30 XP',val:30,done:false,target:3},
  {id:'c3',icon:'👥',title:'Study with 3 friends',sub:'Have 3 friends in your room',reward:'+40 XP',val:40,done:false,target:3},
  {id:'c4',icon:'📸',title:'Use camera for 5 minutes',sub:'Enable focus camera',reward:'+25 XP',val:25,done:false,target:5},
  {id:'c5',icon:'⚔️',title:'Win a battle',sub:'Beat someone in a focus battle',reward:'+60 XP',val:60,done:false,target:1},
];

const WARN_MSGS = [
  "👀 Uh... where'd you go?",
  "🙄 The exam won't study itself.",
  "😴 Still there? The book misses you.",
  "📵 Your future self is disappointed.",
  "🚨 XP PAUSED — pay attention!",
  "💀 You're losing XP right now.",
  "🤦 This is why we can't have nice things.",
  "👁️ Eyes forward, soldier.",
];

let faceMeshInst = null, faceMeshCam = null;
let selectedBattleDuration = 25;

function cap(s) { return s ? s[0].toUpperCase() + s.slice(1) : ''; }

function getRank(xp) { return RANKS.find(r => xp >= r.min && xp < r.max) || RANKS[0]; }

function getMult(mins, cam) {
  let b = mins >= 50 ? 2 : mins >= 25 ? 1.5 : mins >= 10 ? 1.2 : 1;
  return { rate: cam ? +(b * 1.2).toFixed(2) : b, label: `${cam ? +(b * 1.2).toFixed(2) : b}×` };
}

function saveLocal() {
  localStorage.setItem('kz_token', S.token);
  localStorage.setItem('kz_theme', S.theme);
  localStorage.setItem('kz_dark',  S.dark);
  localStorage.setItem('kz_status',S.status);
}

function applyTheme(t) {
  S.theme = t;
  document.documentElement.setAttribute('data-theme', t);
  document.querySelectorAll('.swatch').forEach(s => s.classList.toggle('active', s.dataset.t === t));
  saveLocal();
}

function applyMode(m) {
  S.mode = m;
  document.documentElement.setAttribute('data-mode', m);
  const isG = m === 'gamer';
  document.getElementById('mb-student')?.classList.toggle('active', !isG);
  document.getElementById('mb-gamer')?.classList.toggle('active', isG);
  const xl = isG ? 'EXP' : 'XP';
  document.getElementById('xp-lbl')      && (document.getElementById('xp-lbl').textContent = xl);
  document.getElementById('f-xp-lbl')    && (document.getElementById('f-xp-lbl').textContent = xl + ' earned');
  document.getElementById('p-xp-lbl')    && (document.getElementById('p-xp-lbl').textContent = 'Total ' + xl);
  document.getElementById('rooms-title') && (document.getElementById('rooms-title').textContent = isG ? '🎮 Zones' : '📚 Study Rooms');
  document.getElementById('ch-title')    && (document.getElementById('ch-title').textContent = isG ? '⚔️ Daily Quests' : '🎯 Daily Challenges');
  document.getElementById('lb-title')    && (document.getElementById('lb-title').textContent = isG ? 'Hall of Fame' : 'Leaderboard');
  if (isG) updateGamerRank();
}

function setMode(m) { applyMode(m); saveLocal(); }

function toggleDark() {
  S.dark = document.getElementById('dark-tog').checked;
  document.documentElement.setAttribute('data-dark', S.dark);
  saveLocal();
}

function updateHPUI() {
  const pct = Math.max(0, Math.min(100, S.hp));
  document.querySelectorAll('.hp-fill').forEach(e => e.style.width = pct + '%');
  document.getElementById('home-hp') && (document.getElementById('home-hp').textContent = S.hp);
  document.getElementById('f-hp')    && (document.getElementById('f-hp').textContent = S.hp);
  document.getElementById('hp-lbl')  && (document.getElementById('hp-lbl').textContent = `${S.hp}/100`);
  document.getElementById('p-hp-lbl')&& (document.getElementById('p-hp-lbl').textContent = `${S.hp}/100`);
}

function updateXPUI() {
  document.getElementById('home-xp')  && (document.getElementById('home-xp').textContent = S.xp);
  document.getElementById('f-xp')     && (document.getElementById('f-xp').textContent = S.sessionXp);
  document.getElementById('f-xp-val') && (document.getElementById('f-xp-val').textContent = S.sessionXp);
}

function updateGamerRank() {
  const rank = getRank(S.xp);
  const next  = RANKS[RANKS.indexOf(rank) + 1];
  const badge = document.getElementById('rank-badge');
  const fill  = document.getElementById('rank-fill');
  const lbl   = document.getElementById('rank-lbl');
  if (badge) { badge.textContent = `${rank.icon} ${rank.name}`; badge.style.color = rank.color; }
  if (next) {
    const pct = Math.round(((S.xp - rank.min) / (rank.max - rank.min)) * 100);
    if (fill) fill.style.width = pct + '%';
    if (lbl)  lbl.textContent = `${S.xp - rank.min}/${rank.max - rank.min} EXP to ${next.name}`;
  } else {
    if (fill) fill.style.width = '100%';
    if (lbl)  lbl.textContent = 'Max rank reached 👑';
  }
}

function goTo(screen) {
  document.querySelectorAll('.screen').forEach(s => { s.classList.remove('active'); s.style.display = 'none'; });
  const el = document.getElementById('screen-' + screen);
  if (!el) return;
  el.style.display = 'flex';
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('active')));
  if (screen === 'home')        renderHome();
  if (screen === 'leaderboard') { renderLeaderboard('daily'); loadLeaderboard(); }
  if (screen === 'profile')     renderProfile();
  if (screen === 'friends')     renderFriendsScreen();
  if (screen === 'battles')     renderBattlesScreen();
}

function toast(msg, dur = 3500) {
  const el = document.createElement('div');
  el.textContent = msg;
  Object.assign(el.style, {
    position:'fixed', bottom:'24px', left:'50%',
    transform:'translateX(-50%) translateY(20px)',
    background:'var(--t)', color:'var(--bg)',
    padding:'10px 20px', borderRadius:'50px',
    fontSize:'13px', fontWeight:'500', zIndex:'9999',
    boxShadow:'0 4px 16px rgba(0,0,0,.2)', whiteSpace:'nowrap',
    transition:'transform .3s ease,opacity .3s ease', opacity:'0',
  });
  document.body.appendChild(el);
  requestAnimationFrame(() => { el.style.opacity = '1'; el.style.transform = 'translateX(-50%) translateY(0)'; });
  setTimeout(() => { el.style.opacity = '0'; el.style.transform = 'translateX(-50%) translateY(10px)'; setTimeout(() => el.remove(), 300); }, dur);
}

let introSlide = 0;
function setupIntro() {
  const btn = document.getElementById('btn-intro-next');
  if (!btn) return;
  btn.addEventListener('click', () => {
    if (introSlide < 2) {
      const slides = document.querySelectorAll('.intro-slide');
      const dots   = document.querySelectorAll('.dot');
      slides[introSlide].classList.add('exit');
      slides[introSlide].classList.remove('active');
      setTimeout(() => slides[introSlide].classList.remove('exit'), 500);
      introSlide++;
      slides[introSlide].classList.add('active');
      dots.forEach((d, i) => d.classList.toggle('active', i === introSlide));
      if (introSlide === 2) btn.textContent = "Let's Go →";
    } else {
      hideScreen('intro');
      goTo('auth');
    }
  });
}

function hideScreen(id) {
  const el = document.getElementById('screen-' + id);
  if (el) { el.classList.remove('active'); el.style.display = 'none'; }
}

function switchTab(tab) {
  document.querySelectorAll('.atab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
  document.querySelectorAll('.aform').forEach(f => f.classList.toggle('active', f.id === 'form-' + tab));
}

function updateMajors() {
  const school = document.getElementById('r-school')?.value || 'SSE';
  const sel    = document.getElementById('r-major');
  if (sel) sel.innerHTML = (MAJORS[school] || []).map(m => `<option value="${m}">${m}</option>`).join('');
}

function setupAuth() {
  document.querySelectorAll('.atab').forEach(t => {
    t.addEventListener('click', () => switchTab(t.dataset.tab));
  });
  document.querySelectorAll('.pick-btn').forEach(b => {
    b.addEventListener('click', () => {
      document.querySelectorAll('.pick-btn').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
    });
  });
  const ui = document.getElementById('r-uname');
  if (ui) {
    ui.addEventListener('input', () => {
      const v = ui.value.trim();
      const ok = document.getElementById('uname-ok');
      if (ok) ok.textContent = v.length >= 3 ? (/^[a-zA-Z0-9_]+$/.test(v) ? '✅' : '❌') : '';
      const sugg = document.getElementById('uname-sugg');
      if (sugg && v.length >= 2) {
        const base = v.toLowerCase().replace(/[^a-z0-9]/g, '');
        sugg.innerHTML = [`${base}_aui`,`${base}_2025`,`_${base}`,`${base}_kz`].slice(0,3)
          .map(s => `<button class="sugg-p" onclick="document.getElementById('r-uname').value='${s}';document.getElementById('uname-ok').textContent='✅';document.getElementById('uname-sugg').innerHTML=''">${s}</button>`).join('');
      } else if (sugg) sugg.innerHTML = '';
    });
  }
  const pw = document.getElementById('r-pw');
  if (pw) pw.addEventListener('input', () => {
    const fill = document.getElementById('pw-fill');
    if (!fill) return;
    const l = pw.value.length;
    let pct = 0, col = '';
    if (l === 0) { fill.style.width = '0'; return; }
    if (l < 6)       { pct = 25;  col = '#ef4444'; }
    else if (l < 8)  { pct = 50;  col = '#f59e0b'; }
    else if (l < 12) { pct = 75;  col = '#f59e0b'; }
    else             { pct = 100; col = '#22c55e'; }
    fill.style.width = pct + '%';
    fill.style.background = col;
  });
  updateMajors();
}

function toStep(n) {
  for (let i = 1; i <= 3; i++) {
    document.getElementById(`rs${i}`)?.classList.toggle('active', i === n);
  }
}

function togglePw(id) {
  const el = document.getElementById(id);
  if (el) el.type = el.type === 'password' ? 'text' : 'password';
}

async function submitRegister() {
  const username = document.getElementById('r-uname').value.trim();
  const email    = document.getElementById('r-email').value.trim();
  const pw       = document.getElementById('r-pw').value;
  const pw2      = document.getElementById('r-pw2').value;
  const year     = document.getElementById('r-year').value;
  const school   = document.getElementById('r-school').value;
  const major    = document.getElementById('r-major').value;
  const mode     = document.querySelector('.pick-btn.active')?.dataset.pick || 'student';
  const err      = document.getElementById('reg-err');
  err.textContent = '';

  if (!username || username.length < 3) { err.textContent = 'Username min 3 characters.'; return; }
  if (!/^[a-zA-Z0-9_]+$/.test(username)) { err.textContent = 'Username: letters, numbers, _ only.'; return; }
  if (!email.includes('@')) { err.textContent = 'Enter a valid email.'; return; }
  if (pw.length < 8) { err.textContent = 'Password min 8 characters.'; return; }
  if (pw !== pw2)    { err.textContent = 'Passwords do not match.'; return; }

  const btn = document.getElementById('reg-btn');
  btn.disabled = true; btn.textContent = 'Creating...';

  try {
    const res  = await fetch(`${API}/api/register`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ username, email, password:pw, mode, year, school, major }) });
    const data = await res.json();
    if (!data.ok) { err.textContent = data.error; btn.disabled = false; btn.textContent = 'Create Account'; return; }
    document.getElementById('verify-email-hint').textContent = `We sent a verification link to ${email}`;
    toStep(3);
    btn.disabled = false; btn.textContent = 'Create Account';
  } catch {
    err.textContent = 'Cannot reach server. Is the backend running?';
    btn.disabled = false; btn.textContent = 'Create Account';
  }
}

async function submitLogin() {
  const identifier = document.getElementById('l-id').value.trim();
  const pw         = document.getElementById('l-pw').value;
  const err        = document.getElementById('login-err');
  err.textContent  = '';

  try {
    const res  = await fetch(`${API}/api/login`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ identifier, password:pw }) });
    const data = await res.json();
    if (!data.ok) { err.textContent = data.error; return; }

    S.token    = data.token;
    S.username = data.username;
    S.kzenId   = data.kzenId;
    S.mode     = data.mode || 'student';
    S.year     = data.year || 'freshman';
    S.school   = data.school || 'SSE';
    S.major    = data.major || '';
    S.theme    = data.theme || 'blue';
    S.dark     = !!data.dark;
    S.status   = data.status || 'focus';
    S.isGuest  = false;
    saveLocal();
    applyTheme(S.theme);
    applyMode(S.mode);
    document.documentElement.setAttribute('data-dark', S.dark);
    await loadMe();
    connectWS();
    await loadRooms();
    await loadFriends();
    goTo('home');
  } catch {
    err.textContent = 'Cannot reach server. Is the backend running?';
  }
}

async function loadMe() {
  try {
    const res  = await fetch(`${API}/api/me`, { headers: { Authorization: 'Bearer ' + S.token } });
    const data = await res.json();
    if (data.ok) {
      S.xp         = data.user.xp_total   || 0;
      S.hp         = data.user.hp          || 100;
      S.streak     = data.user.streak      || 0;
      S.sessions   = data.user.sessions    || 0;
      S.battlesWon = data.user.battles_won || 0;
    }
  } catch {}
}

function enterGuest() {
  S.isGuest  = true;
  S.username = 'Guest_' + Math.floor(Math.random() * 9999);
  S.kzenId   = 'GUEST';
  S.xp       = 0;
  S.hp       = 100;
  applyMode('student');
  goTo('home');
}

function forgotPw() {
  toast('Password reset link sent! (Requires email config on backend)');
}

function logout() {
  if (!confirm('Sign out?')) return;
  stopCamera();
  if (S.ws) { S.ws.close(); S.ws = null; }
  S.token = ''; S.username = ''; S.kzenId = ''; S.isGuest = false;
  localStorage.removeItem('kz_token');
  goTo('auth');
}

function loadChallenges() {
  const today = new Date().toDateString();
  if (localStorage.getItem('kz_ch_date') !== today) {
    CHALLENGES.forEach(c => c.done = false);
    localStorage.setItem('kz_ch_date', today);
    localStorage.removeItem('kz_ch_done');
    return;
  }
  const done = JSON.parse(localStorage.getItem('kz_ch_done') || '[]');
  done.forEach(id => { const c = CHALLENGES.find(x => x.id === id); if (c) c.done = true; });
}

function saveChallenges() {
  localStorage.setItem('kz_ch_done', JSON.stringify(CHALLENGES.filter(c => c.done).map(c => c.id)));
  localStorage.setItem('kz_ch_date', new Date().toDateString());
}

function awardChallenge(id) {
  const c = CHALLENGES.find(x => x.id === id);
  if (!c || c.done) return;
  c.done = true;
  S.xp  += c.val;
  S.hp   = Math.min(100, S.hp + 5);
  saveChallenges();
  renderChallenges();
  updateHPUI();
  updateXPUI();
  toast(`🎯 Challenge complete! ${c.title} — ${c.reward}`);
}

function autoCheckChallenges() {
  const mins = Math.floor(S.focusSeconds / 60);
  if (!CHALLENGES[0].done && mins >= 30) awardChallenge('c1');
  if (!CHALLENGES[1].done && S.streak >= 3) awardChallenge('c2');
  const friendsInRoom = S.roomUsers.filter(u => S.friends.some(f => f.username === u.username)).length;
  if (!CHALLENGES[2].done && friendsInRoom >= 3) awardChallenge('c3');
  if (!CHALLENGES[3].done && S.cameraOn) {
    S.cameraFrameCount++;
    if (S.cameraFrameCount >= 300) awardChallenge('c4');
  }
}

function renderChallenges() {
  const el = document.getElementById('ch-list');
  if (!el) return;
  const mins = Math.floor(S.focusSeconds / 60);
  const prog = { c1:Math.min(mins,30), c2:Math.min(S.streak,3), c3:0, c4:Math.min(Math.floor(S.cameraFrameCount/60),5), c5:0 };
  el.innerHTML = CHALLENGES.map(c => {
    const p   = prog[c.id] || 0;
    const pct = c.id === 'c5' ? (c.done ? 100 : 0) : Math.round((p / c.target) * 100);
    return `<div class="ch-card ${c.done ? 'done' : ''}">
      <span class="ch-ico">${c.icon}</span>
      <div class="ch-body">
        <div class="ch-title">${c.title}</div>
        <div class="ch-sub">${c.sub}</div>
        ${!c.done && c.id !== 'c5' ? `<div class="ch-prog">${p} / ${c.target}</div>` : ''}
      </div>
      <span class="ch-reward">${c.reward}</span>
      <div class="ch-check">${c.done ? '✓' : ''}</div>
    </div>`;
  }).join('');

  const rcp = document.getElementById('room-ch-panel');
  if (rcp && S.currentRoom) {
    const active = CHALLENGES.filter(c => !c.done).slice(0, 3);
    rcp.innerHTML = `<p class="rcp-title">Active Challenges</p>` + active.map(c => {
      const p   = prog[c.id] || 0;
      const pct = c.id === 'c5' ? 0 : Math.round((p / c.target) * 100);
      return `<div class="rcp-item"><span>${c.icon}</span><span style="flex:1;font-size:12px;color:var(--t2)">${c.title}</span><div class="rcp-bar"><div class="rcp-fill" style="width:${pct}%"></div></div><span style="font-size:11px;color:var(--t3);margin-left:6px">${pct}%</span></div>`;
    }).join('');
  }
}

function startResetTimer() {
  function tick() {
    const now = new Date(), mid = new Date(now);
    mid.setHours(24, 0, 0, 0);
    const d = Math.floor((mid - now) / 1000);
    const h = String(Math.floor(d / 3600)).padStart(2, '0');
    const m = String(Math.floor((d % 3600) / 60)).padStart(2, '0');
    const s = String(d % 60).padStart(2, '0');
    const el = document.getElementById('reset-t');
    if (el) el.textContent = `${h}:${m}:${s}`;
  }
  tick();
  setInterval(tick, 1000);
}

function renderHome() {
  if (S.isGuest) {
    document.getElementById('home-uname').textContent = S.username;
    const av = document.getElementById('home-av');
    if (av) av.textContent = 'G';
    document.getElementById('home-tags').innerHTML = '<span class="tag">Guest</span>';
    document.getElementById('home-xp').textContent = S.xp;
    updateHPUI();
    renderChallenges();
    renderRoomsList();
    startResetTimer();
    return;
  }
  const av = document.getElementById('home-av');
  if (av) av.textContent = S.username[0]?.toUpperCase() || '?';
  document.getElementById('home-uname').textContent = S.username;
  document.getElementById('home-tags').innerHTML = `
    <span class="tag tag-mode">${S.mode === 'gamer' ? 'Gamer' : 'Student'}</span>
    <span class="tag">${cap(S.year)}</span>
    <span class="tag">${S.school}</span>
  `;
  updateXPUI();
  updateHPUI();
  applyMode(S.mode);
  renderChallenges();
  renderFriendsOnline();
  renderRoomsList();
  renderSuggestedRooms();
  renderBattlePreview();
  startResetTimer();
}

function renderFriendsOnline() {
  const el = document.getElementById('friends-online');
  if (!el) return;
  if (!S.friends.length) { el.innerHTML = '<span class="no-f-txt">No friends yet — add some! 👥</span>'; return; }
  el.innerHTML = S.friends.map(f => `
    <div class="fo-card">
      <div class="fo-av ${f.status === 'focus' ? 'on' : ''}">
        ${f.username[0].toUpperCase()}
        <span class="fo-dot ${f.status || 'idle'}"></span>
      </div>
      <span class="fo-name">${f.username}</span>
      <span class="fo-xp">⚡${f.xp_total || 0}</span>
    </div>
  `).join('');
}

function renderBattlePreview() {
  const el = document.getElementById('battle-preview');
  if (!el) return;
  const online = S.friends.filter(f => f.status === 'focus');
  if (!online.length) {
    el.innerHTML = '<p class="no-f-txt">No friends online to battle. Invite someone!</p>';
    return;
  }
  el.innerHTML = online.slice(0, 3).map(f => `
    <div class="bprev-card" onclick="quickChallenge('${f.username}')">
      <div class="bprev-title">⚔️ vs ${f.username}</div>
      <div class="bprev-sub">Currently focusing</div>
      <div class="bprev-badge">Challenge</div>
    </div>
  `).join('');
}

async function loadRooms() {
  try {
    const res  = await fetch(`${API}/api/rooms`);
    const data = await res.json();
    if (data.ok) S.rooms = data.rooms;
  } catch { S.rooms = []; }
}

function renderRoomsList() {
  const el = document.getElementById('rooms-list');
  if (!el) return;
  if (S.isGuest) { el.innerHTML = '<p style="color:var(--t3);font-size:13px;padding:8px 0">Create an account to join rooms and compete!</p>'; return; }
  if (!S.rooms.length) { el.innerHTML = '<p style="color:var(--t3);font-size:13px;padding:8px 0">No rooms yet — create one!</p>'; return; }
  el.innerHTML = S.rooms.map(r => {
    const emoji = SUBJ_EMOJI[r.subject] || '✨';
    const cnt   = r.users || r.user_count || 0;
    const full  = cnt >= r.max_users;
    return `<div class="room-card" onclick="${full ? '' : `joinRoom('${r.id}')`}">
      <span class="room-emoji">${emoji}</span>
      <div class="room-info">
        <div class="room-name">${r.name}</div>
        <div class="room-meta">
          <span class="room-cnt">${cnt}/${r.max_users}</span>
          ${r.camera_required ? '<span class="room-cam">📷 Camera</span>' : ''}
          ${full ? '<span class="room-full">Full</span>' : ''}
        </div>
        <div style="font-size:10px;color:var(--t3);margin-top:2px">by ${r.creator_name || '?'}</div>
      </div>
      <button class="join-btn" ${full ? 'disabled' : ''} onclick="event.stopPropagation();joinRoom('${r.id}')">${full ? 'Full' : 'Join'}</button>
    </div>`;
  }).join('');
}

function renderSuggestedRooms() {
  const sec = document.getElementById('sugg-sec');
  const el  = document.getElementById('sugg-rooms');
  if (!sec || !el || S.isGuest) { if (sec) sec.style.display = 'none'; return; }
  const pref = YEAR_SUBJ[S.year] || [];
  const sugg = S.rooms.filter(r => pref.includes(r.subject)).slice(0, 3);
  if (!sugg.length) { sec.style.display = 'none'; return; }
  sec.style.display = '';
  el.innerHTML = sugg.map(r => {
    const emoji = SUBJ_EMOJI[r.subject] || '✨';
    const cnt   = r.users || r.user_count || 0;
    return `<div class="room-card" onclick="joinRoom('${r.id}')">
      <span class="room-emoji">${emoji}</span>
      <div class="room-info">
        <div class="room-name">${r.name}</div>
        <div class="room-meta">
          <span class="room-cnt">${cnt}/${r.max_users}</span>
          <span class="room-ytag">✨ For ${cap(S.year)}s</span>
        </div>
      </div>
      <button class="join-btn" onclick="event.stopPropagation();joinRoom('${r.id}')">Join</button>
    </div>`;
  }).join('');
}

function openCreateRoom()  { if (S.isGuest) { toast('Create an account to make rooms!'); return; } document.getElementById('modal-room').classList.remove('hidden'); }
function closeCreateRoom() { document.getElementById('modal-room').classList.add('hidden'); }

async function submitCreateRoom() {
  const name   = document.getElementById('nr-name').value.trim();
  const subj   = document.getElementById('nr-subj').value;
  const max    = parseInt(document.getElementById('nr-max').value) || 10;
  const cam    = document.getElementById('nr-cam').checked;
  const errEl  = document.getElementById('nr-err');
  errEl.textContent = '';
  if (!name) { errEl.textContent = 'Enter a room name.'; return; }

  try {
    const res  = await fetch(`${API}/api/rooms`, { method:'POST', headers:{'Content-Type':'application/json','Authorization':'Bearer '+S.token}, body: JSON.stringify({ name, subject:subj, maxUsers:Math.min(20,Math.max(2,max)), cameraRequired:cam }) });
    const data = await res.json();
    if (!data.ok) { errEl.textContent = data.error; return; }
    S.rooms.unshift({ ...data.room, users: 0 });
    closeCreateRoom();
    renderRoomsList();
    joinRoom(data.room.id);
  } catch { errEl.textContent = 'Cannot reach server.'; }
}

function joinRoom(roomId) {
  const room = S.rooms.find(r => r.id === roomId);
  if (!room) return;
  S.currentRoom   = room;
  S.sessionXp     = 0;
  S.focusSeconds  = 0;
  S.isFocusing    = false;
  S.cameraFrameCount = 0;
  S.distractSecs  = 0;
  S.distractWarned= false;

  document.getElementById('f-room-name').textContent = room.name;
  document.getElementById('f-room-sub').textContent  = `0/${room.max_users}`;
  document.getElementById('f-xp').textContent        = '0';
  document.getElementById('f-xp-val').textContent    = '0';
  document.getElementById('f-hp').textContent        = S.hp;
  document.getElementById('f-streak').textContent    = S.streak + '🔥';
  document.getElementById('ring-time').textContent   = '00:00';
  document.getElementById('ring-mult').textContent   = '1×';
  document.getElementById('ring-fg').style.strokeDashoffset = '439.8';
  document.getElementById('focus-btn').className     = 'focus-btn';
  document.getElementById('focus-ico').textContent   = '▶';
  document.getElementById('focus-lbl').textContent   = 'Start Focusing';
  document.getElementById('sdot').className          = 'sdot';
  document.getElementById('stxt').textContent        = 'Ready when you are';
  document.getElementById('cam-tog').checked         = false;
  document.getElementById('cam-wrap').classList.add('hidden');
  document.getElementById('warn-box').classList.add('hidden');

  renderRoomUsers([]);
  renderChallenges();
  wsSend({ type:'join_room', roomId });
  goTo('focus');
}

function renderRoomUsers(users) {
  S.roomUsers = users;
  const list  = document.getElementById('users-list');
  const cnt   = document.getElementById('room-uc');
  if (!list) return;
  if (cnt) cnt.textContent = users.length;
  document.getElementById('f-room-sub').textContent = `${users.length}/${S.currentRoom?.max_users || 20}`;
  list.innerHTML = '';

  const me = document.createElement('li');
  me.className = 'user-row';
  me.innerHTML = `
    <span class="sdot ${S.isFocusing ? 'focusing' : ''}" id="me-dot"></span>
    <div class="user-av">${S.username[0]?.toUpperCase() || '?'}</div>
    <div style="flex:1;min-width:0">
      <div class="user-name">${S.username} <span style="color:var(--t3);font-size:10px">(you)</span></div>
      <div class="user-xp" id="me-xp">${S.sessionXp} ${S.mode === 'gamer' ? 'EXP' : 'XP'}</div>
    </div>
  `;
  list.appendChild(me);

  users.filter(u => u.username !== S.username).forEach(u => {
    const isFr = S.friends.some(f => f.username === u.username);
    const li   = document.createElement('li');
    li.className = 'user-row';
    li.innerHTML = `
      <span class="sdot ${u.focusing ? 'focusing' : ''}"></span>
      <div class="user-av" style="${isFr ? 'border:2px solid var(--a)' : ''}">${u.username[0].toUpperCase()}</div>
      <div style="flex:1;min-width:0">
        <div class="user-name">${u.username}${isFr ? ' 👥' : ''}</div>
        <div class="user-xp">${u.xp} XP ${u.cameraOn ? '📷' : ''}</div>
      </div>
    `;
    list.appendChild(li);
  });
}

function toggleFocus() {
  S.isFocusing = !S.isFocusing;
  const btn = document.getElementById('focus-btn');
  if (S.isFocusing) {
    btn.className = 'focus-btn';
    document.getElementById('focus-ico').textContent = '⏸';
    document.getElementById('focus-lbl').textContent = 'Pause';
    document.getElementById('sdot').className        = 'sdot focusing';
    document.getElementById('stxt').textContent      = S.mode === 'gamer' ? '⚔️ XP FARMING...' : '🔥 Focusing — XP accumulating';
    const md = document.getElementById('me-dot');
    if (md) md.className = 'sdot focusing';
    if (!S.timerInterval) S.timerInterval = setInterval(tickFocus, 1000);
  } else {
    btn.className = 'focus-btn paused';
    document.getElementById('focus-ico').textContent = '▶';
    document.getElementById('focus-lbl').textContent = 'Resume';
    document.getElementById('sdot').className        = 'sdot';
    document.getElementById('stxt').textContent      = 'Paused';
    const md = document.getElementById('me-dot');
    if (md) md.className = 'sdot';
    clearInterval(S.timerInterval); S.timerInterval = null;
  }
  wsSend({ type:'focus_status', focusing:S.isFocusing, cameraOn:S.cameraOn });
}

function tickFocus() {
  if (!S.isFocusing) return;
  S.focusSeconds++;
  const mins = Math.floor(S.focusSeconds / 60);
  const mult = getMult(mins, S.cameraOn);

  if (S.distractSecs < 5) S.sessionXp = Math.round(S.sessionXp + mult.rate);
  if (S.cameraOn) S.cameraFrameCount++;

  const mm = String(mins).padStart(2, '0');
  const ss = String(S.focusSeconds % 60).padStart(2, '0');
  document.getElementById('ring-time').textContent = `${mm}:${ss}`;
  document.getElementById('ring-mult').textContent = mult.label;
  document.getElementById('f-xp').textContent      = S.sessionXp;
  document.getElementById('f-xp-val').textContent  = S.sessionXp;
  const mx = document.getElementById('me-xp');
  if (mx) mx.textContent = `${S.sessionXp} ${S.mode === 'gamer' ? 'EXP' : 'XP'}`;
  document.getElementById('ring-fg').style.strokeDashoffset = 439.8 * (1 - Math.min(S.focusSeconds / 3600, 1));

  if (S.focusSeconds % 300 === 0) { S.hp = Math.min(100, S.hp + 1); updateHPUI(); }
  autoCheckChallenges();
  if (S.focusSeconds % 5 === 0) wsSend({ type:'xp_update', xp:S.sessionXp });
}

async function leaveRoom() {
  clearInterval(S.timerInterval); S.timerInterval = null; S.isFocusing = false;
  stopCamera();
  if (S.sessionXp > 0 && !S.isGuest) {
    S.xp += S.sessionXp;
    S.sessions++;
    const today = new Date().toDateString();
    if (localStorage.getItem('kz_last_date') !== today) {
      S.streak++;
      localStorage.setItem('kz_last_date', today);
      S.hp = Math.min(100, S.hp + 10);
      updateHPUI();
    }
    try { await fetch(`${API}/api/xp`, { method:'POST', headers:{'Content-Type':'application/json','Authorization':'Bearer '+S.token}, body: JSON.stringify({ xp: S.sessionXp }) }); } catch {}
  }
  wsSend({ type:'leave_room' });
  S.currentRoom = null; S.sessionXp = 0; S.roomUsers = [];
  await loadRooms();
  goTo('home');
}

async function toggleCamera() {
  const checked = document.getElementById('cam-tog').checked;
  const wrap    = document.getElementById('cam-wrap');
  if (checked) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video:{ facingMode:'user', width:320, height:240 }, audio:false });
      S.cameraStream = stream;
      S.cameraOn     = true;
      document.getElementById('cam-vid').srcObject = stream;
      wrap.classList.remove('hidden');
      await initFaceMesh(document.getElementById('cam-vid'));
      toast('📷 Camera on — +20% XP bonus active. Detection is 100% local 🔒');
    } catch(e) {
      document.getElementById('cam-tog').checked = false;
      S.cameraOn = false;
      toast(e.name === 'NotAllowedError' ? 'Camera access denied. You can still study without it!' : 'Camera unavailable: ' + e.message);
    }
  } else {
    stopCamera();
  }
  wsSend({ type:'focus_status', focusing:S.isFocusing, cameraOn:S.cameraOn });
}

async function initFaceMesh(video) {
  if (!window.FaceMesh) return;
  faceMeshInst = new FaceMesh({ locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${f}` });
  faceMeshInst.setOptions({ maxNumFaces:1, refineLandmarks:true, minDetectionConfidence:.5, minTrackingConfidence:.5 });
  faceMeshInst.onResults(onFaceResults);
  if (window.Camera) {
    faceMeshCam = new Camera(video, { onFrame: async () => { if (faceMeshInst) await faceMeshInst.send({ image: video }); }, width:320, height:240 });
    faceMeshCam.start();
  }
}

function onFaceResults(results) {
  const dot  = document.getElementById('cam-dot');
  const txt  = document.getElementById('cam-txt');
  const has  = results.multiFaceLandmarks?.length > 0;
  if (!has) { S.distractSecs++; if (dot) { dot.className = 'cam-dot distracted'; } if (txt) txt.textContent = 'No face'; handleDistract(); return; }

  const lm  = results.multiFaceLandmarks[0];
  const ear = calcEAR(lm);
  const fwd = checkFwd(lm);
  const ok  = ear > 0.15 && fwd;

  if (!ok) {
    S.distractSecs++;
    if (dot) dot.className = 'cam-dot distracted';
    if (txt) txt.textContent = ear <= 0.15 ? 'Eyes closed?' : 'Look at screen!';
    handleDistract();
  } else {
    S.distractSecs = Math.max(0, S.distractSecs - 1);
    S.distractWarned = false;
    if (dot) dot.className = 'cam-dot focusing';
    if (txt) txt.textContent = 'Focused ✓';
    document.getElementById('warn-box').classList.add('hidden');
  }
}

function calcEAR(lm) {
  try {
    const v = Math.abs(lm[159].y - lm[145].y);
    const h = Math.abs(lm[133].x - lm[33].x);
    return h > 0 ? v / h : 0.3;
  } catch { return 0.3; }
}

function checkFwd(lm) {
  try {
    const nose   = lm[1];
    const center = (lm[234].x + lm[454].x) / 2;
    return Math.abs(nose.x - center) < 0.12;
  } catch { return true; }
}

function handleDistract() {
  if (!S.isFocusing) return;
  if (S.distractSecs >= 5 && !S.distractWarned) {
    S.distractWarned = true;
    const wb  = document.getElementById('warn-box');
    const wt  = document.getElementById('warn-txt');
    if (wt) wt.textContent = WARN_MSGS[Math.floor(Math.random() * WARN_MSGS.length)];
    wb?.classList.remove('hidden');
    playWarnSound();
  }
}

function playWarnSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain= ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.setValueAtTime(660, ctx.currentTime + 0.15);
    osc.frequency.setValueAtTime(880, ctx.currentTime + 0.3);
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
    osc.start(); osc.stop(ctx.currentTime + 0.6);
  } catch {}
}

function stopCamera() {
  if (faceMeshCam)  { try { faceMeshCam.stop(); }  catch {} faceMeshCam = null; }
  if (faceMeshInst) { try { faceMeshInst.close(); } catch {} faceMeshInst = null; }
  if (S.cameraStream) { S.cameraStream.getTracks().forEach(t => t.stop()); S.cameraStream = null; }
  S.cameraOn = false;
  const v = document.getElementById('cam-vid');
  if (v) v.srcObject = null;
  document.getElementById('cam-wrap')?.classList.add('hidden');
  document.getElementById('warn-box')?.classList.add('hidden');
  S.distractSecs = 0; S.distractWarned = false;
}

function renderBattlesScreen() {
  const el = document.getElementById('battle-target-result');
  if (el) { el.classList.add('hidden'); el.innerHTML = ''; }
  document.getElementById('recent-battles').innerHTML = '<p style="color:var(--t3);font-size:13px">No battles yet. Challenge someone!</p>';
}

function selectDuration(min, btn) {
  selectedBattleDuration = min;
  document.querySelectorAll('.dur-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}

async function searchBattleTarget() {
  const q   = document.getElementById('battle-search').value.trim();
  const res = document.getElementById('battle-target-result');
  if (!q) return;
  res.classList.remove('hidden');
  res.innerHTML = '<p style="color:var(--t3);font-size:13px">Searching...</p>';
  try {
    const r    = await fetch(`${API}/api/users/search?q=${encodeURIComponent(q)}`, { headers:{ Authorization:'Bearer '+S.token } });
    const data = await r.json();
    if (!data.ok || !data.users.length) { res.innerHTML = '<p style="color:var(--t3)">No users found.</p>'; return; }
    res.innerHTML = data.users.filter(u => u.username !== S.username).map(u => `
      <div class="fc-card" style="margin-bottom:8px">
        <div class="fc-av">${u.username[0].toUpperCase()}</div>
        <div class="fc-info">
          <div class="fc-name">${u.username}</div>
          <div class="fc-id">${u.kzen_id || ''} · ⚡${u.xp_total || 0}</div>
        </div>
        <button class="btn-battle-ch" onclick="sendBattleChallenge('${u.username}')">⚔️ Challenge</button>
      </div>
    `).join('');
  } catch { res.innerHTML = '<p style="color:var(--red)">Search failed.</p>'; }
}

function quickChallenge(username) {
  S.battleOpponent = username;
  sendBattleChallenge(username);
}

function sendBattleChallenge(opponent) {
  if (S.isGuest) { toast('Create an account to start battles!'); return; }
  S.battleOpponent = opponent;
  wsSend({ type:'battle_challenge', opponent, duration:selectedBattleDuration });
  toast(`⚔️ Challenge sent to ${opponent} for ${selectedBattleDuration} min!`);
}

function forfeitBattle() {
  if (!confirm('Forfeit the battle? You lose all XP for this session.')) return;
  wsSend({ type:'battle_forfeit' });
}

function toggleBattleFocus() {
  S.battleIsFocusing = !S.battleIsFocusing;
  const btn = document.getElementById('battle-focus-btn');
  if (S.battleIsFocusing) {
    btn.className = 'focus-btn';
    document.getElementById('battle-focus-ico').textContent = '⏸';
    document.getElementById('battle-focus-lbl').textContent = 'Pause';
    document.getElementById('bl-my-status').textContent    = '🔥 Focusing';
    if (!S.timerInterval) S.timerInterval = setInterval(tickBattle, 1000);
  } else {
    btn.className = 'focus-btn paused';
    document.getElementById('battle-focus-ico').textContent = '▶';
    document.getElementById('battle-focus-lbl').textContent = 'Resume';
    document.getElementById('bl-my-status').textContent    = 'Paused';
    clearInterval(S.timerInterval); S.timerInterval = null;
  }
  wsSend({ type:'focus_status', focusing:S.battleIsFocusing, cameraOn:false });
}

function tickBattle() {
  if (!S.battleIsFocusing) return;
  S.battleSeconds++;
  const mins = Math.floor(S.battleSeconds / 60);
  const secs = S.battleSeconds % 60;
  const mult = getMult(mins, false);
  S.battleMyXp = Math.round(S.battleMyXp + mult.rate);

  const totalSecs = S.battleDuration * 60;
  const remaining = Math.max(0, totalSecs - S.battleSeconds);
  const rm = String(Math.floor(remaining / 60)).padStart(2, '0');
  const rs = String(remaining % 60).padStart(2, '0');
  document.getElementById('bl-timer').textContent = `${rm}:${rs}`;

  document.getElementById('bl-my-xp').textContent     = S.battleMyXp;
  document.getElementById('bl-my-xp-big').textContent = S.battleMyXp;

  const maxXp = S.battleDuration * 60 * 2;
  const myPct = Math.min(S.battleMyXp / maxXp, 1);
  document.getElementById('bl-my-ring').style.strokeDashoffset = 326.7 * (1 - myPct);

  if (S.focusSeconds % 5 === 0) wsSend({ type:'xp_update', xp:S.battleMyXp });
}

function startBattle(data) {
  S.battleId       = data.battleId;
  S.battleDuration = data.duration;
  S.battleOpponent = data.challenger === S.username ? data.opponent : data.challenger;
  S.battleMyXp     = 0;
  S.battleOppXp    = 0;
  S.battleSeconds  = 0;
  S.battleIsFocusing = false;
  clearInterval(S.timerInterval); S.timerInterval = null;

  document.getElementById('battle-live-title').textContent = `⚔️ ${S.username} vs ${S.battleOpponent}`;
  document.getElementById('bl-my-name').textContent        = S.username + ' (you)';
  document.getElementById('bl-opp-name').textContent       = S.battleOpponent;
  document.getElementById('bl-my-xp').textContent          = '0';
  document.getElementById('bl-my-xp-big').textContent      = '0';
  document.getElementById('bl-opp-xp-big').textContent     = '0';
  document.getElementById('bl-timer').textContent          = `${String(data.duration).padStart(2,'0')}:00`;
  document.getElementById('bl-my-status').textContent      = 'Ready...';
  document.getElementById('bl-opp-status').textContent     = 'Ready...';
  document.getElementById('battle-countdown').style.display = '';
  document.getElementById('battle-arena').style.display     = 'none';
  document.getElementById('battle-focus-controls').style.display = 'none';
  document.getElementById('bl-my-ring').style.strokeDashoffset   = '326.7';
  document.getElementById('bl-opp-ring').style.strokeDashoffset  = '326.7';

  goTo('battle-live');

  let cd = 3;
  document.getElementById('bcd-num').textContent = cd;
  const cdInterval = setInterval(() => {
    cd--;
    document.getElementById('bcd-num').textContent = cd;
    if (cd <= 0) {
      clearInterval(cdInterval);
      document.getElementById('battle-countdown').style.display      = 'none';
      document.getElementById('battle-arena').style.display          = '';
      document.getElementById('battle-focus-controls').style.display = '';
    }
  }, 1000);
}

function endBattleUI(data) {
  clearInterval(S.timerInterval); S.timerInterval = null;
  S.battleIsFocusing = false;
  S.battleId = null;

  const won = data.winner === S.username;

  if (won) {
    S.xp += data.totalXp;
    updateXPUI();
    awardChallenge('c5');
    toast(`🏆 You won! +${data.totalXp} XP claimed!`);
  } else {
    toast(`💀 You lost. ${data.winner} takes ${data.totalXp} XP.`);
  }

  document.getElementById('result-icon').textContent  = won ? '🏆' : '💀';
  document.getElementById('result-title').textContent = won ? 'You Won!' : 'You Lost';
  document.getElementById('result-sub').textContent   = won ? `+${data.totalXp} XP claimed!` : `${data.winner} takes everything.`;
  document.getElementById('result-breakdown').innerHTML = `
    <div class="rb-row"><span>Your XP</span><b>${won ? data.winnerXp : data.loserXp}</b></div>
    <div class="rb-row"><span>Opponent XP</span><b>${won ? data.loserXp : data.winnerXp}</b></div>
    <div class="rb-row"><span>Total stake</span><b>${data.totalXp} XP</b></div>
    ${data.forfeit ? '<div class="rb-row"><span>Result</span><b>Forfeit</b></div>' : ''}
  `;

  goTo('battle-result');
}

async function loadLeaderboard() {
  try {
    const [d, m] = await Promise.all([
      fetch(`${API}/api/leaderboard?period=daily`).then(r => r.json()),
      fetch(`${API}/api/leaderboard?period=monthly`).then(r => r.json()),
    ]);
    if (d.ok) S.lbData.daily   = d.data;
    if (m.ok) S.lbData.monthly = m.data;
    renderLeaderboard(S.lbTab);
    const rank = S.lbData.daily.findIndex(u => u.username === S.username);
    if (rank >= 0 && rank < 10) awardChallenge('c5');
  } catch {}
}

function switchLBTab(tab) {
  S.lbTab = tab;
  document.querySelectorAll('.tab').forEach((b,i) => b.classList.toggle('active', (tab==='daily'&&i===0)||(tab==='monthly'&&i===1)));
  renderLeaderboard(tab);
}

function renderLeaderboard(tab) {
  const el = document.getElementById('lb-list');
  if (!el) return;
  let rows = [...(S.lbData[tab] || [])];
  if (S.username && !rows.find(r => r.username === S.username)) rows.push({ username:S.username, kzen_id:S.kzenId, xp:S.xp, isMe:true });
  rows = rows.map(r => ({ ...r, isMe: r.username === S.username })).sort((a,b) => b.xp - a.xp);
  const seen = new Set();
  rows = rows.filter(r => { if (seen.has(r.username)) return false; seen.add(r.username); return true; });
  const med = ['🥇','🥈','🥉'], rc = ['gold','silver','bronze'];
  el.innerHTML = rows.map((u,i) => `
    <div class="lb-row ${u.isMe ? 'me' : ''}">
      <span class="lb-rank ${rc[i]||''}">${i<3?med[i]:i+1}</span>
      <div class="lb-av">${u.username[0].toUpperCase()}</div>
      <div style="flex:1">
        <span class="lb-name">${u.username}${u.isMe?' (you)':''}</span>
        ${u.battles_won ? `<div class="lb-battle">⚔️ ${u.battles_won} battles won</div>` : ''}
      </div>
      <div style="text-align:right">
        <div class="lb-xp">${(u.xp||0).toLocaleString()}</div>
        <div style="font-size:10px;color:var(--t3)">${S.mode==='gamer'?'EXP':'XP'}</div>
      </div>
    </div>
  `).join('');
}

async function loadFriends() {
  if (S.isGuest) return;
  try {
    const res  = await fetch(`${API}/api/friends`, { headers:{ Authorization:'Bearer '+S.token } });
    const data = await res.json();
    if (data.ok) S.friends = data.friends;
  } catch {}
}

function renderFriendsScreen() {
  renderFriendsList();
}

function renderFriendsList() {
  const el = document.getElementById('friends-list');
  if (!el) return;
  if (S.isGuest) { el.innerHTML = '<p style="color:var(--t3);font-size:13px">Create an account to add friends!</p>'; return; }
  if (!S.friends.length) { el.innerHTML = '<p style="color:var(--t3);font-size:13px">No friends yet. Search above.</p>'; return; }
  el.innerHTML = S.friends.map(f => `
    <div class="fc-card">
      <div class="fc-av">${f.username[0].toUpperCase()}<span class="fo-dot ${f.status||'idle'}" style="position:absolute;bottom:0;right:0"></span></div>
      <div class="fc-info">
        <div class="fc-name">${f.username}</div>
        <div class="fc-id">${f.kzen_id||''}</div>
        <div class="fc-r2"><span class="fc-xp">⚡${f.xp_total||0} XP</span><span class="fc-stk">🔥${f.streak||0} days</span></div>
      </div>
      <button class="btn-battle-ch" onclick="quickChallenge('${f.username}')">⚔️ Battle</button>
    </div>
  `).join('');
}

async function searchFriend() {
  const q   = document.getElementById('f-search').value.trim();
  const res = document.getElementById('f-result');
  if (!q || q.length < 2) return;
  res.classList.remove('hidden');
  res.innerHTML = '<p style="color:var(--t3);font-size:13px">Searching...</p>';
  try {
    const r    = await fetch(`${API}/api/users/search?q=${encodeURIComponent(q)}`, { headers:{ Authorization:'Bearer '+S.token } });
    const data = await r.json();
    if (!data.ok || !data.users.length) { res.innerHTML = '<p style="color:var(--t3)">No users found.</p>'; return; }
    res.innerHTML = data.users.map(u => {
      const already = S.friends.some(f => f.username === u.username) || u.username === S.username;
      return `<div class="fc-card" style="margin-bottom:8px">
        <div class="fc-av">${u.username[0].toUpperCase()}</div>
        <div class="fc-info"><div class="fc-name">${u.username}</div><div class="fc-id">${u.kzen_id||''}</div><div class="fc-r2"><span class="fc-xp">⚡${u.xp_total||0}</span><span class="fc-stk">🔥${u.streak||0}</span></div></div>
        <button class="btn-add" ${already?'disabled':''} onclick="addFriend(${u.id},'${u.username}','${u.kzen_id}',${u.xp_total||0},${u.streak||0})">${already?(u.username===S.username?'(You)':'Added ✓'):'Add'}</button>
      </div>`;
    }).join('');
  } catch { res.innerHTML = '<p style="color:var(--red)">Search failed.</p>'; }
}

async function addFriend(id, username, kzenId, xp, streak) {
  try {
    const res  = await fetch(`${API}/api/friends`, { method:'POST', headers:{'Content-Type':'application/json','Authorization':'Bearer '+S.token}, body: JSON.stringify({ friendId:id }) });
    const data = await res.json();
    if (data.ok) {
      S.friends.push({ username, kzen_id:kzenId, xp_total:xp, streak, status:'idle' });
      renderFriendsList();
      renderFriendsOnline();
      toast(`${username} added! 👥`);
      document.getElementById('f-result').classList.add('hidden');
      document.getElementById('f-search').value = '';
    }
  } catch { toast('Could not add friend.'); }
}

function renderProfile() {
  const av = document.getElementById('profile-av');
  if (av) av.textContent = S.username[0]?.toUpperCase() || '?';
  document.getElementById('p-name').textContent    = S.username;
  document.getElementById('p-id').textContent      = S.kzenId || 'KZEN#—';
  document.getElementById('id-display').textContent= S.kzenId || 'KZEN#—';
  document.getElementById('p-kzen-id').textContent = S.kzenId || 'KZEN#—';
  document.getElementById('p-xp').textContent      = S.xp.toLocaleString();
  document.getElementById('p-streak').textContent  = S.streak + '🔥';
  document.getElementById('p-sessions').textContent= S.sessions;
  document.getElementById('p-bw').textContent      = S.battlesWon + '⚔️';
  document.getElementById('mb-student')?.classList.toggle('active', S.mode !== 'gamer');
  document.getElementById('mb-gamer')?.classList.toggle('active', S.mode === 'gamer');
  document.querySelectorAll('.swatch').forEach(s => s.classList.toggle('active', s.dataset.t === S.theme));
  document.querySelectorAll('.sopt').forEach(b => b.classList.toggle('active', b.dataset.s === S.status));
  const dt = document.getElementById('dark-tog');
  if (dt) dt.checked = S.dark;
  updateHPUI();
  if (S.mode === 'gamer') updateGamerRank();
}

function setStatus(s) {
  S.status = s;
  document.querySelectorAll('.sopt').forEach(b => b.classList.toggle('active', b.dataset.s === s));
  saveLocal();
}

function copyID() {
  const id = S.kzenId;
  if (!id || id === 'KZEN#—') { toast('No ID yet — create an account!'); return; }
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(id).then(() => toast('📋 KZEN ID copied!')).catch(() => fbCopy(id));
  } else fbCopy(id);
}

function fbCopy(text) {
  const el = document.createElement('textarea');
  el.value = text; el.style.cssText = 'position:fixed;opacity:0';
  document.body.appendChild(el); el.select();
  document.execCommand('copy');
  document.body.removeChild(el);
  toast('📋 KZEN ID copied!');
}

function connectWS() {
  if (S.ws) { S.ws.close(); S.ws = null; }
  try {
    S.ws = new WebSocket(WS_URL);
    S.ws.onopen = () => { if (S.token) wsSend({ type:'auth', token:S.token }); };
    S.ws.onmessage = e => { try { handleWS(JSON.parse(e.data)); } catch {} };
    S.ws.onclose = () => { setTimeout(() => { if (S.token && !S.isGuest) connectWS(); }, 3000); };
    S.ws.onerror = () => {};
  } catch {}
}

function wsSend(d) {
  if (S.ws?.readyState === 1) S.ws.send(JSON.stringify(d));
}

function handleWS(msg) {
  switch(msg.type) {
    case 'room_joined':
    case 'room_users':
      renderRoomUsers(msg.users || []);
      autoCheckChallenges();
      renderChallenges();
      break;
    case 'new_room':
      if (msg.room && !S.rooms.find(r => r.id === msg.room.id)) {
        S.rooms.unshift(msg.room);
        renderRoomsList();
        renderSuggestedRooms();
      }
      break;
    case 'room_count_update': {
      const r = S.rooms.find(x => x.id === msg.roomId);
      if (r) { r.users = msg.count; renderRoomsList(); }
      break;
    }
    case 'live_count': {
      const el = document.getElementById('live-count');
      if (el) el.textContent = `${msg.count} ${msg.count === 1 ? 'person' : 'people'} studying right now`;
      break;
    }
    case 'xp_cheat':
      toast('⚠️ XP rate too high — cheating detected. Session XP reset.');
      S.sessionXp = 0;
      break;
    case 'battle_invite':
      if (confirm(`⚔️ ${msg.challenger} challenges you to a ${msg.duration}-min focus battle!\n\nWinner takes all XP. Accept?`)) {
        wsSend({ type:'battle_accept', challenger:msg.challenger, duration:msg.duration });
      } else {
        wsSend({ type:'battle_decline', challenger:msg.challenger });
      }
      break;
    case 'battle_start':
      startBattle(msg);
      break;
    case 'battle_xp_update':
      S.battleOppXp = msg.challengerXp !== undefined ?
        (S.username === document.getElementById('bl-my-name')?.textContent?.replace(' (you)','') ? msg.opponentXp : msg.challengerXp) :
        msg.opponentXp;
      document.getElementById('bl-opp-xp-big').textContent = S.battleOppXp;
      const maxXp = (S.battleDuration || 25) * 60 * 2;
      document.getElementById('bl-opp-ring').style.strokeDashoffset = 326.7 * (1 - Math.min(S.battleOppXp / maxXp, 1));
      document.getElementById('bl-opp-status').textContent = S.battleOppXp > 0 ? '🔥 Focusing' : 'Waiting...';
      break;
    case 'battle_end':
      endBattleUI(msg);
      break;
    case 'battle_declined':
      toast(`${msg.opponent} declined your battle challenge.`);
      break;
    case 'battle_error':
      toast('⚠️ ' + msg.message);
      break;
  }
}

async function init() {
  S.theme = localStorage.getItem('kz_theme') || 'blue';
  S.dark  = localStorage.getItem('kz_dark')  === 'true';
  S.status= localStorage.getItem('kz_status')|| 'focus';
  document.documentElement.setAttribute('data-dark', S.dark);
  applyTheme(S.theme);

  document.querySelectorAll('.swatch').forEach(sw => sw.addEventListener('click', () => applyTheme(sw.dataset.t)));
  document.querySelectorAll('.screen').forEach(s => { s.style.display = 'none'; s.classList.remove('active'); });

  setupIntro();
  setupAuth();
  loadChallenges();

  const token = localStorage.getItem('kz_token');
  if (token) {
    S.token = token;
    try {
      const res  = await fetch(`${API}/api/me`, { headers:{ Authorization:'Bearer '+token } });
      const data = await res.json();
      if (data.ok) {
        S.username   = data.user.username;
        S.kzenId     = data.user.kzenId   || '';
        S.mode       = data.user.mode     || 'student';
        S.year       = data.user.year     || 'freshman';
        S.school     = data.user.school   || 'SSE';
        S.major      = data.user.major    || '';
        S.theme      = data.user.theme    || S.theme;
        S.dark       = !!data.user.dark;
        S.status     = data.user.status   || 'focus';
        S.xp         = data.user.xp_total || 0;
        S.hp         = data.user.hp       || 100;
        S.streak     = data.user.streak   || 0;
        S.sessions   = data.user.sessions || 0;
        S.battlesWon = data.user.battles_won || 0;
        S.isGuest    = false;
        applyTheme(S.theme);
        document.documentElement.setAttribute('data-dark', S.dark);
        applyMode(S.mode);
        connectWS();
        await loadRooms();
        await loadFriends();
        goTo('home');
        return;
      }
    } catch {}
    localStorage.removeItem('kz_token');
  }

  const intro = document.getElementById('screen-intro');
  intro.style.display = 'flex';
  intro.classList.add('active');

  if ('Notification' in window && Notification.permission === 'default') {
    setTimeout(() => Notification.requestPermission(), 8000);
  }
}

document.addEventListener('DOMContentLoaded', init);
