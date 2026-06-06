/* global chrome */
// popup.js - WPlace AutoBOT Popup Controller

document.addEventListener("DOMContentLoaded", function () {
  var statusEl = document.getElementById("status");
  var botList = document.getElementById("botList");

  if (!statusEl || !botList) return;

  var executingBot = null;

  function setStatus(text, type) {
    statusEl.textContent = text;
    statusEl.className = "status";
    if (type) statusEl.classList.add(type);
  }

  // Check current page
  chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    if (chrome.runtime.lastError || !tabs[0]) {
      setStatus("Error getting active tab", "error");
      disableAll();
      return;
    }

    var tab = tabs[0];
    if (!tab.url || tab.url.indexOf("wp.1515810.xyz") === -1) {
      setStatus("Visit wp.1515810.xyz to use AutoBOT", "warning");
      disableAll();
      return;
    }

    setStatus("Ready \u2014 select a bot to run");
  });

  function disableAll() {
    botList.querySelectorAll(".bot-run").forEach(function (btn) {
      btn.disabled = true;
      btn.textContent = "\u2014";
      btn.style.opacity = "0.4";
    });
    botList.querySelectorAll(".bot-card").forEach(function (c) {
      c.style.pointerEvents = "none";
      c.style.opacity = "0.6";
    });
  }

  // Handle Run button clicks
  botList.addEventListener("click", function (e) {
    var runBtn = e.target.closest("[data-action='run']");
    if (!runBtn || runBtn.disabled) return;

    var card = runBtn.closest(".bot-card");
    var botName = card ? card.dataset.bot : null;
    if (!botName) return;

    // Prevent double-click
    if (executingBot) return;
    executingBot = botName;

    // Visual feedback
    runBtn.textContent = "\u23f3";
    runBtn.classList.add("loading");
    card.classList.add("running");
    setStatus("Launching " + botName + "...", "info");

    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      var tab = tabs[0];
      if (!tab || tab.url.indexOf("wp.1515810.xyz") === -1) {
        setStatus("Must be on wp.1515810.xyz", "error");
        runBtn.textContent = "\u25b6 Run";
        runBtn.classList.remove("loading");
        card.classList.remove("running");
        executingBot = null;
        return;
      }

      chrome.runtime.sendMessage({
        action: "executeScript",
        bot: botName,
        tabId: tab.id
      }, function (response) {
        if (response && response.success) {
          setStatus(botName + " launched successfully", "success");
          runBtn.textContent = "\u2713";
          runBtn.style.background = "rgba(76,175,80,0.3)";
          runBtn.style.borderColor = "#4CAF50";
          setTimeout(function () { window.close(); }, 1500);
        } else {
          var errMsg = (response && response.error) || "Unknown error";
          setStatus("Error: " + errMsg, "error");
          runBtn.textContent = "\u25b6 Retry";
          runBtn.classList.remove("loading");
          card.classList.remove("running");
          card.classList.add("error");
          setTimeout(function () {
            card.classList.remove("error");
            runBtn.textContent = "\u25b6 Run";
            executingBot = null;
          }, 3000);
        }
      });
    });
  });
});
