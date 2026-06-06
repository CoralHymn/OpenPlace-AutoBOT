/* global chrome */
// background.js - WPlace AutoBOT Service Worker
// Handles bot script injection into wp.1515810.xyz pages

const BOTS = {
  farm: "extension/bots/farm.js",
  guard: "extension/bots/guard.js",
  image: "extension/bots/image.js",
  launcher: "extension/bots/launcher.js",
  slave: "extension/bots/slave.js"
};

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "executeScript") {
    const tabId = request.tabId || sender.tab?.id;

    if (!tabId) {
      sendResponse({ success: false, error: "Could not determine target tab" });
      return;
    }

    (async () => {
      try {
        await injectBot(tabId, request.bot);
        sendResponse({ success: true });
      } catch (error) {
        console.error("[WPlace AutoBOT] Injection error:", error);
        sendResponse({ success: false, error: error.message });
      }
    })();

    return true;
  }

  if (request.action === "getBotList") {
    sendResponse({ bots: Object.keys(BOTS) });
    return;
  }
});

async function injectBot(tabId, botName) {
  if (!BOTS[botName]) {
    throw new Error(`Unknown bot: ${botName}. Available: ${Object.keys(BOTS).join(", ")}`);
  }

  const scriptUrl = chrome.runtime.getURL(BOTS[botName]);
  console.log(`[WPlace AutoBOT] Loading: ${scriptUrl}`);

  const response = await fetch(scriptUrl, { cache: "no-cache" });

  if (!response.ok) {
    throw new Error(`Failed to load bot script (HTTP ${response.status})`);
  }

  const scriptCode = await response.text();
  console.log(`[WPlace AutoBOT] Script loaded: ${scriptCode.length} chars, injecting "${botName}"...`);

  await chrome.scripting.executeScript({
    target: { tabId },
    world: "MAIN",
    func: (code) => {
      const script = document.createElement("script");
      script.textContent = code;
      (document.head || document.documentElement).appendChild(script);
      script.remove();
    },
    args: [scriptCode]
  });

  console.log(`[WPlace AutoBOT] Bot "${botName}" injected successfully`);
}
