const QUESTION = "What kind of developer do you want to become?";

const CAREER_PATHS = [
  {
    label: "Frontend",
    task: "Make the login button turn green on hover.",
    hint: "Start with the button's :hover selector in CSS.",
  },
  {
    label: "Backend",
    task: "Return the user's name from GET /users/:id as JSON.",
    hint: "Read the id from the URL and send a JSON response.",
  },
  {
    label: "Game Developer",
    task: "Move the player 10 pixels right when Space is pressed.",
    hint: "Listen for keydown and update the player's x position.",
  },
  {
    label: "I have no idea",
    task: "Open a browser, editor, and terminal. Choose one to explore.",
    hint: "There is no wrong first step. Curiosity is enough for now.",
  },
];

const COLORS = {
  text: "#b9ffd2",
  bright: "#effff4",
  muted: "#5d9d76",
  accent: "#86ffc0",
  panel: "#10251a",
};

export class ChapterScreen {
  constructor({ width = 1600, height = 1000 } = {}) {
    this.canvas = document.createElement("canvas");
    this.canvas.width = width;
    this.canvas.height = height;
    this.ctx = this.canvas.getContext("2d");
    this.selectedPath = null;
    this.draw();
  }

  draw() {
    const { ctx, canvas } = this;
    ctx.fillStyle = "#020403";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.textBaseline = "top";
    ctx.font = "28px Consolas, 'Courier New', monospace";
    ctx.fillStyle = COLORS.muted;
    ctx.fillText("DEV PATH // CHAPTER 01", 72, 64);

    if (this.selectedPath) {
      this.drawTask(this.selectedPath);
      return;
    }

    ctx.font = "bold 48px Consolas, 'Courier New', monospace";
    ctx.fillStyle = COLORS.bright;
    this.drawWrapped(QUESTION, 72, 150, 1420, 62);

    CAREER_PATHS.forEach((path, index) => {
      const y = 390 + index * 116;
      ctx.fillStyle = COLORS.panel;
      ctx.fillRect(64, y, 1472, 86);
      ctx.strokeStyle = "rgba(134, 255, 192, 0.32)";
      ctx.strokeRect(64, y, 1472, 86);
      ctx.font = "26px Consolas, 'Courier New', monospace";
      ctx.fillStyle = COLORS.muted;
      ctx.fillText(`0${index + 1}`, 92, y + 28);
      ctx.fillStyle = COLORS.text;
      ctx.fillText(path.label, 180, y + 28);
    });
  }

  drawTask(path) {
    const { ctx } = this;
    ctx.font = "24px Consolas, 'Courier New', monospace";
    ctx.fillStyle = COLORS.accent;
    ctx.fillText(`PATH SELECTED // ${path.label.toUpperCase()}`, 72, 154);
    ctx.font = "bold 50px Consolas, 'Courier New', monospace";
    ctx.fillStyle = COLORS.bright;
    this.drawWrapped(path.task, 72, 260, 1420, 66);
    ctx.font = "28px Consolas, 'Courier New', monospace";
    ctx.fillStyle = COLORS.muted;
    ctx.fillText("HINT", 72, 590);
    ctx.fillStyle = COLORS.text;
    this.drawWrapped(path.hint, 72, 640, 1420, 42);
  }

  drawWrapped(text, x, y, maxWidth, lineHeight) {
    const words = text.split(" ");
    const lines = [];
    let line = "";
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (this.ctx.measureText(next).width > maxWidth && line) {
        lines.push(line);
        line = word;
      } else {
        line = next;
      }
    }
    if (line) {
      lines.push(line);
    }
    lines.forEach((item, index) => this.ctx.fillText(item, x, y + index * lineHeight));
  }

  choose(index) {
    const path = CAREER_PATHS[index];
    if (!path) {
      return false;
    }
    this.selectedPath = path;
    this.draw();
    return true;
  }

  chooseAtCanvasY(y) {
    if (this.selectedPath) {
      return false;
    }
    const index = Math.floor((y - 390) / 116);
    const optionTop = 390 + index * 116;
    if (index < 0 || index >= CAREER_PATHS.length || y < optionTop || y > optionTop + 86) {
      return false;
    }
    return this.choose(index);
  }
}
