const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const request = require('supertest');
const sharp = require('sharp');

// Set test environment variables before loading app/database
const testDbPath = path.resolve(__dirname, '../data/test-integration.db');
process.env.DB_FILE = testDbPath;
process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'test-session-secret-for-integration-suite-32chars';

const { initializeDatabase, seedDatabase, db } = require('../src/config/database');
const app = require('../app');

// Initialize and seed once for integration tests
initializeDatabase();
seedDatabase();

function cleanupDbFiles() {
  try {
    db.close();
  } catch (_) {}
  [testDbPath, testDbPath + '-wal', testDbPath + '-shm'].forEach((p) => {
    if (fs.existsSync(p)) {
      try { fs.unlinkSync(p); } catch (_) {}
    }
  });
}

process.on('exit', cleanupDbFiles);

test('Integration: Public Endpoints & Rendering', async (t) => {
  await t.test('GET / returns 200 with brand, featured products and workshops', async () => {
    const res = await request(app).get('/');
    assert.equal(res.status, 200);
    assert.match(res.text, /vCraft/);
    assert.match(res.text, /Bình Hoa Men Rạn Cổ/);
    assert.match(res.text, /Xưởng Gốm Tinh Hoa Bát Tràng/);
  });

  await t.test('GET /catalog returns 200 and supports query filtering', async () => {
    const resAll = await request(app).get('/catalog');
    assert.equal(resAll.status, 200);
    assert.match(resAll.text, /Bộ sưu tập Tác phẩm Thủ công/);

    const resFilter = await request(app).get('/catalog?category=' + encodeURIComponent('Gốm sứ'));
    assert.equal(resFilter.status, 200);
    assert.match(resFilter.text, /Gốm sứ/);

    const resSearch = await request(app).get('/catalog?q=Hoa+Sen');
    assert.equal(resSearch.status, 200);
    assert.match(resSearch.text, /Bình Hoa Men Rạn Cổ Họa Tiết Hoa Sen/);
  });

  await t.test('GET /workshops and /workshops/:slug return 200 with artisan details', async () => {
    const resList = await request(app).get('/workshops');
    assert.equal(resList.status, 200);
    assert.match(resList.text, /Xưởng Gốm Tinh Hoa Bát Tràng/);

    const resDetail = await request(app).get('/workshops/gom-su-bat-trang');
    assert.equal(resDetail.status, 200);
    assert.match(resDetail.text, /Trần Văn Độ/);
    assert.match(resDetail.text, /Thôn 1 Làng cổ Bát Tràng/);
  });

  await t.test('GET /map returns 200 with Leaflet setup and approved workshop pins', async () => {
    const res = await request(app).get('/map');
    assert.equal(res.status, 200);
    assert.match(res.text, /gom-su-bat-trang/);
    assert.match(res.text, /leaflet/i);
    // Unapproved artisan should NOT appear on public map
    assert.doesNotMatch(res.text, /may-tre-dan-phu-vinh/);
  });

  await t.test('GET /news and /news/:slug return 200 for published articles', async () => {
    const resList = await request(app).get('/news');
    assert.equal(resList.status, 200);
    assert.match(resList.text, /Hành Trình Gìn Giữ Hồn Gốm Việt/);

    const resDetail = await request(app).get('/news/hanh-trinh-gin-giu-hon-gom-viet-cung-lang-nghe-bat-trang');
    assert.equal(resDetail.status, 200);
    assert.match(resDetail.text, /Hành Trình Gìn Giữ Hồn Gốm Việt Cùng Làng Nghề Bát Tràng/);
  });

  await t.test('GET /products/:slug, /story and /qr.png return valid responses', async () => {
    const slug = 'binh-hoa-men-ran-co-hoa-tiet-hoa-sen';

    const resDetail = await request(app).get(`/products/${slug}`);
    assert.equal(resDetail.status, 200);
    assert.match(resDetail.text, /Bình Hoa Men Rạn Cổ Họa Tiết Hoa Sen/);

    const resStory = await request(app).get(`/products/${slug}/story`);
    assert.equal(resStory.status, 200);
    assert.match(resStory.text, /Hành trình Chế tác/);
    assert.match(resStory.text, /Chuẩn bị và lọc đất sét cao lanh/);
    assert.match(resStory.text, /Vuốt tay trên bàn xoay/);
    assert.match(resStory.text, /qr\.png/);

    const resQr = await request(app).get(`/products/${slug}/qr.png`);
    assert.equal(resQr.status, 200);
    assert.equal(resQr.header['content-type'], 'image/png');
    assert.ok(resQr.body.length > 100, 'QR PNG buffer must not be empty');
  });

  await t.test('GET nonexistent resources return 404 error page', async () => {
    const res = await request(app).get('/not-existing-page-404');
    assert.equal(res.status, 404);
    assert.match(res.text, /404/);
  });
});

test('Integration: Authentication, RBAC and CSRF Security', async (t) => {
  await t.test('POST mutating endpoints without CSRF token are rejected with 403', async () => {
    const res = await request(app).post('/auth/login').send({
      email: 'admin@vcraft.vn',
      password: 'wrong'
    });
    assert.equal(res.status, 403);
    assert.match(res.text, /CSRF/i);
  });

  await t.test('POST with invalid CSRF token is rejected with 403', async () => {
    const agent = request.agent(app);
    await agent.get('/auth/login'); // sets session
    const res = await agent.post('/auth/login').send({
      _csrf: 'invalid-csrf-token-1234567890abcdef',
      email: 'admin@vcraft.vn',
      password: 'Admin@123'
    });
    assert.equal(res.status, 403);
  });

  await t.test('Admin login flow and role-protected /admin dashboard', async () => {
    const agent = request.agent(app);
    const loginPage = await agent.get('/auth/login');
    const csrf = loginPage.text.match(/name="_csrf" value="([^"]+)"/)[1];

    const loginRes = await agent.post('/auth/login').send({
      _csrf: csrf,
      email: 'admin@vcraft.vn',
      password: 'Admin@123'
    });
    assert.equal(loginRes.status, 302);
    assert.equal(loginRes.header.location, '/admin');

    const adminPage = await agent.get('/admin');
    assert.equal(adminPage.status, 200);
    assert.match(adminPage.text, /Bàn làm việc Quản trị viên/);
  });

  await t.test('Buyer role cannot access /admin (403 Forbidden)', async () => {
    const agent = request.agent(app);
    const loginPage = await agent.get('/auth/login');
    const csrf = loginPage.text.match(/name="_csrf" value="([^"]+)"/)[1];

    await agent.post('/auth/login').send({
      _csrf: csrf,
      email: 'buyer@vcraft.vn',
      password: 'Buyer@123'
    });

    const adminPage = await agent.get('/admin');
    assert.equal(adminPage.status, 403);
  });

  await t.test('Artisan role can access /artisan/dashboard and create product with image', async () => {
    const agent = request.agent(app);
    const loginPage = await agent.get('/auth/login');
    const csrf = loginPage.text.match(/name="_csrf" value="([^"]+)"/)[1];

    await agent.post('/auth/login').send({
      _csrf: csrf,
      email: 'gom.battrang@vcraft.vn',
      password: 'Artisan@123'
    });

    const dashPage = await agent.get('/artisan/dashboard');
    assert.equal(dashPage.status, 200);

    // Form page
    const formPage = await agent.get('/artisan/products/new');
    const prodCsrf = formPage.text.match(/name="_csrf" value="([^"]+)"/)[1];

    // Generate valid test PNG image
    const imgBuffer = await sharp({
      create: {
        width: 120,
        height: 120,
        channels: 4,
        background: { r: 120, g: 60, b: 30, alpha: 1 }
      }
    }).png().toBuffer();

    const uploadRes = await agent.post('/artisan/products')
      .field('_csrf', prodCsrf)
      .field('name', 'Tác Phẩm Thử Nghiệm Tự Động')
      .field('category', 'Gốm sứ')
      .field('description', 'Mô tả chi tiết tác phẩm thử nghiệm cho test tự động')
      .field('price', '450000')
      .field('inventory', '5')
      .field('status', 'published')
      .attach('hero_image', imgBuffer, 'test.png');

    assert.equal(uploadRes.status, 302);
    assert.match(uploadRes.header.location, /\/artisan\/products\/\d+\/edit/);

    // Verify product exists in database and on disk as WebP
    const created = db.prepare("SELECT * FROM products WHERE name = 'Tác Phẩm Thử Nghiệm Tự Động'").get();
    assert.ok(created, 'Product should be saved in DB');
    assert.match(created.hero_image, /\.webp$/, 'Hero image should be converted to WebP');

    const localFilePath = path.join(__dirname, '../public', created.hero_image.replace(/^\//, ''));
    assert.ok(fs.existsSync(localFilePath), 'WebP image file must exist in public/uploads');

    // Clean up uploaded file
    try { fs.unlinkSync(localFilePath); } catch (_) {}
  });
});
