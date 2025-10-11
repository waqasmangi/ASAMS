// js/master_admin.js

// This file relies on global 'auth', 'db', and 'functions' from firebase_config.js

// Reference the deployed Cloud Function
const createSaloonAndOwner = functions.httpsCallable('createSaloonAndOwner');

// === RUN AUTH CHECK AND INITIAL LOAD WHEN DOM IS READY ===
document.addEventListener('DOMContentLoaded', () => {
    // 1. Run the core authentication check defined in auth.js
    checkAuthAndRedirect('master_admin'); 

    // 2. Setup the event listener for the form
    document.getElementById('create-saloon-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const saloonName = document.getElementById('saloon-name').value;
        const ownerEmail = document.getElementById('owner-email').value;
        const ownerPhone = document.getElementById('owner-phone').value;
        const initialPassword = document.getElementById('initial-password').value;
        const messageElement = document.getElementById('onboarding-message');
        
        messageElement.textContent = 'Processing...';
        messageElement.style.color = 'orange';

        try {
            // Call the secure Cloud Function
            const result = await createSaloonAndOwner({
                saloonName: saloonName,
                email: ownerEmail,
                password: initialPassword,
                ownerPhone: ownerPhone
            });

            messageElement.textContent = result.data.message;
            messageElement.style.color = 'green';
            e.target.reset(); 
            // loadSaloonList will refresh automatically due to onSnapshot

        } catch (error) {
            console.error("Master Admin Call Error:", error);
            // Display error message from the function
            messageElement.textContent = `Error: ${error.message}`;
            messageElement.style.color = 'red';
        }
    });

    // 3. Setup the real-time list loading after the user is confirmed logged in
    auth.onAuthStateChanged(user => {
        // Only load data if the user is authenticated (checkAuthAndRedirect ensures correct role)
        if (user) {
            loadSaloonList();
        }
    });
});


// Logic to load and display the list of saloons for management
const loadSaloonList = () => {
    const saloonListElement = document.getElementById('saloon-list');
    
    // Firestore: Use onSnapshot for real-time updates!
    db.collection('saloons').onSnapshot(snapshot => {
        saloonListElement.innerHTML = '';
        
        if (snapshot.empty) {
            saloonListElement.innerHTML = '<li>No saloons currently onboarded.</li>';
            return;
        }

        snapshot.forEach(doc => {
            const saloon = doc.data();
            // Firestore timestamp to JavaScript Date object
            const expiry = saloon.subscription_expiry_date.toDate().toLocaleDateString('en-PK');
            
            const now = new Date();
            const isExpired = saloon.subscription_expiry_date.toDate() < now;
            const statusColor = isExpired ? 'red' : 'green';
            const statusText = isExpired ? 'EXPIRED 🚫' : (saloon.trial_mode ? 'TRIAL ACTIVE (15 Days) ⏳' : 'Active ✅');

            const listItem = document.createElement('li');
            listItem.style.marginBottom = '20px';
            listItem.style.padding = '10px';
            listItem.style.border = `1px solid ${isExpired ? '#f00' : '#0f0'}`;
            listItem.style.borderRadius = '8px';
            
            listItem.innerHTML = `
                <strong>${saloon.saloon_name}</strong> (ID: ${saloon.saloon_id})<br>
                Owner UID: ${saloon.owner_uid}<br>
                Status: <span style="color: ${statusColor}; font-weight: bold;">${statusText}</span><br>
                Expires: ${expiry}
                <button 
                    onclick="renewSubscription('${saloon.saloon_id}', 30)"
                    style="background-color: #007bff; margin-top: 10px; width: 250px;"
                >
                    Renew for 30 Days (Rs. 499/-)
                </button>
            `;
            saloonListElement.appendChild(listItem);
        });
    }, error => {
        console.error("Error loading saloon list:", error);
        saloonListElement.innerHTML = '<li>Error loading saloon list.</li>';
    });
};

// Logic for subscription renewal (Extends expiry by 30 days)
const renewSubscription = async (saloonId, days) => {
    if (!confirm(`Confirm: Renewal for Saloon ID ${saloonId} for ${days} days (Rs. 499/-)?`)) {
        return;
    }

    try {
        const saloonRef = db.collection('saloons').doc(saloonId);
        const saloonDoc = await saloonRef.get();
        
        let currentExpiry = saloonDoc.data().subscription_expiry_date.toDate();
        
        // Start renewal from the current expiry date if it's in the future, otherwise start from today
        let newExpiry = currentExpiry > new Date() ? currentExpiry : new Date();
        newExpiry.setDate(newExpiry.getDate() + days); // Add 30 days

        await saloonRef.update({
            subscription_expiry_date: newExpiry,
            is_active: true, // Ensure active status
            trial_mode: false // End trial mode upon paid renewal
        });
        
        alert(`Subscription renewed! New expiry: ${newExpiry.toLocaleDateString('en-PK')}`);

    } catch (error) {
        console.error("Renewal Error:", error);
        alert('Failed to renew subscription.');
    }
};
