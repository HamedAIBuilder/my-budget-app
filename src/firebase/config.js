// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getFirestore } from "firebase/firestore";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyDReXsLauLEqnn1hkzd1blA3Kf7-acyq9U",
  authDomain: "budgetsavingsapp.firebaseapp.com",
  databaseURL: "https://budgetsavingsapp-default-rtdb.firebaseio.com",
  projectId: "budgetsavingsapp",
  storageBucket: "budgetsavingsapp.appspot.com",
  messagingSenderId: "75085688737",
  appId: "1:75085688737:web:febe1c9f933eb7665fe5e0",
  measurementId: "G-XKCKVYY0GN"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const db = getFirestore(app);
export { app, db };


