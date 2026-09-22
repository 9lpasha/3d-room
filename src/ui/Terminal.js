export class Terminal {
  constructor(width = 1600, height = 1000) {
    this.canvas = document.createElement("canvas");
    this.canvas.width = width;
    this.canvas.height = height;
    this.ctx = this.canvas.getContext("2d");

    this.revealing = false;
    this.revealIndex = 0;
    this.revealSpeed = 22;
    this.fullText = "C:\\Users\\You>\n> ";
    this.visibleText = "";
    this.forcedCommand = "npm run career";
    this.typedCount = 0;
    this.input = "";
    this.extraText = "";
    this.inputEnabled = false;
    this.autoFill = false;
    this.autoFillTimer = 0;
    this.autoSubmitDelay = 0;
    this.cursorOn = true;
    this.blinkTimer = 0;
    this.dirty = true;
    this.printQueue = [];
    this.printing = null;
    this.onSubmit = null;
  }

  startReveal() {
    this.revealing = true;
    this.revealIndex = 0;
    this.visibleText = "";
    this.dirty = true;
  }

  isComplete() {
    return this.typedCount >= this.forcedCommand.length;
  }

  typeForcedChar() {
    if (!this.inputEnabled || this.isComplete()) {
      return;
    }

    this.typedCount += 1;
    this.input = this.forcedCommand.slice(0, this.typedCount);
    this.dirty = true;
  }

  deleteChar() {
    if (!this.inputEnabled) {
      return;
    }

    this.typedCount = Math.max(0, this.typedCount - 1);
    this.input = this.forcedCommand.slice(0, this.typedCount);
    this.dirty = true;
  }

  submit() {
    if (!this.inputEnabled || !this.isComplete()) {
      return false;
    }

    this.inputEnabled = false;
    this.cursorOn = false;
    this.dirty = true;
    this.onSubmit?.();
    return true;
  }

  print(text, { delay = 0, speed = 26 } = {}) {
    return new Promise((resolve) => {
      this.printQueue.push({ text, delay, speed, resolve });
    });
  }

  handleKey(event) {
    if (!this.inputEnabled) {
      return;
    }

    if (event.key === "Backspace") {
      this.deleteChar();
      event.preventDefault();
      return;
    }

    if (event.key === "Enter") {
      this.submit();
      event.preventDefault();
      return;
    }

    if (event.key.length === 1 && !event.ctrlKey && !event.metaKey) {
      this.typeForcedChar();
      event.preventDefault();
    }
  }

  update(delta) {
    if (this.revealing) {
      this.revealIndex += this.revealSpeed * delta;
      const next = this.fullText.slice(0, Math.floor(this.revealIndex));
      if (next !== this.visibleText) {
        this.visibleText = next;
        this.dirty = true;
      }
      if (this.revealIndex >= this.fullText.length) {
        this.revealing = false;
        this.inputEnabled = true;
        this.dirty = true;
      }
    }

    if (!this.printing && this.printQueue.length > 0) {
      const job = this.printQueue.shift();
      this.printing = {
        text: job.text,
        speed: job.speed,
        resolve: job.resolve,
        index: 0,
        delay: job.delay,
        visible: "",
      };
    }

    if (this.printing) {
      if (this.printing.delay > 0) {
        this.printing.delay -= delta;
      } else {
        this.printing.index += this.printing.speed * delta;
        const visible = this.printing.text.slice(0, Math.floor(this.printing.index));
        if (visible !== this.printing.visible) {
          this.printing.visible = visible;
          this.dirty = true;
        }
        if (this.printing.index >= this.printing.text.length) {
          this.extraText += this.printing.text;
          const { resolve } = this.printing;
          this.printing = null;
          this.dirty = true;
          resolve();
        }
      }
    }

    if (this.autoFill && this.inputEnabled) {
      if (!this.isComplete()) {
        this.autoFillTimer += delta;
        const nextCount = Math.min(this.forcedCommand.length, Math.floor(this.autoFillTimer * 11));
        if (nextCount !== this.typedCount) {
          this.typedCount = nextCount;
          this.input = this.forcedCommand.slice(0, this.typedCount);
          this.dirty = true;
        }
      } else {
        this.autoSubmitDelay += delta;
        if (this.autoSubmitDelay >= 0.4) {
          this.submit();
        }
      }
    }

    if (this.inputEnabled) {
      this.blinkTimer += delta;
      if (this.blinkTimer >= 0.53) {
        this.blinkTimer = 0;
        this.cursorOn = !this.cursorOn;
        this.dirty = true;
      }
    }

    if (this.dirty) {
      this.draw();
      this.dirty = false;
      return true;
    }

    return false;
  }

  draw() {
    const { ctx, canvas } = this;
    ctx.fillStyle = "#020403";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const printing = this.printing?.visible ?? "";
    const text = this.visibleText + this.input + this.extraText + printing;
    const showCursor = this.cursorOn && this.inputEnabled;

    ctx.font = "36px Consolas, 'Courier New', monospace";
    ctx.textBaseline = "top";

    const left = 72;
    const top = 64;
    const lineHeight = 54;
    const lines = text.split("\n");

    lines.forEach((line, index) => {
      if (line.includes("not recognized")) {
        ctx.fillStyle = "#ff8b6b";
        ctx.shadowColor = "rgba(255, 110, 80, 0.45)";
      } else if (line.includes("lot to learn")) {
        ctx.fillStyle = "#ffe2a8";
        ctx.shadowColor = "rgba(255, 210, 140, 0.4)";
      } else {
        ctx.fillStyle = "#86ffc0";
        ctx.shadowColor = "rgba(90, 255, 170, 0.55)";
      }

      ctx.shadowBlur = 16;
      ctx.fillText(line, left, top + index * lineHeight);
    });

    if (showCursor) {
      const last = lines[lines.length - 1] ?? "";
      const cursorX = left + ctx.measureText(last).width + 6;
      const cursorY = top + (lines.length - 1) * lineHeight;
      ctx.fillStyle = "#86ffc0";
      ctx.shadowColor = "rgba(90, 255, 170, 0.55)";
      ctx.fillText("_", cursorX, cursorY);
    }
  }
}
