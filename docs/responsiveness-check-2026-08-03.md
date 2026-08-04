# Responsiveness Check — 2026-08-03

**Target:** `apps/web` (Next.js 15, Tailwind v4), local `next dev` at `localhost:3000`
**Method:** single Chromium session (Playwright), authenticated, resized through 8 breakpoints
**Coverage:** 8 routes × 8 widths + 2 modals × 4 widths = **72 measured viewports**
**Mode:** Standard check (320 / 375 / 768 / 1024 / 1280 / 1440 / 1920 / 2560)

Run with a populated site (workers, supplier, a 2-line GST invoice) using deliberately long
Gujarati business names — short strings hide truncation and overflow bugs.

## Result: pass

| Check | Result |
| --- | --- |
| 1. Horizontal overflow | **0px at every route and every width.** No element escapes the viewport; the only horizontal scrollers are the intentional `overflow-x-auto` table wrappers. |
| 2. Text overflow | No text below 12px anywhere. No mid-word truncation observed. |
| 3. Navigation transition | Clean single switch at **768px**: hamburger + drawer below, persistent sidebar at and above. No intermediate broken state. |
| 4. Content stacking | Card list (`<ul md:hidden>`) below 768px, table above, on all 13 list surfaces. |
| 5. Image/media scaling | DPR photo grid is `grid-cols-3 sm:grid-cols-4` on `aspect-square` — no distortion or overflow. |
| 6. Touch targets | 16–18 sub-44px targets per page **before** this pass; **0–2 after**, all accepted (below). |
| 7. Whitespace balance | Content caps at `max-w-[1400px]`; no stranding at 2560px. |
| 8. CTA visibility | Primary action visible above the fold at all widths on every route checked. |

## Transitions

| Transition | From | To | Switches at |
| --- | --- | --- | --- |
| Nav: drawer → sidebar | 375px | 768px | **768px** (`md:`) |
| List: cards → table | 375px | 768px | **768px** (`md:`) |
| Modal: bottom sheet → centred dialog | 375px | 768px | **640px** (`sm:`) |
| Dashboard KPIs: 2-col → 3-col | 768px | 1024px | **1024px** (`lg:`) |

All four are single, deliberate breakpoints — no layout thrash between them.

## Fixed during this check

Found by measuring live geometry, not by reading source:

| Severity | Issue | Fix |
| --- | --- | --- |
| High | **Drawer nav links 250×36px** — the primary mobile navigation, on every page | `min-h-11` on touch, `md:min-h-0` for the desktop sidebar that shares the markup |
| High | **`Filters` button 288×38px** — on every list page (shared `FilterDrawer`) | `h-11 sm:h-10` |
| Medium | Top-bar site switcher + user menu 40px | `min-h-11 sm:min-h-10` |
| Medium | Attendance `Daysheet`/`Workers` tabs 137×40px | `h-11 sm:h-10` |
| Medium | Invoice `GST`/`Bill` type toggle 135×38px | `h-11 sm:h-10` |
| Medium | Users status filter chips (`all`/`active`/`disabled`) 38px | `h-11 sm:h-10` |
| Medium | Button `size="sm"` was 36px on mobile — used for row actions (Edit/Delete/Download) | `h-10 sm:h-8` |
| Low | Dashboard "Go to Sites" CTA 36px — the first screen a new owner sees | `h-11 sm:h-10` |
| Low | Brand link 36×28px; reverse-charge checkbox row | `min-h-11` on the link and the `<label>` |

## Accepted, not fixed

- **40px `size="sm"` buttons** (Edit / Delete / Download PDF / Add line / Mark all present).
  Raising to 44px defeats the compact variant's purpose; 40px is a deliberate middle ground.
- **16px native checkbox** in the invoice form — its `<label>` wrapper is 44px, so the *tap
  target* is compliant. Resizing the native control fights the OS renderer.
- **"View all →" / "New" text links, 16px tall.** Inline text inside dashboard card headers, not
  buttons; enlarging them would distort the header layout.

## Method notes / limits

- **Emulated Chromium only.** Real-device behaviour (iOS Safari's dynamic toolbar, the on-screen
  keyboard over the modal sheet, actual notch insets) is **not** covered. The safe-area and `dvh`
  work from the earlier pass is therefore still unverified on hardware — worth ten minutes on one
  real iPhone and one low-end Android before the contractor hand-off.
- **A mid-run session expiry initially produced false passes.** The 15-minute access token lapsed
  and three routes silently recorded the *login page* as "0 issues". The script now asserts it is
  not on `/login` before measuring and re-authenticates if it is. Worth knowing for any future
  run: on an authenticated app, a clean result is only trustworthy if the page was actually loaded.
- `invoice-detail-modal` was measured at 320/375px only; the desktop-table row selector did not
  match at ≥768px. Desktop was covered by the page-level runs.
- Reproduce: `scratchpad/responsive-check.py` (not committed — a throwaway harness, unlike
  `check-tenant-isolation.ts` which is a permanent guard).
