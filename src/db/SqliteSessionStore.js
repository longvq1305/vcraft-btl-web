const { Store } = require('express-session');
const { adapter: defaultAdapter } = require('../config/database');

/**
 * Lấy hạn phiên từ cookie, ưu tiên thời điểm hết hạn tuyệt đối. Phiên chưa đăng nhập
 * (chỉ giữ CSRF token/flash) bị giới hạn ở ANONYMOUS_TTL_MS để bảng sessions không phình theo lượt truy cập.
 * @param {import('express-session').SessionData} data
 * @param {number} now Thời điểm hiện tại theo mili giây.
 * @returns {number} Thời điểm hết hạn theo mili giây.
 */
function getExpiresAt(data, now) {
  const cookie = data.cookie;
  let expiresAt = now + SqliteSessionStore.DEFAULT_TTL_MS;
  const absolute = cookie?.expires != null ? new Date(cookie.expires).getTime() : NaN;
  if (Number.isFinite(absolute)) {
    expiresAt = absolute;
  } else if (Number.isFinite(cookie?.maxAge)) {
    expiresAt = now + Math.trunc(cookie.maxAge);
  }
  return data.user ? expiresAt : Math.min(expiresAt, now + SqliteSessionStore.ANONYMOUS_TTL_MS);
}

/** Kho phiên Express lưu nội dung và hạn dùng trong SQLite. */
class SqliteSessionStore extends Store {
  static DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

  static ANONYMOUS_TTL_MS = 24 * 60 * 60 * 1000;

  /** @param {import('./DatabaseAdapter')} [adapter] Adapter của cơ sở dữ liệu ứng dụng. */
  constructor(adapter = defaultAdapter) {
    super();
    this.adapter = adapter;
  }

  /**
   * Đọc phiên còn hiệu lực, bỏ bản ghi không đọc được như phiên đã hết hạn.
   * @param {string} sid
   * @param {(err: Error|null, data?: import('express-session').SessionData|null) => void} callback
   */
  get(sid, callback) {
    let data = null;
    try {
      const row = this.adapter.get('SELECT sess FROM sessions WHERE sid = ? AND expires_at > ?', [sid, Date.now()]);
      if (row) {
        try {
          data = JSON.parse(row.sess);
        } catch (err) {
          if (!(err instanceof SyntaxError)) throw err;
          this.adapter.delete('sessions', { sid });
        }
      }
    } catch (err) {
      return callback(err);
    }
    return callback(null, data);
  }

  /**
   * Ghi phiên và dọn các phiên đã hết hạn dựa vào chỉ mục expires_at.
   * @param {string} sid
   * @param {import('express-session').SessionData} data
   * @param {(err?: Error) => void} callback
   */
  set(sid, data, callback) {
    try {
      const now = Date.now();
      const sess = JSON.stringify(data);
      const expires_at = getExpiresAt(data, now);
      this.adapter.run('DELETE FROM sessions WHERE expires_at <= ?', [now]);
      this.adapter.upsert('sessions', { sid, sess, expires_at }, ['sid'], { sess, expires_at });
    } catch (err) {
      return callback(err);
    }
    return callback();
  }

  /**
   * Xóa phiên khỏi kho, kể cả khi chưa hết hạn.
   * @param {string} sid
   * @param {(err?: Error) => void} callback
   */
  destroy(sid, callback) {
    try {
      this.adapter.delete('sessions', { sid });
    } catch (err) {
      return callback(err);
    }
    return callback();
  }

  /**
   * Cập nhật hạn phiên còn hoạt động mà không ghi đè dữ liệu phiên.
   * @param {string} sid
   * @param {import('express-session').SessionData} data
   * @param {(err?: Error) => void} callback
   */
  touch(sid, data, callback) {
    try {
      const now = Date.now();
      this.adapter.run('UPDATE sessions SET expires_at = ? WHERE sid = ? AND expires_at > ?', [getExpiresAt(data, now), sid, now]);
    } catch (err) {
      return callback(err);
    }
    return callback();
  }
}

module.exports = SqliteSessionStore;
