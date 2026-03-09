import React from 'react';
import {
  AlignLeft,
  AlignCenter,
  AlignRight,
  Bold,
  Minus,
  Plus,
} from 'lucide-react';
import { TemplateElement, ElementStyle } from '../canvasTypes';

const TEXT_ELEMENT_TYPES = new Set(['text', 'heading', 'variable']);

const FONT_FAMILIES = [
  'Arial',
  'Helvetica',
  'Times New Roman',
  'Courier New',
  'Georgia',
  'monospace',
] as const;

export interface TextFormatToolbarProps {
  element: TemplateElement;
  onUpdate: (patch: Partial<TemplateElement>) => void;
}

export const TextFormatToolbar = React.memo(function TextFormatToolbar({
  element,
  onUpdate,
}: TextFormatToolbarProps) {
  if (!TEXT_ELEMENT_TYPES.has(element.type)) return null;

  const style = element.style;

  const updateStyle = (updates: Partial<ElementStyle>) => {
    onUpdate({ style: { ...style, ...updates } });
  };

  const isBold = style.fontWeight === 'bold' || style.fontWeight === '700' || style.fontWeight === '800' || style.fontWeight === '900';

  const handleBoldToggle = () => {
    updateStyle({ fontWeight: isBold ? 'normal' : 'bold' });
  };

  const handleFontSizeDecrease = () => {
    const current = style.fontSize ?? 12;
    updateStyle({ fontSize: Math.max(6, current - 1) });
  };

  const handleFontSizeIncrease = () => {
    const current = style.fontSize ?? 12;
    updateStyle({ fontSize: Math.min(120, current + 1) });
  };

  const handleFontSizeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value, 10);
    if (!Number.isNaN(val) && val >= 6 && val <= 120) {
      updateStyle({ fontSize: val });
    }
  };

  const currentAlign = style.textAlign || 'left';
  const currentColor = style.color || '#000000';
  const currentFontFamily = style.fontFamily || 'Arial';
  const currentFontSize = style.fontSize ?? 12;

  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-md px-2 py-1.5 flex items-center gap-1">
      {/* Bold toggle */}
      <FormatBtn
        onClick={handleBoldToggle}
        active={isBold}
        title="Negrita"
      >
        <Bold size={14} />
      </FormatBtn>

      <ToolbarDivider />

      {/* Text align */}
      <FormatBtn
        onClick={() => updateStyle({ textAlign: 'left' })}
        active={currentAlign === 'left'}
        title="Alinear a la izquierda"
      >
        <AlignLeft size={14} />
      </FormatBtn>
      <FormatBtn
        onClick={() => updateStyle({ textAlign: 'center' })}
        active={currentAlign === 'center'}
        title="Centrar texto"
      >
        <AlignCenter size={14} />
      </FormatBtn>
      <FormatBtn
        onClick={() => updateStyle({ textAlign: 'right' })}
        active={currentAlign === 'right'}
        title="Alinear a la derecha"
      >
        <AlignRight size={14} />
      </FormatBtn>

      <ToolbarDivider />

      {/* Font size */}
      <button
        type="button"
        onClick={handleFontSizeDecrease}
        title="Reducir tamaño de fuente"
        className="p-1.5 rounded hover:bg-gray-100 text-gray-600 hover:text-gray-900 transition-colors"
      >
        <Minus size={12} />
      </button>
      <input
        type="number"
        value={currentFontSize}
        onChange={handleFontSizeChange}
        min={6}
        max={120}
        title="Tamaño de fuente"
        className="w-12 text-center text-sm border border-gray-200 rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-400"
      />
      <button
        type="button"
        onClick={handleFontSizeIncrease}
        title="Aumentar tamaño de fuente"
        className="p-1.5 rounded hover:bg-gray-100 text-gray-600 hover:text-gray-900 transition-colors"
      >
        <Plus size={12} />
      </button>

      <ToolbarDivider />

      {/* Text color */}
      <input
        type="color"
        value={currentColor.startsWith('#') ? currentColor : '#000000'}
        onChange={(e) => updateStyle({ color: e.target.value })}
        title="Color de texto"
        className="w-6 h-6 rounded cursor-pointer border border-gray-200 p-0"
        style={{ appearance: 'none', WebkitAppearance: 'none' }}
      />

      <ToolbarDivider />

      {/* Font family */}
      <select
        value={currentFontFamily}
        onChange={(e) => updateStyle({ fontFamily: e.target.value })}
        title="Familia tipográfica"
        className="h-6 text-xs border border-gray-200 rounded px-1 focus:outline-none focus:ring-1 focus:ring-blue-400 text-gray-700 bg-white"
      >
        {FONT_FAMILIES.map((f) => (
          <option key={f} value={f}>
            {f}
          </option>
        ))}
      </select>
    </div>
  );
});

function ToolbarDivider() {
  return <div className="w-px h-5 bg-gray-200 mx-1" />;
}

function FormatBtn({
  children,
  onClick,
  active,
  title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  active: boolean;
  title: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`p-1.5 rounded transition-colors ${
        active
          ? 'bg-blue-100 text-blue-700'
          : 'text-gray-600 hover:bg-gray-100'
      }`}
    >
      {children}
    </button>
  );
}
