// =========================================
// 1. DOM ELEMENTS & STATE
// =========================================
const searchInput = document.getElementById("search-input");
const resultsList = document.getElementById("results-list");
const settingsBtn = document.getElementById("settings-btn");
const settingsView = document.getElementById("settings-view");
const saveSettingsBtn = document.getElementById("save-settings-btn");

// Slider UI
const opacitySlider = document.getElementById("opacity-slider");
const opacityVal = document.getElementById("opacity-val");
const scaleSlider = document.getElementById("scale-slider");
const scaleVal = document.getElementById("scale-val");

let currentResults = [];
let selectedIndex = 0;

// Default user settings
const DEFAULTS = { 
  theme: 'chrome-dark', 
  accent: '#fe8017', 
  density: 'comfortable',
  opacity: '1.0',
  scale: '1.0'
};


// =========================================
// 2. VISUAL SETTINGS LOGIC
// =========================================

// Applies theme, scale, opacity to the DOM
function applySettings(settings) {
  const body = document.body;
  const root = document.documentElement;
  
  // Clear old themes
  body.classList.remove('theme-chrome-dark', 'theme-chrome-light', 'theme-vscode', 'theme-gruvbox', 'theme-dracula', 'theme-apple', 'compact');
  
  // Apply new theme
  body.classList.add(`theme-${settings.theme}`);
  
  // Apply density
  if (settings.density === 'compact') body.classList.add('compact');
  
  // Apply variables
  root.style.setProperty('--accent-color', settings.accent);
  root.style.opacity = settings.opacity;
  document.body.style.zoom = settings.scale;
}

// Switches between Search List and Settings Form
function toggleSettingsView() {
  const isSettingsOpen = !settingsView.classList.contains('hidden');
  
  if (isSettingsOpen) {
    settingsView.classList.add('hidden');
    resultsList.classList.remove('hidden');
    searchInput.focus();
  } else {
    resultsList.classList.add('hidden');
    settingsView.classList.remove('hidden');
    
    // Load current settings into form
    chrome.storage.local.get("settings", (data) => {
      const s = Object.assign({}, DEFAULTS, data.settings);
      
      const themeSelect = document.getElementById("theme-select");
      if (themeSelect) themeSelect.value = s.theme;

      document.querySelectorAll(`input[name="density"][value="${s.density}"]`).forEach(el => el.checked = true);
      document.querySelectorAll(`input[name="accent"][value="${s.accent}"]`).forEach(el => el.checked = true);
      
      if (opacitySlider) {
        opacitySlider.value = s.opacity;
        opacityVal.textContent = Math.round(s.opacity * 100) + "%";
      }
      if (scaleSlider) {
        scaleSlider.value = s.scale;
        scaleVal.textContent = Math.round(s.scale * 100) + "%";
      }
    });
  }
}

// Live preview for sliders
if (opacitySlider) {
  opacitySlider.addEventListener('input', (e) => {
    opacityVal.textContent = Math.round(e.target.value * 100) + "%";
    document.documentElement.style.opacity = e.target.value;
  });
}
if (scaleSlider) {
  scaleSlider.addEventListener('input', (e) => {
    const val = e.target.value;
    scaleVal.textContent = Math.round(val * 100) + "%";
    document.body.style.zoom = val;
    
    // Message content.js to resize iframe container
    chrome.runtime.sendMessage({ action: "resizeIframe", scale: val });
  });
}


// =========================================
// 3. INITIALIZATION
// =========================================

document.addEventListener("DOMContentLoaded", () => {
  loadAndInitialize();

  // Gear Button Click
  if (settingsBtn) settingsBtn.addEventListener('click', toggleSettingsView);

  // Save Button Click
  if (saveSettingsBtn) {
    saveSettingsBtn.addEventListener('click', () => {
      const theme = document.getElementById("theme-select").value;
      const density = document.querySelector('input[name="density"]:checked').value;
      const accent = document.querySelector('input[name="accent"]:checked').value;
      const opacity = document.getElementById("opacity-slider").value;
      const scale = document.getElementById("scale-slider").value;

      chrome.storage.local.set({ settings: { theme, density, accent, opacity, scale } });
      toggleSettingsView();
    });
  }
});

function loadAndInitialize() {
  chrome.storage.local.get(["globalSearchTerm", "settings"], (data) => {
    const settings = Object.assign({}, DEFAULTS, data.settings);
    applySettings(settings);
    
    // Ensure container size matches zoom
    if (settings.scale) {
        chrome.runtime.sendMessage({ action: "resizeIframe", scale: settings.scale });
    }
    
    // Restore last search
    const savedTerm = data.globalSearchTerm || "";
    searchInput.value = savedTerm;
    performSearch(savedTerm);
    searchInput.focus();
  });
}

// Listen for storage changes (Sync across tabs)
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local") {
    if (changes.settings) applySettings(Object.assign({}, DEFAULTS, changes.settings.newValue));
    if (changes.globalSearchTerm) {
      const newTerm = changes.globalSearchTerm.newValue || "";
      if (newTerm !== searchInput.value) {
        searchInput.value = newTerm;
        performSearch(newTerm);
      }
    }
    // Update list if Stash/Snapshots changed
    if (changes.stashedTabs || changes.snapshots) performSearch(searchInput.value);
  }
});


// =========================================
// 4. SEARCH & RENDERING
// =========================================

searchInput.addEventListener("input", () => {
  const newTerm = searchInput.value;
  chrome.storage.local.set({ globalSearchTerm: newTerm });
  performSearch(newTerm);
});

function performSearch(term) {
  chrome.runtime.sendMessage({ action: 'search', term: term }, (results) => {
    currentResults = results || [];
    renderResults(currentResults);
  });
}

function renderResults(items) {
  resultsList.innerHTML = "";
  selectedIndex = 0;
  const fragment = document.createDocumentFragment();
  
  items.forEach((item, index) => {
    const li = document.createElement("li");
    li.title = item.url || item.title; 

    // Icon
    const icon = document.createElement("img");
    icon.className = "favicon";
    if (item.favIconUrl) {
        if (item.favIconUrl.startsWith('chrome://favicon/')) {
             icon.src = `chrome-extension://${chrome.runtime.id}/_favicon/?pageUrl=${encodeURIComponent(item.url)}&size=32`;
        } else {
             icon.src = item.favIconUrl;
        }
    } else {
        icon.src = 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs='; 
    }
    
    // Flair tag
    const flair = document.createElement("span");
    flair.className = `flair flair-${item.type}`;
    if (item.type === 'snapshot') flair.textContent = "SNAPSHOT";
    else flair.textContent = item.type.toUpperCase();
    
    // Text Content
    const content = document.createElement("div");
    content.className = "content";
    const title = document.createElement("span");
    title.className = "title";
    if (item.type === 'snapshot') title.textContent = item.title; 
    else title.textContent = item.title || "Untitled";
    content.appendChild(title);

    if (item.url) {
      const url = document.createElement("small");
      url.className = "url";
      try { 
          if (item.type === 'snapshot') url.textContent = item.url;
          else url.textContent = new URL(item.url).hostname; 
      } 
      catch (e) { url.textContent = item.url.substring(0, 50); }
      content.appendChild(url);
    }
    
    li.appendChild(icon);
    li.appendChild(flair);
    li.appendChild(content);

    // Delete Button
    if (item.type === 'snapshot' || item.type === 'stash') {
      const deleteBtn = document.createElement('button');
      deleteBtn.className = "delete-btn";
      deleteBtn.title = "Delete item (Shift + Backspace)";
      deleteBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`;
      deleteBtn.onclick = (e) => {
        e.stopPropagation();
        chrome.runtime.sendMessage({ action: 'deleteItem', item: item });
      };
      li.appendChild(deleteBtn);
    }

    if (index === selectedIndex) li.classList.add("selected");
    fragment.appendChild(li);
  });
  resultsList.appendChild(fragment);
}


// =========================================
// 5. KEYBOARD NAVIGATION
// =========================================

searchInput.addEventListener("keydown", (e) => {
  if (!settingsView.classList.contains('hidden')) {
    if (e.key === "Escape") toggleSettingsView();
    return;
  }

  const items = resultsList.querySelectorAll("li");

  // Delete Item
  if ((e.key === "Backspace" || e.key === "Delete") && e.shiftKey) {
    if (currentResults.length > 0) {
      const selectedItem = currentResults[selectedIndex];
      if (selectedItem.type === 'snapshot' || selectedItem.type === 'stash') {
        e.preventDefault();
        chrome.runtime.sendMessage({ action: 'deleteItem', item: selectedItem });
      }
    }
    return;
  }

  // Close Palette
  if (e.key === "Escape") {
    e.preventDefault();
    chrome.runtime.sendMessage({ action: "closePalette" });
    return;
  }
  
  if (currentResults.length === 0) return;

  // Navigation
  if (e.key === "ArrowDown") {
    e.preventDefault();
    selectedIndex = (selectedIndex + 1) % currentResults.length;
    updateSelection(items);
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    selectedIndex = (selectedIndex - 1 + currentResults.length) % currentResults.length;
    updateSelection(items);
  } else if (e.key === "Enter") {
    e.preventDefault();
    const selectedItem = currentResults[selectedIndex];
    chrome.runtime.sendMessage({ 
        action: "selectItem", 
        item: selectedItem, 
        query: searchInput.value,
        screen: { width: window.screen.availWidth, height: window.screen.availHeight }
    });
  }
});

function updateSelection(items) {
  items.forEach((item, index) => {
    const isSelected = index === selectedIndex;
    item.classList.toggle("selected", isSelected);
    if (isSelected) {
      item.scrollIntoView({ behavior: "auto", block: "nearest" });
    }
  });
}