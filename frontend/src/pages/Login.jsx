import React, { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Lock, LogIn, AlertCircle, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

const ERROR_MESSAGES = {
    'auth/user-not-found': 'Usuario no encontrado',
    'auth/wrong-password': 'Contrasena incorrecta',
    'auth/invalid-credential': 'Credenciales invalidas',
    'auth/too-many-requests': 'Demasiados intentos. Intenta mas tarde',
    'auth/invalid-email': 'Correo electronico invalido',
    'auth/user-disabled': 'Esta cuenta ha sido desactivada',
};

function getErrorMessage(error) {
    const code = error?.code || '';
    return ERROR_MESSAGES[code] || 'Error al iniciar sesion';
}

export default function Login() {
    const { login, isAuthenticated, isLoading } = useAuth();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState('');
    const [submitting, setSubmitting] = useState(false);

    if (isLoading) {
        return (
            <div className="fixed inset-0 flex items-center justify-center bg-neutral-950">
                <div className="w-8 h-8 border-[3px] border-neutral-700 border-t-white rounded-full animate-spin" />
            </div>
        );
    }

    if (isAuthenticated) {
        return <Navigate to="/" replace />;
    }

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setSubmitting(true);

        try {
            await login(email, password);
        } catch (err) {
            setError(getErrorMessage(err));
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 flex items-center justify-center bg-neutral-950 p-4">
            {/* Subtle background pattern */}
            <div className="absolute inset-0 bg-[radial-gradient(#1a1a1a_1px,transparent_1px)] [background-size:20px_20px]" />
            <div className="absolute inset-0 bg-neutral-950/60" />

            <motion.div
                initial={{ opacity: 0, y: 20, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                className="relative w-full max-w-md"
            >
                <div className="relative rounded-2xl border border-neutral-800 bg-neutral-900/80 backdrop-blur-xl shadow-2xl shadow-black/50 overflow-hidden">
                    {/* Top accent line */}
                    <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-neutral-500/40 to-transparent" />

                    <div className="p-8 sm:p-10">
                        {/* Logo / Icon */}
                        <div className="flex justify-center mb-6">
                            <div className="relative">
                                <div className="absolute inset-0 bg-white/5 blur-xl rounded-full scale-150" />
                                <div className="relative w-14 h-14 rounded-2xl bg-neutral-800 border border-neutral-700 flex items-center justify-center">
                                    <Lock size={24} className="text-neutral-300" />
                                </div>
                            </div>
                        </div>

                        <h1 className="text-xl font-semibold text-center text-white mb-1 tracking-tight">
                            Iniciar sesion
                        </h1>
                        <p className="text-sm text-center text-neutral-500 mb-8">
                            Ingresa tus credenciales para continuar
                        </p>

                        {/* Error message */}
                        {error && (
                            <motion.div
                                initial={{ opacity: 0, y: -8 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="mb-5 flex items-center gap-2.5 rounded-lg border border-red-900/50 bg-red-950/30 px-4 py-3"
                            >
                                <AlertCircle size={16} className="text-red-400 shrink-0" />
                                <span className="text-sm text-red-300">{error}</span>
                            </motion.div>
                        )}

                        <form onSubmit={handleSubmit} className="space-y-5">
                            <div>
                                <label htmlFor="login-email" className="block text-xs font-medium text-neutral-400 mb-2 uppercase tracking-wider">
                                    Correo electronico
                                </label>
                                <input
                                    id="login-email"
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    required
                                    autoComplete="email"
                                    autoFocus
                                    placeholder="tu@email.com"
                                    className="w-full rounded-lg border border-neutral-700 bg-neutral-800/50 px-4 py-3 text-sm text-white placeholder-neutral-600 outline-none transition-colors duration-200 focus:border-neutral-500 focus:bg-neutral-800 focus:ring-1 focus:ring-neutral-500/30"
                                />
                            </div>

                            <div>
                                <label htmlFor="login-password" className="block text-xs font-medium text-neutral-400 mb-2 uppercase tracking-wider">
                                    Contrasena
                                </label>
                                <div className="relative">
                                    <input
                                        id="login-password"
                                        type={showPassword ? 'text' : 'password'}
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        required
                                        autoComplete="current-password"
                                        placeholder="••••••••"
                                        className="w-full rounded-lg border border-neutral-700 bg-neutral-800/50 px-4 py-3 pr-11 text-sm text-white placeholder-neutral-600 outline-none transition-colors duration-200 focus:border-neutral-500 focus:bg-neutral-800 focus:ring-1 focus:ring-neutral-500/30"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-neutral-300 transition-colors"
                                        tabIndex={-1}
                                    >
                                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                                    </button>
                                </div>
                            </div>

                            <button
                                type="submit"
                                disabled={submitting}
                                className="relative w-full flex items-center justify-center gap-2 rounded-lg bg-white px-4 py-3 text-sm font-semibold text-black transition-all duration-200 hover:bg-neutral-200 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100"
                            >
                                {submitting ? (
                                    <div className="w-4 h-4 border-2 border-neutral-400 border-t-black rounded-full animate-spin" />
                                ) : (
                                    <>
                                        <LogIn size={16} />
                                        Iniciar sesion
                                    </>
                                )}
                            </button>
                        </form>
                    </div>

                    {/* Bottom accent */}
                    <div className="absolute bottom-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-neutral-800 to-transparent" />
                </div>

                {/* Footer text */}
                <p className="mt-6 text-center text-xs text-neutral-600">
                    Glitch &middot; AutoReport
                </p>
            </motion.div>
        </div>
    );
}
