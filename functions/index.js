/**
 * ASAMS Cloud Functions for secure backend operations.
 * NOTE: For deployment, replace Twilio credentials with environment variables.
 */

const functions = require('firebase-functions');
const admin = require('firebase-admin');
const twilio = require('twilio');

admin.initializeApp();
const db = admin.firestore();

// Twilio credentials (Simulated as environment variables for secure deployment)
// In a real deployed environment, these would be configured via:
// firebase functions:config:set twilio.sid="AC4fbb8b2d0fd70fd302bd119e172f088d" twilio.token="07517ee677735d803e7a03f79c99f799" twilio.number="+12294665689"
const TWILIO_ACCOUNT_SID = functions.config().twilio?.sid || 'AC4fbb8b2d0fd70fd302bd119e172f088d'; 
const TWILIO_AUTH_TOKEN = functions.config().twilio?.token || '07517ee677735d803e7a03f79c99f799';
const TWILIO_NUMBER = functions.config().twilio?.number || '+12294665689';

const twilioClient = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);

/**
 * 1. createSaloonAndOwner: Creates a new Saloon Owner user, sets custom claims,
 * and initializes the saloon data with a 15-day trial expiration.
 */
exports.createSaloonAndOwner = functions.https.onCall(async (data, context) => {
    // 1. Authorization Check (Only Master Admin can call this)
    if (context.auth.token.role !== 'master_admin') {
        throw new functions.https.HttpsError('permission-denied', 'Only the master admin can create new saloons.');
    }

    const { email, password, saloonName, ownerName, ownerPhone } = data;

    if (!email || !password || !saloonName || !ownerPhone) {
        throw new functions.https.HttpsError('invalid-argument', 'Missing required fields.');
    }

    try {
        // 2. Create Firebase Auth User
        const userRecord = await admin.auth().createUser({
            email: email,
            password: password,
            displayName: ownerName,
        });

        const uid = userRecord.uid;
        
        // 3. Set Custom Claim (Role for Redirection/Security)
        await admin.auth().setCustomUserClaims(uid, { role: 'saloon_owner', saloonId: uid });

        // 4. Initialize Firestore Saloon Document
        const trialExpiry = admin.firestore.Timestamp.fromMillis(Date.now() + 15 * 24 * 60 * 60 * 1000); // 15 days from now

        await db.collection('saloons').doc(uid).set({
            saloonName: saloonName,
            ownerEmail: email,
            ownerName: ownerName,
            ownerPhone: ownerPhone,
            status: 'trial',
            trialExpiry: trialExpiry,
            // Default configuration for initial setup
            config: {
                workingDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
                startTime: '09:00', // HH:MM 24-hour format
                endTime: '17:00',
                lunchBreakStart: '12:00',
                lunchBreakEnd: '13:00',
                slotDurationMin: 30, // 30 minute default slots
            }
        });

        // 5. Send SMS Notification (Owner Welcome)
        const messageBody = `Welcome to ASAMS, ${saloonName}! Your 15-day trial is active. Login to manage your appointments and services.`;

        await twilioClient.messages.create({
            body: messageBody,
            from: TWILIO_NUMBER,
            to: ownerPhone
        });

        return { success: true, message: `Saloon ${saloonName} created successfully with 15-day trial.` };

    } catch (error) {
        console.error("Error creating saloon and owner:", error);
        if (error.code === 'auth/email-already-in-use') {
            throw new functions.https.HttpsError('already-exists', 'The provided email is already in use.');
        }
        throw new functions.https.HttpsError('internal', error.message);
    }
});

/**
 * 2. bookAppointmentAndNotify: Saves the booking and sends SMS notifications to 
 * the customer and the saloon owner.
 */
exports.bookAppointmentAndNotify = functions.https.onCall(async (data) => {
    const { saloonId, serviceId, customerName, customerPhone, customerEmail, startTime, endTime, serviceName } = data;

    if (!saloonId || !serviceId || !customerPhone || !startTime || !endTime || !serviceName) {
        throw new functions.https.HttpsError('invalid-argument', 'Missing required booking details.');
    }

    try {
        const appointmentData = {
            saloonId,
            serviceId,
            customerName,
            customerPhone,
            customerEmail: customerEmail || 'N/A',
            startTime: admin.firestore.Timestamp.fromDate(new Date(startTime)), // Date object from client
            endTime: admin.firestore.Timestamp.fromDate(new Date(endTime)),   // Date object from client
            serviceName,
            bookedAt: admin.firestore.Timestamp.now(),
            status: 'confirmed'
        };

        // 1. Save appointment to the Saloon's appointments subcollection
        const appointmentRef = await db.collection('saloons').doc(saloonId)
            .collection('appointments').add(appointmentData);

        // 2. Fetch Saloon Owner Details
        const saloonDoc = await db.collection('saloons').doc(saloonId).get();
        if (!saloonDoc.exists) {
            throw new functions.https.HttpsError('not-found', 'Saloon not found.');
        }
        const saloonData = saloonDoc.data();
        const saloonName = saloonData.saloonName;
        const ownerPhone = saloonData.ownerPhone;
        
        const bookingTime = new Date(startTime).toLocaleString('en-US', {
            weekday: 'short', month: 'short', day: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });

        // 3. Send Customer SMS
        const customerMessage = `Hi ${customerName}, your appointment at ${saloonName} for ${serviceName} is confirmed on ${bookingTime}. Booking ID: ${appointmentRef.id}`;
        await twilioClient.messages.create({
            body: customerMessage,
            from: TWILIO_NUMBER,
            to: customerPhone
        });

        // 4. Send Owner SMS
        const ownerMessage = `NEW BOOKING at ${saloonName}: ${serviceName} for ${customerName} on ${bookingTime}. Customer phone: ${customerPhone}.`;
        await twilioClient.messages.create({
            body: ownerMessage,
            from: TWILIO_NUMBER,
            to: ownerPhone
        });


        return { success: true, appointmentId: appointmentRef.id, message: "Appointment booked and notifications sent." };

    } catch (error) {
        console.error("Error booking appointment and notifying:", error);
        throw new functions.https.HttpsError('internal', error.message);
    }
});
