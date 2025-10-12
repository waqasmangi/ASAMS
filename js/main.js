// 1. Firebase Configuration
const firebaseConfig = {
    apiKey: "AIzaSyASYEyIgxmKLoSKUwgx9IxDtPwuDR69wso",
    authDomain: "asams-a539a.firebaseapp.com",
    projectId: "asams-a539a",
    storageBucket: "asams-a539a.firebasestorage.app",
    messagingSenderId: "518908788173",
    appId: "1:518908788173:web:0706014508b8f774391884",
    measurementId: "G-XR730JWN20"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// 2. UI Functions for index.html
const loginForm = document.getElementById('login-form');
const signupForm = document.getElementById('signup-form');
const loginOptions = document.querySelector('.login-options');

function showLogin() {
    loginOptions.style.display = 'none';
    signupForm.style.display = 'none';
    loginForm.style.display = 'flex';
}

function showSignup() {
    loginOptions.style.display = 'none';
    loginForm.style.display = 'none';
    signupForm.style.display = 'flex';
}

document.getElementById('login-btn')?.addEventListener('click', showLogin);
document.getElementById('signup-btn')?.addEventListener('click', showSignup);
document.getElementById('guest-btn')?.addEventListener('click', () => {
    // Redirect guest user to the customer view for browsing
    window.location.href = 'customer.html';
});

// 3. User Authentication (Login/Signup)

// Handle Sign Up
signupForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('signup-email').value;
    const password = document.getElementById('signup-password').value;
    const name = document.getElementById('signup-name').value;
    const role = document.getElementById('signup-role').value;

    try {
        const userCredential = await auth.createUserWithEmailAndPassword(email, password);
        const user = userCredential.user;

        // Store user details in Firestore
        await db.collection('users').doc(user.uid).set({
            name: name,
            email: email,
            role: role,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            // Initial status for store owners (for trial management)
            status: role === 'store_owner' ? 'trial' : 'active'
        });

        alert('Registration successful! Redirecting...');
        // Redirect to the appropriate dashboard
        handleUserRedirect(user);

        // --- Twilio SMS Logic Placeholder ---
        // For security, Twilio messages MUST be sent from a secure server (like Cloud Functions)
        // You would call a Cloud Function here to send a welcome SMS.
        // CALL_CLOUD_FUNCTION_TO_SEND_SMS({to: user.phoneNumber, body: "Welcome to ASAMS!"})

    } catch (error) {
        alert(`Sign Up failed: ${error.message}`);
    }
});

// Handle Log In
loginForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;

    try {
        const userCredential = await auth.signInWithEmailAndPassword(email, password);
        handleUserRedirect(userCredential.user);
    } catch (error) {
        alert(`Login failed: ${error.message}`);
    }
});

// 4. Authentication State Listener & Redirection

auth.onAuthStateChanged(async (user) => {
    if (user && window.location.pathname.endsWith('index.html')) {
        // If user is logged in and on the index page, redirect them
        handleUserRedirect(user);
    } else if (!user && !window.location.pathname.endsWith('index.html')) {
        // If user is not logged in and not on the index page, redirect to index
        // window.location.href = 'index.html';
    }
});

async function handleUserRedirect(user) {
    if (!user) return;

    try {
        const userDoc = await db.collection('users').doc(user.uid).get();
        if (userDoc.exists) {
            const userData = userDoc.data();

            // Store the role in sessionStorage for use across pages
            sessionStorage.setItem('userRole', userData.role);

            // 6. Master Admin Trial Check Logic Placeholder:
            if (userData.role === 'store_owner' && userData.status !== 'active') {
                // This trial logic needs to be enforced by a secure backend function (Cloud Function)
                // that disables the account after 7 days.
                // For the client-side, we'll check the status:
                if (userData.status === 'trial_expired') {
                    alert("Your 7-day trial has expired. Please pay the subscription fee to continue access.");
                    auth.signOut(); // Log out the user
                    return;
                }
            }


            // Redirect based on role
            switch (userData.role) {
                case 'master_admin':
                    window.location.href = 'master_admin.html';
                    break;
                case 'store_owner':
                    window.location.href = 'store_owner.html';
                    break;
                case 'customer':
                default:
                    window.location.href = 'customer.html';
                    break;
            }
        } else {
            console.error("User document not found.");
            auth.signOut();
        }
    } catch (error) {
        console.error("Error fetching user role:", error);
        auth.signOut();
    }
}

// Global Logout function
window.logout = function() {
    auth.signOut().then(() => {
        sessionStorage.clear();
        window.location.href = 'index.html';
    }).catch((error) => {
        console.error("Logout failed:", error);
    });
}
