require('dotenv').config();
const path = require('path');
const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const compression = require('compression');

// Middleware
const localsMiddleware = require('./src/middleware/locals');
const { attachUser } = require('./src/middleware/auth');
const { csrfProtection } = require('./src/middleware/csrf');
const { notFoundHandler, errorHandler } = require('./src/middleware/error');

// Routes
const authRoutes = require('./src/routes/authRoutes');
const adminRoutes = require('./src/routes/adminRoutes');
const newsRoutes = require('./src/routes/newsRoutes');
const publicRoutes = require('./src/routes/publicRoutes');
const artisanRoutes = require('./src/routes/artisanRoutes');
const productRoutes = require('./src/routes/productRoutes');
const quoteRoutes = require('./src/routes/quoteRoutes');

const app = express();

// View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'src/views'));

// Core middleware
app.use(compression());

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://unpkg.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://unpkg.com", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: [
        "'self'",
        "data:",
        "blob:",
        "https://images.unsplash.com",
        "https://*.tile.openstreetmap.org",
        "https://*.openstreetmap.org",
        "https://*.tile.openstreetmap.fr",
        "https://*.openstreetmap.fr",
        "https://*.tile.openstreetmap.de",
        "https://*.basemaps.cartocdn.com",
        "https://unpkg.com"
      ],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: process.env.NODE_ENV === 'production' ? [] : null
    }
  },
  crossOriginEmbedderPolicy: false
}));

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.json({ limit: '10mb' }));

app.use(session({
  secret: process.env.SESSION_SECRET || 'vcraft-session-secret-change-in-production-min-32-chars',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
  }
}));

// Locals, Flash and Auth state
app.use(localsMiddleware);
app.use(attachUser);

// CSRF Protection on mutating requests
app.use(csrfProtection);

// Mount Application Routes
app.use('/auth', authRoutes);
app.use('/admin', adminRoutes);
app.use('/news', newsRoutes);
app.use('/artisan', artisanRoutes);
app.use('/products', productRoutes);
app.use('/quotes', quoteRoutes);
app.use('/', publicRoutes);

// Error Handling
app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
