import React from 'react';
import { PageSettings, PageOrientation } from '../canvasTypes';
import { FileText, Ruler } from 'lucide-react';

interface PageSettingsPanelProps {
  width?: number;
  pageSettings: PageSettings;
  onChange: (settings: PageSettings) => void;
}

type PresetOption = 'A4' | 'Letter' | 'Legal';

const PRESET_SIZES: Record<PresetOption, { width: number; height: number }> = {
  A4: { width: 210, height: 297 },
  Letter: { width: 216, height: 279 },
  Legal: { width: 216, height: 356 },
};

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

function NumericInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="flex items-center h-7 bg-neutral-50 border border-neutral-200 rounded-md overflow-hidden focus-within:ring-1 focus-within:ring-violet-400">
      <span className="text-[10px] font-semibold text-neutral-400 px-1.5 select-none">{label}</span>
      <input
        type="number"
        value={Math.round(value * 100) / 100}
        onChange={(e) => onChange(Number(e.target.value))}
        min={0}
        step={0.5}
        className="w-full h-full bg-transparent text-xs text-neutral-700 px-0.5 focus:outline-none appearance-textfield"
        style={{ MozAppearance: 'textfield' } as any}
      />
      <span className="text-[9px] text-neutral-400 pr-1.5 select-none">mm</span>
    </div>
  );
}

export function PageSettingsPanel({ width = 260, pageSettings, onChange }: PageSettingsPanelProps) {
  const formatValue = resolveFormatValue(pageSettings);

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
    <div className="h-full flex-none border-l border-neutral-200 bg-white flex flex-col overflow-y-auto" style={{ width }}>
      <div className="px-3 py-2.5 border-b border-neutral-100 flex items-center gap-2">
        <FileText size={14} className="text-neutral-400" />
        <h2 className="text-sm font-semibold text-neutral-700">Pagina</h2>
      </div>

      <div className="px-3 py-3 border-b border-neutral-100 space-y-3">
        <div>
          <label className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400 block mb-1.5">
            Formato
          </label>
          <select
            value={formatValue}
            onChange={(e) => handleFormatChange(e.target.value)}
            className="w-full h-7 px-2 text-xs border border-neutral-200 rounded-md focus:outline-none focus:ring-1 focus:ring-violet-400 bg-white"
          >
            <option value="A4">A4</option>
            <option value="Letter">Letter</option>
            <option value="Legal">Legal</option>
            <option value="Custom">Custom</option>
          </select>
        </div>

        <div>
          <label className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400 block mb-1.5">
            Orientacion
          </label>
          <div className="grid grid-cols-2 gap-1.5">
            <button
              onClick={() => handleOrientationChange('portrait')}
              className={`h-7 rounded-md border text-xs font-medium transition-colors ${
                pageSettings.orientation === 'portrait'
                  ? 'bg-violet-100 border-violet-200 text-violet-700'
                  : 'bg-neutral-50 border-neutral-200 text-neutral-600 hover:bg-neutral-100'
              }`}
            >
              Vertical
            </button>
            <button
              onClick={() => handleOrientationChange('landscape')}
              className={`h-7 rounded-md border text-xs font-medium transition-colors ${
                pageSettings.orientation === 'landscape'
                  ? 'bg-violet-100 border-violet-200 text-violet-700'
                  : 'bg-neutral-50 border-neutral-200 text-neutral-600 hover:bg-neutral-100'
              }`}
            >
              Horizontal
            </button>
          </div>
        </div>

        <div>
          <label className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400 block mb-1.5">
            Tamano final
          </label>
          <div className="grid grid-cols-2 gap-1.5">
            <NumericInput
              label="W"
              value={pageSettings.width}
              onChange={(value) => onChange({ ...pageSettings, format: 'Custom', width: Math.max(1, value) })}
            />
            <NumericInput
              label="H"
              value={pageSettings.height}
              onChange={(value) => onChange({ ...pageSettings, format: 'Custom', height: Math.max(1, value) })}
            />
          </div>
        </div>
      </div>

      <div className="px-3 py-3 border-b border-neutral-100 space-y-2">
        <div className="flex items-center gap-1.5">
          <Ruler size={10} className="text-neutral-400" />
          <span className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400">Margenes</span>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          <NumericInput
            label="Top"
            value={pageSettings.margins.top}
            onChange={(value) => handleMarginChange('top', value)}
          />
          <NumericInput
            label="Right"
            value={pageSettings.margins.right}
            onChange={(value) => handleMarginChange('right', value)}
          />
          <NumericInput
            label="Bottom"
            value={pageSettings.margins.bottom}
            onChange={(value) => handleMarginChange('bottom', value)}
          />
          <NumericInput
            label="Left"
            value={pageSettings.margins.left}
            onChange={(value) => handleMarginChange('left', value)}
          />
        </div>
      </div>
    </div>
  );
}
