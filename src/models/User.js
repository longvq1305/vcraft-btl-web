const { db } = require('../config/database');
const bcrypt = require('bcryptjs');
const slugify = require('slugify');

function generateSlug(text, existingCheckFn) {
  let baseSlug = slugify(text, { lower: true, strict: true, locale: 'vi' });
  if (!baseSlug) {
    baseSlug = 'workshop-' + Math.floor(1000 + Math.random() * 9000);
  }
  let slug = baseSlug;
  let counter = 1;
  while (existingCheckFn(slug)) {
    counter++;
    slug = `${baseSlug}-${counter}`;
  }
  return slug;
}

const User = {
  findByEmail(email) {
    if (!email) return null;
    const stmt = db.prepare('SELECT * FROM users WHERE email = ? COLLATE NOCASE');
    return stmt.get(email.trim().toLowerCase());
  },

  findById(id) {
    if (!id) return null;
    const stmt = db.prepare('SELECT id, full_name, email, role, status, created_at FROM users WHERE id = ?');
    return stmt.get(id);
  },

  findByIdWithHash(id) {
    if (!id) return null;
    const stmt = db.prepare('SELECT * FROM users WHERE id = ?');
    return stmt.get(id);
  },

  verifyPassword(plainPassword, passwordHash) {
    if (!plainPassword || !passwordHash) return false;
    return bcrypt.compareSync(plainPassword, passwordHash);
  },

  hashPassword(plainPassword) {
    return bcrypt.hashSync(plainPassword, 10);
  },

  createBuyer({ fullName, email, password }) {
    const passwordHash = this.hashPassword(password);
    const stmt = db.prepare(`
      INSERT INTO users (full_name, email, password_hash, role, status, created_at)
      VALUES (?, ?, ?, 'buyer', 'approved', datetime('now'))
    `);
    const info = stmt.run(fullName.trim(), email.trim().toLowerCase(), passwordHash);
    return info.lastInsertRowid;
  },

  createArtisanApplicant({ fullName, email, password, workshopName, address, phone, categories, story }) {
    const passwordHash = this.hashPassword(password);

    const transaction = db.transaction(() => {
      const insertUser = db.prepare(`
        INSERT INTO users (full_name, email, password_hash, role, status, created_at)
        VALUES (?, ?, ?, 'artisan', 'pending', datetime('now'))
      `);
      const userId = insertUser.run(fullName.trim(), email.trim().toLowerCase(), passwordHash).lastInsertRowid;

      const slugCheck = (s) => !!db.prepare('SELECT id FROM artisan_profiles WHERE slug = ?').get(s);
      const slug = generateSlug(workshopName || fullName, slugCheck);

      const insertProfile = db.prepare(`
        INSERT INTO artisan_profiles (
          user_id, slug, workshop_name, story, address, latitude, longitude,
          is_open, visiting_hours, categories, phone, cover_image, gallery_images, certificate_image
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      insertProfile.run(
        userId,
        slug,
        workshopName ? workshopName.trim() : `Xưởng của ${fullName.trim()}`,
        story ? story.trim() : 'Đang cập nhật câu chuyện làng nghề.',
        address ? address.trim() : 'Đang cập nhật địa chỉ.',
        21.0285, // Default Hanoi coords if not given
        105.8542,
        0, // Not open while pending
        '08:00 - 17:00',
        categories ? categories.trim() : 'Thủ công mỹ nghệ',
        phone ? phone.trim() : null,
        null,
        '[]',
        null
      );

      return userId;
    });

    return transaction();
  },

  createApprovedArtisanByAdmin({ fullName, email, password, workshopName, address, phone, categories, story, latitude, longitude, isOpen, visitingHours }) {
    const passwordHash = this.hashPassword(password);

    const transaction = db.transaction(() => {
      const insertUser = db.prepare(`
        INSERT INTO users (full_name, email, password_hash, role, status, created_at)
        VALUES (?, ?, ?, 'artisan', 'approved', datetime('now'))
      `);
      const userId = insertUser.run(fullName.trim(), email.trim().toLowerCase(), passwordHash).lastInsertRowid;

      const slugCheck = (s) => !!db.prepare('SELECT id FROM artisan_profiles WHERE slug = ?').get(s);
      const slug = generateSlug(workshopName || fullName, slugCheck);

      const insertProfile = db.prepare(`
        INSERT INTO artisan_profiles (
          user_id, slug, workshop_name, story, address, latitude, longitude,
          is_open, visiting_hours, categories, phone, cover_image, gallery_images, certificate_image
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      insertProfile.run(
        userId,
        slug,
        workshopName.trim(),
        story ? story.trim() : 'Xưởng thủ công truyền thống chất lượng cao.',
        address.trim(),
        Number(latitude) || 21.0285,
        Number(longitude) || 105.8542,
        isOpen ? 1 : 0,
        visitingHours ? visitingHours.trim() : '08:00 - 17:30',
        categories ? categories.trim() : 'Thủ công mỹ nghệ',
        phone ? phone.trim() : null,
        null,
        '[]',
        null
      );

      return userId;
    });

    return transaction();
  },

  updateStatus(id, status) {
    const stmt = db.prepare(`
      UPDATE users
      SET status = ?
      WHERE id = ? AND role = 'artisan'
    `);
    const info = stmt.run(status, id);

    // If approved, set is_open = 1 if desired, or leave profile open status
    if (status === 'approved') {
      db.prepare(`UPDATE artisan_profiles SET is_open = 1 WHERE user_id = ?`).run(id);
    } else if (status === 'suspended') {
      db.prepare(`UPDATE artisan_profiles SET is_open = 0 WHERE user_id = ?`).run(id);
    }

    return info.changes > 0;
  },

  listArtisans({ status, limit = 50, offset = 0 } = {}) {
    let sql = `
      SELECT u.id, u.full_name, u.email, u.role, u.status, u.created_at,
             ap.slug, ap.workshop_name, ap.address, ap.categories, ap.phone, ap.is_open,
             ap.cover_image
      FROM users u
      LEFT JOIN artisan_profiles ap ON u.id = ap.user_id
      WHERE u.role = 'artisan'
    `;
    const params = [];

    if (status) {
      sql += ' AND u.status = ?';
      params.push(status);
    }

    sql += ' ORDER BY u.created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    return db.prepare(sql).all(...params);
  },

  countArtisansByStatus() {
    const rows = db.prepare(`
      SELECT status, COUNT(*) as count
      FROM users
      WHERE role = 'artisan'
      GROUP BY status
    `).all();

    const counts = { pending: 0, approved: 0, suspended: 0, total: 0 };
    for (const r of rows) {
      counts[r.status] = r.count;
      counts.total += r.count;
    }
    return counts;
  },

  getArtisanDetail(id) {
    const stmt = db.prepare(`
      SELECT u.id, u.full_name, u.email, u.role, u.status, u.created_at,
             ap.id as profile_id, ap.slug, ap.workshop_name, ap.story, ap.address,
             ap.latitude, ap.longitude, ap.is_open, ap.visiting_hours, ap.categories,
             ap.phone, ap.cover_image, ap.gallery_images, ap.certificate_image
      FROM users u
      LEFT JOIN artisan_profiles ap ON u.id = ap.user_id
      WHERE u.id = ? AND u.role = 'artisan'
    `);
    return stmt.get(id);
  }
};

module.exports = User;
