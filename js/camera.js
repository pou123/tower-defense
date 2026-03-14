// ==============================================================
// CAMERA.JS — Camera/viewport management
// ==============================================================

const Camera = {
  x: 0,
  y: 0,
  viewW: 0,
  viewH: 0,
  arenaW: 0,
  arenaH: 0,

  init(arenaW, arenaH, viewW, viewH) {
    this.arenaW = arenaW;
    this.arenaH = arenaH;
    this.viewW  = viewW;
    this.viewH  = viewH;
  },

  follow(targetX, targetY) {
    this.x = Utils.clamp(targetX - this.viewW / 2, 0, this.arenaW - this.viewW);
    this.y = Utils.clamp(targetY - this.viewH / 2, 0, this.arenaH - this.viewH);
  },

  apply(ctx) {
    ctx.save();
    ctx.translate(-Math.round(this.x), -Math.round(this.y));
  },

  restore(ctx) {
    ctx.restore();
  },

  screenToWorld(sx, sy) {
    return { x: sx + this.x, y: sy + this.y };
  },

  worldToScreen(wx, wy) {
    return { x: wx - this.x, y: wy - this.y };
  },

  // Is a world-space circle visible on screen (with margin)?
  isVisible(wx, wy, r = 0, margin = 60) {
    return wx + r >= this.x - margin &&
           wx - r <= this.x + this.viewW + margin &&
           wy + r >= this.y - margin &&
           wy - r <= this.y + this.viewH + margin;
  }
};
