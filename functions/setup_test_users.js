const admin = require('firebase-admin');
admin.initializeApp({ projectId: 'buffet-493105' });

async function setup() {
  const db = admin.firestore();
  const auth = admin.auth();
  
  const users = [
    { email: 'niraj@test.com', displayName: 'Niraj', role: 'NGO' },
    { email: 'albin@test.com', displayName: 'Albin', role: 'ORG' },
    { email: 'dhrupad@test.com', displayName: 'Dhrupad', role: 'ORG' }
  ];

  for (const u of users) {
    let userRecord;
    try {
      userRecord = await auth.getUserByEmail(u.email);
    } catch (e) {
      userRecord = await auth.createUser({
        email: u.email,
        password: 'password123',
        displayName: u.displayName,
      });
    }
    const uid = userRecord.uid;
    console.log(`User ${u.displayName}: ${uid}`);

    // Create org
    await db.collection('organizations').doc(uid).set({
      name: `${u.displayName} Org`,
      type: u.role,
      region: 'Panvel, MH',
      status: 'ACTIVE',
      contactEmail: u.email,
      reliability: {
        agreement: { score: 90, count: 1 },
        execution: { score: 90, count: 1 },
        closure: { score: 90, count: 1 }
      }
    }, { merge: true });

    // Set custom claims
    await auth.setCustomUserClaims(uid, { orgId: uid, role: u.displayName === 'Dhrupad' ? 'PLATFORM_ADMIN' : undefined });
    console.log(`Org and claims set for ${u.displayName}`);
    
    // Create resources for Albin and Dhrupad
    if (u.displayName === 'Albin') {
      await db.collection('resources').doc(`res_albin`).set({
        providerOrgId: uid,
        category: 'FUNDS',
        title: 'Demo financial pool',
        quantity: 100000,
        unit: 'INR',
        valuation: 100000,
        location: new admin.firestore.GeoPoint(18.9894, 73.1175),
        serviceRadiusKm: 50,
        terms: {
          availableFrom: admin.firestore.Timestamp.now(),
          availableUntil: admin.firestore.Timestamp.fromMillis(Date.now() + 30 * 24 * 60 * 60 * 1000),
          emergencyContractEnabled: false
        },
        embeddingStatus: 'ok'
      }, { merge: true });
    }
    
    if (u.displayName === 'Dhrupad') {
      await db.collection('resources').doc(`res_dhrupad`).set({
        providerOrgId: uid,
        category: 'MANUFACTURING',
        title: 'Demo desk production line',
        quantity: 200,
        unit: 'desks',
        valuation: 200000,
        location: new admin.firestore.GeoPoint(18.9894, 73.1175),
        serviceRadiusKm: 50,
        terms: {
          availableFrom: admin.firestore.Timestamp.now(),
          availableUntil: admin.firestore.Timestamp.fromMillis(Date.now() + 30 * 24 * 60 * 60 * 1000),
          emergencyContractEnabled: false
        },
        embeddingStatus: 'ok'
      }, { merge: true });
    }
  }
}

setup().then(() => console.log('All done!')).catch(console.error);
