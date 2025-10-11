// js/index.js

// NOTE: This script relies on global 'db' and 'functions' from firebase_config.js

let selectedSaloonId = null;
let selectedService = null;
let selectedTime = null;
let saloonConfig = {};

const bookAppointmentAndNotify = functions.httpsCallable('bookAppointmentAndNotify');

// === 1. INITIAL SETUP: Load Saloons ===
document.addEventListener('DOMContentLoaded', () => {
    loadSaloonDropdown();
    document.getElementById('booking-details-form').addEventListener('submit', handleFinalBooking);
    
    // Set min date for date picker to today
    const dateInput = document.getElementById('appointment-date');
    dateInput.min = new Date().toISOString().split('T')[0];
});

const loadSaloonDropdown = async () => {
    const dropdown = document.getElementById('saloon-dropdown');
    try {
        // Fetch all active saloons for the customer to choose from
        const snapshot = await db.collection('saloons').where('is_active', '==', true).get();
        if (snapshot.empty) {
            dropdown.innerHTML = '<option value="">-- No Active Saloons Available --</option>';
            return;
        }
        
        snapshot.forEach(doc => {
            const data = doc.data();
            // Basic check to ensure subscription is active (extra safety)
            if (data.subscription_expiry_date.toDate() > new Date()) {
                dropdown.innerHTML += `<option value="${data.saloon_id}">${data.saloon_name}</option>`;
            }
        });
    } catch (error) {
        console.error("Error loading saloons:", error);
    }
};

const loadSaloonData = async () => {
    selectedSaloonId = document.getElementById('saloon-dropdown').value;
    
    // Reset state
    document.getElementById('service-selection').style.display = 'none';
    document.getElementById('slot-selection').style.display = 'none';
    document.getElementById('booking-details').style.display = 'none';
    document.getElementById('saloon-info').innerHTML = '';
    
    if (!selectedSaloonId) return;

    try {
        // Fetch Saloon Config (used for working hours, chairs, payment)
        const saloonDoc = await db.collection('saloons').doc(selectedSaloonId).get();
        saloonConfig = saloonDoc.data();
        
        document.getElementById('saloon-info').innerHTML = `
            <strong>Address:</strong> ${saloonConfig.address || 'N/A'}<br>
            <strong>Working Hours:</strong> ${saloonConfig.working_hours || 'N/A'}<br>
            <strong>Facilities:</strong> ${saloonConfig.facilities_description || 'N/A'}
        `;
        
        // Load services and proceed to step 2
        await loadServices();
        document.getElementById('service-selection').style.display = 'block';

    } catch (error) {
        console.error("Error loading saloon config:", error);
        document.getElementById('saloon-info').innerHTML = '<span class="error">Error loading saloon details.</span>';
    }
};


// === 2. SERVICE SELECTION ===
const loadServices = async () => {
    const serviceListContainer = document.getElementById('service-list');
    serviceListContainer.innerHTML = 'Loading services...';

    try {
        const snapshot = await db.collection('saloons').doc(selectedSaloonId).collection('services').get();
        
        if (snapshot.empty) {
            serviceListContainer.innerHTML = '<p class="error">No services are configured for this saloon.</p>';
            return;
        }

        serviceListContainer.innerHTML = '';
        snapshot.forEach(doc => {
            const s = doc.data();
            const finalPrice = s.price * (1 - (s.discount || 0) / 100);
            const card = document.createElement('div');
            card.className = 'service-card';
            card.innerHTML = `
                <strong>${s.name}</strong> - ${s.duration} mins<br>
                Price: PKR ${finalPrice.toFixed(0)} 
                ${s.discount > 0 ? `<span style="text-decoration: line-through; color: #aaa;">PKR ${s.price}</span> (${s.discount}% off)` : ''}
            `;
            card.onclick = () => selectService(doc.id, s.name, s.duration, finalPrice.toFixed(0));
            serviceListContainer.appendChild(card);
        });

    } catch (error) {
        console.error("Error loading services:", error);
        serviceListContainer.innerHTML = '<p class="error">Error fetching services.</p>';
    }
};

const selectService = (docId, name, duration, price) => {
    // Visually select the card
    document.querySelectorAll('.service-card').forEach(card => card.classList.remove('selected'));
    document.querySelector(`.service-card[onclick*="${docId}"]`).classList.add('selected');
    
    selectedService = { docId, name, duration, price };
    selectedTime = null; // Reset time if service changes
    document.getElementById('slot-selection').style.display = 'none';

    // Proceed to calculate slots if a date is already selected
    if (document.getElementById('appointment-date').value) {
        calculateAvailableSlots();
    }
    document.getElementById('slot-selection').style.display = 'block';
};


// === 3. SLOT CALCULATION ===
const calculateAvailableSlots = async () => {
    if (!selectedService || !selectedSaloonId) return;

    const date = document.getElementById('appointment-date').value;
    const slotsContainer = document.getElementById('time-slots');
    const message = document.getElementById('time-slot-message');
    slotsContainer.innerHTML = 'Calculating slots...';
    message.textContent = '';
    
    if (!date) {
        slotsContainer.innerHTML = '';
        return;
    }

    // Get working hours
    const [startHour, endHour] = (saloonConfig.working_hours || '09:00-18:00').split('-').map(t => parseInt(t.split(':')[0]));
    const serviceDuration = selectedService.duration;
    const chairs = saloonConfig.total_chairs || 1; 

    // 1. Fetch existing appointments for the selected day
    const dayStart = new Date(date);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(date);
    dayEnd.setHours(23, 59, 59, 999);

    const appointmentsRef = db.collection('saloons').doc(selectedSaloonId).collection('appointments');
    const snapshot = await appointmentsRef
        .where('start_time', '>=', dayStart)
        .where('start_time', '<=', dayEnd)
        .get();

    const bookedSlots = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
            start: data.start_time.toDate().getTime(),
            end: data.end_time.toDate().getTime()
        };
    });

    // 2. Generate all potential slots and check availability (Brute Force)
    let currentTime = new Date(date);
    currentTime.setHours(startHour, 0, 0, 0);
    slotsContainer.innerHTML = '';
    let foundSlots = false;

    while (currentTime.getHours() < endHour) {
        const potentialStart = currentTime.getTime();
        const potentialEnd = potentialStart + serviceDuration * 60 * 1000;
        
        // Check if the slot ends before the saloon closes
        const potentialEndHour = new Date(potentialEnd).getHours();
        if (potentialEndHour > endHour || (potentialEndHour === endHour && potentialEnd % (endHour * 3600000) > 0)) {
             currentTime.setMinutes(currentTime.getMinutes() + 15); // Move to next interval
             continue;
        }

        // Check availability of chairs during this time window
        let conflicts = 0;
        for (const booked of bookedSlots) {
            if (potentialStart < booked.end && potentialEnd > booked.start) {
                conflicts++;
            }
        }
        
        const isAvailable = conflicts < chairs;

        // 3. Render the button
        const slotTimeStr = currentTime.toLocaleTimeString('en-PK', { hour: '2-digit', minute:'2-digit' });
        const button = document.createElement('button');
        button.textContent = slotTimeStr;
        button.className = isAvailable ? 'available' : 'booked';
        button.disabled = !isAvailable;

        if (isAvailable) {
            button.onclick = () => selectTimeSlot(potentialStart, potentialEnd);
            foundSlots = true;
        }

        slotsContainer.appendChild(button);

        // Move to the next potential start time (e.g., in 15-minute increments)
        currentTime.setMinutes(currentTime.getMinutes() + 15);
    }
    
    if (!foundSlots) {
        message.textContent = 'No available slots found on this date.';
    } else {
         message.textContent = `Available slots for ${selectedService.name}:`;
    }
    
    // Reset confirmation section
    document.getElementById('booking-details').style.display = 'none';
};

const selectTimeSlot = (startTimeMs, endTimeMs) => {
    // Highlight the selected button
    document.querySelectorAll('#time-slots button').forEach(btn => btn.classList.remove('selected'));
    document.querySelector(`button[onclick*="${startTimeMs}"]`).classList.add('selected');

    selectedTime = {
        start: new Date(startTimeMs),
        end: new Date(endTimeMs)
    };
    
    // Show confirmation section (Step 4)
    renderPriceSummary();
    renderPaymentMethods();
    document.getElementById('booking-details').style.display = 'block';
};

const renderPriceSummary = () => {
    const summary = document.getElementById('price-summary');
    const finalPrice = selectedService.price; 
    
    summary.innerHTML = `
        <p>Service: <strong>${selectedService.name}</strong></p>
        <p>Time: <strong>${selectedTime.start.toLocaleTimeString('en-PK')}</strong></p>
        <p style="font-size: 1.2em; font-weight: bold; color: #28a745;">Total Price: PKR ${finalPrice}</p>
    `;
};

const renderPaymentMethods = () => {
    const container = document.getElementById('payment-method-container');
    const methods = saloonConfig.payment_options || ['Cash'];
    container.innerHTML = '';
    
    methods.forEach(method => {
        container.innerHTML += `
            <label class="payment-option-label">
                <input type="radio" name="payment-method" value="${method}" required>
                ${method}
            </label>
        `;
    });
};


// === 4. FINAL BOOKING SUBMISSION ===
const handleFinalBooking = async (e) => {
    e.preventDefault();
    if (!selectedTime || !selectedService || !selectedSaloonId) {
        alert('Please select a service, date, and time slot first.');
        return;
    }

    const finalMessage = document.getElementById('final-message');
    finalMessage.classList.remove('hidden', 'error');
    finalMessage.style.backgroundColor = 'orange';
    finalMessage.textContent = 'Processing booking and sending confirmation SMS...';
    
    const paymentMethod = document.querySelector('input[name="payment-method"]:checked')?.value;
    
    const bookingData = {
        saloonId: selectedSaloonId,
        serviceName: selectedService.name,
        customerName: document.getElementById('customer-name').value,
        customerPhone: document.getElementById('customer-phone').value,
        customerEmail: document.getElementById('customer-email').value,
        notes: document.getElementById('customer-notes').value,
        startTime: selectedTime.start.toISOString(),
        endTime: selectedTime.end.toISOString(),
        finalPrice: selectedService.price,
        paymentMethod: paymentMethod
    };

    try {
        // Call the secure Cloud Function to handle DB write and Twilio SMS
        const result = await bookAppointmentAndNotify(bookingData);

        finalMessage.textContent = `Success! ${result.data.message}`;
        finalMessage.style.backgroundColor = '#d4edda'; // light green
        finalMessage.style.color = '#155724';

        // Reset the form
        document.getElementById('booking-details-form').reset();
        selectedTime = null;
        selectedService = null;
        // Optionally reload the page or reset all steps
        setTimeout(() => window.location.reload(), 3000);

    } catch (error) {
        console.error("Booking Error:", error);
        finalMessage.textContent = `Booking Failed: ${error.message}`;
        finalMessage.style.backgroundColor = '#f8d7da'; // light red
        finalMessage.style.color = '#721c24';
    }
};
