const IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * Biểu thức SQL chèn nguyên văn vào câu lệnh (ví dụ CURRENT_TIMESTAMP, "version + 1").
 * Chỉ tạo từ hằng chuỗi trong code, không bao giờ từ dữ liệu người dùng.
 */
class SqlRaw {
  /** @param {string} sql */
  constructor(sql) {
    this.sql = sql;
  }
}

/**
 * @typedef {Object} RunResult
 * @property {number} changes      Số dòng bị ảnh hưởng.
 * @property {number|null} lastInsertId  Khóa chính của dòng vừa chèn (nếu có).
 */

/**
 * Lớp trừu tượng cho tầng truy cập CSDL.
 *
 * Model và Service chỉ làm việc qua giao diện này, không gọi trực tiếp driver.
 * Phần SQL dùng chung (INSERT/UPDATE/DELETE/WHERE) được dựng ở đây bằng placeholder;
 * phần khác biệt giữa các hệ quản trị (upsert, insert-ignore, transaction, quản lý schema)
 * do lớp con hiện thực.
 *
 * Giao diện là đồng bộ vì driver hiện tại (better-sqlite3) đồng bộ. Driver bất đồng bộ
 * (mysql2, pg) cần một phiên bản async của giao diện này.
 *
 * @abstract
 */
class DatabaseAdapter {
  constructor() {
    if (new.target === DatabaseAdapter) {
      throw new TypeError('DatabaseAdapter là lớp trừu tượng, hãy dùng lớp con (ví dụ SqliteAdapter).');
    }
  }

  /**
   * Đánh dấu một biểu thức SQL để chèn nguyên văn thay cho placeholder.
   * @param {string} sql
   * @returns {SqlRaw}
   */
  static raw(sql) {
    return new SqlRaw(sql);
  }

  /** @returns {string} Tên hệ quản trị, ví dụ "sqlite". */
  get dialect() {
    throw new Error('Lớp con phải hiện thực dialect');
  }

  /**
   * Lấy một dòng.
   * @abstract
   * @param {string} _sql
   * @param {Array<*>} [_params]
   * @returns {Object|undefined}
   */
  get(_sql, _params) {
    throw new Error('Lớp con phải hiện thực get()');
  }

  /**
   * Lấy nhiều dòng.
   * @abstract
   * @param {string} _sql
   * @param {Array<*>} [_params]
   * @returns {Object[]}
   */
  all(_sql, _params) {
    throw new Error('Lớp con phải hiện thực all()');
  }

  /**
   * Thực thi câu lệnh ghi.
   * @abstract
   * @param {string} _sql
   * @param {Array<*>} [_params]
   * @returns {RunResult}
   */
  run(_sql, _params) {
    throw new Error('Lớp con phải hiện thực run()');
  }

  /**
   * Thực thi nhiều câu lệnh không tham số (DDL, migration).
   * @abstract
   * @param {string} _sql
   */
  exec(_sql) {
    throw new Error('Lớp con phải hiện thực exec()');
  }

  /**
   * Chạy `fn` trong một transaction; lỗi ném ra sẽ rollback. Gọi lồng nhau được.
   * @abstract
   * @template T
   * @param {() => T} _fn
   * @param {{ immediate?: boolean }} [_options] immediate: giữ khóa ghi ngay từ đầu.
   * @returns {T}
   */
  transaction(_fn, _options) {
    throw new Error('Lớp con phải hiện thực transaction()');
  }

  /**
   * Chèn một dòng, bỏ qua nếu trùng khóa duy nhất.
   * @abstract
   * @param {string} _table
   * @param {Object<string, *>} _data
   * @returns {RunResult}
   */
  insertIgnore(_table, _data) {
    throw new Error('Lớp con phải hiện thực insertIgnore()');
  }

  /**
   * Chèn hoặc cập nhật khi trùng khóa.
   * @abstract
   * @param {string} _table
   * @param {Object<string, *>} _data Giá trị khi chèn.
   * @param {string[]} _conflictColumns Cột tạo nên khóa duy nhất.
   * @param {Object<string, *>} _updateData Cột ghi đè khi trùng (có thể dùng {@link DatabaseAdapter.excluded}).
   * @returns {RunResult}
   */
  upsert(_table, _data, _conflictColumns, _updateData) {
    throw new Error('Lớp con phải hiện thực upsert()');
  }

  /**
   * Biểu thức trỏ tới giá trị vừa định chèn trong nhánh cập nhật của upsert.
   * @abstract
   * @param {string} _column
   * @returns {SqlRaw}
   */
  excluded(_column) {
    throw new Error('Lớp con phải hiện thực excluded()');
  }

  /** Đóng kết nối. @abstract */
  close() {
    throw new Error('Lớp con phải hiện thực close()');
  }

  /**
   * Biểu thức thời điểm hiện tại (chuẩn ANSI, chạy được trên SQLite/MySQL/PostgreSQL).
   * @returns {SqlRaw}
   */
  now() {
    return DatabaseAdapter.raw('CURRENT_TIMESTAMP');
  }

  /**
   * Kiểm tra và bọc tên bảng/cột. Chỉ nhận định danh ASCII để chặn SQL injection qua tên cột.
   * @param {string} name
   * @returns {string}
   */
  quoteIdentifier(name) {
    if (typeof name !== 'string' || !IDENTIFIER_PATTERN.test(name)) {
      throw new Error(`Tên định danh SQL không hợp lệ: ${name}`);
    }
    return `"${name}"`;
  }

  /**
   * Chuyển một giá trị thành đoạn SQL (placeholder hoặc biểu thức thô) và tham số kèm theo.
   * @param {*} value
   * @param {Array<*>} params Mảng tham số nhận thêm giá trị.
   * @returns {string}
   */
  valueSql(value, params) {
    if (value instanceof SqlRaw) {
      return value.sql;
    }
    params.push(value);
    return '?';
  }

  /**
   * Dựng phần cột và VALUES cho câu INSERT.
   * @param {Object<string, *>} data
   * @returns {{ columns: string, values: string, params: Array<*> }}
   */
  buildInsertParts(data) {
    const params = [];
    const columns = Object.keys(data).map((c) => this.quoteIdentifier(c)).join(', ');
    const values = Object.values(data).map((v) => this.valueSql(v, params)).join(', ');
    return { columns, values, params };
  }

  /**
   * Dựng danh sách "cột = giá trị" cho UPDATE/upsert.
   * @param {Object<string, *>} data
   * @param {Array<*>} params
   * @returns {string}
   */
  buildAssignments(data, params) {
    return Object.entries(data)
      .map(([c, v]) => `${this.quoteIdentifier(c)} = ${this.valueSql(v, params)}`)
      .join(', ');
  }

  /**
   * Dựng mệnh đề WHERE từ object điều kiện bằng nhau.
   * Giá trị `null` → IS NULL; mảng → IN (...); mảng rỗng → luôn sai.
   * @param {Object<string, *>} [where]
   * @param {Array<*>} [params] Mảng tham số nhận thêm giá trị.
   * @returns {string} Chuỗi rỗng nếu không có điều kiện, ngược lại " WHERE ...".
   */
  buildWhere(where = {}, params = []) {
    const parts = [];
    for (const [column, value] of Object.entries(where)) {
      const col = this.quoteIdentifier(column);
      if (value === null) {
        parts.push(`${col} IS NULL`);
      } else if (Array.isArray(value)) {
        if (value.length === 0) {
          parts.push('1 = 0');
        } else {
          parts.push(`${col} IN (${value.map((v) => this.valueSql(v, params)).join(', ')})`);
        }
      } else {
        parts.push(`${col} = ${this.valueSql(value, params)}`);
      }
    }
    return parts.length > 0 ? ` WHERE ${parts.join(' AND ')}` : '';
  }

  /**
   * Chèn một dòng.
   * @param {string} table
   * @param {Object<string, *>} data
   * @returns {number|null} Khóa chính vừa tạo.
   */
  insert(table, data) {
    const { columns, values, params } = this.buildInsertParts(data);
    return this.run(`INSERT INTO ${this.quoteIdentifier(table)} (${columns}) VALUES (${values})`, params).lastInsertId;
  }

  /**
   * Cập nhật các dòng thỏa điều kiện.
   * @param {string} table
   * @param {Object<string, *>} data
   * @param {Object<string, *>} where Bắt buộc, tránh cập nhật toàn bảng do sơ suất.
   * @returns {number} Số dòng thay đổi.
   */
  update(table, data, where) {
    if (Object.keys(data).length === 0) return 0;
    const params = [];
    const assignments = this.buildAssignments(data, params);
    const clause = this.buildWhere(where, params);
    if (!clause) {
      throw new Error('update() bắt buộc có điều kiện WHERE');
    }
    return this.run(`UPDATE ${this.quoteIdentifier(table)} SET ${assignments}${clause}`, params).changes;
  }

  /**
   * Xóa các dòng thỏa điều kiện.
   * @param {string} table
   * @param {Object<string, *>} where Bắt buộc.
   * @returns {number} Số dòng bị xóa.
   */
  delete(table, where) {
    const params = [];
    const clause = this.buildWhere(where, params);
    if (!clause) {
      throw new Error('delete() bắt buộc có điều kiện WHERE');
    }
    return this.run(`DELETE FROM ${this.quoteIdentifier(table)}${clause}`, params).changes;
  }
}

DatabaseAdapter.SqlRaw = SqlRaw;

module.exports = DatabaseAdapter;
