const BaseModel = require('./BaseModel');

/** Lưu đường dẫn cũ theo loại tài nguyên. */
class SlugRedirectModel extends BaseModel {
  static tableName = 'slug_redirects';

  /**
   * Ghi lần đổi slug và cập nhật các URL cũ để chuyển hướng trong một bước.
   * @param {'news'} entity
   * @param {string} oldSlug
   * @param {string} newSlug Slug hiện tại của tài nguyên.
   */
  record(entity, oldSlug, newSlug) {
    if (oldSlug === newSlug) return;

    this.transaction(() => {
      // Khi dùng lại slug cũ, nó đã là đích chính thức, không còn là redirect.
      this.db.delete(this.table, { entity, old_slug: newSlug });
      this.db.update(this.table, { new_slug: newSlug }, { entity, new_slug: oldSlug });
      this.db.upsert(this.table,
        { entity, old_slug: oldSlug, new_slug: newSlug },
        ['entity', 'old_slug'],
        { new_slug: this.db.excluded('new_slug') });
    }, { immediate: true });
  }

  /**
   * Tìm slug đích của đường dẫn cũ trong đúng loại tài nguyên.
   * @param {'news'} entity
   * @param {string} slug
   * @returns {string|undefined}
   */
  resolve(entity, slug) {
    return this.findOneBy({ entity, old_slug: slug })?.new_slug;
  }
}

module.exports = new SlugRedirectModel();
