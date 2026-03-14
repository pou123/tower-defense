// ==============================================================
// UTILS.JS — Math helpers, collision detection, misc utilities
// ==============================================================

const Utils = {
  dist(x1, y1, x2, y2) {
    const dx = x2 - x1, dy = y2 - y1;
    return Math.sqrt(dx * dx + dy * dy);
  },

  distSq(x1, y1, x2, y2) {
    const dx = x2 - x1, dy = y2 - y1;
    return dx * dx + dy * dy;
  },

  angle(x1, y1, x2, y2) {
    return Math.atan2(y2 - y1, x2 - x1);
  },

  normalize(x, y) {
    const len = Math.sqrt(x * x + y * y);
    if (len === 0) return { x: 0, y: 0 };
    return { x: x / len, y: y / len };
  },

  clamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
  },

  lerp(a, b, t) {
    return a + (b - a) * t;
  },

  randFloat(min, max) {
    return min + Math.random() * (max - min);
  },

  randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  },

  randFrom(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  },

  shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  },

  pickN(arr, n) {
    return Utils.shuffle(arr).slice(0, Math.min(n, arr.length));
  },

  circleCollide(x1, y1, r1, x2, y2, r2) {
    return Utils.distSq(x1, y1, x2, y2) < (r1 + r2) * (r1 + r2);
  },

  // Check if a point is inside a circle
  pointInCircle(px, py, cx, cy, r) {
    return Utils.distSq(px, py, cx, cy) < r * r;
  },

  // Check segment (x1,y1)-(x2,y2) against circle center (cx,cy) radius r.
  // This is used to avoid missing fast-moving projectiles.
  segmentCircleCollide(x1, y1, x2, y2, cx, cy, r) {
    const vx = x2 - x1;
    const vy = y2 - y1;
    const wx = cx - x1;
    const wy = cy - y1;
    const c1 = vx * wx + vy * wy;
    if (c1 <= 0) {
      // Closest to start point
      return Utils.distSq(x1, y1, cx, cy) <= r * r;
    }
    const c2 = vx * vx + vy * vy;
    if (c2 <= 0) {
      return Utils.distSq(x1, y1, cx, cy) <= r * r;
    }
    const t = c1 / c2;
    const bx = x1 + vx * t;
    const by = y1 + vy * t;
    return Utils.distSq(bx, by, cx, cy) <= r * r;
  },

  // Angle difference (shortest path), returns -PI to PI
  angleDiff(a, b) {
    let d = b - a;
    while (d > Math.PI)  d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    return d;
  },

  // Move angle 'from' toward angle 'to' by at most 'maxStep' radians
  rotateToward(from, to, maxStep) {
    const diff = Utils.angleDiff(from, to);
    if (Math.abs(diff) <= maxStep) return to;
    return from + Math.sign(diff) * maxStep;
  },

  // Distance from point (px,py) to line segment (ax,ay)-(bx,by)
  pointToSegmentDist(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return Utils.dist(px, py, ax, ay);
    let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
    t = Utils.clamp(t, 0, 1);
    return Utils.dist(px, py, ax + t * dx, ay + t * dy);
  },

  // Draw a solid circle (no glow)
  drawGlowCircle(ctx, x, y, r, color, glowColor, glowSize = 15) {
    ctx.beginPath();
    ctx.arc(x, y, r + glowSize, 0, Math.PI * 2);
    ctx.fillStyle = glowColor;
    ctx.globalAlpha = 0.25;
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  },


  // Hex grid background pattern
  drawHexGrid(ctx, camX, camY, viewW, viewH, arenaW, arenaH) {
    const size = 40;
    const w = size * Math.sqrt(3);
    const h = size * 2;
    ctx.strokeStyle = 'rgba(255,255,255,0.03)';
    ctx.lineWidth = 1;
    for (let row = -1; row < arenaH / (h * 0.75) + 1; row++) {
      for (let col = -1; col < arenaW / w + 1; col++) {
        const cx = col * w + (row % 2) * (w / 2);
        const cy = row * h * 0.75;
        if (cx < camX - w || cx > camX + viewW + w) continue;
        if (cy < camY - h || cy > camY + viewH + h) continue;
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const angle = (Math.PI / 3) * i - Math.PI / 6;
          const px = cx + size * Math.cos(angle);
          const py = cy + size * Math.sin(angle);
          i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.stroke();
      }
    }
  },

  clone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }
};
