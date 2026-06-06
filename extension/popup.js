/* global chrome */
// popup.js - WPlace AutoBOT minimal popup
// Clicking the extension icon shows the floating panel on the page

(function () {
  "use strict";

  chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    var tab = tabs[0];
    if (!tab || !tab.url || tab.url.indexOf("wp.1515810.xyz") === -1) return;

    chrome.tabs.sendMessage(tab.id, { action: "showPanel" }, function () {
      if (chrome.runtime.lastError) {
        // content script not ready yet, that's ok
      }
      window.close();
    });
  });
})();
