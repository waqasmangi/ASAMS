// js/saloon_admin.js

let OWNER_SALOON_ID = null; // Global variable to store the authorized saloon ID

/**
 * Custom authentication check for the Owner role.
 * Includes a mandatory subscription expiry check using Firestore.
 */
const checkOwnerAuth = () => {
    auth.onAuthStateChanged(async (user) => {
        if (!user) {
            window.location.href = 'login.html';
            return;
        }

        try {
            const userDoc = await db.collection('users').doc(user.uid).get();
            if (!userDoc.exists || userDoc.data().role !== 'owner') {
                alert('Access Denied. Insufficient permissions.');
                logout();
                return;
            }

            const userData = userDoc.data();
            OWNER_SALOON_ID = userData.saloon_id;

            const saloonDoc = await db.collection('saloons').doc(OWNER_SALOON_ID).get();
            if (!saloonDoc.exists) {
                document.body.innerHTML = '<h1>Saloon data not found. Contact support.</h1>';
                return;
            }

            const saloonData = saloonDoc.data();
            const expiryDate = saloonData.subscription_expiry_date.toDate();
            const now = new Date();
            
            // 3. Subscription Check
            const statusElement = document.getElementById('subscription-status');
            statusElement.textContent = `Subscription Expires: ${expiryDate.toLocaleDateString('en-PK')}`;

            if (expiryDate < now) {
                // Subscription Expired: Lock out the owner
                document.body.innerHTML = `
                    <div class="expired-lockout dashboard-container">
                        <h1>Subscription Expired! 🚫</h1>
                        <p>Your access to the dashboard ended on: ${expiryDate.toLocaleDateString('en-PK')}</p>
                        <p>Please contact the Master Admin to renew your service.</p>
                        <button onclick="logout()">Logout</button>
                    </div>
                `;
                return;
            }
            
            // 4. Access Granted: Load Dashboard Content
            document.getElementById('saloon-welcome').textContent = `${saloonData.saloon_name} Dashboard`;
            statusElement.style.color = 'green';
            
            // Initialize all data management sections
            loadSaloonConfig(saloonData);
            loadOwnerServices();
            loadOwnerBarbers(); // Load barbers list

        } catch (error) {
            console.error("Owner Auth Error:", error);
            document.body.innerHTML = '<h1>An error occurred during authentication.</h1>';
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


// --- Service Management CRUD ---

const loadOwnerServices = () => {
    const servicesRef = db.collection('saloons').doc(OWNER_SALOON_ID).collection('services');
    const container = document.getElementById('service-list-container');
    container.innerHTML = `
        <h3>Add New Service</h3>
        <form id="add-service-form" onsubmit="handleServiceSubmit(event)">
            <input type="hidden" id="service-doc-id" value="">
            <input type="text" id="service-name" placeholder="Service Name (e.g., Hair Cut)" required>
            <input type="number" id="service-duration" placeholder="Duration (mins)" required>
            <input type="number" id="service-price" placeholder="Base Price (PKR)" required>
            <input type="number" id="service-discount" placeholder="Discount (%) (Optional)" value="0">
            <button type="submit" id="service-submit-btn">Add Service</button>
        </form>
        <h3>Current Services</h3>
        <div id="service-list-table">Loading services...</div>
    `;

    servicesRef.onSnapshot(snapshot => {
        let tableHTML = `<table class="service-table">
                            <thead><tr><th>Name</th><th>Duration</th><th>Price</th><th>Discount</th><th>Actions</th></tr></thead>
                            <tbody>`;
        if (snapshot.empty) {
            tableHTML += '<tr><td colspan="5">No services available.</td></tr>';
        } else {
            snapshot.forEach(doc => {
                const s = doc.data();
                tableHTML += `<tr>
                                <td>${s.name}</td>
                                <td>${s.duration} mins</td>
                                <td>PKR ${s.price}</td>
                                <td>${s.discount || 0}%</td>
                                <td>
                                    <button class="action-btn" onclick="editService('${doc.id}', '${s.name}', ${s.duration}, ${s.price}, ${s.discount || 0})">Edit</button>
                                    <button class="action-btn" style="background-color: #dc3545;" onclick="deleteService('${doc.id}')">Delete</button>
                                </td>
                            </tr>`;
            });
        }
        tableHTML += '</tbody></table>';
        document.getElementById('service-list-table').innerHTML = tableHTML;
    });
};

const handleServiceSubmit = async (e) => {
    e.preventDefault();
    if (!OWNER_SALOON_ID) return;

    const docId = document.getElementById('service-doc-id').value;
    const name = document.getElementById('service-name').value;
    const duration = parseInt(document.getElementById('service-duration').value);
    const price = parseInt(document.getElementById('service-price').value);
    const discount = parseInt(document.getElementById('service-discount').value) || 0;

    const serviceData = { name, duration, price, discount };

    try {
        const servicesRef = db.collection('saloons').doc(OWNER_SALOON_ID).collection('services');
        if (docId) {
            // Edit/Update
            await servicesRef.doc(docId).update(serviceData);
            alert('Service updated successfully!');
        } else {
            // Add/Create
            await servicesRef.add(serviceData);
            alert('Service added successfully!');
        }
        // Reset form after submit
        document.getElementById('add-service-form').reset();
        document.getElementById('service-doc-id').value = '';
        document.getElementById('service-submit-btn').textContent = 'Add Service';

    } catch (error) {
        console.error("Error submitting service:", error);
        alert(`Failed to save service: ${error.message}`);
    }
};

const editService = (docId, name, duration, price, discount) => {
    document.getElementById('service-doc-id').value = docId;
    document.getElementById('service-name').value = name;
    document.getElementById('service-duration').value = duration;
    document.getElementById('service-price').value = price;
    document.getElementById('service-discount').value = discount;
    document.getElementById('service-submit-btn').textContent = 'Update Service';
    showSection('services'); // Ensure the section is visible
};

const deleteService = async (docId) => {
    if (!confirm('Are you sure you want to delete this service?')) return;
    try {
        await db.collection('saloons').doc(OWNER_SALOON_ID).collection('services').doc(docId).delete();
        alert('Service deleted successfully!');
    } catch (error) {
        console.error("Error deleting service:", error);
        alert('Failed to delete service.');
    }
};


// --- Barber Management (Placeholder CRUD) ---
const loadOwnerBarbers = () => {
    const container = document.getElementById('barber-list-container');
    container.innerHTML = `
        <h3>Manage Staff/Barbers</h3>
        <form id="add-barber-form" onsubmit="handleAddBarber(event)">
            <input type="text" id="barber-name" placeholder="Barber Name" required>
            <input type="text" id="barber-specialty" placeholder="Specialty (e.g., Hair/Shave)" required>
            <button type="submit">Add Barber</button>
        </form>
        <h3>Current Staff</h3>
        <ul id="barber-list">Loading staff list...</ul>
    `;
    
    // Load existing barbers
    db.collection('saloons').doc(OWNER_SALOON_ID).collection('barbers').onSnapshot(snapshot => {
        const list = document.getElementById('barber-list');
        list.innerHTML = '';
        if (snapshot.empty) {
            list.innerHTML = '<li>No barbers added yet.</li>';
            return;
        }
        snapshot.forEach(doc => {
            const b = doc.data();
            list.innerHTML += `<li>${b.name} (${b.specialty}) <button class="action-btn" style="background-color: #dc3545;" onclick="deleteBarber('${doc.id}')">Delete</button></li>`;
        });
    });
};

const handleAddBarber = async (e) => {
    e.preventDefault();
    if (!OWNER_SALOON_ID) return;
    const name = document.getElementById('barber-name').value;
    const specialty = document.getElementById('barber-specialty').value;

    try {
        await db.collection('saloons').doc(OWNER_SALOON_ID).collection('barbers').add({ name, specialty });
        alert('Barber added!');
        e.target.reset();
    } catch (error) {
        console.error("Error adding barber:", error);
    }
};

const deleteBarber = async (docId) => {
    if (!confirm('Are you sure you want to delete this barber?')) return;
    try {
        await db.collection('saloons').doc(OWNER_SALOON_ID).collection('barbers').doc(docId).delete();
        alert('Barber deleted!');
    } catch (error) {
        console.error("Error deleting barber:", error);
    }
};


// --- Saloon Configuration Management (Hours, Chairs, Contact) ---
const loadSaloonConfig = (saloonData) => {
    const form = document.getElementById('saloon-config-form');
    // Use the existing config document reference for updates
    const configRef = db.collection('saloons').doc(OWNER_SALOON_ID);

    form.innerHTML = `
        <h3>General Details</h3>
        <label for="saloon-name-input">Saloon Name (Set by Admin):</label>
        <input type="text" id="saloon-name-input" value="${saloonData.saloon_name}" disabled>

        <label for="owner-name-input">Owner Name:</label>
        <input type="text" id="owner-name-input" value="${saloonData.owner_name || ''}">

        <label for="address-input">Address:</label>
        <input type="text" id="address-input" value="${saloonData.address || ''}">
        
        <label for="contact-cancel-input">Cancellation Contact Number:</label>
        <input type="text" id="contact-cancel-input" value="${saloonData.contact_number || ''}" placeholder="Number for customers to call (30 min cancellation)">

        <label for="total-chairs-input">Total Chairs/Stations:</label>
        <input type="number" id="total-chairs-input" value="${saloonData.total_chairs || 1}" min="1">

        <label for="facilities-desc-input">Facilities Description:</label>
        <textarea id="facilities-desc-input" rows="3" placeholder="Free Wi-Fi, Coffee, AC etc.">${saloonData.facilities_description || ''}</textarea>
        
        <h3>Booking & Payment Setup</h3>
        <label for="working-hours-input">Daily Working Hours (e.g., 09:00-18:00):</label>
        <input type="text" id="working-hours-input" value="${saloonData.working_hours || '09:00-18:00'}">

        <label>Accepted Payment Methods:</label>
        <div id="payment-options-container">
            </div>
        
        <button type="submit" style="background-color: #007bff; margin-top: 15px;">Save Configuration</button>
        <p id="config-message" class="message"></p>
    `;

    // Payment methods rendering
    const paymentOptions = ['Cash', 'EasyPaisa', 'JazzCash', 'Bank Transfer', 'Credit Card'];
    const selectedPayments = saloonData.payment_options || [];
    const container = document.getElementById('payment-options-container');
    container.innerHTML = paymentOptions.map(option => `
        <label style="display: block;">
            <input type="checkbox" name="payment-option" value="${option}" ${selectedPayments.includes(option) ? 'checked' : ''}>
            ${option}
        </label>
    `).join('');

    // Handle form submission
    form.onsubmit = async (e) => {
        e.preventDefault();
        const checkedPayments = Array.from(container.querySelectorAll('input[name="payment-option"]:checked')).map(cb => cb.value);

        const newConfig = {
            owner_name: document.getElementById('owner-name-input').value,
            address: document.getElementById('address-input').value,
            contact_number: document.getElementById('contact-cancel-input').value,
            total_chairs: parseInt(document.getElementById('total-chairs-input').value),
            facilities_description: document.getElementById('facilities-desc-input').value,
            working_hours: document.getElementById('working-hours-input').value,
            payment_options: checkedPayments
        };

        const messageElement = document.getElementById('config-message');
        messageElement.textContent = 'Saving...';
        messageElement.style.color = 'orange';

        try {
            await configRef.update(newConfig);
            messageElement.textContent = 'Configuration saved successfully!';
            messageElement.style.color = 'green';
        } catch (error) {
            console.error("Error saving config:", error);
            messageElement.textContent = `Error saving configuration: ${error.message}`;
            messageElement.style.color = 'red';
        }
    };
};


// Start the check when the DOM content is loaded
document.addEventListener('DOMContentLoaded', checkOwnerAuth);
