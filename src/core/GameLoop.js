export class GameLoop {
  constructor({ game, onFrame }) {
    this.game = game;
    this.onFrame = onFrame;
    this.frameId = null;
    this.lastTime = 0;
    this.running = false;
    this.boundFrame = this.frame.bind(this);
  }

  start() {
    if (this.running) {
      return;
    }
    this.running = true;
    this.lastTime = performance.now();
    this.frameId = requestAnimationFrame(this.boundFrame);
  }

  stop() {
    this.running = false;
    if (this.frameId) {
      cancelAnimationFrame(this.frameId);
      this.frameId = null;
    }
  }

  frame(now) {
    if (!this.running) {
      return;
    }

    const deltaSeconds = Math.min(0.1, (now - this.lastTime) / 1000);
    this.lastTime = now;
    this.game.tick(deltaSeconds);
    this.onFrame?.(this.game.getState());
    this.frameId = requestAnimationFrame(this.boundFrame);
  }
}
