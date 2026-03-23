import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Palette, Plus, Trash2, Type } from 'lucide-react';
import { generateId, type ColorToken, type DocumentTheme, type TextStyleToken } from '../../canvasTypes';

type SafeTheme = Required<DocumentTheme>;

interface AppearanceSectionProps {
  theme?: DocumentTheme;
  onThemeChange: (theme: DocumentTheme) => void;
}

const FONT_WEIGHT_OPTIONS: TextStyleToken['style']['fontWeight'][] = [
  '400', '500', '600', '700', '800', '900',
];

function ensureTheme(theme: DocumentTheme | undefined): SafeTheme {
  return {
    textStyles: Array.isArray(theme?.textStyles) ? theme.textStyles : [],
    colorTokens: Array.isArray(theme?.colorTokens) ? theme.colorTokens : [],
  };
}

export function AppearanceSection({ theme, onThemeChange }: AppearanceSectionProps) {
  const [colorsExpanded, setColorsExpanded] = useState(true);
  const [textExpanded, setTextExpanded] = useState(false);
  const [editingColorId, setEditingColorId] = useState<string | null>(null);
  const [editingTextId, setEditingTextId] = useState<string | null>(null);

  const safe = ensureTheme(theme);

  const updateColors = (updater: (prev: ColorToken[]) => ColorToken[]) => {
    onThemeChange({ ...safe, colorTokens: updater(safe.colorTokens) });
  };

  const updateTextStyles = (updater: (prev: TextStyleToken[]) => TextStyleToken[]) => {
    onThemeChange({ ...safe, textStyles: updater(safe.textStyles) });
  };

  const addColor = () => {
    updateColors((prev) => [
      ...prev,
      { id: generateId(), label: `Color ${prev.length + 1}`, value: '#6d28d9' },
    ]);
  };

  const addTextStyle = () => {
    updateTextStyles((prev) => [
      ...prev,
      {
        id: generateId(),
        label: `Estilo ${prev.length + 1}`,
        style: { fontSize: 12, fontFamily: 'Arial', fontWeight: '600', color: '#111827', lineHeight: 1.2 },
      },
    ]);
  };

  return (
    <div className="space-y-3">
      {/* Colors */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <button
            type="button"
            onClick={() => setColorsExpanded((v) => !v)}
            className="flex items-center gap-1.5 text-[11px] font-semibold text-neutral-600 hover:text-neutral-800"
          >
            <Palette size={12} className="text-neutral-400" />
            Colores
            <span className="rounded-full bg-neutral-200 px-1.5 py-px text-[10px] text-neutral-500">
              {safe.colorTokens.length}
            </span>
            {colorsExpanded ? <ChevronUp size={11} className="text-neutral-400" /> : <ChevronDown size={11} className="text-neutral-400" />}
          </button>
          <button
            type="button"
            onClick={addColor}
            className="flex items-center gap-1 rounded-lg border border-neutral-200 bg-white px-2 py-1 text-[10px] font-semibold text-neutral-600 hover:bg-neutral-50"
          >
            <Plus size={10} /> Color
          </button>
        </div>

        {colorsExpanded && (
          safe.colorTokens.length === 0 ? (
            <EmptyTokens label="Sin colores guardados." />
          ) : (
            <div className="space-y-1.5">
              {/* Swatch grid */}
              <div className="flex flex-wrap gap-1.5">
                {safe.colorTokens.map((token) => (
                  <button
                    key={token.id}
                    type="button"
                    onClick={() => setEditingColorId(editingColorId === token.id ? null : token.id)}
                    className="group relative flex flex-col items-center gap-0.5"
                    title={token.label}
                  >
                    <span
                      className="block h-8 w-8 rounded-lg border-2 border-white shadow-sm ring-1 ring-neutral-200 group-hover:ring-violet-300 transition-all"
                      style={{ backgroundColor: token.value }}
                    />
                    <span className="max-w-[32px] truncate text-[9px] text-neutral-400 leading-none">
                      {token.label}
                    </span>
                  </button>
                ))}
              </div>

              {/* Edición inline del token seleccionado */}
              {editingColorId && (() => {
                const idx = safe.colorTokens.findIndex((t) => t.id === editingColorId);
                const token = safe.colorTokens[idx];
                if (!token) return null;
                return (
                  <div className="rounded-xl border border-violet-200 bg-violet-50/40 p-2 space-y-1.5">
                    <div className="grid grid-cols-[auto_1fr_auto] gap-2 items-center">
                      <input
                        type="color"
                        value={token.value}
                        onChange={(e) =>
                          updateColors((prev) =>
                            prev.map((t, i) => (i === idx ? { ...t, value: e.target.value } : t))
                          )
                        }
                        className="h-8 w-8 cursor-pointer rounded border border-neutral-300 p-0"
                      />
                      <input
                        value={token.label}
                        onChange={(e) =>
                          updateColors((prev) =>
                            prev.map((t, i) => (i === idx ? { ...t, label: e.target.value } : t))
                          )
                        }
                        placeholder="Etiqueta"
                        className="h-7 w-full rounded-lg border border-neutral-200 bg-white px-2 text-[11px] text-neutral-700 outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setEditingColorId(null);
                          updateColors((prev) => prev.filter((_, i) => i !== idx));
                        }}
                        className="h-7 w-7 flex items-center justify-center rounded-lg border border-neutral-200 text-neutral-400 hover:border-red-200 hover:text-red-500"
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>
                    <input
                      value={token.value}
                      onChange={(e) =>
                        updateColors((prev) =>
                          prev.map((t, i) => (i === idx ? { ...t, value: e.target.value } : t))
                        )
                      }
                      placeholder="#111827"
                      className="h-7 w-full rounded-lg border border-neutral-200 bg-white px-2 text-[11px] font-mono text-neutral-700 outline-none"
                    />
                  </div>
                );
              })()}
            </div>
          )
        )}
      </div>

      {/* Text styles */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <button
            type="button"
            onClick={() => setTextExpanded((v) => !v)}
            className="flex items-center gap-1.5 text-[11px] font-semibold text-neutral-600 hover:text-neutral-800"
          >
            <Type size={12} className="text-neutral-400" />
            Estilos de texto
            <span className="rounded-full bg-neutral-200 px-1.5 py-px text-[10px] text-neutral-500">
              {safe.textStyles.length}
            </span>
            {textExpanded ? <ChevronUp size={11} className="text-neutral-400" /> : <ChevronDown size={11} className="text-neutral-400" />}
          </button>
          <button
            type="button"
            onClick={addTextStyle}
            className="flex items-center gap-1 rounded-lg border border-neutral-200 bg-white px-2 py-1 text-[10px] font-semibold text-neutral-600 hover:bg-neutral-50"
          >
            <Plus size={10} /> Estilo
          </button>
        </div>

        {textExpanded && (
          safe.textStyles.length === 0 ? (
            <EmptyTokens label="Sin estilos de texto guardados." />
          ) : (
            <div className="space-y-1.5">
              {/* Preset cards */}
              <div className="space-y-1.5">
                {safe.textStyles.map((token, idx) => (
                  <div key={token.id} className="rounded-xl border border-neutral-200 bg-white overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setEditingTextId(editingTextId === token.id ? null : token.id)}
                      className="flex w-full items-center gap-2 px-3 py-2 hover:bg-neutral-50 transition-colors"
                    >
                      {/* Aa preview */}
                      <span
                        className="shrink-0 leading-none text-neutral-800"
                        style={{
                          fontSize: Math.min(18, Math.max(10, (token.style.fontSize || 12) * 0.9)),
                          fontFamily: token.style.fontFamily || 'Arial',
                          fontWeight: token.style.fontWeight || '600',
                          color: token.style.color || '#111827',
                        }}
                      >
                        Aa
                      </span>
                      <span className="flex-1 truncate text-left text-[11px] font-semibold text-neutral-700">
                        {token.label}
                      </span>
                      <span className="text-[10px] text-neutral-400">
                        {token.style.fontSize}px · {token.style.fontWeight}
                      </span>
                    </button>

                    {editingTextId === token.id && (
                      <div className="border-t border-neutral-100 px-3 py-2 space-y-1.5">
                        <div className="grid grid-cols-[1fr_auto] gap-1.5">
                          <input
                            value={token.label}
                            onChange={(e) =>
                              updateTextStyles((prev) =>
                                prev.map((t, i) => (i === idx ? { ...t, label: e.target.value } : t))
                              )
                            }
                            placeholder="Etiqueta"
                            className="h-7 rounded-lg border border-neutral-200 bg-neutral-50 px-2 text-[11px] text-neutral-700 outline-none"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              updateTextStyles((prev) => prev.filter((_, i) => i !== idx))
                            }
                            className="h-7 w-7 flex items-center justify-center rounded-lg border border-neutral-200 text-neutral-400 hover:border-red-200 hover:text-red-500"
                          >
                            <Trash2 size={11} />
                          </button>
                        </div>
                        <div className="grid grid-cols-2 gap-1.5">
                          <MiniField
                            label="Fuente"
                            value={token.style.fontFamily || ''}
                            onChange={(v) =>
                              updateTextStyles((prev) =>
                                prev.map((t, i) =>
                                  i === idx ? { ...t, style: { ...t.style, fontFamily: v } } : t
                                )
                              )
                            }
                            placeholder="Arial"
                          />
                          <MiniField
                            label="Tamaño"
                            value={token.style.fontSize !== undefined ? String(token.style.fontSize) : ''}
                            onChange={(v) =>
                              updateTextStyles((prev) =>
                                prev.map((t, i) =>
                                  i === idx
                                    ? { ...t, style: { ...t.style, fontSize: Number(v) || 12 } }
                                    : t
                                )
                              )
                            }
                            placeholder="12"
                          />
                          <div>
                            <label className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
                              Peso
                            </label>
                            <select
                              value={token.style.fontWeight || '600'}
                              onChange={(e) =>
                                updateTextStyles((prev) =>
                                  prev.map((t, i) =>
                                    i === idx
                                      ? {
                                          ...t,
                                          style: {
                                            ...t.style,
                                            fontWeight: e.target.value as TextStyleToken['style']['fontWeight'],
                                          },
                                        }
                                      : t
                                  )
                                )
                              }
                              className="h-7 w-full rounded-lg border border-neutral-200 bg-neutral-50 px-2 text-[11px] text-neutral-700 outline-none"
                            >
                              {FONT_WEIGHT_OPTIONS.map((w) => (
                                <option key={w} value={w}>{w}</option>
                              ))}
                            </select>
                          </div>
                          <MiniField
                            label="Color"
                            value={token.style.color || '#111827'}
                            onChange={(v) =>
                              updateTextStyles((prev) =>
                                prev.map((t, i) =>
                                  i === idx ? { ...t, style: { ...t.style, color: v } } : t
                                )
                              )
                            }
                            placeholder="#111827"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )
        )}
      </div>
    </div>
  );
}

function EmptyTokens({ label }: { label: string }) {
  return (
    <div className="rounded-xl border border-dashed border-neutral-200 bg-white px-3 py-3 text-center text-[11px] text-neutral-400">
      {label}
    </div>
  );
}

function MiniField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div>
      <label className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
        {label}
      </label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-7 w-full rounded-lg border border-neutral-200 bg-neutral-50 px-2 text-[11px] text-neutral-700 outline-none"
      />
    </div>
  );
}
