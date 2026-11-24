const { uniqueSlug } = require('../utils/slug');

const ORDER_BY_PATTERN = /^[A-Za-z_][A-Za-z0-9_.]*( (ASC|DESC))?(, *[A-Za-z_][A-Za-z0-9_.]*( (ASC|DESC))?)*$/i;

/** Số bản ghi mỗi trang mặc định và tối đa. */
const DEFAULT_PER_PAGE = 12;
const MAX_PER_PAGE = 100;

/**
 * @typedef {Object} Pagination
 * @property {number} page        Trang hiện tại (bắt đầu từ 1).
 * @property {number} perPage     Số bản ghi mỗi trang.
 * @property {number} total       Tổng số bản ghi.
 * @property {number} totalPages  Tổng số trang (tối thiểu 1).
 * @property {boolean} hasPrev
 * @property {boolean} hasNext
 */

/**
 * Lớp cơ sở cho mọi Model: CRUD theo khóa chính, truy vấn theo điều kiện,
 * phân trang, sinh slug duy nhất và transaction. Model con chỉ khai báo
 * `static tableName` (và `slugColumn` nếu có) rồi bổ sung truy vấn nghiệp vụ.
 *
 * Model không giữ kết nối riêng: mọi truy vấn đi qua `this.db` (một DatabaseAdapter),
 * nên có thể tạo bản sao gắn với CSDL khác bằng {@link BaseModel#withAdapter}.
 */
class BaseModel {
  /** @type {string} Tên bảng; lớp con bắt buộc khai báo. */
  static tableName = '';

  /** @type {string} */
  static primaryKey = 'id';

  /** @type {string|null} Cột slug nếu bảng có URL thân thiện. */
  static slugColumn = null;

  /** @type {string} Slug dự phòng khi tiêu đề không sinh được ký tự hợp lệ. */
  static slugFallback = 'muc';

  /**
   * @param {import('../db/DatabaseAdapter')} [adapter] Mặc định là adapter của ứng dụng.
   */
  constructor(adapter) {
    if (!this.constructor.tableName) {
      throw new Error(`${this.constructor.name} phải khai báo static tableName`);
    }
    this.db = adapter || require('../config/database').adapter;
  }

  /**
   * Tạo bản sao Model gắn với adapter khác (CSDL kiểm thử, kết nối riêng).
   * @param {import('../db/DatabaseAdapter')} adapter
   * @returns {this}
   */
  withAdapter(adapter) {
    return new this.constructor(adapter);
  }

  /** @returns {string} */
  get table() {
    return this.constructor.tableName;
  }

  /**
   * Kiểm tra chuỗi ORDER BY chỉ gồm tên cột và ASC/DESC (không nhận dữ liệu người dùng thô).
   * @param {string} orderBy
   * @returns {string}
   */
  static assertOrderBy(orderBy) {
    if (!ORDER_BY_PATTERN.test(orderBy)) {
      throw new Error(`ORDER BY không hợp lệ: ${orderBy}`);
    }
    return orderBy;
  }

  /**
   * Chuẩn hóa tham số phân trang từ query string.
   * @param {*} page
   * @param {*} perPage
   * @returns {{ page: number, perPage: number, offset: number }}
   */
  static normalizePage(page, perPage = DEFAULT_PER_PAGE) {
    const size = Math.min(MAX_PER_PAGE, Math.max(1, Number.parseInt(perPage, 10) || DEFAULT_PER_PAGE));
    const current = Math.max(1, Number.parseInt(page, 10) || 1);
    return { page: current, perPage: size, offset: (current - 1) * size };
  }

  /**
   * Dựng đối tượng phân trang.
   * @param {number} page
   * @param {number} perPage
   * @param {number} total
   * @returns {Pagination}
   */
  static buildPagination(page, perPage, total) {
    const totalPages = Math.max(1, Math.ceil(total / perPage));
    return {
      page,
      perPage,
      total,
      totalPages,
      hasPrev: page > 1,
      hasNext: page < totalPages
    };
  }

  /**
   * @param {number|string} id
   * @returns {Object|undefined}
   */
  findById(id) {
    return this.findOneBy({ [this.constructor.primaryKey]: id });
  }

  /**
   * @param {Object<string, *>} where
   * @returns {Object|undefined}
   */
  findOneBy(where) {
    const params = [];
    const clause = this.db.buildWhere(where, params);
    return this.db.get(`SELECT * FROM ${this.db.quoteIdentifier(this.table)}${clause} LIMIT 1`, params);
  }

  /**
   * @param {Object<string, *>} [where]
   * @param {{ orderBy?: string, limit?: number, offset?: number }} [options]
   * @returns {Object[]}
   */
  findAllBy(where = {}, { orderBy, limit, offset } = {}) {
    const params = [];
    let sql = `SELECT * FROM ${this.db.quoteIdentifier(this.table)}${this.db.buildWhere(where, params)}`;
    if (orderBy) {
      sql += ` ORDER BY ${BaseModel.assertOrderBy(orderBy)}`;
    }
    if (limit !== undefined) {
      sql += ' LIMIT ? OFFSET ?';
      params.push(limit, offset || 0);
    }
    return this.db.all(sql, params);
  }

  /**
   * @param {Object<string, *>} [where]
   * @returns {number}
   */
  countBy(where = {}) {
    const params = [];
    const clause = this.db.buildWhere(where, params);
    return this.db.get(`SELECT COUNT(*) AS count FROM ${this.db.quoteIdentifier(this.table)}${clause}`, params).count;
  }

  /**
   * @param {Object<string, *>} where
   * @returns {boolean}
   */
  exists(where) {
    const params = [];
    const clause = this.db.buildWhere(where, params);
    return Boolean(this.db.get(`SELECT 1 AS found FROM ${this.db.quoteIdentifier(this.table)}${clause} LIMIT 1`, params));
  }

  /**
   * Phân trang trên bảng của Model theo điều kiện bằng nhau.
   * @param {{ where?: Object<string, *>, orderBy?: string, page?: *, perPage?: * }} [options]
   * @returns {{ items: Object[], pagination: Pagination }}
   */
  paginate({ where = {}, orderBy, page, perPage } = {}) {
    const p = BaseModel.normalizePage(page, perPage);
    const total = this.countBy(where);
    const items = this.findAllBy(where, { orderBy, limit: p.perPage, offset: p.offset });
    return { items, pagination: BaseModel.buildPagination(p.page, p.perPage, total) };
  }

  /**
   * Phân trang cho truy vấn tùy biến (JOIN, điều kiện phức tạp).
   * `selectSql` không chứa LIMIT/OFFSET; `countSql` trả về một cột `count`.
   * @param {{ selectSql: string, countSql: string, params?: Array<*>, page?: *, perPage?: * }} options
   * @returns {{ items: Object[], pagination: Pagination }}
   */
  paginateQuery({ selectSql, countSql, params = [], page, perPage }) {
    const p = BaseModel.normalizePage(page, perPage);
    const total = this.db.get(countSql, params).count;
    const items = this.db.all(`${selectSql} LIMIT ? OFFSET ?`, [...params, p.perPage, p.offset]);
    return { items, pagination: BaseModel.buildPagination(p.page, p.perPage, total) };
  }

  /**
   * @param {Object<string, *>} data
   * @returns {number|null} Khóa chính mới.
   */
  create(data) {
    return this.db.insert(this.table, data);
  }

  /**
   * @param {number|string} id
   * @param {Object<string, *>} data
   * @returns {number} Số dòng thay đổi.
   */
  updateById(id, data) {
    return this.db.update(this.table, data, { [this.constructor.primaryKey]: id });
  }

  /**
   * @param {number|string} id
   * @returns {number} Số dòng bị xóa.
   */
  deleteById(id) {
    return this.db.delete(this.table, { [this.constructor.primaryKey]: id });
  }

  /**
   * Sinh slug duy nhất trong bảng của Model.
   * @param {string} text
   * @param {{ excludeId?: number|string|null }} [options] Bỏ qua bản ghi đang sửa.
   * @returns {string}
   */
  generateUniqueSlug(text, { excludeId = null } = {}) {
    const column = this.constructor.slugColumn;
    if (!column) {
      throw new Error(`${this.constructor.name} không có slugColumn`);
    }
    const pk = this.constructor.primaryKey;
    return uniqueSlug(text, (slug) => {
      const row = this.findOneBy({ [column]: slug });
      return Boolean(row) && (excludeId === null || String(row[pk]) !== String(excludeId));
    }, this.constructor.slugFallback);
  }

  /**
   * @template T
   * @param {() => T} fn
   * @param {{ immediate?: boolean }} [options]
   * @returns {T}
   */
  transaction(fn, options) {
    return this.db.transaction(fn, options);
  }
}

BaseModel.DEFAULT_PER_PAGE = DEFAULT_PER_PAGE;
BaseModel.MAX_PER_PAGE = MAX_PER_PAGE;

module.exports = BaseModel;
