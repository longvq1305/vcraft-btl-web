require('dotenv').config();
const app = require('./app');
const { initializeDatabase, seedDatabase } = require('./src/config/database');

const PORT = process.env.PORT || 3000;

// Initialize database schema and deterministic seed data
try {
  initializeDatabase();
  seedDatabase();
  console.log('[vCraft] Cơ sở dữ liệu SQLite đã được khởi tạo và nạp dữ liệu mẫu thành công.');
} catch (err) {
  console.error('[vCraft] Lỗi khởi tạo cơ sở dữ liệu:', err);
  process.exit(1);
}

const server = app.listen(PORT, () => {
  console.log(`[vCraft] Máy chủ vCraft đang hoạt động tại: http://localhost:${PORT}`);
  console.log('[vCraft] Tài khoản thử nghiệm:');
  console.log('  - Quản trị viên: admin@vcraft.vn / Admin@123');
  console.log('  - Khách hàng:    buyer@vcraft.vn / Buyer@123');
  console.log('  - Nghệ nhân gốm: gom.battrang@vcraft.vn / Artisan@123');
  console.log('  - Nghệ nhân lụa: lua.vanphuc@vcraft.vn / Artisan@123');
});

// Graceful shutdown
function handleShutdown(signal) {
  console.log(`\n[vCraft] Nhận tín hiệu ${signal}. Đang đóng máy chủ an toàn...`);
  server.close(() => {
    console.log('[vCraft] Máy chủ đã dừng.');
    process.exit(0);
  });
}

process.on('SIGINT', () => handleShutdown('SIGINT'));
process.on('SIGTERM', () => handleShutdown('SIGTERM'));
