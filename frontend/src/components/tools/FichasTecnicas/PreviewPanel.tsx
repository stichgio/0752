import React from 'react';
import { FichaTecnica } from './types';

interface Props {
    fichaData: FichaTecnica | null;
    logoLeft: File | null;
    logoRight: File | null;
}

export default function PreviewPanel({ fichaData, logoLeft, logoRight }: Props) {
    const [logoLeftUrl, setLogoLeftUrl] = React.useState<string | null>(null);
    const [logoRightUrl, setLogoRightUrl] = React.useState<string | null>(null);

    React.useEffect(() => {
        if (logoLeft) {
            const url = URL.createObjectURL(logoLeft);
            setLogoLeftUrl(url);
            return () => URL.revokeObjectURL(url);
        } else {
            setLogoLeftUrl(null);
        }
    }, [logoLeft]);

    React.useEffect(() => {
        if (logoRight) {
            const url = URL.createObjectURL(logoRight);
            setLogoRightUrl(url);
            return () => URL.revokeObjectURL(url);
        } else {
            setLogoRightUrl(null);
        }
    }, [logoRight]);

    // Valores por defecto para datos vacíos o incompletos
    const defaultServicio = {
        desinfeccion: false,
        limpieza_ambientes: false,
        limpieza_pozos_septicos: false,
        limpieza_reservorios: false
    };

    const defaultTratamiento = {
        pulverizado: false,
        atomizado: false,
        thermonebulizado: false,
        nebulizado_ulv: false,
        otros: ''
    };

    const defaultObsRec = {
        observacion_a: '',
        observacion_b: '',
        observacion_c: '',
        recomendacion_a: '',
        recomendacion_b: '',
        recomendacion_c: ''
    };

    const defaultProductos = [
        { producto: '', composicion: '', lote: '', fecha_vencimiento: '', unidad: '', concentracion: '', cantidad: '' },
        { producto: '', composicion: '', lote: '', fecha_vencimiento: '', unidad: '', concentracion: '', cantidad: '' },
        { producto: '', composicion: '', lote: '', fecha_vencimiento: '', unidad: '', concentracion: '', cantidad: '' },
        { producto: '', composicion: '', lote: '', fecha_vencimiento: '', unidad: '', concentracion: '', cantidad: '' }
    ];

    // Crear objeto data con valores seguros
    const data = {
        os_numero: fichaData?.os_numero || '',
        cliente: fichaData?.cliente || '',
        fecha: fichaData?.fecha || '',
        direccion: fichaData?.direccion || '',
        distrito: fichaData?.distrito || '',
        servicio: { ...defaultServicio, ...(fichaData?.servicio || {}) },
        diagnostico_area: fichaData?.diagnostico_area || '',
        condicion_sanitaria: fichaData?.condicion_sanitaria || '',
        tratamiento: { ...defaultTratamiento, ...(fichaData?.tratamiento || {}) },
        productos: Array.isArray(fichaData?.productos) && fichaData.productos.length > 0 ? fichaData.productos : defaultProductos,
        acciones_correctivas: fichaData?.acciones_correctivas || '',
        areas_tratadas: fichaData?.areas_tratadas || '',
        personal_tecnico: Array.isArray(fichaData?.personal_tecnico) ? fichaData.personal_tecnico : ['', '', '', '', '', ''],
        hora_inicio: fichaData?.hora_inicio || '',
        hora_termino: fichaData?.hora_termino || '',
        numero_certificado: fichaData?.numero_certificado || '',
        obs_rec: { ...defaultObsRec, ...(fichaData?.obs_rec || {}) },
        satisfaccion: fichaData?.satisfaccion || ''
    };

    return (
        <div className="h-full overflow-auto bg-[#111] p-8 rounded-lg border border-[#333]">
            <div
                id="ficha-tecnica-preview"
                className="ficha-preview-container mx-auto shadow-lg"
                style={{
                    width: '210mm',
                    minHeight: '297mm',
                    padding: '8px',
                    backgroundColor: '#ffffff',
                    fontFamily: "'Segoe UI', Calibri, Arial, sans-serif",
                    fontSize: '7.5pt',
                    lineHeight: '1.15',
                    color: '#333333',
                    boxSizing: 'border-box'
                }}
            >
                <div style={{ border: '2px solid #333', padding: '12px' }}>
                    {/* Header */}
                    <div style={{ display: 'flex', alignItems: 'flex-start', marginBottom: '10px' }}>
                        {/* Logo Izquierdo - Fondo blanco */}
                        <div style={{
                            background: '#ffffff',
                            padding: '5px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'flex-start',
                            minWidth: '230px',
                            minHeight: '45px'
                        }}>
                            {logoLeftUrl ? (
                                <img src={logoLeftUrl} alt="Logo" style={{ maxWidth: '200px', maxHeight: '45px', objectFit: 'contain' }} />
                            ) : null}
                        </div>

                        {/* Título Central */}
                        <div style={{ flex: 1 }}>
                            <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#333', textAlign: 'center', whiteSpace: 'nowrap' }}>
                                FICHA TÉCNICA DE EVALUACIÓN DE ACTIVIDADES
                            </div>
                        </div>

                        {/* Sección O.S. N° a la derecha */}
                        <div style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'flex-end',
                            minWidth: '140px',
                            marginRight: '-12px',
                            marginTop: '-12px',
                            paddingRight: '8px',
                            paddingTop: '8px'
                        }}>
                            {/* Número de OS grande en rojo */}
                            <div style={{ marginBottom: '5px' }}>
                                <span style={{ color: '#c41e3a', fontSize: '16px', fontWeight: 'bold' }}>
                                    {data.os_numero ? data.os_numero.replace(/^OS-/, '').replace(/-/g, '') : '00000'}
                                </span>
                            </div>
                            {/* Campo O.S.N° con recuadro */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: 'auto', paddingRight: '10px' }}>
                                <span style={{ fontSize: '9px', fontWeight: 'bold' }}>O.S.N°</span>
                                <div style={{
                                    border: '1px solid #333',
                                    minWidth: '100px',
                                    height: '20px',
                                    padding: '2px 6px',
                                    fontSize: '9px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    background: '#ffffff'
                                }}>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Client Info */}
                    <div style={{ display: 'flex', gap: '15px', marginBottom: '6px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flex: 1 }}>
                            <label style={{ fontWeight: 'bold', fontSize: '9px', whiteSpace: 'nowrap' }}>Cliente :</label>
                            <div style={{ borderBottom: '1px solid #333', flex: 1, padding: '2px 4px', fontSize: '9px' }}>{data.cliente}</div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flex: 0.5 }}>
                            <label style={{ fontWeight: 'bold', fontSize: '9px', whiteSpace: 'nowrap' }}>Fecha :</label>
                            <div style={{ borderBottom: '1px solid #333', flex: 1, padding: '2px 4px', fontSize: '9px' }}>{data.fecha ? data.fecha.split(' ')[0].split('-').reverse().join('-') : ''}</div>
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: '15px', marginBottom: '6px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flex: 1 }}>
                            <label style={{ fontWeight: 'bold', fontSize: '9px', whiteSpace: 'nowrap' }}>Dirección :</label>
                            <div style={{ borderBottom: '1px solid #333', flex: 1, padding: '2px 4px', fontSize: '9px' }}>{data.direccion}</div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flex: 0.5 }}>
                            <label style={{ fontWeight: 'bold', fontSize: '9px', whiteSpace: 'nowrap' }}>Distrito :</label>
                            <div style={{ borderBottom: '1px solid #333', flex: 1, padding: '2px 4px', fontSize: '9px' }}>{data.distrito}</div>
                        </div>
                    </div>

                    {/* Service and Diagnostic */}
                    <div style={{ border: '2px solid #333', marginBottom: '8px' }}>
                        <div style={{ display: 'flex' }}>
                            <div style={{ flex: 1, borderRight: '2px solid #333' }}>
                                <div style={{ background: '#e0e0e0', padding: '4px', textAlign: 'center', fontWeight: 'bold', fontSize: '10px', borderBottom: '2px solid #333' }}>SERVICIO A EFECTUAR</div>
                                <div style={{ padding: '4px' }}>
                                    {[
                                        { key: 'desinfeccion', label: '1. DESINFECCIÓN' },
                                        { key: 'limpieza_ambientes', label: '2. LIMPIEZA DE AMBIENTES' },
                                        { key: 'limpieza_pozos_septicos', label: '3. LIMPIEZA DE POZOS SÉPTICOS' },
                                        { key: 'limpieza_reservorios', label: '4. LIMPIEZA Y DESINFECCIÓN DE RESERVORIOS DE AGUA' }
                                    ].map(({ key, label }) => (
                                        <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px', fontSize: '9px' }}>
                                            <span>{label}</span>
                                            <span style={{ width: '16px', height: '11px', border: '1px solid #333', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '8px', background: data.servicio[key as keyof typeof data.servicio] ? '#00a0b0' : 'white', color: data.servicio[key as keyof typeof data.servicio] ? 'white' : 'black' }}>
                                                {data.servicio[key as keyof typeof data.servicio] ? 'X' : ''}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                            <div style={{ flex: 1 }}>
                                <div style={{ background: '#e0e0e0', padding: '4px', textAlign: 'center', fontWeight: 'bold', fontSize: '10px', borderBottom: '2px solid #333' }}>DIAGNÓSTICO DEL ÁREA A TRATAR</div>
                                <div style={{ padding: '8px', minHeight: '70px', fontSize: '9px' }}>{data.diagnostico_area}</div>
                            </div>
                        </div>
                    </div>

                    {/* Sanitary Condition */}
                    <div style={{ border: '2px solid #333', marginBottom: '8px' }}>
                        <div style={{ background: '#e0e0e0', padding: '4px', textAlign: 'center', fontWeight: 'bold', fontSize: '10px', borderBottom: '2px solid #333' }}>CONDICIÓN SANITARIA DE LA ZONA CIRCUNDANTE</div>
                        <div style={{ padding: '4px', minHeight: '40px', fontSize: '9px' }}>{data.condicion_sanitaria}</div>
                    </div>

                    {/* Treatment Types */}
                    <div style={{ border: '2px solid #333', marginBottom: '8px' }}>
                        <div style={{ background: '#e0e0e0', padding: '4px', textAlign: 'center', fontWeight: 'bold', fontSize: '10px', borderBottom: '2px solid #333' }}>TIPOS DE TRATAMIENTO</div>
                        <div style={{ display: 'flex', padding: '4px' }}>
                            {/* Columna izquierda */}
                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                {[
                                    { key: 'pulverizado', label: 'Pulverizado' },
                                    { key: 'atomizado', label: 'Atomizado' }
                                ].map(({ key, label }) => (
                                    <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '9px' }}>
                                        <span>{label}</span>
                                        <span style={{
                                            width: '16px',
                                            height: '11px',
                                            border: '1px solid #333',
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            fontSize: '8px',
                                            background: data.tratamiento[key as keyof typeof data.tratamiento] ? '#00a0b0' : 'white',
                                            color: data.tratamiento[key as keyof typeof data.tratamiento] ? 'white' : 'black'
                                        }}>
                                            {data.tratamiento[key as keyof typeof data.tratamiento] ? 'X' : ''}
                                        </span>
                                    </div>
                                ))}
                                <div style={{ display: 'flex', alignItems: 'center', fontSize: '9px' }}>
                                    <span>Otros: {data.tratamiento.otros}</span>
                                </div>
                            </div>
                            {/* Columna derecha */}
                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                {[
                                    { key: 'thermonebulizado', label: 'Thermonebulizado' },
                                    { key: 'nebulizado_ulv', label: 'Nebulizado ULV' }
                                ].map(({ key, label }) => (
                                    <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '9px' }}>
                                        <span>{label}</span>
                                        <span style={{
                                            width: '16px',
                                            height: '11px',
                                            border: '1px solid #333',
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            fontSize: '8px',
                                            background: data.tratamiento[key as keyof typeof data.tratamiento] ? '#00a0b0' : 'white',
                                            color: data.tratamiento[key as keyof typeof data.tratamiento] ? 'white' : 'black'
                                        }}>
                                            {data.tratamiento[key as keyof typeof data.tratamiento] ? 'X' : ''}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Products Table */}
                    <div style={{ border: '2px solid #333', marginBottom: '8px' }}>
                        <div style={{ background: '#e0e0e0', padding: '4px', textAlign: 'center', fontWeight: 'bold', fontSize: '10px', borderBottom: '2px solid #333' }}>PRODUCTOS QUÍMICOS Y/O BIOLÓGICOS UTILIZADOS</div>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr>
                                    <th style={{ border: '1px solid #333', padding: '4px', fontSize: '8px', background: '#f5f5f5' }}>PRODUCTO</th>
                                    <th style={{ border: '1px solid #333', padding: '4px', fontSize: '8px', background: '#f5f5f5' }}>COMPOSICIÓN</th>
                                    <th style={{ border: '1px solid #333', padding: '4px', fontSize: '8px', background: '#f5f5f5' }}>LOTE</th>
                                    <th style={{ border: '1px solid #333', padding: '4px', fontSize: '7px', background: '#f5f5f5' }}>FECHA DE<br />VENCIMIENTO</th>
                                    <th style={{ border: '1px solid #333', padding: '4px', fontSize: '8px', background: '#f5f5f5' }}>UNIDAD</th>
                                    <th style={{ border: '1px solid #333', padding: '4px', fontSize: '8px', background: '#f5f5f5' }}>CONCENTRACIÓN</th>
                                    <th style={{ border: '1px solid #333', padding: '4px', fontSize: '8px', background: '#f5f5f5' }}>CANTIDAD</th>
                                </tr>
                            </thead>
                            <tbody>
                                {data.productos.map((prod, idx) => (
                                    <tr key={idx}>
                                        <td style={{ border: '1px solid #333', padding: '4px', fontSize: '8px', textAlign: 'center' }}>{prod.producto}</td>
                                        <td style={{ border: '1px solid #333', padding: '4px', fontSize: '8px', textAlign: 'center' }}>{prod.composicion}</td>
                                        <td style={{ border: '1px solid #333', padding: '4px', fontSize: '8px', textAlign: 'center' }}>{prod.lote}</td>
                                        <td style={{ border: '1px solid #333', padding: '4px', fontSize: '8px', textAlign: 'center' }}>{prod.fecha_vencimiento}</td>
                                        <td style={{ border: '1px solid #333', padding: '4px', fontSize: '8px', textAlign: 'center' }}>{prod.unidad}</td>
                                        <td style={{ border: '1px solid #333', padding: '4px', fontSize: '8px', textAlign: 'center' }}>{prod.concentracion}</td>
                                        <td style={{ border: '1px solid #333', padding: '4px', fontSize: '8px', textAlign: 'center' }}>{prod.cantidad ? parseFloat(prod.cantidad).toFixed(4) : ''}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Corrective Actions */}
                    <div style={{ border: '2px solid #333', marginBottom: '8px' }}>
                        <div style={{ background: '#e0e0e0', padding: '4px', textAlign: 'center', fontWeight: 'bold', fontSize: '10px', borderBottom: '2px solid #333' }}>ACCIONES CORRECTIVAS</div>
                        <div style={{ padding: '4px', minHeight: '50px', fontSize: '9px' }}>{data.acciones_correctivas}</div>
                    </div>

                    {/* Treated Areas */}
                    <div style={{ border: '2px solid #333', marginBottom: '8px' }}>
                        <div style={{ background: '#e0e0e0', padding: '4px', textAlign: 'center', fontWeight: 'bold', fontSize: '10px', borderBottom: '2px solid #333' }}>ÁREAS TRATADAS</div>
                        <div style={{ padding: '4px', minHeight: '50px', fontSize: '9px' }}>{data.areas_tratadas}</div>
                    </div>

                    {/* Technical Staff */}
                    <div style={{ border: '2px solid #333', marginBottom: '8px' }}>
                        <div style={{ background: '#e0e0e0', padding: '4px', textAlign: 'center', fontWeight: 'bold', fontSize: '10px', borderBottom: '2px solid #333' }}>PERSONAL TÉCNICO</div>
                        <div style={{ display: 'flex', borderBottom: '2px solid #333' }}>
                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', borderRight: '1.5px solid #333' }}>
                                {(Array.isArray(data.personal_tecnico) ? data.personal_tecnico : ['', '', '', '', '', '']).slice(0, 3).map((persona, idx) => (
                                    <div key={idx} style={{ padding: '3px 6px', fontSize: '8px', minHeight: '18px', borderBottom: idx < 2 ? '1px solid #ddd' : 'none' }}>
                                        {persona}
                                    </div>
                                ))}
                            </div>
                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                                {(Array.isArray(data.personal_tecnico) ? data.personal_tecnico : ['', '', '', '', '', '']).slice(3, 6).map((persona, idx) => (
                                    <div key={idx + 3} style={{ padding: '3px 6px', fontSize: '8px', minHeight: '18px', borderBottom: idx < 2 ? '1px solid #ddd' : 'none' }}>
                                        {persona}
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div style={{ display: 'flex', borderTop: '2px solid #333' }}>
                            <div style={{ flex: 1, padding: '4px', borderRight: '1px solid #333', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <label style={{ fontWeight: 'bold', fontSize: '9px' }}>HORA INICIO :</label>
                                <div style={{ borderBottom: '1px solid #333', flex: 1, fontSize: '9px' }}>{data.hora_inicio}</div>
                            </div>
                            <div style={{ flex: 1, padding: '4px', borderRight: '1px solid #333', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <label style={{ fontWeight: 'bold', fontSize: '9px' }}>HORA TÉRMINO :</label>
                                <div style={{ borderBottom: '1px solid #333', flex: 1, fontSize: '9px' }}>{data.hora_termino}</div>
                            </div>
                            <div style={{ flex: 1, padding: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <label style={{ fontWeight: 'bold', fontSize: '9px' }}>N° CERTIFICADO :</label>
                                <div style={{ borderBottom: '1px solid #333', flex: 1, fontSize: '9px' }}>{data.numero_certificado}</div>
                            </div>
                        </div>
                    </div>

                    {/* Observations and Recommendations */}
                    <div style={{ border: '2px solid #333', marginBottom: '8px' }}>
                        <div style={{ display: 'flex' }}>
                            <div style={{ flex: 1, padding: '4px', borderRight: '1px solid #333' }}>
                                <div style={{ fontWeight: 'bold', textAlign: 'center', marginBottom: '4px', fontSize: '9px' }}>OBSERVACIONES</div>
                                {['a', 'b', 'c'].map((letter) => (
                                    <div key={letter} style={{ display: 'flex', gap: '4px', marginBottom: '3px' }}>
                                        <span style={{ fontSize: '9px' }}>{letter})</span>
                                        <div style={{ flex: 1, borderBottom: '1px solid #333', fontSize: '9px' }}>{data.obs_rec[`observacion_${letter}` as keyof typeof data.obs_rec]}</div>
                                    </div>
                                ))}
                            </div>
                            <div style={{ flex: 1, padding: '4px' }}>
                                <div style={{ fontWeight: 'bold', textAlign: 'center', marginBottom: '4px', fontSize: '9px' }}>RECOMENDACIONES</div>
                                {['a', 'b', 'c'].map((letter) => (
                                    <div key={letter} style={{ display: 'flex', gap: '4px', marginBottom: '3px' }}>
                                        <span style={{ fontSize: '9px' }}>{letter})</span>
                                        <div style={{ flex: 1, borderBottom: '1px solid #333', fontSize: '9px' }}>{data.obs_rec[`recomendacion_${letter}` as keyof typeof data.obs_rec]}</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Satisfaction */}
                    <div style={{ border: '2px solid #333', marginBottom: '8px' }}>
                        <div style={{ background: '#e0e0e0', padding: '4px', textAlign: 'center', fontWeight: 'bold', fontSize: '10px', borderBottom: '2px solid #333' }}>EVALUACIÓN DE SATISFACCIÓN DEL CLIENTE</div>
                        <div style={{ display: 'flex', justifyContent: 'space-around', padding: '8px' }}>
                            {[
                                { value: 'muy_satisfecho', label: 'Muy Satisfecho', emoji: '😊' },
                                { value: 'satisfecho', label: 'Satisfecho', emoji: '🙂' },
                                { value: 'regular', label: 'Regular', emoji: '😐' },
                                { value: 'insatisfecho', label: 'Insatisfecho', emoji: '🙁' }
                            ].map(({ value, label, emoji }) => (
                                <div key={value} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '9px', fontWeight: data.satisfaccion === value ? 'bold' : 'normal', background: data.satisfaccion === value ? '#262626' : 'transparent', color: data.satisfaccion === value ? '#ffffff' : '#333', padding: '2px 6px', borderRadius: '3px' }}>
                                    <span style={{ fontSize: '14px' }}>{emoji}</span>
                                    <span>{label}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Signatures */}
                    <div style={{ display: 'flex', justifyContent: 'space-around', margin: '50px 0 10px 0' }}>
                        {['Responsable de Servicio', 'Cliente', 'Inspector técnico'].map((label) => (
                            <div key={label} style={{ textAlign: 'center' }}>
                                <div style={{ width: '130px', borderTop: '1px solid #333', marginBottom: '4px' }}></div>
                                <div style={{ fontSize: '8px' }}>{label}</div>
                            </div>
                        ))}
                    </div>

                    {/* Footer */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '15px', paddingTop: '8px', fontSize: '8px', color: '#00a0b0' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <span>📍</span>
                            <span>Mz J1 lote 20. Urb. Los Precursores. Surco. Lima</span>
                        </div>
                        <div style={{ textAlign: 'center' }}>
                            <div style={{ marginBottom: '2px' }}>✉ operaciones@hidroserviciosaa.com.pe</div>
                            <div>📞 +51 946 803 367</div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <span>🌐</span>
                            <span>www.hidroserviciosaa.com.pe/</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
