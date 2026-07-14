const { Pool } = require('pg');

const pool = new Pool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     parseInt(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME     || 'kaizen',
  user:     process.env.DB_USER     || 'kaizen_user',
  password: process.env.DB_PASSWORD || 'changeme',
});

pool.on('error', err => console.error('[DB]', err.message));

async function init() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id            SERIAL PRIMARY KEY,
      username      TEXT UNIQUE NOT NULL,
      email         TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      kzen_id       TEXT UNIQUE,
      verified      BOOLEAN DEFAULT false,
      verify_token  TEXT,
      mode          TEXT DEFAULT 'student',
      year          TEXT DEFAULT 'freshman',
      school        TEXT DEFAULT 'SSE',
      major         TEXT DEFAULT '',
      theme         TEXT DEFAULT 'blue',
      dark          BOOLEAN DEFAULT false,
      status        TEXT DEFAULT 'focus',
      xp_daily      INTEGER DEFAULT 0,
      xp_monthly    INTEGER DEFAULT 0,
      xp_total      INTEGER DEFAULT 0,
      hp            INTEGER DEFAULT 100,
      streak        INTEGER DEFAULT 0,
      sessions      INTEGER DEFAULT 0,
      battles_won   INTEGER DEFAULT 0,
      battles_lost  INTEGER DEFAULT 0,
      last_seen     TIMESTAMPTZ DEFAULT NOW(),
      last_study    TIMESTAMPTZ,
      created_at    TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS rooms (
      id              TEXT PRIMARY KEY,
      name            TEXT UNIQUE NOT NULL,
      subject         TEXT NOT NULL,
      max_users       INTEGER DEFAULT 10,
      camera_required BOOLEAN DEFAULT false,
      creator_id      INTEGER REFERENCES users(id),
      creator_name    TEXT,
      user_count      INTEGER DEFAULT 0,
      active          BOOLEAN DEFAULT true,
      created_at      TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS friends (
      user_id    INTEGER REFERENCES users(id),
      friend_id  INTEGER REFERENCES users(id),
      PRIMARY KEY (user_id, friend_id)
    );

    CREATE TABLE IF NOT EXISTS battles (
      id            SERIAL PRIMARY KEY,
      challenger_id INTEGER REFERENCES users(id),
      opponent_id   INTEGER REFERENCES users(id),
      duration_min  INTEGER NOT NULL,
      status        TEXT DEFAULT 'pending',
      winner_id     INTEGER REFERENCES users(id),
      xp_stake      INTEGER DEFAULT 0,
      started_at    TIMESTAMPTZ,
      ended_at      TIMESTAMPTZ,
      created_at    TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  console.log('[DB] Tables ready');
  scheduleResets();
}

async function createUser({ username, email, hash, mode, year, school, major, verifyToken }) {
  const r = await pool.query(
    `INSERT INTO users (username,email,password_hash,mode,year,school,major,verify_token)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
    [username, email, hash, mode, year, school, major, verifyToken]
  );
  return r.rows[0].id;
}

async function setKzenID(userId, kzenId) {
  await pool.query('UPDATE users SET kzen_id=$1 WHERE id=$2', [kzenId, userId]);
}

async function verifyUser(token) {
  const r = await pool.query(
    `UPDATE users SET verified=true, verify_token=NULL WHERE verify_token=$1 RETURNING id,username`,
    [token]
  );
  return r.rows[0] || null;
}

async function getByUsername(username) {
  const r = await pool.query('SELECT * FROM users WHERE LOWER(username)=LOWER($1)', [username]);
  return r.rows[0] || null;
}

async function getByEmail(email) {
  const r = await pool.query('SELECT * FROM users WHERE LOWER(email)=LOWER($1)', [email]);
  return r.rows[0] || null;
}

async function getById(id) {
  const r = await pool.query('SELECT * FROM users WHERE id=$1', [id]);
  return r.rows[0] || null;
}

async function updateSeen(id) {
  await pool.query('UPDATE users SET last_seen=NOW() WHERE id=$1', [id]);
}

async function searchUsers(q) {
  const r = await pool.query(
    `SELECT id,username,kzen_id,xp_total,streak FROM users
     WHERE verified=true AND (LOWER(username) LIKE LOWER($1) OR LOWER(kzen_id) LIKE LOWER($1))
     LIMIT 8`,
    [`%${q}%`]
  );
  return r.rows;
}

async function addXP(userId, amount) {
  await pool.query(
    `UPDATE users SET xp_daily=xp_daily+$2, xp_monthly=xp_monthly+$2,
     xp_total=xp_total+$2, last_study=NOW() WHERE id=$1`,
    [userId, amount]
  );
}

async function updateHP(userId, hp) {
  await pool.query('UPDATE users SET hp=$2 WHERE id=$1', [userId, Math.max(0, Math.min(100, hp))]);
}

async function bumpStreak(userId) {
  await pool.query('UPDATE users SET streak=streak+1, sessions=sessions+1 WHERE id=$1', [userId]);
}

async function addFriend(a, b) {
  await pool.query('INSERT INTO friends VALUES($1,$2) ON CONFLICT DO NOTHING', [a, b]);
  await pool.query('INSERT INTO friends VALUES($2,$1) ON CONFLICT DO NOTHING', [a, b]);
}

async function getFriends(userId) {
  const r = await pool.query(
    `SELECT u.id,u.username,u.kzen_id,u.xp_total,u.streak,u.status,u.last_seen
     FROM friends f JOIN users u ON f.friend_id=u.id WHERE f.user_id=$1`,
    [userId]
  );
  return r.rows;
}

async function createRoom({ id, name, subject, maxUsers, cameraRequired, creatorId, creatorName }) {
  const r = await pool.query(
    `INSERT INTO rooms(id,name,subject,max_users,camera_required,creator_id,creator_name)
     VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [id, name, subject, maxUsers, cameraRequired, creatorId, creatorName]
  );
  return r.rows[0];
}

async function getRooms() {
  const r = await pool.query('SELECT * FROM rooms WHERE active=true ORDER BY created_at DESC LIMIT 60');
  return r.rows;
}

async function getRoomByName(name) {
  const r = await pool.query('SELECT * FROM rooms WHERE LOWER(name)=LOWER($1)', [name]);
  return r.rows[0] || null;
}

async function setRoomCount(roomId, count) {
  await pool.query('UPDATE rooms SET user_count=$2 WHERE id=$1', [roomId, count]);
}

async function createBattle({ challengerId, opponentId, durationMin }) {
  const r = await pool.query(
    `INSERT INTO battles(challenger_id,opponent_id,duration_min) VALUES($1,$2,$3) RETURNING id`,
    [challengerId, opponentId, durationMin]
  );
  return r.rows[0].id;
}

async function settleBattle(battleId, winnerId, xpStake) {
  await pool.query(
    `UPDATE battles SET status='finished',winner_id=$2,xp_stake=$3,ended_at=NOW() WHERE id=$1`,
    [battleId, winnerId, xpStake]
  );
  await pool.query('UPDATE users SET battles_won=battles_won+1 WHERE id=$1', [winnerId]);
}

async function getLeaderboard(period) {
  const col = period === 'monthly' ? 'xp_monthly' : 'xp_daily';
  const r = await pool.query(
    `SELECT username,kzen_id,${col} as xp,battles_won FROM users
     WHERE verified=true AND ${col}>0 ORDER BY ${col} DESC LIMIT 50`
  );
  return r.rows;
}

function scheduleResets() {
  setInterval(async () => {
    await pool.query('UPDATE users SET xp_daily=0').catch(() => {});
    await pool.query(`UPDATE users SET hp=GREATEST(0,hp-10)
      WHERE last_study IS NULL OR last_study < NOW()-INTERVAL '24 hours'`).catch(() => {});
  }, 86400000);
  setInterval(async () => {
    await pool.query('UPDATE users SET xp_monthly=0').catch(() => {});
  }, 86400000 * 30);
}

init().catch(e => console.warn('[DB] No PostgreSQL:', e.message));

module.exports = {
  createUser, setKzenID, verifyUser,
  getByUsername, getByEmail, getById, updateSeen, searchUsers,
  addXP, updateHP, bumpStreak,
  addFriend, getFriends,
  createRoom, getRooms, getRoomByName, setRoomCount,
  createBattle, settleBattle,
  getLeaderboard,
};
