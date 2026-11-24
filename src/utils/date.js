/** Múi giờ nghiệp vụ của ứng dụng: mọi "hôm nay" tính theo giờ Việt Nam, không theo UTC của máy chủ. */
const APP_TIME_ZONE = 'Asia/Ho_Chi_Minh';

const dateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: APP_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
});

/**
 * Ngày hiện tại theo giờ Việt Nam, dạng YYYY-MM-DD.
 * @param {Date} [now]
 * @returns {string}
 */
function todayInVietnam(now = new Date()) {
  return dateFormatter.format(now);
}

/**
 * Kiểm tra chuỗi đúng dạng YYYY-MM-DD và là ngày có thật (loại 2026-02-30).
 * Chỉ nhận dạng này nên so sánh chuỗi bằng `<` tương đương so sánh ngày.
 * @param {string} value
 * @returns {boolean}
 */
function isIsoDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

module.exports = {
  APP_TIME_ZONE,
  todayInVietnam,
  isIsoDate
};
