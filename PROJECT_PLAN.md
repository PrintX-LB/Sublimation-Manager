# PrintX Project Plan

## Overview

PrintX is a local single-computer administration application for a sublimation-printing business. It manages customers, products, orders, payments, stock, artwork and operational reporting.

## Current architecture

- Next.js App Router with TypeScript strict mode
- SQLite database with Prisma ORM and migrations
- Local file storage under `uploads/`
- Server Actions for mutations and server-side validation
- Tailwind CSS with the PrintX dark visual system
- Vitest and Playwright for automated checks

## Completed modules

- Customers and customer archiving
- Products, categories, variants and stock controls
- Orders, payments and status transitions
- Transactional stock commitment/restoration
- Local artwork uploads and print-ready exports
- Storage retention cleanup
- Admin Mode and secure test-order deletion
- Order Details production workspace
- Production Board Version 1

## Frozen Artwork Editor Version 1

The Fabric.js artwork editor is frozen as Version 1. Only confirmed production bugs may change it. New editor features require a separate milestone and regression review.

## Production Board Version 1

The `/production` board groups active orders by production status, highlights urgency and deadlines, and reuses the existing status, payment, artwork and stock services.

## Current roadmap

1. Revenue and Reports Version 1
2. Production workflow improvements
3. Operational quality and performance hardening
4. Optional future QR workflow

## Deferred QR workflow

QR production tickets, scanner routes, QR tokens and barcode-printer integration are intentionally deferred. They must not be added until a future milestone is approved.

## Known limitations

- The application is currently designed for one local Windows user.
- Activity history is derived from existing records where a dedicated event is not available.
- Production Board drag-and-drop is not implemented.
- Revenue reports are estimates when based on stored production-cost snapshots.

## Next milestone: Revenue and Reports

Build a server-aggregated financial dashboard with collected revenue, order value, outstanding balances, estimated profit, monthly trends, product/customer reports and CSV exports.
