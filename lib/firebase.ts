import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore"; // 1. 必須引入這個
import { getAuth } from "firebase/auth";           // 2. 如果有用到登入也要引入

const firebaseConfig = {
  apiKey: "AIzaSyBfQ7zCkz-RZ7V04u4qrPGEZdzvti9Ikyw",
  authDomain: "daoteng-9bbe9.firebaseapp.com",
  projectId: "daoteng-9bbe9",
  storageBucket: "daoteng-9bbe9.firebasestorage.app",
  messagingSenderId: "404364429356",
  appId: "1:404364429356:web:6033e055437dc9cebb6989",
  measurementId: "G-RWT13GPP5E"
};

// 初始化 Firebase
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

// 3. 定義並匯出 db 與 auth
const db = getFirestore(app);
const auth = getAuth(app);

export { app, db, auth }; // 這行最重要，沒這行 page.tsx 就會報錯