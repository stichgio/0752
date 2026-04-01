import React, { createContext, useContext, useState, useRef, useEffect, useCallback } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
    FileText,
    LayoutDashboard,
    ClipboardList,
    Archive,
    Shrink,
    FileCode,
    BookOpen,
    Scissors,
    PenTool,
    FileSpreadsheet,
    Camera,
    Calculator,
    Droplet,
    PaintBucket,
    LogOut,
    Users,
    MoreHorizontal,
    Pin,
    PinOff,
    Settings2,
    GripVertical,
    RotateCcw,
    Search,
} from 'lucide-react';
import PomodoroTimer from '../PomodoroTimer';
import { useAuth } from '../../contexts/AuthContext';
import useNavPreferences from '../../hooks/useNavPreferences';
import Dialog from '../ui/Dialog';

const DashboardLayoutContext = createContext(false);

/**
 * @typedef {Object} DashboardNavItem
 * @property {string} id
 * @property {React.ReactNode} icon
 * @property {string} label
 * @property {string} to
 * @property {(pathname: string) => boolean} match
 * @property {boolean} [end]
 */

/** @type {DashboardNavItem[]} */
const NAV_CATALOG = [
    {
        id: 'reportes-fotograficos',
        icon: LayoutDashboard,
        label: 'Reportes Fotograficos',
        to: '/',
        match: (pathname) => pathname === '/',
        end: true,
    },
    {
        id: 'informes-tecnicos',
        icon: ClipboardList,
        label: 'Informes Tecnicos',
        to: '/reportes-tecnicos',
        match: (pathname) => pathname.startsWith('/reportes-tecnicos'),
    },
    {
        id: 'fichas-tecnicas',
        icon: FileText,
        label: 'Fichas Tecnicas',
        to: '/fichas-tecnicas',
        match: (pathname) => pathname.startsWith('/fichas-tecnicas'),
    },
    {
        id: 'compressor',
        icon: Archive,
        label: 'Compresor',
        to: '/compressor',
        match: (pathname) => pathname.startsWith('/compressor'),
    },
    {
        id: 'image-optimizer',
        icon: Shrink,
        label: 'Optimizador Imagenes',
        to: '/image-optimizer',
        match: (pathname) => pathname.startsWith('/image-optimizer'),
    },
    {
        id: 'template-editor',
        icon: FileCode,
        label: 'Template Editor',
        to: '/template-editor',
        match: (pathname) => pathname.startsWith('/template-editor'),
    },
    {
        id: 'whiteboard',
        icon: PenTool,
        label: 'GioBoard',
        to: '/whiteboard',
        match: (pathname) => pathname.startsWith('/whiteboard'),
    },
    {
        id: 'msheets',
        icon: BookOpen,
        label: 'Informe Multi-Hoja',
        to: '/msheets',
        match: (pathname) => pathname.startsWith('/msheets'),
    },
    {
        id: 'pdf-tools',
        icon: Scissors,
        label: 'PDF Tools',
        to: '/pdf-tools',
        match: (pathname) => pathname.startsWith('/pdf-tools'),
    },
    {
        id: 'formatos',
        icon: FileSpreadsheet,
        label: 'Formatos',
        to: '/formatos',
        match: (pathname) => pathname.startsWith('/formatos'),
    },
    {
        id: 'panel-fotografico',
        icon: Camera,
        label: 'Panel Fotografico',
        to: '/panel-fotografico',
        match: (pathname) => pathname.startsWith('/panel-fotografico'),
    },
    {
        id: 'desinfeccion-reservorios',
        icon: Droplet,
        label: 'Desinf. Reservorios',
        to: '/desinfeccion-reservorios',
        match: (pathname) => pathname.startsWith('/desinfeccion-reservorios'),
    },
    {
        id: 'maquina-balde',
        icon: PaintBucket,
        label: 'Maquina de Balde',
        to: '/maquina-balde',
        match: (pathname) => pathname.startsWith('/maquina-balde'),
    },
    {
        id: 'calculator',
        icon: Calculator,
        label: 'Calculadora',
        to: '/calculator',
        match: (pathname) => pathname.startsWith('/calculator'),
    },
];

const CATALOG_IDS = NAV_CATALOG.map((item) => item.id);
const CATALOG_MAP = Object.fromEntries(NAV_CATALOG.map((item) => [item.id, item]));

/* ─── Rail Nav Item ─── */
function RailItem({ item, isActive }) {
    const IconComponent = item.icon;
    return (
        <NavLink
            to={item.to}
            end={item.end}
            className={`
                relative flex w-10 h-10 items-center justify-center rounded-xl group
                transition-all duration-200 ease-out
                ${isActive
                    ? 'bg-white/10 text-white shadow-[0_0_20px_rgba(255,255,255,0.06)] ring-1 ring-white/10'
                    : 'text-neutral-500 hover:text-neutral-200 hover:bg-white/[0.04]'
                }
            `}
            title={item.label}
            aria-label={item.label}
        >
            <IconComponent size={18} strokeWidth={isActive ? 2 : 1.5} />

            {isActive && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-white rounded-r-full shadow-[0_0_8px_rgba(255,255,255,0.4)]" />
            )}
        </NavLink>
    );
}

/* ─── "More" Launcher Panel ─── */
function MorePanel({ items, currentPath, onNavigate, onTogglePin, onOpenCustomize, onClose }) {
    const panelRef = useRef(null);
    const [search, setSearch] = useState('');

    useEffect(() => {
        const handleClick = (e) => {
            if (panelRef.current && !panelRef.current.contains(e.target)) {
                onClose();
            }
        };
        const handleKey = (e) => {
            if (e.key === 'Escape') onClose();
        };
        document.addEventListener('mousedown', handleClick);
        document.addEventListener('keydown', handleKey);
        return () => {
            document.removeEventListener('mousedown', handleClick);
            document.removeEventListener('keydown', handleKey);
        };
    }, [onClose]);

    const filtered = items.filter((item) =>
        !search || item.label.toLowerCase().includes(search.toLowerCase())
    );

    return (
        <div
            ref={panelRef}
            className="
                absolute left-[calc(100%+8px)] bottom-14 z-[70]
                w-72 max-h-[70vh] flex flex-col
                bg-neutral-950/95 backdrop-blur-xl
                border border-neutral-800/60 rounded-2xl
                shadow-2xl shadow-black/50
                overflow-hidden
                animate-in
            "
            style={{ animationDuration: '150ms' }}
        >
            {/* Search */}
            <div className="px-3 pt-3 pb-2">
                <div className="relative">
                    <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-500" />
                    <input
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Buscar interfaz..."
                        className="
                            w-full h-8 pl-8 pr-3 rounded-lg
                            bg-neutral-900 border border-neutral-800
                            text-xs text-neutral-300 placeholder:text-neutral-600
                            outline-none focus:border-neutral-700 focus:ring-1 focus:ring-neutral-700/50
                            transition-colors
                        "
                        autoFocus
                    />
                </div>
            </div>

            {/* List instead of grid */}
            <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-0.5 scrollbar-thin">
                {filtered.length === 0 ? (
                    <p className="text-xs text-neutral-600 text-center py-6">
                        No se encontraron interfaces
                    </p>
                ) : (
                    <div className="flex flex-col gap-0.5">
                        {filtered.map((item) => {
                            const isActive = item.match(currentPath);
                            const IconComponent = item.icon;
                            return (
                                <div key={item.id} className="relative group/card">
                                    <button
                                        onClick={() => onNavigate(item.to)}
                                        className={`
                                            w-full flex items-center gap-3 px-3 py-2.5 rounded-xl
                                            text-left transition-all duration-150
                                            ${isActive
                                                ? 'bg-white/10 text-white ring-1 ring-white/10 shadow-sm'
                                                : 'text-neutral-400 hover:text-white hover:bg-white/[0.04]'
                                            }
                                        `}
                                        title={item.label}
                                    >
                                        <IconComponent size={16} strokeWidth={isActive ? 2 : 1.5} className="shrink-0" />
                                        <span className="text-xs font-medium truncate flex-1">
                                            {item.label}
                                        </span>
                                    </button>
                                    {/* Quick pin button */}
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onTogglePin(item.id);
                                        }}
                                        className="
                                            absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7
                                            flex items-center justify-center rounded-lg
                                            bg-neutral-800/80 border border-neutral-700 backdrop-blur-sm
                                            text-neutral-400 hover:text-white hover:bg-neutral-700
                                            opacity-0 group-hover/card:opacity-100
                                            transition-all duration-150
                                            shadow-sm z-10
                                        "
                                        title="Fijar en barra"
                                    >
                                        <Pin size={12} />
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Footer */}
            <div className="border-t border-neutral-800/60 px-3 py-2">
                <button
                    onClick={onOpenCustomize}
                    className="
                        w-full flex items-center justify-center gap-2 h-8
                        rounded-lg text-xs font-medium
                        text-neutral-400 hover:text-white
                        hover:bg-white/[0.04]
                        transition-colors duration-150
                    "
                >
                    <Settings2 size={14} />
                    Personalizar navegacion
                </button>
            </div>
        </div>
    );
}

/* ─── Customize Navigation Dialog ─── */
function CustomizeDialog({ open, onClose, order, pinnedIds, catalogMap, onTogglePin, onSetOrder, onReset }) {
    const [localOrder, setLocalOrder] = useState(order);
    const [localPinned, setLocalPinned] = useState(new Set(pinnedIds));
    const dragItem = useRef(null);
    const dragOverItem = useRef(null);

    useEffect(() => {
        if (open) {
            setLocalOrder([...order]);
            setLocalPinned(new Set(pinnedIds));
        }
    }, [open, order, pinnedIds]);

    const handleDragStart = (index) => {
        dragItem.current = index;
    };

    const handleDragEnter = (index) => {
        dragOverItem.current = index;
    };

    const handleDragEnd = () => {
        if (dragItem.current === null || dragOverItem.current === null) return;
        const cloned = [...localOrder];
        const removed = cloned.splice(dragItem.current, 1)[0];
        cloned.splice(dragOverItem.current, 0, removed);
        setLocalOrder(cloned);
        dragItem.current = null;
        dragOverItem.current = null;
    };

    const handleToggleLocal = (id) => {
        setLocalPinned((prev) => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    };

    const handleSave = () => {
        onSetOrder(localOrder);
        // Sync pinned
        const newPinned = localOrder.filter((id) => localPinned.has(id));
        onTogglePin(newPinned);
        onClose();
    };

    const handleReset = () => {
        onReset();
        onClose();
    };

    const pinnedItems = localOrder.filter((id) => localPinned.has(id));
    const unpinnedItems = localOrder.filter((id) => !localPinned.has(id));

    return (
        <Dialog
            open={open}
            onClose={onClose}
            title="Personalizar navegacion"
            description="Arrastra para reordenar. Fija las interfaces que quieres ver en la barra lateral."
            size="lg"
            footer={
                <>
                    <button
                        onClick={handleReset}
                        className="
                            flex items-center gap-1.5 px-3 py-1.5 rounded-lg
                            text-xs font-medium text-neutral-400
                            hover:text-white hover:bg-white/[0.04]
                            transition-colors
                        "
                    >
                        <RotateCcw size={13} />
                        Restaurar
                    </button>
                    <div className="flex-1" />
                    <button
                        onClick={onClose}
                        className="
                            px-4 py-1.5 rounded-lg text-xs font-medium
                            text-neutral-400 hover:text-white
                            hover:bg-white/[0.04] transition-colors
                        "
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={handleSave}
                        className="
                            px-4 py-1.5 rounded-lg text-xs font-bold
                            bg-white text-black
                            hover:bg-neutral-200 transition-colors
                        "
                    >
                        Guardar
                    </button>
                </>
            }
        >
            <div className="max-h-[50vh] overflow-y-auto -mx-1 px-1 space-y-4">
                {/* Pinned section */}
                <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-500 mb-2 px-1">
                        Fijadas ({pinnedItems.length})
                    </p>
                    {pinnedItems.length === 0 && (
                        <p className="text-xs text-neutral-600 py-3 text-center">
                            Ninguna interfaz fijada
                        </p>
                    )}
                    <div className="space-y-1">
                        {pinnedItems.map((id, index) => {
                            const item = catalogMap[id];
                            if (!item) return null;
                            const Icon = item.icon;
                            return (
                                <div
                                    key={id}
                                    draggable
                                    onDragStart={() => handleDragStart(localOrder.indexOf(id))}
                                    onDragEnter={() => handleDragEnter(localOrder.indexOf(id))}
                                    onDragEnd={handleDragEnd}
                                    onDragOver={(e) => e.preventDefault()}
                                    className="
                                        flex items-center gap-3 px-2 py-2 rounded-xl
                                        bg-white/[0.03] border border-transparent
                                        hover:border-neutral-800 hover:bg-white/[0.05]
                                        transition-colors cursor-grab active:cursor-grabbing
                                        group
                                    "
                                >
                                    <GripVertical size={14} className="text-neutral-600 shrink-0 group-hover:text-neutral-400" />
                                    <Icon size={16} className="text-neutral-400 shrink-0" />
                                    <span className="flex-1 text-sm text-neutral-300 truncate">{item.label}</span>
                                    <button
                                        onClick={() => handleToggleLocal(id)}
                                        className="
                                            flex items-center justify-center w-7 h-7 rounded-lg
                                            text-white bg-white/10 hover:bg-red-500/20 hover:text-red-400
                                            transition-colors
                                        "
                                        title="Desfijar"
                                    >
                                        <PinOff size={13} />
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Unpinned section */}
                {unpinnedItems.length > 0 && (
                    <div>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-500 mb-2 px-1">
                            Disponibles ({unpinnedItems.length})
                        </p>
                        <div className="space-y-1">
                            {unpinnedItems.map((id) => {
                                const item = catalogMap[id];
                                if (!item) return null;
                                const Icon = item.icon;
                                return (
                                    <div
                                        key={id}
                                        className="
                                            flex items-center gap-3 px-2 py-2 rounded-xl
                                            hover:bg-white/[0.03] transition-colors group
                                        "
                                    >
                                        <div className="w-[14px] shrink-0" />
                                        <Icon size={16} className="text-neutral-600 shrink-0" />
                                        <span className="flex-1 text-sm text-neutral-500 truncate">{item.label}</span>
                                        <button
                                            onClick={() => handleToggleLocal(id)}
                                            className="
                                                flex items-center justify-center w-7 h-7 rounded-lg
                                                text-neutral-500 hover:bg-white/10 hover:text-white
                                                transition-colors
                                            "
                                            title="Fijar"
                                        >
                                            <Pin size={13} />
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>
        </Dialog>
    );
}

/* ─── Sidebar Footer ─── */
function SidebarFooter() {
    const { user, userRole, logout } = useAuth();

    const initial = user?.email ? user.email[0].toUpperCase() : '?';

    const handleLogout = async () => {
        try {
            await logout();
        } catch (err) {
            console.error('Logout failed:', err);
        }
    };

    return (
        <div className="shrink-0 w-full flex flex-col items-center border-t border-neutral-800/60 px-1.5 py-2 space-y-1">
            {/* Admin link */}
            {userRole === 'admin' && (
                <NavLink
                    to="/admin/users"
                    className={({ isActive }) =>
                        `flex items-center justify-center w-10 h-10 mx-auto rounded-xl text-xs font-medium transition-all duration-200 group relative ${
                            isActive
                                ? 'bg-amber-950/40 text-amber-400 ring-1 ring-amber-800/40'
                                : 'text-neutral-500 hover:text-white hover:bg-white/[0.04]'
                        }`
                    }
                    title="Panel de Usuarios"
                    aria-label="Panel de Usuarios"
                >
                    <Users size={17} />
                </NavLink>
            )}

            {/* User avatar + logout */}
            <div className="flex flex-col items-center gap-1 pt-1">
                <div
                    className="w-8 h-8 rounded-full bg-neutral-800/80 border border-neutral-700/50 flex items-center justify-center text-[11px] font-bold text-neutral-400 shrink-0"
                    title={user?.email || ''}
                >
                    {initial}
                </div>
                <button
                    onClick={handleLogout}
                    className="
                        flex items-center justify-center w-8 h-8 rounded-lg
                        text-neutral-600 hover:text-red-400 hover:bg-red-950/30
                        transition-colors group relative
                    "
                    title="Cerrar sesion"
                    aria-label="Cerrar sesion"
                >
                    <LogOut size={14} />
                </button>
            </div>
        </div>
    );
}

/* ─── Main Layout ─── */
const DashboardLayout = ({ children }) => {
    const isNestedLayout = useContext(DashboardLayoutContext);
    const location = useLocation();
    const navigate = useNavigate();
    const isWhiteboardRoute = location.pathname.startsWith('/whiteboard');

    const {
        order,
        pinnedIds,
        togglePin,
        setOrder,
        setPinned,
        resetDefaults,
    } = useNavPreferences(CATALOG_IDS);

    const [morePanelOpen, setMorePanelOpen] = useState(false);
    const [customizeOpen, setCustomizeOpen] = useState(false);

    // Derive pinned and unpinned items from preferences
    const pinnedItems = order
        .filter((id) => pinnedIds.includes(id))
        .map((id) => CATALOG_MAP[id])
        .filter(Boolean);

    const unpinnedItems = order
        .filter((id) => !pinnedIds.includes(id))
        .map((id) => CATALOG_MAP[id])
        .filter(Boolean);

    const handleNavigateFromMore = useCallback((to) => {
        navigate(to);
        setMorePanelOpen(false);
    }, [navigate]);

    const handleOpenCustomize = useCallback(() => {
        setMorePanelOpen(false);
        setCustomizeOpen(true);
    }, []);

    const handlePinnedBulkSet = useCallback((newPinned) => {
        setPinned(newPinned);
    }, [setPinned]);

    if (isNestedLayout) {
        return children ?? <Outlet />;
    }

    return (
        <DashboardLayoutContext.Provider value={true}>
            <div className="flex h-screen w-full bg-neutral-950 text-neutral-200 font-sans selection:bg-white selection:text-black overflow-hidden">
                {/* Rail sidebar */}
                <aside
                    style={{ viewTransitionName: 'dashboard-sidebar' }}
                    className="
                        w-[60px] shrink-0 bg-black/80 backdrop-blur-sm
                        border-r border-neutral-800/40
                        flex flex-col items-center
                        relative z-50
                    "
                >
                    {/* Pomodoro header */}
                    <div className="shrink-0 h-14 flex items-center justify-center border-b border-neutral-800/40 w-full">
                        <PomodoroTimer />
                    </div>

                    {/* Pinned nav items */}
                    <nav className="flex-1 w-full py-4 flex flex-col items-center gap-1.5 overflow-y-auto scrollbar-none px-2.5">
                        {pinnedItems.map((item) => {
                            const isActive = item.match(location.pathname);
                            return (
                                <RailItem
                                    key={item.id}
                                    item={item}
                                    isActive={isActive}
                                />
                            );
                        })}
                    </nav>

                    {/* More button area (outside nav scroll for better Popover positioning) */}
                    {unpinnedItems.length > 0 && (
                        <div className="shrink-0 w-full flex flex-col items-center pb-3 relative">
                            {/* Separator if pinned items exist */}
                            {pinnedItems.length > 0 && (
                                <div className="w-5 h-px bg-neutral-800/60 mb-2.5" />
                            )}
                            
                            {/* "More" button */}
                            <button
                                onClick={() => setMorePanelOpen((p) => !p)}
                                className={`
                                    flex w-10 h-10 items-center justify-center rounded-xl
                                    transition-all duration-200 ease-out group relative
                                    ${morePanelOpen
                                        ? 'bg-white/10 text-white shadow-[0_0_20px_rgba(255,255,255,0.06)] ring-1 ring-white/10'
                                        : 'text-neutral-500 hover:text-neutral-200 hover:bg-white/[0.04]'
                                    }
                                `}
                                title="Mas interfaces"
                                aria-label="Mas interfaces"
                            >
                                <MoreHorizontal size={18} />

                                {/* Badge count */}
                                <span className="
                                    absolute -top-1.5 -right-1.5
                                    min-w-[18px] h-[18px] px-1
                                    flex items-center justify-center
                                    bg-neutral-800 border-[1.5px] border-black text-white
                                    rounded-full text-[9px] font-bold z-10
                                    shadow-sm
                                ">
                                    {unpinnedItems.length}
                                </span>
                            </button>

                            {/* More launcher panel */}
                            {morePanelOpen && (
                                <MorePanel
                                    items={unpinnedItems}
                                    currentPath={location.pathname}
                                    onNavigate={handleNavigateFromMore}
                                    onTogglePin={togglePin}
                                    onOpenCustomize={handleOpenCustomize}
                                    onClose={() => setMorePanelOpen(false)}
                                />
                            )}
                        </div>
                    )}

                    {/* Footer */}
                    <SidebarFooter />
                </aside>

                {/* Content */}
                <div style={{ viewTransitionName: 'dashboard-content' }} className="flex-1 flex flex-col h-full overflow-hidden bg-neutral-950 relative">
                    <main className={`flex-1 ${isWhiteboardRoute ? 'overflow-hidden' : 'overflow-auto'} relative ${isWhiteboardRoute ? 'bg-[#121212]' : 'bg-[radial-gradient(#1a1a1a_1px,transparent_1px)] [background-size:20px_20px]'}`}>
                        {!isWhiteboardRoute && (
                            <div className="absolute inset-0 bg-neutral-950/50 pointer-events-none" />
                        )}
                        <div className="relative z-10 w-full h-full">
                            {children ?? <Outlet />}
                        </div>
                    </main>
                </div>
            </div>

            {/* Customize dialog */}
            <CustomizeDialog
                open={customizeOpen}
                onClose={() => setCustomizeOpen(false)}
                order={order}
                pinnedIds={pinnedIds}
                catalogMap={CATALOG_MAP}
                onTogglePin={handlePinnedBulkSet}
                onSetOrder={setOrder}
                onReset={resetDefaults}
            />
        </DashboardLayoutContext.Provider>
    );
};

export default DashboardLayout;
