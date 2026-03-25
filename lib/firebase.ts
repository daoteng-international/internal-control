import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { getStorage } from "firebase/storage"; // 💡 新增這行

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
const storage = getStorage(app); // 💡 新增這行：初始化 Firebase Storage

export { app, db, auth, storage };