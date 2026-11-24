const Database = require('better-sqlite3');
const DatabaseAdapter = require('./DatabaseAdapter');

/**
 * Hiện thực DatabaseAdapter cho SQLite qua better-sqlite3.
 * Cú pháp riêng của SQLite (PRAGMA, INSERT OR IGNORE, BEGIN IMMEDIATE, user_version)
 * chỉ xuất hiện trong lớp này và trong file schema.
 */
class SqliteAdapter extends DatabaseAdapter {
  /**
   * @param {string|import('better-sqlite3').Database} target Đường dẫn file, ':memory:'
   *   hoặc một kết nối better-sqlite3 có sẵn.
   */
  constructor(target) {
    super();
    this.connection = typeof target === 'string' ? new Database(target) : target;
    /** @type {Map<string, import('better-sqlite3').Statement>} */
    this.statements = new Map();

    if (!this.connection.memory) {
      this.connection.pragma('journal_mode = WAL');
    }
    this.connection.pragma('foreign_keys = ON');
  }

  get dialect() {
    return 'sqlite';
  }

  /**
   * Lấy prepared statement từ bộ đệm, tránh biên dịch lại cùng một câu SQL.
   * @param {string} sql
   * @returns {import('better-sqlite3').Statement}
   */
  prepare(sql) {
    let stmt = this.statements.get(sql);
    if (!stmt) {
      stmt = this.connection.prepare(sql);
      this.statements.set(sql, stmt);
    }
    return stmt;
  }

  get(sql, params = []) {
    return this.prepare(sql).get(...params);
  }

  all(sql, params = []) {
    return this.prepare(sql).all(...params);
  }

  run(sql, params = []) {
    const info = this.prepare(sql).run(...params);
    return {
      changes: info.changes,
      lastInsertId: info.lastInsertRowid === undefined ? null : Number(info.lastInsertRowid)
    };
  }

  exec(sql) {
    this.connection.exec(sql);
  }

  transaction(fn, { immediate = false } = {}) {
    const tx = this.connection.transaction(fn);
    // Khi đã ở trong transaction, better-sqlite3 tự dùng savepoint; không mở BEGIN IMMEDIATE lồng.
    return immediate && !this.connection.inTransaction ? tx.immediate() : tx();
  }

  close() {
    this.statements.clear();
    this.connection.close();
  }

  insertIgnore(table, data) {
    const { columns, values, params } = this.buildInsertParts(data);
    return this.run(`INSERT OR IGNORE INTO ${this.quoteIdentifier(table)} (${columns}) VALUES (${values})`, params);
  }

  upsert(table, data, conflictColumns, updateData) {
    const { columns, values, params } = this.buildInsertParts(data);
    const conflict = conflictColumns.map((c) => this.quoteIdentifier(c)).join(', ');
    const assignments = this.buildAssignments(updateData, params);
    return this.run(
      `INSERT INTO ${this.quoteIdentifier(table)} (${columns}) VALUES (${values}) `
      + `ON CONFLICT(${conflict}) DO UPDATE SET ${assignments}`,
      params
    );
  }

  excluded(column) {
    return DatabaseAdapter.raw(`excluded.${this.quoteIdentifier(column)}`);
  }

  /**
   * Phiên bản schema đã áp dụng (PRAGMA user_version).
   * @returns {number}
   */
  getSchemaVersion() {
    return this.connection.pragma('user_version', { simple: true });
  }

  /**
   * @param {number} version
   */
  setSchemaVersion(version) {
    this.connection.pragma(`user_version = ${Math.trunc(Number(version))}`);
  }

  /**
   * Lấy câu CREATE TABLE đang lưu của một bảng (dùng cho migration).
   * @param {string} table
   * @returns {string|null}
   */
  getTableDefinition(table) {
    const row = this.get("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?", [table]);
    return row ? row.sql : null;
  }

  /**
   * Tạm tắt kiểm tra khóa ngoại khi dựng lại bảng trong migration.
   * PRAGMA foreign_keys không có tác dụng bên trong transaction nên phải gọi bên ngoài.
   * @template T
   * @param {() => T} fn
   * @returns {T}
   */
  withoutForeignKeys(fn) {
    this.connection.pragma('foreign_keys = OFF');
    try {
      return fn();
    } finally {
      this.connection.pragma('foreign_keys = ON');
    }
  }
}

module.exports = SqliteAdapter;
