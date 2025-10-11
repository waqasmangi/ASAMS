// ASAMS Customer Booking Logic
import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js';
import { getFirestore, doc, getDoc, collection, getDocs, query, where } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js';
import { httpsCallable } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-functions.js';
import { firebaseConfig } from './firebase_config.js';

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app); // Functions need auth context
const bookAppointmentAndNotify = httpsCallable(auth, 'bookAppointmentAndNotify');

// Global state for booking process
let saloonId = null;
let saloonConfig = null;
let availableServices = [];
let selectedService = null;
let selectedDate = new Date();
let selectedSlot = null;
let currentStep = 1;

// --- Utility Functions ---

function displayMessage(containerId, message, isError = true) {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = `<div class="${isError ? 'error-message' : 'success-message'}">${message}</div>`;
    container.style.display = 'block';
    setTimeout(() => {
        container.style.display = 'none';
        container.innerHTML = '';
    }, 5000);
}

function showStep(step) {
    document.querySelectorAll('.step-content').forEach(content => content.style.display = 'none');
    document.getElementById(`step-${step}`).style.display = 'block';
    
    document.querySelectorAll('.step').forEach(s => s.classList.remove('active'));
    document.querySelector(`.step[data-step="${step}"]`).classList.add('active');
    
    currentStep = step;
}

// --- Initialization ---

window.onload = () => {
    // Extract Saloon ID from URL (e.g., index.html?id=saloonUid)
    const params = new URLSearchParams(window.location.search);
    saloonId = params.get('id');

    if (!saloonId) {
        document.getElementById('booking-app').innerHTML = '<div class="error-message text-center">Error: Saloon ID is missing from the URL (e.g., ?id=saloonUid).</div>';
        return;
    }

    loadSaloonData();
    setupUIListeners();
};

function setupUIListeners() {
    document.getElementById('date-picker').addEventListener('change', (e) => {
        selectedDate = new Date(e.target.value);
        selectedSlot = null; // Reset slot when date changes
        renderAvailableSlots();
    });
    document.getElementById('back-to-step-1').addEventListener('click', () => showStep(1));
    document.getElementById('next-to-step-3').addEventListener('click', () => {
        if (!selectedSlot) {
            displayMessage('slot-message', 'Please select an available time slot.', true);
            return;
        }
        showStep(3);
    });
    document.getElementById('booking-form').addEventListener('submit', handleBookingSubmit);
}

// --- Step 1: Service Selection ---

async function loadSaloonData() {
    const loadingEl = document.getElementById('loading-state');
    loadingEl.style.display = 'block';

    try {
        // 1. Get Saloon Config
        const saloonDoc = await getDoc(doc(db, 'saloons', saloonId));
        if (!saloonDoc.exists() || saloonDoc.data().status !== 'active') {
             throw new Error('Saloon not found or is currently inactive.');
        }
        saloonConfig = saloonDoc.data().config;
        document.getElementById('saloon-name').textContent = saloonDoc.data().saloonName || 'ASAMS Saloon';
        
        // 2. Get Services
        const servicesSnapshot = await getDocs(collection(db, 'saloons', saloonId, 'services'));
        availableServices = servicesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        if (availableServices.length === 0) {
            throw new Error('No services available for booking.');
        }

        renderServices();
        showStep(1); // Start the application at Step 1

    } catch (error) {
        console.error("Error loading saloon data:", error);
        document.getElementById('booking-app').innerHTML = `<div class="error-message text-center">${error.message}</div>`;
    } finally {
        loadingEl.style.display = 'none';
    }
}

function renderServices() {
    const servicesListEl = document.getElementById('services-list-step-1');
    servicesListEl.innerHTML = '';
    
    let servicesHtml = availableServices.map(service => `
        <div class="service-card cursor-pointer hover:shadow-md transition duration-200" data-service-id="${service.id}" onclick="window.selectService('${service.id}')">
            <h3>${service.name}</h3>
            <p class="text-sm text-gray-500">${service.description || 'No description provided.'}</p>
            <div class="card-details">
                <p class="font-bold text-lg text-primary">$${service.price.toFixed(2)} / ${service.durationMin} min</p>
                <button class="btn btn-secondary btn-sm">Select</button>
            </div>
        </div>
    `).join('');
    
    servicesListEl.innerHTML = `<div class="list-grid">${servicesHtml}</div>`;
}

window.selectService = (serviceId) => {
    selectedService = availableServices.find(s => s.id === serviceId);
    if (selectedService) {
        // Highlight selected card
        document.querySelectorAll('.service-card').forEach(card => card.classList.remove('border-primary', 'border-2'));
        document.querySelector(`.service-card[data-service-id="${serviceId}"]`).classList.add('border-primary', 'border-2');
        
        // Pre-fill date picker to today or tomorrow
        const today = new Date();
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        
        document.getElementById('date-picker').valueAsDate = tomorrow;
        selectedDate = tomorrow; // Initialize selectedDate
        
        showStep(2);
        renderAvailableSlots();
    }
}

// --- Step 2: Slot Selection ---

async function getExistingAppointments(date) {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const appointmentsRef = collection(db, 'saloons', saloonId, 'appointments');
    const q = query(
        appointmentsRef,
        where('startTime', '>=', startOfDay),
        where('startTime', '<=', endOfDay)
    );

    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => {
        const data = doc.data();
        return {
            startTime: data.startTime.toDate().getTime(),
            endTime: data.endTime.toDate().getTime(),
        };
    });
}

function calculateTimeSlots(config, serviceDuration, existingAppointments) {
    const slots = [];
    if (!config) return slots;
    
    // Ensure slot duration is valid (minimum slot duration from config)
    const minSlotDuration = config.slotDurationMin;
    if (serviceDuration % minSlotDuration !== 0) {
        console.error("Service duration is not a multiple of the minimum slot duration.");
        return slots;
    }

    const startMinutes = parseInt(config.startTime.split(':')[0]) * 60 + parseInt(config.startTime.split(':')[1]);
    const endMinutes = parseInt(config.endTime.split(':')[0]) * 60 + parseInt(config.endTime.split(':')[1]);
    const lunchStartMinutes = parseInt(config.lunchBreakStart.split(':')[0]) * 60 + parseInt(config.lunchBreakStart.split(':')[1]);
    const lunchEndMinutes = parseInt(config.lunchBreakEnd.split(':')[0]) * 60 + parseInt(config.lunchBreakEnd.split(':')[1]);

    for (let currentStart = startMinutes; currentStart < endMinutes; currentStart += minSlotDuration) {
        const proposedEnd = currentStart + serviceDuration;

        // 1. Check if the slot ends after business hours
        if (proposedEnd > endMinutes) continue;

        // 2. Check if the slot falls over the lunch break
        const isLunchConflict = (currentStart < lunchEndMinutes && proposedEnd > lunchStartMinutes);
        if (isLunchConflict) continue;

        // 3. Check for conflict with existing appointments
        const proposedStartTime = new Date(selectedDate);
        proposedStartTime.setHours(Math.floor(currentStart / 60), currentStart % 60, 0, 0);
        const proposedEndTime = new Date(selectedDate);
        proposedEndTime.setHours(Math.floor(proposedEnd / 60), proposedEnd % 60, 0, 0);

        const isBooked = existingAppointments.some(appt => {
            // Check for overlap: (StartA < EndB) && (EndA > StartB)
            return (proposedStartTime.getTime() < appt.endTime) && (proposedEndTime.getTime() > appt.startTime);
        });

        if (!isBooked) {
            slots.push({
                start: proposedStartTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                end: proposedEndTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                startTime: proposedStartTime.toISOString(),
                endTime: proposedEndTime.toISOString()
            });
        }
    }
    return slots;
}

async function renderAvailableSlots() {
    const slotPickerEl = document.getElementById('time-slot-picker');
    const slotMessageEl = document.getElementById('slot-message');
    slotPickerEl.innerHTML = '<div class="loading-spinner"></div>';
    slotMessageEl.style.display = 'none';
    
    const dayOfWeek = selectedDate.toLocaleDateString('en-US', { weekday: 'short' });
    const isWorkingDay = saloonConfig.workingDays && saloonConfig.workingDays.includes(dayOfWeek);

    if (!isWorkingDay) {
        slotPickerEl.innerHTML = '<p class="text-center p-4 text-red-500 font-semibold">The saloon is closed on this day.</p>';
        return;
    }

    try {
        const existingAppointments = await getExistingAppointments(selectedDate);
        const availableSlots = calculateTimeSlots(saloonConfig, selectedService.durationMin, existingAppointments);

        slotPickerEl.innerHTML = '';
        if (availableSlots.length === 0) {
            slotPickerEl.innerHTML = '<p class="text-center p-4 text-gray-500">No available slots for this day.</p>';
        } else {
            availableSlots.forEach(slot => {
                const slotEl = document.createElement('div');
                slotEl.className = 'time-slot';
                slotEl.textContent = slot.start;
                slotEl.dataset.startTime = slot.startTime;
                slotEl.dataset.endTime = slot.endTime;
                slotEl.onclick = () => selectSlot(slotEl, slot);
                slotPickerEl.appendChild(slotEl);
            });
        }
    } catch (error) {
        console.error("Error rendering slots:", error);
        slotPickerEl.innerHTML = '<p class="error-message p-4">Failed to calculate time slots.</p>';
    }
}

function selectSlot(slotEl, slotData) {
    document.querySelectorAll('.time-slot').forEach(el => el.classList.remove('selected'));
    slotEl.classList.add('selected');
    selectedSlot = slotData;
    displayMessage('slot-message', `${selectedService.name} booked from ${slotData.start} to ${slotData.end}. Click 'Next' to confirm.`, false);
}

// --- Step 3: Final Submission ---

async function handleBookingSubmit(e) {
    e.preventDefault();
    const form = e.target;
    
    if (!selectedService || !selectedSlot) {
        displayMessage('final-message', 'Service or time slot is missing. Please review your selection.', true);
        return;
    }

    const customerData = {
        customerName: form.querySelector('#customer-name').value,
        customerPhone: form.querySelector('#customer-phone').value,
        customerEmail: form.querySelector('#customer-email').value
    };
    
    // Simple validation for phone number (Twilio requires E.164 format or similar)
    if (!customerData.customerPhone.match(/^\+\d{10,15}$/)) {
         displayMessage('final-message', 'Phone number must be in international format (e.g., +15551234567).', true);
         return;
    }

    const submitBtn = form.querySelector('button[type="submit"]');
    const originalText = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<div class="loading-spinner" style="width: 20px; height: 20px; margin: 0 auto;"></div>';

    try {
        const bookingPayload = {
            saloonId: saloonId,
            serviceId: selectedService.id,
            serviceName: selectedService.name,
            startTime: selectedSlot.startTime, // ISO string for Cloud Function to parse
            endTime: selectedSlot.endTime,
            ...customerData
        };

        const result = await bookAppointmentAndNotify(bookingPayload);

        // Success state
        document.getElementById('booking-app').innerHTML = `
            <div class="card max-w-lg text-center mx-auto">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-16 w-16 text-secondary mx-auto mb-4" viewBox="0 0 20 20" fill="currentColor">
                    <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" />
                </svg>
                <h2 class="text-secondary">Booking Confirmed!</h2>
                <p class="text-lg mb-4">You are all set for your appointment at <span class="font-bold">${document.getElementById('saloon-name').textContent}</span>.</p>
                <p class="text-sm text-gray-600">Confirmation SMS sent to ${customerData.customerPhone}.</p>
                <a href="${window.location.pathname}?id=${saloonId}" class="btn btn-primary mt-6">Book Another Appointment</a>
            </div>
        `;

    } catch (error) {
        console.error("Booking submission failed:", error);
        displayMessage('final-message', error.message || "Booking failed. Please check your network or try again.", true);
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
    }
}
