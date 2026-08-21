# Implementation Notes

This document explains how the SO Line Item Import plugin works internally, and
*why* it's built this way. It's meant to be read before making changes, so the
reasoning behind past decisions isn't lost.

For user-facing usage, see the [README](../README.md).

## Overview

The plugin adds an **"Import Sales Order Lines"** panel to the Sales Order
detail page in InvenTree. A user uploads an Excel file containing product
names/codes and quantities; the plugin parses it, resolves each row to a
salable `Part`, previews the result, and (on confirmation) creates
`SalesOrderLineItem` rows on the order.

Two components make this up:

- **Backend**: [`so_line_item_import/core.py`](../so_line_item_import/core.py)
  — a Django plugin (`AppMixin`, `UrlsMixin`, `UserInterfaceMixin`) exposing a
  single POST endpoint and a UI panel registration.
- **Frontend**: [`frontend/src/Panel.tsx`](../frontend/src/Panel.tsx) — a React
  component built with Vite and bundled into
  [`so_line_item_import/static/Panel.js`](../so_line_item_import/static/Panel.js),
  which InvenTree loads into the panel via `plugin_static_file`.

## Request flow

There is exactly **one** endpoint: `POST plugin/{slug}/import/so-lines/`
(registered in `setup_urls`, handled by `import_sales_order_lines`). It is used
for both the preview ("Upload Excel") and the real import ("Add to SO"), the
only difference being the `dry_run` form field.

Request payload (multipart form):

| Field | Description |
|---|---|
| `sales_order_id` | PK of the target `SalesOrder` |
| `file` | The Excel file (`.xlsx`/`.xlsm`) — **always required**, on every request |
| `dry_run` | `"true"` for preview, `"false"` for the real import |

For every request, regardless of `dry_run`, the backend:

1. Authenticates the user and checks `order.add_salesorderlineitem` permission.
2. Loads the `SalesOrder`.
3. Parses the uploaded file with `_parse_excel_rows` (via `openpyxl`).
4. For each row: validates the product name/quantity, resolves a `Part` via
   `_find_part_for_name`, and builds a `SalesOrderLineItem` (validated with
   `full_clean()`).
5. Wraps all of this in `transaction.atomic()`. If `dry_run` is true, the
   transaction is rolled back at the end (`transaction.set_rollback(True)`) so
   nothing is persisted — but validation still runs against live DB state
   (existing lines, part lookups, etc.) inside the transaction.
6. Returns a JSON summary: counts (`created_count`, `would_create_count`,
   `skipped_count`), `errors`, `unresolved` rows, and a `preview_rows` table
   used to render the UI table.

### Why the file is resent on every request (no server-side preview cache)

An earlier version of this plugin generated a preview (dry run), cached the
resolved rows server-side under a short-lived token (`django.core.cache`, 15
minute TTL), and had "Add to SO" just replay that cached data by token.

This was removed. It caused real problems:

- **Cache backend dependency**: relied on Django's cache (Redis in production,
  process-local `LocMemCache` in dev). With multiple Gunicorn workers, a
  `LocMemCache` write on one worker is invisible to another — the "Add to SO"
  request could land on a worker that never saw the token, producing a
  confusing "Preview token is invalid or has expired" error even seconds after
  the preview.
- **TTL/eviction problems**: even with Redis, a busy cache under memory
  pressure (`maxmemory-policy`) can evict short-lived keys before the 15
  minute TTL, or the token can simply expire if the user takes their time
  reviewing the preview table.
- **Staleness**: the cached preview stored resolved `part_id`s. If a part was
  deleted, renamed, or made non-salable between preview and confirmation, the
  cached-token import path would create a line against stale data, or crash
  outright — a real risk once more than one user can be editing data
  concurrently.

The current design avoids all of this: the frontend keeps the originally
selected `File` object in memory (`lastFileRef` in `Panel.tsx`) while the
preview is shown, and **resends that same file** when the user clicks
**"Add to SO"**. The backend re-parses and re-validates everything from
scratch against current DB state, in one atomic transaction, exactly as it did
for the preview. There is no cache, no token, and no expiry to reason about.

Trade-off: the file is parsed twice (once for preview, once for import). For
typical SO import spreadsheets this is milliseconds and is a small price for
removing an entire class of cache-consistency bugs. The UI shows a note that
results may differ slightly from the preview if underlying data changed.

## Part resolution rules (`_find_part_for_name`)

Given a cell value (an IPN or a part name, optionally prefixed like
`"EX Extrusion:MT-EX-06-06-120-51"`, normalized by `_parse_excel_rows` to just
`"MT-EX-06-06-120-51"`):

1. Exact, case-insensitive match on `Part.IPN`, filtered to `salable=True`.
2. If none, exact case-insensitive match on `Part.name`, filtered to
   `salable=True`.
3. If still none, check whether a part with that IPN/name exists but is
   **not** salable, to report a clearer `part_not_salable` reason instead of a
   generic "not found".
4. Otherwise, `part_not_found`.

No fuzzy matching or candidate suggestions are implemented (the `candidates`
field in `unresolved` rows is currently always empty) — this is a possible
future enhancement.

## Frontend state (`Panel.tsx`)

Key pieces of state, since the "preview" is now a purely client-side concept:

- `lastFileRef` (a `ref`, not state) — holds the last uploaded `File`. Set on
  "Upload Excel", read on "Add to SO".
- `lastResult` — the JSON response from the most recent request (preview or
  import), used to render the summary/preview table.
- `canImport` — `true` only when a preview has been run (`lastResult.dry_run`)
  **and** the file is still cached in `lastFileRef`. If the panel is
  reloaded, `lastFileRef` is lost and the user must re-upload — this is
  intentional, since there's nothing server-side to fall back on.

The "preview table" is effectively a modal-like view rendered inline in the
panel from `lastResult.preview_rows`, capped at `DISPLAY_ROW_LIMIT` (50) rows
for display.

## Known limitations / possible follow-ups

- No fuzzy/candidate matching for unresolved part names.
- The preview table renders at most `DISPLAY_ROW_LIMIT` rows; very large
  imports won't show every row in the UI (though all rows are still
  processed).
- `ExampleModel` in [`models.py`](../so_line_item_import/models.py) is
  leftover plugin-template boilerplate, unused by the import flow.
- Re-parsing the file twice (preview + import) is a deliberate trade-off (see
  above) — acceptable for typical spreadsheet sizes, but worth reconsidering
  if very large files become common.
