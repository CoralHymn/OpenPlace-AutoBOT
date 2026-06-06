/* global chrome */
// popup.js - WPlace AutoBOT

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

  // 检测当前页面
  chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    if (chrome.runtime.lastError || !tabs[0]) {
      setStatus("获取标签页出错", "error");
      disableAll();
      return;
    }
    var tab = tabs[0];
    if (!tab.url || tab.url.indexOf("wp.1515810.xyz") === -1) {
      setStatus("请访问 wp.1515810.xyz 使用 AutoBOT", "warning");
      disableAll();
      return;
    }
    setStatus("就绪 \u2014 选择一个 Bot 启动");
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

  // 点击启动按钮
  botList.addEventListener("click", function (e) {
    var runBtn = e.target.closest("[data-action='run']");
    if (!runBtn || runBtn.disabled) return;

    var card = runBtn.closest(".bot-card");
    var botName = card ? card.dataset.bot : null;
    if (!botName) return;

    if (executingBot) return;
    executingBot = botName;

    runBtn.textContent = "\u23f3";
    runBtn.classList.add("loading");
    card.classList.add("running");
    setStatus("正在启动 " + botName + "...", "info");

    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      var tab = tabs[0];
      if (!tab || tab.url.indexOf("wp.1515810.xyz") === -1) {
        setStatus("请在 wp.1515810.xyz 上运行", "error");
        runBtn.textContent = "\u25b6 启动";
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
          setStatus(botName + " 启动成功", "success");
          runBtn.textContent = "\u2713";
          runBtn.style.background = "rgba(76,175,80,0.3)";
          runBtn.style.borderColor = "#4CAF50";
          setTimeout(function () { window.close(); }, 1500);
        } else {
          var errMsg = (response && response.error) || "未知错误";
          setStatus("错误: " + errMsg, "error");
          runBtn.textContent = "\u25b6 重试";
          runBtn.classList.remove("loading");
          card.classList.remove("running");
          card.classList.add("error");
          setTimeout(function () {
            card.classList.remove("error");
            runBtn.textContent = "\u25b6 启动";
            executingBot = null;
          }, 3000);
        }
      });
    });
  });
});
