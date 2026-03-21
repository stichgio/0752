import React, { ReactNode, useState } from 'react';

interface StepProps {
    number: string;
    title: string;
    children: ReactNode;
    disabled?: boolean;
    icon?: ReactNode;
    defaultCollapsed?: boolean;
}

/**
 * Componente Step para el wizard de pasos en el sidebar
 * Soporta colapsar/expandir cada seccion al hacer click en el header
 */
const Step: React.FC<StepProps> = ({ number, title, children, disabled = false, icon, defaultCollapsed = false }) => {
    const [collapsed, setCollapsed] = useState(defaultCollapsed);

    return (
        <div className={`transition-opacity duration-300 ${disabled ? 'opacity-30 pointer-events-none' : 'opacity-100'}`}>
            <div
                className="flex items-center gap-2 mb-3 text-neutral-300 cursor-pointer select-none"
                onClick={() => setCollapsed(prev => !prev)}
            >
                <span
                    className="text-neutral-500 text-[10px] w-3 flex-shrink-0 transition-transform duration-200"
                    style={{ transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)', display: 'inline-block' }}
                >
                    &#9660;
                </span>
                <div className="w-6 h-6 rounded-full bg-white text-black flex items-center justify-center font-bold text-xs ring-2 ring-black">
                    {number}
                </div>
                <h3 className="font-bold text-sm tracking-wide uppercase flex items-center gap-2">
                    {icon} {title}
                </h3>
            </div>
            <div
                className="pl-8 overflow-hidden transition-all duration-200"
                style={{
                    maxHeight: collapsed ? '0px' : '2000px',
                    opacity: collapsed ? 0 : 1,
                    marginBottom: collapsed ? 0 : undefined,
                }}
            >
                {children}
            </div>
        </div>
    );
};

export default Step;
