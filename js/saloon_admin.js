// ASAMS Saloon Owner Dashboard Logic
import { db, auth, handleLogout, displayMessage } from './auth.js';
import { 
    collection, 
    onSnapshot, 
    addDoc, 
    updateDoc, 
    deleteDoc, 
    doc, 
    getDoc,
    query,
    where
} from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js';

let saloonId = null;
let saloonData = {};
let selectedServiceId = null;

// --- Initialization and Auth Check ---
auth.onAuthStateChanged(user => {
    if (user) {
        user.getIdTokenResult().then(idTokenResult => {
            if (idTokenResult.claims.role === 'saloon_owner') {
                saloonId = idTokenResult.claims.saloonId;
                initSaloonAdmin();
            } else {
                console.error('Unauthorized access. Redirecting...');
                window.location.href = 'login.html';
            }
        });
    }
});

function initSaloonAdmin() {
    console.log('Saloon Admin initialized for ID:', saloonId);
    document.getElementById('logout-btn').addEventListener('click', handleLogout);
    
    // Setup tab navigation
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', (e) => switchTab(e.target.dataset.tab));
    });
    
    // Setup form listeners
    document.getElementById('service-form').addEventListener('submit', handleServiceSubmit);
    document.getElementById('config-form').addEventListener('submit', handleConfigSubmit);
    
    // Initial data load
    loadSaloonConfig();
    listenToServices();
    listenToAppointments();

    // Default tab
    switchTab('services');
}

function switchTab(tabName) {
    document.querySelectorAll('.tab-content').forEach(content => {
        content.style.display = 'none';
    });
    document.getElementById(`${tabName}-content`).style.display = 'block';

    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    document.querySelector(`.tab-btn[data-tab="${tabName}"]`).classList.add('active');
}

// --- Saloon Configuration (Availability) ---

const saloonRef = () => doc(db, 'saloons', saloonId);

async function loadSaloonConfig() {
    try {
        const docSnap = await getDoc(saloonRef());
        if (docSnap.exists()) {
            saloonData = docSnap.data();
            const config = saloonData.config || {};
            
            // Set UI details
            document.getElementById('saloon-name-display').textContent = saloonData.saloonName || 'Your Saloon';
            
            // Populate Config Form
            document.getElementById('start-time').value = config.startTime || '09:00';
            document.getElementById('end-time').value = config.endTime || '17:00';
            document.getElementById('lunch-start').value = config.lunchBreakStart || '12:00';
            document.getElementById('lunch-end').value = config.lunchBreakEnd || '13:00';
            document.getElementById('slot-duration').value = config.slotDurationMin || 30;
            
            // The status can also be displayed here
            const statusEl = document.getElementById('saloon-status');
            const expiryDate = saloonData.trialExpiry ? new Date(saloonData.trialExpiry.toDate()).toLocaleDateString() : 'N/A';
            statusEl.textContent = `Status: ${saloonData.status.toUpperCase()} | Expires: ${expiryDate}`;
            statusEl.className = `font-semibold text-sm ${saloonData.status === 'active' ? 'text-green-600' : 'text-red-600'}`;

        } else {
            displayMessage('dashboard-message', 'Saloon configuration not found. Please contact support.', true);
        }
    } catch (error) {
        console.error("Error loading config:", error);
        displayMessage('dashboard-message', 'Failed to load saloon configuration.', true);
    }
}

async function handleConfigSubmit(e) {
    e.preventDefault();
    const form = e.target;
    const config = {
        startTime: form.querySelector('#start-time').value,
        endTime: form.querySelector('#end-time').value,
        lunchBreakStart: form.querySelector('#lunch-start').value,
        lunchBreakEnd: form.querySelector('#lunch-end').value,
        slotDurationMin: parseInt(form.querySelector('#slot-duration').value, 10),
        workingDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'] // Hardcoded for simplicity, could be dynamic
    };

    try {
        await updateDoc(saloonRef(), { config: config });
        displayMessage('config-message', 'Availability configuration saved successfully!', false);
    } catch (error) {
        console.error("Error saving config:", error);
        displayMessage('config-message', 'Failed to save configuration.', true);
    }
}


// --- Services CRUD ---

const servicesCollectionRef = () => collection(db, 'saloons', saloonId, 'services');

function listenToServices() {
    const servicesListEl = document.getElementById('services-list');
    
    onSnapshot(servicesCollectionRef(), (snapshot) => {
        let servicesHtml = '';
        if (snapshot.empty) {
            servicesListEl.innerHTML = '<p class="text-gray-500">No services created yet.</p>';
            return;
        }

        snapshot.forEach(doc => {
            const service = doc.data();
            const id = doc.id;
            servicesHtml += `
                <div class="service-card">
                    <h3>${service.name}</h3>
                    <p class="text-gray-500">${service.description || 'No description provided.'}</p>
                    <div class="card-details">
                        <p class="font-bold text-lg text-primary">$${service.price.toFixed(2)} / ${service.durationMin} min</p>
                        <div class="flex gap-2">
                            <button class="btn btn-outline" onclick="window.editService('${id}', '${service.name}', ${service.durationMin}, ${service.price}, '${service.description}')">Edit</button>
                            <button class="btn btn-primary" onclick="window.deleteService('${id}')">Delete</button>
                        </div>
                    </div>
                </div>
            `;
        });
        servicesListEl.innerHTML = `<div class="list-grid">${servicesHtml}</div>`;
    }, (error) => {
        console.error("Error listening to services:", error);
        servicesListEl.innerHTML = '<p class="error-message">Failed to load services.</p>';
    });
}

function resetServiceForm() {
    document.getElementById('service-form').reset();
    document.getElementById('service-form-title').textContent = 'Add New Service';
    document.getElementById('service-form-btn').textContent = 'Add Service';
    selectedServiceId = null;
}

window.editService = (id, name, duration, price, description) => {
    selectedServiceId = id;
    document.getElementById('service-form-title').textContent = 'Edit Service';
    document.getElementById('service-form-btn').textContent = 'Save Changes';
    
    document.getElementById('service-name').value = name;
    document.getElementById('service-duration').value = duration;
    document.getElementById('service-price').value = price;
    document.getElementById('service-description').value = description;

    // Scroll to the form
    document.getElementById('service-form-card').scrollIntoView({ behavior: 'smooth' });
};

async function handleServiceSubmit(e) {
    e.preventDefault();
    const form = e.target;
    const serviceData = {
        name: form.querySelector('#service-name').value,
        durationMin: parseInt(form.querySelector('#service-duration').value, 10),
        price: parseFloat(form.querySelector('#service-price').value),
        description: form.querySelector('#service-description').value
    };

    if (isNaN(serviceData.durationMin) || serviceData.durationMin <= 0) {
        displayMessage('service-message', 'Duration must be a positive number.', true);
        return;
    }
    
    try {
        if (selectedServiceId) {
            // Update existing service
            await updateDoc(doc(servicesCollectionRef(), selectedServiceId), serviceData);
            displayMessage('service-message', 'Service updated successfully!', false);
        } else {
            // Add new service
            await addDoc(servicesCollectionRef(), serviceData);
            displayMessage('service-message', 'Service added successfully!', false);
        }
        resetServiceForm();
    } catch (error) {
        console.error("Error submitting service:", error);
        displayMessage('service-message', `Failed to submit service: ${error.message}`, true);
    }
}

window.deleteService = async (serviceId) => {
    // NOTE: In a real app, use a styled modal for confirmation instead of a browser alert/confirm.
    if (!confirm("Are you sure you want to delete this service?")) return;

    try {
        await deleteDoc(doc(servicesCollectionRef(), serviceId));
        displayMessage('service-message', 'Service deleted successfully.', false);
    } catch (error) {
        console.error("Error deleting service:", error);
        displayMessage('service-message', 'Failed to delete service.', true);
    }
}


// --- Appointments Viewer ---

const appointmentsCollectionRef = () => collection(db, 'saloons', saloonId, 'appointments');

function listenToAppointments() {
    const appointmentsListEl = document.getElementById('appointments-list');
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Start of today for filtering

    // Query appointments for today and future
    const appointmentsQuery = query(
        appointmentsCollectionRef(),
        where('startTime', '>=', today)
        // No orderBy to avoid needing indexes. Will sort in JS.
    );

    onSnapshot(appointmentsQuery, (snapshot) => {
        let appointments = [];
        snapshot.forEach(doc => {
            const appt = doc.data();
            appt.id = doc.id;
            appointments.push(appt);
        });

        // Sort by start time (in-memory sorting)
        appointments.sort((a, b) => a.startTime.seconds - b.startTime.seconds);

        let appointmentsHtml = '';
        if (appointments.length === 0) {
            appointmentsListEl.innerHTML = '<p class="text-gray-500">No upcoming appointments found.</p>';
            return;
        }

        appointments.forEach(appt => {
            const startTime = appt.startTime.toDate().toLocaleString('en-US', {
                month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
            });
            const statusColor = appt.status === 'confirmed' ? 'text-green-600' : 'text-gray-500';

            appointmentsHtml += `
                <div class="appointment-card list-item">
                    <h3 class="text-xl">${appt.serviceName}</h3>
                    <p class="font-semibold text-primary">${startTime}</p>
                    <p class="text-sm mt-2">Customer: ${appt.customerName}</p>
                    <p class="text-sm">Phone: ${appt.customerPhone}</p>
                    <p class="text-sm">Email: ${appt.customerEmail}</p>
                    <p class="text-xs mt-2 ${statusColor}">Status: ${appt.status.toUpperCase()}</p>
                </div>
            `;
        });
        appointmentsListEl.innerHTML = `<div class="list-grid">${appointmentsHtml}</div>`;
    }, (error) => {
        console.error("Error listening to appointments:", error);
        appointmentsListEl.innerHTML = '<p class="error-message">Failed to load appointments.</p>';
    });
}
