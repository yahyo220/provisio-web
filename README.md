# Provisio — B2B Supply (Freshline Web)

Standalone web design build of the "Cool Command" design system — a light,
deep-green-on-pale-orange admin dashboard for a B2B food-supply platform.
This is a **separate design/prototyping project**, not yet wired to the
Freshline mobile app.

## Stack

- React 19 + TypeScript
- Vite 8
- Tailwind CSS v4 (via `@tailwindcss/vite`)
- React Router 7
- lucide-react (icons)

## Structure

```
src/
  styles/
    tokens.css       Design tokens as CSS custom properties (colors, type, spacing, radius, motion)
    base.css          Reset + base typography
    components.css    Shared component classes (topbar, buttons, cards, tables, forms, badges…)
  components/
    layout/           TopBar, AppLayout (route shell)
    ui/                Button, Card, Switch, StatusBadge, StatusPill, PaymentLabel, StockBadge
  pages/
    Dashboard.tsx      KPIs, revenue chart, category breakdown, top products, recent orders
    Orders.tsx         Order queue list with filters
    OrderDetail.tsx    Line items, timeline, customer info, related orders
    Products.tsx       Product catalog table
    AddProduct.tsx     New-product form
  lib/
    data.ts            Mock data (products, orders, KPIs…)
    types.ts           Shared TS types
```

## Design tokens

Canvas `#f7f2e7` · Ink `#1c1c18` · Primary (green) `#1e5c3e` · Secondary (rust)
`#d96b3a`. Display type: **Space Grotesk**. Body/UI type: **Schibsted Grotesk**.
Radii 6 / 10 / 16px. No shadows — depth comes from surface tint and whitespace.
See `src/styles/tokens.css` for the full token set.

## Run it

```bash
npm install
npm run dev
```

## Routes

- `/` — Dashboard
- `/orders` — Orders list
- `/orders/:orderId` — Order detail
- `/products` — Products catalog
- `/products/new` — Add product
