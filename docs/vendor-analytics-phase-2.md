# Vendor Analytics Phase 2

This document captures the next analytics layer for the vendor dashboard after
the current operational analytics shipped from existing tables.

## Goals

- Track real listing demand before a request is created.
- Build a vendor funnel from discovery to approval.
- Preserve historical lifecycle dates for accurate weekly, monthly, and yearly
  reporting.
- Support future exports and advanced marketplace insights.

## Proposed Event Model

Add a normalized analytics event table:

```prisma
enum ListingAnalyticsEventType {
  SEARCH_IMPRESSION
  CATALOG_IMPRESSION
  CHATBOT_IMPRESSION
  VEHICLE_VIEW
  FAVORITE_ADDED
  PURCHASE_REQUEST_STARTED
  PURCHASE_REQUEST_CREATED
  RENTAL_REQUEST_STARTED
  RENTAL_REQUEST_CREATED
}

model ListingAnalyticsEvent {
  id        String   @id @default(uuid()) @db.Uuid
  vehicleId String   @db.Uuid
  vendorId  String   @db.Uuid
  userId    String?  @db.Uuid
  type      ListingAnalyticsEventType
  source    String?
  createdAt DateTime @default(now())

  vehicle Vehicle @relation(fields: [vehicleId], references: [id], onDelete: Cascade)
  vendor  Vendor  @relation(fields: [vendorId], references: [id], onDelete: Cascade)
  user    User?   @relation(fields: [userId], references: [id], onDelete: SetNull)

  @@index([vendorId, createdAt])
  @@index([vehicleId, createdAt])
  @@index([type, createdAt])
}
```

## Request Lifecycle Dates

Add explicit status timestamps instead of relying only on `updatedAt`:

- `approvedAt`
- `rejectedAt`
- `cancelledAt`
- `completedAt`

This makes metrics like “sold this month” and “response time” accurate even
when a request is edited later.

## Dashboard Metrics Enabled

- View-to-request conversion rate.
- Search impression-to-view click-through rate.
- Chatbot recommendation performance.
- Best traffic sources per listing.
- Average vendor response time.
- Listing freshness and price-change impact.
- Vehicle funnel:
  - impressions
  - views
  - favorites
  - requests
  - approvals

## Implementation Notes

- Write events from backend endpoints where possible for trustable data.
- Use frontend events only for low-risk UX analytics, such as card impressions.
- Avoid storing sensitive user data in event payloads.
- Keep event inserts non-blocking where possible.
- Aggregate in the API response first; introduce materialized summaries only
  after data volume requires it.
