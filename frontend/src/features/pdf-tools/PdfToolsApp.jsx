import { useState, useEffect } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Layers, Shuffle, Scissors, LayoutGrid, FileOutput } from 'lucide-react';
import DashboardLayout from '../../components/layout/DashboardLayout';
import MergeInterleavedTab from './tabs/MergeInterleavedTab';
import MergeNormalTab from './tabs/MergeNormalTab';
import SplitTab from './tabs/SplitTab';
import OrganizeTab from './tabs/OrganizeTab';
import ExtractTab from './tabs/ExtractTab';

const TABS = [
    { id: 'merge', label: 'Merge Intercalado', icon: Shuffle, component: MergeInterleavedTab },
    { id: 'merge-normal', label: 'Merge Normal', icon: Layers, component: MergeNormalTab },
    { id: 'split', label: 'Split PDF', icon: Scissors, component: SplitTab },
    { id: 'organize', label: 'Organizar', icon: LayoutGrid, component: OrganizeTab },
    { id: 'extract', label: 'Extraer', icon: FileOutput, component: ExtractTab },
];

const WORKSPACE_WIDTH = 'w-full max-w-[1380px]';

function getRequestedTab(searchParams, hash) {
    const queryTab = (searchParams.get('tab') || '').toLowerCase();
    const hashTab = (hash || '').replace('#', '').toLowerCase();
    const requested = queryTab || hashTab;
    const match = TABS.find((tab) => tab.id === requested);
    return match ? match.id : TABS[0].id;
}

export default function PdfToolsApp() {
    const location = useLocation();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const activeTab = getRequestedTab(searchParams, location.hash);

    const setActiveTab = (newTab) => {
        if (newTab === activeTab) return;
        const nextParams = new URLSearchParams(searchParams);
        nextParams.set('tab', newTab);

        navigate(
            {
                pathname: location.pathname,
                search: `?${nextParams.toString()}`,
                hash: location.hash,
            },
            { replace: true },
        );
    };

    useEffect(() => {
        const currentQueryTab = (searchParams.get('tab') || '').toLowerCase();
        if (currentQueryTab !== activeTab) {
            const nextParams = new URLSearchParams(searchParams);
            nextParams.set('tab', activeTab);
            navigate(
                {
                    pathname: location.pathname,
                    search: `?${nextParams.toString()}`,
                    hash: location.hash,
                },
                { replace: true },
            );
        }
    }, [activeTab, location.hash, location.pathname, navigate, searchParams]);

    const ActiveComponent = TABS.find((tab) => tab.id === activeTab)?.component;

    return (
        <DashboardLayout>
            <div className="h-full flex flex-col">
                <div className="px-4 md:px-8 xl:px-12 pt-6 pb-0">
                    <div className={`${WORKSPACE_WIDTH} mx-auto`}>
                        <div className="flex items-center justify-between mb-6">
                            <div>
                                <h1 className="text-4xl font-bold tracking-tight text-white font-[DotGothic16]">
                                    PDF TOOLS
                                </h1>
                                <p className="text-base text-neutral-500 mt-1 font-mono">
                                    Merge &middot; Split &middot; Organize &middot; Extract
                                </p>
                            </div>

                            <div className="hidden sm:flex items-center gap-2">
                                <div className="w-8 h-px bg-neutral-700" />
                                <div className="w-2 h-2 rounded-full bg-red-500 shadow-[0_0_8px_rgba(215,25,33,0.5)]" />
                            </div>
                        </div>

                        <div className="flex gap-0.5 border-b border-neutral-800/60 overflow-x-auto scrollbar-none">
                            {TABS.map((tab) => {
                                const isActive = activeTab === tab.id;
                                const Icon = tab.icon;
                                return (
                                    <button
                                        key={tab.id}
                                        onClick={() => setActiveTab(tab.id)}
                                        className={`
                                            relative flex items-center gap-2 px-4 py-3.5 text-base font-medium
                                            transition-all duration-200 whitespace-nowrap
                                            ${isActive
                                                ? 'text-white'
                                                : 'text-neutral-500 hover:text-neutral-300 hover:bg-neutral-900/40'
                                            }
                                        `}
                                    >
                                        <Icon size={16} className={isActive ? 'text-white' : ''} />
                                        <span className="hidden sm:inline">{tab.label}</span>
                                        {isActive && (
                                            <motion.div
                                                layoutId="tab-indicator"
                                                className="absolute bottom-0 left-0 right-0 h-[2px] bg-white shadow-[0_0_8px_rgba(255,255,255,0.3)]"
                                                transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                                            />
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>

                <div className="flex-1 overflow-auto px-4 md:px-8 xl:px-12 py-6">
                    <div className={`${WORKSPACE_WIDTH} mx-auto min-h-[calc(100vh-12rem)]`}>
                        <AnimatePresence mode="wait">
                            <motion.div
                                key={activeTab}
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -8 }}
                                transition={{ duration: 0.2 }}
                                className="min-h-full"
                            >
                                {ActiveComponent && <ActiveComponent />}
                            </motion.div>
                        </AnimatePresence>
                    </div>
                </div>
            </div>
        </DashboardLayout>
    );
}
