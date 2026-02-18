import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { FileText, Ruler } from 'lucide-react';
import type { PageOrientation, PageSettings } from '../canvasTypes';

interface PageControlsProps {
    pageSettings: PageSettings;
    onChange: (settings: PageSettings) => void;
}

type PresetOption = 'A4' | 'Letter' | 'Legal';

const PRESET_SIZES: Record<PresetOption, { width: number; height: number }> = {
    A4: { width: 210, height: 297 },
    Letter: { width: 216, height: 279 },
    Legal: { width: 216, height: 356 },
};

const COLLAPSE_DELAY_MS = 180;

function getPresetSize(format: PresetOption, orientation: PageOrientation) {
    const base = PRESET_SIZES[format];
    if (orientation === 'landscape') {
        return { width: base.height, height: base.width };
    }
    return base;
}

function isSameSize(a: number, b: number, expectedA: number, expectedB: number): boolean {
    return Math.abs(a - expectedA) < 1 && Math.abs(b - expectedB) < 1;
}

function resolveFormatValue(pageSettings: PageSettings): PresetOption | 'Custom' {
    if (pageSettings.format === 'A4' || pageSettings.format === 'Letter') {
        return pageSettings.format;
    }

    const legalPortrait = PRESET_SIZES.Legal;
    const legalLandscape = { width: legalPortrait.height, height: legalPortrait.width };
    if (
        isSameSize(pageSettings.width, pageSettings.height, legalPortrait.width, legalPortrait.height) ||
        isSameSize(pageSettings.width, pageSettings.height, legalLandscape.width, legalLandscape.height)
    ) {
        return 'Legal';
    }
    return 'Custom';
}

function NumberField({
    label,
    value,
    onChange,
    onMouseDown,
}: {
    label: string;
    value: number;
    onChange: (value: number) => void;
    onMouseDown: React.MouseEventHandler<HTMLElement>;
}) {
    return (
        <label className="flex items-center h-8 bg-white border border-neutral-200 rounded-lg overflow-hidden focus-within:ring-1 focus-within:ring-violet-400">
            <span className="text-[10px] font-semibold text-neutral-500 px-2 select-none">{label}</span>
            <input
                type="number"
                value={Math.round(value * 100) / 100}
                onChange={(e) => onChange(Number(e.target.value))}
                onMouseDown={onMouseDown}
                min={0}
                step={0.5}
                className="w-full h-full bg-transparent text-xs text-neutral-700 px-1 focus:outline-none appearance-textfield"
                style={{ MozAppearance: 'textfield' } as any}
            />
            <span className="text-[9px] text-neutral-400 pr-2 select-none">mm</span>
        </label>
    );
}

export function PageControls({ pageSettings, onChange }: PageControlsProps) {
    const [expanded, setExpanded] = useState(false);
    const collapseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        return () => {
            if (collapseTimer.current) {
                clearTimeout(collapseTimer.current);
            }
        };
    }, []);

    const stopMouseDown: React.MouseEventHandler<HTMLElement> = (e) => {
        e.stopPropagation();
    };

    const formatValue = resolveFormatValue(pageSettings);
    const summary = useMemo(() => {
        const base = formatValue === 'Custom' ? `${Math.round(pageSettings.width)}x${Math.round(pageSettings.height)}` : formatValue;
        const orientation = pageSettings.orientation === 'portrait' ? 'V' : 'H';
        return `${base} - ${orientation}`;
    }, [formatValue, pageSettings.width, pageSettings.height, pageSettings.orientation]);

    const handleMouseEnter = () => {
        if (collapseTimer.current) clearTimeout(collapseTimer.current);
        setExpanded(true);
    };

    const handleMouseLeave = () => {
        if (collapseTimer.current) clearTimeout(collapseTimer.current);
        collapseTimer.current = setTimeout(() => setExpanded(false), COLLAPSE_DELAY_MS);
    };

    const handleFormatChange = (value: string) => {
        if (value === 'Custom') {
            onChange({ ...pageSettings, format: 'Custom' });
            return;
        }
        const preset = value as PresetOption;
        const size = getPresetSize(preset, pageSettings.orientation);
        onChange({
            ...pageSettings,
            format: preset === 'Legal' ? 'Custom' : preset,
            width: size.width,
            height: size.height,
        });
    };

    const handleOrientationChange = (next: PageOrientation) => {
        if (next === pageSettings.orientation) return;
        onChange({
            ...pageSettings,
            orientation: next,
            width: pageSettings.height,
            height: pageSettings.width,
        });
    };

    const handleMarginChange = (side: 'top' | 'right' | 'bottom' | 'left', value: number) => {
        const safeValue = Number.isFinite(value) ? Math.max(0, value) : 0;
        onChange({
            ...pageSettings,
            margins: {
                ...pageSettings.margins,
                [side]: safeValue,
            },
        });
    };

    return (
        <motion.div
            layout
            initial={false}
            transition={{ type: 'spring', stiffness: 320, damping: 30 }}
            className="absolute top-4 left-1/2 -translate-x-1/2 z-40 pointer-events-auto"
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            onMouseDown={stopMouseDown}
        >
            <motion.div
                layout
                className={`bg-white/90 backdrop-blur-sm shadow-xl border border-gray-200 rounded-2xl ${expanded ? 'w-[min(44rem,calc(100vw-2rem))] px-3 py-3' : 'w-36 px-3 py-2'
                    }`}
            >
                <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                        <span className="w-7 h-7 rounded-xl bg-violet-100 text-violet-700 flex items-center justify-center shrink-0">
                            <FileText size={14} />
                        </span>
                        <div className="min-w-0">
                            <p className="text-[11px] font-semibold text-neutral-700 leading-tight">Pagina</p>
                            <p className="text-[10px] text-neutral-500 truncate">{summary}</p>
                        </div>
                    </div>
                    {!expanded && (
                        <span className="text-[10px] font-medium text-neutral-400">Hover</span>
                    )}
                </div>

                <AnimatePresence initial={false}>
                    {expanded && (
                        <motion.div
                            key="expanded"
                            initial={{ opacity: 0, y: -4 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -4 }}
                            transition={{ duration: 0.16 }}
                            className="mt-3 pt-3 border-t border-neutral-200 grid grid-cols-1 lg:grid-cols-[1.1fr_1fr_1.4fr] gap-3"
                            onMouseDown={stopMouseDown}
                        >
                            <div className="space-y-2">
                                <label className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500 block">
                                    Formato
                                </label>
                                <select
                                    value={formatValue}
                                    onChange={(e) => handleFormatChange(e.target.value)}
                                    onMouseDown={stopMouseDown}
                                    className="w-full h-8 px-2 text-xs border border-neutral-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-violet-400 bg-white"
                                >
                                    <option value="A4">A4</option>
                                    <option value="Letter">Letter</option>
                                    <option value="Legal">Legal</option>
                                    <option value="Custom">Custom</option>
                                </select>

                                <div className="grid grid-cols-2 gap-1.5">
                                    <button
                                        type="button"
                                        onMouseDown={stopMouseDown}
                                        onClick={() => handleOrientationChange('portrait')}
                                        className={`h-8 rounded-lg border text-xs font-medium transition-colors ${pageSettings.orientation === 'portrait'
                                                ? 'bg-violet-100 border-violet-200 text-violet-700'
                                                : 'bg-white border-neutral-200 text-neutral-600 hover:bg-neutral-50'
                                            }`}
                                    >
                                        Vertical
                                    </button>
                                    <button
                                        type="button"
                                        onMouseDown={stopMouseDown}
                                        onClick={() => handleOrientationChange('landscape')}
                                        className={`h-8 rounded-lg border text-xs font-medium transition-colors ${pageSettings.orientation === 'landscape'
                                                ? 'bg-violet-100 border-violet-200 text-violet-700'
                                                : 'bg-white border-neutral-200 text-neutral-600 hover:bg-neutral-50'
                                            }`}
                                    >
                                        Horizontal
                                    </button>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500 block">
                                    Tamano
                                </label>
                                <div className="grid grid-cols-1 gap-1.5">
                                    <NumberField
                                        label="W"
                                        value={pageSettings.width}
                                        onChange={(value) => onChange({ ...pageSettings, format: 'Custom', width: Math.max(1, value) })}
                                        onMouseDown={stopMouseDown}
                                    />
                                    <NumberField
                                        label="H"
                                        value={pageSettings.height}
                                        onChange={(value) => onChange({ ...pageSettings, format: 'Custom', height: Math.max(1, value) })}
                                        onMouseDown={stopMouseDown}
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <div className="flex items-center gap-1.5">
                                    <Ruler size={12} className="text-neutral-500" />
                                    <span className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Margenes</span>
                                </div>
                                <div className="grid grid-cols-2 gap-1.5">
                                    <NumberField
                                        label="Top"
                                        value={pageSettings.margins.top}
                                        onChange={(value) => handleMarginChange('top', value)}
                                        onMouseDown={stopMouseDown}
                                    />
                                    <NumberField
                                        label="Right"
                                        value={pageSettings.margins.right}
                                        onChange={(value) => handleMarginChange('right', value)}
                                        onMouseDown={stopMouseDown}
                                    />
                                    <NumberField
                                        label="Bottom"
                                        value={pageSettings.margins.bottom}
                                        onChange={(value) => handleMarginChange('bottom', value)}
                                        onMouseDown={stopMouseDown}
                                    />
                                    <NumberField
                                        label="Left"
                                        value={pageSettings.margins.left}
                                        onChange={(value) => handleMarginChange('left', value)}
                                        onMouseDown={stopMouseDown}
                                    />
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </motion.div>
        </motion.div>
    );
}

