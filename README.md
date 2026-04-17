# obsidian-reading-vim

A tiny Obsidian plugin that adds vim-style scrolling and navigation to
reading-mode markdown views, and keeps the editor cursor in sync with the
reading-mode scroll position so toggling to edit mode lands you where you
were reading.

## Keybindings

Active only when the focused view is a markdown file in **reading mode** and
you're not typing in an input/textarea/contenteditable.

| Key            | Action                                   |
| -------------- | ---------------------------------------- |
| `j` / `k`      | Scroll down / up by a fixed step (60 px) |
| `d` / `u`      | Scroll down / up by half a page          |
| `Ctrl+D` / `Ctrl+U` | Same as `d` / `u`                   |
| `gg`           | Jump to top                              |
| `G`            | Jump to bottom                           |
| `<n>G`         | Jump to line `n` (clamped to last line)  |

Multi-key sequences (`gg`, `<n>G`) reset after 800 ms of inactivity.

## Cursor sync

While scrolling in reading mode, the editor cursor is continuously moved to the
source line currently at the top of the preview. Switching to edit / live
preview mode therefore leaves the cursor where you were reading.

## Build

Requires Node.js.

```sh
npm install
npm run build
```

This produces `main.js` in the repo root. `manifest.json` is already committed.

For development with auto-rebuild:

```sh
npm run dev
```

## Install into a vault

1. Create the plugin directory inside your vault:
   ```sh
   mkdir -p /path/to/vault/.obsidian/plugins/reading-vim
   ```
2. Copy the built artifacts:
   ```sh
   cp main.js manifest.json /path/to/vault/.obsidian/plugins/reading-vim/
   ```
3. In Obsidian, open **Settings → Community plugins**, disable Restricted mode
   if needed, click the refresh icon next to _Installed plugins_, then enable
   **Reading mode vim keys**.

To update after rebuilding, re-copy `main.js` and use the **Reload plugin**
button (or toggle the plugin off and on).
