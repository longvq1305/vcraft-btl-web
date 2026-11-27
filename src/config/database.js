const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const SqliteAdapter = require('../db/SqliteAdapter');

/** Phiên bản schema hiện tại, lưu trong PRAGMA user_version. */
const SCHEMA_VERSION = 3;

const QUOTE_STATUSES = ['draft', 'sent', 'bidding', 'accepted', 'in_production', 'delivered', 'cancelled'];

/**
 * Câu CREATE cho bảng quote_requests; dùng chung cho schema gốc và migration dựng lại bảng.
 * @param {string} tableName
 * @returns {string}
 */
function quoteRequestsDdl(tableName) {
  return `
    CREATE TABLE IF NOT EXISTS ${tableName} (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      buyer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      category TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      deadline TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN (${QUOTE_STATUSES.map((s) => `'${s}'`).join(', ')})),
      accepted_bid_id INTEGER,
      version INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `;
}

/**
 * Đường dẫn file CSDL từ biến môi trường DB_FILE (mặc định data/vcraft.db).
 * @returns {string}
 */
function resolveDbPath() {
  const envPath = process.env.DB_FILE;
  if (envPath) {
    if (envPath === ':memory:') {
      return ':memory:';
    }
    return path.isAbsolute(envPath) ? envPath : path.resolve(process.cwd(), envPath);
  }
  return path.resolve(process.cwd(), 'data/vcraft.db');
}

/**
 * Tạo adapter CSDL cho đường dẫn chỉ định. Đây là nơi duy nhất chọn driver.
 * @param {string} [dbPath]
 * @returns {import('../db/DatabaseAdapter')}
 */
function createAdapter(dbPath = resolveDbPath()) {
  if (dbPath !== ':memory:') {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }
  return new SqliteAdapter(dbPath);
}

/** Adapter mặc định của ứng dụng. */
const adapter = createAdapter();

/**
 * Kết nối better-sqlite3 gốc. Chỉ dành cho các model chưa chuyển sang BaseModel
 * (Artisan, Product, News); code mới phải dùng `adapter`.
 */
const db = adapter.connection;

/**
 * Dựng lại quote_requests để CHECK chấp nhận trạng thái 'cancelled' (CSDL tạo trước schema v2).
 * Theo quy trình đổi cấu trúc bảng của SQLite: tạo bảng mới, chép dữ liệu, xóa bảng cũ, đổi tên.
 * @param {SqliteAdapter} target
 */
function rebuildQuoteRequests(target) {
  target.withoutForeignKeys(() => {
    target.transaction(() => {
      target.exec(quoteRequestsDdl('quote_requests_v2'));
      target.exec(`
        INSERT INTO quote_requests_v2 (id, buyer_id, title, description, category, quantity, deadline,
                                       status, accepted_bid_id, version, created_at, updated_at)
        SELECT id, buyer_id, title, description, category, quantity, deadline,
               status, accepted_bid_id, version, created_at, updated_at
        FROM quote_requests;
        DROP TABLE quote_requests;
        ALTER TABLE quote_requests_v2 RENAME TO quote_requests;
        CREATE INDEX IF NOT EXISTS idx_quote_requests_buyer_id ON quote_requests(buyer_id);
        CREATE INDEX IF NOT EXISTS idx_quote_requests_status ON quote_requests(status);
      `);
    });
  });
}

/**
 * Áp dụng các thay đổi schema cho CSDL tạo từ phiên bản cũ.
 * @param {SqliteAdapter} target
 */
function migrate(target) {
  if (target.getSchemaVersion() >= SCHEMA_VERSION) {
    return;
  }
  const quoteDefinition = target.getTableDefinition('quote_requests');
  if (quoteDefinition && !quoteDefinition.includes("'cancelled'")) {
    rebuildQuoteRequests(target);
  }
  // v3: mã chống gửi trùng cho đơn mua nhanh (mỗi lần mở form một mã, mỗi mã tối đa một đơn).
  if (!target.getTableDefinition('orders').includes('request_token')) {
    target.exec('ALTER TABLE orders ADD COLUMN request_token TEXT');
  }
  target.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_buyer_request_token ON orders(buyer_id, request_token)');
  target.setSchemaVersion(SCHEMA_VERSION);
}

/**
 * Tạo bảng/chỉ mục còn thiếu và chạy migration.
 * @param {SqliteAdapter} [target]
 */
function initializeDatabase(target = adapter) {
  target.exec(quoteRequestsDdl('quote_requests'));
  target.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      full_name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('buyer', 'artisan', 'admin')),
      status TEXT NOT NULL CHECK(status IN ('pending', 'approved', 'suspended')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS artisan_profiles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      slug TEXT NOT NULL UNIQUE,
      workshop_name TEXT NOT NULL,
      story TEXT NOT NULL,
      address TEXT NOT NULL,
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      is_open INTEGER NOT NULL DEFAULT 1,
      visiting_hours TEXT,
      categories TEXT NOT NULL,
      phone TEXT,
      cover_image TEXT,
      gallery_images TEXT DEFAULT '[]',
      certificate_image TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      artisan_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      slug TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      description TEXT NOT NULL,
      price REAL NOT NULL,
      inventory INTEGER NOT NULL DEFAULT 0,
      hero_image TEXT,
      status TEXT NOT NULL CHECK(status IN ('draft', 'published')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS product_images (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      image_path TEXT NOT NULL,
      alt_text TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS production_steps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      occurred_at TEXT NOT NULL,
      image_path TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      buyer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      artisan_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
      product_name TEXT NOT NULL,
      product_slug TEXT,
      quantity INTEGER NOT NULL CHECK(quantity > 0),
      unit_price REAL NOT NULL,
      total_amount REAL NOT NULL,
      recipient_name TEXT NOT NULL,
      phone TEXT NOT NULL,
      shipping_address TEXT NOT NULL,
      note TEXT,
      request_token TEXT,
      status TEXT NOT NULL DEFAULT 'placed' CHECK(status IN ('placed', 'cancelled')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS slug_redirects (
      entity TEXT NOT NULL CHECK(entity IN ('news')),
      old_slug TEXT NOT NULL,
      new_slug TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (entity, old_slug)
    );

    CREATE TABLE IF NOT EXISTS sessions (
      sid TEXT PRIMARY KEY,
      sess TEXT NOT NULL,
      expires_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS bids (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      quote_id INTEGER NOT NULL REFERENCES quote_requests(id) ON DELETE CASCADE,
      artisan_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      unit_price REAL NOT NULL,
      lead_days INTEGER NOT NULL,
      completion_date TEXT NOT NULL,
      note TEXT,
      status TEXT NOT NULL CHECK(status IN ('submitted', 'accepted', 'rejected')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (quote_id, artisan_id)
    );

    CREATE TABLE IF NOT EXISTS quote_targets (
      quote_id INTEGER NOT NULL REFERENCES quote_requests(id) ON DELETE CASCADE,
      artisan_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      seen_at TEXT,
      PRIMARY KEY (quote_id, artisan_id)
    );

    CREATE TABLE IF NOT EXISTS news (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      excerpt TEXT NOT NULL,
      body TEXT NOT NULL,
      cover_image TEXT,
      is_published INTEGER NOT NULL DEFAULT 0,
      published_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    CREATE INDEX IF NOT EXISTS idx_users_role_status ON users(role, status);
    CREATE INDEX IF NOT EXISTS idx_artisan_profiles_user_id ON artisan_profiles(user_id);
    CREATE INDEX IF NOT EXISTS idx_artisan_profiles_slug ON artisan_profiles(slug);
    CREATE INDEX IF NOT EXISTS idx_products_artisan_id ON products(artisan_id);
    CREATE INDEX IF NOT EXISTS idx_products_slug ON products(slug);
    CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
    CREATE INDEX IF NOT EXISTS idx_products_status ON products(status);
    CREATE INDEX IF NOT EXISTS idx_product_images_product_id ON product_images(product_id);
    CREATE INDEX IF NOT EXISTS idx_production_steps_product_id ON production_steps(product_id);
    CREATE INDEX IF NOT EXISTS idx_quote_requests_buyer_id ON quote_requests(buyer_id);
    CREATE INDEX IF NOT EXISTS idx_quote_requests_status ON quote_requests(status);
    CREATE INDEX IF NOT EXISTS idx_quote_targets_artisan_id ON quote_targets(artisan_id);
    CREATE INDEX IF NOT EXISTS idx_bids_quote_id ON bids(quote_id);
    CREATE INDEX IF NOT EXISTS idx_bids_artisan_id ON bids(artisan_id);
    CREATE INDEX IF NOT EXISTS idx_news_slug ON news(slug);
    CREATE INDEX IF NOT EXISTS idx_news_published ON news(is_published, published_at);
    CREATE INDEX IF NOT EXISTS idx_orders_buyer_id ON orders(buyer_id);
    CREATE INDEX IF NOT EXISTS idx_orders_artisan_id ON orders(artisan_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
  `);
  migrate(target);
}

/**
 * Tạo tài khoản quản trị đầu tiên cho môi trường production (không nạp dữ liệu demo).
 * Không làm gì nếu đã có admin.
 * @param {{ email?: string, password?: string, fullName?: string }} credentials Lấy từ ADMIN_EMAIL/ADMIN_PASSWORD.
 * @param {SqliteAdapter} [target]
 * @returns {boolean} true nếu vừa tạo admin.
 */
function bootstrapAdmin({ email, password, fullName = 'Quản Trị Viên vCraft' }, target = adapter) {
  if (target.get("SELECT id FROM users WHERE role = 'admin' LIMIT 1")) {
    return false;
  }
  if (!email || !email.includes('@') || !password || password.length < 12) {
    throw new Error('Chưa có tài khoản admin: đặt ADMIN_EMAIL và ADMIN_PASSWORD (tối thiểu 12 ký tự) để khởi tạo.');
  }
  target.insert('users', {
    full_name: fullName,
    email: email.trim().toLowerCase(),
    password_hash: bcrypt.hashSync(password, 10),
    role: 'admin',
    status: 'approved'
  });
  return true;
}

/**
 * Nạp dữ liệu mẫu cố định (tài khoản demo mật khẩu công khai) nếu CSDL chưa có admin demo.
 * Chỉ dùng cho phát triển/demo; production dùng {@link bootstrapAdmin}.
 * @param {SqliteAdapter} [target]
 */
function seedDatabase(target = adapter) {
  const existingAdmin = target.get('SELECT id FROM users WHERE email = ?', ['admin@vcraft.vn']);
  if (existingAdmin) {
    return;
  }

  /** Câu lệnh ghi gắn sẵn SQL; `run(...params)` trả về { changes, lastInsertId }. */
  const statement = (sql) => ({ run: (...params) => target.run(sql, params) });

  target.transaction(() => {
    const adminPass = bcrypt.hashSync('Admin@123', 10);
    const buyerPass = bcrypt.hashSync('Buyer@123', 10);
    const artisanPass = bcrypt.hashSync('Artisan@123', 10);

    const insertUser = statement(`
      INSERT INTO users (full_name, email, password_hash, role, status, created_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
    `);

    const adminId = insertUser.run(
      'Quản Trị Viên vCraft',
      'admin@vcraft.vn',
      adminPass,
      'admin',
      'approved'
    ).lastInsertId;

    const buyerId = insertUser.run(
      'Nguyễn Văn An',
      'buyer@vcraft.vn',
      buyerPass,
      'buyer',
      'approved'
    ).lastInsertId;

    const artisan1Id = insertUser.run(
      'Nghệ nhân Trần Văn Độ',
      'gom.battrang@vcraft.vn',
      artisanPass,
      'artisan',
      'approved'
    ).lastInsertId;

    const artisan2Id = insertUser.run(
      'Nghệ nhân Triệu Thị Mão',
      'lua.vanphuc@vcraft.vn',
      artisanPass,
      'artisan',
      'approved'
    ).lastInsertId;

    const artisan3Id = insertUser.run(
      'Nghệ nhân Nguyễn Văn Tĩnh',
      'maytre.phuvinh@vcraft.vn',
      artisanPass,
      'artisan',
      'pending'
    ).lastInsertId;

    // Artisan Profiles
    const insertProfile = statement(`
      INSERT INTO artisan_profiles (
        user_id, slug, workshop_name, story, address, latitude, longitude,
        is_open, visiting_hours, categories, phone, cover_image, gallery_images, certificate_image
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertProfile.run(
      artisan1Id,
      'gom-su-bat-trang',
      'Xưởng Gốm Tinh Hoa Bát Tràng',
      'Kế thừa tinh hoa gốm cổ truyền qua 5 thế hệ tại làng gốm Bát Tràng, Hà Nội. Nghệ nhân chuyên phục chế men tro, men rạn và tạo tác các bình gốm độc bản nung củi truyền thống, gìn giữ hồn cốt đất thiêng Thăng Long.',
      'Thôn 1 Làng cổ Bát Tràng, Gia Lâm, Hà Nội',
      20.9786,
      105.9125,
      1,
      '08:00 - 17:30 (Hằng ngày)',
      'Gốm sứ, Mỹ nghệ',
      '0912345678',
      '/images/heritage/tho-ha-pottery.webp',
      JSON.stringify([
        '/images/heritage/pottery-hands.webp',
        '/images/heritage/vintage-pottery.webp'
      ]),
      '/images/heritage/pottery-kiln.webp'
    );

    insertProfile.run(
      artisan2Id,
      'lua-to-tam-van-phuc',
      'Lụa Tơ Tằm Cổ Truyền Vạn Phúc',
      'Được dệt từ sợi tơ tằm thượng hạng xứ Đoài, lụa Vạn Phúc nức tiếng ngàn năm với kỹ thuật dệt vân gấm mượt mà, hoa văn tinh tế và màu nhuộm thảo mộc tự nhiên bền bỉ với thời gian.',
      'Phố lụa Vạn Phúc, Hà Đông, Hà Nội',
      20.9772,
      105.7725,
      1,
      '08:30 - 18:00 (Thứ 2 - Chủ Nhật)',
      'Lụa tơ tằm, Dệt thủ công',
      '0987654321',
      '/images/heritage/loom-artisan.webp',
      JSON.stringify([
        '/images/heritage/loom-detail.webp',
        '/images/heritage/silk-yarn.webp'
      ]),
      '/images/heritage/textile-shop.webp'
    );

    insertProfile.run(
      artisan3Id,
      'may-tre-dan-phu-vinh',
      'Mây Tre Đan Nghệ Thuật Phú Vinh',
      'Làng nghề mây tre đan Phú Vinh nổi tiếng với các sản phẩm đan lát nan mịn, kỹ thuật đan nong mốt, nong đôi uốn lượn kỳ công.',
      'Xã Phú Nghĩa, Chương Mỹ, Hà Nội',
      20.9167,
      105.6583,
      0,
      '08:00 - 17:00 (Chờ duyệt)',
      'Mây tre đan, Thủ công mỹ nghệ',
      '0901234567',
      '/images/heritage/phu-vinh-rattan.webp',
      '[]',
      null
    );

    // Products
    const insertProduct = statement(`
      INSERT INTO products (
        artisan_id, slug, name, category, description, price, inventory, hero_image, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const p1Id = insertProduct.run(
      artisan1Id,
      'binh-hoa-men-ran-co-hoa-tiet-hoa-sen',
      'Bình Hoa Men Rạn Cổ Họa Tiết Hoa Sen Thăng Long',
      'Gốm sứ',
      'Bình hoa được tạo hình thủ công vuốt tay trên bàn xoay, tráng lớp men rạn bài cổ và nung củi ở nhiệt độ 1250 độ C. Họa tiết hoa sen được nghệ nhân khắc chìm thủ công từng đường nét tinh xảo.',
      1850000,
      8,
      '/images/heritage/vintage-pottery.webp',
      'published'
    ).lastInsertId;

    const p2Id = insertProduct.run(
      artisan1Id,
      'bo-am-chen-men-hoang-tho-bat-trang',
      'Bộ Ấm Chén Men Hoàng Thổ Trà Đạo',
      'Gốm sứ',
      'Bộ ấm chén cao cấp chế tác từ đất sét son Bát Tràng, giữ nhiệt vượt trội và lưu hương trà tinh tế. Men hoàng thổ trầm ấm mang đậm phong vị trà Việt xưa.',
      1200000,
      15,
      '/images/heritage/tho-ha-pottery.webp',
      'published'
    ).lastInsertId;

    const p3Id = insertProduct.run(
      artisan2Id,
      'khan-lua-to-tam-van-phuc-nhuom-mau-tu-nhien',
      'Khăn Lụa Tơ Tằm Vạn Phúc Dệt Vân Mây Nhuộm Chàm',
      'Lụa tơ tằm',
      'Khăn choàng lụa 100% sợi tơ tằm tự nhiên, dệt vân mây cổ truyền trên khung dệt gỗ cổ. Nhuộm chàm thủ công 8 nước tạo chiều sâu màu sắc tự nhiên và mềm mại tuyệt đối.',
      950000,
      20,
      '/images/heritage/silk-yarn.webp',
      'published'
    ).lastInsertId;

    // Production Steps for Product 1
    const insertStep = statement(`
      INSERT INTO production_steps (product_id, title, description, occurred_at, image_path, sort_order)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    insertStep.run(
      p1Id,
      'Chuẩn bị và lọc đất sét cao lanh',
      'Đất sét sông Hồng được tuyển chọn kỹ, ngâm lắng qua 4 bể lọc để loại bỏ hoàn toàn tạp chất.',
      '2024-03-01T08:00:00.000Z',
      '/images/heritage/tho-ha-pottery.webp',
      1
    );

    insertStep.run(
      p1Id,
      'Vuốt tay trên bàn xoay thủ công',
      'Nghệ nhân trực tiếp vuốt dáng bình hoa cân đối, duy trì độ dày thành gốm chuẩn xác 6mm.',
      '2024-03-05T10:30:00.000Z',
      '/images/heritage/pottery-hands.webp',
      2
    );

    insertStep.run(
      p1Id,
      'Khắc họa tiết hoa sen và phủ men rạn',
      'Khắc tay họa tiết cánh sen Thăng Long, nhúng lớp men rạn gia truyền từ tro vỏ đỗ và đá son.',
      '2024-03-10T14:00:00.000Z',
      '/images/heritage/vintage-pottery.webp',
      3
    );

    insertStep.run(
      p1Id,
      'Nung củi lò bầu 3 ngày 3 đêm',
      'Nung ở 1250 độ C và hạ nhiệt chậm tự nhiên tạo nên các vân rạn sắc nét và độc bản.',
      '2024-03-15T09:00:00.000Z',
      '/images/heritage/pottery-kiln.webp',
      4
    );

    // Production Steps for Product 3
    insertStep.run(
      p3Id,
      'Tuyển kén và ươm tơ tự nhiên',
      'Lựa chọn kén tằm vàng tươi nõn, ươm tơ trong nước nóng để thu sợi tơ óng ả.',
      '2024-02-10T08:00:00.000Z',
      '/images/heritage/silk-yarn.webp',
      1
    );

    insertStep.run(
      p3Id,
      'Mắc cửi và dệt vân mây trên khung dệt cổ',
      'Dệt từng sợi ngang sợi dọc theo hoa văn vân mây cung đình xưa.',
      '2024-02-18T11:00:00.000Z',
      '/images/heritage/loom-detail.webp',
      2
    );

    insertStep.run(
      p3Id,
      'Nhuộm chàm tự nhiên và phơi nắng sớm',
      'Nhuộm thảo mộc từ cao chàm tự nhiên qua nhiều lượt nắng để đạt sắc xanh biếc đặc trưng.',
      '2024-02-25T15:30:00.000Z',
      '/images/heritage/textile-shop.webp',
      3
    );

    // Product Images
    const insertImage = statement(`
      INSERT INTO product_images (product_id, image_path, alt_text, sort_order)
      VALUES (?, ?, ?, ?)
    `);

    insertImage.run(
      p1Id,
      '/images/heritage/pottery-hands.webp',
      'Bình hoa men rạn Bát Tràng chế tác thủ công',
      1
    );
    insertImage.run(
      p1Id,
      '/images/heritage/pottery-kiln.webp',
      'Lò nung gốm truyền thống và mẻ gốm men cổ',
      2
    );

    // News
    const insertNews = statement(`
      INSERT INTO news (title, slug, excerpt, body, cover_image, is_published, published_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    insertNews.run(
      'Hành Trình Gìn Giữ Hồn Gốm Việt Cùng Làng Nghề Bát Tràng',
      'hanh-trinh-gin-giu-hon-gom-viet-cung-lang-nghe-bat-trang',
      'Khám phá câu chuyện bền bỉ của những nghệ nhân gốm nung củi Bát Tràng trong kỷ nguyên công nghệ số và kết nối thương mại minh bạch.',
      '<p>Làng gốm Bát Tràng nằm bên bờ tả ngạn sông Hồng đã trải qua hơn 700 năm lịch sử gìn giữ ngọn lửa nghề. Từng thớ đất sét cao lanh, từng mẻ men tro cổ truyền đều đọng lại bàn tay khéo léo và tấm lòng kiên định của người nghệ nhân Việt.</p><p>Tại vCraft, chúng tôi đồng hành cùng các xưởng thủ công tiêu biểu để số hóa quy trình chế tác, mang đến cho người yêu thủ công câu chuyện minh bạch về nguồn gốc xuất xứ qua mã QR định danh và hành trình sản xuất tỉ mỉ.</p><p>Hãy cùng đến thăm các xưởng gốm vào dịp cuối tuần, trực tiếp trải nghiệm vuốt gốm và lắng nghe câu chuyện thổi hồn vào đất của nghệ nhân.</p>',
      '/images/heritage/pottery-kiln.webp',
      1,
      '2024-03-01 08:00:00'
    );

    insertNews.run(
      'Sức Sống Mãnh Liệt Của Làng Lụa Vạn Phúc Ngàn Năm Tuổi',
      'suc-song-manh-liet-cua-lang-lua-van-phuc-ngan-nam-tuoi',
      'Từ tơ tằm thiên nhiên đến những tấm lụa mềm mại như mây, làng lụa Vạn Phúc vẫn âm vang tiếng thoi đưa qua bao thăng trầm thời gian.',
      '<p>Nằm bên bờ sông Nhuệ hiền hòa, làng lụa Vạn Phúc từ xa xưa đã nổi tiếng với câu ca: "Chiếu Nga Sơn, gạch Bát Tràng / Vải tơ Nam Định, lụa hàng Vạn Phúc". Nghệ nhân nơi đây giữ gìn từng kỹ thuật luồn sợi, mắc cửi và nhuộm thảo mộc tự nhiên.</p><p>Sản phẩm lụa Vạn Phúc tại vCraft luôn đi kèm thông tin minh bạch về nghệ nhân chế tác và quy trình thủ công nguyên bản.</p>',
      '/images/heritage/loom-artisan.webp',
      1,
      '2024-03-10 09:30:00'
    );

    // Quote Request Scenario
    const insertQuote = statement(`
      INSERT INTO quote_requests (buyer_id, title, description, category, quantity, deadline, status, version)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const quote1Id = insertQuote.run(
      buyerId,
      'Đặt làm 50 bộ ấm trà quà tặng doanh nghiệp men lam gốm sứ',
      'Chúng tôi cần đặt chế tác 50 bộ ấm chén men lam cổ Bát Tràng in logo chìm đáy chén cho sự kiện kỷ niệm thành lập. Yêu cầu hộp quà lót lụa cao cấp.',
      'Gốm sứ',
      50,
      '2026-12-15',
      'bidding',
      1
    ).lastInsertId;

    // Quote Target
    const insertTarget = statement(`
      INSERT INTO quote_targets (quote_id, artisan_id, seen_at)
      VALUES (?, ?, ?)
    `);

    insertTarget.run(quote1Id, artisan1Id, '2026-10-20 09:00:00');

    // Bid
    const insertBid = statement(`
      INSERT INTO bids (quote_id, artisan_id, unit_price, lead_days, completion_date, note, status)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    insertBid.run(
      quote1Id,
      artisan1Id,
      850000,
      20,
      '2026-11-20',
      'Xưởng Gốm Tinh Hoa Bát Tràng cam kết chế tác đúng mẫu men lam cổ Thăng Long, hộp quà bọc lụa hoàn chỉnh và kiểm định chất lượng từng sản phẩm.',
      'submitted'
    );
  });
}

module.exports = {
  adapter,
  db,
  createAdapter,
  initializeDatabase,
  seedDatabase,
  bootstrapAdmin
};
