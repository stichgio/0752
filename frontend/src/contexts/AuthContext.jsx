import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db, hasFirebaseConfig, firebaseConfigError } from '../firebase/config';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [userRole, setUserRole] = useState(null);
    const [isLoading, setIsLoading] = useState(hasFirebaseConfig);

    useEffect(() => {
        if (!hasFirebaseConfig || !auth) {
            setIsLoading(false);
            return undefined;
        }

        const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
            if (firebaseUser) {
                setUser(firebaseUser);
                // Fetch role from Firestore users collection
                try {
                    if (!db) {
                        setUserRole('user');
                        setIsLoading(false);
                        return;
                    }
                    const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
                    if (userDoc.exists()) {
                        setUserRole(userDoc.data().role || 'user');
                    } else {
                        setUserRole('user');
                    }
                } catch (err) {
                    console.error('[AuthContext] Error fetching user role:', err);
                    setUserRole('user');
                }
            } else {
                setUser(null);
                setUserRole(null);
            }
            setIsLoading(false);
        });

        return () => unsubscribe();
    }, []);

    const login = useCallback(async (email, password) => {
        if (!hasFirebaseConfig || !auth) {
            const error = new Error(firebaseConfigError || 'Firebase no esta configurado.');
            error.code = 'auth/configuration-missing';
            throw error;
        }
        return signInWithEmailAndPassword(auth, email, password);
    }, []);

    const logout = useCallback(async () => {
        if (!auth) {
            setUser(null);
            setUserRole(null);
            return;
        }
        await signOut(auth);
        setUser(null);
        setUserRole(null);
    }, []);

    const isAuthenticated = !!user;

    const value = {
        user,
        userRole,
        isAuthenticated,
        isLoading,
        hasFirebaseConfig,
        firebaseConfigError,
        login,
        logout,
    };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const ctx = useContext(AuthContext);
    if (!ctx) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return ctx;
}

export default AuthContext;
