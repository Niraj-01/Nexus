// data_for_entity.js
// Seeds organizations + matching auth users into the LIVE buffet-493105 project.
// Run:
//   node data_for_entity.js
//
// Sign-in pattern: <orgId>@nexus.test  /  Nexus@2026
// Custom claims:   { role: "ORG_ADMIN", orgId: <id> }

const admin = require("firebase-admin");

// Auth via Application Default Credentials (gcloud auth application-default login).
// Pin to buffet-493105 so a stray ADC project can't redirect writes.
admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  projectId: "buffet-493105",
});

const db = admin.firestore();
const auth = admin.auth();

const now = Date.now();
const PASSWORD = "Nexus@2026";

const rel = () => ({
  agreement: { score: 100, lastDecayAt: null },
  execution: { score: 100, lastDecayAt: null },
  closure: { score: 100, lastDecayAt: null },
});

const entities = [
  // --- NGOs (10) ---
  { id: "ngo-sahyadri-education-foundation", name: "Sahyadri Education Foundation", type: "NGO", geo: { lat: 19.033, lng: 73.029, adminRegion: "Navi Mumbai, MH", operatingAreas: ["Navi Mumbai", "Panvel"] }, contact: { email: "contact@sahyadri.org", phone: "+91-9000000001" } },
  { id: "ngo-brightfuture-learning-trust", name: "BrightFuture Learning Trust", type: "NGO", geo: { lat: 19.076, lng: 72.877, adminRegion: "Mumbai, MH", operatingAreas: ["Mumbai", "Thane"] }, contact: { email: "hello@brightfuture.org", phone: "+91-9000000002" } },

  { id: "ngo-aarogya-seva-trust", name: "Aarogya Seva Trust", type: "NGO", geo: { lat: 19.076, lng: 72.877, adminRegion: "Mumbai, MH", operatingAreas: ["Mumbai", "Raigad"] }, contact: { email: "care@aarogya.org", phone: "+91-9000000003" } },
  { id: "ngo-healthbridge-initiative", name: "HealthBridge Initiative", type: "NGO", geo: { lat: 19.218, lng: 72.978, adminRegion: "Thane, MH", operatingAreas: ["Thane", "Mumbai"] }, contact: { email: "info@healthbridge.org", phone: "+91-9000000004" } },

  { id: "ngo-rapid-relief-india", name: "Rapid Relief India", type: "NGO", geo: { lat: 18.989, lng: 73.117, adminRegion: "Panvel, MH", operatingAreas: ["Panvel", "Navi Mumbai"] }, contact: { email: "relief@rapidindia.org", phone: "+91-9000000005" } },
  { id: "ngo-crisiscare-foundation", name: "CrisisCare Foundation", type: "NGO", geo: { lat: 19.033, lng: 73.029, adminRegion: "Navi Mumbai, MH", operatingAreas: ["Navi Mumbai", "Mumbai"] }, contact: { email: "support@crisiscare.org", phone: "+91-9000000006" } },

  { id: "ngo-shakti-foundation", name: "Shakti Foundation", type: "NGO", geo: { lat: 19.218, lng: 72.978, adminRegion: "Thane, MH", operatingAreas: ["Thane", "Mumbai"] }, contact: { email: "contact@shakti.org", phone: "+91-9000000007" } },
  { id: "ngo-udaan-women-collective", name: "Udaan Women Collective", type: "NGO", geo: { lat: 19.076, lng: 72.877, adminRegion: "Mumbai, MH", operatingAreas: ["Mumbai", "Navi Mumbai"] }, contact: { email: "hello@udaan.org", phone: "+91-9000000008" } },

  { id: "ngo-annapurna-mission", name: "Annapurna Mission", type: "NGO", geo: { lat: 19.076, lng: 72.877, adminRegion: "Mumbai, MH", operatingAreas: ["Mumbai", "Thane"] }, contact: { email: "info@annapurna.org", phone: "+91-9000000009" } },
  { id: "ngo-hungerfree-network", name: "HungerFree Network", type: "NGO", geo: { lat: 19.033, lng: 73.029, adminRegion: "Navi Mumbai, MH", operatingAreas: ["Navi Mumbai", "Panvel"] }, contact: { email: "contact@hungerfree.org", phone: "+91-9000000010" } },

  // --- ORGs (14) ---
  { id: "org-buildright-industries", name: "BuildRight Industries", type: "ORG", geo: { lat: 19.033, lng: 73.029, adminRegion: "Navi Mumbai, MH", operatingAreas: ["Navi Mumbai", "Thane"] }, contact: { email: "csr@buildright.com", phone: "+91-9000000011" } },
  { id: "org-steelcraft-manufacturing", name: "SteelCraft Manufacturing", type: "ORG", geo: { lat: 19.218, lng: 72.978, adminRegion: "Thane, MH", operatingAreas: ["Thane", "Mumbai"] }, contact: { email: "contact@steelcraft.com", phone: "+91-9000000012" } },

  { id: "org-metro-logistics", name: "Metro Logistics Pvt Ltd", type: "ORG", geo: { lat: 19.076, lng: 72.877, adminRegion: "Mumbai, MH", operatingAreas: ["Mumbai", "Navi Mumbai"] }, contact: { email: "ops@metrologistics.com", phone: "+91-9000000013" } },
  { id: "org-swiftmove-transport", name: "SwiftMove Transport", type: "ORG", geo: { lat: 19.033, lng: 73.029, adminRegion: "Navi Mumbai, MH", operatingAreas: ["Navi Mumbai", "Panvel"] }, contact: { email: "contact@swiftmove.com", phone: "+91-9000000014" } },

  { id: "org-finserve-capital", name: "FinServe Capital", type: "ORG", geo: { lat: 19.076, lng: 72.877, adminRegion: "Mumbai, MH", operatingAreas: ["Mumbai"] }, contact: { email: "csr@finserve.com", phone: "+91-9000000015" } },
  { id: "org-impactfund-solutions", name: "ImpactFund Solutions", type: "ORG", geo: { lat: 19.076, lng: 72.877, adminRegion: "Mumbai, MH", operatingAreas: ["Mumbai", "Thane"] }, contact: { email: "impact@fund.com", phone: "+91-9000000016" } },

  { id: "org-lifecare-hospitals", name: "LifeCare Hospitals", type: "ORG", geo: { lat: 19.218, lng: 72.978, adminRegion: "Thane, MH", operatingAreas: ["Thane", "Mumbai"] }, contact: { email: "admin@lifecare.com", phone: "+91-9000000017" } },
  { id: "org-mediplus-clinics", name: "MediPlus Clinics", type: "ORG", geo: { lat: 19.033, lng: 73.029, adminRegion: "Navi Mumbai, MH", operatingAreas: ["Navi Mumbai", "Panvel"] }, contact: { email: "contact@mediplus.com", phone: "+91-9000000018" } },

  { id: "org-freshbite-foods", name: "FreshBite Foods", type: "ORG", geo: { lat: 19.033, lng: 73.029, adminRegion: "Navi Mumbai, MH", operatingAreas: ["Navi Mumbai", "Mumbai"] }, contact: { email: "csr@freshbite.com", phone: "+91-9000000019" } },
  { id: "org-nutriserve", name: "NutriServe Pvt Ltd", type: "ORG", geo: { lat: 19.076, lng: 72.877, adminRegion: "Mumbai, MH", operatingAreas: ["Mumbai", "Thane"] }, contact: { email: "info@nutriserve.com", phone: "+91-9000000020" } },

  { id: "org-amplify-media", name: "Amplify Media", type: "ORG", geo: { lat: 19.076, lng: 72.877, adminRegion: "Mumbai, MH", operatingAreas: ["Mumbai"] }, contact: { email: "hello@amplify.com", phone: "+91-9000000021" } },
  { id: "org-reachout-communications", name: "ReachOut Communications", type: "ORG", geo: { lat: 19.076, lng: 72.877, adminRegion: "Mumbai, MH", operatingAreas: ["Mumbai", "Navi Mumbai"] }, contact: { email: "contact@reachout.com", phone: "+91-9000000022" } },

  { id: "org-nexatech-solutions", name: "NexaTech Solutions", type: "ORG", geo: { lat: 19.076, lng: 72.877, adminRegion: "Mumbai, MH", operatingAreas: ["Mumbai", "Remote"] }, contact: { email: "contact@nexatech.com", phone: "+91-9000000023" } },
  { id: "org-codebridge-systems", name: "CodeBridge Systems", type: "ORG", geo: { lat: 12.972, lng: 77.594, adminRegion: "Bengaluru, KA", operatingAreas: ["Bengaluru", "Mumbai"] }, contact: { email: "hello@codebridge.com", phone: "+91-9000000024" } },
];

// ─── Resources per entity ────────────────────────────────────────────────────
// Categories must match ResourceCategory in lib/schemas/common.ts:
//   MATERIAL | FUNDS | MANUFACTURING | VENUE | VEHICLE | VOLUNTEER_HOURS
//   SERVICE | SHELTER | LOGISTICS | FOOD_KIT
//
// Hard-filter rules (functions/src/triggers/onTicketCreated.ts):
//  - resource.embeddingStatus must be "ok" → seeded "pending"; the
//    onResourceCreated trigger embeds and flips it.
//  - resource.geo.serviceRadiusKm > 0 → distance check kicks in. Set generously
//    so Mumbai-metro tickets are reachable from any seeded org.
//  - resource.terms.availableUntil must be > ticket.deadline → 365d window.
//  - emergencyContract.enabled=true required for rapid (Flow B) broadcast.
const DAY = 86_400_000;
const ONE_YEAR = 365 * DAY;

const resourcesByOrg = {
  // ── NGOs ─────────────────────────────────────────────────────────────────
  "ngo-sahyadri-education-foundation": [
    { category: "SHELTER",         title: "Community learning hall (200 seats)",  quantity: 200,  unit: "seats",  valuationINR: 200_000, radiusKm: 60 },
    { category: "VOLUNTEER_HOURS", title: "Trained tutor hours",                  quantity: 1500, unit: "hours",  valuationINR: 150_000, radiusKm: 80 },
  ],
  "ngo-brightfuture-learning-trust": [
    { category: "MATERIAL",        title: "School supply kits",                   quantity: 800,  unit: "kits",   valuationINR: 320_000, radiusKm: 100 },
    { category: "VOLUNTEER_HOURS", title: "Volunteer teacher hours",              quantity: 1000, unit: "hours",  valuationINR: 100_000, radiusKm: 80 },
  ],
  "ngo-aarogya-seva-trust": [
    { category: "SERVICE",         title: "Free OPD camp days",                   quantity: 25,   unit: "days",   valuationINR: 625_000, radiusKm: 80 },
    { category: "VOLUNTEER_HOURS", title: "Nurse volunteer hours",                quantity: 1200, unit: "hours",  valuationINR: 360_000, radiusKm: 80 },
  ],
  "ngo-healthbridge-initiative": [
    { category: "SERVICE",         title: "Mobile clinic days",                   quantity: 15,   unit: "days",   valuationINR: 450_000, radiusKm: 100 },
    { category: "VOLUNTEER_HOURS", title: "Paramedic volunteer hours",            quantity: 800,  unit: "hours",  valuationINR: 240_000, radiusKm: 80 },
  ],
  "ngo-rapid-relief-india": [
    { category: "SHELTER",         title: "Emergency shelter capacity",           quantity: 500,  unit: "beds",   valuationINR: 500_000, radiusKm: 150, emergency: true },
    { category: "VOLUNTEER_HOURS", title: "Disaster response volunteer hours",    quantity: 2500, unit: "hours",  valuationINR: 250_000, radiusKm: 150, emergency: true },
  ],
  "ngo-crisiscare-foundation": [
    { category: "SERVICE",         title: "Crisis coordination days",             quantity: 30,   unit: "days",   valuationINR: 300_000, radiusKm: 150, emergency: true },
    { category: "VOLUNTEER_HOURS", title: "Trained relief volunteer hours",       quantity: 2000, unit: "hours",  valuationINR: 200_000, radiusKm: 150, emergency: true },
  ],
  "ngo-shakti-foundation": [
    { category: "VENUE",           title: "Training centre slots",                quantity: 10,   unit: "weeks",  valuationINR: 200_000, radiusKm: 60 },
    { category: "VOLUNTEER_HOURS", title: "Skill trainer hours",                  quantity: 600,  unit: "hours",  valuationINR: 180_000, radiusKm: 80 },
  ],
  "ngo-udaan-women-collective": [
    { category: "SERVICE",         title: "Self-defence workshop days",           quantity: 20,   unit: "days",   valuationINR: 200_000, radiusKm: 80 },
    { category: "VOLUNTEER_HOURS", title: "Counsellor hours",                     quantity: 500,  unit: "hours",  valuationINR: 250_000, radiusKm: 80 },
  ],
  "ngo-annapurna-mission": [
    { category: "FOOD_KIT",        title: "Cooked meals/day",                     quantity: 1500, unit: "meals",  valuationINR: 225_000, radiusKm: 100, emergency: true },
    { category: "VOLUNTEER_HOURS", title: "Distribution volunteer hours",         quantity: 2000, unit: "hours",  valuationINR: 200_000, radiusKm: 80 },
  ],
  "ngo-hungerfree-network": [
    { category: "FOOD_KIT",        title: "Dry ration kits",                      quantity: 1000, unit: "kits",   valuationINR: 500_000, radiusKm: 120, emergency: true },
    { category: "LOGISTICS",       title: "Last-mile delivery runs",              quantity: 100,  unit: "runs",   valuationINR: 150_000, radiusKm: 100 },
  ],

  // ── ORGs ─────────────────────────────────────────────────────────────────
  "org-buildright-industries": [
    { category: "MANUFACTURING",   title: "School desks / month",                 quantity: 500,  unit: "desks",  valuationINR: 750_000,  radiusKm: 200 },
    { category: "MATERIAL",        title: "Pre-fab classroom kits",               quantity: 50,   unit: "kits",   valuationINR: 1_500_000, radiusKm: 200 },
  ],
  "org-steelcraft-manufacturing": [
    { category: "MANUFACTURING",   title: "Steel water tanks",                    quantity: 200,  unit: "tanks",  valuationINR: 800_000,  radiusKm: 250 },
    { category: "MATERIAL",        title: "Hospital beds",                        quantity: 100,  unit: "beds",   valuationINR: 600_000,  radiusKm: 200 },
  ],
  "org-metro-logistics": [
    { category: "VEHICLE",         title: "Delivery trucks",                      quantity: 8,    unit: "trucks", valuationINR: 400_000, radiusKm: 200 },
    { category: "LOGISTICS",       title: "Warehouse pallet-days",                quantity: 500,  unit: "pallet-days", valuationINR: 250_000, radiusKm: 150 },
  ],
  "org-swiftmove-transport": [
    { category: "VEHICLE",         title: "Relief trucks (emergency)",            quantity: 6,    unit: "trucks", valuationINR: 300_000, radiusKm: 200, emergency: true },
    { category: "LOGISTICS",       title: "Cold-chain runs",                      quantity: 50,   unit: "runs",   valuationINR: 200_000, radiusKm: 200, emergency: true },
  ],
  "org-finserve-capital": [
    { category: "FUNDS",           title: "CSR grant pool",                       quantity: 5_000_000, unit: "INR", valuationINR: 5_000_000, radiusKm: 500 },
    { category: "VOLUNTEER_HOURS", title: "Finance pro-bono advisory",            quantity: 200,  unit: "hours",  valuationINR: 400_000, radiusKm: 100 },
  ],
  "org-impactfund-solutions": [
    { category: "FUNDS",           title: "Disaster relief fund",                 quantity: 2_500_000, unit: "INR", valuationINR: 2_500_000, radiusKm: 500, emergency: true },
    { category: "SERVICE",         title: "Audit + compliance support",           quantity: 30,   unit: "days",   valuationINR: 450_000, radiusKm: 100 },
  ],
  "org-lifecare-hospitals": [
    { category: "SERVICE",         title: "OPD camp days",                        quantity: 20,   unit: "days",   valuationINR: 500_000, radiusKm: 100 },
    { category: "VOLUNTEER_HOURS", title: "Doctor pro-bono hours",                quantity: 1000, unit: "hours",  valuationINR: 500_000, radiusKm: 80 },
  ],
  "org-mediplus-clinics": [
    { category: "SERVICE",         title: "Emergency clinic days",                quantity: 30,   unit: "days",   valuationINR: 750_000, radiusKm: 120, emergency: true },
    { category: "VOLUNTEER_HOURS", title: "Specialist consultation hours",        quantity: 600,  unit: "hours",  valuationINR: 480_000, radiusKm: 80 },
  ],
  "org-freshbite-foods": [
    { category: "FOOD_KIT",        title: "Hot meals / week",                     quantity: 5000, unit: "meals",  valuationINR: 750_000, radiusKm: 120, emergency: true },
    { category: "MATERIAL",        title: "Packaged ration boxes",                quantity: 800,  unit: "boxes",  valuationINR: 320_000, radiusKm: 150 },
  ],
  "org-nutriserve": [
    { category: "FOOD_KIT",        title: "Nutrition food kits",                  quantity: 1500, unit: "kits",   valuationINR: 600_000, radiusKm: 120, emergency: true },
    { category: "VOLUNTEER_HOURS", title: "Nutritionist consult hours",           quantity: 200,  unit: "hours",  valuationINR: 100_000, radiusKm: 80 },
  ],
  "org-amplify-media": [
    { category: "SERVICE",         title: "Awareness campaign days",              quantity: 30,   unit: "days",   valuationINR: 600_000, radiusKm: 300 },
    { category: "VOLUNTEER_HOURS", title: "Creative design hours",                quantity: 400,  unit: "hours",  valuationINR: 240_000, radiusKm: 500 },
  ],
  "org-reachout-communications": [
    { category: "SERVICE",         title: "PR + outreach campaigns",              quantity: 20,   unit: "campaigns", valuationINR: 400_000, radiusKm: 300 },
    { category: "VOLUNTEER_HOURS", title: "Copywriter pro-bono hours",            quantity: 300,  unit: "hours",  valuationINR: 150_000, radiusKm: 500 },
  ],
  "org-nexatech-solutions": [
    { category: "SERVICE",         title: "App build sprints",                    quantity: 12,   unit: "sprints", valuationINR: 1_200_000, radiusKm: 1000 },
    { category: "VOLUNTEER_HOURS", title: "Engineer pro-bono hours",              quantity: 500,  unit: "hours",  valuationINR: 750_000, radiusKm: 1000 },
  ],
  "org-codebridge-systems": [
    { category: "SERVICE",         title: "Tech infrastructure support days",     quantity: 40,   unit: "days",   valuationINR: 800_000, radiusKm: 1000 },
    { category: "VOLUNTEER_HOURS", title: "DevOps pro-bono hours",                quantity: 400,  unit: "hours",  valuationINR: 600_000, radiusKm: 1000 },
  ],
};

async function seedResources() {
  const orgsById = new Map(entities.map((e) => [e.id, e]));
  const writes = [];
  for (const [orgId, list] of Object.entries(resourcesByOrg)) {
    const org = orgsById.get(orgId);
    if (!org) {
      console.warn(`  ! resources skipped — unknown orgId ${orgId}`);
      continue;
    }
    list.forEach((r, idx) => {
      const id = `res-${orgId}-${idx + 1}`;
      writes.push({
        id,
        data: {
          orgId,
          category: r.category,
          title: r.title,
          quantity: r.quantity,
          unit: r.unit,
          valuationINR: r.valuationINR,
          terms: {
            availableFrom: now,
            availableUntil: now + ONE_YEAR,
            conditions: "",
          },
          // Resource geo defaults to the org's. serviceRadiusKm gates the
          // hard-filter distance check in matching.
          geo: {
            lat: org.geo.lat,
            lng: org.geo.lng,
            adminRegion: org.geo.adminRegion,
            operatingAreas: org.geo.operatingAreas,
            serviceRadiusKm: r.radiusKm,
          },
          emergencyContract: {
            enabled: Boolean(r.emergency),
            emergencyCategories: r.emergency ? [r.category] : [],
            maxQuantityPerTicket: r.quantity,
            autoNotify: Boolean(r.emergency),
          },
          status: "AVAILABLE",
          // The onResourceCreated trigger flips this to "ok" + writes the
          // 768-d embedding vector. Until then, matching skips the doc.
          embeddingVersion: null,
          embeddingStatus: "pending",
          createdAt: now,
        },
      });
    });
  }

  // Skip resources that already exist — overwriting wipes the `embedding`
  // vector populated by onResourceCreated (the trigger only fires on create,
  // never on update, so the vector cannot be regenerated).
  const refs = writes.map((w) => db.collection("resources").doc(w.id));
  const snaps = await db.getAll(...refs);
  const toWrite = writes.filter((_, i) => !snaps[i].exists);
  const skipped = writes.length - toWrite.length;

  if (toWrite.length === 0) {
    console.log(`Resources: 0 new (${skipped} already exist, skipped).`);
    return;
  }

  // Firestore batch limit is 500; we're well under, but split anyway.
  const CHUNK = 400;
  for (let i = 0; i < toWrite.length; i += CHUNK) {
    const batch = db.batch();
    for (const w of toWrite.slice(i, i + CHUNK)) {
      batch.set(db.collection("resources").doc(w.id), w.data);
    }
    await batch.commit();
  }
  console.log(`Resources: ${toWrite.length} written, ${skipped} skipped (already existed). Embeddings populate via onResourceCreated.`);
}

async function seedOrganizations() {
  // Skip orgs that already exist — re-writing them would clobber fields added
  // by approveOrg / other flows (e.g. approvedAt).
  const refs = entities.map((e) => db.collection("organizations").doc(e.id));
  const snaps = await db.getAll(...refs);
  const toWrite = entities.filter((_, i) => !snaps[i].exists);
  const skipped = entities.length - toWrite.length;

  if (toWrite.length === 0) {
    console.log(`Organizations: 0 new (${skipped} already exist, skipped).`);
    return;
  }

  const batch = db.batch();
  for (const e of toWrite) {
    batch.set(db.collection("organizations").doc(e.id), {
      name: e.name,
      type: e.type,
      status: "ACTIVE",
      govtDocs: [],
      geo: e.geo,
      reliability: rel(),
      badges: [],
      contact: e.contact,
      createdAt: now,
    });
  }
  await batch.commit();
  console.log(`Organizations: ${toWrite.length} written, ${skipped} skipped (already existed).`);
}

// ─── Demo tickets ────────────────────────────────────────────────────────────
// Two tickets, hosted by NGOs in different domains, with needs that map to
// resources we just seeded. onTicketCreated will embed each ticket and run
// the Flow A matching pipeline → matches/{ticketId__orgId} top-K writes.
//
// IDs are deterministic so re-runs skip cleanly.
const ZERO_PLEDGE = { quantity: 0, valuationINR: 0, pctOfNeed: 0 };

const demoTickets = [
  {
    id: "demo-edu-mumbai-desks",
    hostOrgId: "ngo-brightfuture-learning-trust",
    title: "Classroom desks + setup fund — 5 Mumbai schools",
    description:
      "Replacing broken classroom furniture across 5 government schools serving 1,500 students. Need desks manufactured and delivered, plus a small fund for assembly and on-site setup.",
    category: "EDUCATION",
    urgency: "NORMAL",
    geo: { lat: 19.076, lng: 72.877, adminRegion: "Mumbai, MH", operatingAreas: ["Mumbai"] },
    deadlineDays: 30,
    needs: [
      // → org-buildright-industries / org-steelcraft-manufacturing (MANUFACTURING)
      { resourceCategory: "MANUFACTURING", quantity: 400,    unit: "desks", valuationINR: 600_000 },
      // → org-finserve-capital / org-impactfund-solutions (FUNDS)
      { resourceCategory: "FUNDS",         quantity: 300_000, unit: "INR",   valuationINR: 300_000 },
    ],
  },
  {
    id: "demo-food-mumbai-meals",
    hostOrgId: "ngo-annapurna-mission",
    title: "3-month meal program — 200 children, Mumbai slum",
    description:
      "Daily meal program for 200 schoolchildren across a Mumbai slum cluster. Need cooked meals or dry-ration kits weekly, plus last-mile delivery to 4 distribution points.",
    category: "FOOD_SECURITY",
    urgency: "NORMAL",
    geo: { lat: 19.076, lng: 72.877, adminRegion: "Mumbai, MH", operatingAreas: ["Mumbai"] },
    deadlineDays: 21,
    needs: [
      // → org-freshbite-foods / org-nutriserve / ngo-hungerfree-network (FOOD_KIT)
      { resourceCategory: "FOOD_KIT",  quantity: 2000, unit: "meals", valuationINR: 300_000 },
      // → org-metro-logistics / org-swiftmove-transport / ngo-hungerfree-network (LOGISTICS)
      { resourceCategory: "LOGISTICS", quantity: 50,   unit: "runs",  valuationINR: 75_000 },
    ],
  },
  {
    // Hosted by a women's NGO so SERVICE/VOLUNTEER_HOURS/FUNDS contributors
    // are all in the non-host pool. Cash-or-kind: medicines covered by FUNDS
    // (FinServe/ImpactFund) OR by camp days in kind (Aarogya/HealthBridge/etc).
    id: "demo-health-camp-mumbai",
    hostOrgId: "ngo-shakti-foundation",
    title: "Women's health camp — 12 days, Thane–Mumbai belt",
    description:
      "12-day women's health screening camp across 6 Thane–Mumbai community centres for ~1,200 women. Need OPD/clinic days from a partner hospital, nurse volunteer hours, and a small fund for medicines and consumables.",
    category: "HEALTH",
    urgency: "NORMAL",
    geo: { lat: 19.218, lng: 72.978, adminRegion: "Thane, MH", operatingAreas: ["Thane", "Mumbai"] },
    deadlineDays: 25,
    needs: [
      // → org-lifecare-hospitals / org-mediplus-clinics / ngo-aarogya-seva-trust / ngo-healthbridge-initiative (SERVICE)
      { resourceCategory: "SERVICE",         quantity: 12,     unit: "days",  valuationINR: 360_000 },
      // → ngo-aarogya-seva-trust / ngo-healthbridge-initiative (VOLUNTEER_HOURS)
      { resourceCategory: "VOLUNTEER_HOURS", quantity: 200,    unit: "hours", valuationINR: 60_000 },
      // → org-finserve-capital / org-impactfund-solutions (FUNDS)
      { resourceCategory: "FUNDS",           quantity: 100_000, unit: "INR",  valuationINR: 100_000 },
    ],
  },
  {
    // EMERGENCY → rapid:true. Exercises Flow B broadcast: matches every
    // emergency-enabled resource within radius (no top-K cap). All needs
    // are in-kind by design — that's the disaster demo.
    id: "demo-disaster-panvel-flood",
    hostOrgId: "ngo-crisiscare-foundation",
    title: "Flash flood relief — Panvel belt, 800 families displaced",
    description:
      "Sudden flash flooding in the Panvel belt has displaced ~800 families. Immediate need for emergency shelter, dry-ration kits, relief trucks, and last-mile delivery runs to 4 staging camps.",
    category: "DISASTER",
    urgency: "EMERGENCY",
    geo: { lat: 18.989, lng: 73.117, adminRegion: "Panvel, MH", operatingAreas: ["Panvel", "Navi Mumbai"] },
    deadlineDays: 3,
    needs: [
      // → ngo-rapid-relief-india (SHELTER, emergency-enabled)
      { resourceCategory: "SHELTER",   quantity: 200, unit: "beds",   valuationINR: 200_000 },
      // → org-freshbite-foods / org-nutriserve / ngo-hungerfree-network / ngo-annapurna-mission (FOOD_KIT, emergency-enabled)
      { resourceCategory: "FOOD_KIT",  quantity: 500, unit: "kits",   valuationINR: 250_000 },
      // → org-swiftmove-transport (VEHICLE, emergency-enabled)
      { resourceCategory: "VEHICLE",   quantity: 4,   unit: "trucks", valuationINR: 200_000 },
      // → org-swiftmove-transport (LOGISTICS, emergency-enabled)
      { resourceCategory: "LOGISTICS", quantity: 30,  unit: "runs",   valuationINR: 90_000 },
    ],
  },
  {
    // Hosted by Udaan (women's collective). VENUE has a single supplier
    // (Shakti) by design — demonstrates a need with one obvious partner
    // alongside richer FUNDS/VOLUNTEER_HOURS pools.
    id: "demo-women-livelihood-thane",
    hostOrgId: "ngo-udaan-women-collective",
    title: "Women's livelihood training — 4-week cohort, Thane",
    description:
      "4-week tailoring + digital-skills training for 60 women in Thane. Need a training venue with seating + power, skill trainer hours, and a stipend fund for travel and starter kits.",
    category: "LIVELIHOOD",
    urgency: "NORMAL",
    geo: { lat: 19.218, lng: 72.978, adminRegion: "Thane, MH", operatingAreas: ["Thane", "Mumbai"] },
    deadlineDays: 35,
    needs: [
      // → ngo-shakti-foundation (VENUE)
      { resourceCategory: "VENUE",           quantity: 4,       unit: "weeks", valuationINR: 80_000 },
      // → ngo-shakti-foundation / ngo-sahyadri-education-foundation / ngo-brightfuture-learning-trust (VOLUNTEER_HOURS, semantic ranks Shakti first)
      { resourceCategory: "VOLUNTEER_HOURS", quantity: 300,     unit: "hours", valuationINR: 90_000 },
      // → org-finserve-capital / org-impactfund-solutions (FUNDS)
      { resourceCategory: "FUNDS",           quantity: 200_000, unit: "INR",   valuationINR: 200_000 },
    ],
  },
  {
    // Hosted by RapidRelief — tech orgs become natural top-K candidates by
    // semantic + category match. All-kind ticket (pure SERVICE + engineer hours).
    id: "demo-ngo-tech-build",
    hostOrgId: "ngo-rapid-relief-india",
    title: "Field-ops mobile app — 6-sprint build for relief teams",
    description:
      "Need a lightweight Android app for relief field teams to log distributions, beneficiary intake, and stock movements offline-first. 6 build sprints + on-call engineering support during rollout.",
    category: "OTHER",
    urgency: "NORMAL",
    geo: { lat: 18.989, lng: 73.117, adminRegion: "Panvel, MH", operatingAreas: ["Panvel", "Navi Mumbai"] },
    deadlineDays: 60,
    needs: [
      // → org-nexatech-solutions / org-codebridge-systems (SERVICE — semantic ranks tech orgs first)
      { resourceCategory: "SERVICE",         quantity: 6,   unit: "sprints", valuationINR: 600_000 },
      // → org-nexatech-solutions / org-codebridge-systems (VOLUNTEER_HOURS — engineers/devops)
      { resourceCategory: "VOLUNTEER_HOURS", quantity: 150, unit: "hours",   valuationINR: 225_000 },
    ],
  },
];

async function seedTickets() {
  const orgsById = new Map(entities.map((e) => [e.id, e]));
  const refs = demoTickets.map((t) => db.collection("tickets").doc(t.id));
  const snaps = await db.getAll(...refs);
  const toWrite = demoTickets.filter((_, i) => !snaps[i].exists);
  const skipped = demoTickets.length - toWrite.length;

  if (toWrite.length === 0) {
    console.log(`Tickets: 0 new (${skipped} already exist, skipped).`);
    return;
  }

  // Pre-flight: warn if any resource is still pending embedding. The matching
  // pipeline hard-filters out non-"ok" resources, so a ticket created now
  // would silently miss them.
  const pending = await db
    .collection("resources")
    .where("embeddingStatus", "==", "pending")
    .limit(1)
    .get();
  if (!pending.empty) {
    console.log("  ! Some resources still embedding. Tickets created now may match a smaller pool.");
    console.log("    Wait ~30s after the resource seed before creating tickets for full coverage.");
  }

  const batch = db.batch();
  for (const t of toWrite) {
    const host = orgsById.get(t.hostOrgId);
    if (!host) {
      console.warn(`  ! ticket ${t.id} skipped — host org ${t.hostOrgId} not in entities list`);
      continue;
    }
    const rapid = t.urgency === "EMERGENCY";
    const deadline = now + t.deadlineDays * DAY;
    const needs = t.needs.map((n) => ({
      resourceCategory: n.resourceCategory,
      quantity: n.quantity,
      unit: n.unit,
      valuationINR: n.valuationINR,
      hostSelfPledge: ZERO_PLEDGE,
      progressPct: 0,
    }));

    batch.set(db.collection("tickets").doc(t.id), {
      hostOrgId: t.hostOrgId,
      host: { name: host.name, type: host.type },
      title: t.title,
      description: t.description,
      category: t.category,
      urgency: t.urgency,
      rapid,
      needs,
      geo: t.geo,
      deadline,
      // Match the raiseTicket callable: skip RAISED, jump straight to open.
      phase: "OPEN_FOR_CONTRIBUTIONS",
      progressPct: 0,
      advancedEarly: false,
      participantOrgIds: [t.hostOrgId],
      contributorCount: 0,
      createdAt: now,
      phaseChangedAt: now,
      lastUpdatedAt: now,
      closedAt: null,
      embeddingVersion: null,
      // onTicketCreated flips this to "ok" + writes the embedding vector
      // + runs Flow A matching → matches/{ticketId__orgId}.
      embeddingStatus: "pending",
    });
  }
  await batch.commit();
  console.log(
    `Tickets: ${toWrite.length} written, ${skipped} skipped (already existed). onTicketCreated will embed + run matching.`,
  );
}

async function seedAuthUsers() {
  // Skip-if-exists: never delete + recreate. Existing users keep their
  // password and refresh tokens. Claims and the users/{uid} mirror doc are
  // only written when the auth user is created in this run.
  let created = 0;
  let skipped = 0;
  for (const e of entities) {
    const uid = `seed-${e.id}`;
    const email = `${e.id}@nexus.test`;
    try {
      const existing = await auth.getUser(uid).catch(() => null);
      if (existing) {
        skipped++;
        continue;
      }
      await auth.createUser({
        uid,
        email,
        password: PASSWORD,
        displayName: e.name,
        emailVerified: true,
      });
      await auth.setCustomUserClaims(uid, { role: "ORG_ADMIN", orgId: e.id });
      await db.collection("users").doc(uid).set({
        orgId: e.id,
        role: "ORG_ADMIN",
        email,
        createdAt: now,
      });
      created++;
    } catch (err) {
      console.warn(`  ! ${email} failed:`, err && err.message ? err.message : err);
    }
  }
  console.log(`Auth users: ${created} created, ${skipped} skipped (already existed).`);
}

async function main() {
  await seedOrganizations();
  await seedResources();
  await seedAuthUsers();
  await seedTickets();
  console.log("\nDone.");
  console.log(`Sign in: <orgId>@nexus.test  /  ${PASSWORD}`);
  console.log("Example: ngo-sahyadri-education-foundation@nexus.test");
  console.log("\nNote: resources + tickets are written with embeddingStatus=pending.");
  console.log("Triggers (onResourceCreated, onTicketCreated) embed and run matching");
  console.log("within ~10s each. Match docs land in the matches/ collection.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
