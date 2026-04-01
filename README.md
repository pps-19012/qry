# Qry

A command palette for your browser. Search tabs, history, bookmarks, and execute browser actions -- all from one keyboard shortcut.

Think Spotlight or VS Code's `Cmd+P`, but for Chrome.

## Features

**Unified search** across multiple browser contexts:
- **Open tabs** -- sorted by most recently used
- **History** -- prefix with `:h` (e.g. `:h gmail`)
- **Bookmarks** -- prefix with `:b` (e.g. `:b news`)
- **Actions** -- prefix with `>` (e.g. `>split right`)

**Tab & window management:**
- Stash tabs to close now, restore later
- Save window snapshots (all tabs in a window, named and restorable)
- Split view layouts (left/right/top/bottom)
- Pin, mute, duplicate, close tabs from the palette

**Theming:**
6 built-in themes -- Chrome Dark, Chrome Light, VS Code, Gruvbox, Dracula, Apple Spotlight. Adjustable accent color, opacity, scale, and density.

## Install

Qry is available on the [Chrome Web Store](https://chromewebstore.google.com/detail/qry-your-browser-command/lglgfgnfgmgkgjhpohhdkhjdgfjakdmm).

Or load it manually:

1. Clone this repo
2. Go to `chrome://extensions`
3. Enable **Developer mode**
4. Click **Load unpacked** and select this directory

## Usage

| Shortcut | Action |
|---|---|
| `Cmd+Shift+Space` (Mac) / `Ctrl+Shift+Space` | Open palette |
| `Arrow Up/Down` | Navigate results |
| `Enter` | Select item |
| `Shift+Backspace` | Delete stashed item or snapshot |
| `Esc` | Close palette |

### Search prefixes

| Prefix | Searches |
|---|---|
| _(none)_ | Open tabs (MRU order) |
| `:t` | Tabs (explicit) |
| `:h` | History |
| `:b` | Bookmarks |
| `>` | Actions (split, pin, mute, snapshot, etc.) |

## Tech

Vanilla JS Chrome Extension (Manifest V3). No build step, no framework. Uses [Fuse.js](https://www.fusejs.io/) for fuzzy search.

```
manifest.json      # Extension config
background.js      # Service worker -- search, actions, state
content.js         # Injects palette iframe into pages
palette.js         # UI logic, keyboard nav, settings
palette.html/css   # Palette markup and theming
```

## License

MIT
