const { db, adapter } = require('../config/database');
const { uniqueSlug } = require('../utils/slug');
const SlugRedirect = require('./SlugRedirect');

const News = {
  findPublished({ limit = 20, offset = 0 } = {}) {
    const stmt = db.prepare(`
      SELECT id, title, slug, excerpt, body, cover_image, is_published, published_at, created_at
      FROM news
      WHERE is_published = 1
      ORDER BY published_at DESC, created_at DESC
      LIMIT ? OFFSET ?
    `);
    return stmt.all(limit, offset);
  },

  findBySlug(slug) {
    if (!slug) return null;
    const stmt = db.prepare(`
      SELECT id, title, slug, excerpt, body, cover_image, is_published, published_at, created_at, updated_at
      FROM news
      WHERE slug = ?
    `);
    return stmt.get(slug);
  },

  findById(id) {
    if (!id) return null;
    const stmt = db.prepare(`
      SELECT id, title, slug, excerpt, body, cover_image, is_published, published_at, created_at, updated_at
      FROM news
      WHERE id = ?
    `);
    return stmt.get(id);
  },

  findAllAdmin({ limit = 50, offset = 0 } = {}) {
    const stmt = db.prepare(`
      SELECT id, title, slug, excerpt, cover_image, is_published, published_at, created_at, updated_at
      FROM news
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `);
    return stmt.all(limit, offset);
  },

  create({ title, excerpt, body, coverImage, isPublished }) {
    const slug = uniqueSlug(title, (s) => Boolean(db.prepare('SELECT 1 FROM news WHERE slug = ?').get(s)), 'tin-tuc');

    const now = new Date().toISOString();
    const publishedAt = isPublished ? now : null;

    const stmt = db.prepare(`
      INSERT INTO news (title, slug, excerpt, body, cover_image, is_published, published_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const info = stmt.run(
      title.trim(),
      slug,
      excerpt ? excerpt.trim() : '',
      body ? body.trim() : '',
      coverImage ? coverImage.trim() : null,
      isPublished ? 1 : 0,
      publishedAt,
      now,
      now
    );

    return { id: info.lastInsertRowid, slug };
  },

  /** Cập nhật bản tin và lưu lịch sử đổi slug cùng giao dịch. */
  update(id, { title, excerpt, body, coverImage, isPublished }) {
    return adapter.transaction(() => {
      const current = this.findById(id);
      if (!current) return false;

      let slug = current.slug;
      if (title && title.trim() !== current.title) {
        slug = uniqueSlug(title, (s) => {
          const row = db.prepare('SELECT id FROM news WHERE slug = ?').get(s);
          return Boolean(row) && row.id !== current.id;
        }, 'tin-tuc');
      }

      const now = new Date().toISOString();
      const publishedAt = isPublished ? current.published_at || now : null;
      const cover = coverImage !== undefined ? (coverImage ? coverImage.trim() : null) : current.cover_image;

      const info = db.prepare(`
        UPDATE news
        SET title = ?, slug = ?, excerpt = ?, body = ?, cover_image = ?, is_published = ?, published_at = ?, updated_at = ?
        WHERE id = ?
      `).run(
        title.trim(),
        slug,
        excerpt ? excerpt.trim() : '',
        body ? body.trim() : '',
        cover,
        isPublished ? 1 : 0,
        publishedAt,
        now,
        id
      );

      if (info.changes && slug !== current.slug) {
        SlugRedirect.record('news', current.slug, slug);
      }
      return info.changes > 0;
    }, { immediate: true });
  },

  delete(id) {
    const stmt = db.prepare('DELETE FROM news WHERE id = ?');
    const info = stmt.run(id);
    return info.changes > 0;
  },

  countPublished() {
    return db.prepare('SELECT COUNT(*) as count FROM news WHERE is_published = 1').get().count;
  },

  countAll() {
    return db.prepare('SELECT COUNT(*) as count FROM news').get().count;
  }
};

module.exports = News;
