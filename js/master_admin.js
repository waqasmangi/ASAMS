// ASAMS Master Admin Logic
import { db, auth, handleLogout, displayMessage } from './auth.js';
import { httpsCallable } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-functions.js';
import { 
    collection, 
    onSnapshot, 
    updateDoc, 
    doc 
} from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js';

const saloonsCollectionRef = collection(db, 'saloons');
const masterAdminFunctions = {
    createSaloonAndOwner: httpsCallable(auth, 'createSaloonAndOwner')
};

let currentUserId = null;

// Ensure auth is ready and user is master_admin before proceeding
auth.onAuthStateChanged(user => {
    if (user) {
        user.getIdTokenResult().then(idTokenResult => {
            if (idTokenResult.claims.role === 'master_admin') {
                currentUserId = user.uid;
                initMasterAdmin();
            } else {
                console.error('Unauthorized access. Redirecting...');
                window.location.href = 'login.html';
            }
        });
    }
});

function initMasterAdmin() {
    setupUIListeners();
    // Start listening for real-time saloon data
    listenToSaloons();
}

function setupUIListeners() {
    document.getElementById('logout-btn').addEventListener('click', handleLogout);
    document.getElementById('onboard-form').addEventListener('submit', handleOnboardSubmit);
}

/**
 * Handles the submission of the new saloon owner onboarding form.
 */
async function handleOnboardSubmit(e) {
    e.preventDefault();
    
    const form = e.target;
    const email = form.email.value;
    const password = form.password.value;
    const saloonName = form.saloonName.value;
    const ownerName = form.ownerName.value;
    const ownerPhone = form.ownerPhone.value; // Important for Twilio notification

    const submitBtn = form.querySelector('button[type="submit"]');
    const originalText = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<div class="loading-spinner" style="width: 20px; height: 20px; margin: 0 auto;"></div>';

    try {
        const result = await masterAdminFunctions.createSaloonAndOwner({
            email, password, saloonName, ownerName, ownerPhone
        });

        displayMessage('onboard-message', result.data.message, false);
        form.reset();

    } catch (error) {
        console.error("Onboarding failed:", error);
        displayMessage('onboard-message', error.message || "Failed to create saloon. Check console for details.", true);
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
    }
}

/**
 * Listens to the 'saloons' collection and updates the UI in real-time.
 */
function listenToSaloons() {
    const saloonsListEl = document.getElementById('saloons-list');

    onSnapshot(saloonsCollectionRef, (snapshot) => {
        let saloonsHtml = '';
        if (snapshot.empty) {
            saloonsListEl.innerHTML = '<p class="text-gray-500">No saloons currently registered.</p>';
            return;
        }

        snapshot.forEach(doc => {
            const saloon = doc.data();
            const id = doc.id;
            const expiryDate = saloon.trialExpiry ? new Date(saloon.trialExpiry.toDate()).toLocaleDateString() : 'N/A';
            const statusColor = saloon.status === 'active' ? 'text-green-600' : 
                                saloon.status === 'trial' ? 'text-yellow-600' : 'text-red-600';
            
            saloonsHtml += `
                <div class="list-item">
                    <div>
                        <h3 class="mb-1">${saloon.saloonName}</h3>
                        <p class="text-sm text-gray-500">Owner: ${saloon.ownerName || 'N/A'} (${saloon.ownerEmail})</p>
                        <p class="text-sm text-gray-500">Phone: ${saloon.ownerPhone || 'N/A'}</p>
                        <p class="text-sm">Trial Expiry: ${expiryDate}</p>
                        <p class="text-sm font-semibold ${statusColor}">Status: ${saloon.status.toUpperCase()}</p>
                        <p class="text-xs text-gray-400 mt-1">ID: ${id}</p>
                    </div>
                    <div class="mt-4 flex gap-2">
                        <button class="btn btn-secondary btn-sm" onclick="window.renewSaloon('${id}')" ${saloon.status === 'active' ? 'disabled' : ''}>Renew/Activate</button>
                        <button class="btn btn-outline btn-sm" onclick="window.deactivateSaloon('${id}')" ${saloon.status === 'deactivated' ? 'disabled' : ''}>Deactivate</button>
                    </div>
                </div>
            `;
        });

        saloonsListEl.innerHTML = `<div class="list-grid">${saloonsHtml}</div>`;
    }, (error) => {
        console.error("Error listening to saloons:", error);
        saloonsListEl.innerHTML = '<p class="error-message">Failed to load saloon data.</p>';
    });
}

/**
 * Renews a saloon's subscription status.
 */
window.renewSaloon = async (saloonId) => {
    try {
        const saloonRef = doc(db, 'saloons', saloonId);
        // Set expiry far in the future (e.g., 1 year) and set status to active
        const oneYearFromNow = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000); 

        await updateDoc(saloonRef, {
            status: 'active',
            trialExpiry: oneYearFromNow
        });
        displayMessage('dashboard-message', `Saloon ID: ${saloonId} is now Active!`, false);

    } catch (error) {
        console.error("Renewal failed:", error);
        displayMessage('dashboard-message', "Failed to renew saloon subscription.", true);
    }
}

/**
 * Deactivates a saloon's subscription status.
 */
window.deactivateSaloon = async (saloonId) => {
    try {
        const saloonRef = doc(db, 'saloons', saloonId);
        await updateDoc(saloonRef, {
            status: 'deactivated',
            trialExpiry: new Date() // Set expiry to now for clarity
        });
        displayMessage('dashboard-message', `Saloon ID: ${saloonId} has been Deactivated.`, false);
    } catch (error) {
        console.error("Deactivation failed:", error);
        displayMessage('dashboard-message', "Failed to deactivate saloon.", true);
    }
}
