(function () {
  "use strict";

  var snapshotPath = "data/published.json";
  var allStories = [];
  var activeCategory = "all";

  var todayElement = document.getElementById("today");
  var refreshElement = document.getElementById("last-refresh");
  var categoryNav = document.getElementById("category-nav");
  var storyCount = document.getElementById("story-count");
  var feedStatus = document.getElementById("feed-status");
  var storyList = document.getElementById("story-list");

  function formatDate(value, options) {
    if (!value) return "";
    var date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return new Intl.DateTimeFormat("en-IN", Object.assign({ timeZone: "Asia/Kolkata" }, options)).format(date);
  }

  function setToday() {
    todayElement.textContent = formatDate(new Date(), {
      day: "2-digit",
      month: "long",
      year: "numeric"
    });
  }

  function setRefresh(value) {
    var formatted = formatDate(value, {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZoneName: "short"
    });
    refreshElement.textContent = formatted ? "Last refresh — " + formatted : "Last refresh — unavailable";
  }

  function isSafeUrl(value) {
    try {
      if (typeof value !== "string") return false;
      var url = new URL(value);
      return url.protocol === "https:" || url.protocol === "http:";
    } catch (error) {
      return false;
    }
  }

  function text(value, fallback) {
    return typeof value === "string" && value.trim() ? value.trim() : fallback;
  }

  function normalizeStory(story) {
    if (!story || typeof story !== "object" || !isSafeUrl(story.url)) return null;
    return {
      title: text(story.title, "Untitled story"),
      summary: text(story.summary, "Read the original reporting at the source."),
      source: text(story.source, "Source"),
      category: text(story.category, "General"),
      publishedAt: story.publishedAt,
      readingTime: text(story.readingTime, ""),
      url: story.url
    };
  }

  function getCategories() {
    var categories = [];
    allStories.forEach(function (story) {
      if (categories.indexOf(story.category) === -1) categories.push(story.category);
    });
    return categories.sort(function (a, b) { return a.localeCompare(b); });
  }

  function renderCategories() {
    categoryNav.textContent = "";
    var categories = ["all"].concat(getCategories());
    categories.forEach(function (category) {
      var button = document.createElement("button");
      button.type = "button";
      button.className = "category-button" + (category === activeCategory ? " is-active" : "");
      button.dataset.category = category;
      button.setAttribute("aria-pressed", String(category === activeCategory));
      button.textContent = category === "all" ? "All stories" : category;
      button.addEventListener("click", function () {
        activeCategory = category;
        renderCategories();
        renderStories();
      });
      categoryNav.appendChild(button);
    });
  }

  function visibleStories() {
    return allStories.filter(function (story) {
      return activeCategory === "all" || story.category === activeCategory;
    });
  }

  function storyDate(value) {
    return formatDate(value, { day: "2-digit", month: "short", year: "numeric" }) || "Date unavailable";
  }

  function renderStories() {
    var stories = visibleStories();
    storyList.textContent = "";
    storyCount.textContent = stories.length + (stories.length === 1 ? " story" : " stories");

    if (!stories.length) {
      feedStatus.classList.remove("is-hidden");
      feedStatus.textContent = "";
      var empty = document.createElement("p");
      empty.textContent = activeCategory === "all" ? "There are no published stories in this snapshot yet." : "No stories in this category.";
      feedStatus.appendChild(empty);
      return;
    }

    feedStatus.classList.add("is-hidden");
    stories.forEach(function (story, index) {
      var article = document.createElement("article");
      article.className = "story";

      var indexElement = document.createElement("div");
      indexElement.className = "story__index";
      indexElement.textContent = String(index + 1).padStart(2, "0");

      var body = document.createElement("div");
      var source = document.createElement("p");
      source.className = "story__source";
      source.textContent = story.source;

      var title = document.createElement("h3");
      title.className = "story__title";
      var titleLink = document.createElement("a");
      titleLink.href = story.url;
      titleLink.target = "_blank";
      titleLink.rel = "noopener noreferrer";
      titleLink.textContent = story.title;
      title.appendChild(titleLink);

      var summary = document.createElement("p");
      summary.className = "story__summary";
      summary.textContent = story.summary;
      body.appendChild(source);
      body.appendChild(title);
      body.appendChild(summary);

      var aside = document.createElement("div");
      aside.className = "story__aside";
      var meta = document.createElement("p");
      meta.className = "story__meta";
      meta.textContent = storyDate(story.publishedAt) + (story.readingTime ? "\n" + story.readingTime : "");
      meta.style.whiteSpace = "pre-line";
      var sourceLink = document.createElement("a");
      sourceLink.className = "story__button";
      sourceLink.href = story.url;
      sourceLink.target = "_blank";
      sourceLink.rel = "noopener noreferrer";
      sourceLink.textContent = "Read source ↗";
      aside.appendChild(meta);
      aside.appendChild(sourceLink);

      article.appendChild(indexElement);
      article.appendChild(body);
      article.appendChild(aside);
      storyList.appendChild(article);
    });
  }

  function showUnavailable(message) {
    allStories = [];
    renderCategories();
    storyCount.textContent = "0 stories";
    storyList.textContent = "";
    feedStatus.classList.remove("is-hidden");
    feedStatus.textContent = "";
    var messageElement = document.createElement("p");
    messageElement.textContent = message;
    feedStatus.appendChild(messageElement);
    setRefresh(null);
  }

  function loadSnapshot() {
    fetch(snapshotPath, { headers: { Accept: "application/json" } })
      .then(function (response) {
        if (!response.ok) throw new Error("Snapshot unavailable");
        return response.json();
      })
      .then(function (snapshot) {
        var stories = Array.isArray(snapshot) ? snapshot : snapshot && snapshot.stories;
        if (!Array.isArray(stories)) throw new Error("Snapshot has no stories array");
        allStories = stories.map(normalizeStory).filter(Boolean);
        setRefresh(snapshot && !Array.isArray(snapshot) ? snapshot.lastSuccessfulRefreshAt : null);
        renderCategories();
        renderStories();
      })
      .catch(function () {
        showUnavailable("The published snapshot is unavailable right now. Check back when a new edition is published.");
      });
  }

  setToday();
  loadSnapshot();
}());
