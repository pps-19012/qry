// =========================================
// 1. INITIALIZATION & CLEANUP
// =========================================

// Prevent "Zombie" instances on reload by removing existing iframes
(function cleanupOldVersions() {
  const existing = document.getElementById("context-palette-iframe");
  if (existing) existing.remove();
})();

let iframe = null;
const iframeId = "context-palette-iframe";
const BASE_WIDTH = 600;
const BASE_HEIGHT = 400;


// =========================================
// 2. DOM MANIPULATION
// =========================================

// Resize the iframe based on the user's zoom setting (1.0 to 1.5)
function applySize(scale) {
  if (!iframe) return;
  const s = parseFloat(scale) || 1.0;
  
  // Calculate dimensions based on base size
  const newWidth = Math.round(BASE_WIDTH * s);
  const newHeight = Math.round(BASE_HEIGHT * s);

  iframe.style.width = newWidth + "px";
  iframe.style.height = newHeight + "px";
}

function createIframe() {
  iframe = document.createElement("iframe");
  iframe.id = iframeId;
  iframe.src = chrome.runtime.getURL("palette.html");
  iframe.style.display = "none"; 
  document.body.appendChild(iframe);
}

function showPalette() {
  if (!iframe) createIframe();
  
  // Fetch latest scale setting before showing to prevent visual jumps
  chrome.storage.local.get("settings", (data) => {
    if (data.settings && data.settings.scale) {
      applySize(data.settings.scale);
    }
    iframe.style.display = "block"; 
  });
}

function hidePalette() {
  if (iframe) {
    iframe.remove(); // Completely remove to reset state next time
    iframe = null;
  }
}


// =========================================
// 3. MESSAGE LISTENERS
// =========================================

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  
  if (request.action === "togglePalette") {
    if (iframe) hidePalette();
    else showPalette();
  } 
  
  else if (request.action === "closePalette") {
    hidePalette();
  }
  
  // Real-time resize (Received while dragging settings slider)
  else if (request.action === "resizeIframe") {
    applySize(request.scale);
  }
});