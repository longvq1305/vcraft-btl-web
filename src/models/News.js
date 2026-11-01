const { db } = require('../config/database');
const slugify = require('slugify');

function generateSlug(text, existingCheckFn, currentId = null) {
  let baseSlug = slugify(text, { lower: true, strict: true, locale: 'vi' });
  if (!baseSlug) {
    baseSlug = 'tin-tuc-' + Math.floor(1000 + Math.random() * 9000);
  }
  let slug = baseSlug;
  let counter = 1;
  while (existingCheckFn(slug, currentId)) {
    counter++;
    slug = `${baseSlug}-${counter}`;
  }
  return slug;
}

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
    const slugCheck = (s) => !!db.prepare('SELECT id FROM news WHERE slug = ?').get(s);
    const slug = generateSlug(title, slugCheck);

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

  update(id, { title, excerpt, body, coverImage, isPublished }) {
    const current = this.findById(id);
    if (!current) return false;

    const slugCheck = (s, excludeId) => {
      const row = db.prepare('SELECT id FROM news WHERE slug = ?').get(s);
      return row && row.id !== excludeId;
    };

    let slug = current.slug;
    if (title && title.trim() !== current.title) {
      slug = generateSlug(title, slugCheck, id);
    }

    const now = new Date().toISOString();
    let publishedAt = current.published_at;
    if (isPublished && !publishedAt) {
      publishedAt = now;
    } else if (!isPublished) {
      publishedAt = null;
    }

    const cover = coverImage !== undefined ? (coverImage ? coverImage.trim() : null) : current.cover_image;

    const stmt = db.prepare(`
      UPDATE news
      SET title = ?, slug = ?, excerpt = ?, body = ?, cover_image = ?, is_published = ?, published_at = ?, updated_at = ?
      WHERE id = ?
    `);

    const info = stmt.run(
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

    return info.changes > 0;
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
