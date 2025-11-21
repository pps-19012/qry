import Fuse from './fuse.min.mjs';

// =========================================
// 1. CONSTANTS & ACTIONS
// =========================================

const ACTIONS = [
  // Workspace Management
  { id: 'save-snapshot', type: 'action', title: 'Snapshot this window (Save all tabs)' },
  { id: 'stash-tab', type: 'action', title: 'Stash this tab (Close & Save for later)' },
  { id: 'unstash-all', type: 'action', title: 'Restore all stashed tabs' },
  
  // Window Split Layouts
  { id: 'split-right', type: 'action', title: 'Split View Right (Move tab to right half)' },
  { id: 'split-left', type: 'action', title: 'Split View Left (Move tab to left half)' },
  { id: 'split-bottom', type: 'action', title: 'Split View Bottom (Move tab to bottom half)' },
  { id: 'split-top', type: 'action', title: 'Split View Top (Move tab to top half)' },
  
  // Tab Controls
  { id: 'pin-tab', type: 'action', title: 'Pin this tab' },
  { id: 'mute-tab', type: 'action', title: 'Mute/Unmute this tab' },
  { id: 'duplicate-tab', type: 'action', title: 'Duplicate this tab' },
  { id: 'close-tab', type: 'action', title: 'Close this tab' },
  { id: 'new-tab', type: 'action', title: 'Open a new tab' },
  
  // Browser Utilities
  { id: 'go-to-bookmarks', type: 'action', title: 'Go to Bookmarks' },
  { id: 'go-to-history', type: 'action', title: 'Go to History' },
  { id: 'clear-cache', type: 'action', title: 'Clear Cache' },
  { id: 'open-downloads', type: 'action', title: 'Open Downloads' },
  { id: 'open-extensions', type: 'action', title: 'Open Extensions' },
];


// =========================================
// 2. HELPER FUNCTIONS
// =========================================

// Lazy Injector: Tries to message a tab. If it fails, injects the script and retries.
async function ensureSendMessage(tabId, message) {
  try {
    await chrome.tabs.sendMessage(tabId, message);
  } catch (e) {
    // Script missing. Attempt injection.
    try {
      const tab = await chrome.tabs.get(tabId);
      
      // Skip restricted URLs
      if (!tab.url || tab.url.startsWith("chrome://") || tab.url.startsWith("edge://") || tab.url.startsWith("https://chrome.google.com/webstore")) {
        return;
      }

      await chrome.scripting.insertCSS({ target: { tabId }, files: ["content.css"] });
      await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });

      // Retry after small delay
      setTimeout(() => {
        chrome.tabs.sendMessage(tabId, message).catch(() => {});
      }, 50);
      
    } catch (err) {
      // Tab likely closed or restricted
    }
  }
}

function sortTabsByMRU(tabs) {
  return tabs.sort((a, b) => {
    const indexA = mruTabs.indexOf(a.id);
    const indexB = mruTabs.indexOf(b.id);
    // If not in MRU list, push to end
    if (indexA !== -1 && indexB !== -1) return indexA - indexB;
    if (indexA !== -1) return -1;
    if (indexB !== -1) return 1;
    return 0;
  });
}

function getFavicon(url) {
  // Use Chrome's internal favicon cache
  return `chrome-extension://${chrome.runtime.id}/_favicon/?pageUrl=${encodeURIComponent(url)}&size=32`;
}


// =========================================
// 3. LISTENERS & STATE
// =========================================

let mruTabs = [];

// Track Most Recently Used tabs
chrome.tabs.onActivated.addListener((activeInfo) => {
  mruTabs = mruTabs.filter(id => id !== activeInfo.tabId); 
  mruTabs.unshift(activeInfo.tabId);
  chrome.storage.local.set({ mruTabs });
});

chrome.tabs.onRemoved.addListener((tabId) => {
  mruTabs = mruTabs.filter(id => id !== tabId);
  chrome.storage.local.set({ mruTabs });
});

// Keyboard Shortcut Listener
chrome.commands.onCommand.addListener(async (command) => {
  if (command === "toggle-palette") {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) {
      ensureSendMessage(tab.id, { action: "togglePalette" });
    }
  }
});


// =========================================
// 4. MAIN MESSAGE HANDLER
// =========================================

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  
  // --- A. SEARCH LOGIC ---
  if (request.action === "search") {
    const term = request.term.toLowerCase();
    const activeTabId = sender.tab ? sender.tab.id : null;
    let mode = "tab";
    let query = term;

    // Parse Query Prefixes
    if (term.startsWith('>')) { mode = 'action'; query = term.substring(1).trim(); } 
    else if (term.startsWith(':b')) { mode = 'bookmark'; query = term.substring(2).trim(); } 
    else if (term.startsWith(':h')) { mode = 'history'; query = term.substring(2).trim(); } 
    else if (term.startsWith(':t')) { mode = 'tab'; query = term.substring(2).trim(); }
    
    // 1. Actions Mode
    if (mode === 'action') {
      // Special check to keep "Snapshot" option visible while typing a name
      if (query.startsWith('snapshot') || query.startsWith('save-snapshot')) {
         const snapshotAction = ACTIONS.find(a => a.id === 'save-snapshot');
         sendResponse([snapshotAction]); return false;
      }
      
      let actions = ACTIONS;
      if (query) {
        const fuse = new Fuse(ACTIONS, { keys: ['title'] });
        actions = fuse.search(query).map(r => r.item);
      }
      sendResponse(actions);
      return false;
    }

    // 2. Tab Mode (Includes Stash & Snapshots)
    if (mode === 'tab') {
      chrome.tabs.query({}, (allTabs) => {
        chrome.storage.local.get(["stashedTabs", "snapshots"], (data) => {
          const stashedTabs = data.stashedTabs || [];
          const snapshots = data.snapshots || [];
          const otherTabs = allTabs.filter(tab => tab.id !== activeTabId);
          
          let results = [];

          if (query) {
            // Search everything combined
            const combined = [
              ...otherTabs.map(t => ({...t, type: 'tab'})), 
              ...stashedTabs.map(t => ({...t, type: 'stash'})), 
              ...snapshots.map(s => ({...s, type: 'snapshot'}))
            ];
            const fuse = new Fuse(combined, { keys: ['title', 'url'] });
            results = fuse.search(query).map(r => r.item);
          } else {
            // Default hierarchy: Snapshots -> Stash -> Recent Tabs
            const sortedOpenTabs = sortTabsByMRU(otherTabs).map(t => ({...t, type: 'tab'}));
            results = [
              ...snapshots.map(s => ({...s, type: 'snapshot'})), 
              ...stashedTabs.map(t => ({...t, type: 'stash'})), 
              ...sortedOpenTabs
            ];
          }
          
          // Normalize Response
          const finalResponse = results.map(item => ({
            type: item.type, 
            id: item.id, 
            title: item.title,
            url: item.type === 'snapshot' ? `${item.tabCount} tabs` : item.url,
            favIconUrl: item.favIconUrl || item.url, 
            tabUrls: item.tabUrls 
          }));
          sendResponse(finalResponse);
        });
      });
      return true; // Async response
    }
    
    // 3. Bookmarks Mode
    if (mode === 'bookmark') {
       const processBookmarks = (bookmarks) => {
        let items = bookmarks.map(b => ({...b, type: 'bookmark'})).filter(b => b.url);
        if (query) { 
          const fuse = new Fuse(items, { keys: ['title', 'url'] }); 
          items = fuse.search(query).map(r => r.item); 
        }
        sendResponse(items.map(b => ({ 
          type: 'bookmark', id: b.id, title: b.title, url: b.url, favIconUrl: getFavicon(b.url) 
        })));
      };
      if (query === "") chrome.bookmarks.getRecent(100, processBookmarks); 
      else chrome.bookmarks.search(query, processBookmarks);
      return true;
    }

    // 4. History Mode
    if (mode === 'history') {
       chrome.history.search({ text: query, maxResults: 50 }, (historyItems) => {
        const results = historyItems.map(h => ({ 
          type: 'history', id: h.id, title: h.title || h.url, url: h.url, favIconUrl: getFavicon(h.url) 
        }));
        sendResponse(results);
      });
      return true;
    }
    return true;
  }

  // --- B. DELETE LOGIC ---
  if (request.action === "deleteItem") {
    const item = request.item;
    const storageKey = item.type === 'snapshot' ? "snapshots" : "stashedTabs";
    
    chrome.storage.local.get(storageKey, (data) => {
      let list = data[storageKey] || [];
      // Filter out the item (by ID or URL)
      list = list.filter(i => (item.type === 'snapshot' ? i.id !== item.id : i.url !== item.url));
      chrome.storage.local.set({ [storageKey]: list });
    });
    return;
  }
  
  // --- C. SELECTION / EXECUTION LOGIC ---
  if (request.action === "selectItem") {
    const item = request.item;
    const rawQuery = request.query || "";
    const screen = request.screen || { width: 1920, height: 1080 }; 

    // 1. Handle Actions
    if (item.type === 'action') {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const activeTab = tabs[0];
        if (!activeTab) return;

        switch (item.id) {
          // Split View
          case 'split-right': splitWindow(activeTab, screen, 'right'); break;
          case 'split-left':  splitWindow(activeTab, screen, 'left'); break;
          case 'split-top':   splitWindow(activeTab, screen, 'top'); break;
          case 'split-bottom': splitWindow(activeTab, screen, 'bottom'); break;

          // Snapshots
          case 'save-snapshot':
             chrome.tabs.query({ currentWindow: true }, (windowTabs) => {
              let customName = rawQuery.replace(/^> ?(save-snapshot|snapshot) ?/i, '').trim();
              const timeStr = new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
              const name = customName ? customName : `Snapshot ${timeStr}`;
              
              const snapshot = {
                id: Date.now(), type: 'snapshot', title: name,
                tabCount: windowTabs.length, tabUrls: windowTabs.map(t => t.url),
                favIconUrl: activeTab.favIconUrl
              };
              saveToStorage('snapshots', snapshot);
            });
            break;

          // Stash
          case 'stash-tab':
            saveToStorage('stashedTabs', { 
              id: Date.now(), title: activeTab.title, url: activeTab.url, favIconUrl: activeTab.favIconUrl 
            });
            chrome.tabs.remove(activeTab.id);
            break;

          case 'unstash-all':
             chrome.storage.local.get("stashedTabs", (data) => {
               const stash = data.stashedTabs || [];
               stash.forEach(t => chrome.tabs.create({ url: t.url, active: false }));
               chrome.storage.local.set({ stashedTabs: [] });
             });
             break;

          // Basic Tab Ops
          case 'pin-tab': chrome.tabs.update(activeTab.id, { pinned: !activeTab.pinned }); break;
          case 'mute-tab': chrome.tabs.update(activeTab.id, { muted: !activeTab.mutedInfo.muted }); break;
          case 'duplicate-tab': chrome.tabs.duplicate(activeTab.id); break;
          case 'close-tab': chrome.tabs.remove(activeTab.id); break;
          case 'new-tab': chrome.tabs.create({ active: true }); break;
          
          // Nav
          case 'go-to-bookmarks': chrome.tabs.create({ url: 'chrome://bookmarks' }); break;
          case 'go-to-history': chrome.tabs.create({ url: 'chrome://history' }); break;
          case 'clear-cache': chrome.browsingData.removeCache({}); break;
          case 'open-downloads': chrome.tabs.create({ url: 'chrome://downloads' }); break;
          case 'open-extensions': chrome.tabs.create({ url: 'chrome://extensions' }); break;
        }
      });
      
    // 2. Handle Restore Snapshot
    } else if (item.type === 'snapshot') {
      chrome.windows.create({ url: item.tabUrls });

    // 3. Handle Restore Stash
    } else if (item.type === 'stash') {
      chrome.tabs.create({ url: item.url, active: true });
      // Remove from stash
      chrome.storage.local.get("stashedTabs", (data) => {
        let stash = data.stashedTabs || [];
        stash = stash.filter(t => t.url !== item.url);
        chrome.storage.local.set({ stashedTabs: stash });
      });

    // 4. Handle Tab Switch
    } else if (item.type === 'tab') {
      chrome.tabs.update(item.id, { active: true }, (updatedTab) => {
        if (updatedTab && updatedTab.windowId) {
            chrome.windows.update(updatedTab.windowId, { focused: true });
        }
      });

    // 5. Handle History/Bookmark
    } else {
      chrome.tabs.create({ url: item.url, active: true });
    }
    
    // Clear search & close palette
    chrome.storage.local.set({ globalSearchTerm: "" });
    closeAllPalettes();
  }
  
  if (request.action === "closePalette") {
    closeAllPalettes();
  }
});


// =========================================
// 5. UTILITY HELPERS
// =========================================

function saveToStorage(key, item) {
  chrome.storage.local.get(key, (data) => {
    const list = data[key] || [];
    list.unshift(item);
    chrome.storage.local.set({ [key]: list });
  });
}

function closeAllPalettes() {
  chrome.tabs.query({}, (tabs) => {
    for (const tab of tabs) {
      chrome.tabs.sendMessage(tab.id, { action: "closePalette" }).catch(() => {});
    }
  });
}

function splitWindow(tab, screen, direction) {
  chrome.windows.getCurrent((win) => {
    let w = screen.width, h = screen.height, l = 0, t = 0;
    let w2 = w, h2 = h, l2 = 0, t2 = 0;

    if (direction === 'right') { w = w2 = w/2; l2 = w/2; }
    if (direction === 'left')  { w = w2 = w/2; l = w/2; } // Swap logic for current window
    if (direction === 'top')   { h = h2 = h/2; t = h/2; }
    if (direction === 'bottom'){ h = h2 = h/2; t2 = h/2; }

    // Resize current
    chrome.windows.update(win.id, { left: Math.floor(l), top: Math.floor(t), width: Math.floor(w), height: Math.floor(h) });
    // Create new
    chrome.windows.create({ tabId: tab.id, left: Math.floor(l2), top: Math.floor(t2), width: Math.floor(w2), height: Math.floor(h2) });
  });
}

// Backup: Auto-Inject on Install
chrome.runtime.onInstalled.addListener(async () => {
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    if (tab.url && !tab.url.startsWith("chrome://") && !tab.url.startsWith("https://chrome.google.com")) {
      try {
        await chrome.scripting.insertCSS({ target: { tabId: tab.id }, files: ["content.css"] });
        await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"] });
      } catch(e) {}
    }
  }
});