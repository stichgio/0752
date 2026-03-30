import React, { useState, useEffect, useCallback } from 'react';
import { collection, getDocs, doc, getDoc, query, orderBy } from 'firebase/firestore';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import {
    Users, UserPlus, Edit3, Trash2, ToggleLeft, ToggleRight,
    X, Loader2, Shield, User, AlertCircle, Search,
} from 'lucide-react';
import { db } from '../../firebase/config';
import { apiClient } from '../../utils/apiClient';
import PageDocument from '../../components/layout/PageDocument';

function formatDate(ts) {
    if (!ts) return '—';
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function RoleBadge({ role }) {
    const isAdmin = role === 'admin';
    return (
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${isAdmin ? 'bg-amber-950/50 text-amber-400 border border-amber-800/50' : 'bg-neutral-800 text-neutral-400 border border-neutral-700'}`}>
            {isAdmin ? <Shield size={11} /> : <User size={11} />}
            {isAdmin ? 'Admin' : 'Usuario'}
        </span>
    );
}

function StatusBadge({ active }) {
    return (
        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${active ? 'bg-emerald-950/50 text-emerald-400 border border-emerald-800/50' : 'bg-red-950/50 text-red-400 border border-red-800/50'}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-emerald-400' : 'bg-red-400'}`} />
            {active ? 'Activo' : 'Inactivo'}
        </span>
    );
}

/* ============================ Modal: Create / Edit ============================ */
function UserFormModal({ isOpen, onClose, onSubmit, editingUser }) {
    const isEdit = !!editingUser;
    const [formData, setFormData] = useState({
        email: '',
        nombre: '',
        password: '',
        role: 'user',
    });
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (editingUser) {
            setFormData({
                email: editingUser.email || '',
                nombre: editingUser.nombre || '',
                password: '',
                role: editingUser.role || 'user',
            });
        } else {
            setFormData({ email: '', nombre: '', password: '', role: 'user' });
        }
    }, [editingUser, isOpen]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
            await onSubmit(formData);
            onClose();
        } catch (err) {
            // Error handled by caller
        } finally {
            setSaving(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
            <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="relative w-full max-w-md rounded-xl border border-neutral-800 bg-neutral-900 shadow-2xl"
            >
                <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-800">
                    <h2 className="text-base font-semibold text-white">
                        {isEdit ? 'Editar Usuario' : 'Nuevo Usuario'}
                    </h2>
                    <button onClick={onClose} className="text-neutral-500 hover:text-white transition-colors">
                        <X size={18} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    {!isEdit && (
                        <div>
                            <label className="block text-xs font-medium text-neutral-400 mb-1.5 uppercase tracking-wider">
                                Correo electronico
                            </label>
                            <input
                                type="email"
                                required
                                value={formData.email}
                                onChange={(e) => setFormData((p) => ({ ...p, email: e.target.value }))}
                                className="w-full rounded-lg border border-neutral-700 bg-neutral-800/50 px-3 py-2.5 text-sm text-white placeholder-neutral-600 outline-none focus:border-neutral-500"
                                placeholder="usuario@email.com"
                            />
                        </div>
                    )}

                    <div>
                        <label className="block text-xs font-medium text-neutral-400 mb-1.5 uppercase tracking-wider">
                            Nombre
                        </label>
                        <input
                            type="text"
                            required
                            value={formData.nombre}
                            onChange={(e) => setFormData((p) => ({ ...p, nombre: e.target.value }))}
                            className="w-full rounded-lg border border-neutral-700 bg-neutral-800/50 px-3 py-2.5 text-sm text-white placeholder-neutral-600 outline-none focus:border-neutral-500"
                            placeholder="Nombre del usuario"
                        />
                    </div>

                    {!isEdit && (
                        <div>
                            <label className="block text-xs font-medium text-neutral-400 mb-1.5 uppercase tracking-wider">
                                Contrasena temporal
                            </label>
                            <input
                                type="password"
                                required
                                minLength={6}
                                value={formData.password}
                                onChange={(e) => setFormData((p) => ({ ...p, password: e.target.value }))}
                                className="w-full rounded-lg border border-neutral-700 bg-neutral-800/50 px-3 py-2.5 text-sm text-white placeholder-neutral-600 outline-none focus:border-neutral-500"
                                placeholder="Minimo 6 caracteres"
                            />
                        </div>
                    )}

                    <div>
                        <label className="block text-xs font-medium text-neutral-400 mb-1.5 uppercase tracking-wider">
                            Rol
                        </label>
                        <select
                            value={formData.role}
                            onChange={(e) => setFormData((p) => ({ ...p, role: e.target.value }))}
                            className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2.5 text-sm text-white outline-none focus:border-neutral-500"
                        >
                            <option value="user">Usuario</option>
                            <option value="admin">Administrador</option>
                        </select>
                    </div>

                    <div className="flex justify-end gap-3 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 rounded-lg text-sm text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={saving}
                            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white text-black text-sm font-medium hover:bg-neutral-200 disabled:opacity-50 transition-all active:scale-[0.97]"
                        >
                            {saving && <Loader2 size={14} className="animate-spin" />}
                            {isEdit ? 'Guardar cambios' : 'Crear usuario'}
                        </button>
                    </div>
                </form>
            </motion.div>
        </div>
    );
}

/* ============================ Main Panel ============================ */
export default function UserPanel() {
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [modalOpen, setModalOpen] = useState(false);
    const [editingUser, setEditingUser] = useState(null);

    const fetchUsers = useCallback(async () => {
        setLoading(true);
        try {
            const res = await apiClient.get('/api/admin/users');
            setUsers(res.data.users || []);
        } catch (err) {
            toast.error('Error al cargar usuarios');
            console.error(err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchUsers();
    }, [fetchUsers]);

    const handleCreate = async (formData) => {
        try {
            await apiClient.post('/api/admin/users', formData);
            toast.success('Usuario creado exitosamente');
            await fetchUsers();
        } catch (err) {
            const msg = err.response?.data?.detail || 'Error al crear usuario';
            toast.error(msg);
            throw err;
        }
    };

    const handleEdit = async (formData) => {
        try {
            await apiClient.put(`/api/admin/users/${editingUser.uid}`, {
                nombre: formData.nombre,
                role: formData.role,
            });
            toast.success('Usuario actualizado');
            await fetchUsers();
        } catch (err) {
            const msg = err.response?.data?.detail || 'Error al actualizar usuario';
            toast.error(msg);
            throw err;
        }
    };

    const handleToggleActive = async (u) => {
        try {
            await apiClient.put(`/api/admin/users/${u.uid}`, {
                nombre: u.nombre,
                role: u.role,
                active: !u.active,
            });
            toast.success(u.active ? 'Usuario desactivado' : 'Usuario activado');
            await fetchUsers();
        } catch (err) {
            toast.error('Error al cambiar estado');
        }
    };

    const handleDelete = async (u) => {
        if (!window.confirm(`Eliminar a ${u.email}? Esta accion no se puede deshacer.`)) return;
        try {
            await apiClient.delete(`/api/admin/users/${u.uid}`);
            toast.success('Usuario eliminado');
            await fetchUsers();
        } catch (err) {
            toast.error('Error al eliminar usuario');
        }
    };

    const openCreate = () => { setEditingUser(null); setModalOpen(true); };
    const openEdit = (u) => { setEditingUser(u); setModalOpen(true); };
    const closeModal = () => { setModalOpen(false); setEditingUser(null); };

    const filtered = users.filter((u) => {
        if (!searchTerm) return true;
        const term = searchTerm.toLowerCase();
        return (u.email || '').toLowerCase().includes(term) || (u.nombre || '').toLowerCase().includes(term);
    });

    return (
        <PageDocument title="Panel de Usuarios - Glitch" bodyClassName="bg-[#0d0d0d] text-[#eee]">
            <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-neutral-800 border border-neutral-700 flex items-center justify-center">
                            <Users size={20} className="text-neutral-300" />
                        </div>
                        <div>
                            <h1 className="text-xl font-semibold text-white tracking-tight">Panel de Usuarios</h1>
                            <p className="text-sm text-neutral-500">{users.length} usuario{users.length !== 1 ? 's' : ''} registrado{users.length !== 1 ? 's' : ''}</p>
                        </div>
                    </div>
                    <button
                        onClick={openCreate}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-white text-black text-sm font-semibold hover:bg-neutral-200 transition-all active:scale-[0.97]"
                    >
                        <UserPlus size={16} />
                        Nuevo Usuario
                    </button>
                </div>

                {/* Search */}
                <div className="relative mb-6">
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
                    <input
                        type="text"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="Buscar por email o nombre..."
                        className="w-full sm:w-80 rounded-lg border border-neutral-800 bg-neutral-900 pl-9 pr-4 py-2.5 text-sm text-white placeholder-neutral-600 outline-none focus:border-neutral-600"
                    />
                </div>

                {/* Table */}
                {loading ? (
                    <div className="flex items-center justify-center py-20">
                        <Loader2 size={28} className="animate-spin text-neutral-500" />
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 text-neutral-500">
                        <AlertCircle size={32} className="mb-3" />
                        <p className="text-sm">{searchTerm ? 'No se encontraron resultados' : 'No hay usuarios registrados'}</p>
                    </div>
                ) : (
                    <div className="rounded-xl border border-neutral-800 overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-neutral-800 bg-neutral-900/50">
                                        <th className="text-left px-4 py-3 text-xs font-medium text-neutral-400 uppercase tracking-wider">Email</th>
                                        <th className="text-left px-4 py-3 text-xs font-medium text-neutral-400 uppercase tracking-wider">Nombre</th>
                                        <th className="text-left px-4 py-3 text-xs font-medium text-neutral-400 uppercase tracking-wider">Rol</th>
                                        <th className="text-left px-4 py-3 text-xs font-medium text-neutral-400 uppercase tracking-wider">Estado</th>
                                        <th className="text-left px-4 py-3 text-xs font-medium text-neutral-400 uppercase tracking-wider">Creacion</th>
                                        <th className="text-right px-4 py-3 text-xs font-medium text-neutral-400 uppercase tracking-wider">Acciones</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filtered.map((u) => (
                                        <tr key={u.uid} className="border-b border-neutral-800/50 hover:bg-neutral-800/30 transition-colors">
                                            <td className="px-4 py-3 text-neutral-200 font-mono text-xs">{u.email}</td>
                                            <td className="px-4 py-3 text-neutral-300">{u.nombre || '—'}</td>
                                            <td className="px-4 py-3"><RoleBadge role={u.role} /></td>
                                            <td className="px-4 py-3"><StatusBadge active={u.active !== false} /></td>
                                            <td className="px-4 py-3 text-neutral-500 text-xs">{u.createdAt ? formatDate(u.createdAt) : '—'}</td>
                                            <td className="px-4 py-3">
                                                <div className="flex items-center justify-end gap-1">
                                                    <button
                                                        title="Editar"
                                                        onClick={() => openEdit(u)}
                                                        className="p-1.5 rounded-md text-neutral-500 hover:text-white hover:bg-neutral-700/50 transition-colors"
                                                    >
                                                        <Edit3 size={14} />
                                                    </button>
                                                    <button
                                                        title={u.active !== false ? 'Desactivar' : 'Activar'}
                                                        onClick={() => handleToggleActive(u)}
                                                        className="p-1.5 rounded-md text-neutral-500 hover:text-white hover:bg-neutral-700/50 transition-colors"
                                                    >
                                                        {u.active !== false ? <ToggleRight size={14} /> : <ToggleLeft size={14} />}
                                                    </button>
                                                    <button
                                                        title="Eliminar"
                                                        onClick={() => handleDelete(u)}
                                                        className="p-1.5 rounded-md text-neutral-500 hover:text-red-400 hover:bg-red-950/30 transition-colors"
                                                    >
                                                        <Trash2 size={14} />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>

            <AnimatePresence>
                {modalOpen && (
                    <UserFormModal
                        isOpen={modalOpen}
                        onClose={closeModal}
                        onSubmit={editingUser ? handleEdit : handleCreate}
                        editingUser={editingUser}
                    />
                )}
            </AnimatePresence>
        </PageDocument>
    );
}
