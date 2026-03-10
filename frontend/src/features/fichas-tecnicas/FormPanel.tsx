import React, { useEffect, useRef } from 'react';
import { Save, Settings } from 'lucide-react';
import { FichaTecnica, ProductoQuimico, SatisfaccionType } from './types';

interface Props {
    fichaData: FichaTecnica | null;
    onChange: (data: Partial<FichaTecnica>) => void;
    onSave: () => void;
    hasUnsavedChanges: boolean;
    logoLeft: File | null;
    logoRight: File | null;
    onLogoLeftChange: (file: File | null) => void;
    onLogoRightChange: (file: File | null) => void;
}

export default function FormPanel({
    fichaData,
    onChange,
    onSave,
    hasUnsavedChanges,
    logoLeft,
    logoRight,
    onLogoLeftChange,
    onLogoRightChange
}: Props) {
    // Manage object URLs to prevent memory leaks
    const logoLeftUrlRef = useRef<string | null>(null);
    const logoRightUrlRef = useRef<string | null>(null);

    useEffect(() => {
        if (logoLeftUrlRef.current) URL.revokeObjectURL(logoLeftUrlRef.current);
        logoLeftUrlRef.current = logoLeft ? URL.createObjectURL(logoLeft) : null;
        return () => {
            if (logoLeftUrlRef.current) URL.revokeObjectURL(logoLeftUrlRef.current);
        };
    }, [logoLeft]);

    useEffect(() => {
        if (logoRightUrlRef.current) URL.revokeObjectURL(logoRightUrlRef.current);
        logoRightUrlRef.current = logoRight ? URL.createObjectURL(logoRight) : null;
        return () => {
            if (logoRightUrlRef.current) URL.revokeObjectURL(logoRightUrlRef.current);
        };
    }, [logoRight]);

    if (!fichaData) {
        return (
            <div className="bg-[#111] border border-[#333] rounded-lg p-6 h-full flex items-center justify-center">
                <p className="text-[#666] text-center">
                    Seleccione una ficha para editar
                </p>
            </div>
        );
    }

    const handleInputChange = (field: keyof FichaTecnica, value: any) => {
        onChange({ [field]: value });
    };

    const handleServicioChange = (field: keyof FichaTecnica['servicio'], value: boolean) => {
        onChange({
            servicio: {
                ...fichaData.servicio,
                [field]: value
            }
        });
    };

    const handleTratamientoChange = (field: keyof FichaTecnica['tratamiento'], value: boolean | string) => {
        onChange({
            tratamiento: {
                ...fichaData.tratamiento,
                [field]: value
            }
        });
    };

    const handleProductoChange = (index: number, field: keyof ProductoQuimico, value: string) => {
        const newProductos = [...fichaData.productos];
        newProductos[index] = { ...newProductos[index], [field]: value };
        onChange({ productos: newProductos });
    };

    const handleObsRecChange = (field: keyof FichaTecnica['obs_rec'], value: string) => {
        onChange({
            obs_rec: {
                ...fichaData.obs_rec,
                [field]: value
            }
        });
    };

    const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>, isLeft: boolean) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            if (isLeft) onLogoLeftChange(file);
            else onLogoRightChange(file);
        }
    };

    return (
        <div className="bg-[#111] border border-[#333] rounded-lg p-4 h-full flex flex-col overflow-hidden">
            <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-[#eee] font-mono">Editor de Ficha</h2>
                <button
                    onClick={onSave}
                    disabled={!hasUnsavedChanges}
                    className={`btn-primary flex items-center gap-2 ${!hasUnsavedChanges ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                    <Save size={14} />
                    Guardar
                </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-4 pr-2">
                {/* Logos */}
                <div className="bg-[#1a1a1a] p-2 rounded border border-[#333]">
                    <div className="flex items-center gap-2 mb-2 text-[14px] font-['DotGothic16'] font-semibold text-[#eee]">
                        <div className="bg-[#eee] text-[#000] rounded-full w-4 h-4 flex items-center justify-center text-[10px] font-bold">0</div>
                        <Settings size={12} />
                        LOGOS Y CABECERA
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        {/* Logo Left */}
                        <div className="flex flex-col items-center gap-1">
                            <span className="text-[10px] text-[#888]">Logo Izq</span>
                            <label className="w-full h-12 border border-dashed border-[#444] rounded flex flex-col items-center justify-center cursor-pointer hover:border-[#666] hover:bg-[#222] transition-colors relative overflow-hidden">
                                {logoLeftUrlRef.current ? (
                                    <img src={logoLeftUrlRef.current} className="w-full h-full object-contain p-1" />
                                ) : (
                                    <span className="text-[9px] text-[#666]">Subir</span>
                                )}
                                <input type="file" accept="image/*" className="hidden" onChange={(e) => handleLogoUpload(e, true)} />
                            </label>
                        </div>
                        {/* Logo Right */}
                        <div className="flex flex-col items-center gap-1">
                            <span className="text-[10px] text-[#888]">Logo Der</span>
                            <label className="w-full h-12 border border-dashed border-[#444] rounded flex flex-col items-center justify-center cursor-pointer hover:border-[#666] hover:bg-[#222] transition-colors relative overflow-hidden">
                                {logoRightUrlRef.current ? (
                                    <img src={logoRightUrlRef.current} className="w-full h-full object-contain p-1" />
                                ) : (
                                    <span className="text-[9px] text-[#666]">Subir</span>
                                )}
                                <input type="file" accept="image/*" className="hidden" onChange={(e) => handleLogoUpload(e, false)} />
                            </label>
                        </div>
                    </div>
                </div>

                {/* Información General */}
                <fieldset className="border border-[#333] rounded p-3">
                    <legend className="text-[14px] font-['DotGothic16'] text-[#888888] px-2 font-bold">INFORMACIÓN GENERAL</legend>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-[12px] font-['Roboto_Mono'] text-[#888] mb-1">O.S. N°</label>
                            <input
                                type="text"
                                value={fichaData.os_numero}
                                onChange={(e) => handleInputChange('os_numero', e.target.value)}
                                className="input-field"
                            />
                        </div>
                        <div>
                            <label className="block text-[12px] font-['Roboto_Mono'] text-[#888] mb-1">Fecha</label>
                            <input
                                type="text"
                                value={fichaData.fecha}
                                onChange={(e) => handleInputChange('fecha', e.target.value)}
                                className="input-field"
                            />
                        </div>
                        <div className="col-span-2">
                            <label className="block text-[12px] font-['Roboto_Mono'] text-[#888] mb-1">Cliente</label>
                            <input
                                type="text"
                                value={fichaData.cliente}
                                onChange={(e) => handleInputChange('cliente', e.target.value)}
                                className="input-field"
                            />
                        </div>
                        <div className="col-span-2">
                            <label className="block text-[12px] font-['Roboto_Mono'] text-[#888] mb-1">Dirección</label>
                            <input
                                type="text"
                                value={fichaData.direccion}
                                onChange={(e) => handleInputChange('direccion', e.target.value)}
                                className="input-field"
                            />
                        </div>
                        <div>
                            <label className="block text-[12px] font-['Roboto_Mono'] text-[#888] mb-1">Distrito</label>
                            <input
                                type="text"
                                value={fichaData.distrito}
                                onChange={(e) => handleInputChange('distrito', e.target.value)}
                                className="input-field"
                            />
                        </div>
                    </div>
                </fieldset>

                {/* Servicio a Efectuar */}
                <fieldset className="border border-[#333] rounded p-3">
                    <legend className="text-[14px] font-['DotGothic16'] text-[#888888] px-2 font-bold">SERVICIO A EFECTUAR</legend>
                    <div className="grid grid-cols-2 gap-2">
                        {[
                            { key: 'desinfeccion', label: 'Desinfección' },
                            { key: 'limpieza_ambientes', label: 'Limpieza de Ambientes' },
                            { key: 'limpieza_pozos_septicos', label: 'Limpieza de Pozos Sépticos' },
                            { key: 'limpieza_reservorios', label: 'Limpieza y Desinfección de Reservorios' }
                        ].map(({ key, label }) => (
                            <label key={key} className="flex items-center gap-2 text-[12px] font-['Roboto_Mono'] text-[#eee] cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={fichaData.servicio[key as keyof typeof fichaData.servicio]}
                                    onChange={(e) => handleServicioChange(key as keyof typeof fichaData.servicio, e.target.checked)}
                                    className="accent-[#666]"
                                />
                                {label}
                            </label>
                        ))}
                    </div>
                </fieldset>

                {/* Diagnóstico */}
                <fieldset className="border border-[#333] rounded p-3">
                    <legend className="text-[14px] font-['DotGothic16'] text-[#888888] px-2 font-bold">DIAGNÓSTICO DEL ÁREA A TRATAR</legend>
                    <textarea
                        value={fichaData.diagnostico_area}
                        onChange={(e) => handleInputChange('diagnostico_area', e.target.value)}
                        className="input-field min-h-[60px]"
                        rows={3}
                    />
                </fieldset>

                {/* Condición Sanitaria */}
                <fieldset className="border border-[#333] rounded p-3">
                    <legend className="text-[14px] font-['DotGothic16'] text-[#888888] px-2 font-bold">CONDICIÓN SANITARIA</legend>
                    <textarea
                        value={fichaData.condicion_sanitaria}
                        onChange={(e) => handleInputChange('condicion_sanitaria', e.target.value)}
                        className="input-field min-h-[50px]"
                        rows={2}
                    />
                </fieldset>

                {/* Tipos de Tratamiento */}
                <fieldset className="border border-[#333] rounded p-3">
                    <legend className="text-[14px] font-['DotGothic16'] text-[#888888] px-2 font-bold">TIPOS DE TRATAMIENTO</legend>
                    <div className="grid grid-cols-2 gap-2">
                        {[
                            { key: 'pulverizado', label: 'Pulverizado' },
                            { key: 'atomizado', label: 'Atomizado' },
                            { key: 'thermonebulizado', label: 'Thermonebulizado' },
                            { key: 'nebulizado_ulv', label: 'Nebulizado ULV' }
                        ].map(({ key, label }) => (
                            <label key={key} className="flex items-center gap-2 text-[12px] font-['Roboto_Mono'] text-[#eee] cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={fichaData.tratamiento[key as keyof typeof fichaData.tratamiento] as boolean}
                                    onChange={(e) => handleTratamientoChange(key as keyof typeof fichaData.tratamiento, e.target.checked)}
                                    className="accent-[#666]"
                                />
                                {label}
                            </label>
                        ))}
                    </div>
                    <div className="mt-2">
                        <label className="block text-xs text-[#888] mb-1">Otros</label>
                        <input
                            type="text"
                            value={fichaData.tratamiento.otros}
                            onChange={(e) => handleTratamientoChange('otros', e.target.value)}
                            className="input-field"
                        />
                    </div>
                </fieldset>

                {/* Productos Químicos */}
                <fieldset className="border border-[#333] rounded p-3">
                    <legend className="text-[14px] font-['DotGothic16'] text-[#888888] px-2 font-bold">PRODUCTOS QUÍMICOS/BIOLÓGICOS</legend>
                    <div className="space-y-3">
                        {fichaData.productos.map((prod, idx) => (
                            <div key={idx} className="bg-[#1a1a1a] rounded p-2">
                                <div className="text-[12px] font-['Roboto_Mono'] text-[#666] mb-1">Producto {idx + 1}</div>
                                <div className="grid grid-cols-3 gap-2">
                                    <input
                                        type="text"
                                        placeholder="Producto"
                                        value={prod.producto}
                                        onChange={(e) => handleProductoChange(idx, 'producto', e.target.value)}
                                        className="input-field text-xs"
                                    />
                                    <input
                                        type="text"
                                        placeholder="Composición"
                                        value={prod.composicion}
                                        onChange={(e) => handleProductoChange(idx, 'composicion', e.target.value)}
                                        className="input-field text-xs"
                                    />
                                    <input
                                        type="text"
                                        placeholder="Lote"
                                        value={prod.lote}
                                        onChange={(e) => handleProductoChange(idx, 'lote', e.target.value)}
                                        className="input-field text-xs"
                                    />
                                    <input
                                        type="text"
                                        placeholder="Vencimiento"
                                        value={prod.fecha_vencimiento}
                                        onChange={(e) => handleProductoChange(idx, 'fecha_vencimiento', e.target.value)}
                                        className="input-field text-xs"
                                    />
                                    <input
                                        type="text"
                                        placeholder="Unidad"
                                        value={prod.unidad}
                                        onChange={(e) => handleProductoChange(idx, 'unidad', e.target.value)}
                                        className="input-field text-xs"
                                    />
                                    <input
                                        type="text"
                                        placeholder="Concentración"
                                        value={prod.concentracion}
                                        onChange={(e) => handleProductoChange(idx, 'concentracion', e.target.value)}
                                        className="input-field text-xs"
                                    />
                                    <input
                                        type="text"
                                        placeholder="Cantidad"
                                        value={prod.cantidad}
                                        onChange={(e) => handleProductoChange(idx, 'cantidad', e.target.value)}
                                        className="input-field text-xs"
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                </fieldset>

                {/* Acciones Correctivas */}
                <fieldset className="border border-[#333] rounded p-3">
                    <legend className="text-[14px] font-['DotGothic16'] text-[#888888] px-2 font-bold">ACCIONES CORRECTIVAS</legend>
                    <textarea
                        value={fichaData.acciones_correctivas}
                        onChange={(e) => handleInputChange('acciones_correctivas', e.target.value)}
                        className="input-field min-h-[50px]"
                        rows={2}
                    />
                </fieldset>

                {/* Áreas Tratadas */}
                <fieldset className="border border-[#333] rounded p-3">
                    <legend className="text-[14px] font-['DotGothic16'] text-[#888888] px-2 font-bold">ÁREAS TRATADAS</legend>
                    <textarea
                        value={fichaData.areas_tratadas}
                        onChange={(e) => handleInputChange('areas_tratadas', e.target.value)}
                        className="input-field min-h-[50px]"
                        rows={2}
                    />
                </fieldset>

                {/* Personal Técnico */}
                <fieldset className="border border-[#333] rounded p-3">
                    <legend className="text-[14px] font-['DotGothic16'] text-[#888888] px-2 font-bold">PERSONAL TÉCNICO</legend>
                    <div className="grid grid-cols-2 gap-2">
                        {(() => {
                            const pt = fichaData.personal_tecnico as unknown;
                            if (Array.isArray(pt)) {
                                return pt.length >= 6 ? pt.slice(0, 6) : [...pt, ...Array(6 - pt.length).fill('')];
                            }
                            if (typeof pt === 'string' && pt) {
                                return (pt as string).split('\n').slice(0, 6).concat(Array(6).fill('')).slice(0, 6);
                            }
                            return ['', '', '', '', '', ''];
                        })().map((persona, idx) => (
                            <input
                                key={idx}
                                type="text"
                                placeholder={`Técnico ${idx + 1}`}
                                value={persona}
                                onChange={(e) => {
                                    const currentPersonal = Array.isArray(fichaData.personal_tecnico)
                                        ? fichaData.personal_tecnico
                                        : ['', '', '', '', '', ''];
                                    const newPersonal = [...currentPersonal];
                                    newPersonal[idx] = e.target.value;
                                    handleInputChange('personal_tecnico', newPersonal);
                                }}
                                className="input-field text-xs"
                            />
                        ))}
                    </div>
                    <div className="grid grid-cols-3 gap-2 mt-2">
                        <div>
                            <label className="block text-[12px] font-['Roboto_Mono'] text-[#888] mb-1">Hora Inicio</label>
                            <input
                                type="text"
                                value={fichaData.hora_inicio}
                                onChange={(e) => handleInputChange('hora_inicio', e.target.value)}
                                className="input-field"
                            />
                        </div>
                        <div>
                            <label className="block text-[12px] font-['Roboto_Mono'] text-[#888] mb-1">Hora Término</label>
                            <input
                                type="text"
                                value={fichaData.hora_termino}
                                onChange={(e) => handleInputChange('hora_termino', e.target.value)}
                                className="input-field"
                            />
                        </div>
                        <div>
                            <label className="block text-[12px] font-['Roboto_Mono'] text-[#888] mb-1">N° Certificado</label>
                            <input
                                type="text"
                                value={fichaData.numero_certificado}
                                onChange={(e) => handleInputChange('numero_certificado', e.target.value)}
                                className="input-field"
                            />
                        </div>
                    </div>
                </fieldset>

                {/* Observaciones y Recomendaciones */}
                <fieldset className="border border-[#333] rounded p-3">
                    <legend className="text-[14px] font-['DotGothic16'] text-[#888888] px-2 font-bold">OBSERVACIONES Y RECOMENDACIONES</legend>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <div className="text-[12px] font-['Roboto_Mono'] text-[#888] mb-2">Observaciones</div>
                            {['a', 'b', 'c'].map((letter) => (
                                <div key={letter} className="flex items-center gap-2 mb-1">
                                    <span className="text-[12px] font-['Roboto_Mono'] text-[#666]">{letter})</span>
                                    <input
                                        type="text"
                                        value={fichaData.obs_rec[`observacion_${letter}` as keyof typeof fichaData.obs_rec]}
                                        onChange={(e) => handleObsRecChange(`observacion_${letter}` as keyof typeof fichaData.obs_rec, e.target.value)}
                                        className="input-field flex-1"
                                    />
                                </div>
                            ))}
                        </div>
                        <div>
                            <div className="text-[12px] font-['Roboto_Mono'] text-[#888] mb-2">Recomendaciones</div>
                            {['a', 'b', 'c'].map((letter) => (
                                <div key={letter} className="flex items-center gap-2 mb-1">
                                    <span className="text-[12px] font-['Roboto_Mono'] text-[#666]">{letter})</span>
                                    <input
                                        type="text"
                                        value={fichaData.obs_rec[`recomendacion_${letter}` as keyof typeof fichaData.obs_rec]}
                                        onChange={(e) => handleObsRecChange(`recomendacion_${letter}` as keyof typeof fichaData.obs_rec, e.target.value)}
                                        className="input-field flex-1"
                                    />
                                </div>
                            ))}
                        </div>
                    </div>
                </fieldset>

                {/* Satisfacción */}
                <fieldset className="border border-[#333] rounded p-3">
                    <legend className="text-[14px] font-['DotGothic16'] text-[#888888] px-2 font-bold">EVALUACIÓN DE SATISFACCIÓN</legend>
                    <div className="flex justify-around">
                        {[
                            { value: 'muy_satisfecho', label: 'Muy Satisfecho', emoji: '😊' },
                            { value: 'satisfecho', label: 'Satisfecho', emoji: '🙂' },
                            { value: 'regular', label: 'Regular', emoji: '😐' },
                            { value: 'insatisfecho', label: 'Insatisfecho', emoji: '🙁' }
                        ].map(({ value, label, emoji }) => (
                            <label key={value} className="flex flex-col items-center gap-1 cursor-pointer">
                                <input
                                    type="radio"
                                    name="satisfaccion"
                                    value={value}
                                    checked={fichaData.satisfaccion === value}
                                    onChange={(e) => handleInputChange('satisfaccion', e.target.value as SatisfaccionType)}
                                    className="hidden"
                                />
                                <span className={`text-2xl ${fichaData.satisfaccion === value ? 'scale-125' : 'opacity-50'} transition-all`}>
                                    {emoji}
                                </span>
                                <span className={`text-[10px] ${fichaData.satisfaccion === value ? 'text-[#eee]' : 'text-[#666]'}`}>
                                    {label}
                                </span>
                            </label>
                        ))}
                    </div>
                </fieldset>
            </div>

            <style>{`
                .input-field {
                    width: 100%;
                    background: #1a1a1a;
                    border: 1px solid #333;
                    border-radius: 4px;
                    padding: 6px 8px;
                    font-size: 11px;
                    color: #eee;
                }
                .input-field:focus {
                    outline: none;
                    border-color: #666;
                }
            `}</style>
        </div>
    );
}
