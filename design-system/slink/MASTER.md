# Slink Design System (Master Reference — v4.0)

> Synthesized with `ui-ux-pro-max` for high-trust Vietnamese retail POS, inventory, finance, CRM, and multi-channel operations across desktop PWA (`1440px+`) and mobile Android 10+ / iOS (`390px+`).

---

## 1. Visual Identity & Aesthetic Direction

- **Style:** Clean Executive Retail & Financial Operations (Swiss-inspired grid + crisp surface elevation, single authoritative emerald accent, tabular monospace/numeric clarity).
- **Language & Script:** Vietnamese diacritics first (`Plus Jakarta Sans` + `JetBrains Mono` with full `vietnamese` glyph subsets and `font-variant-numeric: tabular-nums`).
- **Iconography:** Vector SVG icons exclusively — zero structural emojis (`💸`, `✉`, `⚡`, `?`) in navigation, buttons, headers, or cards. Consistent `1.75–2px` stroke width, aligned on text baseline.

---

## 2. Semantic Color Tokens

| Role | Token | Hex Value | Usage |
| :--- | :--- | :--- | :--- |
| Primary Brand / Action | `--primary`, `--forest` | `#0F6B4E` | Primary buttons, active nav accent, hero KPI gradient start, focus borders |
| Primary Hover / Pressed | `--primary-hover`, `--forest-2` | `#0B553E` | Interactive hover/active states |
| Primary Soft Tint | `--primary-soft` | `#ECFDF5` | Selected nav pill, selected POS product tint, soft icon badges |
| Canvas Background | `--paper`, `--bg` | `#F4F6F5` | Main panel workspace backdrop |
| Elevated Card Surface | `--surface` | `#FFFFFF` | Top-level panels, stat cards, product cards, dialogs |
| Nested / Subtle Surface | `--surface-soft`, `--surface-subtle` | `#F8FAF9` / `#F1F5F3` | Nested subpanels, table headers, alternating surfaces |
| Primary Text | `--ink` | `#0F172A` | Headings, monetary values, primary labels (>= 12:1 contrast) |
| Secondary Text | `--ink-secondary` | `#334155` | Table cells, body copy, secondary titles |
| Muted / Helper Text | `--muted` | `#52606D` | Captions, metadata, timestamps (>= 5.7:1 contrast on white) |
| Hairline Border | `--line`, `--border` | `#E2E8F0` | Cards, panels, table rows, dividers |
| Strong Control Border | `--border-strong` | `#CBD5E1` | Inputs, selects, secondary button outlines |
| Semantic Success | `--success` | `#047857` / `#ECFDF5` | Paid orders, settled payroll, healthy stock |
| Semantic Warning | `--warning` | `#B45309` / `#FFFBEB` | Partial payments, low stock alerts |
| Semantic Danger | `--danger` | `#DC2626` / `#FEF2F2` | Errors, cash shortages, destructive confirms |

---

## 3. Typography & Rhythm

- **Display / Body:** `'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif`
- **Monospace / Codes / Barcodes / KBD:** `'JetBrains Mono', ui-monospace, Consolas, monospace`
- **Numeric Clarity:** Enforce `font-variant-numeric: tabular-nums` across KPI cards, POS prices, cart totals, ledger tables, and cashbook rows so numbers align vertically.
- **Scale:**
  - H1 Page Title: `26px` desktop (`22px` mobile), weight `700`, letter-spacing `-0.025em`
  - H2 Panel Title: `17px`, weight `700`
  - Hero KPI Value: `clamp(26px, 2.8vw, 32px)`, weight `800`
  - Body / Table Cell: `14px`, line-height `1.5`
  - Caption / Table Header: `12px`, weight `600`, uppercase headers with `+0.04em` tracking

---

## 4. Spacing, Radii & Elevation

- **Spacing Grid:** `4px` / `8px` multiples (`4, 8, 12, 16, 20, 24, 32`).
- **Radii:**
  - Compact controls & inputs: `10px`
  - POS product cards, segmented tracks & tabs: `12px`–`14px`
  - Primary panels, directory groups & dashboard cards: `16px`
  - Auth card & modal dialogs: `18px`–`20px` (mobile bottom sheet `22px 22px 0 0`)
  - Filter pills, badges & nav indicators: `999px`
- **Shadows (Tactile Minimalism):**
  - `--shadow-xs`: `0 1px 2px rgba(15, 23, 42, 0.04), 0 1px 3px rgba(15, 23, 42, 0.03)`
  - `--shadow-sm`: `0 4px 12px rgba(15, 23, 42, 0.06)`
  - `--shadow-md`: `0 10px 28px rgba(15, 23, 42, 0.08)`
  - `--shadow-modal`: `0 20px 50px rgba(15, 23, 42, 0.18)`

---

## 5. Layout, Navigation & Touch Guardrails

- **Desktop Chrome (`>= 1101px`):** Fixed `236px` left sidebar with store switcher, `44px` nav pills, frosted glass `60px` topbar (`rgba(255,255,255,.88)`, `backdrop-filter: blur(14px)`), and single emerald POS pill CTA.
- **Mobile Chrome (`<= 1100px`):** Frosted topbar + frosted 5-item bottom navigation with emerald pill active indicator, >= `44×44px` touch targets, `16px` input font sizes (prevents iOS zoom), `env(safe-area-inset-*)` clearance, and `overflow-x: clip` + `contain: layout` on scroll-tab bars to guarantee `0px` horizontal overflow.
- **Motion:** Subtle `140–220ms cubic-bezier(0.2, 0, 0, 1)` color/border/shadow transitions only; never animate layout dimensions or shift neighbors on hover/press; honor `@media (prefers-reduced-motion: reduce)`.
