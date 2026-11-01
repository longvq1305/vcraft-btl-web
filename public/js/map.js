(function() {
  'use strict';

  const dataScript = document.getElementById('workshops-data');
  const mapElement = document.getElementById('village-map');

  if (!dataScript || !mapElement || typeof L === 'undefined') {
    return;
  }

  let workshops = [];
  try {
    workshops = JSON.parse(dataScript.textContent || '[]');
  } catch (err) {
    console.error('Lỗi khi đọc dữ liệu xưởng thủ công:', err);
    return;
  }

  // Vietnam / Hanoi default center
  const DEFAULT_CENTER = [21.0285, 105.8542];
  const DEFAULT_ZOOM = 11;

  // Extract valid coordinates upfront
  const bounds = [];
  workshops.forEach((ws) => {
    if (ws.latitude && ws.longitude && !isNaN(ws.latitude) && !isNaN(ws.longitude)) {
      bounds.push([parseFloat(ws.latitude), parseFloat(ws.longitude)]);
    }
  });

  // Create Leaflet map without triggering an initial viewport move
  const map = L.map('village-map', {
    scrollWheelZoom: true
  });

  // Establish final initial viewport before adding tile layer so zero requests are aborted
  if (bounds.length > 1) {
    map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
  } else if (bounds.length === 1) {
    map.setView(bounds[0], 14);
  } else {
    map.setView(DEFAULT_CENTER, DEFAULT_ZOOM);
  }

  // OpenStreetMap France tile layer
  L.tileLayer('https://{s}.tile.openstreetmap.fr/osmfr/{z}/{x}/{y}.png', {
    maxZoom: 20,
    subdomains: ['a', 'b', 'c'],
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors &copy; <a href="https://www.openstreetmap.fr" target="_blank" rel="noopener">OSM France</a>'
  }).addTo(map);
  const markersMap = new Map();

  // Custom marker pin factory
  function createMarkerIcon(isOpen) {
    const pinColor = isOpen ? '#5F0C0A' : '#6E5C5A';
    const dotColor = isOpen ? '#C59B27' : '#A3928E';
    const svgIcon = `
      <svg width="32" height="42" viewBox="0 0 32 42" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M16 0C7.16344 0 0 7.16344 0 16C0 26.5 16 42 16 42C16 42 32 26.5 32 16C32 7.16344 24.8366 0 16 0Z" fill="${pinColor}"/>
        <circle cx="16" cy="15" r="7" fill="#FAF7F2"/>
        <circle cx="16" cy="15" r="4" fill="${dotColor}"/>
      </svg>
    `;

    return L.divIcon({
      html: svgIcon,
      className: 'custom-map-pin',
      iconSize: [32, 42],
      iconAnchor: [16, 42],
      popupAnchor: [0, -38]
    });
  }

  // Build popup content
  function buildPopupContent(ws) {
    const statusText = ws.is_open ? 'Đang mở cửa đón khách' : 'Tạm đóng cửa tham quan';
    const statusClass = ws.is_open ? 'status-open' : 'status-closed';
    const imgSrc = ws.cover_image || 'https://images.unsplash.com/photo-1513519245088-0e12902e5a38?auto=format&fit=crop&w=400&q=80';

    return `
      <div class="map-popup-card">
        <div class="map-popup-media">
          <img src="${imgSrc}" alt="${ws.workshop_name}" class="map-popup-img">
          <span class="popup-status-badge ${statusClass}">${statusText}</span>
        </div>
        <div class="map-popup-body">
          <div class="map-popup-artisan">Nghệ nhân: ${ws.artisan_name || ''}</div>
          <h4 class="map-popup-title">${ws.workshop_name}</h4>
          ${ws.address ? `<p class="map-popup-address">${ws.address}</p>` : ''}
          ${ws.visiting_hours ? `<p class="map-popup-hours">Giờ mở cửa: ${ws.visiting_hours}</p>` : ''}
          <div class="map-popup-footer">
            <a href="/workshops/${ws.slug}" class="btn btn-primary btn-xs">Xem hồ sơ xưởng</a>
          </div>
        </div>
      </div>
    `;
  }

  // Add markers
  workshops.forEach((ws) => {
    if (ws.latitude && ws.longitude && !isNaN(ws.latitude) && !isNaN(ws.longitude)) {
      const lat = parseFloat(ws.latitude);
      const lng = parseFloat(ws.longitude);

      const marker = L.marker([lat, lng], {
        icon: createMarkerIcon(Boolean(ws.is_open))
      }).addTo(map);

      marker.bindPopup(buildPopupContent(ws), {
        maxWidth: 280,
        className: 'vcraft-leaflet-popup'
      });

      markersMap.set(ws.slug, marker);
      markersMap.set(String(ws.id), marker);
    }
  });


  // Sidebar item interaction
  const workshopItems = document.querySelectorAll('.map-workshop-item');
  workshopItems.forEach((item) => {
    function activate() {
      const slug = item.getAttribute('data-slug');
      const lat = parseFloat(item.getAttribute('data-lat'));
      const lng = parseFloat(item.getAttribute('data-lng'));

      if (!isNaN(lat) && !isNaN(lng)) {
        map.flyTo([lat, lng], 15, { duration: 1.2 });
        const marker = markersMap.get(slug);
        if (marker) {
          setTimeout(() => marker.openPopup(), 400);
        }
      }

      workshopItems.forEach((el) => el.classList.remove('selected'));
      item.classList.add('selected');
    }

    item.addEventListener('click', activate);
    item.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        activate();
      }
    });
  });

  // Search filter inside sidebar
  const searchInput = document.getElementById('map-search-input');
  if (searchInput) {
    searchInput.addEventListener('input', function(e) {
      const query = e.target.value.toLowerCase().trim();
      workshopItems.forEach((item) => {
        const name = item.getAttribute('data-name') || '';
        const cat = item.getAttribute('data-cat') || '';
        if (!query || name.includes(query) || cat.includes(query)) {
          item.style.display = 'block';
        } else {
          item.style.display = 'none';
        }
      });
    });
  }

  // Check URL hash (e.g. #workshop-bat-trang)
  if (window.location.hash) {
    const slug = window.location.hash.replace('#workshop-', '').replace('#', '');
    const marker = markersMap.get(slug);
    if (marker) {
      const item = document.querySelector(`.map-workshop-item[data-slug="${slug}"]`);
      if (item) {
        item.click();
      }
    }
  }

  window.addEventListener('resize', function() {
    map.invalidateSize();
  });
  setTimeout(function() {
    map.invalidateSize();
  }, 250);
})();
