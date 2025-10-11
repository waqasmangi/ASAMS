const functions = require('firebase-functions');
const admin = require('firebase-admin');
const twilio = require('twilio');

// Initialize Firebase Admin SDK (Cloud Functions run in a trusted environment)
admin.initializeApp();

// --- SECURE TWILIO CREDENTIALS (from Environment Variables) ---
const accountSid = functions.config().twilio.sid; 
const authToken = functions.config().twilio.token;
const twilioClient = new twilio(accountSid, authToken);
const twilioNumber = '+12294665689'; // Your Twilio 'from' number

/**
 * Callable Cloud Function to create a new Saloon Vendor, 
 * set subscription expiry (15-day trial), and send a welcome SMS.
 * (Existing Function - Do not remove)
 */
exports.createSaloonAndOwner = functions.https.onCall(async (data, context) => {
    // 1. Authentication Check (Ensure user is logged in)
    if (!context.auth) {
         throw new functions.https.HttpsError('unauthenticated', 'The request must be authenticated.');
    }
    
    if (!data.email || !data.password || !data.saloonName || !data.ownerPhone) {
        throw new functions.https.HttpsError('invalid-argument', 'Missing required fields.');
    }

    try {
        const userRecord = await admin.auth().createUser({
            email: data.email,
            password: data.password,
            displayName: data.saloonName + ' Owner',
            phoneNumber: data.ownerPhone
        });
        
        const ownerUid = userRecord.uid;
        const saloonId = admin.firestore().collection('saloons').doc().id; 

        const expiryDate = new Date();
        expiryDate.setDate(expiryDate.getDate() + 15);

        await admin.firestore().collection('saloons').doc(saloonId).set({
            saloon_id: saloonId,
            saloon_name: data.saloonName,
            owner_uid: ownerUid,
            subscription_expiry_date: expiryDate,
            created_at: admin.firestore.FieldValue.serverTimestamp(),
            is_active: true,
            trial_mode: true,
            working_hours: '09:00-18:00',
            total_chairs: 1,
            payment_options: ['Cash', 'EasyPaisa', 'JazzCash']
        });

        await admin.firestore().collection('users').doc(ownerUid).set({
            uid: ownerUid,
            role: 'owner',
            saloon_id: saloonId 
        });
        
        const messageBody = `ASAMS: Welcome to "${data.saloonName}"! Your 15-day free trial is active until ${expiryDate.toLocaleDateString('en-PK')}. Login: ${data.email} | Pass: ${data.password}`;

        await twilioClient.messages.create({
            body: messageBody,
            to: data.ownerPhone,
            from: twilioNumber
        });

        return { status: 'success', message: `Trial saloon created (ID: ${saloonId}). Trial ends ${expiryDate.toLocaleDateString('en-PK')}. Welcome SMS sent!` };

    } catch (error) {
        console.error("Master Admin Function Error:", error);
        if (error.code === 'auth/email-already-in-use') {
             throw new functions.https.HttpsError('already-exists', 'The provided email is already in use by a user.');
        }
        throw new functions.https.HttpsError('internal', `Failed to create saloon account: ${error.message}`);
    }
});


/**
 * NEW: Callable Cloud Function to save an appointment and send notifications.
 * This is called by the customer frontend.
 */
exports.bookAppointmentAndNotify = functions.https.onCall(async (data, context) => {
    // Basic Data Validation
    if (!data.saloonId || !data.serviceName || !data.customerPhone || !data.startTime || !data.endTime) {
        throw new functions.https.HttpsError('invalid-argument', 'Missing required appointment data.');
    }

    const { saloonId, serviceName, startTime, endTime, customerName, customerPhone, customerEmail, notes, finalPrice, paymentMethod } = data;

    // 1. Fetch Saloon Info (for notification details)
    const saloonDoc = await admin.firestore().collection('saloons').doc(saloonId).get();
    if (!saloonDoc.exists || saloonDoc.data().subscription_expiry_date.toDate() < new Date()) {
        throw new functions.https.HttpsError('unavailable', 'Saloon is inactive or subscription expired.');
    }
    const saloonData = saloonDoc.data();
    const saloonName = saloonData.saloon_name;
    const ownerContact = saloonData.contact_number || 'N/A'; // Cancellation number set by owner

    // 2. Save Appointment to Firestore
    const appointmentRef = admin.firestore().collection('saloons').doc(saloonId).collection('appointments');

    await appointmentRef.add({
        service: serviceName,
        customer_name: customerName,
        customer_phone: customerPhone,
        customer_email: customerEmail,
        start_time: admin.firestore.Timestamp.fromDate(new Date(startTime)),
        end_time: admin.firestore.Timestamp.fromDate(new Date(endTime)),
        final_price: finalPrice,
        payment_method: paymentMethod,
        notes: notes,
        booked_at: admin.firestore.FieldValue.serverTimestamp()
    });

    const appointmentTime = new Date(startTime).toLocaleTimeString('en-PK', {hour: '2-digit', minute:'2-digit'});
    const appointmentDate = new Date(startTime).toLocaleDateString('en-PK');
    
    // 3. Send Customer Confirmation SMS
    const customerMsg = `CONFIRMED: Your ${serviceName} appointment at ${saloonName} is confirmed for ${appointmentDate} at ${appointmentTime}. Price: PKR ${finalPrice} (${paymentMethod}). To cancel (30 min policy), call: ${ownerContact}`;

    await twilioClient.messages.create({
        body: customerMsg,
        to: customerPhone, 
        from: twilioNumber
    });

    // 4. Send Owner Notification SMS
    const ownerMsg = `NEW BOOKING at ${saloonName}: ${serviceName} on ${appointmentDate} at ${appointmentTime}. Customer: ${customerName} (${customerPhone}). Price: PKR ${finalPrice}. Payment: ${paymentMethod}. Notes: ${notes}`;

    await twilioClient.messages.create({
        body: ownerMsg,
        to: ownerContact, // Send to the cancellation number set by the owner
        from: twilioNumber
    });

    return { status: 'success', message: 'Appointment booked and notifications sent!' };
});
