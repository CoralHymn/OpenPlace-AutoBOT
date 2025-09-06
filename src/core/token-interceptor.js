/* eslint-env browser */
/* global FormData, URLSearchParams, TextDecoder, Blob, navigator, chrome */
import { log } from "./logger.js";

// ========================================
// ENHANCED TOKEN INTERCEPTOR
// ========================================

// Configuration
let ENABLED = true;
let BLOCK_ORIGINAL_REQUESTS = false; // Set to true to block original requests

// State tracking
let _interceptorInitialized = false;

// Helper function to check if URL is a target pixel endpoint
function isTargetPixelEndpoint(url) {
  if (typeof url !== 'string') return false;
  
  try {
    // Check if URL starts with https://backend.wplace.live and contains /s0/pixel/
    if (url.startsWith('https://backend.wplace.live') && url.includes('/s0/pixel/')) {
      return true;
    }
    
    // Also support relative URLs
    const URLCtor = (typeof window !== 'undefined' && window.URL) ? window.URL : null;
    if (URLCtor) {
      const fullUrl = url.startsWith('http') ? url : new URLCtor(url, window.location.origin).href;
      return fullUrl.startsWith('https://backend.wplace.live') && fullUrl.includes('/s0/pixel/');
    }
    
    return false;
  } catch {
    return false;
  }
}

// Extract worldX and worldY from URL
function extractWorldCoordinates(url) {
  try {
    // Pattern: /s0/pixel/{worldX}/{worldY}
    const match = url.match(/\/s0\/pixel\/(\d+)\/(\d+)/);
    if (match) {
      return {
        worldX: parseInt(match[1], 10),
        worldY: parseInt(match[2], 10)
      };
    }
  } catch {
    // Ignore errors
  }
  return { worldX: null, worldY: null };
}

// Decode body data to extract token and fp
function decodeBodyData(body) {
  const result = { token: null, fp: null };
  
  if (!body) return result;
  
  try {
    let bodyText = '';
    
    // Handle different body types
    if (typeof body === 'string') {
      bodyText = body;
    } else if (typeof FormData !== 'undefined' && body instanceof FormData) {
      // Convert FormData to URLSearchParams-like string
      if (typeof URLSearchParams !== 'undefined') {
        const params = new URLSearchParams();
        for (const [key, value] of body.entries()) {
          params.append(key, value);
        }
        bodyText = params.toString();
      }
    } else if (typeof URLSearchParams !== 'undefined' && body instanceof URLSearchParams) {
      bodyText = body.toString();
    } else if (body instanceof ArrayBuffer) {
      if (typeof TextDecoder !== 'undefined') {
        bodyText = new TextDecoder().decode(body);
      }
    } else if (typeof Blob !== 'undefined' && body instanceof Blob) {
      // For Blob, we can't synchronously read it, so skip
      return result;
    } else {
      // Try to stringify other types
      bodyText = String(body);
    }
    
    // Try to parse as JSON first
    try {
      const jsonData = JSON.parse(bodyText);
      result.token = jsonData.t || jsonData.token || null;
      result.fp = jsonData.fp || null;
      return result;
    } catch {
      // Not JSON, try URLSearchParams
      if (typeof URLSearchParams !== 'undefined') {
        try {
          const params = new URLSearchParams(bodyText);
          result.token = params.get('t') || params.get('token') || null;
          result.fp = params.get('fp') || null;
          return result;
        } catch {
          // Neither JSON nor URLSearchParams format
        }
      }
    }
  } catch {
    // Ignore all parsing errors
  }
  
  return result;
}

// Extract x-pawtect-token from headers
function extractPawtectToken(headers) {
  if (!headers) return null;
  
  try {
    // Handle Headers object
    if (typeof headers.get === 'function') {
      return headers.get('x-pawtect-token');
    }
    
    // Handle array format [[key, value], ...]
    if (Array.isArray(headers)) {
      const found = headers.find(([key]) => 
        String(key).toLowerCase() === 'x-pawtect-token'
      );
      return found ? found[1] : null;
    }
    
    // Handle plain object
    if (typeof headers === 'object') {
      for (const [key, value] of Object.entries(headers)) {
        if (key.toLowerCase() === 'x-pawtect-token') {
          return value;
        }
      }
    }
  } catch {
    // Ignore errors
  }
  
  return null;
}

// Post token data via postMessage
function postToken(token, worldX, worldY, xpaw, fp) {
  // Validate inputs
  const validToken = (typeof token === 'string' && token.length > 0) ? token : null;
  const validXpaw = (typeof xpaw === 'string' && xpaw.length > 0) ? xpaw : null;
  const validFp = (typeof fp === 'string' && fp.length > 0) ? fp : null;
  const validWorldX = (typeof worldX === 'number' && worldX >= 0) ? worldX : null;
  const validWorldY = (typeof worldY === 'number' && worldY >= 0) ? worldY : null;
  
  // Only post if we have at least one valid piece of data
  if (validToken || validXpaw || validFp) {
    const message = {
      __wplace: true,
      type: 'token_found',
      token: validToken,
      xpaw: validXpaw,
      fp: validFp,
      worldX: validWorldX,
      worldY: validWorldY,
      timestamp: Date.now()
    };
    
    // Log removed for security - token data posting
    window.postMessage(message, '*');
  }
}

// ========================================
// FETCH INTERCEPTOR
// ========================================

function interceptFetch() {
  if (window.__WPA_FETCH_INTERCEPTED__) return;
  window.__WPA_FETCH_INTERCEPTED__ = true;
  
  const originalFetch = window.fetch;
  
  window.fetch = async function(...args) {
    const input = args[0];
    const init = args[1] || {};
    
    // Get URL from input (can be string or Request object)
    const url = (input instanceof Request) ? input.url : String(input);
    
    // Check if this is a target endpoint
    if (ENABLED && isTargetPixelEndpoint(url)) {
      const { worldX, worldY } = extractWorldCoordinates(url);
      
      // Extract data from body
      let body = init.body;
      if (!body && input instanceof Request) {
        // Try to get body from Request object (note: this might not work if body was already consumed)
        try {
          body = await input.text();
        } catch {
          // Body already consumed or not available
        }
      }
      
      const { token, fp } = decodeBodyData(body);
      
      // Extract x-pawtect-token from headers
      let headers = init.headers;
      if (!headers && input instanceof Request) {
        headers = input.headers;
      }
      const xpaw = extractPawtectToken(headers);
      
      // Post the intercepted data
      postToken(token, worldX, worldY, xpaw, fp);
      
      // Optionally block the original request
      if (BLOCK_ORIGINAL_REQUESTS) {
        log('🚫 Blocking original fetch request');
        return new Response(null, { status: 204 });
      }
    }
    
    // Call original fetch
    return originalFetch.apply(this, args);
  };
  
  log('✅ Fetch interceptor installed');
}

// ========================================
// XMLHttpRequest INTERCEPTOR
// ========================================

function interceptXMLHttpRequest() {
  if (window.__WPA_XHR_INTERCEPTED__) return;
  window.__WPA_XHR_INTERCEPTED__ = true;
  
  const OriginalXHR = window.XMLHttpRequest;
  
  window.XMLHttpRequest = function() {
    const xhr = new OriginalXHR();
    
    // Store original methods
    const originalOpen = xhr.open;
    const originalSetRequestHeader = xhr.setRequestHeader;
    const originalSend = xhr.send;
    
    // State tracking for this XHR instance
    let lastUrl = null;
    xhr.__xpaw = null;
    
    // Intercept open method
    xhr.open = function(method, url, ...args) {
      lastUrl = String(url);
      return originalOpen.call(this, method, url, ...args);
    };
    
    // Intercept setRequestHeader method
    xhr.setRequestHeader = function(name, value) {
      if (String(name).toLowerCase() === 'x-pawtect-token') {
        xhr.__xpaw = String(value);
      }
      return originalSetRequestHeader.call(this, name, value);
    };
    
    // Intercept send method
    xhr.send = function(body) {
      if (ENABLED && lastUrl && isTargetPixelEndpoint(lastUrl)) {
        const { worldX, worldY } = extractWorldCoordinates(lastUrl);
        const { token, fp } = decodeBodyData(body);
        const xpaw = xhr.__xpaw;
        
        // Post the intercepted data
        postToken(token, worldX, worldY, xpaw, fp);
      }
      
      return originalSend.call(this, body);
    };
    
    return xhr;
  };
  
  // Copy static properties
  for (const prop in OriginalXHR) {
    if (Object.prototype.hasOwnProperty.call(OriginalXHR, prop)) {
      window.XMLHttpRequest[prop] = OriginalXHR[prop];
    }
  }
  
  log('✅ XMLHttpRequest interceptor installed');
}

// ========================================
// SENDBEACON INTERCEPTOR
// ========================================

function interceptSendBeacon() {
  if (typeof navigator === 'undefined' || !navigator.sendBeacon || window.__WPA_BEACON_INTERCEPTED__) return;
  window.__WPA_BEACON_INTERCEPTED__ = true;
  
  const originalSendBeacon = navigator.sendBeacon;
  
  navigator.sendBeacon = function(url, data) {
    if (ENABLED && isTargetPixelEndpoint(url)) {
      const { worldX, worldY } = extractWorldCoordinates(url);
      const { token, fp } = decodeBodyData(data);
      
      // sendBeacon doesn't support custom headers, so xpaw is null
      postToken(token, worldX, worldY, null, fp);
    }
    
    return originalSendBeacon.call(this, url, data);
  };
  
  log('✅ sendBeacon interceptor installed');
}

// ========================================
// CONTENT SCRIPT MESSAGE HANDLER
// ========================================

function setupContentScriptHandler() {
  // Listen for token messages and forward to background script
  window.addEventListener('message', (event) => {
    const data = event?.data;
    
    if (data && data.__wplace === true && data.type === 'token_found') {
      // Forward to background script if chrome.runtime is available
      if (typeof chrome !== 'undefined' && chrome?.runtime?.sendMessage) {
        try {
          chrome.runtime.sendMessage({
            type: 'wplace_token_intercepted',
            token: data.token,
            xpaw: data.xpaw,
            fp: data.fp,
            worldX: data.worldX,
            worldY: data.worldY,
            timestamp: data.timestamp,
            url: window.location.href
          });
          log('📤 Token data forwarded to background script');
        } catch (error) {
          log('❌ Failed to forward to background script:', error);
        }
      }
    }
  });
  
  log('✅ Content script message handler installed');
}

// ========================================
// PUBLIC API
// ========================================

// Initialize all interceptors
export function initializeTokenInterceptor(options = {}) {
  if (_interceptorInitialized) {
    log('⚠️ Token interceptor already initialized');
    return;
  }
  
  // Apply options
  if (typeof options.enabled === 'boolean') {
    ENABLED = options.enabled;
  }
  if (typeof options.blockOriginalRequests === 'boolean') {
    BLOCK_ORIGINAL_REQUESTS = options.blockOriginalRequests;
  }
  
  log('🚀 Initializing enhanced token interceptor...');
  
  // Install all interceptors
  interceptFetch();
  interceptXMLHttpRequest();
  interceptSendBeacon();
  setupContentScriptHandler();
  
  _interceptorInitialized = true;
  log('✅ Enhanced token interceptor initialized successfully');
}

// Enable/disable interceptor
export function setInterceptorEnabled(enabled) {
  ENABLED = !!enabled;
  log(`🔧 Token interceptor ${ENABLED ? 'enabled' : 'disabled'}`);
}

// Enable/disable request blocking
export function setRequestBlocking(block) {
  BLOCK_ORIGINAL_REQUESTS = !!block;
  log(`🔧 Request blocking ${BLOCK_ORIGINAL_REQUESTS ? 'enabled' : 'disabled'}`);
}

// Get current status
export function getInterceptorStatus() {
  return {
    initialized: _interceptorInitialized,
    enabled: ENABLED,
    blockingRequests: BLOCK_ORIGINAL_REQUESTS
  };
}

// Manual token posting (for external use)
export function manualPostToken(token, worldX, worldY, xpaw, fp) {
  postToken(token, worldX, worldY, xpaw, fp);
}

// Auto-initialize if not in a module context
if (typeof window !== 'undefined' && !window.__WPA_TOKEN_INTERCEPTOR_MANUAL__) {
  // Auto-initialize with default settings
  setTimeout(() => {
    if (!_interceptorInitialized) {
      initializeTokenInterceptor();
    }
  }, 100);
}