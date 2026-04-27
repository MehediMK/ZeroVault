(function () {
  const STORAGE_KEY = "zerovault-theme";
  const DARK = "dark";
  const LIGHT = "light";

  function readTheme() {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch (_error) {
      return null;
    }
  }

  function writeTheme(theme) {
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch (_error) {}
  }

  function preferredTheme() {
    const stored = readTheme();
    if (stored === DARK || stored === LIGHT) return stored;
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches ? LIGHT : DARK;
  }

  function themeColor(theme) {
    return theme === LIGHT ? "#f3f5fb" : "#161b2e";
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", themeColor(theme));
    const toggle = document.querySelector("[data-theme-toggle]");
    if (toggle) {
      const next = theme === DARK ? "Light" : "Dark";
      toggle.textContent = next + " Mode";
      toggle.setAttribute("aria-label", "Switch to " + next.toLowerCase() + " mode");
      toggle.setAttribute("aria-pressed", String(theme === LIGHT));
    }
  }

  function toggleTheme() {
    const current = document.documentElement.getAttribute("data-theme") || preferredTheme();
    const next = current === LIGHT ? DARK : LIGHT;
    writeTheme(next);
    applyTheme(next);
  }

  function ensureToggle() {
    if (document.querySelector("[data-theme-toggle]")) return;

    const button = document.createElement("button");
    button.type = "button";
    button.className = "secondary theme-toggle";
    button.setAttribute("data-theme-toggle", "true");
    button.addEventListener("click", toggleTheme);

    const headerActions = document.querySelector(".header-actions");
    const headerRight = document.querySelector(".header-right");
    if (headerActions) headerActions.prepend(button);
    else if (headerRight) headerRight.appendChild(button);
    else {
      button.classList.add("theme-floating");
      document.body.appendChild(button);
    }

    applyTheme(document.documentElement.getAttribute("data-theme") || preferredTheme());
  }

  applyTheme(preferredTheme());

  document.addEventListener("DOMContentLoaded", function () {
    ensureToggle();

    if (!readTheme() && window.matchMedia) {
      const media = window.matchMedia("(prefers-color-scheme: light)");
      const listener = function (event) {
        applyTheme(event.matches ? LIGHT : DARK);
      };
      if (typeof media.addEventListener === "function") media.addEventListener("change", listener);
      else if (typeof media.addListener === "function") media.addListener(listener);
    }
  });
})();
