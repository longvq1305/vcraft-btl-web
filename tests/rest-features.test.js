const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const request = require('supertest');

// Dùng file riêng và đặt môi trường trước khi nạp DB hoặc ứng dụng.
const testDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'vcraft-rest-'));
process.env.DB_FILE = path.join(testDirectory, 'rest.db');
process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'test-rest-features-session-secret-32chars';

const { adapter, initializeDatabase, seedDatabase } = require('../src/config/database');
const News = require('../src/models/News');
const app = require('../app');

const productSlug = 'binh-hoa-men-ran-co-hoa-tiet-hoa-sen';

test.before(() => {
  initializeDatabase();
  seedDatabase();
});

test.after(() => {
  try {
    adapter.close();
  } finally {
    fs.rmSync(testDirectory, { recursive: true, force: true });
  }
});

/** Lấy token CSRF từ trường ẩn trong trang HTML thật. */
function csrf(response) {
  const match = response.text.match(/name="_csrf" value="([^"]+)"/);
  assert.ok(match, 'Trang phải có token CSRF');
  return match[1];
}

/** Tạo phiên đăng nhập như trình duyệt thông qua form. */
async function login(email, password) {
  const agent = request.agent(app);
  const page = await agent.get('/auth/login').expect(200);
  await agent.post('/auth/login').type('form').send({ _csrf: csrf(page), email, password }).expect(302);
  return agent;
}

test('GET/HEAD chuẩn hóa đường dẫn, giữ query và trả 404 cho mã báo giá không phải số', async () => {
  await request(app).get('/quotes/abc').expect(404);
  await request(app).get(`/san-pham/${productSlug}`).expect(301).expect('Location', `/products/${productSlug}`);
  await request(app).get('/catalog/').expect(301).expect('Location', '/catalog');
  await request(app).head(`/SAN-PHAM/${productSlug.toUpperCase()}/?q=Gom+Viet`)
    .expect(301).expect('Location', `/products/${productSlug}?q=Gom+Viet`);
  await request(app).get('/images/CHUA-CO/').expect(404);
  await request(app).get('/catalog?_method=DELETE').expect(200);
});

test('Người mua dùng form POST để sửa và xóa bản nháp theo PUT/DELETE', async () => {
  const buyer = await login('buyer@vcraft.vn', 'Buyer@123');
  const createForm = await buyer.get('/quotes/new').expect(200);
  const form = {
    title: 'Đặt bộ trà kiểm thử', description: 'Bộ trà thủ công men trắng.',
    category: 'Gốm sứ', quantity: 3,
    deadline: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)
  };
  const created = await buyer.post('/quotes').type('form').send({ ...form, _csrf: csrf(createForm) }).expect(302);
  const location = created.headers.location;
  assert.match(location, /^\/quotes\/\d+$/);

  const edit = await buyer.get(`${location}/edit`).expect(200);
  assert.match(edit.text, /name="_method" value="PUT"/);
  assert.match(edit.text, /Đặt bộ trà kiểm thử/);
  await buyer.post(location).type('form')
    .send({ ...form, title: 'Bộ trà sau chỉnh sửa', _method: 'put', _csrf: csrf(edit) })
    .expect(302).expect('Location', location);

  const detail = await buyer.get(location).expect(200);
  assert.match(detail.text, /Bộ trà sau chỉnh sửa/);
  assert.match(detail.text, /name="_method" value="DELETE"/);
  await buyer.post(location).type('form').send({ _method: 'DELETE' }).expect(403);
  await buyer.post(location).type('form').send({ _method: 'DELETE', _csrf: csrf(detail) })
    .expect(302).expect('Location', '/quotes');
  await buyer.get(location).expect(404);
});

test('Đổi tiêu đề bản tin chuyển hướng slug cũ một bước, kể cả khi dùng lại slug cũ', async () => {
  const admin = await login('admin@vcraft.vn', 'Admin@123');
  const slug = 'hanh-trinh-gin-giu-hon-gom-viet-cung-lang-nghe-bat-trang';
  const article = News.findBySlug(slug);
  assert.ok(article);
  const form = await admin.get(`/admin/news/${article.id}/edit`).expect(200);
  const payload = { _csrf: csrf(form), _method: 'PUT', excerpt: article.excerpt, body: article.body, isPublished: '1' };

  await admin.post(`/admin/news/${article.id}`).type('form').send({ ...payload, title: 'Gom Bat Trang Moi' }).expect(302);
  const secondSlug = News.findById(article.id).slug;
  assert.notEqual(secondSlug, slug);
  await request(app).get(`/news/${slug}`).expect(301).expect('Location', `/news/${secondSlug}`);

  await admin.post(`/admin/news/${article.id}`).type('form').send({ ...payload, title: 'Nghe Gom Hien Nay' }).expect(302);
  const thirdSlug = News.findById(article.id).slug;
  for (const old of [slug, secondSlug]) {
    await request(app).get(`/news/${old}`).expect(301).expect('Location', `/news/${thirdSlug}`);
  }

  await admin.post(`/admin/news/${article.id}`).type('form').send({ ...payload, title: article.title }).expect(302);
  for (const old of [secondSlug, thirdSlug]) {
    await request(app).get(`/news/${old}`).expect(301).expect('Location', `/news/${slug}`);
  }
  await request(app).get(`/news/${slug}`).expect(200);
});

test('Đặt mua trừ tồn kho, từ chối quá tồn kho và hủy chỉ hoàn tồn một lần', async () => {
  const buyer = await login('buyer@vcraft.vn', 'Buyer@123');
  const product = adapter.get('SELECT id, name, price, inventory, artisan_id FROM products WHERE slug = ?', [productSlug]);
  assert.ok(product.inventory >= 3, 'Dữ liệu mẫu phải còn đủ hàng cho kiểm thử');
  /** Đọc tồn kho sau từng thao tác để xác minh thay đổi đã lưu. */
  const inventory = () => adapter.get('SELECT inventory FROM products WHERE id = ?', [product.id]).inventory;

  const productPage = await buyer.get(`/products/${productSlug}`).expect(200);
  assert.match(productPage.text, /action="\/orders" method="POST"/);
  const orderForm = {
    productId: product.id, quantity: 2, recipientName: 'Nguyễn Văn Thử', phone: '0901234567',
    shippingAddress: '24 Phố Huế, Hà Nội', note: 'Giao giờ hành chính', _csrf: csrf(productPage),
    requestToken: productPage.text.match(/name="requestToken" value="([^"]+)"/)[1]
  };
  const invalid = await buyer.post('/orders').type('form').send({ ...orderForm, phone: '123' }).expect(400);
  assert.match(invalid.text, /số điện thoại Việt Nam hợp lệ/);
  assert.match(invalid.text, /Nguyễn Văn Thử/);
  assert.match(invalid.text, /24 Phố Huế, Hà Nội/);
  assert.equal(inventory(), product.inventory);

  const created = await buyer.post('/orders').type('form').send(orderForm).expect(302);
  const location = created.headers.location;
  assert.match(location, /^\/orders\/\d+$/);
  const id = Number(location.split('/').pop());
  const saved = adapter.get('SELECT * FROM orders WHERE id = ?', [id]);
  assert.equal(saved.product_name, product.name);
  assert.equal(saved.product_slug, productSlug);
  assert.equal(saved.unit_price, product.price);
  assert.equal(saved.total_amount, product.price * orderForm.quantity);
  assert.equal(saved.status, 'placed');
  assert.equal(inventory(), product.inventory - orderForm.quantity);

  // Gửi lại đúng form đó (bấm đúp/F5): về đơn cũ, không tạo đơn mới, không trừ kho lần hai.
  await buyer.post('/orders').type('form').send(orderForm).expect(302).expect('Location', location);
  assert.equal(adapter.get('SELECT COUNT(*) AS total FROM orders').total, 1);
  assert.equal(inventory(), product.inventory - orderForm.quantity);
  await buyer.post('/orders').type('form').send({ ...orderForm, requestToken: 'khong-hop-le' }).expect(400);

  const conflict = await buyer.post('/orders').type('form')
    .send({ ...orderForm, requestToken: crypto.randomUUID(), quantity: inventory() + 1 }).expect(409);
  assert.match(conflict.text, /hết hàng/);
  assert.equal(inventory(), product.inventory - orderForm.quantity);
  assert.equal(adapter.get('SELECT COUNT(*) AS total FROM orders').total, 1);

  const list = await buyer.get('/orders?page=1').expect(200);
  assert.ok(list.text.includes(`href="${location}"`));
  const artisan = await login('gom.battrang@vcraft.vn', 'Artisan@123');
  const artisanDetail = await artisan.get(location).expect(200);
  assert.match(artisanDetail.text, /Nguyễn Văn Thử/);
  assert.doesNotMatch(artisanDetail.text, /Hủy đơn hàng/);
  await artisan.post(`${location}/cancel`).type('form')
    .send({ _method: 'PATCH', _csrf: csrf(artisanDetail) }).expect(403);
  const otherArtisan = await login('lua.vanphuc@vcraft.vn', 'Artisan@123');
  await otherArtisan.get(location).expect(404);
  const admin = await login('admin@vcraft.vn', 'Admin@123');
  await admin.get(location).expect(200);

  const detail = await buyer.get(location).expect(200);
  const cancelForm = { _method: 'PATCH', _csrf: csrf(detail) };
  await buyer.post(`${location}/cancel`).type('form').send(cancelForm).expect(302).expect('Location', location);
  assert.equal(inventory(), product.inventory);
  assert.equal(adapter.get('SELECT status FROM orders WHERE id = ?', [id]).status, 'cancelled');
  await buyer.post(`${location}/cancel`).type('form').send(cancelForm).expect(409);
  assert.equal(inventory(), product.inventory);
});

test('Admin thấy nghệ nhân tạm ngưng và có thể khôi phục qua PATCH', async () => {
  const admin = await login('admin@vcraft.vn', 'Admin@123');
  const artisan = adapter.get('SELECT id FROM users WHERE email = ?', ['gom.battrang@vcraft.vn']);
  const dashboard = await admin.get('/admin').expect(200);
  const form = { _method: 'PATCH', _csrf: csrf(dashboard) };
  const statusUrl = `/admin/artisans/${artisan.id}/status`;

  // Nghệ nhân đã tự đóng cửa xưởng: tạm ngưng rồi khôi phục không được đổi lựa chọn đó.
  adapter.update('artisan_profiles', { is_open: 0 }, { user_id: artisan.id });
  await admin.post(statusUrl).type('form').send({ ...form, status: 'pending' }).expect(400);
  await admin.post(statusUrl).type('form').send({ ...form, status: 'suspended' }).expect(302);
  assert.equal(adapter.get('SELECT status FROM users WHERE id = ?', [artisan.id]).status, 'suspended');
  const suspended = await admin.get('/admin').expect(200);
  assert.match(suspended.text, /Nghệ nhân bị tạm ngưng/);
  assert.match(suspended.text, /Khôi phục/);
  await admin.post(statusUrl).type('form').send({ ...form, status: 'approved' }).expect(302).expect('Location', '/admin');
  assert.equal(adapter.get('SELECT status FROM users WHERE id = ?', [artisan.id]).status, 'approved');
  assert.equal(adapter.get('SELECT is_open FROM artisan_profiles WHERE user_id = ?', [artisan.id]).is_open, 0);
  adapter.update('artisan_profiles', { is_open: 1 }, { user_id: artisan.id });

  // Duyệt lần đầu (pending → approved) mở cửa xưởng vốn bị đóng lúc đăng ký.
  const applicant = adapter.get('SELECT id FROM users WHERE email = ?', ['maytre.phuvinh@vcraft.vn']);
  await admin.post(`/admin/artisans/${applicant.id}/status`).type('form')
    .send({ ...form, status: 'approved' }).expect(302);
  assert.equal(adapter.get('SELECT is_open FROM artisan_profiles WHERE user_id = ?', [applicant.id]).is_open, 1);
});

test('Form multipart ghi token trong body và đổi phương thức cập nhật bằng query', async () => {
  const artisan = await login('gom.battrang@vcraft.vn', 'Artisan@123');
  const product = adapter.get('SELECT * FROM products WHERE slug = ?', [productSlug]);
  const profile = await artisan.get('/artisan/profile').expect(200);
  assert.match(profile.text, /action="\/artisan\/profile\?_method=PUT"/);
  await artisan.post('/artisan/profile?_method=PUT').field('_csrf', csrf(profile))
    .field('workshop_name', 'Xưởng gốm đã cập nhật').expect(302).expect('Location', '/artisan/profile');
  assert.equal(adapter.get('SELECT workshop_name FROM artisan_profiles WHERE user_id = ?', [product.artisan_id]).workshop_name,
    'Xưởng gốm đã cập nhật');

  const productUrl = `/artisan/products/${product.id}`;
  const page = await artisan.get(`${productUrl}/edit`).expect(200);
  assert.ok(page.text.includes(`action="${productUrl}?_method=PUT"`));
  assert.ok(page.text.includes(`action="${productUrl}/steps"`));
  const token = csrf(page);
  await artisan.post(`${productUrl}?_method=PUT`).field('_csrf', token)
    .field('name', 'Tác phẩm đã cập nhật').field('category', product.category)
    .field('description', product.description).field('price', String(product.price))
    .field('inventory', String(product.inventory)).field('status', product.status)
    .expect(302).expect('Location', `${productUrl}/edit`);
  assert.equal(adapter.get('SELECT name FROM products WHERE id = ?', [product.id]).name, 'Tác phẩm đã cập nhật');
  await artisan.post(`${productUrl}/steps`).field('_csrf', token)
    .field('title', 'Thêm công đoạn kiểm thử').expect(302).expect('Location', `${productUrl}/edit#timeline`);
  assert.ok(adapter.get('SELECT id FROM production_steps WHERE product_id = ? AND title = ?',
    [product.id, 'Thêm công đoạn kiểm thử']));
});
