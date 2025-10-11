// ASAMS Core Authentication and Redirection Logic
import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js';
import { 
    getAuth, 
    signInWithEmailAndPassword, 
    signOut, 
    onAuthStateChanged 
} from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js';
import { firebaseConfig } from './firebase_config.js';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Use setLogLevel('Debug') for local debugging
// import { setLogLevel } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js';
// setLogLevel('Debug');

// --- Helper Functions ---

/** Displays a styled error message on the page */
function displayMessage(containerId, message, isError = true) {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = `<div class="${isError ? 'error-message' : 'success-message'}">${message}</div>`;
    container.style.display = 'block';
    setTimeout(() => {
        container.style.display = 'none';
        container.innerHTML = '';
    }, 5000);
}

/** * Checks the user's role claim and redirects to the appropriate dashboard. 
 * If not authenticated, redirects to login.
 */
function checkAuthAndRedirect() {
    onAuthStateChanged(auth, async (user) => {
        const currentPath = window.location.pathname;
        const isAdminPage = currentPath.includes('admin'); // General check for admin pages

        if (user) {
            // Get user's custom claims to determine role
            const idTokenResult = await user.getIdTokenResult();
            const role = idTokenResult.claims.role;

            if (role === 'master_admin' && !currentPath.includes('master_admin.html')) {
                window.location.href = 'master_admin.html';
            } else if (role === 'saloon_owner' && !currentPath.includes('saloon_admin.html')) {
                window.location.href = 'saloon_admin.html';
            } else if (role && currentPath.includes('login.html')) {
                // If logged in and on the login page, redirect to the correct dashboard
                 window.location.href = role === 'master_admin' ? 'master_admin.html' : 'saloon_admin.html';
            }
        } else if (isAdminPage && !currentPath.includes('login.html')) {
            // If not logged in and on an admin page, redirect to login
            window.location.href = 'login.html';
        }
    });
}

/** Handles user sign-in */
async function handleLogin(email, password) {
    try {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        // The onAuthStateChanged listener will handle the redirection after successful login
    } catch (error) {
        let message = "Login failed. Please check your email and password.";
        if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
            message = "Invalid credentials.";
        } else if (error.code === 'auth/too-many-requests') {
            message = "Too many failed attempts. Please try again later.";
        }
        displayMessage('auth-message', message, true);
        throw error; // Re-throw to allow calling script to handle UI changes (e.g., hiding spinner)
    }
}

/** Handles user sign-out */
function handleLogout() {
    signOut(auth).then(() => {
        // Redirection handled by onAuthStateChanged listener
        window.location.href = 'login.html';
    }).catch((error) => {
        console.error("Logout Error:", error);
    });
}

// Export necessary variables and functions
export { auth, db, handleLogin, handleLogout, checkAuthAndRedirect, displayMessage };
