# NEXUS Demo Cheat Sheet

Quick reference for driving a live demo on the seeded `buffet-493105` data.
Generated alongside [data_for_entity.js](data_for_entity.js).

## Login

All seeded entities share the same password.

- **Email pattern:** `<orgId>@nexus.test`
- **Password:** `Nexus@2026`
- **Role:** every seeded user is an `ORG_ADMIN` for their own org.

### NGOs (10)

| Org | Email | Domain |
|---|---|---|
| Sahyadri Education Foundation | `ngo-sahyadri-education-foundation@nexus.test` | Education |
| BrightFuture Learning Trust | `ngo-brightfuture-learning-trust@nexus.test` | Education |
| Aarogya Seva Trust | `ngo-aarogya-seva-trust@nexus.test` | Healthcare |
| HealthBridge Initiative | `ngo-healthbridge-initiative@nexus.test` | Healthcare |
| Rapid Relief India | `ngo-rapid-relief-india@nexus.test` | Disaster relief |
| CrisisCare Foundation | `ngo-crisiscare-foundation@nexus.test` | Disaster relief |
| Shakti Foundation | `ngo-shakti-foundation@nexus.test` | Women empowerment |
| Udaan Women Collective | `ngo-udaan-women-collective@nexus.test` | Women empowerment |
| Annapurna Mission | `ngo-annapurna-mission@nexus.test` | Food distribution |
| HungerFree Network | `ngo-hungerfree-network@nexus.test` | Food distribution |

### Organizations (14)

| Org | Email | Subtype |
|---|---|---|
| BuildRight Industries | `org-buildright-industries@nexus.test` | Manufacturing |
| SteelCraft Manufacturing | `org-steelcraft-manufacturing@nexus.test` | Manufacturing |
| Metro Logistics Pvt Ltd | `org-metro-logistics@nexus.test` | Logistics |
| SwiftMove Transport | `org-swiftmove-transport@nexus.test` | Logistics |
| FinServe Capital | `org-finserve-capital@nexus.test` | Finance |
| ImpactFund Solutions | `org-impactfund-solutions@nexus.test` | Finance |
| LifeCare Hospitals | `org-lifecare-hospitals@nexus.test` | Hospital |
| MediPlus Clinics | `org-mediplus-clinics@nexus.test` | Hospital |
| FreshBite Foods | `org-freshbite-foods@nexus.test` | Food production |
| NutriServe Pvt Ltd | `org-nutriserve@nexus.test` | Food production |
| Amplify Media | `org-amplify-media@nexus.test` | Marketing |
| ReachOut Communications | `org-reachout-communications@nexus.test` | Marketing |
| NexaTech Solutions | `org-nexatech-solutions@nexus.test` | Technology |
| CodeBridge Systems | `org-codebridge-systems@nexus.test` | Technology |

## Demo tickets (6)

For each ticket, the **Login as** column lists contributor orgs whose seeded
resources match a need by category and (where applicable) emergency flag. Pick
any one per need to demonstrate the contribution flow — the remaining rows
give backup options if you want to show multiple bids on a single need.

### Ticket 1 — Education: classroom desks, Mumbai

- **ID:** `demo-edu-mumbai-desks`
- **Host:** `ngo-brightfuture-learning-trust`
- **Needs:** MANUFACTURING 400 desks · FUNDS ₹3L

| Login as | Resource to contribute | Need it fills |
|---|---|---|
| `org-buildright-industries` | School desks / month (500/mo) | MANUFACTURING |
| `org-steelcraft-manufacturing` | Steel water tanks (cross-category swap if needed) | MANUFACTURING |
| `org-finserve-capital` | CSR grant pool (₹50L) | FUNDS (cash) |
| `org-impactfund-solutions` | Disaster relief fund (₹25L) | FUNDS (cash) |

### Ticket 2 — Food: 3-month meal program, Mumbai

- **ID:** `demo-food-mumbai-meals`
- **Host:** `ngo-annapurna-mission`
- **Needs:** FOOD_KIT 2,000 meals · LOGISTICS 50 runs

| Login as | Resource to contribute | Need it fills |
|---|---|---|
| `org-freshbite-foods` | Hot meals / week (5,000/wk) | FOOD_KIT |
| `org-nutriserve` | Nutrition food kits (1,500) | FOOD_KIT |
| `ngo-hungerfree-network` | Dry ration kits (1,000) | FOOD_KIT |
| `org-metro-logistics` | Delivery trucks (8) | LOGISTICS |
| `org-swiftmove-transport` | Cold-chain runs (50) | LOGISTICS |

### Ticket 3 — Healthcare: women's health camp, Thane–Mumbai

- **ID:** `demo-health-camp-mumbai`
- **Host:** `ngo-shakti-foundation`
- **Needs:** SERVICE 12 days · VOLUNTEER_HOURS 200 nurse hrs · FUNDS ₹1L

| Login as | Resource to contribute | Need it fills |
|---|---|---|
| `org-lifecare-hospitals` | OPD camp days (20) | SERVICE |
| `org-mediplus-clinics` | Emergency clinic days (30) | SERVICE |
| `ngo-aarogya-seva-trust` | Free OPD camp days (25) — also nurse hours | SERVICE / VOLUNTEER_HOURS |
| `ngo-healthbridge-initiative` | Mobile clinic days + paramedic hours | SERVICE / VOLUNTEER_HOURS |
| `org-finserve-capital` | CSR grant pool | FUNDS (cash) |
| `org-impactfund-solutions` | Disaster relief fund | FUNDS (cash) |

### Ticket 4 — Disaster: flash flood relief, Panvel **(EMERGENCY / rapid)**

- **ID:** `demo-disaster-panvel-flood`
- **Host:** `ngo-crisiscare-foundation`
- **Needs:** SHELTER 200 beds · FOOD_KIT 500 kits · VEHICLE 4 trucks · LOGISTICS 30 runs
- **Flow:** Rapid (Flow B broadcast). Match docs are written for *every*
  emergency-enabled resource in radius — no top-K cap.

| Login as | Resource to contribute | Need it fills |
|---|---|---|
| `ngo-rapid-relief-india` | Emergency shelter capacity (500 beds) | SHELTER |
| `org-freshbite-foods` | Hot meals / week | FOOD_KIT |
| `org-nutriserve` | Nutrition food kits | FOOD_KIT |
| `ngo-hungerfree-network` | Dry ration kits | FOOD_KIT |
| `ngo-annapurna-mission` | Cooked meals / day | FOOD_KIT |
| `org-swiftmove-transport` | Relief trucks + cold-chain runs | VEHICLE / LOGISTICS |

### Ticket 5 — Livelihood: women's training cohort, Thane

- **ID:** `demo-women-livelihood-thane`
- **Host:** `ngo-udaan-women-collective`
- **Needs:** VENUE 4 weeks · VOLUNTEER_HOURS 300 trainer hrs · FUNDS ₹2L

| Login as | Resource to contribute | Need it fills |
|---|---|---|
| `ngo-shakti-foundation` | Training centre slots (10 weeks) — also skill trainer hours | VENUE / VOLUNTEER_HOURS |
| `ngo-sahyadri-education-foundation` | Trained tutor hours | VOLUNTEER_HOURS |
| `ngo-brightfuture-learning-trust` | Volunteer teacher hours | VOLUNTEER_HOURS |
| `org-finserve-capital` | CSR grant pool | FUNDS (cash) |
| `org-impactfund-solutions` | Disaster relief fund | FUNDS (cash) |

### Ticket 6 — Tech: field-ops mobile app for relief teams

- **ID:** `demo-ngo-tech-build`
- **Host:** `ngo-rapid-relief-india`
- **Needs:** SERVICE 6 sprints · VOLUNTEER_HOURS 150 engineer hrs

| Login as | Resource to contribute | Need it fills |
|---|---|---|
| `org-nexatech-solutions` | App build sprints (12) — also engineer pro-bono hours | SERVICE / VOLUNTEER_HOURS |
| `org-codebridge-systems` | Tech infrastructure support days — also DevOps hours | SERVICE / VOLUNTEER_HOURS |

## Demo runbook

A clean end-to-end pass on any single ticket:

1. **Login as host NGO** → confirm the ticket is on `My Tickets` with the
   correct needs and `OPEN_FOR_CONTRIBUTIONS` phase.
2. **Sign out** → login as a contributor org from the table for that ticket.
3. On the dashboard, find the ticket → click `Contribute` → fill the form
   (resource, quantity, valuation) → submit.
4. **Sign out** → login back as the host NGO → review the contribution under
   the ticket's `Contributions` tab → accept / sign off.
5. **Repeat** with another contributor for a second need to show the ticket
   filling progressively. For the disaster ticket, do this with two
   different emergency-enabled orgs to show the rapid-broadcast pool.

## Notes

- Each ticket has at least one **cash (FUNDS)** option *or* an **in-kind**
  option (sometimes both) so you can demo whichever path the audience asks
  for. The disaster and tech tickets are intentionally all-kind.
- Match docs are written by the `onTicketCreated` trigger and live in the
  `matches/` collection. The contributor dashboard currently lists open
  tickets directly (not match docs) — see the comment in
  `RecommendedTicketsList.tsx` — so contributors will see every non-CLOSED
  ticket they aren't already part of.
- All resource embeddings populate within ~10s of seeding. If matches look
  empty, give the triggers a moment.
