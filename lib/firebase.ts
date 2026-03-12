import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyBfQ7zCkz-RZ7V04u4qrPGEZdzvti9Ikyw",
  authDomain: "daoteng-9bbe9.firebaseapp.com",
  projectId: "daoteng-9bbe9", 
  storageBucket: "daoteng-9bbe9.firebasestorage.app",
  messagingSenderId: "404364429356",
  appId: "1:404364429356:web:6033e055437dc9cebb6989",
  measurementId: "G-RWT13GPP5E"
};

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

export { app, db, auth };