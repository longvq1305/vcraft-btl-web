# vCraft - Tinh Hoa Thủ Công & Làng Nghề Truyền Thống Việt Nam

vCraft là nền tảng thương mại di sản và kết nối trực tiếp giữa người yêu thủ công mỹ nghệ với các nghệ nhân tại các làng nghề truyền thống Việt Nam. Hệ thống cung cấp giải pháp minh bạch nguồn gốc sản phẩm thông qua nhật ký quy trình chế tác, định danh mã QR độc bản, bản đồ tương tác làng nghề và cơ chế đặt chế tác theo yêu cầu với quy trình đấu thầu báo giá minh bạch.

---

## 1. Kiến Trúc & Công Nghệ

- **Runtime:** Node.js 22 (CommonJS)
- **Web Framework:** Express 4.x
- **View Engine:** EJS (Server-side rendering với layout partials dùng chung)
- **Cơ sở dữ liệu:** SQLite thông qua thư viện `better-sqlite3` (Bật `WAL mode` và `PRAGMA foreign_keys = ON`)
- **Bản đồ số:** Leaflet.js + OpenStreetMap (Tọa độ thực các làng nghề tiêu biểu)
- **Xử lý hình ảnh:** Multer (Memory Storage) + Sharp (Tối ưu hóa, khử EXIF, chuyển đổi định dạng WebP)
- **Mã định danh:** QRCode (Sinh mã QR trỏ tới trang hành trình nguồn gốc tác phẩm)
- **Bảo mật:**
  - Hashing mật khẩu bằng `bcryptjs`
  - Quản lý phiên làm việc với `express-session` (cookie `httpOnly`, `sameSite: lax`)
  - Phòng chống tấn công CSRF với token ngẫu nhiên và kiểm tra `crypto.timingSafeEqual`
  - Thiết lập tiêu đề bảo mật với `helmet` (CSP cấu hình mở cho CDN Leaflet, OSM Tiles, Unsplash)
  - Giới hạn tần suất yêu cầu đăng nhập/đăng ký với `express-rate-limit`

### Cơ Chế Giao Diện Sáng/Tối & Hướng Dẫn Bảo Trì (Theme System & Maintenance)

- **Tự động theo trình duyệt:** `public/js/theme.js` đọc `prefers-color-scheme: dark` để chọn bảng màu sáng hoặc tối. Không có nút chuyển chế độ trên web, không đọc/ghi `localStorage` và không áp dụng lựa chọn thủ công cũ.
- **Hai hệ màu độc lập:** Theme sáng dùng giấy ngà, đỏ trầm và vàng cổ; theme tối dùng xanh than, xanh ngọc và chàm. Mỗi theme có màu riêng cho chữ, liên kết, nút, hero, chân trang, thẻ, biểu mẫu, viền, focus và các nhãn trạng thái, không chỉ đổi nền trang. Theme tối không dùng họa tiết giấy.
- **Cập nhật tức thì:** Khi tùy chọn sáng/tối do trình duyệt cung cấp thay đổi, giao diện tự cập nhật mà không cần tải lại trang.
- **Khởi tạo trước khi vẽ:** Script được nạp đồng bộ trong `src/views/partials/head.ejs`, trước CSS, và đặt `data-theme="light"` hoặc `data-theme="dark"` trên `<html>`. Trình duyệt không hỗ trợ `matchMedia` dùng bảng màu sáng.
- **Bảo trì bảng màu:** Các cặp màu nền/chữ nằm trong `public/css/styles.css`, tại `:root` (sáng) và `html[data-theme="dark"]` (tối). Khi bổ sung màu, cập nhật đồng bộ màu nền và màu chữ để giữ độ tương phản.
- **Dấu bản đồ:** SVG trong `public/js/map.js` dùng các biến `--map-pin-*`, nên đổi màu ngay cùng theme mà không tạo lại marker. Ảnh tác phẩm, mã QR và nội dung bản đồ giữ màu gốc; không đảo màu ảnh để giả lập theme tối.

---

## 2. Cấu Trúc Thư Mục Dự Án

```
vcraft/
├── app.js                      # Cấu hình Express app, middleware chung và gắn các router
├── server.js                   # Khởi tạo DB, nạp seed và lắng nghe cổng HTTP
├── package.json                # Khai báo dependencies và scripts thực thi
├── .env.example                # Mẫu cấu hình biến môi trường
├── .gitignore                  # Bỏ qua node_modules, database và file tải lên
├── data/                       # Thư mục lưu trữ database SQLite
│   └── .gitkeep
├── public/                     # Tài nguyên tĩnh công khai
│   ├── css/
│   │   └── styles.css          # Toàn bộ hệ thống giao diện và biến màu di sản
│   ├── js/
│   │   ├── main.js             # Điều hướng di động, cảnh báo và thư viện ảnh
│   │   ├── map.js              # Khởi tạo bản đồ Leaflet tương tác
│   │   └── theme.js            # Tự nhận chế độ sáng/tối trình duyệt trước khi nạp CSS
│   └── uploads/                # Thư mục lưu trữ ảnh đã nén WebP
│       └── .gitkeep
└── src/
    ├── config/
    │   └── database.js         # Khởi tạo SQLite schema, chỉ mục và nạp dữ liệu mẫu
    ├── middleware/
    │   ├── auth.js             # Kiểm tra đăng nhập, phân quyền Role và trạng thái Nghệ nhân
    │   ├── csrf.js             # Tạo và xác thực CSRF token bảo mật
    │   ├── error.js            # Xử lý 404 và bộ xử lý lỗi trung tâm
    │   ├── locals.js           # Truyền currentUser, flash, formatters vào view EJS
    │   └── rateLimiter.js      # Giới hạn tần suất request cho auth
    ├── models/
    │   ├── User.js             # Quản lý người dùng và trạng thái xét duyệt
    │   ├── Artisan.js          # Hồ sơ xưởng, định vị tọa độ, thông tin nghệ nhân
    │   ├── Product.js          # Sản phẩm, ảnh gallery và các bước chế tác
    │   ├── Quote.js            # Yêu cầu báo giá và mục tiêu xưởng
    │   ├── Bid.js              # Báo giá từ nghệ nhân
    │   └── News.js             # Bản tin văn hóa làng nghề
    ├── controllers/
    │   ├── authController.js   # Đăng nhập, đăng ký buyer/artisan, đăng xuất
    │   ├── adminController.js  # Bàn làm việc quản trị, duyệt nghệ nhân, quản lý tin
    │   ├── newsController.js   # Đọc bản tin công khai
    │   ├── publicController.js # Trang chủ, danh mục sản phẩm, chi tiết xưởng, bản đồ
    │   ├── artisanController.js# Bàn làm việc nghệ nhân, cập nhật hồ sơ, quản lý sản phẩm
    │   ├── productController.js# Chi tiết sản phẩm, câu chuyện chế tác, ảnh QR
    │   └── quoteController.js  # Vận hành chu trình báo giá và chốt thầu
    ├── routes/
    │   ├── authRoutes.js       # Gắn tại /auth
    │   ├── adminRoutes.js      # Gắn tại /admin
    │   ├── newsRoutes.js       # Gắn tại /news
    │   ├── publicRoutes.js     # Gắn tại /
    │   ├── artisanRoutes.js    # Gắn tại /artisan
    │   ├── productRoutes.js    # Gắn tại /products
    │   └── quoteRoutes.js      # Gắn tại /quotes
    ├── services/
    │   ├── imageService.js     # Multer & Sharp upload, nén WebP, xóa ảnh rác
    │   └── quoteService.js     # State machine giao dịch với SQLite Immediate Transaction
    ├── utils/
    │   └── formatters.js       # Định dạng tiền tệ VND, ngày tháng và nhãn trạng thái
    └── views/                  # Giao diện EJS
        ├── partials/           # head, header, flash, footer
        ├── auth/               # login, register
        ├── admin/              # dashboard, artisan-new, news-list, news-form
        ├── news/               # index, detail
        ├── catalog/            # index
        ├── workshops/          # index, show
        ├── products/           # show, story
        ├── artisan/            # dashboard, profile, products/new, products/edit
        ├── quotes/             # index, new, show
        ├── errors/             # 400, 403, 404, 409, 500
        ├── home.ejs
        └── map.ejs
```

---

## 3. Cài Đặt & Khởi Chạy

### Yêu Cầu Tiên Quyết
- Node.js phiên bản `>= 22.0.0`
- Trình quản lý gói `npm` phiên bản `>= 10.0.0`

### Hướng Dẫn Thực Hiện

1. **Sao chép biến môi trường:**
   ```bash
   cp .env.example .env
   ```

2. **Cài đặt các gói phụ thuộc:**
   ```bash
   npm install
   ```

3. **Khởi chạy ứng dụng:**
   ```bash
   npm start
   # hoặc
   npm run dev
   ```
   Ứng dụng sẽ tự động khởi tạo database SQLite tại `data/vcraft.db` và nạp sẵn toàn bộ dữ liệu mẫu khởi đầu (idempotent).
   Truy cập giao diện tại: `http://localhost:3000`

4. **Chạy kiểm thử chức năng (Automated Behavioral Tests):**
   ```bash
   npm test
   ```

---

## 4. Biến Môi Trường (.env)

| Biến | Giá trị mặc định | Giải thích |
|---|---|---|
| `PORT` | `3000` | Cổng HTTP lắng nghe của ứng dụng |
| `NODE_ENV` | `development` | Môi trường (`development` hoặc `production`) |
| `SESSION_SECRET` | `vcraft-session-secret...` | Chuỗi bí mật ký cookie phiên làm việc (tối thiểu 32 ký tự) |
| `DB_FILE` | `data/vcraft.db` | Đường dẫn file cơ sở dữ liệu SQLite |

---

## 5. Tài Khoản Thử Nghiệm Sẵn Có (Seed Demo Accounts)

Hệ thống đã nạp sẵn 4 tài khoản chuẩn đại diện cho đầy đủ các vai trò:

| Vai trò | Email đăng nhập | Mật khẩu | Thông tin đại diện |
|---|---|---|---|
| **Quản trị viên (Admin)** | `admin@vcraft.vn` | `Admin@123` | Quản trị viên hệ thống vCraft |
| **Khách mua hàng (Buyer)** | `buyer@vcraft.vn` | `Buyer@123` | Nguyễn Văn An (Khách hàng đặt chế tác) |
| **Nghệ nhân Gốm (Artisan)** | `gom.battrang@vcraft.vn` | `Artisan@123` | Nghệ nhân Trần Văn Độ - Xưởng Gốm Tinh Hoa Bát Tràng |
| **Nghệ nhân Lụa (Artisan)** | `lua.vanphuc@vcraft.vn` | `Artisan@123` | Nghệ nhân Triệu Thị Mão - Lụa Tơ Tằm Cổ Truyền Vạn Phúc |
| **Nghệ nhân Chờ duyệt (Pending)** | `maytre.phuvinh@vcraft.vn` | `Artisan@123` | Nghệ nhân Nguyễn Văn Tĩnh - Mây Tre Đan Phú Vinh |

*Ghi chú: Tại trang đăng nhập (`/auth/login`), có sẵn thanh công cụ nhấp nhanh để tự động điền tài khoản thử nghiệm.*

---

## 6. Phân Quyền Người Dùng & Vai Trò

1. **Khách vãng lai (Guest):**
   - Xem trang chủ, duyệt danh mục sản phẩm theo phân loại và xưởng.
   - Xem bản đồ tương tác định vị các làng nghề và xưởng thủ công.
   - Xem chi tiết tác phẩm, dòng thời gian chế tác minh bạch và mã QR.
   - Đọc các bài viết văn hóa di sản tại chuyên mục Bản tin.
   - Đăng ký tài khoản người mua hoặc nộp hồ sơ nghệ nhân.

2. **Người mua hàng (Buyer):**
   - Đăng ký tài khoản kích hoạt ngay lập tức (`status: approved`).
   - Tạo yêu cầu đặt làm sản phẩm thủ công mới theo nhóm ngành nghề (`/quotes/new`).
   - Theo dõi danh sách yêu cầu báo giá của bản thân (`/quotes`).
   - Xem các báo giá chi tiết gửi về từ các xưởng được nhắm chọn.
   - Thực hiện thao tác **Chốt báo giá (Accept Bid)** duy nhất một lần với kiểm soát phiên bản (Optimistic Locking).

3. **Nghệ nhân thủ công (Artisan):**
   - Đăng ký tài khoản mới: mặc định ở trạng thái **Chờ xét duyệt (`status: pending`)**. Hồ sơ được bảo vệ, bị chặn các thao tác đăng bán sản phẩm và gửi báo giá cho đến khi Quản trị viên phê duyệt.
   - Khi được phê duyệt (`status: approved`):
     - Quản lý hồ sơ xưởng, cập nhật giờ đón khách, tọa độ bản đồ, ảnh đại diện, ảnh xưởng (`/artisan/profile`).
     - Đăng tác phẩm mới với nhiều hình ảnh tải lên cùng lúc (`/artisan/products/new`).
     - Thêm các mốc dòng thời gian quy trình chế tác (`production_steps`) kèm hình ảnh thực tế.
     - Nhận thông báo yêu cầu báo giá thuộc ngành nghề của xưởng và gửi đề xuất giá/thời gian hoàn thành (`/quotes/:id`).
     - Cập nhật tiến độ: Chuyển trạng thái đơn hàng sang **Đang chế tác (`in_production`)** và **Đã hoàn thành bàn giao (`delivered`)**.

4. **Quản trị viên (Admin):**
   - Truy cập bảng điều khiển vận hành tổng thể (`/admin`): xem tổng số người dùng, nghệ nhân, sản phẩm, yêu cầu đặt hàng và bản tin.
   - Xem danh sách nghệ nhân chờ duyệt và nhấp **Phê duyệt (`approve`)** hoặc **Tạm ngưng (`suspend`)**.
   - Trực tiếp tạo mới tài khoản nghệ nhân đã được phê duyệt sẵn (`/admin/artisans/new`).
   - Quản trị toàn bộ Bản tin làng nghề: Soạn bài mới, cập nhật nội dung, bật/tắt trạng thái xuất bản, xóa bài viết (`/admin/news`).

---

## 7. Chu Trình Đặt Chế Tác & Máy Trạng Thái (Quotation State Machine)

Chu trình báo giá tuân thủ nghiêm ngặt 6 trạng thái bất biến tuần tự:

```
[Draft] (Bản nháp của Buyer)
   │
   ▼ POST /quotes/:id/send
[Sent] (Đã gửi tới các xưởng phù hợp theo danh mục)
   │
   ▼ POST /quotes/:id/bids (Nghệ nhân gửi báo giá đầu tiên)
[Bidding] (Đang trong quá trình nhận & so sánh các báo giá)
   │
   ▼ POST /quotes/:id/accept (Buyer chốt thầu với 1 nghệ nhân duy nhất)
[Accepted] (Báo giá được chọn chuyển sang accepted, các báo giá khác bị rejected)
   │
   ▼ POST /quotes/:id/start (Nghệ nhân được chọn xác nhận bắt đầu làm)
[In Production] (Xưởng đang chế tác tác phẩm)
   │
   ▼ POST /quotes/:id/deliver (Nghệ nhân xác nhận bàn giao hoàn tất)
[Delivered] (Hoàn tất chu trình)
```

### Nguyên Tắc Bất Biến & Chống Xung Đột Concurrency:
- **Nguyên tử hóa giao dịch (Immediate Transactions):** Toàn bộ các bước chuyển trạng thái, ghi nhận báo giá và chốt thầu được bọc trong giao dịch `db.transaction(...).immediate()` của SQLite.
- **Khóa lạc quan (Optimistic Version Locking):** Mỗi yêu cầu báo giá sở hữu một trường `version INTEGER DEFAULT 0`. Khi Buyer gửi lệnh chốt thầu, form gửi kèm phiên bản hiện tại. Câu lệnh cập nhật kiểm tra `WHERE id = ? AND version = ? AND status IN ('sent', 'bidding')`. Nếu xảy ra việc ấn đúp hoặc hai phiên làm việc cùng chấp thuận, yêu cầu thứ hai sẽ nhận mã lỗi `409 Conflict` và giữ nguyên nghệ nhân chiến thắng ban đầu mà không bị ghi đè.
- **Kiểm soát quyền truy cập chặt chẽ:** Chỉ chủ sở hữu Buyer mới có quyền gửi yêu cầu hoặc chốt thầu. Chỉ các nghệ nhân được nhắm chọn (`quote_targets`) mới có thể gửi báo giá. Chỉ nghệ nhân có báo giá được chấp thuận mới có thể chuyển trạng thái sang `in_production` và `delivered`.

---

## 8. Xử Lý & Lưu Trữ Hình Ảnh Tải Lên

- Thư mục lưu trữ: `public/uploads/`
- Tệp tin được cấp mã định danh ngẫu nhiên `uuid/randomBytes` chống trùng lặp tên.
- Quy trình xử lý với `Sharp`:
  - Tự động xoay ảnh theo chiều đúng bằng cách đọc EXIF (`.rotate()`).
  - Xóa bỏ siêu dữ liệu thừa để bảo mật thông tin thiết bị (`strip metadata`).
  - Giới hạn kích thước tối đa trong khung `1600x1200` mà không phóng đại ảnh gốc (`withoutEnlargement: true`).
  - Nén và chuyển đổi sang định dạng hiện đại `.webp` với chất lượng xấp xỉ `82%`.
- Xóa tệp tải lên nếu quá trình thẩm định dữ liệu hoặc ghi cơ sở dữ liệu gặp lỗi, tránh để lại tệp rác trên đĩa.
- Views hỗ trợ hiển thị linh hoạt cả ảnh mẫu từ URL tuyệt đối (Unsplash CDN) và ảnh tải lên cục bộ (`/uploads/...`).

---

## 9. Định Danh Mã QR & Dòng Thời Gian Chế Tác

- Mỗi tác phẩm sở hữu một đường dẫn câu chuyện xuất xứ độc bản tại `/products/:slug/story`.
- Điểm cuối `/products/:slug/qr.png` tạo ảnh PNG mã QR động mã hóa URL tuyệt đối của trang câu chuyện xuất xứ (xác định dựa trên giao thức và host hiện tại của request).
- Khách hàng khi quét mã QR sẽ xem được toàn bộ hành trình chế tác với từng mốc thời gian, mô tả kỹ thuật và hình ảnh bằng chứng chân thực do chính nghệ nhân ghi lại.

---

## 10. Bản Quyền & Giấy Phép

Dự án được xây dựng phục vụ tôn vinh và bảo tồn giá trị văn hóa làng nghề truyền thống Việt Nam.
&copy; 2026 vCraft. Bản quyền thuộc về nền tảng vCraft.

---

## 11. Nguồn Hình Ảnh & Bản Quyền Tư Liệu (Image Attribution)

Toàn bộ tư liệu hình ảnh di sản được lưu trữ cục bộ dưới định dạng WebP tại `public/images/heritage/`, đã được khử siêu dữ liệu (metadata), chuẩn hóa kích thước không phóng đại (tối đa 2000px cạnh dài, họa nền giấy điệp 1600px) và tối ưu hóa nén chất lượng (WebP 72-82%) phục vụ hiệu năng và trải nghiệm di sản:

1. **Tư liệu trích xuất từ bài thuyết trình di sản (*Làng Nghề Việt Nam Bài Thuyết Trình.pptx*):**
   - 18 hình ảnh gốc (`image1.jpeg` đến `image18.jpeg`) được chuẩn hóa và ánh xạ ngữ nghĩa vào các tệp WebP chuyên biệt:
     - `incense-field.webp` (Cánh đồng tăm hương Quảng Phú Cầu)
     - `paper-texture.webp` (Vân giấy dó thủ công truyền thống)
     - `incense-workshop.webp` (Xưởng nhuộm chân hương truyền thống)
     - `bamboo-craftsman.webp` (Nghệ nhân đan tre nứa)
     - `lacquerware.webp` (Tác phẩm sơn mài mỹ nghệ)
     - `rattan-display.webp` (Trưng bày tác phẩm mây tre đan mỹ nghệ)
     - `incense-craft.webp` (Bó hương bài xếp nan quạt)
     - `bamboo-weaving.webp` (Quy trình đan nan tre thủ công)
     - `pottery-hands.webp` (Đôi bàn tay nghệ nhân vuốt gốm trên bàn xoay)
     - `silk-yarn.webp` (Sợi tơ tằm óng ả phơi nắng)
     - `basket-artisan.webp` (Nghệ nhân đan giỏ tre truyền thống)
     - `pottery-kiln.webp` (Lò nung gốm cổ truyền)
     - `vintage-pottery.webp` (Gốm mộc cổ điển)
     - `textile-shop.webp` (Không gian trưng bày vải thổ cẩm và lụa tơ tằm)
     - `loom-detail.webp` (Chi tiết con thoi và khung dệt gỗ)
     - `rattan-master.webp` (Nghệ nhân đan mây tre bậc thầy)
     - `rattan-wall.webp` (Vách nan tre mỹ thuật)
     - `loom-artisan.webp` (Nghệ nhân dệt lụa bên khung cửi cổ truyền)

2. **Tư liệu có bản quyền mở Creative Commons (Wikimedia Commons):**
   - **Gốm Thổ Hà (`tho-ha-pottery.webp`):** Tác giả **Bùi Thế Tâm**, giấy phép [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/), nguồn gốc: [Wikimedia Commons - ThoHa_Gom1.JPG](https://commons.wikimedia.org/wiki/File:ThoHa_Gom1.JPG). Ghi chú sửa đổi/cải biến (Modification note): Hình ảnh gốc được chuẩn hóa kích thước (2000x1500px, không phóng đại), khử siêu dữ liệu EXIF và chuyển đổi/nén sang định dạng WebP chất lượng cao phục vụ hiển thị web di sản.
   - **Dệt chiếu cói Làng Hới (`hoi-mat-weaving.webp`):** Tác giả **VinhNguyen.1257**, giấy phép [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/), nguồn gốc: [Wikimedia Commons - Hoi village's sedge weaving mat in temple of Trần dynasty (Trang An, Ninh Binh).jpg](https://commons.wikimedia.org/wiki/File:Hoi_village%27s_sedge_weaving_mat_in_temple_of_Tr%E1%BA%A7n_dynasty_(Trang_An,_Ninh_Binh).jpg). Ghi chú sửa đổi/cải biến (Modification note): Hình ảnh gốc được chuẩn hóa kích thước (1443x1925px, không phóng đại), khử siêu dữ liệu EXIF và chuyển đổi/nén sang định dạng WebP chất lượng cao phục vụ hiển thị web di sản.
   - **Mây tre đan Phú Vinh (`phu-vinh-rattan.webp`):** Tác giả **Rin Mamori**, giấy phép [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/), nguồn gốc: [Wikimedia Commons - Bamboo and rattan village Phu Vinh,Chuong My,Ha Noi,Viet Nam.jpg](https://commons.wikimedia.org/wiki/File:Bamboo_and_rattan_village_Phu_Vinh,Chuong_My,Ha_Noi,Viet_Nam.jpg). Ghi chú sửa đổi/cải biến (Modification note): Hình ảnh gốc được chuẩn hóa kích thước (1200x865px, không phóng đại), khử siêu dữ liệu EXIF và chuyển đổi/nén sang định dạng WebP chất lượng cao phục vụ hiển thị web di sản.
