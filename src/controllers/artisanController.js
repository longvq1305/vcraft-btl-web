const Artisan = require('../models/Artisan');
const Product = require('../models/Product');
const imageService = require('../services/imageService');

function setFlash(req, type, message) {
  if (typeof req.flash === 'function') {
    req.flash(type, message);
  } else if (req.session) {
    req.session.flash = req.session.flash || [];
    req.session.flash.push({ type, message });
  }
}

const artisanController = {
  dashboard(req, res, next) {
    try {
      const userId = req.session.user.id;
      const profile = Artisan.findByUserId(userId);
      const products = Product.findByArtisanId(userId);

      const totalProducts = products.length;
      const publishedCount = products.filter((p) => p.status === 'published').length;
      const draftCount = products.filter((p) => p.status === 'draft').length;

      res.render('artisan/dashboard', {
        title: 'Bảng điều khiển Nghệ nhân - vCraft',
        profile,
        products,
        totalProducts,
        publishedCount,
        draftCount
      });
    } catch (err) {
      next(err);
    }
  },

  profileForm(req, res, next) {
    try {
      const userId = req.session.user.id;
      const profile = Artisan.findByUserId(userId);

      res.render('artisan/profile', {
        title: 'Hồ sơ Xưởng thủ công - vCraft',
        profile
      });
    } catch (err) {
      next(err);
    }
  },

  async updateProfile(req, res, next) {
    try {
      const userId = req.session.user.id;
      const {
        workshop_name,
        story,
        address,
        latitude,
        longitude,
        visiting_hours,
        categories,
        phone,
        is_open
      } = req.body;

      if (!workshop_name || !workshop_name.trim()) {
        setFlash(req, 'error', 'Tên xưởng thủ công không được để trống.');
        return res.redirect('/artisan/profile');
      }

      const existingProfile = Artisan.findByUserId(userId);
      const profileData = {
        workshop_name: workshop_name.trim(),
        story: story ? story.trim() : '',
        address: address ? address.trim() : '',
        latitude: latitude ? parseFloat(latitude) : null,
        longitude: longitude ? parseFloat(longitude) : null,
        visiting_hours: visiting_hours ? visiting_hours.trim() : '',
        categories: categories ? categories.trim() : '',
        phone: phone ? phone.trim() : '',
        is_open: is_open === '1' || is_open === 'on' || is_open === true
      };

      // Handle cover image upload
      if (req.files && req.files['cover_image'] && req.files['cover_image'][0]) {
        profileData.cover_image = await imageService.processAndSaveImage(
          req.files['cover_image'][0].buffer
        );
      }

      // Handle certificate image upload
      if (req.files && req.files['certificate_image'] && req.files['certificate_image'][0]) {
        profileData.certificate_image = await imageService.processAndSaveImage(
          req.files['certificate_image'][0].buffer
        );
      }

      // Handle gallery images upload
      if (req.files && req.files['gallery_images'] && req.files['gallery_images'].length > 0) {
        const newGalleryPaths = await imageService.processMultipleImages(
          req.files['gallery_images'].map((f) => f.buffer)
        );

        const currentGallery = existingProfile && Array.isArray(existingProfile.gallery_images)
          ? existingProfile.gallery_images
          : [];

        // Max 8 gallery images
        profileData.gallery_images = [...currentGallery, ...newGalleryPaths].slice(0, 8);
      }

      Artisan.updateProfile(userId, profileData);

      setFlash(req, 'success', 'Hồ sơ xưởng thủ công đã được cập nhật thành công.');
      res.redirect('/artisan/profile');
    } catch (err) {
      next(err);
    }
  },

  newProductForm(req, res, next) {
    try {
      const categories = Product.findDistinctCategories();
      res.render('artisan/products/new', {
        title: 'Đăng tác phẩm mới - vCraft',
        categories
      });
    } catch (err) {
      next(err);
    }
  },

  async createProduct(req, res, next) {
    try {
      const userId = req.session.user.id;
      const { name, category, description, price, inventory, status } = req.body;

      // Validation
      if (!name || !name.trim()) {
        setFlash(req, 'error', 'Tên tác phẩm không được để trống.');
        return res.redirect('/artisan/products/new');
      }

      if (!category || !category.trim()) {
        setFlash(req, 'error', 'Danh mục tác phẩm không được để trống.');
        return res.redirect('/artisan/products/new');
      }

      if (!description || !description.trim()) {
        setFlash(req, 'error', 'Mô tả tác phẩm không được để trống.');
        return res.redirect('/artisan/products/new');
      }

      const numPrice = Number(price);
      if (isNaN(numPrice) || numPrice < 0) {
        setFlash(req, 'error', 'Giá tác phẩm phải là số không âm.');
        return res.redirect('/artisan/products/new');
      }

      const numInventory = Number(inventory);
      if (isNaN(numInventory) || numInventory < 0) {
        setFlash(req, 'error', 'Số lượng tồn kho phải là số nguyên không âm.');
        return res.redirect('/artisan/products/new');
      }

      // Hero image is required for new products
      let heroImagePath = null;
      if (req.files && req.files['hero_image'] && req.files['hero_image'][0]) {
        heroImagePath = await imageService.processAndSaveImage(
          req.files['hero_image'][0].buffer
        );
      } else {
        setFlash(req, 'error', 'Vui lòng tải lên ảnh đại diện chính (hero image) cho tác phẩm.');
        return res.redirect('/artisan/products/new');
      }

      // Optional additional gallery images (up to 8)
      let galleryPaths = [];
      if (req.files && req.files['gallery_images'] && req.files['gallery_images'].length > 0) {
        galleryPaths = await imageService.processMultipleImages(
          req.files['gallery_images'].map((f) => f.buffer)
        );
      }

      const product = Product.create(
        userId,
        {
          name: name.trim(),
          category: category.trim(),
          description: description.trim(),
          price: numPrice,
          inventory: numInventory,
          hero_image: heroImagePath,
          status: status === 'published' ? 'published' : 'draft'
        },
        galleryPaths
      );

      setFlash(req, 'success', `Tác phẩm "${product.name}" đã được tạo thành công.`);
      res.redirect(`/artisan/products/${product.id}/edit`);
    } catch (err) {
      next(err);
    }
  },

  editProductForm(req, res, next) {
    try {
      const userId = req.session.user.id;
      const productId = parseInt(req.params.id, 10);

      const product = Product.findByIdAndArtisanId(productId, userId);
      if (!product) {
        const err = new Error('Không tìm thấy tác phẩm hoặc bạn không có quyền truy cập.');
        err.status = 404;
        return next(err);
      }

      const categories = Product.findDistinctCategories();

      res.render('artisan/products/edit', {
        title: `Chỉnh sửa tác phẩm: ${product.name} - vCraft`,
        product,
        categories
      });
    } catch (err) {
      next(err);
    }
  },

  async updateProduct(req, res, next) {
    try {
      const userId = req.session.user.id;
      const productId = parseInt(req.params.id, 10);

      const product = Product.findByIdAndArtisanId(productId, userId);
      if (!product) {
        const err = new Error('Không tìm thấy tác phẩm hoặc bạn không có quyền chỉnh sửa.');
        err.status = 404;
        return next(err);
      }

      const { name, category, description, price, inventory, status } = req.body;

      if (!name || !name.trim()) {
        setFlash(req, 'error', 'Tên tác phẩm không được để trống.');
        return res.redirect(`/artisan/products/${productId}/edit`);
      }

      if (!category || !category.trim()) {
        setFlash(req, 'error', 'Danh mục tác phẩm không được để trống.');
        return res.redirect(`/artisan/products/${productId}/edit`);
      }

      if (!description || !description.trim()) {
        setFlash(req, 'error', 'Mô tả tác phẩm không được để trống.');
        return res.redirect(`/artisan/products/${productId}/edit`);
      }

      const numPrice = Number(price);
      if (isNaN(numPrice) || numPrice < 0) {
        setFlash(req, 'error', 'Giá tác phẩm phải là số không âm.');
        return res.redirect(`/artisan/products/${productId}/edit`);
      }

      const numInventory = Number(inventory);
      if (isNaN(numInventory) || numInventory < 0) {
        setFlash(req, 'error', 'Số lượng tồn kho phải là số không âm.');
        return res.redirect(`/artisan/products/${productId}/edit`);
      }

      const updateData = {
        name: name.trim(),
        category: category.trim(),
        description: description.trim(),
        price: numPrice,
        inventory: numInventory,
        status: status === 'published' ? 'published' : 'draft'
      };

      // Handle replacement hero image if uploaded
      if (req.files && req.files['hero_image'] && req.files['hero_image'][0]) {
        updateData.hero_image = await imageService.processAndSaveImage(
          req.files['hero_image'][0].buffer
        );
      }

      // Handle additional gallery images
      let newGalleryPaths = [];
      if (req.files && req.files['gallery_images'] && req.files['gallery_images'].length > 0) {
        newGalleryPaths = await imageService.processMultipleImages(
          req.files['gallery_images'].map((f) => f.buffer)
        );
      }

      Product.update(productId, userId, updateData, newGalleryPaths);

      setFlash(req, 'success', 'Thông tin tác phẩm đã được cập nhật thành công.');
      res.redirect(`/artisan/products/${productId}/edit`);
    } catch (err) {
      next(err);
    }
  },

  deleteProduct(req, res, next) {
    try {
      const userId = req.session.user.id;
      const productId = parseInt(req.params.id, 10);

      Product.delete(productId, userId);

      setFlash(req, 'success', 'Tác phẩm đã được xóa thành công.');
      res.redirect('/artisan/dashboard');
    } catch (err) {
      next(err);
    }
  },

  async addStep(req, res, next) {
    try {
      const userId = req.session.user.id;
      const productId = parseInt(req.params.id, 10);

      const product = Product.findByIdAndArtisanId(productId, userId);
      if (!product) {
        const err = new Error('Không tìm thấy tác phẩm hoặc bạn không có quyền thêm công đoạn chế tác.');
        err.status = 404;
        return next(err);
      }

      const { title, description, occurred_at } = req.body;

      if (!title || !title.trim()) {
        setFlash(req, 'error', 'Tiêu đề công đoạn chế tác không được để trống.');
        return res.redirect(`/artisan/products/${productId}/edit#timeline`);
      }

      let imagePath = null;
      if (req.file) {
        imagePath = await imageService.processAndSaveImage(req.file.buffer);
      }

      Product.addStep(productId, userId, {
        title: title.trim(),
        description: description ? description.trim() : '',
        occurred_at: occurred_at || new Date().toISOString(),
        image_path: imagePath
      });

      setFlash(req, 'success', 'Đã thêm công đoạn chế tác vào nhật ký minh bạch.');
      res.redirect(`/artisan/products/${productId}/edit#timeline`);
    } catch (err) {
      next(err);
    }
  },

  deleteStep(req, res, next) {
    try {
      const userId = req.session.user.id;
      const productId = parseInt(req.params.id, 10);
      const stepId = parseInt(req.params.stepId, 10);

      Product.deleteStep(stepId, productId, userId);

      setFlash(req, 'success', 'Đã xóa công đoạn chế tác.');
      res.redirect(`/artisan/products/${productId}/edit#timeline`);
    } catch (err) {
      next(err);
    }
  },

  deleteImage(req, res, next) {
    try {
      const userId = req.session.user.id;
      const productId = parseInt(req.params.id, 10);
      const imageId = parseInt(req.params.imageId, 10);

      Product.deleteImage(imageId, productId, userId);

      setFlash(req, 'success', 'Đã xóa hình ảnh khỏi bộ sưu tập tác phẩm.');
      res.redirect(`/artisan/products/${productId}/edit#gallery`);
    } catch (err) {
      next(err);
    }
  }
};

module.exports = artisanController;
