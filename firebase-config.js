// Firebase Configuration
// Note: In production, consider using environment variables or a secure config service
// For now, these keys are exposed but Firebase has built-in security rules

const firebaseConfig = {
    apiKey: "AIzaSyAILEPqpSE8c-Qr_7rSZvZkwRNCL-CwtAI",
    authDomain: "campus-quest-3e381.firebaseapp.com",
    projectId: "campus-quest-3e381",
    storageBucket: "campus-quest-3e381.firebasestorage.app",
    messagingSenderId: "498855301825",
    appId: "1:498855301825:web:11df6a5382cc53c4fe7a40",
    measurementId: "G-8ZK4N4SN4H"
};

// Security Note:
// While API keys are visible in client-side code, Firebase security is enforced through:
// 1. Firestore Security Rules
// 2. Firebase Authentication
// 3. App restrictions (if configured in Firebase Console)
// 
// For additional security in production:
// - Configure authorized domains in Firebase Console
// - Set up App Check for additional protection
// - Use environment variables for sensitive configuration
// - Implement proper Firestore security rules

export { firebaseConfig };
