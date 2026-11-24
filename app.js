require('dotenv').config();
const path = require('path');
const express = require('express');
const compression = require('compression');
const { createHelmet } = require('./src/config/helmet');
const { createSession } = require('./src/config/session');

// Middleware
const methodOverride = require('./src/middleware/methodOverride');
const urlRewrite = require('./src/middleware/urlRewrite');
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
const orderRoutes = require('./src/routes/orderRoutes');

const app = express();
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

// View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'src/views'));

// Core middleware
app.use(compression());

app.use(createHelmet());

app.use(express.static(path.join(__dirname, 'public')));
// Chuẩn hóa URL (301) trước session để redirect không tạo phiên hay tiêu flash.
app.use(urlRewrite);
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.json({ limit: '10mb' }));
app.use(methodOverride);

app.use(createSession());

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
app.use('/orders', orderRoutes);
app.use('/', publicRoutes);

// Error Handling
app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
