import { initializeApp } from "firebase/app";
import { getFirestore, doc, getDoc, setDoc } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyAUQoBD7ZXt_tUE94yjNZNhtFJCbZEvxL8",
  authDomain: "mis-gastos-340f7.firebaseapp.com",
  projectId: "mis-gastos-340f7",
  storageBucket: "mis-gastos-340f7.firebasestorage.app",
  messagingSenderId: "277288849055",
  appId: "1:277288849055:web:d696efef544398a3ce9caa",
  measurementId: "G-8LJ0BEKH6D"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const DOC_REF = doc(db, "misGastos", "datos");

export const storage = {
  async get(key) {
    try {
      const snap = await getDoc(DOC_REF);
      if (snap.exists()) {
        const val = snap.data()[key];
        return val ? { value: val } : null;
      }
      return null;
    } catch {
      const value = localStorage.getItem(key);
      return value ? { value } : null;
    }
  },
  async set(key, value) {
    try {
      await setDoc(DOC_REF, { [key]: value }, { merge: true });
      return { key, value };
    } catch {
      localStorage.setItem(key, value);
      return { key, value };
    }
  },
  async delete(key) {
    try {
      await setDoc(DOC_REF, { [key]: null }, { merge: true });
      return { key, deleted: true };
    } catch {
      localStorage.removeItem(key);
      return { key, deleted: true };
    }
  }
};