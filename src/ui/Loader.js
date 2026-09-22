const root = document.querySelector("#loader");
const bar = document.querySelector("#loader-bar");

export function setLoadProgress(ratio) {
  if (!bar) {
    return;
  }

  const amount = Math.max(0, Math.min(1, ratio));
  bar.classList.add("is-determined");
  bar.style.width = `${Math.round(amount * 100)}%`;
}

export function hideLoader() {
  if (!root || root.hidden) {
    return;
  }

  setLoadProgress(1);
  root.classList.add("is-hidden");
  root.setAttribute("aria-hidden", "true");
  window.setTimeout(() => {
    root.hidden = true;
  }, 480);
}
