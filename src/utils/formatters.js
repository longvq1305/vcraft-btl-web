function formatCurrency(amount) {
  if (amount === null || amount === undefined || isNaN(amount)) {
    return '0 ₫';
  }
  const num = Number(amount);
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND'
  }).format(num);
}

function formatDate(dateInput, includeTime = false) {
  if (!dateInput) return '';
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return String(dateInput);

  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();

  if (!includeTime) {
    return `${day}/${month}/${year}`;
  }

  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes} ${day}/${month}/${year}`;
}

function getStatusBadge(status) {
  const map = {
    // User status
    pending: { label: 'Chờ duyệt', className: 'badge-pending' },
    approved: { label: 'Đã duyệt', className: 'badge-approved' },
    suspended: { label: 'Tạm ngưng', className: 'badge-suspended' },

    // Product status
    draft: { label: 'Bản nháp', className: 'badge-draft' },
    published: { label: 'Đã xuất bản', className: 'badge-published' },

    // Quote status
    sent: { label: 'Đã gửi tới xưởng', className: 'badge-sent' },
    bidding: { label: 'Đang nhận báo giá', className: 'badge-bidding' },
    accepted: { label: 'Đã chốt báo giá', className: 'badge-accepted' },
    in_production: { label: 'Đang chế tác', className: 'badge-production' },
    delivered: { label: 'Đã giao hàng', className: 'badge-delivered' },

    // Bid status
    submitted: { label: 'Đã gửi giá', className: 'badge-submitted' },
    rejected: { label: 'Không được chọn', className: 'badge-rejected' }
  };

  return map[status] || { label: status, className: 'badge-default' };
}

module.exports = {
  formatCurrency,
  formatDate,
  getStatusBadge
};
