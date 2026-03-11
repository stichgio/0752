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
} from 'lucide-react';
import PomodoroTimer from '../PomodoroTimer';

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
        label: 'Formato D',
        to: '/formato-d',
        match: (pathname) => pathname.startsWith('/formato-d'),
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
                            const isActive = item.match(location.pathname);

                            return (
                                <NavLink
                                    key={index}
                                    to={item.to}
                                    end={item.end}
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

export default DashboardLayout;

