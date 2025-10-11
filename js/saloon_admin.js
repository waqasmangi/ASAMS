// js/saloon_admin.js

let OWNER_SALOON_ID = null; // Global variable to store the authorized saloon ID

/**
 * Custom authentication check for the Owner role.
 * Includes a mandatory subscription expiry check.
 */
const checkOwnerAuth = () => {
    auth.onAuthStateChanged(async (user) => {
        if (!user) {
            // Not logged in: redirect to login
            window.location.href = 'login.html';
            return;
        }

        try {
            // 1. Get User Profile (to find their role and saloon ID)
            const userDoc = await db.collection('users').doc(user.uid).get();

            if (!userDoc.exists || userDoc.data().role !== 'owner') {
                // Logged in but not an owner: access denied
                alert('Access Denied. Insufficient permissions.');
                logout();
                return;
            }

            const userData = userDoc.data();
            OWNER_SALOON_ID = userData.saloon_id;

            // 2. Get Saloon Data (for subscription check)
            const saloonDoc = await db.collection('saloons').doc(OWNER_SALOON_ID).get();
            if (!saloonDoc.exists) {
                alert('Saloon data not found. Contact support.');
                logout();
                return;
            }

            const saloonData = saloonDoc.data();
            const expiryDate = saloonData.subscription_expiry_date.toDate();
            const now = new Date();
            
            // 3. Subscription Check
            const statusElement = document.getElementById('subscription-status');
            statusElement.textContent = `Subscription Expires: ${expiryDate.toLocaleDateString()}`;

            if (expiryDate < now) {
                // Subscription Expired: Lock out the owner
                document.body.innerHTML = `
                    <div class="expired-lockout">
                        <h1>Subscription Expired! 🚫</h1>
                        <p>Your access to the dashboard ended on: ${expiryDate.toLocaleDateString()}</p>
                        <p>Please contact the Master Admin to renew your service.</p>
                        <button onclick="logout()">Logout</button>
                    </div>
                `;
                return;
            }
            
            // 4. Access Granted: Load Dashboard Content
            document.getElementById('saloon-welcome').textContent = `${saloonData.saloon_name} Dashboard`;
            statusElement.style.color = 'green';
            
            // Initialize the management features
            loadOwnerServices();
            loadOwnerBarbers();
            loadSaloonConfig(saloonData);

        } catch (error) {
            console.error("Owner Auth Error:", error);
            alert('An error occurred during verification.');
            logout();
        }
    });
};


// --- UI/Helper Functions ---

const showSection = (sectionId) => {
    document.querySelectorAll('.content-section').forEach(section => {
        section.classList.add('hidden');
    });
    document.getElementById(`${sectionId}-section`).classList.remove('hidden');
};


// --- Data Management (Filtered by OWNER_SALOON_ID) ---

// 1. Service Management
const loadOwnerServices = async () => {
    const servicesRef = db.collection('saloons').doc(OWNER_SALOON_ID).collection('services');
    const servicesSection = document.getElementById('services-section');
    servicesSection.innerHTML = '<h2>Manage Services & Pricing</h2><ul id="service-list"></ul>';
    
    try {
        const snapshot = await servicesRef.get();
        const serviceList = document.getElementById('service-list');
        
        if (snapshot.empty) {
            serviceList.innerHTML = '<li>No services found. Add one below.</li>';
        }
        
        snapshot.forEach(doc => {
            const service = doc.data();
            const listItem = document.createElement('li');
            listItem.textContent = `${service.name} - ${service.duration} mins - PKR ${service.price}`;
            serviceList.appendChild(listItem);
        });
        
        // Add a form to create new service (not fully implemented here for brevity)
        servicesSection.innerHTML += `
            <form onsubmit="addService(event)">
                <input type="text" id="new-service-name" placeholder="Name" required>
                <input type="number" id="new-service-duration" placeholder="Duration (mins)" required>
                <input type="number" id="new-service-price" placeholder="Price (PKR)" required>
                <button type="submit">Add Service</button>
            </form>
        `;

    } catch (error) {
        console.error("Error loading services:", error);
    }
};

const addService = async (e) => {
    e.preventDefault();
    if (!OWNER_SALOON_ID) return;
    
    const serviceName = document.getElementById('new-service-name').value;
    const duration = parseInt(document.getElementById('new-service-duration').value);
    const price = parseInt(document.getElementById('new-service-price').value);

    try {
        await db.collection('saloons').doc(OWNER_SALOON_ID).collection('services').add({
            name: serviceName,
            duration: duration, // e.g., 30, 45, 60
            price: price
        });
        alert('Service added successfully!');
        e.target.reset();
        loadOwnerServices(); // Refresh the list
    } catch (error) {
        console.error("Error adding service:", error);
        alert('Failed to add service.');
    }
};

// 2. Barber Management (Placeholder)
const loadOwnerBarbers = () => {
    const barbersSection = document.getElementById('barbers-section');
    barbersSection.innerHTML = `
        <h2>Manage Barbers & Availability</h2>
        <p>Barber management logic (adding/removing staff and setting their working hours) will be implemented here, querying the <code>/saloons/${OWNER_SALOON_ID}/barbers</code> collection.</p>
    `;
};

// 3. Saloon Configuration (Placeholder)
const loadSaloonConfig = (saloonData) => {
    const configSection = document.getElementById('config-section');
    configSection.innerHTML = `
        <h2>Saloon Configuration</h2>
        <p>Update your saloon's public details, working hours, and upload your logo here.</p>
        <form>
            <label>Saloon Name:</label>
            <input type="text" value="${saloonData.saloon_name}" disabled><br>
            <label>Working Hours (e.g., 09:00-18:00):</label>
            <input type="text" id="working-hours" placeholder="e.g., 09:00-18:00">
            <button type="button" onclick="saveConfig()">Save Changes</button>
        </form>
    `;
};
