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
} from 'lucide-react';
import PomodoroTimer from '../PomodoroTimer';

const DashboardLayoutContext = createContext(false);

const navItems = [
    {
        icon: <LayoutDashboard size={20} />,
        label: 'Reportes Fotográficos',
        to: '/',
        match: (pathname) => pathname === '/',
        end: true,
    },
    {
        icon: <ClipboardList size={20} />,
        label: 'Informes Técnicos',
        to: '/reportes-tecnicos',
        match: (pathname) => pathname.startsWith('/reportes-tecnicos'),
    },
    {
        icon: <FileText size={20} />,
        label: 'Fichas Técnicas',
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
];

const DashboardLayout = ({ children }) => {
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(true);
    const isNestedLayout = useContext(DashboardLayoutContext);
    const location = useLocation();

    if (isNestedLayout) {
        return children ?? <Outlet />;
    }

    return (
        <DashboardLayoutContext.Provider value={true}>
            <div className="flex h-screen w-full bg-neutral-950 text-neutral-200 font-sans selection:bg-white selection:text-black overflow-hidden">

                <aside
                    style={{ viewTransitionName: 'dashboard-sidebar' }}
                    className={`${isSidebarCollapsed ? 'w-16' : 'w-64'
                        } bg-black border-r border-neutral-800 flex flex-col transition-all duration-300 relative z-50`}
                >
                    <div className="h-14 flex items-center justify-center border-b border-neutral-800">
                        <div className="flex items-center gap-2 font-mono tracking-tighter">
                            <PomodoroTimer />
                        </div>
                    </div>

                    <nav className="flex-1 py-6 flex flex-col gap-2 px-2">
                        {navItems.map((item, index) => {
                            const isActive = item.match(location.pathname);

                            return (
                                <NavLink
                                    key={index}
                                    to={item.to}
                                    end={item.end}
                                    className={`flex items-center gap-3 p-3 rounded-md transition-all group relative
                                        ${isActive
                                            ? 'bg-neutral-900/100 text-white shadow-[0_0_15px_rgba(255,255,255,0.1)] border border-neutral-800'
                                            : 'text-neutral-500 hover:text-white hover:bg-neutral-900'
                                        }
                                    `}
                                    title={isSidebarCollapsed ? item.label : ''}
                                >
                                    <div className={`${isActive ? 'text-white' : 'text-neutral-500 group-hover:text-white'}`}>
                                        {item.icon}
                                    </div>

                                    {!isSidebarCollapsed && (
                                        <span className="text-sm font-medium tracking-wide">{item.label}</span>
                                    )}

                                    {isActive && (
                                        <div className="absolute left-0 w-1 h-full bg-white rounded-r shadow-[0_0_10px_white]"></div>
                                    )}
                                </NavLink>
                            );
                        })}
                    </nav>

                    <div className="p-2 border-t border-neutral-800">
                        <button
                            onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
                            className="w-full flex items-center justify-center p-2 rounded-md hover:bg-neutral-900 text-neutral-500 hover:text-white transition-colors"
                        >
                            {isSidebarCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
                        </button>
                    </div>
                </aside>

                <div style={{ viewTransitionName: 'dashboard-content' }} className="flex-1 flex flex-col h-full overflow-hidden bg-neutral-950 relative">
                    <header className="h-14 min-h-[3.5rem] bg-neutral-950/80 backdrop-blur-md border-b border-neutral-800 flex items-center justify-between px-6 sticky top-0 z-40">
                        <div className="flex items-center gap-4">
                        </div>

                        <div className="flex items-center gap-4">
                            <div className="w-8 h-8 rounded-full bg-neutral-900 border border-neutral-800 flex items-center justify-center text-xs font-bold text-white">
                                OP
                            </div>
                        </div>
                    </header>

                    <main className="flex-1 overflow-auto relative bg-[radial-gradient(#1a1a1a_1px,transparent_1px)] [background-size:20px_20px]">
                        <div className="absolute inset-0 bg-neutral-950/50 pointer-events-none"></div>
                        <div className="relative z-10 w-full h-full">
                            {children ?? <Outlet />}
                        </div>
                    </main>

                </div>
            </div>
        </DashboardLayoutContext.Provider>
    );
};

export default DashboardLayout;
