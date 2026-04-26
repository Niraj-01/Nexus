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
5. Submit. Your dashboard will now say **"Pending review"** — that's expected. Wait for A.2.

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

- **Niraj and Albin:** your dashboard will auto-transition from "Pending review" to live within a second of being approved. The browser detects the status change and refreshes your ID token in place — no sign-out needed.
- Continue with A.3.

> **Backup CLI flow:** if `/admin` is down for any reason, you can run
> `npm run approve` from `nexus/` (after `firebase login`). It does the
> same thing as the page. See [scripts/approveAll.ts](../scripts/approveAll.ts).

> **Troubleshooting**
> - "Access denied" but you signed in as Dhrupad → check the Google account picker; you may have picked the wrong one. Sign out and try again.
> - Bootstrap errors → check Firebase Console → App Hosting → backend `nexus` → Logs for the `/api/admin/bootstrap` route.
> - Approved org's user still sees "Pending review" 5+ seconds after approval → manually refresh their browser tab (the auto-refresh effect should run but may have hit a transient error).

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

1. Go to **`<APP_URL>/tickets/new`**
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

✋ **Wait 10 seconds** for the matching trigger to run before Albin and Dhrupad refresh their dashboards.

---

## STEP 2 — Albin and Dhrupad see the ticket on their dashboards

**Albin AND Dhrupad (both at the same time):**

1. Go to **`<APP_URL>/dashboard`** (or refresh if you're already there)

**You should see:**
- Under **"Recommended for you" → "Best matches"**, a card titled **"100 desks for Panvel school"** appears
- A **"Pledge"** button on the right side of the card
- Below the title, a small "Your contribution potential" line showing what % you can fill

If the card doesn't appear, wait another 10 seconds and refresh — the matching trigger sometimes cold-starts.

---

## STEP 3a — Albin pledges FUNDS

**Albin:**

1. On `/dashboard`, click **"Pledge"** on the ticket card → opens `/tickets/<id>`
2. Scroll down to the **"Pledge to this ticket"** card (it appears automatically)
3. The dropdown should say **"#1 · FUNDS (40 desks-equivalent)"** — leave it
4. Quantity should pre-fill with **40** — leave it
5. Click **"Pledge now"**

**You should see:**
- Toast: **"Pledge committed. Ticket is now 40% fulfilled."**
- The pledge form gets replaced by a green card: **"Your contribution is committed — 40 desks-equivalent · status COMMITTED"**
- The Need #1 progress bar fills to **100%**
- Overall progress jumps to **40%**

---

## STEP 3b — Dhrupad pledges MANUFACTURING

**Dhrupad:**

1. Open the ticket URL Niraj shared (or click "Pledge" from your `/dashboard`)
2. Scroll to **"Pledge to this ticket"**
3. The dropdown should say **"#2 · MANUFACTURING (60 desks)"** — leave it
4. Quantity should pre-fill with **60** — leave it
5. Click **"Pledge now"**

**You should see:**
- Toast: **"Pledge committed. Ticket is now 100% fulfilled."**
- Need #2 progress bar fills to **100%**
- Overall progress: **100%**
- A "Contributors (2)" strip appears at the bottom showing both org names

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

**Setup:** A fourth person (or one of you in incognito mode) signs up with a fresh email. Complete onboarding so the org exists, but **don't list any resources**.

1. Sign in as the new account
2. Open `/dashboard`
3. Open the failure-test ticket URL directly

**You should see:**
- Dashboard does NOT show the ticket under "Recommended for you"
- On the ticket detail page, there is **no "Pledge" form** at all
- The orphan account has literally no way to contribute

Proves: orgs without matching resources are invisible to the matching system.

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

# Part D — Cleanup between runs

If you want to re-test from scratch:

1. Firebase Console → Firestore → `tickets/` — delete the test ticket docs (this auto-deletes their subcollections)
2. Firebase Console → Firestore → `badges/` — query `where ticketId == <oldTicketId>` and delete each result (3 per closed ticket)
3. Each org's `organizations/<orgId>.badges` array still has the old entries — manually edit each org doc and remove them, or just leave them (next badges will append, not duplicate)

You **do not** need to re-create resources or re-onboard. Those persist.

---

# Part E — Help! Something broke

| What happened | Why | What to do |
|---|---|---|
| "Pledge" button missing on dashboard card | Your resource isn't ready yet | Wait 30 seconds and refresh. If still missing, check Firebase Console → `resources/<your resource id>` → field `embeddingStatus` should say `"ok"` |
| "Move to execution" button doesn't show | You're not the host | Check that you're signed in as Niraj |
| "Mark execution complete" gives an error | You haven't uploaded a proof yet | Upload one first, then click again |
| "Confirm delivery" gives an error | Niraj hasn't advanced to EXECUTION yet | Tell Niraj to do Step 4 first |
| Auto-close didn't fire after both signoffs | Trigger cold start | Wait another 15 seconds and refresh. If still nothing, in PowerShell: `firebase functions:log --only onSignoffRecorded` |
| No badges after close | Trigger error | In PowerShell: `firebase functions:log --only onTicketClosed` |
| Can't sign in with Google | Domain not authorized | Dhrupad: open Firebase Console → Authentication → Settings → Authorized domains → add the URL hostname |

---

**End of dry run.** When all of Part B and Part C land their expected results, we're ready for the judges.
