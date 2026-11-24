const sanitize = require('sanitize-html');

const articleOptions = {
  allowedTags: ['p', 'h2', 'h3', 'h4', 'strong', 'em', 'ul', 'ol', 'li', 'blockquote', 'a', 'img', 'br', 'figure', 'figcaption'],
  allowedAttributes: {
    a: ['href', 'title', 'rel'],
    img: ['src', 'alt']
  },
  allowedSchemes: ['http', 'https', 'mailto'],
  allowedSchemesByTag: { img: ['http', 'https'] },
  allowProtocolRelative: false,
  transformTags: {
    a: sanitize.simpleTransform('a', { rel: 'noopener noreferrer' })
  }
};

/**
 * Lọc HTML bài viết trước khi render, chỉ giữ định dạng và URL được phép.
 * @param {string} body Nội dung HTML lưu trong cơ sở dữ liệu.
 * @returns {string} HTML đã lọc.
 */
function sanitizeHtml(body) {
  return sanitize(body, articleOptions);
}

module.exports = sanitizeHtml;
