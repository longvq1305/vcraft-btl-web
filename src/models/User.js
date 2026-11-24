const bcrypt = require('bcryptjs');
const BaseModel = require('./BaseModel');
const { uniqueSlug } = require('../utils/slug');

const PUBLIC_COLUMNS = 'id, full_name, email, role, status, created_at';
const DEFAULT_LATITUDE = 21.0285;
const DEFAULT_LONGITUDE = 105.8542;

/**
 * Model người dùng (bảng users) và hồ sơ xưởng đi kèm khi tạo tài khoản nghệ nhân.
 */
class UserModel extends BaseModel {
  static tableName = 'users';

  /**
   * Người dùng theo id, không kèm password_hash.
   * @param {number|string} id
   * @returns {Object|undefined}
   */
  findById(id) {
    if (!id) return undefined;
    return this.db.get(`SELECT ${PUBLIC_COLUMNS} FROM users WHERE id = ?`, [id]);
  }

  /**
   * Người dùng theo email (không phân biệt hoa thường), kèm password_hash để xác thực.
   * @param {string} email
   * @returns {Object|undefined}
   */
  findByEmail(email) {
    if (!email) return undefined;
    return this.db.get('SELECT * FROM users WHERE email = ? COLLATE NOCASE', [email.trim().toLowerCase()]);
  }

  /**
   * @param {string} plainPassword
   * @param {string} passwordHash
   * @returns {boolean}
   */
  verifyPassword(plainPassword, passwordHash) {
    if (!plainPassword || !passwordHash) return false;
    return bcrypt.compareSync(plainPassword, passwordHash);
  }

  /**
   * @param {string} plainPassword
   * @returns {string}
   */
  hashPassword(plainPassword) {
    return bcrypt.hashSync(plainPassword, 10);
  }

  /**
   * Tạo tài khoản người mua (được duyệt ngay).
   * @param {{ fullName: string, email: string, password: string }} data
   * @returns {number} id người dùng mới.
   */
  createBuyer({ fullName, email, password }) {
    return this.create({
      full_name: fullName.trim(),
      email: email.trim().toLowerCase(),
      password_hash: this.hashPassword(password),
      role: 'buyer',
      status: 'approved',
      created_at: this.db.now()
    });
  }

  /**
   * Nghệ nhân tự đăng ký: tài khoản chờ duyệt, xưởng đóng cửa, tọa độ mặc định Hà Nội.
   * @param {Object} data
   * @returns {number} id người dùng mới.
   */
  createArtisanApplicant({ fullName, email, password, workshopName, address, phone, categories, story }) {
    return this.createArtisanWithProfile({
      fullName,
      email,
      password,
      status: 'pending',
      profile: {
        workshop_name: workshopName ? workshopName.trim() : `Xưởng của ${fullName.trim()}`,
        story: story ? story.trim() : 'Đang cập nhật câu chuyện làng nghề.',
        address: address ? address.trim() : 'Đang cập nhật địa chỉ.',
        latitude: DEFAULT_LATITUDE,
        longitude: DEFAULT_LONGITUDE,
        is_open: 0,
        visiting_hours: '08:00 - 17:00',
        categories: categories ? categories.trim() : 'Thủ công mỹ nghệ',
        phone: phone ? phone.trim() : null
      }
    });
  }

  /**
   * Admin tạo nghệ nhân đã được duyệt.
   * @param {Object} data
   * @returns {number} id người dùng mới.
   */
  createApprovedArtisanByAdmin({
    fullName, email, password, workshopName, address, phone, categories, story,
    latitude, longitude, isOpen, visitingHours
  }) {
    return this.createArtisanWithProfile({
      fullName,
      email,
      password,
      status: 'approved',
      profile: {
        workshop_name: workshopName.trim(),
        story: story ? story.trim() : 'Xưởng thủ công truyền thống chất lượng cao.',
        address: address.trim(),
        latitude: Number(latitude) || DEFAULT_LATITUDE,
        longitude: Number(longitude) || DEFAULT_LONGITUDE,
        is_open: isOpen ? 1 : 0,
        visiting_hours: visitingHours ? visitingHours.trim() : '08:00 - 17:30',
        categories: categories ? categories.trim() : 'Thủ công mỹ nghệ',
        phone: phone ? phone.trim() : null
      }
    });
  }

  /**
   * Tạo user nghệ nhân và hồ sơ xưởng trong cùng transaction.
   * @param {{ fullName: string, email: string, password: string, status: string, profile: Object }} data
   * @returns {number}
   */
  createArtisanWithProfile({ fullName, email, password, status, profile }) {
    const passwordHash = this.hashPassword(password);
    return this.transaction(() => {
      const userId = this.create({
        full_name: fullName.trim(),
        email: email.trim().toLowerCase(),
        password_hash: passwordHash,
        role: 'artisan',
        status,
        created_at: this.db.now()
      });

      const slug = uniqueSlug(
        profile.workshop_name || fullName,
        (s) => Boolean(this.db.get('SELECT 1 AS found FROM artisan_profiles WHERE slug = ?', [s])),
        'xuong-thu-cong'
      );

      this.db.insert('artisan_profiles', {
        user_id: userId,
        slug,
        ...profile,
        cover_image: null,
        gallery_images: '[]',
        certificate_image: null
      });

      return userId;
    });
  }

  /**
   * Đổi trạng thái tài khoản nghệ nhân.
   * Cờ mở cửa (is_open) là lựa chọn của nghệ nhân nên được giữ nguyên khi tạm ngưng/khôi phục;
   * xưởng bị tạm ngưng đã bị ẩn khỏi trang công khai vì mọi truy vấn công khai lọc status = 'approved'.
   * Riêng lần duyệt đầu (pending → approved) mở cửa xưởng, vì lúc đăng ký xưởng bị đóng do chưa được duyệt.
   * @param {number} id
   * @param {'pending'|'approved'|'suspended'} status
   * @returns {boolean} true nếu có nghệ nhân được cập nhật.
   */
  updateStatus(id, status) {
    return this.transaction(() => {
      const current = this.db.get("SELECT status FROM users WHERE id = ? AND role = 'artisan'", [id]);
      if (!current) {
        return false;
      }
      this.db.update('users', { status }, { id, role: 'artisan' });
      if (current.status === 'pending' && status === 'approved') {
        this.db.update('artisan_profiles', { is_open: 1 }, { user_id: id });
      }
      return true;
    });
  }

  /**
   * Danh sách nghệ nhân kèm thông tin xưởng.
   * @param {{ status?: string, limit?: number, offset?: number }} [options]
   * @returns {Object[]}
   */
  listArtisans({ status, limit = 50, offset = 0 } = {}) {
    const params = [];
    let sql = `
      SELECT u.id, u.full_name, u.email, u.role, u.status, u.created_at,
             ap.slug, ap.workshop_name, ap.address, ap.categories, ap.phone, ap.is_open,
             ap.cover_image
      FROM users u
      LEFT JOIN artisan_profiles ap ON u.id = ap.user_id
      WHERE u.role = 'artisan'
    `;
    if (status) {
      sql += ' AND u.status = ?';
      params.push(status);
    }
    sql += ' ORDER BY u.created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);
    return this.db.all(sql, params);
  }

  /**
   * Số tài khoản theo từng cặp (role, status).
   * @returns {Array<{ role: string, status: string, count: number }>}
   */
  countByRoleAndStatus() {
    return this.db.all('SELECT role, status, COUNT(*) AS count FROM users GROUP BY role, status');
  }

  /**
   * Chi tiết nghệ nhân kèm toàn bộ hồ sơ xưởng.
   * @param {number} id
   * @returns {Object|undefined}
   */
  getArtisanDetail(id) {
    return this.db.get(`
      SELECT u.id, u.full_name, u.email, u.role, u.status, u.created_at,
             ap.id as profile_id, ap.slug, ap.workshop_name, ap.story, ap.address,
             ap.latitude, ap.longitude, ap.is_open, ap.visiting_hours, ap.categories,
             ap.phone, ap.cover_image, ap.gallery_images, ap.certificate_image
      FROM users u
      LEFT JOIN artisan_profiles ap ON u.id = ap.user_id
      WHERE u.id = ? AND u.role = 'artisan'
    `, [id]);
  }
}

module.exports = new UserModel();
module.exports.UserModel = UserModel;
