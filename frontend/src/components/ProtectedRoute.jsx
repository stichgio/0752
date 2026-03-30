import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function ProtectedRoute({ children }) {
    const { isAuthenticated, isLoading } = useAuth();

    if (isLoading) {
        return (
            <div className="fixed inset-0 flex items-center justify-center bg-neutral-950 z-[9999]">
                <div className="flex flex-col items-center gap-3">
                    <div className="w-8 h-8 border-[3px] border-neutral-700 border-t-white rounded-full animate-spin" />
                    <span className="text-sm text-neutral-400 font-medium tracking-wide">
                        Verificando sesion&hellip;
                    </span>
                </div>
            </div>
        );
    }

    if (!isAuthenticated) {
        return <Navigate to="/login" replace />;
    }

    return children;
}
