const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { promisify } = require('node:util');
const request = require('supertest');

const dbDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vcraft-security-'));
process.env.DB_FILE = path.join(dbDir, 'security.db');
process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'vcraft-security-test-secret-32-characters';

const { initializeDatabase, seedDatabase, adapter } = require('../src/config/database');
const { createSession } = require('../src/config/session');
const SqliteSessionStore = require('../src/db/SqliteSessionStore');
let app;

const buyer = { email: 'buyer@vcraft.vn', password: 'Buyer@123' };
const artisan = { email: 'gom.battrang@vcraft.vn', password: 'Artisan@123' };

test.before(() => {
  initializeDatabase();
  seedDatabase();
  app = require('../app');
});

test.after(() => {
  adapter.close();
  fs.rmSync(dbDir, { recursive: true, force: true });
});

function csrfFrom(response) {
  assert.equal(response.status, 200);
  const token = /name="_csrf" value="([a-f0-9]{64})"/.exec(response.text)?.[1];
  assert.ok(token, 'Form phải có token CSRF');
  return token;
}

function sessionCookieFrom(response) {
  const cookie = response.headers['set-cookie']?.find((value) => value.startsWith('vcraft.sid='));
  assert.ok(cookie, 'Phản hồi phải có cookie vcraft.sid');
  return cookie.split(';', 1)[0];
}

function assertCsrfDenied(response) {
  assert.equal(response.status, 403);
  assert.match(response.body.error, /CSRF/);
}

test('Từ chối multipart không có token trên route ngoài danh sách tải tệp', async () => {
  const response = await request(app).post('/auth/logout')
    .set('Accept', 'application/json')
    .field('ignored', 'value');
  assertCsrfDenied(response);
});

test('Upload sản phẩm nhận token từ field, không nhận token từ query', async () => {
  const agent = request.agent(app);
  const before = await agent.get('/auth/login');
  const login = await agent.post('/auth/login').send({ ...artisan, _csrf: csrfFrom(before) });
  assert.equal(login.status, 302);
  assert.equal(login.headers.location, '/artisan/dashboard');

  const token = csrfFrom(await agent.get('/artisan/products/new'));
  const validUpload = await agent.post('/artisan/products')
    .field('_csrf', token)
    .field('name', 'Thiếu danh mục');
  assert.ok([302, 400].includes(validUpload.status), `Trạng thái upload: ${validUpload.status}`);
  if (validUpload.status === 302) assert.equal(validUpload.headers.location, '/artisan/products/new');

  assertCsrfDenied(await agent.post('/artisan/products')
    .query({ _csrf: token })
    .set('Accept', 'application/json')
    .field('name', 'Không có token trong form'));
  assertCsrfDenied(await agent.post('/auth/logout')
    .query({ _csrf: token })
    .set('Accept', 'application/json')
    .type('form')
    .send({ ignored: 'value' }));
  assertCsrfDenied(await agent.delete('/artisan/products/1')
    .set('Accept', 'application/json')
    .field('ignored', 'value'));
});

test('Đăng nhập bỏ qua returnTo ngoài ứng dụng và giữ đích nội bộ của phiên', async () => {
  const agent = request.agent(app);
  const before = await agent.get('/auth/login').query({ returnTo: '//evil.com' });
  assert.doesNotMatch(before.text, /name="returnTo"/);

  const response = await agent.post('/auth/login')
    .query({ returnTo: '/\\evil.com' })
    .send({ ...buyer, _csrf: csrfFrom(before), returnTo: '//evil.com' });
  assert.equal(response.status, 302);
  assert.equal(response.headers.location, '/');

  const otherAgent = request.agent(app);
  const restricted = await otherAgent.get('/quotes?filter=mine');
  assert.equal(restricted.status, 302);
  assert.equal(restricted.headers.location, '/auth/login');
  const internal = await otherAgent.get('/auth/login');
  assert.match(internal.text, /name="returnTo" value="\/quotes\?filter=mine"/);
  const redirected = await otherAgent.post('/auth/login').send({ ...buyer, _csrf: csrfFrom(internal) });
  assert.equal(redirected.status, 302);
  assert.equal(redirected.headers.location, '/quotes?filter=mine');
});

test('Đăng nhập đổi cookie và token; đăng xuất vô hiệu hóa cookie đã cấp', async () => {
  const before = await request(app).get('/auth/login');
  const oldCookie = sessionCookieFrom(before);
  const oldToken = csrfFrom(before);
  const login = await request(app).post('/auth/login')
    .set('Cookie', oldCookie)
    .send({ ...buyer, _csrf: oldToken });
  assert.equal(login.status, 302);
  const authCookie = sessionCookieFrom(login);
  assert.notEqual(authCookie, oldCookie);

  const oldSession = await request(app).get('/quotes').set('Cookie', oldCookie);
  assert.equal(oldSession.status, 302);
  assert.equal(oldSession.headers.location, '/auth/login');

  const authenticated = await request(app).get('/quotes').set('Cookie', authCookie);
  const newToken = csrfFrom(authenticated);
  assert.notEqual(newToken, oldToken);
  assert.match(authenticated.text, /Đăng nhập thành công/);

  const logout = await request(app).post('/auth/logout')
    .set('Cookie', authCookie)
    .set('X-CSRF-Token', newToken)
    .field('ignored', 'header chứa token hợp lệ');
  assert.equal(logout.status, 302);
  assert.equal(logout.headers.location, '/');
  assert.equal(sessionCookieFrom(logout), 'vcraft.sid=');

  const replay = await request(app).get('/quotes').set('Cookie', authCookie);
  assert.equal(replay.status, 302);
  assert.equal(replay.headers.location, '/auth/login');
});

test('Đăng ký tạo phiên mới và giữ thông báo sau chuyển hướng', async () => {
  const form = await request(app).get('/auth/register');
  const oldCookie = sessionCookieFrom(form);
  const registered = await request(app).post('/auth/register').set('Cookie', oldCookie).send({
    _csrf: csrfFrom(form),
    role: 'buyer',
    fullName: 'Người mua thử nghiệm bảo mật',
    email: 'security-test@vcraft.vn',
    password: 'TestBuyer@123',
    confirmPassword: 'TestBuyer@123'
  });
  assert.equal(registered.status, 302);
  assert.equal(registered.headers.location, '/');
  const newCookie = sessionCookieFrom(registered);
  assert.notEqual(newCookie, oldCookie);
  const landing = await request(app).get('/').set('Cookie', newCookie);
  assert.notEqual(csrfFrom(landing), csrfFrom(form));
  assert.match(landing.text, /Đăng ký tài khoản người mua thành công/);
});

test('CSP giữ quy tắc nguồn script, form, base và frame', async () => {
  const response = await request(app).get('/auth/login');
  assert.equal(response.status, 200);
  const directives = response.headers['content-security-policy'].split(';');
  const scriptSrc = directives.find((directive) => directive.startsWith('script-src '));
  assert.ok(scriptSrc);
  assert.doesNotMatch(scriptSrc, /'unsafe-inline'/);
  assert.ok(directives.includes("base-uri 'self'"));
  assert.ok(directives.includes("form-action 'self'"));
  assert.ok(directives.includes("frame-ancestors 'none'"));
});

test('Chi tiết tin giữ định dạng cho phép và loại script, sự kiện, URL có hại', async () => {
  adapter.insert('news', {
    title: 'Bài kiểm thử HTML',
    slug: 'kiem-thu-html',
    excerpt: 'Lọc HTML trước khi hiển thị.',
    body: '<script>alert(1)</script><p>ok</p><a href="/news">Bản tin</a>'
      + '<a href="javascript:alert(2)">Liên kết lỗi</a><img src="/images/test.webp" onerror="alert(3)">',
    is_published: 1
  });
  const response = await request(app).get('/news/kiem-thu-html');
  assert.equal(response.status, 200);
  assert.match(response.text, /<p>ok<\/p>/);
  assert.match(response.text, /<a href="\/news" rel="noopener noreferrer">Bản tin<\/a>/);
  assert.doesNotMatch(response.text, /<script>alert|alert\([123]\)|javascript:|onerror=/);
});

test('Production đòi secret riêng đủ dài và không hiện tài khoản mẫu', async () => {
  const { NODE_ENV, SESSION_SECRET } = process.env;
  try {
    process.env.NODE_ENV = 'production';
    delete process.env.SESSION_SECRET;
    assert.throws(createSession, /SESSION_SECRET.*32/);
    process.env.SESSION_SECRET = 'short';
    assert.throws(createSession, /SESSION_SECRET.*32/);
    process.env.SESSION_SECRET = SESSION_SECRET;
    assert.doesNotThrow(createSession);
    const response = await request(app).get('/auth/login');
    assert.equal(response.status, 200);
    assert.doesNotMatch(response.text, /demo-login-helper|demo-accounts-box|Admin@123/);
  } finally {
    process.env.NODE_ENV = NODE_ENV;
    process.env.SESSION_SECRET = SESSION_SECRET;
  }
});

test('Kho phiên gia hạn mà không ghi đè dữ liệu, bỏ phiên hết hạn và JSON hỏng', async () => {
  const store = new SqliteSessionStore(adapter);
  const get = promisify(store.get).bind(store);
  const set = promisify(store.set).bind(store);
  const touch = promisify(store.touch).bind(store);
  const initial = { cookie: { maxAge: 60_000 }, user: { id: 1 } };
  await set('session-test', initial);
  assert.deepEqual(await get('session-test'), initial);

  const expires = new Date(Date.now() + 120_000);
  await touch('session-test', { cookie: { expires } });
  const row = adapter.get('SELECT expires_at FROM sessions WHERE sid = ?', ['session-test']);
  assert.equal(row.expires_at, expires.getTime());
  assert.deepEqual(await get('session-test'), initial);

  await set('session-test-expired', { cookie: { expires: new Date(0) } });
  assert.equal(await get('session-test-expired'), null);
  await set('session-test-default', { cookie: {}, user: { id: 1 } });
  assert.equal(adapter.get('SELECT sid FROM sessions WHERE sid = ?', ['session-test-expired']), undefined);
  const defaultSession = adapter.get('SELECT expires_at FROM sessions WHERE sid = ?', ['session-test-default']);
  assert.ok(defaultSession.expires_at > Date.now() + 6 * 24 * 60 * 60 * 1000);

  // Phiên chưa đăng nhập (chỉ có CSRF token) bị giới hạn 24 giờ dù cookie sống 7 ngày.
  await set('session-test-anonymous', { cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 }, csrfToken: 'x' });
  const anonymous = adapter.get('SELECT expires_at FROM sessions WHERE sid = ?', ['session-test-anonymous']);
  assert.ok(anonymous.expires_at <= Date.now() + SqliteSessionStore.ANONYMOUS_TTL_MS);

  adapter.insert('sessions', { sid: 'session-test-invalid', sess: '{', expires_at: expires.getTime() });
  assert.equal(await get('session-test-invalid'), null);
  assert.equal(adapter.get('SELECT sid FROM sessions WHERE sid = ?', ['session-test-invalid']), undefined);
});
