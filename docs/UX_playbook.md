# UX Playbook — Building Better Product UX

A reference distilled from the **Supreme Threads ERP** web app (`apps/web`, Next.js 16 +
Tailwind v4). It captures the design decisions, layout patterns, component conventions, and
micro-interactions that make this app feel coherent and fast — so you can reuse them in any
other project instead of re-deriving them.

Use it as a checklist when you build a new screen, and as a copy-paste source for the
primitives that already work here.

> **How to read this:** every section states the *principle* (portable to any stack), then
> shows the *concrete implementation* from this codebase so you can lift the exact values.

---

## 0. The 10 principles (TL;DR)

1. **One design token file, no magic colors.** All color/shadow/font lives in `@theme`; JSX
   references tokens, never raw hex scattered everywhere. (See [§1](#1-design-tokens).)
2. **Every list screen has the same skeleton:** `PageHeader` → toolbar (search + filters +
   primary action) → `DataTable` → empty state. Predictability beats novelty. ([§3](#3-page--list-layout))
3. **Forms are wrapped, sectioned, and gridded** with `CreateFormLayout` → `FormSection` →
   `FormRow` → `Field`. Never hand-roll a form layout. ([§5](#5-forms))
4. **Primary action lives top-right; back/cancel top-left.** Consistent muscle memory. ([§4](#4-buttons--action-hierarchy))
5. **Filters live in a right-hand drawer**, show an active count, and have a "Clear all". ([§7](#7-filters))
6. **Feedback is non-blocking by default** (toast, auto-dismiss 5s) and **blocking only when
   destructive** (confirm dialog). ([§8](#8-feedback-toasts-dialogs-empty--loading))
7. **Inputs have a visible focus ring**, generous min-height (≥42px), and clear required (`*`). ([§6](#6-inputs))
8. **Status is color-coded with consistent badge tones** (red/green/blue/orange/...). ([§9](#9-badges--status))
9. **Sessions refresh silently**; the user is never surprised by a logout mid-task. ([§10](#10-auth--session-ux))
10. **Accessibility is built in, not bolted on**: roles, `aria-*`, focus management, keyboard
    escape. ([§11](#11-accessibility-checklist))

---

## 1. Design tokens

**Principle:** Define a small, named palette and spacing/shadow/typography scale *once*.
Components consume tokens, never literals. This is what keeps 6 large feature pages visually
identical without a component library.

**Implementation** (`apps/web/src/app/globals.css`, Tailwind v4 `@theme`):

```css
@theme {
  --color-background:    #eeeeef;  /* app canvas — soft grey, not white */
  --color-sidebar:       #ffffff;
  --color-surface:       #ffffff;  /* cards sit on the grey canvas */
  --color-field:         #f1f2f5;  /* input rest fill */
  --color-field-strong:  #e6e8ed;
  --color-ink:           #151821;  /* primary text — near-black, not pure black */
  --color-muted:         #70798d;  /* secondary text */
  --color-line:          #dde1e8;  /* borders */
  --color-blue:          #082fd6;  /* primary action */
  --color-blue-strong:   #0624a8;  /* primary hover */
  --color-danger:        #c41e3a;
  --color-success:       #07824f;
  --color-pink-soft:     #ffe5f0;  /* brand accent */

  --shadow-card: 0 18px 50px rgb(35 42 58 / 8%);   /* one elevation, used everywhere */
  --font-sans:   "Aptos", "Segoe UI", sans-serif;
  --breakpoint-md: 920px;          /* single responsive breakpoint */
}
```

**Takeaways to copy:**

- **Canvas is soft grey (`#eeeeef`), cards are white.** This gives free visual separation
  without heavy borders — cards "float" via `--shadow-card`.
- **Text is near-black `#151821`, never `#000`.** Softer, more premium.
- **Exactly one shadow token** for elevation. Resist inventing per-component shadows.
- **Exactly one custom breakpoint** (`md: 920px`). Mobile rules are all `max-md:`.
- Tokens become *both* Tailwind utilities (`bg-blue`, `text-ink`) *and* CSS vars
  (`var(--color-blue)`) for the rare inline-style case.

---

## 2. Application shell & navigation

**Principle:** A fixed left sidebar for module navigation + a top bar for context
(breadcrumb), back, and identity. The content area is the only thing that scrolls.

**Implementation** (`features/shell/app-shell.tsx`):

- **Grid layout:** `grid-cols-[248px_minmax(0,1fr)]`, full viewport height, `overflow-hidden`
  on the frame so only `<main>` scrolls. Collapses to single column under `md`.
- **Sidebar** groups links by module with an uppercase section label, each link is a
  `[icon | label]` grid, min-height 42px, with three visual states:
  - rest: `text-[#4f5a70]`
  - hover: `bg-[#f5f6f9] text-ink`
  - active: `data-[active=true]:bg-[#eef0f4] font-bold` + icon recolored to black via filter.
- **Active detection** uses `pathname.startsWith(submodule.href)` and sets
  `aria-current="page"` — the accessible + visual states are driven by the same condition.
- **Top bar** is a 3-column grid: `[back] [breadcrumb] [profile]`.
  - Back button calls `router.back()` with an animated arrow on hover (`group-hover:-translate-x-0.5`).
  - Breadcrumb shows `Module / **Submodule**`.
  - Profile is an avatar with initials → dropdown menu (Reset Password, Logout) that closes on
    outside-click and `Escape`.
- **Sidebar is permission-driven**: the menu is built from what the API returns for the user.
  The UI never shows a link the user can't use — but the backend still enforces 403 independently.

**Takeaways to copy:**

- Build the nav from server-provided permissions, not a hardcoded list.
- Drive visual-active and `aria-current` from the *same* predicate.
- Only the content pane scrolls; the chrome stays put.
- Avatar initials from `name.split(" ").map(p => p[0])` is a cheap, dependency-free avatar.

---

## 3. Page & list layout

**Principle:** Every "manage a resource" screen follows the identical structure so users learn
it once. Card on grey canvas, header, toolbar, table, empty state.

**Standard anatomy:**

```
┌─ rounded-lg bg-surface shadow-card  (the page card) ──────────────┐
│  PageHeader:  Title (2xl, extrabold)        [ + Primary Action ]  │
│               subtitle (muted, 0.85rem)                           │
│                                                                   │
│  Toolbar:    [ 🔍 SearchBar  (flex-1) ]   [ ☰ Filters (n) ]       │
│                                                                   │
│  DataTable:  uppercase headers · zebra hover · action column      │
│              └─ empty state (icon + message + hint) when 0 rows    │
└───────────────────────────────────────────────────────────────────┘
```

**Implementation:**

- `PageHeader` (`components/ui/page-header.tsx`): title + subtitle on the left, optional
  `action` node on the right (the primary CTA). `mb-5` below.
- The page card: `rounded-lg bg-surface shadow-card min-h-[calc(100vh-122px)] p-[22px]`. The
  `min-h` keeps short pages from looking empty.
- Toolbar: `flex gap-[14px] items-center mb-[18px] flex-wrap` — search grows, filters button
  is fixed width, wraps on mobile.

**Takeaways to copy:**

- Reuse one `PageHeader` everywhere; pass the CTA in as a prop.
- Give the content card a `min-h` so layouts don't jump between data-rich and empty pages.
- Title scale: **page title 2xl extrabold**, **section title ~1.05rem extrabold**, **field
  label 0.72rem black uppercase**. Three tiers, no more.

---

## 4. Buttons & action hierarchy

**Principle:** A strict visual hierarchy — one primary per view, secondary is text/ghost,
destructive is red, icon buttons for row actions. Position encodes meaning.

**The button vocabulary in this app:**

| Role | Class signature | Where |
|------|-----------------|-------|
| **Primary** | `bg-blue text-white font-black rounded-[7px] min-h-[42px] hover:bg-blue-strong` | Page CTA, form submit |
| **Secondary / Cancel** | transparent, `text-ink font-bold`, hover dims to muted | Form cancel |
| **Filter** | white, `border-line`, h-46px, gains shadow on hover, `active:translate-y-px` | Toolbar |
| **Icon (row action)** | 34×34 grid, transparent, `hover:bg-[rgb(8_47_214/10%)] active:scale-[0.94]` | Table rows |
| **Destructive icon** | 42×42, `border-line text-danger hover:bg-[#fde8ed]` | Delete |

**Universal button rules (from `globals.css` base layer):**

```css
button { cursor: pointer; }
button:disabled { cursor: not-allowed; opacity: 0.65; }
```

- **Disabled = 0.65 opacity + not-allowed cursor**, globally. Never custom per-button.
- **Tactile feedback:** primary/filter buttons use `active:scale-[...]` or `active:translate-y-px`.
- **Position rule:** primary action **top-right**; back & cancel **top-left/left**. (See
  `CreateFormLayout` — back arrow + title left, Cancel + Create right.)
- **Loading state replaces label, keeps button:** submit shows a spinner + "Signing you in…"
  rather than disappearing (login form) — the button never reflows.

**Takeaways to copy:**

- Define button styles as named string constants (`PRIMARY_BUTTON`, `FILTER_BUTTON`,
  `ICON_BUTTON`) at module top, reuse them. This is how 3000-line pages stay consistent.
- One primary per screen. If you have two "primary" buttons, one is actually secondary.

---

## 5. Forms

**Principle:** Forms are composed from a fixed set of layout primitives so spacing, label
style, column behavior, and the header/action bar are identical everywhere.

**The four primitives:**

1. **`CreateFormLayout`** (`components/ui/create-form-layout.tsx`) — the page wrapper:
   - Left: back arrow (`router`-style) + **title (1.35rem extrabold)** + muted subtitle.
   - Right: **Cancel** (ghost) + **Create/Save** (primary, shows disabled while submitting).
   - Body: `grid gap-7` for stacked sections.
2. **`FormSection`** (`components/ui/form-section.tsx`) — a titled group
   (e.g. "Product Details", "Wages for this Product"). Title is `1.05rem extrabold`.
3. **`FormRow`** — lays fields in **1–4 columns** that **collapse to 1 column under `md`**:
   ```ts
   2: "grid-cols-2 max-md:grid-cols-1"   // responsive by default
   ```
4. **`Field`** — label + required marker + control:
   ```tsx
   <label className="text-[#525d73] text-[0.72rem] font-black uppercase tracking-[0.03em]">
     {label}
     {required && <span className="text-danger ml-[3px]" aria-label="required">*</span>}
   </label>
   ```

**Composition example (real usage):**

```tsx
<CreateFormLayout title="Add Raw Material" subtitle="Record an inward" onSubmit={...} submitLabel="Create">
  <FormSection title="Basic Info">
    <FormRow columns={2}>
      <Field label="Product Name" required><input className={INVENTORY_INPUT} /></Field>
      <Field label="Product Category" required><select className={INVENTORY_INPUT}>…</select></Field>
    </FormRow>
  </FormSection>

  <FormSection title="Product Details">
    <FormRow columns={4}> … </FormRow>
    <FormRow columns={1}>
      <Field label="Remarks"><textarea className={`${INVENTORY_INPUT} min-h-[80px] resize-y`} /></Field>
    </FormRow>
  </FormSection>
</CreateFormLayout>
```

**Validation:** shared Zod schemas from `@supreme/shared` power **both** the form
(`react-hook-form` + `@hookform/resolvers/zod`) and the API route (`@hono/zod-openapi`). One
schema, validated client-side for UX and server-side for trust.

**Takeaways to copy:**

- Standardize on `Layout → Section → Row → Field`. New forms become declarative and never
  drift in spacing.
- **Labels: uppercase, tiny (0.72rem), black weight, letter-spaced.** Distinct from input
  text, scannable.
- **Required marker is a red `*` with `aria-label="required"`** — visible *and* announced.
- Default rows to 1 column on mobile — free responsiveness.
- Share the validation schema between client and server. Never write two.

---

## 6. Inputs

**Principle:** Inputs are large, calm at rest, and unmistakable when focused or invalid.

**The input variants** (named constants, reused across a page):

```ts
// Standard form input — white, blue focus ring
INVENTORY_INPUT =
  "w-full min-h-[46px] rounded-[7px] border border-line bg-white px-[14px] text-[0.86rem]
   outline-none transition-[border-color,box-shadow] duration-150
   focus:border-blue focus:shadow-[0_0_0_3px_rgb(8_47_214/8%)]";

// Search (toolbar) — fills space, soft fill, whitens on focus
"h-[46px] rounded-[10px] bg-[#f7f8fb] pl-[42px] focus:border-[#d6dbe5] focus:bg-white";

// Filter pill — pill-shaped compact select
FILTER_PILL_INPUT = "h-[38px] rounded-full border border-[#e3e7ee] …";
```

**Focus state is the most important state:** every input gets either a **3–4px translucent
blue ring** (`shadow-[0_0_0_3px_rgb(8_47_214/8%)]`) or a colored border on focus. `outline-none`
is *only* ever paired with a replacement ring — never a bare removal.

**Login field pattern** (icon-in-field, `focus-within`): the *wrapper* lights up, not just the
input — `focus-within:border-blue focus-within:shadow-[0_0_0_4px_...]`. Leading icon brightens
(`opacity-70 → group-focus-within:opacity-100`). Trailing show/hide toggle for passwords with
`aria-pressed` + `aria-label`.

**Other input details worth copying:**

- **Numbers:** `type="number" step="0.01"` for money/quantity; render back with `tabular-nums`
  so columns align.
- **Search icon** is absolutely positioned with `pointer-events-none` so clicks fall through
  to the input.
- **Custom select arrow** via inline SVG `background-image` (consistent across browsers)
  instead of the native chevron.
- **Textareas** reuse the input class + `min-h-[80px] resize-y` (vertical resize only).
- **Min-height ≥ 42–52px** everywhere — comfortable touch targets.

**Takeaways to copy:**

- Never `outline-none` without a replacement focus indicator.
- For composite fields (icon + input + action), light up the **wrapper** on `focus-within`.
- Give passwords a show/hide toggle with proper ARIA.
- Right-align numerics and use `tabular-nums`.

---

## 7. Filters

**Principle:** Keep the list clean — filters live in a slide-in **right drawer**, not inline
clutter. The trigger shows how many filters are active; the drawer makes clearing easy.

**Implementation** (`RawMaterialsFilterDrawer` in `inventory-page.tsx`):

- **Trigger button** shows the active count inline: `Filters (2)`.
- **Drawer** = full-height panel `max-w-[380px]` pinned right, over a `bg-black/35` scrim;
  click-scrim or the `✕` closes it; slides in via `animate-[toast-slide-in_…]`.
- **Header** has the title + a **"Clear all"** (only shown when `activeCount > 0`).
- **Collapsible `FilterSection`s** — each is a toggle row with an uppercase label, a count
  badge (blue pill), and a chevron that rotates when expanded.
- **Options** are radios/checkboxes with generous `py-2` hit areas and `cursor-pointer` labels.
- **Search is separate from filters** — free-text search is always-visible in the toolbar;
  structured facets go in the drawer. Search filters client-side via a memoized
  `.filter(...)` over multiple fields (name, category, brand).

**Takeaways to copy:**

- Surface the active-filter **count** on the trigger and per-section — users must see state
  without opening the drawer.
- Always provide **Clear all**, and only when something is active.
- Keep **free-text search visible**; tuck **structured filters** behind the drawer.
- Animate the drawer in; dim the background; close on scrim-click and Escape.

---

## 8. Feedback: toasts, dialogs, empty & loading

**Principle:** Match the interruption to the stakes. Confirmations of routine actions are
**non-blocking** (toast). Irreversible actions are **blocking** (confirm dialog). Absence of
data is **explained** (empty state), not blank.

### Toasts (non-blocking, the default)

(`inventory-page.tsx`)

- Fixed **top-right**, `z-[1000]`, slides in, **auto-dismisses after 5s** via `setTimeout`
  cleared on change.
- Two tones only: `success` (green) / `error` (red), each a soft tinted bg + matching border +
  leading icon.
- Driven by a tiny `type Toast = { type, text } | null` state passed down as `onToast`.

```ts
TOAST_VARIANT = {
  success: "bg-[#e8f8ef] text-success border border-[#b8e6cc]",
  error:   "bg-[#fde8ed] text-danger  border border-[#f4c6cf]",
};
```

### Confirm dialog (blocking, for destructive/irreversible)

(`components/ui/confirm-dialog.tsx`)

- Centered modal over a blurred scrim (`backdrop-blur-[2px]`), pops in with a spring easing.
- **Focus is moved to the confirm button** on open; **`Escape` cancels**; click-outside cancels
  (unless busy).
- Two tones: `danger` (red, trash icon) / `primary` (blue, info icon).
- Confirm button shows **"Working…"** + disables both buttons while `isBusy`.
- Proper `role="alertdialog"`, `aria-modal`, `aria-labelledby`, `aria-describedby`.

### Empty states (never a blank table)

(`DataTable`)

- Centered icon tile + **bold message** + **lighter hint that tells the user what to do next**:
  > **No raw materials yet** — *Record an inward from the top-right to start tracking stock.*
- Each list passes its own `emptyMessage` + `emptyHint`.

### Loading & error

- Shell shows `"Loading modules"` placeholder while permissions load; falls back to an
  `error` state card with a red banner if the workspace fails to load.
- Inline form errors and the login error banner use the same red tint
  (`bg-[#fde8ed] text-danger`) + `role="alert"` so the tone is consistent and announced.

**Takeaways to copy:**

- **Toast for success/routine, dialog for destructive.** Don't make users dismiss a modal to
  confirm they saved something.
- Auto-dismiss toasts (~5s); keep them out of the content flow (fixed, top-right).
- Empty states must answer *"what do I do now?"* — message **and** actionable hint.
- Reuse the same red/green tint tokens for toasts, banners, and inline errors.

### Status / confirmation tone reference

| Situation | Pattern | Blocking? |
|-----------|---------|-----------|
| Saved / created / updated | Toast `success`, 5s | No |
| Validation / API error | Toast `error` or inline red banner (`role="alert"`) | No |
| Delete / irreversible | `ConfirmDialog` tone=`danger`, focus confirm, Esc=cancel | Yes |
| Loading data | Placeholder text / skeleton card | No |
| No data | Empty state: icon + message + next-step hint | No |

---

## 9. Badges & status

**Principle:** Encode categorical state with a *fixed* set of color tones so a color means the
same thing across the whole app.

**Implementation:**

```ts
BADGE_BASE = "inline-flex items-center min-h-[26px] rounded-md px-2.5 py-[3px]
              text-[0.72rem] font-extrabold uppercase tracking-[0.02em] whitespace-nowrap";
BADGE_VARIANT = {
  red:    "bg-[#fde6ea] text-[#c8294a]",
  green:  "bg-[#e2f6eb] text-[#0a7a48]",
  blue:   "bg-[#e0e8fb] text-[#2740b8]",
  orange: "bg-[#fff3e0] text-[#c46b10]",
  purple: "bg-[#ece6fb] text-[#5a37c4]",
  teal:   "bg-[#e0f5f5] text-[#0a7373]",
  gray:   "bg-field text-muted",       // ← neutral / "not available"
};
```

- Badges are **soft tint bg + saturated text** of the same hue — readable, low-noise.
- A `CategoryBadge` maps domain values → tones deterministically (yarn→orange, dyes→red,
  chemicals→green). The mapping lives in one place.
- A `StockBadge` degrades gracefully: a real quantity renders as bold `tabular-nums`; zero/NaN
  renders a neutral gray **"Stock not available"** pill instead of a scary `0`.

**Takeaways to copy:**

- Fix your tone palette; map domain → tone in one function; never inline ad-hoc colors.
- Render "empty/zero" as a neutral labeled pill, not a bare `0` or `—` that reads as an error.

---

## 10. Auth & session UX

**Principle:** Security shouldn't cost the user their work. Tokens refresh invisibly; a 401 is
recovered before the user ever sees it.

**Implementation** (`lib/api/client.ts` + `app-shell.tsx`):

- **Silent proactive refresh:** access token lives 15 min; the shell refreshes every **10 min**
  (5-min safety buffer) *and* on tab `focus`/`visibilitychange` after being backgrounded — so a
  returning tab never fires a request on a dead cookie.
- **Reactive refresh:** `apiFetch` catches a `401`, calls `/auth/refresh` **once** (deduped via
  a shared in-flight promise so concurrent calls don't stampede), then retries the original
  request. Only if refresh fails does it redirect to `/login`.
- **CSRF** header auto-attached to mutating verbs from `localStorage`; cookies are
  `credentials: "include"`.
- **Error surface:** login shows a single friendly **"Invalid email or password"** rather than
  leaking which field was wrong; the banner animates in with `role="alert"`.
- **No reflow on submit:** the submit button swaps to spinner + "Signing you in" in place.

**Takeaways to copy:**

- Refresh tokens *proactively on a timer + on focus*, not only reactively — avoids the visible
  "blip" of a failed-then-retried request.
- **Dedupe the refresh call** with a module-level in-flight promise.
- Keep auth error messages generic; animate + `role="alert"` them.

---

## 11. Accessibility checklist

This app gets the fundamentals right — copy these as your baseline:

- [ ] **Focus visible on every interactive element** (`focus-visible:ring-2` or a focus ring).
- [ ] `outline-none` is *always* paired with a replacement indicator.
- [ ] Active nav items set `aria-current="page"`.
- [ ] Icon-only buttons have `aria-label` (back, close, edit, show/hide password).
- [ ] Toggles expose state: `aria-pressed` (password), `aria-expanded` + `aria-haspopup` (menus).
- [ ] Modals: `role="dialog"`/`alertdialog`, `aria-modal`, `aria-labelledby`,
      `aria-describedby`; **focus moves in**, **Escape closes**, click-scrim closes.
- [ ] Dropdown menus: `role="menu"` / `role="menuitem"`, close on outside-click + Escape.
- [ ] Errors/alerts use `role="alert"` so they're announced.
- [ ] Required fields: visible `*` **and** `aria-label="required"`.
- [ ] Decorative icons/images: `aria-hidden="true"` + empty `alt=""`.
- [ ] Inputs paired with `<label htmlFor>`; autocomplete hints (`autocomplete="email"`,
      `current-password`).
- [ ] Touch targets ≥ ~42px min-height.

---

## 12. Responsive rules

**Principle:** One breakpoint, mobile rules are additive overrides (`max-md:`), layouts
collapse predictably.

- Single breakpoint: **`md = 920px`**.
- Shell: 2-col `[sidebar | content]` → **1 col**, sidebar becomes a top bar (`max-md:border-b`).
- `FormRow`: any N-column grid → **1 column** under md.
- Toolbar: `flex-wrap` so search + filters stack.
- Tables: `min-w-[680px]` with `overflow-x-auto` wrapper — horizontal scroll rather than
  crushing columns.
- Page padding tightens on mobile (`p-[22px]` → `max-md:px-4`).

**Takeaway:** Prefer *fewer* breakpoints and *additive* mobile overrides. Let dense tables
scroll horizontally instead of reflowing into unreadable stacks.

---

## 13. Micro-interactions & motion

Small, fast, purposeful — never decorative-only:

- **Durations:** 150–200ms for state changes; 250ms for entrances; ~700ms only for the login
  button's ambient sheen.
- **Easing:** `ease-out` for entrances; a slight spring
  (`cubic-bezier(0.2,0.8,0.3,1.1)`) for the confirm dialog pop.
- **Tactile press:** `active:scale-[0.94–0.99]` / `active:translate-y-px` on buttons.
- **Directional cues:** back arrow nudges left on hover, submit arrow nudges right.
- **Keyframes are centralized** in `globals.css` (`toast-slide-in`, `confirm-dialog-pop`,
  `filter-panel-in`, `login-rise`) and referenced via `animate-[name_…]`.
- **Reuse animations across components** (the filter drawer reuses `toast-slide-in`).

**Takeaway:** Define a handful of keyframes globally and reuse them. Keep motion under 250ms
for anything in the interaction path.

---

## 14. Microcopy & content

- **Titles are nouns**, **CTAs are verb+noun**: "Add Raw Material", "Record an inward".
- **Subtitles explain the screen** in one muted line: "View your Raw Material inventory here."
- **Empty hints are instructions**, not apologies: "Record an inward from the top-right to
  start tracking stock."
- **Errors are human**: "Invalid email or password", "Inward date is required."
- **Busy states are present-continuous**: "Signing you in", "Working…".
- Units/categories are **normalized for display** (`YARNS`, uppercase badges) even when stored
  lowercase.

---

## 15. Code-organization habits that keep UX consistent

These aren't visual, but they're *why* the UX stays coherent across huge files:

1. **Style constants at module top.** `PRIMARY_BUTTON`, `INVENTORY_INPUT`, `BADGE_VARIANT`,
   `TOAST_VARIANT` are declared once and reused — no copy-pasted class soup.
2. **Shared UI primitives in `components/ui/`** (`PageHeader`, `DataTable`, `CreateFormLayout`,
   `FormSection`/`FormRow`, `ConfirmDialog`, `SearchBar`) exported from one `index.ts`.
3. **Small local helper components** (`Field`, `FilterSection`, `CategoryBadge`, `StockBadge`)
   for repeated patterns within a feature.
4. **Schemas shared between client & server** (`@supreme/shared`) — validation can't drift.
5. **Variant maps over conditionals** — `VARIANTS[variant]`, `BADGE_VARIANT[tone]`,
   `COLUMNS_CLASS[columns]` instead of `if/else` ladders.

**Takeaway:** Consistency is an architecture choice. Centralize tokens, primitives, and variant
maps, and even a 3000-line page stays on-brand.

---

## 16. New-screen checklist (use this every time)

When adding a screen to *this* app (or porting these patterns elsewhere):

- [ ] Wrap content in a `bg-surface shadow-card` card with `min-h-[calc(100vh-122px)]`.
- [ ] `PageHeader` with title + subtitle + one primary CTA (top-right).
- [ ] Toolbar: visible `SearchBar` + `Filters` drawer (with active count) if the list is large.
- [ ] `DataTable` with `emptyMessage` **and** `emptyHint`; row actions as icon buttons.
- [ ] Create/Edit uses `CreateFormLayout` → `FormSection` → `FormRow` → `Field`.
- [ ] Every required field has a `*` (visible + `aria-label`).
- [ ] Inputs use the shared input class with a focus ring; min-height ≥ 42px.
- [ ] Success → toast; destructive → `ConfirmDialog`.
- [ ] Status values → `BADGE_VARIANT` tones, mapped in one place.
- [ ] Responsive: rows collapse to 1 col, table scrolls horizontally under `md`.
- [ ] A11y: labels, `aria-*`, focus management, Escape handling.
- [ ] Validation schema shared between form and API.

---

## 17. Anti-patterns this codebase avoids (don't reintroduce)

- ❌ Raw hex colors scattered in JSX → ✅ tokens + named constants.
- ❌ `outline-none` with no focus replacement → ✅ always a ring/border.
- ❌ Blocking modal to confirm a routine save → ✅ toast.
- ❌ Blank table on no data → ✅ empty state with a next-step hint.
- ❌ Two "primary" buttons competing in one view → ✅ one primary, rest ghost/secondary.
- ❌ Hardcoded nav that doesn't match permissions → ✅ server-driven sidebar + backend 403.
- ❌ Logout-on-401 mid-task → ✅ silent + deduped refresh, retry, only then redirect.
- ❌ Per-component bespoke shadows/animations → ✅ one shadow token, centralized keyframes.
- ❌ Leaking which credential was wrong → ✅ generic "Invalid email or password".

---

*Source of truth: `apps/web/src` — `app/globals.css` (tokens), `components/ui/*` (primitives),
`features/shell/app-shell.tsx` (shell), `features/inventory/inventory-page.tsx` (the most
complete reference for tables/forms/filters/toasts), `lib/api/client.ts` (session UX).*
