import React, { createContext, useContext, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
    FileText,
    LayoutDashboard,
    ChevronLeft,
    ChevronRight,
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
} from 'lucide-react';
import PomodoroTimer from '../PomodoroTimer';
import { useAuth } from '../../contexts/AuthContext';

const DashboardLayoutContext = createContext(false);

const navItems = [
    {
        icon: <LayoutDashboard size={20} />,
        label: 'Reportes Fotograficos',
        to: '/',
        match: (pathname) => pathname === '/',
        end: true,
    },
    {
        icon: <ClipboardList size={20} />,
        label: 'Informes Tecnicos',
        to: '/reportes-tecnicos',
        match: (pathname) => pathname.startsWith('/reportes-tecnicos'),
    },
    {
        icon: <FileText size={20} />,
        label: 'Fichas Tecnicas',
        to: '/fichas-tecnicas',
        match: (pathname) => pathname.startsWith('/fichas-tecnicas'),
    },
    {
        icon: <Archive size={20} />,
        label: 'Compresor',
        to: '/compressor',
        match: (pathname) => pathname.startsWith('/compressor'),
    },
    {
        icon: <Shrink size={20} />,
        label: 'Optimizador Imagenes',
        to: '/image-optimizer',
        match: (pathname) => pathname.startsWith('/image-optimizer'),
    },
    {
        icon: <FileCode size={20} />,
        label: 'Template Editor',
        to: '/template-editor',
        match: (pathname) => pathname.startsWith('/template-editor'),
    },
    {
        icon: <PenTool size={20} />,
        label: 'GioBoard',
        to: '/whiteboard',
        match: (pathname) => pathname.startsWith('/whiteboard'),
    },
    {
        icon: <BookOpen size={20} />,
        label: 'Informe Multi-Hoja',
        to: '/msheets',
        match: (pathname) => pathname.startsWith('/msheets'),
    },
    {
        icon: <Scissors size={20} />,
        label: 'PDF Tools',
        to: '/pdf-tools',
        match: (pathname) => pathname.startsWith('/pdf-tools'),
    },
    {
        icon: <FileSpreadsheet size={20} />,
        label: 'Formatos',
        to: '/formatos',
        match: (pathname) => pathname.startsWith('/formatos'),
    },
{
        icon: <Camera size={20} />,
        label: 'Panel Fotografico',
        to: '/panel-fotografico',
        match: (pathname) => pathname.startsWith('/panel-fotografico'),
    },
    {
        icon: <Droplet size={20} />,
        label: 'Desinf. Reservorios',
        to: '/desinfeccion-reservorios',
        match: (pathname) => pathname.startsWith('/desinfeccion-reservorios'),
    },
    {
        icon: <PaintBucket size={20} />,
        label: 'Maquina de Balde',
        to: '/maquina-balde',
        match: (pathname) => pathname.startsWith('/maquina-balde'),
    },
    {
        icon: <Calculator size={20} />,
        label: 'Calculadora',
        to: '/calculator',
        match: (pathname) => pathname.startsWith('/calculator'),
    },
];

const DashboardLayout = ({ children }) => {
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(true);
    const isNestedLayout = useContext(DashboardLayoutContext);
    const location = useLocation();
    const isWhiteboardRoute = location.pathname.startsWith('/whiteboard');

    if (isNestedLayout) {
        return children ?? <Outlet />;
    }

    return (
        <DashboardLayoutContext.Provider value={true}>
            <div className="flex h-screen w-full bg-neutral-950 text-neutral-200 font-sans selection:bg-white selection:text-black overflow-hidden">
                <aside
                    style={{ viewTransitionName: 'dashboard-sidebar' }}
                    className={`${isSidebarCollapsed ? 'w-16' : 'w-64'} shrink-0 bg-black border-r border-neutral-800 flex flex-col transition-[width] duration-300 relative z-50 [contain:layout_paint] [transform:translateZ(0)]`}
                >
                    <div className="h-14 flex items-center justify-center border-b border-neutral-800">
                        <div className="flex items-center gap-2 font-mono tracking-tighter">
                            <PomodoroTimer />
                        </div>
                    </div>

                    <nav className="flex-1 py-6 flex flex-col gap-2 px-2">
                        {navItems.map((item, index) => {
                            const isActive = item.to ? item.match(location.pathname) : false;
                            const Component = item.href ? 'a' : NavLink;
                            const linkProps = item.href ? { href: item.href, target: "_blank", rel: "noopener noreferrer" } : { to: item.to, end: item.end };

                            return (
                                <Component
                                    key={index}
                                    {...linkProps}
                                    className={`relative flex w-full items-center rounded-md p-3 group
                                        ${isSidebarCollapsed ? 'justify-center' : 'gap-3'}
                                        ${isActive
                                            ? 'bg-neutral-900/100 text-white shadow-[0_0_15px_rgba(255,255,255,0.1)] border border-neutral-800'
                                            : 'text-neutral-500 hover:text-white hover:bg-neutral-900'
                                        }
                                        transition-colors duration-200
                                    `}
                                    title={isSidebarCollapsed ? item.label : ''}
                                >
                                    <div className={`flex h-5 w-5 shrink-0 items-center justify-center ${isActive ? 'text-white' : 'text-neutral-500 group-hover:text-white'}`}>
                                        {item.icon}
                                    </div>

                                    {!isSidebarCollapsed && (
                                        <span className="min-w-0 text-sm font-medium tracking-wide">{item.label}</span>
                                    )}

                                    {isActive && (
                                        <div className="absolute left-0 w-1 h-full bg-white rounded-r shadow-[0_0_10px_white]" />
                                    )}
                                </Component>
                            );
                        })}
                    </nav>

                    <SidebarFooter isSidebarCollapsed={isSidebarCollapsed} setIsSidebarCollapsed={setIsSidebarCollapsed} />
                </aside>

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
        </DashboardLayoutContext.Provider>
    );
};

function SidebarFooter({ isSidebarCollapsed, setIsSidebarCollapsed }) {
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
        <div className="border-t border-neutral-800">
            {/* Admin link */}
            {userRole === 'admin' && (
                <NavLink
                    to="/admin/users"
                    className={({ isActive }) =>
                        `flex items-center gap-2 px-3 py-2.5 mx-2 mt-2 rounded-md text-xs font-medium transition-colors ${
                            isActive
                                ? 'bg-amber-950/40 text-amber-400 border border-amber-800/40'
                                : 'text-neutral-500 hover:text-white hover:bg-neutral-900'
                        } ${isSidebarCollapsed ? 'justify-center' : ''}`
                    }
                    title={isSidebarCollapsed ? 'Panel de Usuarios' : ''}
                >
                    <Users size={15} />
                    {!isSidebarCollapsed && <span>Panel de Usuarios</span>}
                </NavLink>
            )}

            {/* User info + logout */}
            <div className={`flex items-center gap-2 px-3 py-2.5 mx-2 my-1 ${isSidebarCollapsed ? 'justify-center' : ''}`}>
                <div
                    className="w-7 h-7 rounded-full bg-neutral-800 border border-neutral-700 flex items-center justify-center text-xs font-bold text-neutral-300 shrink-0"
                    title={user?.email || ''}
                >
                    {initial}
                </div>
                {!isSidebarCollapsed && (
                    <div className="min-w-0 flex-1">
                        <p className="text-xs text-neutral-300 truncate">{user?.email || ''}</p>
                        <p className="text-[10px] text-neutral-600 capitalize">{userRole || 'user'}</p>
                    </div>
                )}
                <button
                    onClick={handleLogout}
                    className={`p-1.5 rounded-md text-neutral-500 hover:text-red-400 hover:bg-red-950/30 transition-colors ${isSidebarCollapsed ? '' : 'ml-auto'}`}
                    title="Cerrar sesion"
                >
                    <LogOut size={14} />
                </button>
            </div>

            {/* Collapse toggle */}
            <div className="px-2 pb-2">
                <button
                    onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
                    className="w-full flex items-center justify-center p-2 rounded-md hover:bg-neutral-900 text-neutral-500 hover:text-white transition-colors"
                >
                    {isSidebarCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
                </button>
            </div>
        </div>
    );
}

export default DashboardLayout;
