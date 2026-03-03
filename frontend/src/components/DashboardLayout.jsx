import React, { useState } from 'react';
import {
    FileText,
    LayoutDashboard,
    Calculator,
    FileStack,
    ChevronLeft,
    ChevronRight,
    ClipboardList,
    Archive,
    Shrink,
    FileCode,
    BookOpen,
} from 'lucide-react';
import PomodoroTimer from './PomodoroTimer';

const DashboardLayout = ({ children }) => {
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(true);

    const navItems = [
        {
            icon: <LayoutDashboard size={20} />,
            label: "Reportes Fotográficos",
            href: "/",
            active: window.location.pathname === '/' || window.location.pathname.includes('index.html')
        },
        {
            icon: <ClipboardList size={20} />,
            label: "Informes Técnicos",
            href: "/technical-reports.html",
            active: window.location.pathname.includes('technical-reports')
        },
        {
            icon: <FileText size={20} />,
            label: "Fichas Técnicas",
            href: "/fichas-tecnicas.html",
            active: window.location.pathname.includes('fichas-tecnicas')
        },
        {
            icon: <Calculator size={20} />,
            label: "Calculadora",
            href: "/calculator.html",
            active: window.location.pathname.includes('calculator')
        },
        {
            icon: <FileStack size={20} />,
            label: "PDF Tools",
            href: "/pdf-tools.html",
            active: window.location.pathname.includes('pdf-tools')
        },
        {
            icon: <Archive size={20} />,
            label: "Compresor",
            href: "/compressor.html",
            active: window.location.pathname.includes('compressor')
        },
        {
            icon: <Shrink size={20} />,
            label: "Optimizador Imagenes",
            href: "/image-optimizer.html",
            active: window.location.pathname.includes('image-optimizer')
        },
        {
            icon: <FileCode size={20} />,
            label: "Template Editor",
            href: "/template-editor.html",
            active: window.location.pathname.includes('template-editor')
        },
        {
            icon: <BookOpen size={20} />,
            label: "Informe Multi-Hoja",
            href: "/multi-sheet-report.html",
            active: window.location.pathname.includes('multi-sheet-report')
        },
    ];

    return (
        <div className="flex h-screen w-full bg-neutral-950 text-neutral-200 font-sans selection:bg-white selection:text-black overflow-hidden">

            {/* Navigation Sidebar */}
            <aside
                className={`${isSidebarCollapsed ? 'w-16' : 'w-64'
                    } bg-black border-r border-neutral-800 flex flex-col transition-all duration-300 relative z-50`}
            >
                {/* Brand / Logo */}
                <div className="h-14 flex items-center justify-center border-b border-neutral-800">
                    <div className="flex items-center gap-2 font-mono tracking-tighter">
                        <PomodoroTimer />
                    </div>
                </div>

                {/* Navigation Items */}
                <nav className="flex-1 py-6 flex flex-col gap-2 px-2">
                    {navItems.map((item, index) => (
                        <a
                            key={index}
                            href={item.href}
                            className={`flex items-center gap-3 p-3 rounded-md transition-all group relative
                                ${item.active
                                    ? 'bg-neutral-900/100 text-white shadow-[0_0_15px_rgba(255,255,255,0.1)] border border-neutral-800'
                                    : 'text-neutral-500 hover:text-white hover:bg-neutral-900'
                                }
                            `}
                            title={isSidebarCollapsed ? item.label : ''}
                        >
                            <div className={`${item.active ? 'text-white' : 'text-neutral-500 group-hover:text-white'}`}>
                                {item.icon}
                            </div>

                            {!isSidebarCollapsed && (
                                <span className="text-sm font-medium tracking-wide">{item.label}</span>
                            )}

                            {/* Dot Matrix Accent for Active State */}
                            {item.active && (
                                <div className="absolute left-0 w-1 h-full bg-white rounded-r shadow-[0_0_10px_white]"></div>
                            )}
                        </a>
                    ))}
                </nav>

                {/* Bottom Actions */}
                <div className="p-2 border-t border-neutral-800">
                    <button
                        onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
                        className="w-full flex items-center justify-center p-2 rounded-md hover:bg-neutral-900 text-neutral-500 hover:text-white transition-colors"
                    >
                        {isSidebarCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
                    </button>
                </div>
            </aside>

            {/* Main Content Area */}
            <div className="flex-1 flex flex-col h-full overflow-hidden bg-neutral-950 relative">

                {/* Top Header */}
                <header className="h-14 min-h-[3.5rem] bg-neutral-950/80 backdrop-blur-md border-b border-neutral-800 flex items-center justify-between px-6 sticky top-0 z-40">

                    {/* Breadcrumbs / Context */}
                    <div className="flex items-center gap-4">
                    </div>

                    {/* Global Search & Tools */}
                    <div className="flex items-center gap-4">


                        <div className="w-8 h-8 rounded-full bg-neutral-900 border border-neutral-800 flex items-center justify-center text-xs font-bold text-white">
                            OP
                        </div>
                    </div>
                </header>

                {/* Workspace */}
                <main className="flex-1 overflow-auto relative bg-[radial-gradient(#1a1a1a_1px,transparent_1px)] [background-size:20px_20px]">
                    <div className="absolute inset-0 bg-neutral-950/50 pointer-events-none"></div>
                    <div className="relative z-10 w-full h-full">
                        {children}
                    </div>
                </main>

            </div>
        </div>
    );
};

export default DashboardLayout;
