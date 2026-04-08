// ============================================================
//  firebase.js — Bid Command Firebase Integration
// ============================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore, collection, doc, addDoc, updateDoc, deleteDoc,
  getDocs, getDoc, onSnapshot, query, orderBy, where, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-analytics.js";

const firebaseConfig = {
  apiKey: "AIzaSyCYbgXHRszaViJymAgX7ksRdkgawAnosc4",
  authDomain: "sakuraslice-7d994.firebaseapp.com",
  projectId: "sakuraslice-7d994",
  storageBucket: "sakuraslice-7d994.firebasestorage.app",
  messagingSenderId: "30486629644",
  appId: "1:30486629644:web:886c2cc3c3e134bc5e8d29",
  measurementId: "G-5XFV7VBTD5"
};

const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const db = getFirestore(app);

// ─── BIDS ──────────────────────────────────────────────────
export const bidsCol = () => collection(db, "bids");
export const bidDoc  = (id) => doc(db, "bids", id);

export async function addBid(data) {
  return await addDoc(collection(db, "bids"), { ...data, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
}

export async function updateBid(id, data) {
  return await updateDoc(bidDoc(id), { ...data, updatedAt: serverTimestamp() });
}

export async function deleteBid(id) {
  return await deleteDoc(bidDoc(id));
}

export async function getBids() {
  const snap = await getDocs(query(collection(db, "bids"), orderBy("createdAt", "desc")));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export function listenBids(callback) {
  return onSnapshot(query(collection(db, "bids"), orderBy("createdAt", "desc")), snap => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  });
}

// ─── TASKS ─────────────────────────────────────────────────
export const tasksCol = () => collection(db, "tasks");

export async function addTask(data) {
  return await addDoc(collection(db, "tasks"), { ...data, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
}

export async function updateTask(id, data) {
  return await updateDoc(doc(db, "tasks", id), { ...data, updatedAt: serverTimestamp() });
}

export async function deleteTask(id) {
  return await deleteDoc(doc(db, "tasks", id));
}

export async function getTasks() {
  const snap = await getDocs(query(collection(db, "tasks"), orderBy("createdAt", "desc")));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export function listenTasks(callback) {
  return onSnapshot(query(collection(db, "tasks"), orderBy("createdAt", "desc")), snap => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  });
}

// ─── DOCUMENTS (files/attachments metadata) ─────────────────
export async function addDocument(data) {
  return await addDoc(collection(db, "documents"), { ...data, createdAt: serverTimestamp() });
}

export async function getDocuments() {
  const snap = await getDocs(query(collection(db, "documents"), orderBy("createdAt", "desc")));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function deleteDocument(id) {
  return await deleteDoc(doc(db, "documents", id));
}

export function listenDocuments(callback) {
  return onSnapshot(query(collection(db, "documents"), orderBy("createdAt", "desc")), snap => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  });
}

// ─── CONTACTS ──────────────────────────────────────────────
export async function addContact(data) {
  return await addDoc(collection(db, "contacts"), { ...data, createdAt: serverTimestamp() });
}

export async function updateContact(id, data) {
  return await updateDoc(doc(db, "contacts", id), { ...data, updatedAt: serverTimestamp() });
}

export async function deleteContact(id) {
  return await deleteDoc(doc(db, "contacts", id));
}

export function listenContacts(callback) {
  return onSnapshot(query(collection(db, "contacts"), orderBy("createdAt", "desc")), snap => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  });
}

export { db };
