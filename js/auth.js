// js/auth.js

document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const errorMessage = document.getElementById('error-message');
    errorMessage.textContent = '';

    try {
        // 1. Sign in the user with Firebase Authentication
        const userCredential = await auth.signInWithEmailAndPassword(email, password);
        const user = userCredential.user;

        // 2. Fetch the user's role and saloon_id from the /users collection in Firestore
        const userDoc = await db.collection('users').doc(user.uid).get();

        if (userDoc.exists) {
            const userData = userDoc.data();
            const role = userData.role;
            
            // 3. Role-Based Routing
            if (role === 'master_admin') {
                window.location.href = 'master_admin.html';
            } else if (role === 'owner') {
                // Check Subscription Status (Will be fully implemented in Phase 3)
                const saloonDoc = await db.collection('saloons').doc(userData.saloon_id).get();
                const expiryDate = saloonDoc.data().subscription_expiry_date.toDate();
                
                if (expiryDate > new Date()) {
                    window.location.href = 'saloon_admin.html';
                } else {
                    errorMessage.textContent = 'Subscription has expired. Please contact the Master Admin.';
                    auth.signOut(); // Log out the expired user
                }
            } else {
                errorMessage.textContent = 'User role is undefined or invalid.';
                auth.signOut();
            }
        } else {
            errorMessage.textContent = 'User profile not found. Contact support.';
            auth.signOut();
        }

    } catch (error) {
        console.error("Login Error:", error);
        // Display user-friendly error messages
        let message = 'Login failed. Please check your credentials.';
        if (error.code === 'auth/user-not-found') {
             message = 'This email is not registered.';
        } else if (error.code === 'auth/wrong-password') {
             message = 'Incorrect password.';
        }
        errorMessage.textContent = message;
    }
});

// Function to enforce protection on admin pages (called on master_admin.html and saloon_admin.html)
const checkAuthAndRedirect = (requiredRole) => {
    auth.onAuthStateChanged(async (user) => {
        if (!user) {
            // No user is logged in
            window.location.href = 'login.html';
            return;
        }

        // Fetch user data to determine role
        const userDoc = await db.collection('users').doc(user.uid).get();
        if (!userDoc.exists || userDoc.data().role !== requiredRole) {
            // User is logged in but has the wrong role or missing data
            alert('Access Denied. Incorrect permissions.');
            auth.signOut();
            window.location.href = 'login.html';
        } 
        
        // Additional Subscription check for 'owner' role is performed directly in saloon_admin.html
    });
};

// Logout handler (can be added to a button in the dashboards)
const logout = () => {
    auth.signOut().then(() => {
        window.location.href = 'login.html';
    }).catch((error) => {
        console.error("Logout Error:", error);
    });
};
