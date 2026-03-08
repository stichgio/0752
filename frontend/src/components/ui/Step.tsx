import React, { ReactNode } from 'react';

interface StepProps {
    number: string;
    title: string;
    children: ReactNode;
    disabled?: boolean;
    icon?: ReactNode;
}

/**
 * Componente Step para el wizard de pasos en el sidebar
 */
const Step: React.FC<StepProps> = ({ number, title, children, disabled = false, icon }) => (
    <div className={`transition-opacity duration-300 ${disabled ? 'opacity-30 pointer-events-none' : 'opacity-100'}`}>
        <div className="flex items-center gap-2 mb-3 text-neutral-300">
            <div className="w-6 h-6 rounded-full bg-white text-black flex items-center justify-center font-bold text-xs ring-2 ring-black">
                {number}
            </div>
            <h3 className="font-bold text-sm tracking-wide uppercase flex items-center gap-2">
                {icon} {title}
            </h3>
        </div>
        <div className="pl-8">
            {children}
        </div>
    </div>
);

export default Step;
