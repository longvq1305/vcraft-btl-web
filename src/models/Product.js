const slugify = require('slugify');
const { db } = require('../config/database');

function generateSlug(text, existingSlug = null) {
  const base = slugify(text || 'tac-pham', {
    lower: true,
    strict: true,
    locale: 'vi'
  }) || 'tac-pham';

  let slug = base;
  let counter = 1;

  while (true) {
    const row = db.prepare('SELECT id, slug FROM products WHERE slug = ?').get(slug);
    if (!row || (existingSlug && row.slug === existingSlug)) {
      return slug;
    }
    slug = `${base}-${counter++}`;
  }
}

const Product = {
  findById(id) {
    const product = db.prepare(`
      SELECT
        p.*,
        u.full_name AS artisan_name,
        u.status AS artisan_status,
        ap.workshop_name,
        ap.slug AS workshop_slug,
        ap.address AS workshop_address,
        ap.phone AS workshop_phone,
        ap.cover_image AS workshop_cover,
        ap.is_open AS workshop_is_open
      FROM products p
      JOIN users u ON p.artisan_id = u.id
      LEFT JOIN artisan_profiles ap ON ap.user_id = u.id
      WHERE p.id = ?
    `).get(id);

    if (!product) return null;

    product.images = db.prepare(`
      SELECT * FROM product_images
      WHERE product_id = ?
      ORDER BY sort_order ASC, id ASC
    `).all(id);

    product.steps = db.prepare(`
      SELECT * FROM production_steps
      WHERE product_id = ?
      ORDER BY occurred_at ASC, sort_order ASC, id ASC
    `).all(id);

    return product;
  },

  findByIdAndArtisanId(id, artisanId) {
    const product = db.prepare(`
      SELECT
        p.*,
        u.full_name AS artisan_name,
        ap.workshop_name,
        ap.slug AS workshop_slug
      FROM products p
      JOIN users u ON p.artisan_id = u.id
      LEFT JOIN artisan_profiles ap ON ap.user_id = u.id
      WHERE p.id = ? AND p.artisan_id = ?
    `).get(id, artisanId);

    if (!product) return null;

    product.images = db.prepare(`
      SELECT * FROM product_images
      WHERE product_id = ?
      ORDER BY sort_order ASC, id ASC
    `).all(id);

    product.steps = db.prepare(`
      SELECT * FROM production_steps
      WHERE product_id = ?
      ORDER BY occurred_at ASC, sort_order ASC, id ASC
    `).all(id);

    return product;
  },

  findBySlug(slug) {
    const product = db.prepare(`
      SELECT
        p.*,
        u.full_name AS artisan_name,
        u.status AS artisan_status,
        ap.workshop_name,
        ap.slug AS workshop_slug,
        ap.address AS workshop_address,
        ap.phone AS workshop_phone,
        ap.cover_image AS workshop_cover,
        ap.is_open AS workshop_is_open,
        ap.story AS workshop_story
      FROM products p
      JOIN users u ON p.artisan_id = u.id
      LEFT JOIN artisan_profiles ap ON ap.user_id = u.id
      WHERE p.slug = ?
    `).get(slug);

    if (!product) return null;

    product.images = db.prepare(`
      SELECT * FROM product_images
      WHERE product_id = ?
      ORDER BY sort_order ASC, id ASC
    `).all(product.id);

    product.steps = db.prepare(`
      SELECT * FROM production_steps
      WHERE product_id = ?
      ORDER BY occurred_at ASC, sort_order ASC, id ASC
    `).all(product.id);

    return product;
  },

  findByArtisanId(artisanId) {
    const products = db.prepare(`
      SELECT
        p.*,
        (SELECT COUNT(*) FROM product_images pi WHERE pi.product_id = p.id) AS image_count,
        (SELECT COUNT(*) FROM production_steps ps WHERE ps.product_id = p.id) AS step_count
      FROM products p
      WHERE p.artisan_id = ?
      ORDER BY p.updated_at DESC, p.id DESC
    `).all(artisanId);

    return products;
  },

  findPublished({ category, workshopSlug, q, sort = 'newest', limit = 24, offset = 0 } = {}) {
    let sql = `
      SELECT
        p.*,
        u.full_name AS artisan_name,
        ap.workshop_name,
        ap.slug AS workshop_slug,
        ap.address AS workshop_address,
        ap.is_open AS workshop_is_open
      FROM products p
      JOIN users u ON p.artisan_id = u.id
      LEFT JOIN artisan_profiles ap ON ap.user_id = u.id
      WHERE p.status = 'published' AND u.status = 'approved'
    `;
    const params = [];

    if (category && category.trim()) {
      sql += ` AND p.category = ? `;
      params.push(category.trim());
    }

    if (workshopSlug && workshopSlug.trim()) {
      sql += ` AND ap.slug = ? `;
      params.push(workshopSlug.trim());
    }

    if (q && q.trim()) {
      sql += ` AND (p.name LIKE ? OR p.description LIKE ? OR ap.workshop_name LIKE ?) `;
      const queryParam = `%${q.trim()}%`;
      params.push(queryParam, queryParam, queryParam);
    }

    if (sort === 'price_asc') {
      sql += ` ORDER BY p.price ASC, p.id DESC `;
    } else if (sort === 'price_desc') {
      sql += ` ORDER BY p.price DESC, p.id DESC `;
    } else {
      sql += ` ORDER BY p.created_at DESC, p.id DESC `;
    }

    sql += ` LIMIT ? OFFSET ? `;
    params.push(limit, offset);

    return db.prepare(sql).all(...params);
  },

  countPublished({ category, workshopSlug, q } = {}) {
    let sql = `
      SELECT COUNT(*) AS total
      FROM products p
      JOIN users u ON p.artisan_id = u.id
      LEFT JOIN artisan_profiles ap ON ap.user_id = u.id
      WHERE p.status = 'published' AND u.status = 'approved'
    `;
    const params = [];

    if (category && category.trim()) {
      sql += ` AND p.category = ? `;
      params.push(category.trim());
    }

    if (workshopSlug && workshopSlug.trim()) {
      sql += ` AND ap.slug = ? `;
      params.push(workshopSlug.trim());
    }

    if (q && q.trim()) {
      sql += ` AND (p.name LIKE ? OR p.description LIKE ? OR ap.workshop_name LIKE ?) `;
      const queryParam = `%${q.trim()}%`;
      params.push(queryParam, queryParam, queryParam);
    }

    const row = db.prepare(sql).get(...params);
    return row ? row.total : 0;
  },

  findFeatured(limit = 8) {
    return db.prepare(`
      SELECT
        p.*,
        u.full_name AS artisan_name,
        ap.workshop_name,
        ap.slug AS workshop_slug
      FROM products p
      JOIN users u ON p.artisan_id = u.id
      LEFT JOIN artisan_profiles ap ON ap.user_id = u.id
      WHERE p.status = 'published' AND u.status = 'approved'
      ORDER BY p.id DESC
      LIMIT ?
    `).all(limit);
  },

  findByWorkshopSlug(workshopSlug, limit = 12) {
    return db.prepare(`
      SELECT
        p.*,
        u.full_name AS artisan_name,
        ap.workshop_name,
        ap.slug AS workshop_slug
      FROM products p
      JOIN users u ON p.artisan_id = u.id
      JOIN artisan_profiles ap ON ap.user_id = u.id
      WHERE ap.slug = ? AND p.status = 'published' AND u.status = 'approved'
      ORDER BY p.created_at DESC
      LIMIT ?
    `).all(workshopSlug, limit);
  },

  getRelatedProducts(productId, category, limit = 4) {
    return db.prepare(`
      SELECT
        p.*,
        u.full_name AS artisan_name,
        ap.workshop_name,
        ap.slug AS workshop_slug
      FROM products p
      JOIN users u ON p.artisan_id = u.id
      LEFT JOIN artisan_profiles ap ON ap.user_id = u.id
      WHERE p.status = 'published'
        AND u.status = 'approved'
        AND p.category = ?
        AND p.id != ?
      ORDER BY p.id DESC
      LIMIT ?
    `).all(category, productId, limit);
  },

  findDistinctCategories() {
    const rows = db.prepare(`
      SELECT DISTINCT p.category
      FROM products p
      JOIN users u ON p.artisan_id = u.id
      WHERE p.status = 'published' AND u.status = 'approved' AND p.category IS NOT NULL AND p.category != ''
      ORDER BY p.category ASC
    `).all();

    return rows.map((r) => r.category);
  },

  create(artisanId, data, galleryImagePaths = []) {
    const slug = generateSlug(data.name);
    const now = new Date().toISOString();
    const status = data.status === 'published' ? 'published' : 'draft';
    const price = Math.max(0, Number(data.price) || 0);
    const inventory = Math.max(0, Number(data.inventory) || 0);

    const insertTx = db.transaction(() => {
      const stmt = db.prepare(`
        INSERT INTO products (
          artisan_id,
          slug,
          name,
          category,
          description,
          price,
          inventory,
          hero_image,
          status,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const result = stmt.run(
        artisanId,
        slug,
        data.name.trim(),
        data.category.trim(),
        data.description ? data.description.trim() : '',
        price,
        inventory,
        data.hero_image || null,
        status,
        now,
        now
      );

      const productId = result.lastInsertRowid;

      if (Array.isArray(galleryImagePaths) && galleryImagePaths.length > 0) {
        const imageStmt = db.prepare(`
          INSERT INTO product_images (product_id, image_path, alt_text, sort_order)
          VALUES (?, ?, ?, ?)
        `);
        galleryImagePaths.forEach((imgPath, idx) => {
          imageStmt.run(productId, imgPath, data.name.trim(), idx + 1);
        });
      }

      return productId;
    });

    const newId = insertTx();
    return this.findById(newId);
  },

  update(id, artisanId, data, newGalleryImagePaths = []) {
    const existing = this.findByIdAndArtisanId(id, artisanId);
    if (!existing) {
      throw new Error('Không tìm thấy tác phẩm hoặc bạn không có quyền chỉnh sửa.');
    }

    const now = new Date().toISOString();
    const price = data.price !== undefined ? Math.max(0, Number(data.price) || 0) : existing.price;
    const inventory = data.inventory !== undefined ? Math.max(0, Number(data.inventory) || 0) : existing.inventory;
    const status = data.status !== undefined ? (data.status === 'published' ? 'published' : 'draft') : existing.status;
    const heroImage = data.hero_image !== undefined ? data.hero_image : existing.hero_image;

    const updateTx = db.transaction(() => {
      const stmt = db.prepare(`
        UPDATE products
        SET
          name = ?,
          category = ?,
          description = ?,
          price = ?,
          inventory = ?,
          hero_image = ?,
          status = ?,
          updated_at = ?
        WHERE id = ? AND artisan_id = ?
      `);

      stmt.run(
        data.name !== undefined ? data.name.trim() : existing.name,
        data.category !== undefined ? data.category.trim() : existing.category,
        data.description !== undefined ? data.description.trim() : existing.description,
        price,
        inventory,
        heroImage,
        status,
        now,
        id,
        artisanId
      );

      if (Array.isArray(newGalleryImagePaths) && newGalleryImagePaths.length > 0) {
        const maxOrderRow = db.prepare(`
          SELECT COALESCE(MAX(sort_order), 0) AS max_order
          FROM product_images
          WHERE product_id = ?
        `).get(id);
        let startOrder = (maxOrderRow ? maxOrderRow.max_order : 0) + 1;

        const imageStmt = db.prepare(`
          INSERT INTO product_images (product_id, image_path, alt_text, sort_order)
          VALUES (?, ?, ?, ?)
        `);
        newGalleryImagePaths.forEach((imgPath) => {
          imageStmt.run(id, imgPath, data.name || existing.name, startOrder++);
        });
      }
    });

    updateTx();
    return this.findById(id);
  },

  delete(id, artisanId) {
    const existing = this.findByIdAndArtisanId(id, artisanId);
    if (!existing) {
      throw new Error('Không tìm thấy tác phẩm hoặc bạn không có quyền xóa.');
    }

    const deleteTx = db.transaction(() => {
      db.prepare('DELETE FROM production_steps WHERE product_id = ?').run(id);
      db.prepare('DELETE FROM product_images WHERE product_id = ?').run(id);
      db.prepare('DELETE FROM products WHERE id = ? AND artisan_id = ?').run(id, artisanId);
    });

    deleteTx();
    return existing;
  },

  addStep(productId, artisanId, stepData) {
    const existing = this.findByIdAndArtisanId(productId, artisanId);
    if (!existing) {
      throw new Error('Không tìm thấy tác phẩm hoặc bạn không có quyền thêm nhật ký chế tác.');
    }

    const maxOrderRow = db.prepare(`
      SELECT COALESCE(MAX(sort_order), 0) AS max_order
      FROM production_steps
      WHERE product_id = ?
    `).get(productId);
    const nextOrder = (maxOrderRow ? maxOrderRow.max_order : 0) + 1;

    const occurredAt = stepData.occurred_at || new Date().toISOString();

    const stmt = db.prepare(`
      INSERT INTO production_steps (
        product_id,
        title,
        description,
        occurred_at,
        image_path,
        sort_order
      ) VALUES (?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      productId,
      stepData.title.trim(),
      stepData.description ? stepData.description.trim() : '',
      occurredAt,
      stepData.image_path || null,
      nextOrder
    );

    return db.prepare('SELECT * FROM production_steps WHERE product_id = ? ORDER BY id DESC LIMIT 1').get(productId);
  },

  deleteStep(stepId, productId, artisanId) {
    const existing = this.findByIdAndArtisanId(productId, artisanId);
    if (!existing) {
      throw new Error('Không tìm thấy tác phẩm hoặc bạn không có quyền xóa công đoạn này.');
    }

    const step = db.prepare('SELECT * FROM production_steps WHERE id = ? AND product_id = ?').get(stepId, productId);
    if (!step) {
      throw new Error('Không tìm thấy giai đoạn chế tác.');
    }

    db.prepare('DELETE FROM production_steps WHERE id = ? AND product_id = ?').run(stepId, productId);
    return step;
  },

  deleteImage(imageId, productId, artisanId) {
    const existing = this.findByIdAndArtisanId(productId, artisanId);
    if (!existing) {
      throw new Error('Không tìm thấy tác phẩm hoặc bạn không có quyền xóa ảnh.');
    }

    const image = db.prepare('SELECT * FROM product_images WHERE id = ? AND product_id = ?').get(imageId, productId);
    if (!image) {
      throw new Error('Không tìm thấy hình ảnh.');
    }

    db.prepare('DELETE FROM product_images WHERE id = ? AND product_id = ?').run(imageId, productId);
    return image;
  }
};

module.exports = Product;
