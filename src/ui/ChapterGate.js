export class ChapterGate {
  constructor({ onOpen, onClose, onConfirm }) {
    this.onOpen = onOpen;
    this.onClose = onClose;
    this.onConfirm = onConfirm;
    this.root = document.querySelector("#app");
    this.button = document.querySelector("#chapter-next");
    this.modal = document.querySelector("#chapter-modal");
    this.stayButton = document.querySelector("#chapter-stay");
    this.goButton = document.querySelector("#chapter-go");
    this.open = false;
    this.shown = false;
    this.bind();
  }

  bind() {
    this.onButtonClick = () => this.ask();
    this.onStay = (event) => {
      event.stopPropagation();
      this.dismiss();
    };
    this.onGo = (event) => {
      event.stopPropagation();
      this.confirm();
    };
    this.onBackdrop = (event) => {
      if (!this.open || event.target.closest(".chapter-dialog")) {
        return;
      }
      this.dismiss();
    };

    this.button?.addEventListener("click", this.onButtonClick);
    this.stayButton?.addEventListener("click", this.onStay);
    this.goButton?.addEventListener("click", this.onGo);
    document.addEventListener("pointerdown", this.onBackdrop);
  }

  show() {
    if (!this.button || this.shown) {
      return;
    }

    this.shown = true;
    this.button.hidden = false;
    this.root?.classList.add("has-chapter-next");
    window.requestAnimationFrame(() => {
      this.button.classList.add("is-visible");
    });
  }

  ask() {
    if (!this.modal || this.open) {
      return;
    }

    this.open = true;
    this.modal.hidden = false;
    this.onOpen?.();
    this.goButton?.focus();
  }

  dismiss() {
    if (!this.open) {
      return;
    }

    this.open = false;
    if (this.modal) {
      this.modal.hidden = true;
    }
    this.onClose?.();
  }

  confirm() {
    if (!this.open) {
      return;
    }

    this.open = false;
    if (this.modal) {
      this.modal.hidden = true;
    }
    this.onConfirm?.();
  }

  onKey(event) {
    if (!this.open || event.key !== "Escape") {
      return false;
    }

    event.preventDefault();
    this.dismiss();
    return true;
  }

  dispose() {
    this.button?.removeEventListener("click", this.onButtonClick);
    this.stayButton?.removeEventListener("click", this.onStay);
    this.goButton?.removeEventListener("click", this.onGo);
    document.removeEventListener("pointerdown", this.onBackdrop);
    this.open = false;
    this.shown = false;
    if (this.modal) {
      this.modal.hidden = true;
    }
    if (this.button) {
      this.button.classList.remove("is-visible");
      this.button.hidden = true;
    }
    this.root?.classList.remove("has-chapter-next");
  }
}
