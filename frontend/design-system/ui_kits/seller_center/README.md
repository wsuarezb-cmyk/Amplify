# Seller Center — UI Kit

## Overview
High-fidelity recreation of the Seller Center Falabella web dashboard. Based on the brand assets, logo, and design tokens provided. No production codebase was attached — this UI kit is inferred from brand materials and Falabella's known seller platform conventions.

## Audience
**Internal users** — equipos de Journey, Inbound, Compliance, Soporte, Performance, Loyalty, Analytics y Comms/Marketing del seller. NO es para los sellers directamente.

## Screens (10)
Overview · Seller Journey · Inbound · Compliance · Soporte · Performance · Loyalty · Analytics · Comms & Marketing · Config

## Components (`Components.jsx`)
- `useViewport(containerRef)` — hook con ResizeObserver; devuelve `{ width, breakpoint, isMobile, isTablet, isDesktop }`
- `ResponsiveSidebar` — drawer (mobile) · icon rail 64px (tablet) · full 220px (desktop)
- `ResponsiveTopBar` — compacto con hamburguesa (mobile) · medio (tablet) · full con cmd+k (desktop)
- `KPIRow` — carrusel horizontal (mobile) · grid 2col (tablet) · row (desktop)
- `ResponsiveTable` — cards con accent (mobile) · scroll-x (tablet) · tabla full (desktop)
- `Card`, `FilterBar`, `Badge`, `MiniKPI`

## Breakpoints
- **mobile** &lt;768px
- **tablet** 768–1023px
- **desktop** ≥1024px

## Preview con drag handles
`responsive-preview.html` (root) — preview con window chrome y handles para resize en vivo.
