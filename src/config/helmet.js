const helmet = require('helmet');

/**
 * Middleware tiêu đề bảo mật HTTP (CSP, HSTS, ...).
 * @returns {import('express').RequestHandler}
 */
function createHelmet() {
  return helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", 'https://unpkg.com'],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://unpkg.com', 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        imgSrc: [
          "'self'",
          'data:',
          'blob:',
          'https://images.unsplash.com',
          'https://*.tile.openstreetmap.org',
          'https://*.openstreetmap.org',
          'https://*.tile.openstreetmap.fr',
          'https://*.openstreetmap.fr',
          'https://*.tile.openstreetmap.de',
          'https://*.basemaps.cartocdn.com',
          'https://unpkg.com'
        ],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        upgradeInsecureRequests: process.env.NODE_ENV === 'production' ? [] : null
      }
    },
    crossOriginEmbedderPolicy: false
  });
}

module.exports = { createHelmet };
