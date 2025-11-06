// Import the functions you need from the SDKs you need
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-analytics.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged, sendEmailVerification } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js";
import { getDatabase, ref, set, get, update, remove, onValue, push } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-database.js";
// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyBdZoaFlP-8ZEdbvOzPDcbAty20QYF2BjE",
  authDomain: "palengke-a4bc2.firebaseapp.com",
  projectId: "palengke-a4bc2",
  storageBucket: "palengke-a4bc2.firebasestorage.app",
  messagingSenderId: "348753851943",
  appId: "1:348753851943:web:47cff22f9094e35b2a4002",
  measurementId: "G-1KF8JSQY85",
  databaseURL: "https://palengke-a4bc2-default-rtdb.asia-southeast1.firebasedatabase.app/"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const auth = getAuth(app);
const database = getDatabase(app);

// Cloudinary configuration
const cloudinaryConfig = {
  cloudName: 'da4myoyrm',
  uploadPreset: 'palengke_products'
};

// Export if needed elsewhere
export { 
  app, analytics, auth, database, 
  createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged, sendEmailVerification, updatePassword,
  ref, set, get, update, remove, onValue, push,
  cloudinaryConfig 
};