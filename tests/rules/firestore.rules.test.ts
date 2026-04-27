/**
 * Firestore rules unit tests — one test per locked field from plan §Write-path.
 *
 * Prereqs: run the emulator first:
 *   npx firebase emulators:start --only firestore
 * Then: npx vitest run tests/rules
 */
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import {
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
import { asAdmin, asAnon, asOrgA, asOrgB, makeEnv, ORG_A, ORG_B } from "./helpers";

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await makeEnv();
});

afterAll(async () => {
  await env.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
});

// Seeds a CLOSED ticket and an OPEN ticket via rules-bypass context for use in read tests.
async function seedTickets() {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "tickets/closed-1"), {
      hostOrgId: ORG_A,
      phase: "CLOSED",
      urgency: "NORMAL",
      rapid: false,
      progressPct: 100,
      needs: [],
      createdAt: 1,
    });
    await setDoc(doc(db, "tickets/open-1"), {
      hostOrgId: ORG_A,
      phase: "OPEN_FOR_CONTRIBUTIONS",
      urgency: "NORMAL",
      rapid: false,
      progressPct: 20,
      needs: [
        { resourceCategory: "MATERIAL", quantity: 10, unit: "kits", valuationINR: 1000,
          hostSelfPledge: { quantity: 0, valuationINR: 0, pctOfNeed: 0 }, progressPct: 20 },
      ],
      createdAt: 1,
    });
  });
}

describe("tickets — public read gating", () => {
  beforeEach(seedTickets);

  it("anon can read a CLOSED ticket", async () => {
    await assertSucceeds(getDoc(doc(asAnon(env), "tickets/closed-1")));
  });

  it("anon CANNOT read an OPEN ticket", async () => {
    await assertFails(getDoc(doc(asAnon(env), "tickets/open-1")));
  });

  it("signed-in user can read an OPEN ticket", async () => {
    await assertSucceeds(getDoc(doc(asOrgB(env), "tickets/open-1")));
  });
});

describe("tickets — create locks", () => {
  it("host can create a ticket without server-only fields", async () => {
    await assertSucceeds(
      setDoc(doc(asOrgA(env), "tickets/t1"), {
        hostOrgId: ORG_A,
        title: "x", description: "y", category: "EDU",
        urgency: "NORMAL", rapid: false,
        needs: [{ resourceCategory: "MATERIAL", quantity: 1, unit: "k", valuationINR: 1,
          hostSelfPledge: { quantity: 0, valuationINR: 0, pctOfNeed: 0 } }],
        geo: { lat: 0, lng: 0, adminRegion: "IN", operatingAreas: [] },
        deadline: 999, createdAt: 1,
      }),
    );
  });

  it("client CANNOT set phase on create", async () => {
    await assertFails(
      setDoc(doc(asOrgA(env), "tickets/t2"), {
        hostOrgId: ORG_A, urgency: "NORMAL", rapid: false,
        phase: "CLOSED", needs: [], createdAt: 1,
      }),
    );
  });

  it("client CANNOT set progressPct on create", async () => {
    await assertFails(
      setDoc(doc(asOrgA(env), "tickets/t3"), {
        hostOrgId: ORG_A, urgency: "NORMAL", rapid: false,
        progressPct: 100, needs: [], createdAt: 1,
      }),
    );
  });
});

describe("tickets — update locks (urgency/rapid/needs/phase immutable)", () => {
  beforeEach(seedTickets);

  it("host can update title on an open ticket", async () => {
    await assertSucceeds(updateDoc(doc(asOrgA(env), "tickets/open-1"), { title: "renamed" }));
  });

  it("host CANNOT flip urgency", async () => {
    await assertFails(updateDoc(doc(asOrgA(env), "tickets/open-1"), { urgency: "EMERGENCY" }));
  });

  it("host CANNOT flip rapid", async () => {
    await assertFails(updateDoc(doc(asOrgA(env), "tickets/open-1"), { rapid: true }));
  });

  it("host CANNOT mutate needs[]", async () => {
    await assertFails(updateDoc(doc(asOrgA(env), "tickets/open-1"), { needs: [] }));
  });

  it("host CANNOT advance phase", async () => {
    await assertFails(updateDoc(doc(asOrgA(env), "tickets/open-1"), { phase: "EXECUTION" }));
  });

  it("host CANNOT touch progressPct", async () => {
    await assertFails(updateDoc(doc(asOrgA(env), "tickets/open-1"), { progressPct: 99 }));
  });

  it("non-host org CANNOT update the ticket", async () => {
    await assertFails(updateDoc(doc(asOrgB(env), "tickets/open-1"), { title: "hijack" }));
  });
});

describe("contributions — locks", () => {
  beforeEach(async () => {
    await seedTickets();
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "tickets/open-1/contributions/c1"), {
        contributorOrgId: ORG_B,
        needIndex: 0,
        offered: { kind: "MATERIAL", quantity: 5, unit: "kits", valuationINR: 500, pctOfNeed: 50, notes: "" },
        status: "PROPOSED",
        commitPath: "AGREEMENT_FIRST",
        requestId: "req-00000001",
        createdAt: 1,
      });
    });
  });

  it("contributor CAN create a PROPOSED contribution without status/commitPath", async () => {
    await assertSucceeds(
      setDoc(doc(asOrgB(env), "tickets/open-1/contributions/c2"), {
        contributorOrgId: ORG_B,
        needIndex: 0,
        offered: { kind: "MATERIAL", quantity: 3, unit: "kits", valuationINR: 300, pctOfNeed: 30, notes: "" },
        requestId: "req-00000002",
        createdAt: 1,
      }),
    );
  });

  it("contributor CANNOT pre-set status on create", async () => {
    await assertFails(
      setDoc(doc(asOrgB(env), "tickets/open-1/contributions/c3"), {
        contributorOrgId: ORG_B, needIndex: 0,
        offered: { kind: "MATERIAL", quantity: 1, unit: "k", valuationINR: 1, pctOfNeed: 10, notes: "" },
        status: "COMMITTED",
        requestId: "req-00000003", createdAt: 1,
      }),
    );
  });

  it("contributor CANNOT forge commitPath on create", async () => {
    await assertFails(
      setDoc(doc(asOrgB(env), "tickets/open-1/contributions/c4"), {
        contributorOrgId: ORG_B, needIndex: 0,
        offered: { kind: "MATERIAL", quantity: 1, unit: "k", valuationINR: 1, pctOfNeed: 10, notes: "" },
        commitPath: "PLEDGE_FIRST",
        requestId: "req-00000004", createdAt: 1,
      }),
    );
  });

  it("contributor CANNOT flip status on update", async () => {
    await assertFails(
      updateDoc(doc(asOrgB(env), "tickets/open-1/contributions/c1"), { status: "COMMITTED" }),
    );
  });

  it("host can edit the contribution but not its locked fields", async () => {
    await assertSucceeds(
      updateDoc(doc(asOrgA(env), "tickets/open-1/contributions/c1"), {
        offered: { kind: "MATERIAL", quantity: 6, unit: "kits", valuationINR: 600, pctOfNeed: 60, notes: "revised" },
      }),
    );
    await assertFails(
      updateDoc(doc(asOrgA(env), "tickets/open-1/contributions/c1"), { commitPath: "PLEDGE_FIRST" }),
    );
  });
});

describe("organizations — status + reliability locks", () => {
  it("member can create org with default PENDING_REVIEW status", async () => {
    await assertSucceeds(
      setDoc(doc(asOrgA(env), `organizations/${ORG_A}`), {
        name: "A",
        type: "NGO",
        status: "PENDING_REVIEW",
        govtDocs: [],
        geo: { lat: 0, lng: 0, adminRegion: "IN", operatingAreas: [] },
        contact: { email: "a@a.com" },
        createdAt: 1,
      }),
    );
  });

  it("member CANNOT create with ACTIVE status", async () => {
    await assertFails(
      setDoc(doc(asOrgA(env), `organizations/${ORG_A}`), {
        name: "A", type: "NGO", status: "ACTIVE",
        govtDocs: [],
        geo: { lat: 0, lng: 0, adminRegion: "IN", operatingAreas: [] },
        contact: { email: "a@a.com" },
        createdAt: 1,
      }),
    );
  });

  it("member CANNOT write reliability on create", async () => {
    await assertFails(
      setDoc(doc(asOrgA(env), `organizations/${ORG_A}`), {
        name: "A", type: "NGO", status: "PENDING_REVIEW",
        govtDocs: [],
        geo: { lat: 0, lng: 0, adminRegion: "IN", operatingAreas: [] },
        contact: { email: "a@a.com" },
        reliability: {
          agreement: { score: 100, lastDecayAt: null },
          execution: { score: 100, lastDecayAt: null },
          closure: { score: 100, lastDecayAt: null },
        },
        createdAt: 1,
      }),
    );
  });

  it("member CANNOT flip status to ACTIVE on update", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `organizations/${ORG_A}`), {
        name: "A", type: "NGO", status: "PENDING_REVIEW",
        govtDocs: [],
        geo: { lat: 0, lng: 0, adminRegion: "IN", operatingAreas: [] },
        contact: { email: "a@a.com" },
        reliability: {
          agreement: { score: 100, lastDecayAt: null },
          execution: { score: 100, lastDecayAt: null },
          closure: { score: 100, lastDecayAt: null },
        },
        createdAt: 1,
      });
    });
    await assertFails(
      updateDoc(doc(asOrgA(env), `organizations/${ORG_A}`), { status: "ACTIVE" }),
    );
  });
});

describe("organizations — fresh user self-create branch", () => {
  // A signed-in user who does NOT yet have an `orgId` custom claim.
  // Matches the state of a brand-new sign-up during /onboard finalize.
  const UID_FRESH = "user-fresh";

  function asFreshUser() {
    return env.authenticatedContext(UID_FRESH, { role: "ORG_ADMIN" }).firestore();
  }

  const validPayload = {
    name: "Fresh NGO",
    type: "NGO",
    status: "PENDING_REVIEW",
    govtDocs: [],
    geo: { lat: 12.97, lng: 77.59, adminRegion: "Bengaluru, KA", operatingAreas: [] },
    contact: { email: "hi@fresh.example" },
    docsUploaded: { pan: true, reg: true },
    createdAt: 1,
  };

  it("fresh user CAN create organizations/{uid} with PENDING_REVIEW + no reliability/badges", async () => {
    await assertSucceeds(
      setDoc(doc(asFreshUser(), `organizations/${UID_FRESH}`), validPayload),
    );
  });

  it("fresh user CANNOT create organizations/{otherUid}", async () => {
    await assertFails(
      setDoc(doc(asFreshUser(), `organizations/not-my-uid`), validPayload),
    );
  });

  it("fresh user CANNOT smuggle reliability/badges or non-PENDING status", async () => {
    await assertFails(
      setDoc(doc(asFreshUser(), `organizations/${UID_FRESH}`), {
        ...validPayload,
        status: "ACTIVE",
      }),
    );
    await assertFails(
      setDoc(doc(asFreshUser(), `organizations/${UID_FRESH}`), {
        ...validPayload,
        reliability: {
          agreement: { score: 100, lastDecayAt: null },
          execution: { score: 100, lastDecayAt: null },
          closure: { score: 100, lastDecayAt: null },
        },
      }),
    );
    await assertFails(
      setDoc(doc(asFreshUser(), `organizations/${UID_FRESH}`), {
        ...validPayload,
        badges: [{ ticketId: "t", closedAt: 1, contributionSummary: "x" }],
      }),
    );
  });
});

describe("resources — status + embedding locks", () => {
  it("owner CANNOT create a resource client-side — must go through createResource callable", async () => {
    await assertFails(
      setDoc(doc(asOrgA(env), "resources/r1"), {
        orgId: ORG_A,
        category: "MATERIAL",
        title: "t", quantity: 1, unit: "u", valuationINR: 1,
        terms: { availableFrom: 1, availableUntil: 2, conditions: "" },
        geo: { lat: 0, lng: 0, adminRegion: "IN", operatingAreas: [], serviceRadiusKm: 0 },
        emergencyContract: { enabled: false, emergencyCategories: [], maxQuantityPerTicket: 0, autoNotify: false },
        status: "AVAILABLE",
      }),
    );
  });

  it("owner CANNOT write embedding on create (covered by blanket client-create deny)", async () => {
    await assertFails(
      setDoc(doc(asOrgA(env), "resources/r1"), {
        orgId: ORG_A,
        category: "MATERIAL",
        title: "t", quantity: 1, unit: "u", valuationINR: 1,
        terms: { availableFrom: 1, availableUntil: 2, conditions: "" },
        geo: { lat: 0, lng: 0, adminRegion: "IN", operatingAreas: [], serviceRadiusKm: 0 },
        emergencyContract: { enabled: false, emergencyCategories: [], maxQuantityPerTicket: 0, autoNotify: false },
        status: "AVAILABLE",
        embedding: new Array(768).fill(0),
      }),
    );
  });

  it("owner CANNOT flip embeddingStatus on update", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "resources/r-embed"), {
        orgId: ORG_A, category: "MATERIAL",
        title: "t", quantity: 1, unit: "u", valuationINR: 1,
        terms: { availableFrom: 1, availableUntil: 2, conditions: "" },
        geo: { lat: 0, lng: 0, adminRegion: "IN", operatingAreas: [], serviceRadiusKm: 0 },
        emergencyContract: { enabled: false, emergencyCategories: [], maxQuantityPerTicket: 0, autoNotify: false },
        status: "AVAILABLE",
        embeddingStatus: "pending",
      });
    });
    await assertFails(
      updateDoc(doc(asOrgA(env), "resources/r-embed"), { embeddingStatus: "ok" }),
    );
    await assertFails(
      updateDoc(doc(asOrgA(env), "resources/r-embed"), { embeddingVersion: "text-embedding-004" }),
    );
  });

  it("owner CANNOT flip status on update", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "resources/r1"), {
        orgId: ORG_A, category: "MATERIAL",
        title: "t", quantity: 1, unit: "u", valuationINR: 1,
        terms: { availableFrom: 1, availableUntil: 2, conditions: "" },
        geo: { lat: 0, lng: 0, adminRegion: "IN", operatingAreas: [], serviceRadiusKm: 0 },
        emergencyContract: { enabled: false, emergencyCategories: [], maxQuantityPerTicket: 0, autoNotify: false },
        status: "AVAILABLE",
      });
    });
    await assertFails(updateDoc(doc(asOrgA(env), "resources/r1"), { status: "DEPLETED" }));
  });
});

describe("badges + auditLog — public/server-only", () => {
  beforeEach(async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "badges/b1"), {
        orgId: ORG_A, ticketId: "t", ticketTitle: "x",
        contributionSummary: "y", closedAt: 1, publicSlug: "p",
      });
      await setDoc(doc(ctx.firestore(), "auditLog/a1"), {
        actorId: "u", action: "x", targetType: "ticket", targetId: "t",
        payloadHash: "h", prevHash: null, createdAt: 1,
      });
    });
  });

  it("anon can read badges", async () => {
    await assertSucceeds(getDoc(doc(asAnon(env), "badges/b1")));
  });

  it("org CANNOT write badges", async () => {
    await assertFails(
      setDoc(doc(asOrgA(env), "badges/b2"), {
        orgId: ORG_A, ticketId: "t", ticketTitle: "x",
        contributionSummary: "y", closedAt: 1, publicSlug: "p2",
      }),
    );
  });

  it("org CANNOT read auditLog", async () => {
    await assertFails(getDoc(doc(asOrgA(env), "auditLog/a1")));
  });

  it("admin CAN read auditLog", async () => {
    await assertSucceeds(getDoc(doc(asAdmin(env), "auditLog/a1")));
  });

  it("nobody (even admin via client SDK) can write auditLog", async () => {
    await assertFails(
      setDoc(doc(asAdmin(env), "auditLog/a2"), {
        actorId: "u", action: "x", targetType: "ticket", targetId: "t",
        payloadHash: "h", prevHash: null, createdAt: 1,
      }),
    );
  });
});

describe("photoProofs — closed-ticket public read", () => {
  beforeEach(async () => {
    await seedTickets();
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "tickets/closed-1/photoProofs/p1"), {
        uploadedBy: "u", fileUrl: "gs://x", caption: "", takenAt: 1, uploadedAt: 1,
      });
      await setDoc(doc(ctx.firestore(), "tickets/open-1/photoProofs/p1"), {
        uploadedBy: "u", fileUrl: "gs://x", caption: "", takenAt: 1, uploadedAt: 1,
      });
    });
  });

  it("anon can read proofs on CLOSED ticket", async () => {
    await assertSucceeds(getDoc(doc(asAnon(env), "tickets/closed-1/photoProofs/p1")));
  });

  it("anon CANNOT read proofs on OPEN ticket", async () => {
    await assertFails(getDoc(doc(asAnon(env), "tickets/open-1/photoProofs/p1")));
  });
});

// ─── New-slices tests (added with §3.2/§3.3/§3.4 public surfaces) ─────────

describe("organizations — public ACTIVE read", () => {
  beforeEach(async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, `organizations/${ORG_A}`), {
        name: "Active Org",
        type: "NGO",
        status: "ACTIVE",
        govtDocs: [],
        geo: { lat: 0, lng: 0, adminRegion: "IN", operatingAreas: [] },
        contact: { email: "a@a.com" },
        createdAt: 1,
      });
      await setDoc(doc(db, `organizations/${ORG_B}`), {
        name: "Pending Org",
        type: "ORG",
        status: "PENDING_REVIEW",
        govtDocs: [],
        geo: { lat: 0, lng: 0, adminRegion: "IN", operatingAreas: [] },
        contact: { email: "b@b.com" },
        createdAt: 1,
      });
    });
  });

  it("anon CAN read an ACTIVE org (public profile page)", async () => {
    await assertSucceeds(getDoc(doc(asAnon(env), `organizations/${ORG_A}`)));
  });

  it("anon CANNOT read a PENDING_REVIEW org", async () => {
    await assertFails(getDoc(doc(asAnon(env), `organizations/${ORG_B}`)));
  });
});

describe("resources — public read", () => {
  beforeEach(async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "resources/r-public"), {
        orgId: ORG_A,
        category: "FOOD_KIT",
        title: "kits",
        quantity: 100,
        unit: "kits",
        valuationINR: 50000,
        terms: { availableFrom: 1, availableUntil: 999, conditions: "" },
        geo: {
          lat: 0,
          lng: 0,
          adminRegion: "IN",
          operatingAreas: [],
          serviceRadiusKm: 10,
        },
        emergencyContract: {
          enabled: false,
          emergencyCategories: [],
          maxQuantityPerTicket: 0,
          autoNotify: false,
        },
        status: "AVAILABLE",
      });
    });
  });

  it("anon CAN read resources (public listing for matching)", async () => {
    await assertSucceeds(getDoc(doc(asAnon(env), "resources/r-public")));
  });

  it("owner CAN delete their own resource", async () => {
    const { deleteDoc } = await import("firebase/firestore");
    await assertSucceeds(deleteDoc(doc(asOrgA(env), "resources/r-public")));
  });

  it("non-owner CANNOT delete a resource", async () => {
    const { deleteDoc } = await import("firebase/firestore");
    await assertFails(deleteDoc(doc(asOrgB(env), "resources/r-public")));
  });
});

describe("matches — server-only writes, member dismiss-flip only", () => {
  beforeEach(async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "matches/m-a"), {
        orgId: ORG_A,
        ticketId: "t-1",
        topResourceId: "r-1",
        score: 0.8,
        rapidBroadcast: false,
        createdAt: 1,
        dismissed: false,
      });
    });
  });

  it("viewer org CAN read its own match", async () => {
    await assertSucceeds(getDoc(doc(asOrgA(env), "matches/m-a")));
  });

  it("non-viewer org CANNOT read another org's match", async () => {
    await assertFails(getDoc(doc(asOrgB(env), "matches/m-a")));
  });

  it("viewer org CAN flip only `dismissed` on their match", async () => {
    await assertSucceeds(
      updateDoc(doc(asOrgA(env), "matches/m-a"), { dismissed: true }),
    );
  });

  it("viewer org CANNOT touch `score` or other fields", async () => {
    await assertFails(updateDoc(doc(asOrgA(env), "matches/m-a"), { score: 1.0 }));
    await assertFails(
      updateDoc(doc(asOrgA(env), "matches/m-a"), { dismissed: true, score: 1.0 }),
    );
  });

  it("nobody can client-create a match doc", async () => {
    await assertFails(
      setDoc(doc(asOrgA(env), "matches/m-new"), {
        orgId: ORG_A,
        ticketId: "t-2",
        topResourceId: "r-2",
        score: 0.5,
        rapidBroadcast: false,
        createdAt: 1,
      }),
    );
  });
});

describe("agreements — party-only read, server-only write", () => {
  beforeEach(async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "agreements/a-1"), {
        ticketId: "t-1",
        hostOrgId: ORG_A,
        contributorOrgId: ORG_B,
        status: "DRAFT",
        createdAt: 1,
      });
    });
  });

  it("host party CAN read agreement", async () => {
    await assertSucceeds(getDoc(doc(asOrgA(env), "agreements/a-1")));
  });

  it("contributor party CAN read agreement", async () => {
    await assertSucceeds(getDoc(doc(asOrgB(env), "agreements/a-1")));
  });

  it("non-party org CANNOT read agreement", async () => {
    const ORG_C_ctx = env
      .authenticatedContext("user-c", { role: "ORG_ADMIN", orgId: "org-c" })
      .firestore();
    await assertFails(getDoc(doc(ORG_C_ctx, "agreements/a-1")));
  });

  it("party org CANNOT client-write an agreement", async () => {
    await assertFails(
      updateDoc(doc(asOrgA(env), "agreements/a-1"), { status: "SIGNED" }),
    );
  });
});

describe("signoffs — contributor create only", () => {
  beforeEach(async () => {
    await seedTickets();
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "tickets/open-1/contributions/c-b"), {
        contributorOrgId: ORG_B,
        needIndex: 0,
        offered: {
          kind: "MATERIAL",
          quantity: 5,
          unit: "kits",
          valuationINR: 500,
          pctOfNeed: 50,
          notes: "",
        },
        status: "EXECUTED",
        commitPath: "PLEDGE_FIRST",
        requestId: "req-00000010",
        createdAt: 1,
      });
    });
  });

  it("contributor CAN create their own signoff", async () => {
    await assertSucceeds(
      setDoc(doc(asOrgB(env), "tickets/open-1/signoffs/s-1"), {
        contributorOrgId: ORG_B,
        decision: "APPROVED",
        note: "",
        createdAt: 1,
      }),
    );
  });

  it("non-contributor CANNOT forge a signoff under another org", async () => {
    await assertFails(
      setDoc(doc(asOrgA(env), "tickets/open-1/signoffs/s-2"), {
        contributorOrgId: ORG_B,
        decision: "APPROVED",
        note: "",
        createdAt: 1,
      }),
    );
  });

  it("signed-in users CAN read signoffs on a ticket", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "tickets/open-1/signoffs/s-3"), {
        contributorOrgId: ORG_B,
        decision: "APPROVED",
        note: "",
        createdAt: 1,
      });
    });
    await assertSucceeds(
      getDoc(doc(asOrgA(env), "tickets/open-1/signoffs/s-3")),
    );
  });

  it("anon CANNOT read signoffs (auth-gated)", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "tickets/closed-1/signoffs/s-4"), {
        contributorOrgId: ORG_B,
        decision: "APPROVED",
        note: "",
        createdAt: 1,
      });
    });
    await assertFails(
      getDoc(doc(asAnon(env), "tickets/closed-1/signoffs/s-4")),
    );
  });
});

describe("default deny — unknown collections", () => {
  it("nobody (even admin via client SDK) can read an unknown top-level collection", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "secrets/s1"), { v: 1 });
    });
    await assertFails(getDoc(doc(asOrgA(env), "secrets/s1")));
    await assertFails(getDoc(doc(asAdmin(env), "secrets/s1")));
    await assertFails(getDoc(doc(asAnon(env), "secrets/s1")));
  });
});
