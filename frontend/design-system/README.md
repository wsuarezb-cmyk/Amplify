# Seller Center Falabella — Design System

## Overview

**Seller Center** is the seller-facing platform of **Falabella**, one of Latin America's largest retail groups. The platform serves sellers across multiple LATAM markets: 🇲🇽 Mexico, 🇵🇪 Peru, 🇨🇱 Chile, 🇨🇴 Colombia, 🇦🇷 Argentina, and more.

The Seller Experience team (Gerencia de Seller Experience) is responsible for designing applications, web pages, dashboards, and brand assets for this platform.

**Products represented in this design system:**
- **Seller Center Web App** — The primary dashboard/panel for sellers managing listings, orders, inventory, and analytics on Falabella's marketplace
- **Internal design resources** — Icon library, flags, illustrations for presentation materials

### Sources Provided
- `uploads/New_sellersenter_logo.png` — Official Seller Center Falabella wordmark
- `uploads/Ejemplos Desing.pptx` — Design examples deck containing: ~165 Microsoft Fluent SVG icons, arrow/line assets, hand-drawn stroke resources, country flag circles for LATAM markets
- `uploads/imagen_2026-04-21_192758495.png` — Design inspiration reference (dark-themed analytics dashboards)

---

## CONTENT FUNDAMENTALS

### Tone & Voice
- **Language**: Spanish (primary), given the LATAM market focus
- **Register**: Professional but approachable — sellers are partners/entrepreneurs, not just users
- **Person**: Second person ("tú" or "usted" depending on market formality) — seller-centric, empowering language
- **Casing**: Sentence case for UI labels and headings; ALL CAPS used sparingly for status badges and micro-labels
- **Emoji**: Not used in the UI; color dots and iconography serve the same role as emoji in other brands
- **Numbers**: Use local formatting per market (e.g., `.` vs `,` as decimal separator)
- **Error messages**: Clear, actionable — tell the seller what happened and what to do next
- **Vibe**: Confident, data-forward, efficient. "Your platform works for you."

### Copy Examples (inferred from brand context)
- "Gestiona tus ventas" (Manage your sales)
- "Ver mis pedidos" (View my orders)
- "Publicar producto" (Publish product)
- "Panel de control" (Dashboard)

---

## VISUAL FOUNDATIONS

### Colors
The Seller Center brand is built on a **4-color dot system** visible in the wordmark:
- 🟢 **Green** `#5BA64A` — Primary action color; success states; CTAs
- 🔵 **Blue** `#3B5BA5` — Accent/secondary; informational; links
- 🔴 **Red/Pink** `#D91F4D` — Danger; alerts; destructive actions
- ⚫ **Gray** `#9E9E9E` — Neutral; disabled states; metadata

Neutrals range from `#1A1A1A` (near-black) to `#FFFFFF` (white), with a light gray background (`#F5F5F5`) as the default app surface.

### Typography
- **Display/Headings**: Montserrat (geometric sans-serif — matches the wordmark style). Weights: 600–800 for display, 500–600 for headings.
- **Body/UI**: Inter (humanist sans — clean and highly legible at small sizes)
- **Monospace**: JetBrains Mono (for data, IDs, code snippets)
- ⚠️ *Font substitution note*: The exact logo font is not confirmed. Montserrat is used as the closest freely-available match. If the team has a licensed font (e.g., a custom cut), provide the font files to replace this.

### Spacing
8px base grid. Spacing tokens: 4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96px.

### Backgrounds
- Default app background: `#F5F5F5` (light gray)
- Card/surface: `#FFFFFF` with subtle shadow
- No gradient backgrounds on surfaces (brand is clean/flat)
- Dark mode: not confirmed in provided materials; assume light-first

### Borders & Radius
- Cards: `border-radius: 8px` (medium rounding), `border: 1px solid #E0E0E0`
- Inputs: `border-radius: 4px`
- Tags/Badges: `border-radius: 9999px` (pill) or `4px` (square)
- No heavy borders; rely on shadow + background contrast

### Shadows
Subtle, layered shadow system — not dramatic. Cards use `0 2px 6px rgba(0,0,0,0.08)`. Modals use `0 8px 32px rgba(0,0,0,0.12)`.

### Animation & Motion
- Transitions: fast (120ms) for hover states; base (200ms) for state changes; slow (350ms) for modals/drawers
- Easing: `ease` (standard) — no bounces or spring animations
- Hover states: slight background color shift (`--color-gray-100`) + subtle shadow elevation
- Press/active states: slight scale-down (0.98) + darker background

### Iconography
Microsoft Fluent icons (SVG, 96×96 viewBox). Flat/filled style with a single accent color. See ICONOGRAPHY section below.

### Cards
- White background, `border-radius: 8px`, `border: 1px solid #E0E0E0`, `box-shadow: 0 2px 6px rgba(0,0,0,0.08)`
- Internal padding: 16–24px
- Hover: `box-shadow: 0 4px 16px rgba(0,0,0,0.10)`

### Imagery
- Country flags: circular crop, used to indicate market/country context
- No confirmed use of full-bleed photography in the Seller Center UI
- The design inspiration image shows a dark analytics UI — this appears to be aspirational/reference, not current production

### Transparency & Blur
- Limited use; no confirmed glassmorphism in the brand
- Backdrop blur may be used for modals on light backgrounds

---

## ICONOGRAPHY

### Icon System
The design team uses **Microsoft Fluent Icons** (formerly Microsoft Office icons) in SVG format. These are flat, monochromatic icons with a single theme color fill. ~165 icons are included in the design asset library.

**Icon IDs follow the pattern**: `Icons_{Name}_M` (e.g., `Icons_Rocket_M`, `Icons_Briefcase_M`)

**Icons available** (sample):
CheckboxCrossed, CheckIn, Checklist, CircularFlowchart, Clipboard, Connections, ContinuousImprovement, Couch, CreditCard, Eye, Flag, FlipCalendar, Flowchart, Follow, Globe, GoodInventory, Hanger, Heart, House, Label, Leaf, LeftBrain, Lock, MagnifyingGlass, Meeting, Money, Rocket, Briefcase, Bullseye, CallCenter, Chat, BoxTrolley, BadgeNew, BadgeTick, Blockchain, BoardRoom, Box, BranchingDiagram, Care, ArrowCircle, and more.

**Usage**: Icons are used in presentations and documentation. In the web UI, icons follow the same Fluent/outlined style. The accent color `#E25E6B` (red-pink, close to `--color-red`) is the default fill for active/selected states.

**Substitution**: For web production, the [Microsoft Fluent UI React Icons](https://www.npmjs.com/package/@fluentui/react-icons) package provides the same icon set as React components.

**Emoji**: Not used as icons. The colored dots in the logo serve as the brand's visual identity anchor.

### Country Flags
Circular flag images are used to indicate LATAM market context:
- 🇲🇽 Mexico (`image166.png`)
- 🇵🇪 Peru (`image167.png`)
- 🇨🇱 Chile (`image168.png`)
- 🇨🇴 Colombia (`image169.png`)
- 🇦🇷 Argentina (`image170.png`)

---

## FILE INDEX

```
/
├── README.md                    ← This file
├── SKILL.md                     ← Agent skill definition
├── colors_and_type.css          ← All CSS design tokens + semantic type styles
├── assets/
│   ├── logo.png                 ← Official Seller Center Falabella wordmark
│   ├── icons/                   ← 165 Microsoft Fluent SVG icons (image19–image183)
│   └── images/                  ← Country flag circles + reference images
├── preview/                     ← Design System tab preview cards
│   ├── colors-brand.html
│   ├── colors-neutral.html
│   ├── colors-semantic.html
│   ├── typography-display.html
│   ├── typography-body.html
│   ├── spacing-tokens.html
│   ├── radius-shadows.html
│   ├── components-buttons.html
│   ├── components-badges.html
│   ├── components-inputs.html
│   ├── components-cards.html
│   ├── brand-logo.html
│   └── brand-icons.html
└── ui_kits/
    └── seller_center/
        ├── README.md
        ├── index.html           ← Interactive UI kit prototype
        └── *.jsx                ← Component files
```
