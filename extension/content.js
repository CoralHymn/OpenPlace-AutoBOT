/* global chrome */
// content.js - WPlace AutoBOT Floating Panel
// Injects a draggable floating bot selector into wp.1515810.xyz

(function () {
  "use strict";
  if (window.location.hostname !== "wp.1515810.xyz") return;
  if (document.getElementById("wplace-autobot-panel")) return;

  // ── State ──
  var panelEl = null;
  var toggleEl = null;
  var isDragging = false;
  var dragStartX = 0, dragStartY = 0;
  var panelStartX = 0, panelStartY = 0;
  var executingBot = null;

  // ── Inject Styles ──
  var style = document.createElement("style");
  style.id = "wplace-autobot-styles";
  style.textContent = [
    "#wplace-autobot-panel {",
    "  position:fixed; top:80px; right:20px; z-index:999999; width:300px;",
    "  background:linear-gradient(160deg,#0f0c29 0%,#302b63 50%,#24243e 100%);",
    "  border-radius:14px; border:1px solid rgba(255,255,255,0.1);",
    "  box-shadow:0 8px 32px rgba(0,0,0,0.5);",
    "  font-family:-apple-system,BlinkMacSystemFont,\"Microsoft YaHei\",\"Segoe UI\",Roboto,sans-serif;",
    "  color:#e0e0e0; overflow:hidden; user-select:none;",
    "}",
    ".wpab-header {",
    "  display:flex; align-items:center; gap:8px; padding:10px 14px;",
    "  background:rgba(255,255,255,0.03); cursor:grab;",
    "  border-bottom:1px solid rgba(255,255,255,0.06);",
    "}",
    ".wpab-header:active { cursor:grabbing; }",
    ".wpab-header .wpab-logo { font-size:18px; line-height:1; }",
    ".wpab-header .wpab-title {",
    "  flex:1; margin:0; font-size:13px; font-weight:600; color:#fff; letter-spacing:0.3px;",
    "}",
    ".wpab-header .wpab-close {",
    "  width:26px; height:26px; border:none; background:rgba(255,255,255,0.06);",
    "  color:#aaa; border-radius:7px; cursor:pointer; font-size:14px; line-height:1;",
    "  display:flex; align-items:center; justify-content:center; transition:all 0.2s;",
    "  touch-action:manipulation;",
    "}",
    ".wpab-header .wpab-close:hover { background:rgba(244,67,54,0.3); color:#f44336; }",
    ".wpab-body {",
    "  padding:8px 12px; display:flex; flex-direction:column; gap:6px;",
    "}",
    ".wpab-card {",
    "  display:flex; align-items:center; gap:10px; padding:9px 11px; border-radius:10px;",
    "  background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.04);",
    "  cursor:pointer; transition:all 0.2s ease; touch-action:manipulation;",
    "}",
    ".wpab-card:hover {",
    "  background:rgba(255,255,255,0.08); border-color:rgba(255,255,255,0.12); transform:translateX(2px);",
    "}",
    ".wpab-card:active { transform:scale(0.98); }",
    ".wpab-card.disabled { opacity:0.35; pointer-events:none; }",
    ".wpab-card.loading { pointer-events:none; }",
    ".wpab-icon {",
    "  width:34px; height:34px; border-radius:9px;",
    "  display:flex; align-items:center; justify-content:center; font-size:16px; flex-shrink:0;",
    "}",
    ".wpab-icon.farm { background:rgba(139,195,74,0.18); }",
    ".wpab-icon.guard { background:rgba(66,165,245,0.18); }",
    ".wpab-icon.image { background:rgba(171,71,188,0.18); }",
    ".wpab-icon.launcher { background:rgba(255,152,0,0.18); }",
    ".wpab-icon.slave { background:rgba(0,188,212,0.18); }",
    ".wpab-info { flex:1; min-width:0; }",
    ".wpab-info .wpab-name { font-size:13px; font-weight:600; color:#fff; }",
    ".wpab-info .wpab-desc { font-size:10px; color:rgba(255,255,255,0.35); margin-top:1px; }",
    ".wpab-footer {",
    "  padding:8px 14px 12px; border-top:1px solid rgba(255,255,255,0.06); text-align:center;",
    "}",
    ".wpab-status { font-size:11px; color:rgba(255,255,255,0.4); min-height:16px; transition:color 0.3s; }",
    ".wpab-status.success { color:#4CAF50; }",
    ".wpab-status.error { color:#f44336; }",
    ".wpab-status.info { color:#42A5F5; }",
    ".wpab-status.warning { color:#FFA726; }",
    /* Toggle button (shown when panel is hidden) */
    "#wplace-autobot-toggle {",
    "  position:fixed; bottom:24px; right:24px; z-index:999998;",
    "  width:48px; height:48px; border-radius:50%; border:none;",
    "  background:linear-gradient(135deg,#302b63,#0f0c29);",
    "  color:#fff; font-size:22px; cursor:grab;",
    "  box-shadow:0 4px 20px rgba(0,0,0,0.5);",
    "  display:flex; align-items:center; justify-content:center;",
    "  transition:transform 0.3s ease; touch-action:none;",
    "  border:1px solid rgba(255,255,255,0.12);",
    "}",
    "#wplace-autobot-toggle:active { cursor:grabbing; transform:scale(1.05); }"
  ].join("\n");
  document.head.appendChild(style);

  // ── Bot config ──
  var BOTS = [
    { id: "farm", name: "Auto-Farm", desc: "\u81ea\u52a8\u50cf\u7d20\u8015\u79cd", icon: "\uD83C\uDF3E", cls: "farm" },
    { id: "guard", name: "Auto-Guard", desc: "\u4fdd\u62a4\u5e76\u4fee\u590d\u50cf\u7d20\u753b", icon: "\uD83D\uDEE1", cls: "guard" },
    { id: "image", name: "Auto-Image", desc: "\u6839\u636e\u56fe\u7247\u81ea\u52a8\u7ed8\u5236", icon: "\uD83D\uDDBC", cls: "image" },
    { id: "launcher", name: "Auto-Launcher", desc: "Bot \u6a21\u5f0f\u9009\u62e9\u5668", icon: "\uD83D\uDE80", cls: "launcher" },
    { id: "slave", name: "Auto-Slave", desc: "\u5206\u5e03\u5f0f\u534f\u4f5c\u7ed8\u5236", icon: "\uD83E\uDD1D", cls: "slave" }
  ];

  // ── Bot Execution ──
  async function executeBot(botName) {
    if (executingBot) return;
    executingBot = botName;

    var statusEl = panelEl.querySelector("#wpab-status");
    var cards = panelEl.querySelectorAll(".wpab-card");
    cards.forEach(function (c) { c.classList.add("disabled"); });

    setStatus("\u6b63\u5728\u542f\u52a8 " + botName + "...", "info");

    try {
      var response = await chrome.runtime.sendMessage({
        action: "executeScript",
        bot: botName
      });

      if (response && response.success) {
        setStatus(botName + " \u542f\u52a8\u6210\u529f", "success");
        // Hide selector after success
        setTimeout(function () {
          hidePanel();
          showToggle();
        }, 1200);
      } else {
        throw new Error((response && response.error) || "\u542f\u52a8\u5931\u8d25");
      }
    } catch (error) {
      setStatus("\u9519\u8bef: " + (error.message || "\u672a\u77e5\u9519\u8bef"), "error");
      executingBot = null;
      cards.forEach(function (c) { c.classList.remove("disabled"); });
      setTimeout(function () {
        setStatus("\u5c31\u7eea \u2014 \u9009\u62e9\u4e00\u4e2a Bot \u542f\u52a8", "");
      }, 3000);
    }
  }

  function setStatus(text, type) {
    var el = panelEl.querySelector("#wpab-status");
    if (!el) return;
    el.textContent = text;
    el.className = "wpab-status";
    if (type) el.classList.add(type);
  }

  // ── Panel Visibility ──
  function hidePanel() {
    panelEl.style.transition = "opacity 0.25s ease, transform 0.25s ease";
    panelEl.style.opacity = "0";
    panelEl.style.transform = "scale(0.9)";
    panelEl.style.pointerEvents = "none";
    setTimeout(function () {
      panelEl.style.display = "none";
    }, 250);
  }

  function showPanel() {
    panelEl.style.display = "";
    panelEl.style.pointerEvents = "";
    // eslint-disable-next-line no-unused-expressions
    panelEl.offsetHeight; // force reflow
    panelEl.style.transition = "opacity 0.25s ease, transform 0.25s ease";
    panelEl.style.opacity = "1";
    panelEl.style.transform = "scale(1)";
    if (toggleEl) toggleEl.style.display = "none";
    // Reset if not executing
    if (!executingBot) {
      setStatus("\u5c31\u7eea \u2014 \u9009\u62e9\u4e00\u4e2a Bot \u542f\u52a8", "");
      panelEl.querySelectorAll(".wpab-card").forEach(function (c) { c.classList.remove("disabled"); });
    }
  }

  // ── Toggle Button ──
  var toggleDragging = false;

  function showToggle() {
    if (!toggleEl) {
      toggleEl = document.createElement("button");
      toggleEl.id = "wplace-autobot-toggle";
      toggleEl.title = "WPlace AutoBOT";
      toggleEl.innerHTML = "\uD83C\uDF83";
      toggleEl.addEventListener("mousedown", toggleStartDrag);
      toggleEl.addEventListener("touchstart", toggleStartDrag, { passive: false });
      toggleEl.addEventListener("click", function (e) {
        if (!toggleDragging) showPanel();
      });
      document.body.appendChild(toggleEl);
    }
    toggleEl.style.display = "";
  }

  function toggleStartDrag(e) {
    toggleDragging = false;
    var clientX = e.touches ? e.touches[0].clientX : e.clientX;
    var clientY = e.touches ? e.touches[0].clientY : e.clientY;
    dragStartX = clientX;
    dragStartY = clientY;
    var rect = toggleEl.getBoundingClientRect();
    panelStartX = rect.left;
    panelStartY = rect.top;
    toggleEl.style.transition = "none";
    toggleEl.style.right = "auto";
    toggleEl.style.bottom = "auto";
    toggleEl.style.left = panelStartX + "px";
    toggleEl.style.top = panelStartY + "px";
    document.addEventListener("mousemove", toggleMoveDrag);
    document.addEventListener("touchmove", toggleMoveDrag, { passive: false });
    document.addEventListener("mouseup", toggleEndDrag);
    document.addEventListener("touchend", toggleEndDrag);
    e.preventDefault();
  }

  function toggleMoveDrag(e) {
    toggleDragging = true;
    var clientX = e.touches ? e.touches[0].clientX : e.clientX;
    var clientY = e.touches ? e.touches[0].clientY : e.clientY;
    var dx = clientX - dragStartX;
    var dy = clientY - dragStartY;
    var newLeft = Math.max(0, Math.min(window.innerWidth - toggleEl.offsetWidth, panelStartX + dx));
    var newTop = Math.max(0, Math.min(window.innerHeight - toggleEl.offsetHeight, panelStartY + dy));
    toggleEl.style.left = newLeft + "px";
    toggleEl.style.top = newTop + "px";
  }

  function toggleEndDrag() {
    toggleEl.style.transition = "";
    document.removeEventListener("mousemove", toggleMoveDrag);
    document.removeEventListener("touchmove", toggleMoveDrag);
    document.removeEventListener("mouseup", toggleEndDrag);
    document.removeEventListener("touchend", toggleEndDrag);
  }

  // ── Drag (Mouse + Touch) ──
  function startDrag(e) {
    if (e.target.closest && e.target.closest(".wpab-close")) return;
    isDragging = true;
    var clientX = e.touches ? e.touches[0].clientX : e.clientX;
    var clientY = e.touches ? e.touches[0].clientY : e.clientY;
    dragStartX = clientX;
    dragStartY = clientY;
    var rect = panelEl.getBoundingClientRect();
    panelStartX = rect.left;
    panelStartY = rect.top;
    panelEl.style.transition = "none";
    panelEl.style.right = "auto";
    panelEl.style.left = panelStartX + "px";
    e.preventDefault();
  }

  function moveDrag(e) {
    if (!isDragging) return;
    var clientX = e.touches ? e.touches[0].clientX : e.clientX;
    var clientY = e.touches ? e.touches[0].clientY : e.clientY;
    var dx = clientX - dragStartX;
    var dy = clientY - dragStartY;
    var newLeft = Math.max(0, Math.min(window.innerWidth - panelEl.offsetWidth, panelStartX + dx));
    var newTop = Math.max(0, Math.min(window.innerHeight - panelEl.offsetHeight, panelStartY + dy));
    panelEl.style.left = newLeft + "px";
    panelEl.style.top = newTop + "px";
  }

  function endDrag() {
    if (!isDragging) return;
    isDragging = false;
    panelEl.style.transition = "";
  }

  // ── Build Panel ──
  function createPanel() {
    panelEl = document.createElement("div");
    panelEl.id = "wplace-autobot-panel";

    // Build cards HTML
    var cardsHtml = BOTS.map(function (b) {
      return [
        "<div class=\"wpab-card\" data-bot=\"" + b.id + "\">",
        "<div class=\"wpab-icon " + b.cls + "\">" + b.icon + "</div>",
        "<div class=\"wpab-info\">",
        "<div class=\"wpab-name\">" + b.name + "</div>",
        "<div class=\"wpab-desc\">" + b.desc + "</div>",
        "</div>",
        "</div>"
      ].join("");
    }).join("");

    panelEl.innerHTML = [
      "<div class=\"wpab-header\" id=\"wpab-header\">",
      "<span class=\"wpab-logo\">\uD83E\uDD16</span>",
      "<span class=\"wpab-title\">骷髅打金服 南瓜BOT</span>",
      "<button class=\"wpab-close\" id=\"wpab-close\" title=\"\u5173\u95ed\">\u2715</button>",
      "</div>",
      "<div class=\"wpab-body\" id=\"wpab-body\">",
      cardsHtml,
      "</div>",
      "<div class=\"wpab-footer\">",
      "<div class=\"wpab-status\" id=\"wpab-status\">\u5c31\u7eea \u2014 \u9009\u62e9\u4e00\u4e2a Bot \u542f\u52a8</div>",
      "</div>"
    ].join("");

    document.body.appendChild(panelEl);

    // Drag bindings
    var header = panelEl.querySelector("#wpab-header");
    header.addEventListener("mousedown", startDrag);
    header.addEventListener("touchstart", startDrag, { passive: false });
    document.addEventListener("mousemove", moveDrag);
    document.addEventListener("touchmove", moveDrag, { passive: false });
    document.addEventListener("mouseup", endDrag);
    document.addEventListener("touchend", endDrag);

    // Close button
    panelEl.querySelector("#wpab-close").addEventListener("click", function () {
      hidePanel();
      showToggle();
    });

    // Bot card clicks
    panelEl.querySelector("#wpab-body").addEventListener("click", function (e) {
      var card = e.target.closest(".wpab-card");
      if (!card || card.classList.contains("disabled")) return;
      var botName = card.dataset.bot;
      if (!botName) return;
      executeBot(botName);
    });
  }

  // ── Listen for show-panel message from popup ──
  chrome.runtime.onMessage.addListener(function (request) {
    if (request && request.action === "showPanel") {
      showPanel();
    }
  });

  // ── Init ──
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", createPanel);
  } else {
    createPanel();
  }
})();
