// firebase-config.js

// Import the functions you need from the SDKs
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
// Import all Firestore functions that will be used across the app
import { getFirestore, doc, setDoc, getDoc, updateDoc, collection, onSnapshot, getDocs, writeBatch } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// Your web app's Firebase configuration from your project
const firebaseConfig = {
  apiKey: "AIzaSyBwhrzO991ZY8eA-OfS6mMi0Q6IP61yzS4",
  authDomain: "recolte-agricole-2025.firebaseapp.com",
  projectId: "recolte-agricole-2025",
  storageBucket: "recolte-agricole-2025.firebasestorage.app",
  messagingSenderId: "542260752944",
  appId: "1:542260752944:web:2b9fdd8715b5924f62b3f5"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase services
const auth = getAuth(app);
const db = getFirestore(app);

// Export the services and functions to be used in other parts of the application
export {
    app,
    auth,
    db,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    onAuthStateChanged,
    signOut,
    doc,
    setDoc,
    getDoc,
    updateDoc,
    collection,
    onSnapshot,
    getDocs,
    writeBatch
};
