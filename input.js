// ==============================================================
// INPUT.JS — Keyboard input management
// ==============================================================

const Input = {
  keys: {},
  justPressed: {},

  init() {
    window.addEventListener('keydown', (e) => {
      if (!this.keys[e.code]) this.justPressed[e.code] = true;
      this.keys[e.code] = true;
      const block = ['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'];
      if (block.includes(e.code)) e.preventDefault();
    });

    window.addEventListener('keyup', (e) => {
      this.keys[e.code] = false;
    });

    // Lose focus = clear all keys (prevents stuck keys)
    window.addEventListener('blur', () => {
      this.keys = {};
      this.justPressed = {};
    });
  },

  isDown(code) {
    return !!this.keys[code];
  },

  wasJustPressed(code) {
    return !!this.justPressed[code];
  },

  clearJustPressed() {
    this.justPressed = {};
  },

  // Returns normalized {x, y} movement direction from WASD / Arrow keys
  getMovementDir() {
    let x = 0, y = 0;
    if (this.isDown('KeyW') || this.isDown('ArrowUp'))    y -= 1;
    if (this.isDown('KeyS') || this.isDown('ArrowDown'))  y += 1;
    if (this.isDown('KeyA') || this.isDown('ArrowLeft'))  x -= 1;
    if (this.isDown('KeyD') || this.isDown('ArrowRight')) x += 1;
    if (x !== 0 && y !== 0) {
      const inv = 1 / Math.sqrt(2);
      x *= inv; y *= inv;
    }
    return { x, y };
  }
};
