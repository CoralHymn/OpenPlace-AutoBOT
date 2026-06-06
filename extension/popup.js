/* global chrome */
// popup.js - WPlace AutoBOT Popup Controller

document.addEventListener("DOMContentLoaded", () => {
  const statusEl = document.getElementById("status");
  const botList = document.getElementById("botList");

  if (!statusEl || !botList) return;

  let executingBot = null;

  function setStatus(text, type) {
    statusEl.textContent = text;
    statusEl.className = "status";
    if (type) statusEl.classList.add(type);
  }

  // ── Check current page ──────────────────────────────

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (chrome.runtime.lastError || !tabs[0]) {
      setStatus("Error getting active tab", "error");
      disableAll();
      return;
    }

    const tab = tabs[0];
    if (!tab.url || !tab.url.includes("wplace.live")) {
      setStatus("Visit wplace.live to use AutoBOT", "warning");
      disableAll();
      return;
    }

    setStatus("Ready — select a bot to run");
  });

  function disableAll() {
    botList.querySelectorAll(".bot-run").forEach((btn) => {
      btn.disabled = true;
      btn.textContent = "—";
      btn.style.opacity = "0.4";
    });
    botList.querySelectorAll(".bot-card").forEach((c) => {
      c.style.pointerEvents = "none";
      c.style.opacity = "0.6";
    });
  }

  // ── Handle Run button clicks ────────────────────────

  botList.addEventListener("click", async (e) => {
    const runBtn = e.target.closest("[data-action='run']");
    if (!runBtn || runBtn.disabled) return;

    const card = runBtn.closest(".bot-card");
    const botName = card?.dataset.bot;
    if (!botName) return;

    // Prevent double-click
    if (executingBot) return;
    executingBot = botName;

    // Visual feedback
    runBtn.textContent = "⏳";
    runBtn.classList.add("loading");
    card.classList.add("running");
    setStatus(`Launching ${botName}...`, "info");

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

      if (!tab || !tab.url.includes("wplace.live")) {
        throw new Error("Must be on wplace.live");
      }

      const response = await chrome.runtime.sendMessage({
        action: "executeScript",
        bot: botName,
        tabId: tab.id
      });

      if (response && response.success) {
        setStatus(`${botName} launched successfully`, "success");
        runBtn.textContent = "✓";
        runBtn.style.background = "rgba(76,175,80,0.3)";
        runBtn.style.borderColor = "#4CAF50";

        // Close popup after short delay
        setTimeout(() => window.close(), 1500);
      } else {
        throw new Error(response?.error || "Unknown error");
      }
    } catch (error) {
      console.error("[WPlace AutoBOT] Popup error:", error);
      setStatus(`Error: ${error.message}`, "error");
      runBtn.textContent = "▶ Retry";
      runBtn.classList.remove("loading");
      card.classList.remove("running");
      card.classList.add("error");

      setTimeout(() => {
        card.classList.remove("error");
        runBtn.textContent = "▶ Run";
        executingBot = null;
      }, 3000);
    }
  });
});
