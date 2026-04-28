(function () {
  const STORAGE_KEY = "zerovault-theme";
  const DARK = "dark";
  const LIGHT = "light";
  const PRIMARY_NAV = ["Home", "Open App", "Getting Started", "Security", "Import Guide"];
  const FOOTER_GROUPS = [
    { title: "Product", labels: ["Home", "Open App", "Getting Started", "Security", "Import Guide"] },
    { title: "Guides", labels: ["Backup & Recovery", "FAQ", "Offline Guide", "Client-Side Guide", "Troubleshooting"] },
    { title: "Project", labels: ["Changelog", "Marketing", "Presentation"] },
  ];

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

  function linkLabel(link) {
    return (link.textContent || "").replace(/\s+/g, " ").trim();
  }

  function ensureHeaderActions() {
    const headerRight = document.querySelector(".header-right");
    if (!headerRight) return null;
    let actions = headerRight.querySelector(".header-actions");
    if (!actions) {
      actions = document.createElement("div");
      actions.className = "header-actions";
      headerRight.appendChild(actions);
    }
    return actions;
  }

  function enhanceHeaderNav() {
    const nav = document.querySelector(".header-nav");
    if (!nav || nav.dataset.enhanced === "true") return;
    nav.dataset.enhanced = "true";

    const links = Array.from(nav.querySelectorAll(":scope > a"));
    if (!links.length) return;

    const primary = [];
    const overflow = [];

    for (const link of links) {
      const label = linkLabel(link);
      if (PRIMARY_NAV.includes(label)) primary.push(link);
      else overflow.push(link);
      if (label === "Open App") link.classList.add("cta-link");
    }

    nav.innerHTML = "";
    for (const label of PRIMARY_NAV) {
      const link = primary.find((item) => linkLabel(item) === label);
      if (link) nav.appendChild(link);
    }

    if (overflow.length) {
      const details = document.createElement("details");
      details.className = "nav-more";
      if (overflow.some((link) => link.classList.contains("active"))) details.classList.add("has-active");

      const summary = document.createElement("summary");
      summary.textContent = "More";
      details.appendChild(summary);

      const dropdown = document.createElement("div");
      dropdown.className = "nav-dropdown";
      for (const link of overflow) dropdown.appendChild(link);
      details.appendChild(dropdown);
      nav.appendChild(details);
    }
  }

  function ensureMenuButton() {
    const header = document.querySelector(".header");
    const headerLeft = document.querySelector(".header-left");
    const headerNav = document.querySelector(".header-nav");
    if (!header || !headerLeft || !headerNav || document.querySelector("[data-menu-toggle]")) return;

    if (!headerNav.id) headerNav.id = "primary-nav";

    const button = document.createElement("button");
    button.type = "button";
    button.className = "secondary header-menu-toggle";
    button.setAttribute("data-menu-toggle", "true");
    button.setAttribute("aria-expanded", "false");
    button.setAttribute("aria-controls", headerNav.id);
    button.textContent = "Menu";

    function closeMenu() {
      header.classList.remove("menu-open");
      button.setAttribute("aria-expanded", "false");
      button.textContent = "Menu";
    }

    function openMenu() {
      header.classList.add("menu-open");
      button.setAttribute("aria-expanded", "true");
      button.textContent = "Close";
    }

    button.addEventListener("click", function () {
      if (header.classList.contains("menu-open")) closeMenu();
      else openMenu();
    });

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape") closeMenu();
    });

    document.addEventListener("click", function (event) {
      if (!header.contains(event.target)) closeMenu();
    });

    header.addEventListener("click", function (event) {
      const link = event.target.closest(".header-nav a");
      if (link && window.innerWidth <= 768) closeMenu();
    });

    window.addEventListener("resize", function () {
      if (window.innerWidth > 768) closeMenu();
    });

    headerLeft.appendChild(button);
  }

  function enhanceFooter() {
    const footerNav = document.querySelector(".footer-nav");
    if (!footerNav || footerNav.dataset.enhanced === "true") return;
    footerNav.dataset.enhanced = "true";

    const links = Array.from(footerNav.querySelectorAll("a"));
    if (!links.length) return;

    const used = new Set();
    const columns = [];

    for (const group of FOOTER_GROUPS) {
      const groupLinks = links.filter((link) => group.labels.includes(linkLabel(link)));
      if (!groupLinks.length) continue;
      for (const link of groupLinks) used.add(link);
      columns.push({ title: group.title, links: groupLinks });
    }

    const remaining = links.filter((link) => !used.has(link));
    if (remaining.length) columns.push({ title: "Explore", links: remaining });

    footerNav.innerHTML = "";
    footerNav.classList.add("footer-nav-grid");

    for (const column of columns) {
      const wrap = document.createElement("div");
      wrap.className = "footer-column";

      const title = document.createElement("p");
      title.className = "footer-title";
      title.textContent = column.title;
      wrap.appendChild(title);

      for (const link of column.links) wrap.appendChild(link);
      footerNav.appendChild(wrap);
    }
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
    ensureHeaderActions();
    enhanceHeaderNav();
    ensureMenuButton();
    enhanceFooter();
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
