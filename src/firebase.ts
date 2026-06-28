import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, setDoc, doc, deleteDoc, onSnapshot, terminate, setLogLevel } from 'firebase/firestore';

const firebaseConfig = {
  projectId: "gen-lang-client-0632461304",
  appId: "1:891192672274:web:6ba3724bf5b68d082a18cb",
  apiKey: "AIzaSyBNdd0vbLWWL5RVarCnDEG81e7EaNBQEps",
  authDomain: "gen-lang-client-0632461304.firebaseapp.com",
  firestoreDatabaseId: "ai-studio-confiesostudycom-7f3cedf9-c6be-4947-97b0-9dd766d46622",
  storageBucket: "gen-lang-client-0632461304.firebasestorage.app",
  messagingSenderId: "891192672274"
};

const app = initializeApp(firebaseConfig);

// Suppress Firestore internal logs (retry warnings on quota limit, etc.)
try {
  setLogLevel('silent');
} catch (e) {
  console.warn("Failed to set Firestore log level to silent:", e);
}

const isQuotaExceededToday = typeof window !== 'undefined' && localStorage.getItem('firestore_quota_exceeded_today') === 'true';

export const db = isQuotaExceededToday ? null : getFirestore(app, firebaseConfig.firestoreDatabaseId);

export { collection, getDocs, setDoc, doc, deleteDoc, onSnapshot, terminate };

export interface FirestoreErrorInfo {
  code: string;
  collection: string;
  operation: string;
  path: string;
  payload?: any;
  userId?: string;
  rulesUrl?: string;
}

export function handleFirestoreError(
  error: any,
  collectionName: string,
  operation: string,
  path: string,
  payload?: any
): never {
  const isPermissionDenied = error?.code === 'permission-denied' || 
                             error?.message?.includes('permission-denied') ||
                             error?.message?.includes('Missing or insufficient permissions');

  if (isPermissionDenied) {
    const errorInfo: FirestoreErrorInfo = {
      code: 'permission-denied',
      collection: collectionName,
      operation,
      path,
      payload
    };
    throw new Error(JSON.stringify(errorInfo));
  }
  throw error;
}


