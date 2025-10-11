// js/firebase_config.js

// 1. Firebase Project Configuration for ASAMS-A539A
const firebaseConfig = {
    apiKey: "AIzaSyASYEyIgxmKLoSKUwgx9IxDtPwuDR69wso",
    authDomain: "asams-a539a.firebaseapp.com",
    projectId: "asams-a539a", 
    storageBucket: "asams-a539a.firebasestorage.app",
    messagingSenderId: "518908788173",
    appId: "1:518908788173:web:0706014508b8f774391884",
    measurementId: "G-XR730JWN20"
};

// 2. Initialize Firebase and get references to core services
// NOTE: Firebase SDKs must be loaded via <script> tags in the HTML body.
const app = firebase.initializeApp(firebaseConfig);

// THESE ARE THE GLOBAL OBJECTS USED THROUGHOUT THE APP:
const auth = firebase.auth();
const db = firebase.firestore();
const storage = firebase.storage();
const functions = firebase.functions(); // Reference for calling Cloud Functions
