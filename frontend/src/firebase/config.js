import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const requiredFirebaseKeys = [
    'apiKey',
    'authDomain',
    'projectId',
    'appId',
];

export const hasFirebaseConfig = requiredFirebaseKeys.every((key) => {
    const value = firebaseConfig[key];
    return typeof value === 'string' && value.trim().length > 0;
});

export const firebaseConfigError = hasFirebaseConfig
    ? ''
    : 'Faltan variables VITE_FIREBASE_* en el archivo .env del frontend.';

let app = null;
let auth = null;
let db = null;

if (hasFirebaseConfig) {
    try {
        app = initializeApp(firebaseConfig);
        auth = getAuth(app);
        db = getFirestore(app);
    } catch (error) {
        console.error('[Firebase] Error initializing Firebase:', error);
    }
} else {
    console.warn('[Firebase] Initialization skipped:', firebaseConfigError);
}

export { app, auth, db };
