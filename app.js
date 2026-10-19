(function () {
  "use strict";

  var categories = ["All", "Model Releases", "Research", "Industry", "Open Source", "Policy", "Tools", "Infrastructure", "Safety"];
  var snapshotPath = "data/published.json";
  var articles = [];
  var activeCategory = "All";
  var list = document.getElementById("article-list");
  var status = document.getElementById("feed-status");
  var nav = document.getElementById("category-nav");
  var themeToggle = document.getElementById("theme-toggle");
  var themeToggleLabel = document.getElementById("theme-toggle-label");
  var themeStorageKey = "ai-foundry-theme";

  function systemTheme() {
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }

  function storedTheme() {
    try {
      var value = window.localStorage.getItem(themeStorageKey);
      return value === "light" || value === "dark" ? value : null;
    } catch (error) {
      return null;
    }
  }

  function setTheme(theme, persist) {
    var isDark = theme === "dark";
    document.documentElement.setAttribute("data-theme", isDark ? "dark" : "light");
    themeToggle.setAttribute("aria-pressed", String(isDark));
    themeToggle.setAttribute("aria-label", isDark ? "Switch to light theme" : "Switch to dark theme");
    themeToggleLabel.textContent = isDark ? "Light theme" : "Dark theme";
    if (persist) {
      try { window.localStorage.setItem(themeStorageKey, isDark ? "dark" : "light"); } catch (error) { /* Preferences remain available for this visit. */ }
    }
  }

  function initializeTheme() {
    setTheme(storedTheme() || systemTheme(), false);
    themeToggle.addEventListener("click", function () {
      var nextTheme = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
      setTheme(nextTheme, true);
    });
  }

  function formatDate(value, options) {
    var date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return new Intl.DateTimeFormat("en-IN", Object.assign({ timeZone: "Asia/Kolkata" }, options)).format(date);
  }

  function safeUrl(value) {
    try {
      var url = new URL(value);
      return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
    } catch (error) { return null; }
  }

  function text(value, fallback) { return typeof value === "string" && value.trim() ? value.trim() : fallback; }

  function setHeader(snapshot) {
    document.getElementById("current-date").textContent = formatDate(new Date(), { weekday: "short", day: "2-digit", month: "short", year: "numeric" });
    var updated = formatDate(snapshot && snapshot.lastSuccessfulRefreshAt, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false, timeZoneName: "short" });
    document.getElementById("last-updated").textContent = updated ? "Updated " + updated : "Updated — unavailable";
  }

  function renderNav() {
    nav.textContent = "";
    categories.forEach(function (category) {
      var button = document.createElement("button");
      button.type = "button";
      button.className = category === activeCategory ? "is-active" : "";
      button.setAttribute("aria-pressed", String(category === activeCategory));
      button.textContent = category;
      button.addEventListener("click", function () { activeCategory = category; renderNav(); renderArticles(); });
      nav.appendChild(button);
    });
  }

  function sourceAction(type) {
    var value = String(type || "").toLowerCase();
    if (value.indexOf("paper") >= 0 || value.indexOf("research") >= 0) return "Read Research Paper";
    if (value.indexOf("documentation") >= 0 || value.indexOf("release") >= 0) return "Read Documentation";
    if (value.indexOf("announcement") >= 0 || value.indexOf("official") >= 0) return "Read Official Announcement";
    if (value.indexOf("repository") >= 0) return "View Repository";
    return "Read Full Article";
  }

  function renderArticles() {
    list.textContent = "";
    var visible = articles.filter(function (article) { return activeCategory === "All" || article.category === activeCategory; });
    if (!visible.length) {
      status.className = "feed-status is-visible";
      status.textContent = activeCategory === "All" ? "No published articles are available yet." : "No articles are available in this category.";
      return;
    }
    status.className = "feed-status is-hidden";
    visible.forEach(function (article) {
      var url = safeUrl(article.url);
      if (!url) return;
      var item = document.createElement("article");
      item.className = "article";

      var meta = document.createElement("p");
      meta.className = "article-meta";
      meta.textContent = text(article.category, "Research").toUpperCase() + "   ·   " + (formatDate(article.publishedAt, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false }) || "Time unavailable");

      var content = document.createElement("div");
      content.className = "article-content";
      var title = document.createElement("h2");
      title.textContent = text(article.title, "Untitled article");
      var description = document.createElement("p");
      description.className = "article-description";
      description.textContent = text(article.description, "The original source provides no summary. Read the source for details.");
      var attribution = document.createElement("p");
      attribution.className = "attribution";
      attribution.textContent = "Source: " + text(article.sourceName, "Unknown source") + "   |   " + text(article.sourceType, "Original source");
      content.appendChild(title); content.appendChild(description); content.appendChild(attribution);

      var action = document.createElement("a");
      action.className = "source-action";
      action.href = url; action.target = "_blank"; action.rel = "noopener noreferrer";
      action.textContent = sourceAction(article.sourceType) + "  →";
      item.appendChild(meta); item.appendChild(content); item.appendChild(action); list.appendChild(item);
    });
  }

  function showError(message) {
    articles = [];
    setHeader(null); renderNav(); status.className = "feed-status is-visible"; status.textContent = message; list.textContent = "";
  }

  function loadSnapshot() {
    fetch(snapshotPath, { cache: "no-store", headers: { Accept: "application/json" } })
      .then(function (response) { if (!response.ok) throw new Error("Snapshot unavailable"); return response.json(); })
      .then(function (snapshot) {
        if (!snapshot || !Array.isArray(snapshot.articles)) throw new Error("Snapshot schema is invalid");
        articles = snapshot.articles.filter(function (article) { return article && safeUrl(article.url) && typeof article.title === "string"; });
        setHeader(snapshot); renderNav(); renderArticles();
      })
      .catch(function () { showError("The published edition is unavailable right now. Please try again later."); });
  }

  initializeTheme();
  setHeader(null); renderNav(); loadSnapshot();
}());
