import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
  increment,
  arrayUnion,
  arrayRemove
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBHG2YxJD6TJrqPxRd-huOJumG47h2mWgc",
  authDomain: "conectavibe-9acb1.firebaseapp.com",
  projectId: "conectavibe-9acb1",
  storageBucket: "conectavibe-9acb1.firebasestorage.app",
  messagingSenderId: "474038201373",
  appId: "1:474038201373:web:96a15c64f70f2e134f2af4"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

export {
  auth,
  db,
  signInAnonymously,
  onAuthStateChanged,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
  increment,
  arrayUnion,
  arrayRemove
};