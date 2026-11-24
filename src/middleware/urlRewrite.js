const aliases = new Map([
  ['/tin-tuc', '/news'],
  ['/ban-do', '/map'],
  ['/bao-gia', '/quotes']
]);
const slugAliases = new Map([
  ['san-pham', '/products'],
  ['xuong', '/workshops'],
  ['tin-tuc', '/news']
]);

/**
 * Chuyển hướng GET/HEAD tới URL chuẩn, giữ nguyên query và bỏ qua tài nguyên tĩnh.
 * @type {import('express').RequestHandler}
 */
function urlRewrite(req, res, next) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();

  const path = req.path;
  if (!path.startsWith('/') || path.startsWith('//') || path.includes('\\') ||
      /^\/(css|js|images|uploads)(?:\/|$)/i.test(path)) {
    return next();
  }

  // Giữ nguyên các octet đã mã hóa và không đụng vào chuỗi query.
  const normalized = path.replace(/\/+$/, '').replace(/%[\da-f]{2}|[A-Z]/gi, (part) =>
    part.length === 1 ? part.toLowerCase() : part) || '/';
  const match = normalized.match(/^\/([^/]+)\/([^/]+)$/);
  const prefix = match && slugAliases.get(match[1]);
  const target = aliases.get(normalized) || (prefix ? `${prefix}/${match[2]}` : normalized);
  if (target === path) return next();

  const query = req.originalUrl.indexOf('?');
  return res.redirect(301, target + (query < 0 ? '' : req.originalUrl.slice(query)));
}

module.exports = urlRewrite;
