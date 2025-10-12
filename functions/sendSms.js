/**
 * Firebase Cloud Function: sendSms
 * Handles the secure server-side API call to Twilio for SMS notifications. 
 * Triggered via HTTPS request from the client apps (Admin, Owner, Customer).
 */

// Import Firebase Functions and Twilio library
const functions = require('firebase-functions');
const twilio = require('twilio');

// Load Twilio credentials from Firebase environment config for security
const accountSid = functions.config().twilio.sid; // AC4fbb8b2d0fd70fd302bd119e172f088d [cite: 17]
const authToken = functions.config().twilio.auth_token; // 07517ee677735d803e7a03f79c99f799 [cite: 18]
const twilioPhoneNumber = '+12294665689'; // Your Twilio Phone Number [cite: 19]

// Initialize the Twilio client
const client = new twilio(accountSid, authToken);

/**
 * HTTPS Callable Function to send an SMS.
 * @param {object} data - The data object passed from the client.
 * @param {string} data.to - The recipient's phone number (e.g., '+923001234567').
 * @param {string} data.body - The message content.
 */
exports.sendSms = functions.https.onCall(async (data, context) => {
    // 1. Authentication/Validation (Implement security checks here)
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'The function must be called by an authenticated user.');
    }
    if (!data.to || !data.body) {
        throw new functions.https.HttpsError('invalid-argument', 'The function requires "to" and "body" parameters.');
    }

    try {
        const message = await client.messages.create({
            body: data.body,
            to: data.to,
            from: twilioPhoneNumber,
        });

        console.log(`Message sent to ${data.to}. SID: ${message.sid}`);
        return { success: true, message: `SMS sent successfully. SID: ${message.sid}` };
        
    } catch (error) {
        console.error('Twilio SMS Error:', error);
        // Throw an HttpsError to send a clean error back to the client
        throw new functions.https.HttpsError('internal', 'Failed to send SMS via Twilio.', error.message);
    }
});
