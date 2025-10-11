// js/auth.js

// This file relies on global 'auth', 'db', and 'functions' from firebase_config.js

document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const errorMessage = document.getElementById('error-message');
    errorMessage.textContent = '';
    
    e.target.querySelector('button').textContent = 'Authenticating...';

    try {
        // Firebase Auth: Sign in
        const userCredential = await auth.signInWithEmailAndPassword(email, password);
        const user = userCredential.user;

        // Firestore: Fetch user role
        const userDoc = await db.collection('users').doc(user.uid).get();

        if (userDoc.exists) {
            const userData = userDoc.data();
            const role = userData.role;
            
            // Role-Based Routing
            if (role === 'master_admin') {
                window.location.href = 'master_admin.html';
            } else if (role === 'owner') {
                // Subscription check is now fully implemented in saloon_admin.js
                window.location.href = 'saloon_admin.html';
            } else {
                errorMessage.textContent = 'Invalid user role.';
                auth.signOut();
            }
        } else {
            errorMessage.textContent = 'User profile not found. Contact Master Admin.';
            auth.signOut();
        }

    } catch (error) {
        console.error("Login Error:", error);
        let message = 'Login failed. Please check your credentials.';
        if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
             message = 'Invalid email or password.';
        }
        errorMessage.textContent = message;
    } finally {
         e.target.querySelector('button').textContent = 'Login';
    }
});

/**
 * Checks authentication status and redirects based on the required role.
 */
const checkAuthAndRedirect = (requiredRole) => {
    auth.onAuthStateChanged(async (user) => {
        if (!user) {
            window.location.href = 'login.html';
            return;
        }

        const userDoc = await db.collection('users').doc(user.uid).get();
        if (!userDoc.exists || userDoc.data().role !== requiredRole) {
            console.error('Access Denied: Role mismatch or missing user data.');
            auth.signOut();
            window.location.href = 'login.html';
        }
    });
};

const logout = () => {
    auth.signOut().then(() => {
        window.location.href = 'login.html';
    }).catch((error) => {
        console.error("Logout Error:", error);
    });
};
