// js/firebase_config.js

// 1. Core Firebase SDK imports (MUST be included in the HTML file first)
/*
   <script src="https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js"></script>
   <script src="https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js"></script>
   <script src="https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js"></script>
*/

// 2. Your Firebase Project Configuration
const firebaseConfig = {
    apiKey: "AIzaSyBxgOhd3y5L7Xl_IzWkuJ02PBlswR9lt5k",
    authDomain: "nirmal-library.firebaseapp.com",
    projectId: "nirmal-library",
    storageBucket: "nirmal-library.firebasestorage.app",
    messagingSenderId: "157338670869",
    appId: "1:157338670869:web:b7c3d4594bc0185edcfb1c",
    measurementId: "G-WLD8D9Z0HM"
};

// 3. Initialize Firebase
const app = firebase.initializeApp(firebaseConfig);

// 4. Get References to Services
const auth = firebase.auth();
const db = firebase.firestore();
const storage = firebase.storage(); // For storing Saloon Logos later
