// js/master_admin.js

// Reference the deployed Cloud Function
const functions = firebase.functions(); 
// NOTE: If using an older Firebase SDK, you might need to call: firebase.functions().useEmulator('localhost', 5001); for local testing.
const createSaloonAndOwner = functions.httpsCallable('createSaloonAndOwner');

document.getElementById('create-saloon-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const saloonName = document.getElementById('saloon-name').value;
    const ownerEmail = document.getElementById('owner-email').value;
    const ownerPhone = document.getElementById('owner-phone').value;
    const initialPassword = document.getElementById('initial-password').value;
    const messageElement = document.getElementById('onboarding-message');
    
    messageElement.textContent = 'Processing...';
    messageElement.style.color = 'orange';

    // 1. Collect data and send it to the Cloud Function
    try {
        const result = await createSaloonAndOwner({
            saloonName: saloonName,
            email: ownerEmail,
            password: initialPassword,
            ownerPhone: ownerPhone
        });

        // 2. Display success message
        messageElement.textContent = result.data.message;
        messageElement.style.color = 'green';
        e.target.reset(); // Clear form on success
        loadSaloonList(); // Refresh the list of saloons

    } catch (error) {
        console.error("Frontend Function Call Error:", error);
        // Display error message from the function
        messageElement.textContent = `Error: ${error.message}`;
        messageElement.style.color = 'red';
    }
});

// Logic to load and display the list of saloons for management
const loadSaloonList = async () => {
    const saloonListElement = document.getElementById('saloon-list');
    saloonListElement.innerHTML = '<li>Loading saloons...</li>';
    
    try {
        const snapshot = await db.collection('saloons').get();
        saloonListElement.innerHTML = ''; // Clear loading message

        snapshot.forEach(doc => {
            const saloon = doc.data();
            const expiry = saloon.subscription_expiry_date.toDate().toLocaleDateString();
            const status = saloon.is_active && saloon.subscription_expiry_date.toDate() > new Date() ? 'Active ✅' : 'Expired ❌';
            
            const listItem = document.createElement('li');
            listItem.innerHTML = `
                <strong>${saloon.saloon_name}</strong> (ID: ${saloon.saloon_id})<br>
                Owner UID: ${saloon.owner_uid}<br>
                Status: ${status}<br>
                Expires: ${expiry}
                <button onclick="renewSubscription('${saloon.saloon_id}', 30)">Renew for 1 Month (499/-)</button>
                `;
            saloonListElement.appendChild(listItem);
        });
    } catch (error) {
        console.error("Error loading saloon list:", error);
        saloonListElement.innerHTML = '<li>Error loading saloon list.</li>';
    }
};

// Logic for subscription renewal
const renewSubscription = async (saloonId, days) => {
    // In a real system, payment integration would happen here.
    // For now, we simulate renewal by extending the date.
    if (!confirm(`Are you sure you want to renew subscription for saloon ${saloonId} by ${days} days?`)) {
        return;
    }

    try {
        const saloonRef = db.collection('saloons').doc(saloonId);
        const saloonDoc = await saloonRef.get();
        const currentExpiry = saloonDoc.data().subscription_expiry_date.toDate();
        
        // Calculate new expiry date based on the current expiry, or today if already expired
        let newExpiry = currentExpiry > new Date() ? currentExpiry : new Date();
        newExpiry.setDate(newExpiry.getDate() + days);

        await saloonRef.update({
            subscription_expiry_date: newExpiry,
            is_active: true
        });
        
        alert(`Subscription renewed! New expiry: ${newExpiry.toLocaleDateString()}`);
        loadSaloonList(); // Refresh the list
        
        // NOTE: We would also trigger a renewal confirmation SMS here via another Cloud Function.

    } catch (error) {
        console.error("Renewal Error:", error);
        alert('Failed to renew subscription.');
    }
};

// Initial load call
auth.onAuthStateChanged(user => {
    if (user) {
        loadSaloonList();
    }
});
