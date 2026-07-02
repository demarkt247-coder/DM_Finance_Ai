# De Markt Finance - Process Pending Entries

This is the fixed prompt Windows Task Scheduler feeds to Claude Code on every
launch. Read this whole file before doing anything. Run the phases below in order,
in ONE session (no sub-agents - see architecture decision log, multi-agent split
was rejected as unnecessary overhead for this single-user batch workflow).

Master Sheet ID: 16QWNpDadAYW63YCPL90VxrVCFx9FOKX36wgoyOp2eTI
Drive inbox folder ID: 13LL2vD4NeXKrwtsMMewu474e6PBTZgBD

You have access to these tools via the dm-finance MCP server: sheets_read,
sheets_update, sheets_append, drive_read_image_base64, telegram_send. Use these,
not any other Drive/Sheets connector, since this session runs unattended and
only has the tools explicitly configured here.

## Hard rules (apply in every phase)

- NEVER guess or estimate a number. If anything is ambiguous, missing, or
  contradicts existing data - even by 1 Tk - stop, write it to the `_Flags` tab,
  send a Telegram message describing it, and move on. Do not block waiting for a
  reply.
- NEVER edit a committed manifest row. Corrections arrive as new rows (the founder
  replies to the bot's own confirmation message) and get appended, never used to
  overwrite history.
- Treat `_ProcessingLog` as the only source of truth. The `Dashboard` tab and all
  derived tabs get REBUILT from it each run, not incrementally patched - this is
  what keeps the numbers correct even if a run gets interrupted mid-way.
- Business loan repayments (Mahabub, Keya Apu) reduce the `Loans` balance only -
  never post them as an OpEx expense.
- Inter-bank/bKash transfers are only ever recorded when the founder explicitly
  says "transfer" (or equivalent) - never inferred from balance changes alone.
- Do arithmetic with Sheets formulas wherever possible (SUM/SUMIF/QUERY), not by
  reasoning through numbers yourself - keeps token cost down and avoids silent
  calculation drift.

## Phase 1 - Ingest and classify

1. Read `_ProcessingLog` tab, filter to rows where `status != committed`.
2. For rows with `status = in_progress` from a prior run (i.e. a crash happened
   mid-batch): re-verify before reprocessing, don't blindly restart - check
   whether the corresponding Dashboard/ledger update actually landed.
3. For each remaining row: set `status = picked_up`.
4. Read the raw content: `raw_text` for text rows, or read the image directly
   from Drive (`drive_file_id`) using your own vision for photo rows. Cache
   whatever you read from an image back into that row's `raw_text` column so the
   same image is never re-analyzed on a future run.
5. Classify each row into one of: sale, purchase, expense, staff salary, personal
   draw, supplier payment, ad spend, ad deposit, courier parcels, ATM/bKash
   withdrawal, bank/bKash transfer, correction (has `reply_to_message_id` set),
   or unclear.
6. Rows with `reply_to_message_id` set: look up the open `_Flags` row tied to
   that original message. This is the resolution of a prior flag - apply it,
   mark that flags row `status = resolved`, mark the manifest row `committed`,
   continue.

## Phase 2 - Bank/cash/loan ledger

1. For transfer, ATM/bKash withdrawal, and loan repayment entries: append a new
   row to `BankCash` (never edit the previous day's row) reflecting the change,
   carrying forward the prior day's balance for anything unaffected.
2. For loan repayments: update `Loans!current_balance` for the matching lender.
3. Cross-check: if a bank-side transaction is mentioned in text but nothing in
   `BankCash` explains it (e.g. no ATM withdrawal logged for a cash purchase),
   flag it - don't assume the movement happened silently.

## Phase 3 - Suppliers, purchases, products, orders/courier

1. Supplier payment rows: decrease `SupplierDues!current_due` for the matching
   supplier. Product purchase rows: increase it, and also update `Products`
   (new/updated blended average buying cost, +stock qty).
2. New product names: fuzzy-match against `Products` and `SKUAlias`. High
   confidence -> map automatically and log the alias. Anything below a strict
   confidence threshold -> flag for the founder, do not auto-merge (a wrong merge
   permanently corrupts blended-cost history).
3. Courier parcel entries: log against the relevant product's stock (outgoing),
   do not assume a matching sale exists - if parcel count and logged sales don't
   reconcile, flag it.
4. Sales rows: decrease `Products!stock_qty`, compute profit using the current
   blended buying cost for that SKU, AND append one row per product sold to the
   `Sales` tab: date (business_date, not today - matters for backfills),
   product (canonical name), qty, revenue (sell price x qty), cost (blended
   buying cost x qty), profit (revenue - cost). This tab is what the Dashboard's
   daily/weekly/monthly numbers and product chart are built from - a sale isn't
   fully processed until it's logged here, not just reflected in stock.

## Phase 4 - Flag unresolved items

1. Anything left unclear after phases 1-3: write a row to `_Flags`
   (status = open) and send ONE consolidated Telegram message listing all new
   flags from this run (not one message per flag).
2. Do not mark those manifest rows `committed` - leave them at whatever stage
   they reached; they'll be picked up again next run once resolved.
3. Message style - talk like a terse finance manager, not a system log:
   - Skip a "resolved" section entirely unless something meaningfully changed
     the dashboard (a restated balance, a corrected due). Routine confirmations
     ("logged your sale") don't need a line - the bot's ✅ reaction already
     covers that.
   - Each open question: one line, plain language, no explaining your own
     reasoning or showing the math. Prefix every question with ⚠️.
   - No "still open from before" recap of old unresolved items every run -
     only resurface those if it's been several days, otherwise the founder
     already knows they're pending.
   - Max ~5 short lines total. If there's nothing worth a message, don't send
     one.

## Phase 5 - Rebuild Dashboard

The `Dashboard` tab is a formatted KPI-card layout (see `format_dashboard.js`)
with live formulas pulling from `BankCash`, `SupplierDues`, `Loans`, and
`_Flags` - it recalculates automatically. Do NOT write values directly into
Dashboard cells; doing so overwrites the formulas and breaks the layout.

1. Confirm `BankCash`, `SupplierDues`, and `Loans` reflect everything committed
   this run - the Dashboard numbers are only as correct as those source tabs.
2. If the Dashboard's layout/formulas ever look broken or missing (e.g. cells
   show raw numbers with no "Tk" formatting, or a total is 0 when it shouldn't
   be), that means something overwrote them - re-run
   `processing/format_dashboard.js` to restore the layout, then re-verify.
3. Never edit Dashboard cells by hand/via write tool - only ever via that
   script.
4. Mark all rows that made it through every phase cleanly as `status = committed`.

## Phase 6 - Notify on dashboard change

If (and only if) this run committed at least one real transaction (not just
flag resolutions with no dashboard-affecting numbers), send ONE short Telegram
message with the dashboard link so the founder doesn't have to ask:

`Dashboard updated: https://docs.google.com/spreadsheets/d/16QWNpDadAYW63YCPL90VxrVCFx9FOKX36wgoyOp2eTI/edit`

If this run had nothing to commit (e.g. only flags, or nothing pending at
all), don't send this - it would just be noise on top of the Phase 4 flag
message (or no message at all if nothing happened).

## Done

Log a one-line summary to console/Task Scheduler log: rows processed, rows
flagged, dashboard last-updated timestamp. Exit.
