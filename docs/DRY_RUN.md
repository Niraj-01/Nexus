# NEXUS — Live Dry Run Playbook

**Project:** `buffet-493105` · **Region:** `asia-south1`

> **APP URL:** `__REPLACE_ME__` (use the App Hosting URL once deploy finishes, or the local URL if running on one machine: `http://localhost:3000`)

---

## Who does what

| Role | Person | Email | What they do |
|---|---|---|---|
| 🏛️ Host (NGO) | **Niraj** | `nirajvaidya32@gmail.com` | Raises the ticket, advances phases, uploads proof |
| 💰 FUNDS Contributor | **Albin** | `albinvishwas7@gmail.com` | Pledges money toward the ticket |
| 🏭 MANUFACTURING Contributor | **Dhrupad** | `dhrupadrajpurohit@gmail.com` | Pledges desk production capacity. Also runs admin commands. |

## Ground rules

- **One person acts at a time.** Don't click ahead — wait for the person before you to finish before you do your step.
- **Stay signed in to your own account.** Don't switch accounts mid-test.
- **Use the same browser the whole time.** Open Firebase Console (https://console.firebase.google.com/project/buffet-493105/firestore) in a side tab if you want to peek at data.

---

# Part A — Before the test (one-time setup, ~15 minutes)

## A.1 — All three: create your accounts

**Each of you, in your own browser:**

1. Go to **`<APP_URL>/signup`**
2. Click "Sign in with Google" and pick the account assigned to your role above
3. After signup you'll land on the dashboard. It will say "Finish onboarding" — click **Start onboarding**
4. You're now on `/onboard`. Fill in:
   - **Niraj** — Org type: `NGO`, Org name: `Niraj Foundation`, Region: `Panvel, MH`
   - **Albin** — Org type: `ORG`, Org name: `Albin Capital`, Region: `Panvel, MH`
   - **Dhrupad** — Org type: `ORG`, Org name: `Dhrupad Manufacturing`, Region: `Panvel, MH`
5. Submit. Your dashboard will now say **"Pending admin approval"** — that's expected; the approval gate must run before you can list resources or raise tickets. Wait for A.2. (If you click `/resources` early you'll see a clearer "Your organization is awaiting admin review" message — same gate, just a different page.)

## A.2 — Dhrupad: approve all three orgs from `/admin`

**Prerequisite:** All 3 of you have completed A.1. Each dashboard should
show a yellow **"Pending review"** banner.

**Dhrupad does this. Niraj and Albin: just wait — your dashboard will
flip from "Pending review" to live within a second of being approved.
No sign-out, no refresh.**

### Step 1 — Open the admin page

Dhrupad: navigate to **`<APP_URL>/admin`**. (No link from anywhere else
in the app — type the URL.)

### Step 2 — Sign in with Google

Click **Sign in with Google** → pick `dhrupadrajpurohit@gmail.com`.
The page bootstraps your `PLATFORM_ADMIN` claim automatically (you'll
see "setting up admin claim…" briefly), then shows pending orgs live.

If you sign in with any other account: you'll see "Access denied" —
sign out, try again with the right account.

### Step 3 — Approve each pending org

Three cards: **Niraj Foundation**, **Albin Capital**, **Dhrupad
Manufacturing**. Click **Approve** on each. Cards disappear as the
status flips. Each click takes ~1-2s.

The `/admin` page lists pending orgs **live** via Firestore
subscription — if Niraj submits onboarding while you're already on
the page, his org pops in without a refresh.

### That's it

- **Niraj and Albin:** within ~1 second of being approved, whatever page you're on transitions itself to the live state — no sign-out, no manual refresh. The auto-refresh runs in `AuthProvider`, so it fires on `/dashboard`, `/resources`, `/tickets/...` — every page.
- Continue with A.3.

> **Backup CLI flow:** if `/admin` is down for any reason, you can run
> `npm run approve` from `nexus/` (after `firebase login`). It does the
> same thing as the page. See [scripts/approveAll.ts](../scripts/approveAll.ts).

> **Troubleshooting**
> - "Access denied" but you signed in as Dhrupad → check the Google account picker; you may have picked the wrong one. Sign out and try again.
> - Bootstrap errors → check Firebase Console → App Hosting → backend `nexus` → Logs for the `/api/admin/bootstrap` route.
> - Approved org's user still sees "Pending admin approval" 5+ seconds after approval → manually refresh their browser tab (the auto-refresh effect in `AuthProvider` should run but may have hit a transient error).

## A.3 — Albin: list your FUNDS resource

**Albin:**

1. Go to **`<APP_URL>/resources/new`**
2. Fill in the form exactly:

| Field | Value |
|---|---|
| Category | `FUNDS` |
| Title | `Demo financial pool` |
| Quantity | `100000` |
| Unit | `INR` |
| Valuation (INR) | `100000` |
| Latitude | `18.9894` |
| Longitude | `73.1175` |
| Service radius (km) | `50` |
| Available from | today |
| Available until | 30 days from today |
| Emergency contract enabled | unchecked |

3. Submit. Wait ~10 seconds, then refresh `/resources` and confirm your resource appears.

## A.4 — Dhrupad: list your MANUFACTURING resource

**Dhrupad:**

1. Go to **`<APP_URL>/resources/new`**
2. Fill in the form exactly:

| Field | Value |
|---|---|
| Category | `MANUFACTURING` |
| Title | `Demo desk production line` |
| Quantity | `200` |
| Unit | `desks` |
| Valuation (INR) | `200000` |
| Latitude | `18.9894` |
| Longitude | `73.1175` |
| Service radius (km) | `50` |
| Available from | today |
| Available until | 30 days from today |
| Emergency contract enabled | unchecked |

3. Submit. Wait ~10 seconds, then refresh `/resources` and confirm.

## A.5 — Optional: make badge numbers look interesting

Default reliability is 0.7 across all orgs, so badges will all show ~70% of fair share. To get varied numbers in the demo, **Dhrupad** opens Firebase Console → Firestore → `organizations/{eachOrgId}.reliability` and edits:

- Niraj's org: set `agreement.score = 95`, `execution.score = 95`, `closure.score = 95`
- Albin's org: set `agreement.score = 80`, `execution.score = 80`, `closure.score = 80`
- Dhrupad's org: leave defaults (70 / 70 / 70)

Skip this if you're short on time — the test still passes either way.

---

# Part B — The Test (Steps 1-7)

## STEP 1 — Niraj raises the ticket

**Niraj:**

1. Click **"Raise a ticket"** in the topbar (or the hero button on the dashboard) — both link to `/tickets/new`. (You can still type the URL if you want.)
2. Fill in the form exactly:

| Field | Value |
|---|---|
| Title | `100 desks for Panvel school` |
| Description | `Local primary school needs 100 study desks before the new term begins. Funds and manufacturing capacity both welcome.` |
| Category | `EDUCATION` |
| Urgency | `Normal — agreement-first` |
| **Need #1 — Resource** | `FUNDS` |
| Need #1 — Quantity | `40` |
| Need #1 — Unit | `desks-equivalent` |
| Need #1 — Valuation (INR) | `40000` |
| Need #1 — You pledge (qty / INR / %) | `0` / `0` / `0` |
| **Click "+ Add need"** | |
| **Need #2 — Resource** | `MANUFACTURING` |
| Need #2 — Quantity | `60` |
| Need #2 — Unit | `desks` |
| Need #2 — Valuation (INR) | `60000` |
| Need #2 — You pledge (qty / INR / %) | `0` / `0` / `0` |
| Admin region | `Panvel, MH` |
| Latitude | `18.9894` |
| Longitude | `73.1175` |
| Deadline | 14 days from today (default) |

3. Click **"Raise ticket"**.

**You should see:**
- Toast: **"Ticket raised"**
- Browser jumps to `/tickets/<some-id>` — **copy this URL into your team chat** so Albin and Dhrupad can use it
- Phase chip: **"Open"** (blue)
- Overall progress: **0%**
- The "Raise a ticket" button is still in the topbar; tickets/new isn't a one-shot.

✋ **Wait 10 seconds** for the matching trigger to run before Albin and Dhrupad refresh their dashboards.

---

## STEP 2 — Albin and Dhrupad see the ticket on their dashboards

**Albin AND Dhrupad (both at the same time):**

1. Go to **`<APP_URL>/dashboard`** (or refresh if you're already there)

**You should see:**
- Under **"Recommended for you"**, a card titled **"100 desks for Panvel school"** appears. The feed is now driven by the `matches/` collection (per-org match docs the matching trigger writes), not by a flat tickets list.
- The card shows a "fills X%" chip from the match doc plus a one-liner reason ("You listed FUNDS in Panvel" / "You listed MANUFACTURING in Panvel").
- A **"View"** button on the right side of the card.

If the card doesn't appear, wait another 10 seconds and refresh — the matching trigger and embedding step occasionally cold-start. **If you see the empty-state "No matches yet — list more resources or wait for new tickets to land"**, your resource hasn't been embedded yet — check `resources/<your id>.embeddingStatus`; it should say `"ok"` before matches materialize.

---

## STEP 3a — Albin proposes a FUNDS pledge

**Albin:**

1. On `/dashboard`, click **"View"** on the ticket card → opens `/tickets/<id>`
2. Scroll down to the **"Pledge to this ticket"** card (it appears automatically)
3. The form has FOUR fields. Don't change any of them unless you want to:
   - **Need:** `#1 · FUNDS (40 desks-equivalent)` — leave it.
   - **Your resource:** `Demo financial pool — 100000 INR free` — picked from your listed resources, filtered to FUNDS, with the live free-quantity shown.
   - **Quantity (INR):** pre-fills at **40000** — the lower of (your inventory free, remaining-need cap). Leave it.
   - **Notes (optional):** leave blank.
4. The hint line below the inputs reads: `Remaining capacity on this need: 40000 INR · your inventory free: 100000 INR`.
5. The button label is **"Submit for approval"** (not "Pledge now") because this is a Normal-urgency ticket, so the host's explicit approval is required. Click it.

**You should see:**
- Toast: **"Pledge proposed. Waiting for the host to approve it."**
- The pledge form stays visible (you can submit another partial later if you want), and a new **"Your contributions (1)"** card appears below it: `40000 INR · need #1 · status PROPOSED`.
- **Need #1 progress bar does NOT move yet.** Overall progress stays at **0%**. Inventory is not reserved either — that all happens at host APPROVE time.

---

## STEP 3a-bis — Niraj approves Albin's pledge

**Niraj:**

1. Open the ticket URL (refresh if you're already there).
2. Scroll past "Host controls" to the new **"Proposed pledges (1)"** section. This panel is host-only and only renders while at least one PROPOSED pledge exists.
3. Card shows: `Albin Capital · 40000 INR · need #1` with **Approve** and **Reject** buttons.
4. Click **Approve**.

**You should see (within ~2s, on every open browser of this ticket):**
- Toast (Niraj): **"Pledge approved."**
- The "Proposed pledges" section disappears — no PROPOSED items remain.
- **Need #1 progress bar fills to 100%.** Overall progress jumps to **40%**.
- On Albin's ticket page: his "Your contributions" card flips to `status COMMITTED`. Behind the scenes `resources/<Albin's resource>.reservedQuantity` is now `40000`.

---

## STEP 3b — Dhrupad proposes MANUFACTURING; Niraj approves

**Dhrupad:**

1. Open the ticket URL Niraj shared (or click **"View"** from your `/dashboard`).
2. Scroll to **"Pledge to this ticket"**:
   - **Need:** `#2 · MANUFACTURING (60 desks)`
   - **Your resource:** `Demo desk production line — 200 desks free`
   - **Quantity:** pre-fills at **60**.
3. Click **"Submit for approval"** → toast: **"Pledge proposed. Waiting for the host to approve it."**

**Niraj:**

4. Refresh the ticket. **"Proposed pledges (1)"** is back, this time with `Dhrupad Manufacturing · 60 desks · need #2`. Click **Approve**.

**You should see:**
- Toast (Niraj): **"Pledge approved."**
- Need #2 progress bar fills to **100%**, overall progress jumps to **100%**.
- Dhrupad's contribution flips to `status COMMITTED`; his resource's `reservedQuantity` is now `60`.
- A **"Contributors (2)"** strip appears at the bottom of the ticket showing both org names.

---

## STEP 4 — Niraj advances to EXECUTION

**Niraj:**

1. Open the ticket URL (the same one you raised in Step 1; refresh if needed)
2. Scroll to the **"Host controls"** card at the bottom
3. Click **"Move to execution"**

**You should see:**
- Toast: **"Phase: EXECUTION"**
- Phase chip flips to **"Executing"** (orange)
- The "Host controls" card now shows a file picker + a "Mark execution complete" button

**Preconditions enforced server-side (you don't need to check, just be aware):**
- ≥1 COMMITTED contribution must exist. If you forgot to APPROVE in 3a-bis/3b and try to advance with everything still PROPOSED, you'll see *"Cannot advance to EXECUTION with zero COMMITTED contributions."*
- Any pledge still in PROPOSED at this moment is **auto-rejected** in the same transaction with `rejectReason: "auto-rejected: ticket advanced before host approved"`. Their authors will silently see the row vanish from "Your contributions" — no toast, no error. (See failure test C.5 if you want to demo this on purpose.)

---

## STEP 5a — Niraj uploads a photo proof

**Niraj:**

1. In the **"Host controls — execution"** card, click the file input
2. Pick any image from your computer (a screenshot is fine)
3. Wait ~3 seconds

**You should see:**
- Toast: **"Photo proof uploaded."**

You can upload more if you want, but one is enough.

---

## STEP 5b — Niraj marks execution complete

**Niraj:**

1. Same card. Click **"Mark execution complete"**

**You should see:**
- Toast: **"Phase: PENDING_SIGNOFF"**
- Phase chip flips to **"Awaiting sign-off"**
- The host card switches to **"Awaiting contributor signoffs"** with no buttons

⚠️ **If you forgot to upload a proof first**, the toast will say *"Upload at least one photo proof before marking execution complete."* — go back to 5a, upload a proof, then click again.

---

## STEP 5c — Albin confirms delivery

**Albin:**

1. Open the ticket URL (refresh if needed)
2. Scroll to **"Sign off on this delivery"** (only appears for you because your contribution is now EXECUTED)
3. Click **"Confirm delivery"**

**You should see:**
- Toast: **"Delivery confirmed."**
- The signoff card disappears
- Phase chip stays **"Awaiting sign-off"** (still waiting on Dhrupad)

---

## STEP 5d — Dhrupad confirms delivery (the ticket auto-closes!)

**Dhrupad:**

1. Open the ticket URL (refresh if needed)
2. Scroll to **"Sign off on this delivery"**
3. Click **"Confirm delivery"**

**You should see (within 3 seconds):**
- Toast: **"Delivery confirmed."**
- **All three of you, on your screens**, the phase chip flips to **"Closed"** (gray)
- Niraj's "Host controls" card disappears entirely

**The ticket has auto-closed.** Done.

> **Single signoff covers ALL of a contributor's contributions.** If a contributor pledged twice on the same ticket (see C.4 for the partial-fulfillment scenario), one click on "Confirm delivery" flips every EXECUTED contribution from that org to SIGNED_OFF in a single transaction. They don't need to confirm twice.

---

## STEP 6 — Verify it's actually closed

**Anyone (Dhrupad easiest since he has admin):**

1. Open Firebase Console → Firestore → `tickets/<the-ticket-id>`
2. Confirm:
   - `phase: "CLOSED"`
   - `closedAt` has a recent timestamp

---

## STEP 7 — See the badges that got minted

**Anyone:**

1. Open Firebase Console → Firestore → `badges` collection
2. You should see **3 new docs** (IDs end with the ticket ID):
   - One for Niraj (role: HOST)
   - One for Albin (role: CONTRIBUTOR, ~40% × his reliability score)
   - One for Dhrupad (role: CONTRIBUTOR, ~60% × his reliability score)
3. Open each org doc (`organizations/<orgId>`) → field `badges` should now have one new entry per closed ticket
4. Open Albin's resource (`resources/<id>` → `Demo financial pool`) → `quantity` is now `60000` (was 100000), `reservedQuantity` is back to `0`, `status` is still `AVAILABLE`. Same shape on Dhrupad's resource: `quantity: 140` (was 200), `reservedQuantity: 0`. The `onTicketClosed` trigger ran `commitInventory` for every SIGNED_OFF contribution, so the kits really left the inventory.

🎉 **The full lifecycle works.** This is what you'll show the judges.

---

# Part C — Failure tests (prove the gates hold)

Run these on **a NEW ticket** each time. Don't re-use the closed one.

## C.1 — Early closure is blocked (a Dispute stops auto-close)

**Setup:** Repeat Steps 1, 2, 3a, 3b, 4, 5a, 5b on a brand-new ticket (e.g., title "Failure test 1").

**At Step 5c, Albin disputes instead of confirming:**

1. Albin clicks **"Dispute"** instead of "Confirm delivery"
2. A textarea appears — type `Test dispute — partial delivery only`
3. Click **"Submit dispute"**

**You should see:**
- Toast: **"Dispute recorded."**
- Phase stays **"Awaiting sign-off"**

**Now Dhrupad confirms normally:**
- Toast: **"Delivery confirmed."**
- **Phase DOES NOT change to Closed.** Stays "Awaiting sign-off" forever.
- Firebase Console → query `badges where ticketId == <this ticket id>` → **empty**

Proves: a single dispute permanently blocks ticket closure.

---

## C.2 — An org with no resources can't pledge

**Setup:** A fourth person (or one of you in incognito mode) signs up with a fresh email. Complete onboarding so the org exists, get Dhrupad to approve from `/admin`, but **don't list any resources**.

1. Sign in as the new account
2. Open `/dashboard`
3. Open the failure-test ticket URL directly

**You should see:**
- Dashboard "Recommended for you" shows the empty state: **"No matches yet — list more resources or wait for new tickets to land."** No ticket cards (no resource → no match docs got generated).
- On the ticket detail page, the **"Pledge to this ticket"** form DOES render (form is shown whenever the ticket is OPEN_FOR_CONTRIBUTIONS), but:
  - The "Your resource" dropdown shows `No matching resource listed`.
  - The Submit button is disabled.
  - A hint reads: `You need to list a FUNDS resource on your /resources page before pledging.` (or whichever category the selected need calls for).
- Server-side: even if you bypassed the form and called the `pledge` callable directly with a fake `resourceId`, the server rejects with `"Resource not found"` or `"You can only pledge resources owned by your org"`.

Proves: orgs without matching resources literally cannot pledge — the gate is enforced at three layers (matching feed, form filter, server callable).

---

## C.3 — Skip verification = no impact

**Setup:** Raise a brand-new ticket through Steps 1, 2, 3a, 3b, 4 only. Stop after Niraj advances to EXECUTION.

**Then do nothing else for 60 seconds.** No proof. No "Mark execution complete". No signoffs.

**You should see (after 60 seconds):**
- Phase still **"Executing"** — never reaches "Closed"
- Firebase Console → query `badges where ticketId == <this ticket id>` → **empty**
- No badges in any of the three org docs

Proves: badges only exist for fully-verified work.

---

## C.4 — Incremental partial pledges (the 50→30 scenario)

Demonstrates the multi-pledge-per-ticket flow that the schema and UI now support.

**Setup:** Niraj raises a brand-new ticket: title "Failure test C.4", single need = **80 INR FUNDS** (no MANUFACTURING need this time). Albin already has his 100,000 INR `Demo financial pool` from A.3.

1. **Albin (first pledge):** open the ticket. The pledge form's quantity pre-fills at `80` (the lower of inventory free and remaining-need cap). **Change it to 50** and submit. Toast: "Pledge proposed."
2. **Niraj approves:** "Proposed pledges (1)" → Approve. Albin's contribution flips to COMMITTED, progress 62.5%, Albin's resource `reservedQuantity = 50`.
3. **Albin (second pledge, same ticket, same browser tab — no reload required):** the pledge form is still visible. The hint line now reads `Remaining capacity on this need: 30 INR · your inventory free: 99950 INR`. Quantity pre-fills at `30`. Submit → second toast: "Pledge proposed."
4. **Albin's "Your contributions (2)"** card now lists both pledges: `50 INR · status COMMITTED` and `30 INR · status PROPOSED`.
5. **Niraj approves the second:** progress 100%, Albin's resource `reservedQuantity = 80`.

**Verifies:**
- Multiple non-REJECTED contributions per (ticket, org) are allowed.
- Each submit mints a fresh `requestId` so the second submission doesn't collide on idempotency (no spurious 409).
- The per-need cap (50 first → 30 remaining) is enforced and visible client-side before submit.

---

## C.5 — Phase advance auto-rejects stranded PROPOSED

Demonstrates the safety net that prevents a contributor from being stuck in PROPOSED forever.

**Setup:** Niraj raises a brand-new ticket with the standard FUNDS+MANUFACTURING needs.

1. **Albin pledges 40 FUNDS** → PROPOSED. Niraj does NOT approve.
2. **Dhrupad pledges 60 MANUFACTURING** → PROPOSED. Niraj approves Dhrupad's only.
3. **Niraj clicks "Move to execution"** while Albin's pledge is still PROPOSED.

**You should see:**
- Toast (Niraj): "Phase: EXECUTION".
- Albin's "Your contributions" card silently disappears (no toast on his end).
- Firebase Console → Albin's contribution doc: `status: REJECTED`, `rejectedAt: <recent>`, `rejectReason: "auto-rejected: ticket advanced before host approved"`.
- The ticket continues with only Dhrupad's MANUFACTURING contribution into EXECUTION → PENDING_SIGNOFF → CLOSED. Albin gets no badge.

**Verifies:** the `advancePhase` transaction batch-rejects every PROPOSED contribution at the moment of advance — no orphaned proposals stay alive past their decision window.

---

## C.6 — Per-need over-pledge is blocked server-side

**Setup:** Niraj raises a brand-new ticket with a single FUNDS need of **40 INR**.

1. Albin pledges 40 → PROPOSED → Niraj approves → COMMITTED, need at 100%.
2. Albin tries to pledge 1 more INR on the same need.

**You should see:**
- Pledge form: quantity input `max=0`, hint reads `Remaining capacity on this need: 0 INR`. Submit button disabled.
- If you bypass the disabled state (e.g. by typing in the input anyway), server rejects with toast: **"This need has only 0 INR of remaining capacity (you asked for 1)."**

**Verifies:** the per-need cap holds even if the client UI is tampered with. The server's `pledge` callable counts every non-REJECTED contribution on the need (PROPOSED + COMMITTED + EXECUTED + SIGNED_OFF) when computing the cap.

---

## C.7 — Host rejects a proposal; contributor re-pledges

**Setup:** Niraj raises a brand-new ticket with the standard needs. Albin pledges 40 FUNDS → PROPOSED.

1. **Niraj clicks Reject** in "Proposed pledges". A note input appears — type `wrong category, please re-pledge with a different resource` and click **Confirm reject**.
2. Toast (Niraj): "Pledge rejected."

**You should see (Albin):**
- His "Your contributions" card disappears (REJECTED contributions are filtered out client-side; the doc still exists in Firestore).
- The pledge form is still visible with quantity defaulting to 40 again — he can submit a fresh proposal.
- The per-need cap is back to 40 INR remaining (REJECTED contributions don't count toward the cap).

**Verifies:** REJECTED contributions don't block re-pledging, and rejecting a proposal correctly refunds headroom on the per-need cap.

---

# Part D — Cleanup between runs

If you want to re-test from scratch:

1. Firebase Console → Firestore → `tickets/` — delete the test ticket docs (this auto-deletes their subcollections)
2. Firebase Console → Firestore → `badges/` — query `where ticketId == <oldTicketId>` and delete each result (3 per closed ticket)
3. Each org's `organizations/<orgId>.badges` array still has the old entries — manually edit each org doc and remove them, or just leave them (next badges will append, not duplicate)
4. **Resource inventory was actually consumed** by every closed ticket. Open `resources/<your resource id>` in the Firestore Console:
   - `quantity` is decremented by the total committed amount across all closed tickets.
   - `reservedQuantity` should be `0` (committed contributions have been consumed; any DISPUTED ones were refunded by `onTicketClosed`).
   - To reset to the original numbers, edit the doc directly (set `quantity` back to `100000` / `200`, `reservedQuantity` to `0`, `status` to `AVAILABLE`).
5. Stranded test contribution docs from C.4–C.7 have `rejectReason` fields that make them safe to bulk-delete without consequence — none of them ever reserved inventory.

You **do not** need to re-onboard. Auth + org docs persist, and admin approval is sticky.

---

# Part E — Help! Something broke

| What happened | Why | What to do |
|---|---|---|
| "View" button missing on dashboard card | Your resource isn't ready yet | Wait 30 seconds and refresh. Check Firebase Console → `resources/<your resource id>` → `embeddingStatus` should say `"ok"`. Without an embedding, the matching trigger doesn't write a match doc, and the new `RecommendedTicketsList` only shows tickets you have a match for. |
| "No matches yet" empty state on dashboard despite having a resource | Embedding still pending, or ticket category doesn't overlap your resource category | Check `embeddingStatus` first. If `ok`, confirm the ticket has at least one need with the same `resourceCategory` as your resource. |
| "Pledge proposed" toast but progress bar didn't move | Non-rapid tickets land in PROPOSED until the host explicitly approves | Niraj opens the ticket → "Proposed pledges" panel → Approve. Inventory and progress only move on APPROVE. |
| Submit shows "This need has only N units of remaining capacity" | The need is fully or partially fulfilled by other (or your own earlier) non-REJECTED pledges | Pledge a smaller amount, or wait for a host to REJECT a competing PROPOSED pledge to free headroom. |
| Submit shows "Resource has only N units available" | Your resource is fully reserved across other open tickets | List more inventory in `/resources/new`, or wait for one of those tickets to close (`onTicketClosed` commits inventory and frees the reservation). |
| Contribution silently disappeared from "Your contributions" | Either the host advanced phase before approving (auto-reject, see C.5) OR your PROPOSED pledge sat for 36h+ and the TTL sweep auto-rejected it | Open Firestore → contribution doc → read `rejectReason`. It tells you exactly which path triggered. |
| "Move to execution" gives "Cannot advance to EXECUTION with zero COMMITTED contributions" | You're trying to advance but every pledge is still PROPOSED | Approve at least one pledge first (or pledge yourself if you also raised the ticket — but hosts can't pledge on their own tickets, so you actually need a contributor). |
| "Move to execution" button doesn't show | You're not the host | Check that you're signed in as Niraj |
| "Mark execution complete" gives an error | You haven't uploaded a proof yet | Upload one first, then click again |
| "Confirm delivery" gives an error | Niraj hasn't advanced to EXECUTION yet | Tell Niraj to do Step 4 first |
| Auto-close didn't fire after both signoffs | Trigger cold start | Wait another 15 seconds and refresh. If still nothing, in PowerShell: `firebase functions:log --only onSignoffRecorded` |
| No badges after close | Trigger error | In PowerShell: `firebase functions:log --only onTicketClosed` |
| Resource `quantity` didn't decrease after a closed ticket | Inventory commit didn't run | Check `firebase functions:log --only onTicketClosed` for errors in `commitInventory`. The trigger commits one transaction per SIGNED_OFF contribution; one transaction failure doesn't block the others. |
| Can't sign in with Google | Domain not authorized | Dhrupad: open Firebase Console → Authentication → Settings → Authorized domains → add the URL hostname |

---

# Part F — What's new in this build (function map)

A quick lookup of every behavioral change shipped across the three rounds, mapped to the exact file each lives in. Useful if a judge asks "where does that gate live?" or if you need to grep the compiled output during the demo.

## Backend — callables (`functions/src/callables/`)

| Behavior | File |
|---|---|
| Pledge requires `resourceId`; client sends quantity only; valuation, kind, unit, pctOfNeed all server-derived from the resource doc; rapid tickets commit instantly, normal tickets land as `PROPOSED`; per-need cap counts every non-REJECTED contribution | [`pledge.ts`](../functions/src/callables/pledge.ts) |
| Host APPROVE/REJECT for a PROPOSED pledge; APPROVE re-checks the per-need cap, re-validates the resource, and calls `reserveInventory`; REJECT records `rejectedAt` + `rejectReason` with no inventory effect | [`respondToPledge.ts`](../functions/src/callables/respondToPledge.ts) (NEW) |
| OPEN→EXECUTION batch-rejects every still-PROPOSED contribution in the same transaction; requires ≥1 COMMITTED; EXECUTION→PENDING_SIGNOFF requires ≥1 photo proof and ≥1 EXECUTED contribution | [`advancePhase.ts`](../functions/src/callables/advancePhase.ts) |
| Single signoff covers ALL of a contributor's EXECUTED contributions on a ticket (multi-flip); deterministic signoff doc id `${ticketId}__${orgId}` keeps closure logic correct | [`recordSignoff.ts`](../functions/src/callables/recordSignoff.ts) |

## Backend — triggers (`functions/src/triggers/`)

| Behavior | File |
|---|---|
| Closure is gated on a strict `expected ⊆ received` set comparison of contributors; malformed contribution docs block close instead of silently undercounting | [`onSignoffRecorded.ts`](../functions/src/triggers/onSignoffRecorded.ts) |
| On CLOSED, commits inventory for SIGNED_OFF contributions (`quantity -= qty, reservedQuantity -= qty`) and refunds for DISPUTED/EXECUTED contributions; mints badges from server-derived valuation | [`onTicketClosed.ts`](../functions/src/triggers/onTicketClosed.ts) |
| Resource category change → walks every match referencing this resource; deletes if the new category doesn't fit the ticket's needs. Inventory state never deletes a match (per design rule) | [`onResourceUpdated.ts`](../functions/src/triggers/onResourceUpdated.ts) (NEW) |
| Resource hard-deleted → bulk-deletes every match doc referencing it as `topResourceId` | [`onResourceDeleted.ts`](../functions/src/triggers/onResourceDeleted.ts) (NEW) |

## Backend — scheduled (`functions/src/scheduled/`)

| Behavior | File |
|---|---|
| Every 30 min: auto-reject every PROPOSED contribution older than 36h with `rejectReason: "auto-rejected: 36h TTL expired without host response"` so the per-need cap doesn't lock indefinitely | [`proposedPledgeTtlSweep.ts`](../functions/src/scheduled/proposedPledgeTtlSweep.ts) (NEW) |

## Backend — shared lib (`functions/src/lib/`)

| Behavior | File |
|---|---|
| `reserveInventory`, `commitInventory`, `refundInventory` — all transactional; derive `resource.status` from `(quantity, reservedQuantity)`. Used from `pledge`, `respondToPledge`, `onTicketClosed`. | [`inventory.ts`](../functions/src/lib/inventory.ts) (NEW) |
| Two-state idempotency (IN_FLIGHT → COMPLETED); concurrent retries get `aborted` instead of silently returning success without re-running side effects | [`idempotency.ts`](../functions/src/lib/idempotency.ts) |

## Frontend (`app/(app)/...` and `lib/auth/...`)

| Behavior | File |
|---|---|
| Universal post-approval token refresh — when `organizations/{uid}.status` flips to ACTIVE while `claims.orgId` is missing, force `getIdToken(true)` once. Lifted from the dashboard so every page benefits. | [`lib/auth/AuthProvider.tsx`](../lib/auth/AuthProvider.tsx) |
| Status-aware Resources gating: `undefined` org → "Finish onboarding"; `PENDING_REVIEW` → "Pending admin approval"; `ACTIVE` w/o claim → "Refreshing your session…"; `ACTIVE` w/ claim → full UI | [`app/(app)/resources/_components/ResourceList.tsx`](../app/(app)/resources/_components/ResourceList.tsx) |
| Persistent "Raise a ticket" topbar link + dashboard hero CTA | [`app/(app)/_components/AppTopbar.tsx`](../app/(app)/_components/AppTopbar.tsx), [`app/(app)/dashboard/page.tsx`](../app/(app)/dashboard/page.tsx) |
| Match-driven Recommended feed: two parallel queries against `matches/` (Flow A score-ranked + Flow B by createdAt); rapid floats to top; closed tickets filtered after one-shot ticket header fetch; strict empty state | [`app/(app)/dashboard/_components/RecommendedTicketsList.tsx`](../app/(app)/dashboard/_components/RecommendedTicketsList.tsx) |
| Resource-picker pledge form (filtered by need category and free quantity), cap input = min(inventory free, remaining-need); shows `Remaining capacity` and `inventory free` hints; mints fresh requestId per submit | [`app/(app)/tickets/[id]/_components/PledgeForm.tsx`](../app/(app)/tickets/[id]/_components/PledgeForm.tsx) |
| Multi-pledge "Your contributions" panel; host "Proposed pledges" panel with per-card APPROVE/REJECT; single signoff button covers all of a contributor's EXECUTED contributions; fresh requestId per signoff click; passes `fulfilledByNeed[]` cap to `PledgeForm` | [`app/(app)/tickets/[id]/_components/TicketDetail.tsx`](../app/(app)/tickets/[id]/_components/TicketDetail.tsx) |

## Schemas & rules

| Behavior | File |
|---|---|
| `Resource.reservedQuantity` (server-only); `Resource.status` derives from quantity + reservedQuantity | [`lib/schemas/resource.ts`](../lib/schemas/resource.ts) |
| `Contribution.resourceId` is required (not optional); adds `rejectedAt`, `rejectReason`; new `RespondToPledgeInputSchema` for host APPROVE/REJECT | [`lib/schemas/contribution.ts`](../lib/schemas/contribution.ts) |
| Firestore rules lock `resources.{quantity, reservedQuantity}` and `contributions.{resourceId, offered, rejectedAt, rejectReason}` to server-only on update | [`firestore.rules`](../firestore.rules) |
| Three new composite indexes: matches by `(orgId, rapidBroadcast, score DESC)`, matches by `(orgId, rapidBroadcast, createdAt DESC)`, contributions collection-group by `(status ASC, createdAt ASC)` (TTL sweep) | [`firestore.indexes.json`](../firestore.indexes.json) |

## Functions index — what got registered

New exports added to [`functions/src/index.ts`](../functions/src/index.ts):
- `respondToPledge` (callable)
- `onResourceUpdated` (trigger)
- `onResourceDeleted` (trigger)
- `proposedPledgeTtlSweep` (scheduled, every 30 min)

---

# Part G — Quick test cheat sheet (read this if you want to skip everything else)

This is the entire test compressed into one page. Open Firebase Console → Firestore in a side tab so you can watch the writes land as you click through.

> **Project:** `buffet-493105` · **Firestore Console:** https://console.firebase.google.com/project/buffet-493105/firestore

## The 14-step happy path — every action, what you see, what hits Firestore

| # | Who | Action | UI outcome | Firestore check |
|---|---|---|---|---|
| 1 | Niraj, Albin, Dhrupad | `/signup` → Google sign-in → fill `/onboard` form | Dashboard shows **"Pending admin approval"** (was "Pending review") | `users/{uid}` exists with `orgId: uid`; `organizations/{uid}` with `status: "PENDING_REVIEW"` |
| 2 | Dhrupad | `/admin` → click **Approve** on each pending org | All 3 cards disappear; the other two users' pages auto-flip to live within ~1s (no sign-out) | `organizations/{*}.status: "ACTIVE"`; Auth → user → custom claims `{role, orgId}` set |
| 3 | Albin | `/resources/new` → fill FUNDS form, submit | Resource appears in `/resources` list; status `AVAILABLE`; **"Embedding…"** badge for ~10–30s, then **"Embedded"** | `resources/{id}` with `category: "FUNDS"`, `quantity: 100000`, `reservedQuantity: 0`, `status: "AVAILABLE"`, `embeddingStatus: "pending"` → `"ok"` (embedding trigger writes the 768-d vector) |
| 4 | Dhrupad | Same, MANUFACTURING resource | Same | Same shape — wait until `embeddingStatus === "ok"` before step 5 |
| 5 | Niraj | Topbar **"Raise a ticket"** → fill 2-need form, submit | Toast "Ticket raised", redirects to `/tickets/<id>`, phase chip **"Open"**, progress 0% | `tickets/{id}` with `phase: "OPEN_FOR_CONTRIBUTIONS"`, `progressPct: 0`, `participantOrgIds: [niraj]`. Within ~10s, `onTicketCreated` writes `matches/{ticketId}__{albinOrgId}` and `matches/{ticketId}__{dhrupadOrgId}` |
| 6 | Albin, Dhrupad | `/dashboard` → see ticket card under **"Recommended for you"** | Card shows score-based reason, "fills X%" chip, **"View"** button. NOT under "Active tickets" yet | `matches/{ticketId__orgId}` for each: `score: 0–1`, `topResourceId`, `bestNeedIndex`, `contributionImpactPct`, `reason` |
| 7 | Albin | Open ticket → "Pledge to this ticket" → pick resource, leave quantity at 40000 → **"Submit for approval"** | Toast **"Pledge proposed."** "Your contributions (1)" card shows `40000 INR · status PROPOSED`. Progress still 0% | `tickets/{id}/contributions/{cid}`: `status: "PROPOSED"`, `resourceId: <albin's resource>`, `offered.quantity: 40000`. Resource `reservedQuantity` still `0` (no inventory move yet). |
| 8 | Niraj | Open ticket → **"Proposed pledges (1)"** → click **Approve** | Toast "Pledge approved." Need #1 fills to 100%, overall 40%. Albin's contribution flips to **COMMITTED** on his page. Now Albin appears under "Active tickets" | Contribution `status: "COMMITTED"`, `committedAt` set. Albin's resource: `reservedQuantity: 40000`. Ticket: `progressPct: 40`, `participantOrgIds: [niraj, albin]`, `contributorCount: 1` |
| 9 | Dhrupad | Same flow — pledge 60 desks → Niraj approves | Need #2 fills, overall 100%. "Contributors (2)" strip appears. Dhrupad now under his "Active tickets" too | Same shape; Dhrupad's resource `reservedQuantity: 60`. Ticket `progressPct: 100`, both orgs in `participantOrgIds` |
| 10 | Niraj | "Host controls" → **"Move to execution"** | Phase chip **"Executing"** | Ticket `phase: "EXECUTION"`. Both contributions flip from `COMMITTED` → `EXECUTED` in the same transaction |
| 11 | Niraj | Pick any image, upload via the file input | Toast "Photo proof uploaded." | `tickets/{id}/photoProofs/{pid}` with `uploaderOrgId: <niraj>`, `storagePath`. `tickets/{id}.lastUpdatedAt` bumped. |
| 12 | Niraj | **"Mark execution complete"** | Phase chip **"Awaiting sign-off"** | Ticket `phase: "PENDING_SIGNOFF"`. Contributions stay `EXECUTED`. |
| 13 | Albin | "Sign off on this delivery" → **"Confirm delivery"** | Toast "Delivery confirmed." Phase stays "Awaiting sign-off" (still need Dhrupad). | `tickets/{id}/signoffs/{ticketId__albinOrgId}` with `decision: "APPROVED"`. Albin's contribution: `status: "SIGNED_OFF"`, `signedOffAt` set. |
| 14 | Dhrupad | Same | **All three screens flip to "Closed" within ~3s.** | Dhrupad's signoff written. `onSignoffRecorded` confirms full coverage → ticket `phase: "CLOSED"`, `closedAt` set. `onTicketClosed` then fires: Albin's resource `quantity: 60000` (was 100000), `reservedQuantity: 0`. Dhrupad's resource `quantity: 140`, `reservedQuantity: 0`. 3 docs in `badges/{ticketId__orgId}`. |

If every row's Firestore column matches, the platform is end-to-end live.

---

## Verifying the four high-leverage subsystems

### 1. Resource embedding pipeline

After step 3 or 4, navigate to Firestore → `resources/{your resource id}` and watch:

- `embeddingStatus`: starts at `"pending"`. Should flip to `"ok"` within **10–30s**. If it sits at `"pending"` for >2 min, check `firebase functions:log --only onResourceCreated` — likely a Vertex AI auth issue.
- `embeddingVersion`: should be a non-empty string (e.g. `"text-embedding-004:v1"`).
- `embedding`: 768-element float array. (Console may collapse it; click to expand.)
- If `embeddingStatus === "failed"`, the resource will never match. The trigger logs the reason — fix and re-create the resource (or run the embed manually).

**Fast sanity:** when embedding is done, `resources where embeddingStatus == "ok" and orgId == <yours>` should return your resource. The matching trigger filters on `embeddingStatus === "ok"` so anything stuck at `pending` is invisible.

### 2. Matching pipeline (Recommended feed source)

After step 5, navigate to Firestore → `matches`. Filter by `ticketId == <new ticket id>`. You should see:

- **One match doc per eligible (org, ticket) pair.** Doc id is `{ticketId}__{orgId}`. For our 3-person setup with both Albin and Dhrupad eligible, you should see exactly **2** match docs.
- Each doc has `score: 0–1` (Flow A only — undefined for rapid), `topResourceId`, `bestNeedIndex`, `contributionImpactPct`, `geoDistanceKm`, `reason`, `rapidBroadcast: false`, `dismissed: false`, `surfaced: false`.
- If a contributor's resource has `embeddingStatus !== "ok"` at the moment the ticket lands, NO match doc gets written for that org. The matching trigger reads `resources where status == "AVAILABLE"` and only writes for survivors.
- **For rapid (EMERGENCY) tickets**, `onRapidTicketCreated` fires instead and writes broadcast matches — `rapidBroadcast: true`, no `score`.

### 3. Active Tickets panel logic

Driven by the query: `tickets where participantOrgIds array-contains <viewerOrgId> orderBy lastUpdatedAt desc limit 50`.

- A ticket appears under your "Active tickets" the moment your `orgId` lands in `tickets/{id}.participantOrgIds`. For the host, that's at raise time. For a contributor, that's when their pledge is APPROVED (not PROPOSED).
- **PROPOSED contributions do NOT add you to `participantOrgIds`** — only COMMITTED does. So Albin sees the ticket under "Recommended" before approval, then under "Active" after Niraj approves him.
- Order is by `lastUpdatedAt` descending — every pledge approval, photo upload, signoff, or phase change bumps `lastUpdatedAt` and re-sorts the list.
- Closed tickets stay in this list (closure does NOT remove orgs from `participantOrgIds`); they show with the gray "Closed" chip.

### 4. Recommended Tickets panel logic

Driven by TWO parallel queries against `matches/`:

```
matches where orgId == <viewerOrgId> AND rapidBroadcast == false ORDER BY score DESC LIMIT 25  (Flow A)
matches where orgId == <viewerOrgId> AND rapidBroadcast == true  ORDER BY createdAt DESC LIMIT 25 (Flow B)
```

Then merged client-side; rapid floats to the top regardless of score.

- **A ticket appears in "Recommended" only if a match doc exists for your org.** No match doc → no card. This is why a fresh org with no resources sees the empty state.
- **The panel also fetches each ticket header** (`tickets/{id}`) once per match to filter out CLOSED tickets — match docs aren't garbage-collected when their ticket closes, so the client filters them.
- **Tickets you participate in (host or COMMITTED contributor) still get match docs**, but they show under "Active" instead of "Recommended" because the `RecommendedTicketsList` doesn't currently filter them out — *minor known imperfection*. The dedupe is by ticket id; if it bothers you, extend the visible-ticket filter to also exclude tickets where you're in `participantOrgIds`.
- **Empty state** ("No matches yet — list more resources or wait for new tickets to land") fires when both query results are empty. NOT a bug — it means matching never wrote a doc for your org.

---

## Failure signals — what's wrong if you see this

| Signal | Most likely cause | First check |
|---|---|---|
| Resource list shows "Embedding…" badge >2 min | Embedding trigger failing | `firebase functions:log --only onResourceCreated` |
| "No matches yet" despite having resources | Resource still embedding, OR ticket doesn't share a category | `resources/{yours}.embeddingStatus`; ticket `needs[].resourceCategory` |
| Pledge succeeds but progress doesn't move | PROPOSED, not COMMITTED — host hasn't approved | Niraj clicks Approve in "Proposed pledges" |
| "Move to execution" button gives "zero COMMITTED contributions" | All pledges still PROPOSED | Approve at least one |
| Auto-close didn't fire after both signoffs | `onSignoffRecorded` cold start or expected/received mismatch | `firebase functions:log --only onSignoffRecorded` |
| Resource `quantity` didn't decrease after close | `onTicketClosed` `commitInventory` errored | `firebase functions:log --only onTicketClosed` |
| Contribution silently disappeared from "Your contributions" | Auto-rejected (phase advance) or 36h TTL | Read `rejectReason` on the contribution doc |

**End of cheat sheet.** If you can run all 14 rows top-to-bottom against the live deploy and see every Firestore column match, you're demo-ready.

---

**End of dry run.** When all of Part B and Part C land their expected results, we're ready for the judges.
