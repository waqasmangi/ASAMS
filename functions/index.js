const functions = require('firebase-functions');
const admin = require('firebase-admin');
const twilio = require('twilio');

// Initialize Firebase Admin SDK (Cloud Functions run in a trusted environment)
admin.initializeApp();

// --- SECURE TWILIO CREDENTIALS (from Environment Variables) ---
// These keys are set via Firebase CLI and accessed securely here.
const accountSid = functions.config().twilio.sid; 
const authToken = functions.config().twilio.token;
const twilioClient = new twilio(accountSid, authToken);
const twilioNumber = '+12294665689'; // Your Twilio 'from' number

/**
 * Callable Cloud Function to create a new Saloon Vendor, 
 * set subscription expiry (15-day trial), and send a welcome SMS.
 * This is called by the Master Admin frontend.
 */
exports.createSaloonAndOwner = functions.https.onCall(async (data, context) => {
    // 1. Authentication Check (Ensure user is logged in)
    if (!context.auth) {
         throw new functions.https.HttpsError('unauthenticated', 'The request must be authenticated.');
    }
    
    // 2. Validation
    if (!data.email || !data.password || !data.saloonName || !data.ownerPhone) {
        throw new functions.https.HttpsError('invalid-argument', 'Missing required fields.');
    }

    try {
        // 3. Create Firebase Auth User (Saloon Owner)
        const userRecord = await admin.auth().createUser({
            email: data.email,
            password: data.password,
            displayName: data.saloonName + ' Owner',
            phoneNumber: data.ownerPhone
        });
        
        const ownerUid = userRecord.uid;
        // Generate a new Firestore document ID for the saloon
        const saloonId = admin.firestore().collection('saloons').doc().id; 

        // Calculate 15-day free trial expiry date
        const expiryDate = new Date();
        expiryDate.setDate(expiryDate.getDate() + 15); // Add 15 days for trial

        // 4. Create necessary Firestore documents (Top-level saloon info)
        await admin.firestore().collection('saloons').doc(saloonId).set({
            saloon_id: saloonId,
            saloon_name: data.saloonName,
            owner_uid: ownerUid,
            subscription_expiry_date: expiryDate,
            created_at: admin.firestore.FieldValue.serverTimestamp(),
            is_active: true,
            trial_mode: true, // New flag for trial status
            // Initial Config Fields (Owner can edit later)
            working_hours: '09:00-18:00',
            total_chairs: 1,
            payment_options: ['Cash', 'EasyPaisa', 'JazzCash']
        });

        // 5. Map the new user to their role and saloon_id
        await admin.firestore().collection('users').doc(ownerUid).set({
            uid: ownerUid,
            role: 'owner',
            saloon_id: saloonId 
        });
        
        // 6. Send Welcome SMS via Twilio
        const messageBody = `ASAMS: Welcome to "${data.saloonName}"! Your 15-day free trial is active until ${expiryDate.toLocaleDateString('en-PK')}. Login: ${data.email} | Pass: ${data.password}`;

        await twilioClient.messages.create({
            body: messageBody,
            to: data.ownerPhone, // The Owner's number
            from: twilioNumber  // Your Twilio number (+12294665689)
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

// NOTE: You will need a second Cloud Function later for sending appointment notifications!
