const Database = require('better-sqlite3');
const { initializeDatabase } = require('../../src/config/database');

function createTestDatabase() {
  const db = new Database(':memory:');
  initializeDatabase(db);
  return db;
}

function seedTestUsers(db) {
  const insertUser = db.prepare(`
    INSERT INTO users (id, full_name, email, password_hash, role, status)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const insertProfile = db.prepare(`
    INSERT INTO artisan_profiles (
      user_id, slug, workshop_name, story, address, latitude, longitude,
      is_open, categories, phone
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  // Dummy password hash
  const dummyHash = '$2a$10$abcdefghijklmnopqrstuvwxyz012345';

  // Buyer 1
  insertUser.run(1, 'Khách Mua Test', 'buyer1@vcraft.vn', dummyHash, 'buyer', 'approved');

  // Artisan 1 - Ceramic (Approved)
  insertUser.run(2, 'Nghệ nhân Gốm', 'artisan.gom@vcraft.vn', dummyHash, 'artisan', 'approved');
  insertProfile.run(
    2,
    'xuong-gom-test',
    'Xưởng Gốm Bát Tràng Test',
    'Câu chuyện xưởng gốm',
    'Bát Tràng, Gia Lâm, Hà Nội',
    20.978,
    105.918,
    1,
    'Gốm sứ, Đồ gốm',
    '0901234567'
  );

  // Artisan 2 - Silk (Approved)
  insertUser.run(3, 'Nghệ nhân Lụa', 'artisan.lua@vcraft.vn', dummyHash, 'artisan', 'approved');
  insertProfile.run(
    3,
    'xuong-lua-test',
    'Xưởng Lụa Vạn Phúc Test',
    'Câu chuyện xưởng lụa',
    'Vạn Phúc, Hà Đông, Hà Nội',
    20.975,
    105.772,
    1,
    'Lụa tơ tằm, Dệt may',
    '0907654321'
  );

  // Artisan 3 - Bamboo (Approved)
  insertUser.run(4, 'Nghệ nhân Mây Tre', 'artisan.tre@vcraft.vn', dummyHash, 'artisan', 'approved');
  insertProfile.run(
    4,
    'xuong-tre-test',
    'Xưởng Mây Tre Phú Vinh Test',
    'Câu chuyện mây tre',
    'Phú Vinh, Chương Mỹ, Hà Nội',
    20.890,
    105.650,
    1,
    'Mây tre đan',
    '0912345678'
  );

  // Artisan 4 - Pending approval
  insertUser.run(5, 'Nghệ nhân Chưa Duyệt', 'artisan.pending@vcraft.vn', dummyHash, 'artisan', 'pending');
  insertProfile.run(
    5,
    'xuong-pending-test',
    'Xưởng Chưa Duyệt',
    'Chưa được duyệt',
    'Hà Nội',
    21.0,
    105.8,
    0,
    'Gốm sứ',
    '0988888888'
  );

  // Buyer 2 (Another buyer)
  insertUser.run(6, 'Khách Mua Khác', 'buyer2@vcraft.vn', dummyHash, 'buyer', 'approved');

  return {
    buyer1: { id: 1, fullName: 'Khách Mua Test', email: 'buyer1@vcraft.vn', role: 'buyer', status: 'approved' },
    artisanCeramic: { id: 2, fullName: 'Nghệ nhân Gốm', email: 'artisan.gom@vcraft.vn', role: 'artisan', status: 'approved' },
    artisanSilk: { id: 3, fullName: 'Nghệ nhân Lụa', email: 'artisan.lua@vcraft.vn', role: 'artisan', status: 'approved' },
    artisanBamboo: { id: 4, fullName: 'Nghệ nhân Mây Tre', email: 'artisan.tre@vcraft.vn', role: 'artisan', status: 'approved' },
    artisanPending: { id: 5, fullName: 'Nghệ nhân Chưa Duyệt', email: 'artisan.pending@vcraft.vn', role: 'artisan', status: 'pending' },
    buyer2: { id: 6, fullName: 'Khách Mua Khác', email: 'buyer2@vcraft.vn', role: 'buyer', status: 'approved' }
  };
}

module.exports = {
  createTestDatabase,
  seedTestUsers
};
