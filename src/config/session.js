const session = require('express-session');
const SqliteSessionStore = require('../db/SqliteSessionStore');

const SESSION_COOKIE_NAME = 'vcraft.sid';

/**
 * Middleware phiên lưu trong SQLite (cookie httpOnly, sameSite=lax, secure khi production).
 * @returns {import('express').RequestHandler}
 */
function createSession() {
  const isProduction = process.env.NODE_ENV === 'production';
  const secret = process.env.SESSION_SECRET;
  if (isProduction && (!secret || secret.length < 32)) {
    throw new Error('SESSION_SECRET phải có ít nhất 32 ký tự trong production.');
  }

  return session({
    name: SESSION_COOKIE_NAME,
    secret: secret || 'vcraft-session-secret-change-in-production-min-32-chars',
    store: new SqliteSessionStore(),
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      maxAge: SqliteSessionStore.DEFAULT_TTL_MS
    }
  });
}

module.exports = { createSession, SESSION_COOKIE_NAME };
