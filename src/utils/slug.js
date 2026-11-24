const slugify = require('slugify');

/**
 * Chuyển chuỗi tiếng Việt thành slug ASCII viết thường ("Gốm Bát Tràng" → "gom-bat-trang").
 * @param {string} text
 * @returns {string} Chuỗi rỗng nếu không còn ký tự hợp lệ.
 */
function toSlug(text) {
  return slugify(String(text || ''), { lower: true, strict: true, locale: 'vi' });
}

/**
 * Sinh slug chưa bị dùng: thêm hậu tố -2, -3, ... khi trùng.
 * @param {string} text Nguồn tạo slug (tên, tiêu đề).
 * @param {(slug: string) => boolean} isTaken Trả về true nếu slug đã tồn tại.
 * @param {string} fallback Slug gốc khi `text` không sinh được ký tự nào.
 * @returns {string}
 */
function uniqueSlug(text, isTaken, fallback) {
  const base = toSlug(text) || fallback;
  let slug = base;
  let counter = 2;
  while (isTaken(slug)) {
    slug = `${base}-${counter}`;
    counter += 1;
  }
  return slug;
}

module.exports = {
  toSlug,
  uniqueSlug
};
