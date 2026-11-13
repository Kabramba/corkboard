# Contributing to Corkboard

Thank you for wanting to help. Corkboard is a small codebase with no framework, so it is quick to find your way around.

## Getting set up

```bash
git clone https://github.com/<your-username>/corkboard.git   # your fork
cd corkboard
npm install
npm start
```

`npm start` builds the interface and opens the app. While you work on the interface, `npm run dev` serves it at http://localhost:5173 with live reload (boards are kept in the browser there, not on disk).

## Where things are

| Path | What it holds |
|---|---|
| `src/main.js` | The board itself: rendering, dragging, pins, tape, yarn, paste and drop |
| `src/desk.js` | Board switcher and settings sheet |
| `src/geo.mjs` | Pure geometry (overlap areas, thread curves), unit-tested |
| `src/style.css` | All the looks: cork, papers, pins, tape |
| `electron/main.js` | The desktop shell: window, tray, menu, board list, settings |
| `electron/vault.js` | Saving a board to its folder, backups and self-repair |
| `electron/preload.js` | The small, fixed bridge between the two |
| `tests/` | Unit tests (`node --test`) |
| `scripts/e2e.cjs` | End-to-end test that drives the real app |
| `scripts/shots.cjs`, `art/` | Sources for the icon, banner and README screenshot |

## Making a change

1. Create a branch: `git checkout -b my-change`.
2. Make the change. Keep to the existing style: plain JavaScript, no new dependencies unless they earn their place.
3. Run `npm test`. It runs the unit tests and then a full end-to-end pass in a throwaway home folder, so your own boards are never touched.
4. If you changed how something looks, add a before and after screenshot to the pull request.
5. Open a pull request against `main` and describe what changed and why.

Every pull request is tested automatically. Tagging a version (`v1.2.3`) builds the `.deb` and `.rpm`, installs each on a fresh Ubuntu and Fedora machine, runs the app there, and only then attaches them to a release.

## Good first contributions

- Packages for other systems (AppImage, Flatpak, arm64)
- Multi-select and group move
- Picking a section of a Markdown file instead of the whole file
- Exporting a board as an image or PDF
- Translations

## Reporting bugs

Open an issue and say what you did, what you expected and what happened. The app version (Settings, bottom line) and your distribution help a lot. Never attach a board you would not want public.

## Conduct

Be kind and assume good intent. Harassment or personal attacks are not welcome here.
