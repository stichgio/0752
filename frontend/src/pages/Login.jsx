import React, { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { motion } from 'framer-motion';
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

function InteractiveGrid() {
    const [cells, setCells] = useState(0);

    useEffect(() => {
        const updateCells = () => {
            // Calculamos cuántos cuadros de 50x50 píxeles entran en la pantalla
            const cols = Math.ceil(window.innerWidth / 50);
            const rows = Math.ceil(window.innerHeight / 50);
            setCells(cols * rows);
        };
        updateCells();
        window.addEventListener('resize', updateCells);
        return () => window.removeEventListener('resize', updateCells);
    }, []);

    return (
        <div 
            className="absolute inset-0 overflow-hidden bg-[#161616]"
            style={{ 
                display: 'grid', 
                gridTemplateColumns: 'repeat(auto-fill, minmax(50px, 1fr))', 
                gridAutoRows: '50px' 
            }}
        >
            {/* Degradado general superior que cubre algo del grid */}
            <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_50%_50%,transparent_0%,#161616_100%)] z-0" />
            
            {Array.from({ length: cells }).map((_, i) => (
                <div 
                    key={i} 
                    className="relative z-10 border-r border-b border-white/[0.04] hover:bg-white/[0.08] transition-colors duration-[1500ms] hover:duration-0" 
                />
            ))}
        </div>
    );
}

export default function Login() {
    const { login, isAuthenticated, isLoading } = useAuth();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [submitting, setSubmitting] = useState(false);

    if (isLoading) {
        return (
            <div className="fixed inset-0 flex items-center justify-center bg-[#161616]">
                <div className="w-5 h-5 bg-neutral-600 animate-pulse" />
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
        <div className="fixed inset-0 flex flex-col items-center justify-center bg-[#161616] overflow-hidden selection:bg-neutral-800 selection:text-white">
            
            {/* Efecto de cuadricula interactiva de fondo */}
            <InteractiveGrid />

            <motion.div
                initial={{ opacity: 0, scale: 0.98, filter: 'blur(10px)' }}
                animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
                transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
                className="relative z-20 w-full max-w-[440px] px-6"
            >
                <div className="mb-6 text-center pointer-events-none flex flex-col items-center">
                    
                    {/* Espacio reservado para tu Logo */}
                    <img 
                        src="/logo.png" 
                        alt="Logo" 
                        className="h-24 w-auto object-contain"
                        onError={(e) => { e.target.style.display = 'none'; }}
                    />
                </div>

                {/* Formulario Estilo Brutalista / Minimalista */}
                <div className="bg-[#1a1a1a] border border-[#2b2b2b] p-6 md:p-8 shadow-2xl relative">
                    
                    {/* Acento en las esquinas similar a Reka */}
                    <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-neutral-500" />
                    <div className="absolute top-0 right-0 w-2 h-2 border-t border-r border-neutral-500" />
                    <div className="absolute bottom-0 left-0 w-2 h-2 border-b border-l border-neutral-500" />
                    <div className="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-neutral-500" />

                    <div className="mb-8 flex items-center justify-between pointer-events-none">
                        <span className="text-[11px] font-mono text-neutral-400 uppercase tracking-widest antialiased">
                            For business:
                        </span>
                        <div className="h-[1px] bg-[#2b2b2b] flex-1 ml-4" />
                    </div>

                    {error && (
                        <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            className="mb-8 p-3 border border-red-900/50 bg-red-950/20 text-[11px] font-mono text-red-500 uppercase tracking-widest antialiased"
                        >
                            <span className="opacity-50 mr-2">{'>'}</span> {error}
                        </motion.div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-7">
                        <div className="space-y-3">
                            <label className="block text-[10px] font-mono text-neutral-500 uppercase tracking-[0.15em]">
                                Email Address
                            </label>
                            <input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                                spellCheck="false"
                                className="w-full bg-[#111] border border-[#2b2b2b] px-4 py-3 text-xs text-neutral-300 placeholder-neutral-700 outline-none transition-colors focus:border-neutral-400 focus:bg-[#161616] font-mono"
                                placeholder="..."
                            />
                        </div>

                        <div className="space-y-3">
                            <label className="block text-[10px] font-mono text-neutral-500 uppercase tracking-[0.15em]">
                                Password
                            </label>
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                                className="w-full bg-[#111] border border-[#2b2b2b] px-4 py-3 text-xs text-neutral-300 placeholder-neutral-700 outline-none transition-colors focus:border-neutral-400 focus:bg-[#161616] font-mono"
                                placeholder="..."
                            />
                        </div>

                        <div className="pt-2">
                            <button
                                type="submit"
                                disabled={submitting}
                                className="w-full relative group bg-[#1a1a1a] border border-[#3a3a3a] hover:border-neutral-400 text-neutral-300 px-4 py-3.5 text-[11px] font-mono uppercase tracking-[0.2em] transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed overflow-hidden"
                            >
                                <div className="absolute inset-0 bg-neutral-200 translate-y-[101%] group-hover:translate-y-0 transition-transform duration-300 ease-[0.16,1,0.3,1]" />
                                <span className="relative z-10 group-hover:text-[#111] transition-colors duration-300 antialiased font-semibold">
                                    {submitting ? 'Authenticating' : 'Login'}
                                </span>
                            </button>
                        </div>
                    </form>
                </div>
            </motion.div>
        </div>
    );
}
