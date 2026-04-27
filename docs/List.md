# NEXUS — build list, phased (tracked)

Living todo. Edit freely — when you tweak a feature, update the line here
and the checkbox. Three phases; each is self-contained and demoable on its
own, and each one's outputs become the next one's inputs.

**Legend**
- `[ ]` not started
- `[~]` in progress
- `[x]` done
- `[-]` dropped / deferred
- **FE** = Next.js route / component  • **BE** = Cloud Functions / rules
- **DATA** = Firestore schema / indexes / seed  • **EXT** = external API

Last updated: 2026-04-25

---

## Phase 1 — Collect the data

**Goal:** an authenticated org admin can create an organization, pass hard
verification, and list their first resources. At end of Phase 1, Firestore
has real orgs and resources — nothing else can happen without this.

### 1.1 Auth → user record
- [x] FE `/signup` + `/login` with Google SSO and email — [app/(auth)/](../app/(auth)/)
- [x] BE first sign-in auto-creates `users/{uid}` with `role: "ORG_ADMIN"`, `orgId: null` — [lib/auth/actions.ts](../lib/auth/actions.ts)
- [x] Auth-gated `(app)` shell that redirects unauthenticated users → `/login` — [app/(app)/layout.tsx](../app/(app)/layout.tsx)

### 1.2 Onboarding flow
- [x] FE `/onboard/form` — classic form fallback — [app/(app)/onboard/form/page.tsx](../app/(app)/onboard/form/page.tsx)
- [x] FE `/onboard` (picker) + `/onboard/chat` Gemini surface — [app/(app)/onboard/page.tsx](../app/(app)/onboard/page.tsx) + [chat/page.tsx](../app/(app)/onboard/chat/page.tsx)
- [x] BE Gemini turn — handled via Next.js API route [app/api/onboarding/chat/route.ts](../app/api/onboarding/chat/route.ts) instead of a callable; the callable stub remains as a placeholder
- [x] Onboarding finalize — direct client-side write via [app/(app)/onboard/_lib/finalize.ts](../app/(app)/onboard/_lib/finalize.ts) (firestore.rules self-create branch). No server callable needed.
- [x] FE `PENDING_REVIEW` banner on `/dashboard` + onboarding gate — [app/(app)/dashboard/page.tsx](../app/(app)/dashboard/page.tsx)

### 1.3 Govt-doc upload + verification
- [x] FE drop-zone on onboarding step 2 — [_components/DocPicker.tsx](../app/(app)/onboard/_components/DocPicker.tsx)
- [x] Direct Storage Web SDK upload via [_lib/uploadDoc.ts](../app/(app)/onboard/_lib/uploadDoc.ts). No `getDocUploadUrl` callable needed — storage.rules' self-upload branch (`orgId == request.auth.uid`) gates this safely.
- [-] BE trigger `onGovtDocUploaded` — *deferred for demo cut; manual admin review covers verification.*
- [x] BE callable `approveOrg` — flips `status → ACTIVE`, sets custom claims (role, orgId) — [functions/src/callables/approveOrg.ts](../functions/src/callables/approveOrg.ts)
- [x] Storage rules scoped by `orgId` — [storage.rules](../storage.rules)

### 1.4 Resource listing
- [x] FE `/resources` list — [app/(app)/resources/page.tsx](../app/(app)/resources/page.tsx)
- [x] FE `/resources/new` form mirroring [lib/schemas/resource.ts](../lib/schemas/resource.ts) — [app/(app)/resources/new/page.tsx](../app/(app)/resources/new/page.tsx); blocks non-ACTIVE orgs
- [x] BE callable `createResource` — validates `ResourceClientWriteSchema`, requires `org.status === "ACTIVE"`, writes doc with `embeddingStatus: "pending"` — [functions/src/callables/createResource.ts](../functions/src/callables/createResource.ts). (Client direct-create is disallowed in rules so the ACTIVE gate can't be skipped.)
- [x] BE trigger `onResourceCreated` — `gemini-embedding-001` (768-d via `outputDimensionality`) on category+title+conditions+region → writes `embedding`, `embeddingVersion`, flips `embeddingStatus` pending→ok; on permanent failure sets `failed` and omits `embedding` — [functions/src/triggers/onResourceCreated.ts](../functions/src/triggers/onResourceCreated.ts) (EXT: Gemini Generative Language API)
- [x] Composite index `(orgId, status)` — [firestore.indexes.json](../firestore.indexes.json)

### 1.5 Platform admin console
- [x] FE `/admin` — live PENDING_REVIEW table with Approve button — [app/admin/page.tsx](../app/admin/page.tsx)
- [x] Gate on `claims.role === "PLATFORM_ADMIN"` — server-checked via [api/admin/approve/route.ts](../app/api/admin/approve/route.ts)
- [x] First-admin bootstrap via [api/admin/bootstrap/route.ts](../app/api/admin/bootstrap/route.ts) — auto-grants the claim to a hard-coded admin email on first sign-in

**Phase 1 done when:**
1. Can sign up → onboard → upload docs → org appears in admin queue
2. Admin approves → custom claims land → can list resources
3. Firestore has: `organizations` (ACTIVE), `users` (with claims), `resources` (with embeddings)

---

## Phase 2 — Tickets: raise → match → commit → execute → sign off → close

**Goal:** the ticket lifecycle end to end. At the end of Phase 2, a host can
raise a ticket and carry it all the way through `CLOSED`, with both Flow A
(agreement-first) and Flow B (rapid, pledge-first) working.

Depends on Phase 1: no ticket raising without ACTIVE org; no matching
without embedded resources.

### 2.1 Raise a ticket
- [x] FE `/tickets/new` — [app/(app)/tickets/new/page.tsx](../app/(app)/tickets/new/page.tsx)
- [x] BE callable `raiseTicket` — idempotent, valuation-weighted initial progress, sets `rapid` from urgency, writes `phase: OPEN_FOR_CONTRIBUTIONS` — [functions/src/callables/raiseTicket.ts](../functions/src/callables/raiseTicket.ts)
- [x] BE trigger `onTicketCreated` — text-embedding-004 (Gemini API) on title+description+needs → `tickets.embedding` (768d), then chains into Flow A matching for non-rapid tickets — [functions/src/triggers/onTicketCreated.ts](../functions/src/triggers/onTicketCreated.ts)
- [-] Replace raw lat/lng with Google Maps Places autocomplete (EXT: Maps) — *deferred; needs `NEXT_PUBLIC_GOOGLE_MAPS_KEY`. Raw lat/lng stays for demo.*
- [x] Schema: extend `needs[].subtype: string?` (e.g. "primary education" inside category EDUCATION). Embedding input string includes subtype when present. — RUBRIC: AI Integration (richer semantic signal). [Albin/Nexus_Ticket_Display_Spec.md §3.1]
- [x] On `raiseTicket` success, denormalize `host: { name, type }` from `organizations/{orgId}` onto the ticket doc so the ticket card never JOINs at read time. (Status is implicit ACTIVE — only ACTIVE orgs can raise; reliability is read separately when needed.) — RUBRIC: Performance + Trust visibility. [Albin spec §3.1]
- [x] Initialize `tickets.participantOrgIds: [hostOrgId]` + `contributorCount: 0` + `lastUpdatedAt: now` on raise. `participantOrgIds` is the single source of truth for the dashboard's Active Tickets query (§2.10) — set semantics, capped at 50, hosts always present; contributors union-added on commit (§2.3). — RUBRIC: Performance (single `array-contains` query for the active-tickets feed). [Albin/Nexus_Dashboard_Logic.md §3.2]

### 2.2 Matching

**Flow A — ranked top-K** (non-emergency):
- [x] BE Flow A pipeline runs from `onTicketCreated` after embedding (non-rapid only) — [functions/src/triggers/onTicketCreated.ts](../functions/src/triggers/onTicketCreated.ts) → `runFlowAMatching`
  - [x] Hard filter: category ∈ needs, geo reachable (haversine for now; Distance Matrix swap is one function call), `terms.availableUntil` ≥ deadline, org ACTIVE, host excluded
  - [x] Semantic rerank: brute-force cosine in-memory against `resources where status == "AVAILABLE"`. (Firestore native `findNearest` is documented in [lib/matching.ts](../functions/src/lib/matching.ts) header as the future swap when seed volume grows.)
  - [x] **Hybrid score (weights LOCKED as constants in [lib/matching.ts](../functions/src/lib/matching.ts)):** `finalScore = 0.5*semanticScore + 0.2*geoScore + 0.2*capacityScore + 0.1*reliabilityScore`
  - [x] Write top-K=10 `matches/{ticketId__orgId}` (deterministic id = idempotent on retry) with `score` (hybrid), `semanticScore` (raw cosine), `reason`, `orgId` denormalized, `topResourceId` (best resource per org). — RUBRIC: Performance (single-query dashboard).
  - [x] Persist display-time projection on `matches/{id}`: `bestNeedIndex`, `maxContributionPossible`, `contributionFeasibility`, `contributionImpactPct`. Dashboard reads them as-is — no recomputation client-side. — RUBRIC: Innovation + UX. [Albin Ticket spec §3.3]
  - [x] Persist `geoDistanceKm` on `matches/{id}` from the same haversine call — ticket card renders "12 km away" with no extra API hit. — RUBRIC: Performance. [Albin spec §3.1]
- [x] Recommendation exclusions — partial: Recommended panel now filters out tickets where viewer is in `participantOrgIds` (covers host's own + already-pledged), per the §2.10 rewrite to a tickets-driven feed. The `decline` callable + `tickets/{id}/declines/{orgId}` doc are deferred since the panel filter handles the main duplication case. [app/(app)/dashboard/_components/RecommendedTicketsList.tsx](../app/(app)/dashboard/_components/RecommendedTicketsList.tsx). — RUBRIC: UX.
- [-] FUTURE: swap haversine → Maps Distance Matrix once `NEXT_PUBLIC_GOOGLE_MAPS_KEY` is provisioned. Swap brute-force cosine → Firestore `findNearest` once resource count > ~500. *Post-hackathon scaling work.*

**Flow B — broadcast** (emergency):
- [x] BE trigger `onRapidTicketCreated` — [functions/src/triggers/onRapidTicketCreated.ts](../functions/src/triggers/onRapidTicketCreated.ts)
  - [x] Filter: `resource.emergencyContract.enabled === true`, category ∈ needs, geo reachable (haversine), org ACTIVE, host excluded
  - [x] Write `matches/{id}` with `rapidBroadcast: true` for every passing org (no K cutoff). No semantic ranking. Per-entity projection (`maxContributionPossible`, `contributionFeasibility`, `contributionImpactPct`, `geoDistanceKm`) included so the rapid card has the same UX as the normal card. *(If ranking is ever added to Flow B, weights lock to `0.7 semantic + 0.3 geo`.)*
  - [-] FCM push when `resource.emergencyContract.autoNotify === true` — *deferred for demo cut (needs FCM token plumbing).*
- EXT: FCM (deferred)

**Dashboard:** (full layout + Active Tickets surface live in §2.10; this stub covers only the Recommended-side index)
- [x] FE Recommended panel — [app/(app)/dashboard/_components/RecommendedTicketsList.tsx](../app/(app)/dashboard/_components/RecommendedTicketsList.tsx) — two parallel queries on `matches` for `viewerOrgId`: (a) normal top-10 = `where orgId == X and rapidBroadcast == false order by score desc`; (b) rapid broadcast = `where orgId == X and rapidBroadcast == true order by createdAt desc limit 30` (sorted client-side per spec §5). Cards render fully from match doc fields produced above — single batched ticket-header fetch hydrates the title/host/needs.
- [x] Composite indexes for matches — [firestore.indexes.json](../firestore.indexes.json): `(orgId, rapidBroadcast, score desc)` for normal top-K + existing `(orgId, rapidBroadcast, createdAt desc)` for rapid.

### 2.3 Pledge → commit

**Flow A — AGREEMENT_FIRST:**
- [-] FE ticket-detail `/tickets/[id]` with "Pledge" CTA per need — *deferred; Flow A collapsed onto PLEDGE_FIRST for demo cut. Pledge CTA now renders for both NORMAL + EMERGENCY tickets.*
- [-] BE callable `pledge` Flow A path (Google Docs template copy) — *deferred; pledge.ts now takes the single PLEDGE_FIRST transaction for both urgencies.*
- [-] BE callable `signAgreement` — *deferred per demo cut.*
- [-] BE trigger `onAgreementFullySigned` — *deferred per demo cut. Audit-trail story moves to post-hoc agreements (§2.7 stretch).*
- [-] EXT: Google Docs + Drive APIs — *deferred per demo cut.*

**Flow B — PLEDGE_FIRST:**
- [x] `pledge` callable Flow B branch — [functions/src/callables/pledge.ts](../functions/src/callables/pledge.ts). Asserts `ticket.rapid === true`, single transaction: rejects double-pledge from same org → writes `contributions/{id}` COMMITTED + commitPath PLEDGE_FIRST + bumps `needs[i].progressPct` + recomputes valuation-weighted `progressPct` + denorms aggregates. App Check enforced. Idempotent via `withIdempotency`.

**Denormalization on commit (both flows):**
- [x] In the same transaction that flips a contribution → `COMMITTED`, bump `tickets.contributorCount` (FieldValue.increment) and union-add the contributor's orgId into `tickets.participantOrgIds[]` (FieldValue.arrayUnion). Wired in pledge.ts Flow B branch; Flow A `onAgreementFullySigned` will reuse the same denorm shape when implemented. The contributors strip on ticket detail derives `contributors = participantOrgIds.filter(id => id !== hostOrgId)`. — RUBRIC: Performance. [Albin Ticket spec §3.4 + Dashboard spec §3.2]

### 2.4 Host advances to EXECUTION
- [x] FE "Move to Execution" CTA (host-only) — `HostLifecyclePanel` in [TicketDetail.tsx](../app/(app)/tickets/[id]/_components/TicketDetail.tsx)
- [x] BE callable `advancePhase` — no floor (host owns the judgment per design choice); writes `phase`, `phaseChangedAt`, `advancedEarly = (progressPct < 100)`; batch-flips COMMITTED contributions → EXECUTED in same transaction — [functions/src/callables/advancePhase.ts](../functions/src/callables/advancePhase.ts)
- [x] FE: existing contributors notified via realtime listener on ticket doc — already wired in [TicketDetail.tsx](../app/(app)/tickets/[id]/_components/TicketDetail.tsx)
- [x] `callAdvancePhase` client wrapper — [lib/callables.ts](../lib/callables.ts)

### 2.5 Photo proofs
- [x] FE upload widget on ticket detail (host-only, EXECUTION only) — file input in `HostLifecyclePanel`
- [x] Storage upload to `tickets/{ticketId}/photoProofs/` via Firebase Storage SDK + Firestore doc write; storage rules already permit auth'd 20MB image uploads
- [x] BE trigger `onPhotoProofUploaded` — bumps `lastUpdatedAt` and mirrors into `tickets/{id}/updates/{proofId}` for the §3.3 public-feed contract — [functions/src/triggers/onPhotoProofUploaded.ts](../functions/src/triggers/onPhotoProofUploaded.ts). *Reliability liveness recovery deferred per §2.8 cut.*
- [x] `PhotoProofSchema` added — [lib/schemas/photoProof.ts](../lib/schemas/photoProof.ts)
- [x] `firestore.rules` photoProofs create branch pins `uploaderOrgId == token.orgId`

### 2.6 Host closes execution → PENDING_SIGNOFF
- [x] FE "Mark execution complete" CTA — `HostLifecyclePanel` in [TicketDetail.tsx](../app/(app)/tickets/[id]/_components/TicketDetail.tsx)
- [x] `advancePhase` transitions `EXECUTION → PENDING_SIGNOFF` — reads `photoProofs.limit(1)` inside the txn; throws `failed-precondition` if empty

### 2.7 Signoffs
- [x] FE per-contributor signoff panel on ticket detail — APPROVE / DISPUTE — `SignoffPanel` in [TicketDetail.tsx](../app/(app)/tickets/[id]/_components/TicketDetail.tsx)
- [x] BE callable `recordSignoff` — txn: validates EXECUTED contribution exists, rejects double-signoff, writes signoff, flips contribution `EXECUTED → SIGNED_OFF` (or DISPUTED) — [functions/src/callables/recordSignoff.ts](../functions/src/callables/recordSignoff.ts)
- [x] BE trigger `onSignoffRecorded` — txn: full coverage + all APPROVED → `phase: "CLOSED"` (hands off to §3.1); any DISPUTED → no-op (stays PENDING_SIGNOFF; demo cut has no admin queue) — [functions/src/triggers/onSignoffRecorded.ts](../functions/src/triggers/onSignoffRecorded.ts)
- [x] `callRecordSignoff` client wrapper — [lib/callables.ts](../lib/callables.ts)

**Flow B post-hoc agreements** (optional, not a gate):
- [-] BE callable `createPosthocAgreement` — *deferred per the same demo cut as Flow A agreements; stub remains at [functions/src/callables/createPosthocAgreement.ts](../functions/src/callables/createPosthocAgreement.ts).*

### 2.8 Reliability decay
- [-] BE scheduled `reliabilityDecaySweep` — *deferred for demo cut. Reliability scores are still consumed (badge multiplier in §3.1) but auto-decay is wired post-hackathon.*
- [-] BE scheduled `stuckStageSweep` — deferred for demo cut.
- [-] BE scheduled `emergencyExpirySweep` — deferred for demo cut.
- [-] Reliability mini-bars on contributors strip — deferred for demo cut.

### 2.9 Ticket detail display contract

A single render of `/tickets/[id]` reads only: ticket doc + `needs[]` + `matches/{viewerOrgId}` (optional) + `contributions/*` + `updates/*`. No further API calls. This is the contract that proves Phase 2's denormalizations are right.

- [x] FE component `TicketDetail` — [app/(app)/tickets/[id]/_components/TicketDetail.tsx](../app/(app)/tickets/[id]/_components/TicketDetail.tsx). Renders: title; host name + NGO/ORG type tag; urgency pill (rapid only); location; phase tag; geoDistanceKm from match; per-need rows [required | fulfilled | remaining | progress bar]; **"Your contribution potential"** panel from match doc; PledgeForm CTA (Flow B only — Flow A degraded with explanatory copy); contributors strip with batched org-name hydration. (Reliability mini-bars + proof gallery + updates feed deferred to §2.8 / §2.5 slices.)
- [x] Empty/edge states per spec §9: "Your contribution potential" hidden when viewer is host or has no match doc; PledgeForm hidden when already pledged or wrong phase; "ticket not found" card with back-to-dashboard.
- [-] axe DevTools clean — *deferred for demo cut.*
- [x] FE component [PledgeForm](../app/(app)/tickets/[id]/_components/PledgeForm.tsx) — defaults to match's `bestNeedIndex` + `maxContributionPossible` for one-click pledge; calls `callPledge`; toasts result; idempotent via stable per-mount requestId.

### 2.10 Dashboard display contract

`/dashboard` renders two surfaces against the viewer's orgId in **three Firestore queries fired in parallel** (one tickets + two matches sub-queries — normal vs rapid). Mirrors the §2.9 contract for ticket detail. Contract enforces "uniform code, smooth data transfer": both surfaces read the same denormalized fields produced by §2.1 / §2.2 / §2.3 — no separate read paths. Per `Albin/Nexus_Dashboard_Logic.md`.

#### Two-surface layout (spec §2)
- **Recommended Tickets** (primary, AI-driven) — sourced from `matches/*` filtered by `orgId == viewerOrgId`. Already wired in §2.2.
- **Active Tickets** (secondary, state-driven) — sourced from `tickets/*` filtered by `participantOrgIds array-contains viewerOrgId`.

#### Active Tickets feed (spec §3)
- [x] FE component `ActiveTicketsList` — single Firestore query: `tickets where participantOrgIds array-contains viewerOrgId order by lastUpdatedAt desc limit 50`. — [app/(app)/dashboard/_components/ActiveTicketsList.tsx](../app/(app)/dashboard/_components/ActiveTicketsList.tsx)
- [x] DATA composite index on `tickets`: `(participantOrgIds, lastUpdatedAt desc)` — added to [firestore.indexes.json](../firestore.indexes.json).
- [x] Per-card derived `role` (HOST | CONTRIBUTOR) = `ticket.hostOrgId === viewerOrgId ? HOST : CONTRIBUTOR`. Pure client function; no schema field. — RUBRIC: Performance (zero extra reads).
- [x] Per-card derived `displayStatus`: `pending_contribution | active_execution | awaiting_confirmation | completed`. Pure function over `ticket.phase` (current proxy uses phase only — adding contribution-state nuance is a follow-up needing a per-card contribution lookup). [spec §3.6] — [_lib/activeTicket.ts](../app/(app)/dashboard/_lib/activeTicket.ts)
- [x] Sort priority (client-side, after the array fetch — no second query): phase=EXECUTION first, then PENDING_SIGNOFF, then recently updated. — [_lib/activeTicket.ts](../app/(app)/dashboard/_lib/activeTicket.ts) `sortKey`
- [-] Per-role action panel (spec §3.7) — *deferred; the card links straight to `/tickets/[id]` where per-role panels live (§2.9). Acceptable demo affordance.*

#### Rapid override sort (spec §5)
- [x] Within the rapidBroadcast segment of Recommended Tickets, sort by `urgency desc, geoDistanceKm asc, maxContributionPossible desc` — NOT by hybrid score. Flow B doesn't compute a hybrid score, so this ordering is the only ranking that exists for emergencies. Client-side sort over the rapid-broadcast match docs in [RecommendedTicketsList.tsx](../app/(app)/dashboard/_components/RecommendedTicketsList.tsx). — RUBRIC: Innovation (rapid crisis response is a stated innovation angle in `PROJECT_BRIEF.md` §11). [spec §5]

#### Realtime listener strategy (spec §6)
Per `PROJECT_BRIEF.md` operating rule "realtime listeners only on ticket-detail progress + emergency dashboard panel; everywhere else = TanStack Query one-shot reads", apply the listener budget surgically:
- [-] Listener-cost discipline (TanStack Query for non-progress reads) — *deferred. Demo cut uses realtime listeners on Recommended + Active Tickets for instant feel; this is a post-hackathon optimization.*

#### Layout (spec §8 — non-mandatory, flagged)
- [x] FE `/dashboard` page — bento layout: Recommended primary (left/main, ~60% width on desktop, `3fr`), Active secondary (right/aside, ~40%, `2fr`); stacks vertically below 800px with Recommended first per spec §8.5. — [app/(app)/dashboard/page.tsx](../app/(app)/dashboard/page.tsx). RUBRIC: UX (visual hierarchy).

#### Verification
- [-] Manual DevTools verifications — *deferred. Recommended now reads `tickets` directly (not `matches`) so the original three-query contract has been simplified to two listeners (tickets-recommended + tickets-active).*

**Phase 2 done when:**
1. NORMAL ticket: raise → Org B sees it → pledges → both sign → progress animates → host advances → proofs → signoffs → CLOSED
2. EMERGENCY ticket: raise → all eligible orgs see it instantly + FCM → pledges commit instantly → host advances any % → proofs → signoffs → CLOSED
3. Reliability scores decay as expected; audit log shows hash-chained entries for every state change
4. Ticket detail page renders 100% of the display fields from `Albin/Nexus_Ticket_Display_Spec.md` §3 with no missing data and no extra reads beyond the ticket subtree + viewer's match doc
5. Dashboard `/dashboard` renders Active + Recommended surfaces per `Albin/Nexus_Dashboard_Logic.md` §3 + §4 in three parallel Firestore queries against the viewer's orgId, the listener-discipline rule honored, and the rapid-override sort applied within the emergency segment

---

## Phase 3 — Feed + badges (public surface)

**Goal:** the "social proof" layer. Once a ticket closes, it becomes a
public, SEO-indexable page with badges for every contributor. This is the
rubric's Alignment 25% story — visible impact, transparent attribution.

Depends on Phase 2: no badges without closed tickets.

### 3.1 Trigger: onTicketClosed
- [x] BE trigger `onTicketClosed` — one deterministic `badges/{ticketId__orgId}` per participant (host + each SIGNED_OFF contributor); pushes `BadgeRef` into `organizations.badges[]` via `arrayUnion` (idempotent on retry) — [functions/src/triggers/onTicketClosed.ts](../functions/src/triggers/onTicketClosed.ts)
- [x] `publicSlug` generated inline from `slugify(title) + ticketId.slice(0,6)` — no separate util needed
- [x] `BadgeSchema` added — [lib/schemas/badge.ts](../lib/schemas/badge.ts) (full doc shape; `BadgeRefSchema` already existed for the org-side embed)
- [x] Reliability multiplier on badges — `scorePct = proportionalSharePct × reliabilityScore(org)`; reuses [functions/src/lib/matching.ts](../functions/src/lib/matching.ts) `reliabilityScore`. *Note: orgs default to ~0.7 — seed-tune in `scripts/seed.ts` for varied demo numbers.*
- [-] Next.js SSR revalidation — *deferred for demo cut; public feed (§3.2) is not yet built.*

### 3.2 Public home feed — `/`
- [x] FE home page with closed-tickets feed below the featured stories — [app/(public)/page.tsx](../app/(public)/page.tsx) + [_components/RecentlyClosed.tsx](../app/(public)/_components/RecentlyClosed.tsx)
- [x] SSR via Admin SDK — reads `tickets where phase == "CLOSED" order by closedAt desc limit 6`, sums `badges` for value-delivered, signs the first photo proof URL.
- [x] Ticket card: title, host name+type, region, contributor count, value delivered, date closed, photo thumbnail, links to `/ticket/[id]`.
- [-] On-demand revalidation triggered from `onTicketClosed` — *deferred; ISR `revalidate=30` on `/` is good enough for demo cadence.*
- [x] Rules: `badges/*` public read + `tickets/{id}` public when CLOSED — already enforced + tested

### 3.3 Public ticket page — `/ticket/[id]`
- [x] FE SSR route — [app/(public)/ticket/[id]/page.tsx](../app/(public)/ticket/[id]/page.tsx). ISR with `revalidate=60`. 404 unless `phase === "CLOSED"`.
- [x] Need breakdown with final progress per need — rendered from `ticket.needs[*]`.
- [x] Contributors list with badges — reads `badges where ticketId == id`, hydrates org names via Admin SDK `getAll()`.
- [x] Photo-proofs gallery — Admin SDK signed URLs (1-hr expiry).
- [-] Signed agreements (Flow A) or post-hoc signatures (Flow B) — Flow A deferred per §2.3; agreements collection is auth-gated.
- [-] Final signoff notes (APPROVED only) — `signoffs/*` rules require auth, so omitted from the public page.
- [x] OpenGraph / Twitter social cards via `generateMetadata`.

### 3.4 Public org profile — `/org/[slug]`
- [x] FE SSR route — [app/(public)/org/[slug]/page.tsx](../app/(public)/org/[slug]/page.tsx). ISR `revalidate=60`. Slug = orgId. 404 unless `status === "ACTIVE"`.
- [x] Header: name, type, region, verification date (using `createdAt`).
- [x] **Three reliability mini-bars (Agreement / Execution / Closure)** — pulls `org.reliability.*.score` (0–100) into colored progress bars (green ≥75, blue ≥40, red below).
- [-] Reliability sparklines — *deferred; would need historical reliability snapshots which §2.8 sweeps don't write.*
- [x] Badge grid — flat grid (no pagination yet), each card links to `/ticket/[ticketId]`.
- [x] Resource summary — groups `resources where orgId == X` by category with count + total valuation.

### 3.5 Per-badge share page (stretch)
- [-] FE `/badge/[slug]` — single-badge shareable card for LinkedIn/X share

### 3.6 Impact metrics for pitch deck
- [x] `scripts/impact.ts` — aggregates total INR delivered, close rate, median time-to-close by flow, top-5 contributors. Run with `npx tsx scripts/impact.ts` (set GOOGLE_APPLICATION_CREDENTIALS for live, or FIRESTORE_EMULATOR_HOST for emulator). Outputs a screenshot-ready ASCII table.
- [-] Tiny React page that renders the charts — *deferred; the script's stdout output is screenshot-ready as-is.*
- [-] BigQuery / Looker Studio live dashboard — explicitly cut in plan §A.6

**Phase 3 done when:**
1. When a ticket closes, badges fire automatically and appear on `/`, `/org/[slug]`, `/ticket/[id]` within seconds
2. Anonymous users can browse closed tickets, see contributor badges, land on org profiles — no login wall
3. Org profiles show the three reliability mini-bars driven by Phase 2's sweeps
4. Impact script produces screenshot-worthy numbers

---

## Cross-cutting (applies to every phase)

- [x] **Idempotency** — `requestId` on every mutating callable; dedup via `idempotency/{uid}__{requestId}` — [functions/src/lib/idempotency.ts](../functions/src/lib/idempotency.ts)
  - [ ] TTL policy on `idempotency/*` (24h) — configure in console
- [-] **Audit log** — hash-chained `onWrite` trigger — *deferred for demo cut; trigger fires but does not yet write hashed entries.*
- [x] **App Check** — `enforceAppCheck: true` on `pledge` callable — [functions/src/callables/pledge.ts](../functions/src/callables/pledge.ts)
  - [ ] Register reCAPTCHA Enterprise site key in console and fill `NEXT_PUBLIC_APP_CHECK_SITE_KEY`
- [x] **Rules** — 31 unit tests lock all money-like fields — [tests/rules/](../tests/rules/)
  - [x] Tests added for new slices: organizations public-read for ACTIVE, resources public-read + delete, matches dismiss-only flip, agreements party-only read, signoffs contributor create + auth-gated read, default-deny on unknown collections — [tests/rules/firestore.rules.test.ts](../tests/rules/firestore.rules.test.ts).
- [-] **Realtime listeners** discipline — *deferred. Demo cut uses listeners on ticket-detail + dashboard panels for the "instant" demo feel; tightening to TanStack Query is post-hackathon.*
- [ ] **Seed script** — run once against emulator to populate demo data — [scripts/seed.ts](../scripts/seed.ts) (script written, not yet run)

---

## Blockers needing user input

- [x] Confirm `buffet-493105` is on **Blaze** plan — implicit; Functions + App Hosting deployed successfully.
- [x] Enable **Auth providers** in console — Google + Email/Password are live (signup/login working).
- [-] Register **App Check** (reCAPTCHA Enterprise) site key — *deferred for demo; `enforceAppCheck` removed from pledge callable.*
- [-] Obtain **Google Maps Platform** key — *deferred for demo; raw lat/lng + haversine acceptable.*
- [-] Create Google Docs **agreement template** — *deferred with Flow A.*
- [ ] Run `firebase deploy --only firestore:rules,firestore:indexes` whenever rules / indexes change.

---

## Dependency graph at a glance

```
Phase 1                 Phase 2                          Phase 3
────────                ────────                         ────────
signup/login            raise ticket  ──────┐
      │                      │              │
      ▼                      ▼              ▼
  onboarding   ────►   matching ──► pledge ──► commit ──► execute ──► signoff ──► CLOSE ──► badges
      │                   (Flow A/B)          (agreement     (proofs)   (approve/             │
      ▼                                        or instant)              dispute)              ▼
  govt docs                                                                             public feed
      │                                                                                      │
      ▼                                                                                      ▼
   approve                                                                            public org profiles
      │                                                                              (3 reliability bars)
      ▼
 list resources  ──────────────────► (becomes match candidates)
```

**Key handoffs:**
- Phase 1 → 2: `organizations.status === "ACTIVE"` + `resources.embedding` populated
- Phase 2 → 3: `tickets.phase === "CLOSED"` fires `onTicketClosed` which writes badges
- Phase 2 ↔ itself: `onAgreementFullySigned` (Flow A) or `pledge` directly (Flow B) both converge on `contributions.status === "COMMITTED"` + progress bump — downstream triggers are flow-agnostic
