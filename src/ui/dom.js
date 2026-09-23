const CHROME = ["#mode-toggle", "#inspect-modal", "#chapter-next", "#chapter-modal"];

export function isChromeEvent(event) {
  const target = event.target;
  return CHROME.some((selector) => target.closest?.(selector));
}
