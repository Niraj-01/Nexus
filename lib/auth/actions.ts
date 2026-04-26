"use client";

import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as fbSignOut,
  sendPasswordResetEmail,
  type UserCredential,
} from "firebase/auth";
import { FirebaseError } from "firebase/app";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { auth, db, googleProvider } from "@/lib/firebase/client";

/** Ensure users/{uid} exists. Called after every sign-in. */
async function ensureUserDoc(cred: UserCredential) {
  try {
    const ref = doc(db, "users", cred.user.uid);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, {
        email: cred.user.email,
        displayName: cred.user.displayName ?? null,
        role: "ORG_ADMIN",
        orgId: null,
        createdAt: serverTimestamp(),
      });
    }
  } catch (err) {
    if (err instanceof FirebaseError) {
      console.warn("Unable to sync users/{uid} during sign-in", err.code, err.message);
      return;
    }

    console.warn("Unable to sync users/{uid} during sign-in", err);
  }
}

export async function signUpEmail(email: string, password: string) {
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  await ensureUserDoc(cred);
  return cred;
}

export async function signInEmail(email: string, password: string) {
  const cred = await signInWithEmailAndPassword(auth, email, password);
  await ensureUserDoc(cred);
  return cred;
}

export async function signInGoogle() {
  const cred = await signInWithPopup(auth, googleProvider);
  await ensureUserDoc(cred);
  return cred;
}

export async function sendReset(email: string) {
  return sendPasswordResetEmail(auth, email);
}

export async function signOutUser() {
  return fbSignOut(auth);
}
