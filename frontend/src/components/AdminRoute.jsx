import React, { useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '../contexts/AuthContext';
import ProtectedRoute from './ProtectedRoute';

export default function AdminRoute({ children }) {
    const { userRole, isLoading } = useAuth();

    const isNotAdmin = !isLoading && userRole !== 'admin';

    useEffect(() => {
        if (isNotAdmin) {
            toast.error('No tienes permisos de administrador');
        }
    }, [isNotAdmin]);

    return (
        <ProtectedRoute>
            {isNotAdmin ? <Navigate to="/" replace /> : children}
        </ProtectedRoute>
    );
}
