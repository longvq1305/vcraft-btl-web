const slugify = require('slugify');
const { db } = require('../config/database');

function generateSlug(text, existingSlug = null) {
  const base = slugify(text || 'xuong-thu-cong', {
    lower: true,
    strict: true,
    locale: 'vi'
  }) || 'xuong-thu-cong';

  let slug = base;
  let counter = 1;

  while (true) {
    const row = db.prepare('SELECT id, slug FROM artisan_profiles WHERE slug = ?').get(slug);
    if (!row || (existingSlug && row.slug === existingSlug)) {
      return slug;
    }
    slug = `${base}-${counter++}`;
  }
}

function parseGallery(galleryImages) {
  if (!galleryImages) return [];
  if (Array.isArray(galleryImages)) return galleryImages;
  try {
    const parsed = JSON.parse(galleryImages);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

const Artisan = {
  findByUserId(userId) {
    const row = db.prepare(`
      SELECT
        ap.*,
        u.full_name AS artisan_name,
        u.email,
        u.status AS user_status,
        u.role
      FROM artisan_profiles ap
      JOIN users u ON ap.user_id = u.id
      WHERE ap.user_id = ?
    `).get(userId);

    if (row) {
      row.gallery_images = parseGallery(row.gallery_images);
    }
    return row || null;
  },

  findBySlug(slug) {
    const row = db.prepare(`
      SELECT
        ap.*,
        u.full_name AS artisan_name,
        u.email,
        u.status AS user_status,
        u.role
      FROM artisan_profiles ap
      JOIN users u ON ap.user_id = u.id
      WHERE ap.slug = ?
    `).get(slug);

    if (row) {
      row.gallery_images = parseGallery(row.gallery_images);
    }
    return row || null;
  },

  findApprovedBySlug(slug) {
    const row = this.findBySlug(slug);
    if (!row || row.user_status !== 'approved') {
      return null;
    }
    return row;
  },

  findAllApproved({ category, q, limit = 50, offset = 0 } = {}) {
    let sql = `
      SELECT
        ap.*,
        u.full_name AS artisan_name,
        (
          SELECT COUNT(*)
          FROM products p
          WHERE p.artisan_id = ap.user_id AND p.status = 'published'
        ) AS product_count
      FROM artisan_profiles ap
      JOIN users u ON ap.user_id = u.id
      WHERE u.status = 'approved' AND u.role = 'artisan'
    `;
    const params = [];

    if (category && category.trim()) {
      sql += ` AND (ap.categories LIKE ? OR ap.categories LIKE ? OR ap.categories LIKE ?) `;
      const cat = category.trim();
      params.push(`%${cat}%`, `%, ${cat}%`, `${cat},%`);
    }

    if (q && q.trim()) {
      sql += ` AND (ap.workshop_name LIKE ? OR ap.story LIKE ? OR ap.address LIKE ? OR u.full_name LIKE ?) `;
      const queryParam = `%${q.trim()}%`;
      params.push(queryParam, queryParam, queryParam, queryParam);
    }

    sql += ` ORDER BY ap.is_open DESC, ap.workshop_name ASC LIMIT ? OFFSET ? `;
    params.push(limit, offset);

    const rows = db.prepare(sql).all(...params);
    return rows.map((r) => {
      r.gallery_images = parseGallery(r.gallery_images);
      return r;
    });
  },

  findForMap() {
    const rows = db.prepare(`
      SELECT
        ap.id,
        ap.user_id,
        ap.slug,
        ap.workshop_name,
        ap.address,
        ap.latitude,
        ap.longitude,
        ap.is_open,
        ap.visiting_hours,
        ap.categories,
        ap.cover_image,
        ap.phone,
        u.full_name AS artisan_name
      FROM artisan_profiles ap
      JOIN users u ON ap.user_id = u.id
      WHERE u.status = 'approved'
        AND ap.latitude IS NOT NULL
        AND ap.longitude IS NOT NULL
      ORDER BY ap.workshop_name ASC
    `).all();

    return rows;
  },

  findFeatured(limit = 6) {
    const rows = db.prepare(`
      SELECT
        ap.*,
        u.full_name AS artisan_name,
        (
          SELECT COUNT(*)
          FROM products p
          WHERE p.artisan_id = ap.user_id AND p.status = 'published'
        ) AS product_count
      FROM artisan_profiles ap
      JOIN users u ON ap.user_id = u.id
      WHERE u.status = 'approved' AND u.role = 'artisan'
      ORDER BY ap.is_open DESC, ap.id ASC
      LIMIT ?
    `).all(limit);

    return rows.map((r) => {
      r.gallery_images = parseGallery(r.gallery_images);
      return r;
    });
  },

  getAllCategories() {
    const rows = db.prepare(`
      SELECT ap.categories
      FROM artisan_profiles ap
      JOIN users u ON ap.user_id = u.id
      WHERE u.status = 'approved' AND ap.categories IS NOT NULL AND ap.categories != ''
    `).all();

    const categorySet = new Set();
    for (const row of rows) {
      const parts = row.categories.split(',').map((c) => c.trim()).filter(Boolean);
      for (const p of parts) {
        categorySet.add(p);
      }
    }
    return Array.from(categorySet).sort();
  },

  createProfile(userId, profileData) {
    const slug = generateSlug(profileData.workshop_name || 'xuong-thu-cong');
    const now = new Date().toISOString();
    const galleryJson = JSON.stringify(profileData.gallery_images || []);

    const stmt = db.prepare(`
      INSERT INTO artisan_profiles (
        user_id,
        slug,
        workshop_name,
        story,
        address,
        latitude,
        longitude,
        is_open,
        visiting_hours,
        categories,
        phone,
        cover_image,
        gallery_images,
        certificate_image,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      userId,
      slug,
      profileData.workshop_name || '',
      profileData.story || 'Gìn giữ và phát huy tinh hoa làng nghề truyền thống.',
      profileData.address || 'Việt Nam',
      (profileData.latitude !== undefined && profileData.latitude !== null && profileData.latitude !== '') ? Number(profileData.latitude) : 21.0285,
      (profileData.longitude !== undefined && profileData.longitude !== null && profileData.longitude !== '') ? Number(profileData.longitude) : 105.8542,
      profileData.is_open ? 1 : 0,
      profileData.visiting_hours || '',
      profileData.categories || 'Thủ công mỹ nghệ',
      profileData.cover_image || null,
      galleryJson,
      profileData.certificate_image || null,
      now,
      now
    );

    return this.findByUserId(userId);
  },

  updateProfile(userId, profileData) {
    const existing = this.findByUserId(userId);
    if (!existing) {
      return this.createProfile(userId, profileData);
    }

    const now = new Date().toISOString();
    let slug = existing.slug;
    if (!slug && profileData.workshop_name) {
      slug = generateSlug(profileData.workshop_name);
    }

    const coverImage = profileData.cover_image !== undefined ? profileData.cover_image : existing.cover_image;
    const certificateImage = profileData.certificate_image !== undefined ? profileData.certificate_image : existing.certificate_image;

    let galleryJson = existing.gallery_images ? JSON.stringify(existing.gallery_images) : '[]';
    if (profileData.gallery_images !== undefined) {
      galleryJson = JSON.stringify(profileData.gallery_images);
    }

    const stmt = db.prepare(`
      UPDATE artisan_profiles
      SET
        workshop_name = ?,
        story = ?,
        address = ?,
        latitude = ?,
        longitude = ?,
        is_open = ?,
        visiting_hours = ?,
        categories = ?,
        phone = ?,
        cover_image = ?,
        gallery_images = ?,
        certificate_image = ?,
        updated_at = ?
      WHERE user_id = ?
    `);

    stmt.run(
      profileData.workshop_name !== undefined ? profileData.workshop_name : existing.workshop_name,
      profileData.story !== undefined ? (profileData.story || 'Gìn giữ và phát huy tinh hoa làng nghề truyền thống.') : existing.story,
      profileData.address !== undefined ? (profileData.address || 'Việt Nam') : existing.address,
      (profileData.latitude !== undefined && profileData.latitude !== null && profileData.latitude !== '') ? Number(profileData.latitude) : (existing.latitude != null ? existing.latitude : 21.0285),
      (profileData.longitude !== undefined && profileData.longitude !== null && profileData.longitude !== '') ? Number(profileData.longitude) : (existing.longitude != null ? existing.longitude : 105.8542),
      profileData.is_open !== undefined ? (profileData.is_open ? 1 : 0) : existing.is_open,
      profileData.visiting_hours !== undefined ? profileData.visiting_hours : existing.visiting_hours,
      profileData.categories !== undefined ? (profileData.categories || 'Thủ công mỹ nghệ') : existing.categories,
      profileData.phone !== undefined ? profileData.phone : existing.phone,
      coverImage,
      galleryJson,
      certificateImage,
      now,
      userId
    );

    return this.findByUserId(userId);
  }
};

module.exports = Artisan;
