# Slink Design System (Master Reference — v5.0 / Slink 0.8.0)

> Industry-standard Vietnamese Retail Operations Design System (benchmarked against KiotViet Retail, Sapo POS, Shopify POS, and Square) across desktop PWA (`1440px+`) and Android 10+ / iOS (`390px+`).

---

## 1. Visual Identity & Aesthetic Direction

- **Style:** Clean Executive Retail & Financial Operations — Swiss grid discipline, crisp surface elevation, single authoritative emerald accent (`#0F6B4E`), tabular monospace/numeric clarity, zero decorative bloat.
- **Architecture:** Clean 1-layer CSS architecture (`styles.css` Design System Foundation + `workspace.css` Application Shell & Domain Screens Layer). Zero legacy `.calm-ui` override hacks.
- **Language & Script:** Vietnamese diacritics first (`Plus Jakarta Sans` + `JetBrains Mono` with full `vietnamese` glyph subsets and `font-variant-numeric: tabular-nums`).
- **Iconography:** Vector SVG icons exclusively — zero structural emojis in navigation, headers, buttons, KPIs, or action strips.

---

## 2. Semantic Color Tokens

| Role | Token | Hex Value | Usage |
| :--- | :--- | :--- | :--- |
| Primary Brand / Action | `--primary`, `--forest` | `#0F6B4E` | Primary buttons, POS CTA, active nav bar, hero KPI gradient start, focus rings |
| Primary Hover / Pressed | `--primary-hover`, `--forest-2` | `#0B553E` | Interactive hover/active states |
| Primary Soft Tint | `--primary-soft` | `#ECFDF5` | Selected nav pill, selected POS line/product tint, soft icon badges |
| Canvas Background | `--paper`, `--bg` | `#F4F6F5` | Main panel workspace backdrop |
| Elevated Card Surface | `--surface` | `#FFFFFF` | Panels, stat cards, product cards, enterprise tables, dialogs |
| Nested / Subtle Surface | `--surface-soft`, `--surface-subtle` | `#F8FAF9` / `#F1F5F3` | Subpanels, table headers, alternating rows, filter wells |
| Primary Text | `--ink` | `#0F172A` | Headings, monetary values, primary labels (>= 12:1 contrast) |
| Secondary Text | `--ink-secondary` | `#334155` | Table cells, body copy, secondary titles |
| Muted / Helper Text | `--muted` | `#52606D` | Captions, metadata, timestamps (>= 5.7:1 contrast on white) |
| Hairline Border | `--line`, `--border` | `#E2E8F0` | Cards, panels, table rows, dividers |
| Strong Control Border | `--border-strong` | `#CBD5E1` | Inputs, selects, secondary button outlines |
| Semantic Success | `--success` | `#047857` / `#ECFDF5` | Paid orders, positive growth, healthy stock |
| Semantic Warning | `--warning` | `#B45309` / `#FFFBEB` | Partial payments, low stock alerts |
| Semantic Danger | `--danger` | `#DC2626` / `#FEF2F2` | Errors, cash shortages, negative growth, destructive confirms |

---

## 3. Information Architecture & Chrome

### Desktop Backoffice (`>= 1101px`)
- **Grouped Sidebar (`248px`):**
  - Store Switcher header + prominent top CTA **`Bán hàng (POS)`** (switches cleanly to Fullscreen POS Mode).
  - Top-level & grouped navigation with clear RBAC gating (no off-brand Affiliate or F&B clutter):
    - `Tổng quan`
    - **Hàng hóa:** `Danh mục`, `Kho & Tồn kho`, `Kiểm kho`, `Chuyển kho`, `Serial & Bảo hành`
    - **Giao dịch:** `Đơn hàng & Trả hàng`, `Nhập hàng & Trả NCC`, `Khuyến mại`
    - **Đối tác:** `Khách hàng`, `Nhà cung cấp`
    - `Sổ quỹ`
    - `Báo cáo`
    - `Nhân viên`
    - `Cài đặt`
- **Fullscreen Hybrid POS (`body.pos-fullscreen`):** Hides Backoffice sidebar & Backoffice topbar completely so the POS Terminal occupies 100% viewport. Includes unified POS topbar (`F2` scan/search, multi-bill tabs, warehouse selector, cash shift indicator, voice toggle, **Touch Grid ↔ Fast Scan List** toggle, and `Về quản trị`), cart list with inline **per-line discount (`%` / `₫`)**, and 1-tap checkout panel.

### Mobile (`<= 1100px`)
- **Frosted Topbar + 5-Tab Bottom Navigation:** `Tổng quan` · `Đơn hàng` · **`[Bán hàng]`** (elevated center CTA) · `Hàng hóa` · `Thêm` (opens categorized **More Drawer** with Kho, Sổ quỹ, Khách hàng, Nhà cung cấp, Khuyến mại, Báo cáo, Nhân viên, Cài đặt).
- **Guardrails:** `>= 44×44px` touch targets, `16px` form controls (prevents iOS auto-zoom), `env(safe-area-inset-*)` clearance, `overflow-x: clip`, `0px` horizontal overflow.

---

## 4. Enterprise Modules & Data Visualization

- **Dashboard Onboarding & Analytics:** Dismissible 4-step new-store setup checklist computed live + "3 Con Số Thật" with period-over-period delta pills + pure inline SVG 7-day Revenue Bar Chart (CSP-safe, offline-capable).
- **KiotViet 4-Tab Product Detail & Stock Card (`Thẻ kho`):** Slide-over/modal with 4 tabs: `Thông tin & Giá` | `Thẻ kho` (chronological movement ledger) | `Tồn theo kho` | `Serial & Bảo hành`.
- **Enterprise Data Tables:** Unified filter toolbar, multi-row checkbox selection, sticky batch action bar (`In tem mã vạch`, `Sửa hàng loạt`, `Xuất CSV`), and crisp pagination.
- **Reports (End-of-Day & Visual Analytics):** 4 tabs (`Cuối ngày`, `Bán hàng & Lợi nhuận`, `Hàng hóa & Kho`, `Nhân viên & Khách hàng`) with presets + custom `from`/`to`, previous-period deltas, pure SVG Bar & Payment Donut charts, staff/category tables, CSV & printable PDF export.
