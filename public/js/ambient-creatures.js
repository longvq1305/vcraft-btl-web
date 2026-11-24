/**
 * vCraft Interactive Ambient Heritage Creatures
 * - Light Mode ("Giấy Dó & Son Đất"): Flock of Đông Sơn Chim Lạc gliding across the screen.
 * - Dark Mode ("Men Lam & Ngọc Bích"): Glowing village Fireflies (Đom Đóm) drifting in the night.
 * - Cursor Interaction:
 *   + Calm mouse movement: nearby creatures gracefully follow & orbit around the pointer.
 *   + Fast / sudden mouse flick: startles creatures — they break off and resume random flight.
 */
(function() {
  'use strict';

  var FAST_SPEED_THRESHOLD = 1150;     // px/s: above this smoothed speed, creatures break off
  var INSTANT_WHIP_SPEED = 1550;       // px/s: sudden sharp flick speed
  var INSTANT_WHIP_DIST = 28;          // px minimum delta to count as a sharp whip
  var ATTRACT_RADIUS = 360;            // px: distance within which calm cursor attracts creatures
  var KEEP_FOLLOW_RADIUS = 580;        // px: max tether distance once already following
  var POINTER_IDLE_RELEASE_SEC = 8.0;  // seconds of zero movement before flock slowly disperses

  function clamp(v, min, max) {
    return v < min ? min : (v > max ? max : v);
  }

  function wrapAngle(a) {
    while (a > Math.PI) a -= Math.PI * 2;
    while (a < -Math.PI) a += Math.PI * 2;
    return a;
  }

  function lerpAngle(current, target, t) {
    return current + wrapAngle(target - current) * clamp(t, 0, 1);
  }

  function prefersReducedMotion() {
    return typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function getActiveTheme() {
    var attr = document.documentElement && document.documentElement.getAttribute('data-theme');
    return attr === 'dark' ? 'dark' : 'light';
  }

  function createEngine(canvas) {
    var ctx = canvas.getContext('2d');
    if (!ctx) return null;

    var width = Math.max(320, window.innerWidth || 1280);
    var height = Math.max(320, window.innerHeight || 720);
    var dpr = clamp(window.devicePixelRatio || 1, 1, 2);

    var theme = getActiveTheme();
    var dayAlpha = theme === 'light' ? 1 : 0;
    var nightAlpha = theme === 'dark' ? 1 : 0;

    var pointer = {
      x: width * 0.5,
      y: height * 0.5,
      active: false,
      speed: 0,
      lastMoveMs: 0,
      idleSec: 0,
      fastBurstTimer: 0
    };

    var birds = [];
    var fireflies = [];
    var rafId = null;
    var lastFrameMs = 0;

    function resize() {
      width = Math.max(320, window.innerWidth || 1280);
      height = Math.max(320, window.innerHeight || 720);
      dpr = clamp(window.devicePixelRatio || 1, 1, 2);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function createBird(index, total) {
      var angle = (Math.PI * 2 * index) / total + (Math.random() - 0.5) * 0.6;
      var baseSpeed = 68 + Math.random() * 26;
      var x = width * (0.12 + 0.76 * Math.random());
      var y = height * (0.14 + 0.72 * Math.random());
      var isOxblood = index % 3 !== 2;
      return {
        kind: 'bird',
        x: x,
        y: y,
        vx: Math.cos(angle) * baseSpeed,
        vy: Math.sin(angle) * baseSpeed,
        heading: angle,
        baseSpeed: baseSpeed,
        followSpeed: 145 + Math.random() * 35,
        scale: 0.74 + Math.random() * 0.36,
        bodyColor: isOxblood ? '#5F0C0A' : '#A34326',
        wingTipColor: isOxblood ? '#A34326' : '#5F0C0A',
        accentColor: '#C59B27',
        wingPhase: Math.random() * Math.PI * 2,
        wingRate: 5.4 + Math.random() * 1.8,
        wanderAngle: angle,
        orbitRadius: 48 + (index % 4) * 18 + Math.random() * 14,
        orbitAngle: (Math.PI * 2 * index) / total,
        orbitSpin: (index % 2 === 0 ? 1 : -1) * (0.65 + Math.random() * 0.45),
        following: false,
        scareTimer: 0,
        trail: []
      };
    }

    function createFirefly(index, total) {
      var angle = Math.random() * Math.PI * 2;
      var baseSpeed = 30 + Math.random() * 24;
      var isGold = index % 3 !== 0;
      return {
        kind: 'firefly',
        x: width * (0.08 + 0.84 * Math.random()),
        y: height * (0.10 + 0.80 * Math.random()),
        vx: Math.cos(angle) * baseSpeed,
        vy: Math.sin(angle) * baseSpeed,
        heading: angle,
        baseSpeed: baseSpeed,
        followSpeed: 108 + Math.random() * 32,
        scale: 0.72 + Math.random() * 0.52,
        glowRgb: isGold ? '224, 182, 88' : '134, 219, 196',
        coreColor: isGold ? '#FFF9E1' : '#EFF3EE',
        pulsePhase: Math.random() * Math.PI * 2,
        pulseRate: 2.1 + Math.random() * 1.9,
        flutterPhase: Math.random() * Math.PI * 2,
        wanderAngle: angle,
        orbitRadius: 30 + (index % 5) * 15 + Math.random() * 12,
        orbitAngle: (Math.PI * 2 * index) / total,
        orbitSpin: (index % 2 === 0 ? 1 : -1) * (0.85 + Math.random() * 0.55),
        following: false,
        scareTimer: 0,
        trail: []
      };
    }

    function initPopulations() {
      var isCompact = width < 768;
      var birdCount = isCompact ? 5 : 8;
      var fireflyCount = isCompact ? 11 : 18;
      birds = [];
      fireflies = [];
      for (var i = 0; i < birdCount; i++) {
        birds.push(createBird(i, birdCount));
      }
      for (var j = 0; j < fireflyCount; j++) {
        fireflies.push(createFirefly(j, fireflyCount));
      }
    }

    function scatterGroup(list) {
      for (var i = 0; i < list.length; i++) {
        var c = list[i];
        var dx = c.x - pointer.x;
        var dy = c.y - pointer.y;
        var dist = Math.hypot(dx, dy);
        if (c.following || dist < 260) {
          c.following = false;
          c.scareTimer = 1.55 + Math.random() * 0.95;
          var awayAngle = dist > 4
            ? Math.atan2(dy, dx) + (Math.random() - 0.5) * 1.15
            : Math.random() * Math.PI * 2;
          c.wanderAngle = awayAngle;
          var burst = c.baseSpeed * 1.65;
          c.vx = Math.cos(awayAngle) * burst;
          c.vy = Math.sin(awayAngle) * burst;
        }
      }
    }

    function onPointerMove(clientX, clientY, nowMs) {
      var ts = typeof nowMs === 'number' ? nowMs : performance.now();
      if (pointer.active && pointer.lastMoveMs > 0) {
        var dtSec = Math.max(0.008, (ts - pointer.lastMoveMs) / 1000);
        var stepDist = Math.hypot(clientX - pointer.x, clientY - pointer.y);
        var instSpeed = stepDist / dtSec;
        pointer.speed = pointer.speed * 0.52 + instSpeed * 0.48;

        if (pointer.speed > FAST_SPEED_THRESHOLD || (instSpeed > INSTANT_WHIP_SPEED && stepDist > INSTANT_WHIP_DIST)) {
          pointer.fastBurstTimer = 0.85;
          scatterGroup(theme === 'dark' ? fireflies : birds);
        }
      } else {
        pointer.speed = 0;
      }

      pointer.x = clientX;
      pointer.y = clientY;
      pointer.active = true;
      pointer.lastMoveMs = ts;
      pointer.idleSec = 0;
    }

    function onPointerLeave() {
      pointer.active = false;
      pointer.speed = 0;
      for (var i = 0; i < birds.length; i++) birds[i].following = false;
      for (var j = 0; j < fireflies.length; j++) fireflies[j].following = false;
    }

    function updateCreatures(list, dt, isBird) {
      var margin = 58;
      var canFollow = pointer.active &&
        pointer.fastBurstTimer <= 0 &&
        pointer.speed <= FAST_SPEED_THRESHOLD &&
        pointer.idleSec < POINTER_IDLE_RELEASE_SEC;

      for (var i = 0; i < list.length; i++) {
        var c = list[i];
        if (c.scareTimer > 0) {
          c.scareTimer = Math.max(0, c.scareTimer - dt);
        }

        var dxPtr = pointer.x - c.x;
        var dyPtr = pointer.y - c.y;
        var distPtr = Math.hypot(dxPtr, dyPtr);

        if (!canFollow || c.scareTimer > 0) {
          c.following = false;
        } else if (c.following) {
          if (distPtr > KEEP_FOLLOW_RADIUS) {
            c.following = false;
          }
        } else if (distPtr <= ATTRACT_RADIUS) {
          c.following = true;
        }

        var desiredVx = c.vx;
        var desiredVy = c.vy;

        if (c.following) {
          c.orbitAngle += c.orbitSpin * dt;
          var targetX = pointer.x + Math.cos(c.orbitAngle) * c.orbitRadius;
          var targetY = pointer.y + Math.sin(c.orbitAngle) * c.orbitRadius;
          var toTx = targetX - c.x;
          var toTy = targetY - c.y;
          var toDist = Math.hypot(toTx, toTy) || 1;
          var arriveFactor = clamp(toDist / 95, 0.42, 1.15);
          var speed = c.followSpeed * arriveFactor;
          desiredVx = (toTx / toDist) * speed;
          desiredVy = (toTy / toDist) * speed;
          c.wanderAngle = Math.atan2(desiredVy, desiredVx);
        } else {
          // Organic autonomous wandering
          var jitter = isBird ? 1.85 : 2.9;
          c.wanderAngle += (Math.random() - 0.5) * jitter * dt * 3.2;

          // Gentle curve back inside viewport margins so creatures stay visible on screen
          if (c.x < margin) {
            c.wanderAngle = lerpAngle(c.wanderAngle, 0, dt * 3.2);
          } else if (c.x > width - margin) {
            c.wanderAngle = lerpAngle(c.wanderAngle, Math.PI, dt * 3.2);
          }
          if (c.y < margin + 36) {
            c.wanderAngle = lerpAngle(c.wanderAngle, Math.PI * 0.5, dt * 3.2);
          } else if (c.y > height - margin) {
            c.wanderAngle = lerpAngle(c.wanderAngle, -Math.PI * 0.5, dt * 3.2);
          }

          var cruise = c.scareTimer > 0 ? c.baseSpeed * 1.38 : c.baseSpeed;
          desiredVx = Math.cos(c.wanderAngle) * cruise;
          desiredVy = Math.sin(c.wanderAngle) * cruise;
        }

        // Soft separation between neighbors so flock never collapses onto a single point
        var sepX = 0;
        var sepY = 0;
        var minSep = isBird ? 44 : 28;
        for (var j = 0; j < list.length; j++) {
          if (i === j) continue;
          var other = list[j];
          var sx = c.x - other.x;
          var sy = c.y - other.y;
          var sDist = Math.hypot(sx, sy);
          if (sDist > 0.1 && sDist < minSep) {
            var push = ((minSep - sDist) / minSep) * 52;
            sepX += (sx / sDist) * push;
            sepY += (sy / sDist) * push;
          }
        }

        desiredVx += sepX;
        desiredVy += sepY;

        var steerRate = isBird ? 3.8 : 4.6;
        var blend = clamp(steerRate * dt, 0, 1);
        c.vx += (desiredVx - c.vx) * blend;
        c.vy += (desiredVy - c.vy) * blend;

        c.x += c.vx * dt;
        c.y += c.vy * dt;

        // Hard safety clamp with gentle bounce if window resized smaller
        if (c.x < -40) c.x = width + 30;
        if (c.x > width + 40) c.x = -30;
        if (c.y < -40) c.y = height + 30;
        if (c.y > height + 40) c.y = -30;

        var velMag = Math.hypot(c.vx, c.vy);
        if (velMag > 2) {
          c.heading = lerpAngle(c.heading, Math.atan2(c.vy, c.vx), clamp(dt * 8, 0, 1));
        }

        if (isBird) {
          var speedRatio = clamp(velMag / c.baseSpeed, 0.75, 1.85);
          c.wingPhase += c.wingRate * speedRatio * dt;
        } else {
          c.pulsePhase += c.pulseRate * dt;
          c.flutterPhase += 22 * dt;
        }

        c.trail.unshift({ x: c.x, y: c.y });
        var maxTrail = isBird ? 7 : 6;
        if (c.trail.length > maxTrail) {
          c.trail.length = maxTrail;
        }
      }
    }

    function drawBird(b, alpha) {
      var s = b.scale;

      // Subtle golden wind wake trail
      if (b.trail.length > 2) {
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(b.trail[0].x, b.trail[0].y);
        for (var t = 1; t < b.trail.length; t++) {
          ctx.lineTo(b.trail[t].x, b.trail[t].y);
        }
        ctx.strokeStyle = 'rgba(197, 155, 39, ' + (0.20 * alpha).toFixed(3) + ')';
        ctx.lineWidth = 1.2 * s;
        ctx.lineCap = 'round';
        ctx.stroke();
        ctx.restore();
      }

      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(b.heading);
      ctx.scale(s, s);
      ctx.globalAlpha = 0.88 * alpha;

      var flap = Math.sin(b.wingPhase);
      var wingSpan = 16 + flap * 7.5;
      var wingSweep = -7 - flap * 3.5;
      var tailWave = Math.sin(b.wingPhase * 0.75 - 0.8) * 2.5;

      // Twin Dong Son tail streamers
      ctx.beginPath();
      ctx.moveTo(-7, 0.5);
      ctx.quadraticCurveTo(-18, 2 + tailWave * 0.5, -29, 3.5 + tailWave);
      ctx.strokeStyle = b.bodyColor;
      ctx.lineWidth = 1.35;
      ctx.lineCap = 'round';
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(-7, -0.5);
      ctx.quadraticCurveTo(-17, -2 + tailWave * 0.4, -26, -3 + tailWave * 0.8);
      ctx.strokeStyle = b.accentColor;
      ctx.lineWidth = 1.05;
      ctx.stroke();

      // Left & Right articulated Dong Son wings
      ctx.beginPath();
      ctx.moveTo(3, -1);
      ctx.quadraticCurveTo(0, -wingSpan * 0.65, wingSweep, -wingSpan);
      ctx.quadraticCurveTo(-5, -wingSpan * 0.42, -5, -1);
      ctx.closePath();
      ctx.fillStyle = b.bodyColor;
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(3, 1);
      ctx.quadraticCurveTo(0, wingSpan * 0.65, wingSweep, wingSpan);
      ctx.quadraticCurveTo(-5, wingSpan * 0.42, -5, 1);
      ctx.closePath();
      ctx.fillStyle = b.wingTipColor;
      ctx.fill();

      // Golden Dong Son wing leading-edge highlight
      ctx.beginPath();
      ctx.moveTo(3.2, -1);
      ctx.quadraticCurveTo(0.4, -wingSpan * 0.62, wingSweep * 0.92, -wingSpan * 0.92);
      ctx.moveTo(3.2, 1);
      ctx.quadraticCurveTo(0.4, wingSpan * 0.62, wingSweep * 0.92, wingSpan * 0.92);
      ctx.strokeStyle = b.accentColor;
      ctx.lineWidth = 0.95;
      ctx.stroke();

      // Slender crane body, outstretched neck & long heron beak
      ctx.beginPath();
      ctx.moveTo(-10, 0);
      ctx.quadraticCurveTo(-2, -2.8, 7, -1.2);
      ctx.lineTo(18, 0);
      ctx.lineTo(7, 1.2);
      ctx.quadraticCurveTo(-2, 2.8, -10, 0);
      ctx.closePath();
      ctx.fillStyle = b.bodyColor;
      ctx.fill();

      // Swept-back Dong Son head crest plume
      ctx.beginPath();
      ctx.moveTo(8.5, -1);
      ctx.quadraticCurveTo(4.5, -4.5, 0.5, -5.2);
      ctx.strokeStyle = b.accentColor;
      ctx.lineWidth = 1.1;
      ctx.stroke();

      ctx.restore();
    }

    function drawFirefly(f, alpha) {
      var pulse = 0.52 + 0.48 * (0.5 + 0.5 * Math.sin(f.pulsePhase));
      var effectiveAlpha = alpha * (f.following ? Math.min(1, pulse + 0.22) : pulse);
      var s = f.scale;

      // Soft stardust trail motes
      for (var t = 1; t < f.trail.length; t++) {
        var pt = f.trail[t];
        var ratio = 1 - t / f.trail.length;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 1.5 * s * ratio, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(' + f.glowRgb + ', ' + (0.26 * effectiveAlpha * ratio).toFixed(3) + ')';
        ctx.fill();
      }

      // Bioluminescent radial aura
      var glowRadius = (13 + 7 * pulse) * s;
      var grad = ctx.createRadialGradient(f.x, f.y, 0.5, f.x, f.y, glowRadius);
      grad.addColorStop(0, 'rgba(255, 250, 230, ' + (0.95 * effectiveAlpha).toFixed(3) + ')');
      grad.addColorStop(0.28, 'rgba(' + f.glowRgb + ', ' + (0.62 * effectiveAlpha).toFixed(3) + ')');
      grad.addColorStop(0.68, 'rgba(' + f.glowRgb + ', ' + (0.16 * effectiveAlpha).toFixed(3) + ')');
      grad.addColorStop(1, 'rgba(' + f.glowRgb + ', 0)');

      ctx.beginPath();
      ctx.arc(f.x, f.y, glowRadius, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();

      // Tiny winged firefly body & lantern abdomen
      ctx.save();
      ctx.translate(f.x, f.y);
      ctx.rotate(f.heading);
      ctx.scale(s, s);
      ctx.globalAlpha = clamp(alpha * 0.92, 0, 1);

      var wingSpread = 3.2 + Math.sin(f.flutterPhase) * 1.4;
      ctx.fillStyle = 'rgba(239, 243, 238, 0.34)';
      ctx.beginPath();
      ctx.ellipse(0, -wingSpread * 0.7, 3.0, 1.3, -0.45, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(0, wingSpread * 0.7, 3.0, 1.3, 0.45, 0, Math.PI * 2);
      ctx.fill();

      // Dark indigo-jade thorax/head
      ctx.fillStyle = '#16383B';
      ctx.beginPath();
      ctx.ellipse(2.2, 0, 2.2, 1.25, 0, 0, Math.PI * 2);
      ctx.fill();

      // Glowing lantern tail tip
      ctx.fillStyle = f.coreColor;
      ctx.beginPath();
      ctx.ellipse(-1.8, 0, 2.5, 1.5, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }

    function step(dt) {
      var safeDt = clamp(dt, 0.001, 0.05);
      theme = getActiveTheme();

      // Decay pointer speed & fast-burst cooldown smoothly over time
      pointer.speed *= Math.pow(0.08, safeDt);
      if (pointer.active) {
        pointer.idleSec += safeDt;
      }
      if (pointer.fastBurstTimer > 0) {
        pointer.fastBurstTimer = Math.max(0, pointer.fastBurstTimer - safeDt);
      }

      // Smooth Day <-> Night creature crossfade matching page dissolve
      if (theme === 'dark') {
        dayAlpha = Math.max(0, dayAlpha - safeDt * 1.6);
        nightAlpha = Math.min(1, nightAlpha + safeDt * 1.25);
      } else {
        nightAlpha = Math.max(0, nightAlpha - safeDt * 1.6);
        dayAlpha = Math.min(1, dayAlpha + safeDt * 1.25);
      }

      if (dayAlpha > 0.01) {
        updateCreatures(birds, safeDt, true);
      }
      if (nightAlpha > 0.01) {
        updateCreatures(fireflies, safeDt, false);
      }
    }

    function render() {
      ctx.clearRect(0, 0, width, height);
      if (dayAlpha > 0.01) {
        for (var i = 0; i < birds.length; i++) {
          drawBird(birds[i], dayAlpha);
        }
      }
      if (nightAlpha > 0.01) {
        for (var j = 0; j < fireflies.length; j++) {
          drawFirefly(fireflies[j], nightAlpha);
        }
      }
    }

    function loop(nowMs) {
      if (document.hidden || prefersReducedMotion()) {
        rafId = null;
        ctx.clearRect(0, 0, width, height);
        return;
      }
      var dt = lastFrameMs > 0 ? (nowMs - lastFrameMs) / 1000 : 0.016;
      lastFrameMs = nowMs;
      step(dt);
      render();
      rafId = window.requestAnimationFrame(loop);
    }

    function start() {
      if (rafId !== null || prefersReducedMotion()) return;
      lastFrameMs = 0;
      rafId = window.requestAnimationFrame(loop);
    }

    function stop() {
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
        rafId = null;
      }
      ctx.clearRect(0, 0, width, height);
    }

    resize();
    initPopulations();

    window.addEventListener('resize', resize, { passive: true });
    window.addEventListener('mousemove', function(e) {
      onPointerMove(e.clientX, e.clientY, performance.now());
    }, { passive: true });
    document.addEventListener('mouseleave', onPointerLeave, { passive: true });
    window.addEventListener('blur', onPointerLeave, { passive: true });

    document.addEventListener('visibilitychange', function() {
      if (document.hidden) {
        stop();
      } else {
        start();
      }
    });

    if (typeof MutationObserver === 'function' && document.documentElement) {
      var obs = new MutationObserver(function() {
        theme = getActiveTheme();
      });
      obs.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['data-theme']
      });
    }

    start();

    return {
      step: step,
      render: render,
      onPointerMove: onPointerMove,
      onPointerLeave: onPointerLeave,
      getState: function() {
        return {
          theme: theme,
          dayAlpha: dayAlpha,
          nightAlpha: nightAlpha,
          pointer: pointer,
          birds: birds,
          fireflies: fireflies
        };
      }
    };
  }

  function boot() {
    var canvas = document.getElementById('heritage-ambient-canvas');
    if (!canvas) return;
    window.__vcraftAmbientCreatures = createEngine(canvas);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
