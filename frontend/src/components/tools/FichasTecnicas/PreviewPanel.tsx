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

    if (!fichaData) {
        return (
            <div className="bg-[#1a1a1a] border border-[#333] rounded-lg h-full flex items-center justify-center">
                <p className="text-[#666]">Seleccione una ficha para previsualizar</p>
            </div>
        );
    }

    return (
        <div className="bg-[#1a1a1a] border border-[#333] rounded-lg h-full overflow-auto p-4">
            <div
                id="ficha-tecnica-preview"
                className="bg-white text-black mx-auto shadow-lg"
                style={{
                    width: '210mm',
                    minHeight: '297mm',
                    padding: '10mm',
                    fontSize: '10px',
                    fontFamily: 'Arial, sans-serif',
                    transform: 'scale(0.65)',
                    transformOrigin: 'top center'
                }}
            >
                <div style={{ border: '2px solid #333', padding: '12px' }}>
                    {/* Header */}
                    <div style={{ display: 'flex', alignItems: 'center', marginBottom: '12px', gap: '12px' }}>
                        <div style={{ background: '#1a1a2e', padding: '8px', display: 'flex', alignItems: 'center', gap: '8px', color: 'white', minWidth: '180px' }}>
                            {logoLeftUrl ? (
                                <img src={logoLeftUrl} alt="Logo" style={{ maxWidth: '40px', maxHeight: '40px' }} />
                            ) : (
                                <div style={{ width: '36px', height: '36px', background: '#d4af37', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px' }}>H</div>
                            )}
                            <div style={{ fontSize: '11px', fontWeight: 'bold', lineHeight: 1.2 }}>
                                HIDR SERVICIOS<br />
                                <span style={{ color: '#d4af37' }}>AA</span> E.I.R.L.
                            </div>
                        </div>
                        <div style={{ flex: 1 }}>
                            <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#333' }}>FICHA TÉCNICA DE EVALUACIÓN DE ACTIVIDADES</div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: '10px' }}>O.S. N°</div>
                            <div style={{ color: '#c41e3a', fontSize: '16px', fontWeight: 'bold' }}>{fichaData.os_numero || 'N° 00001'}</div>
                        </div>
                    </div>

                    {/* Client Info */}
                    <div style={{ display: 'flex', gap: '15px', marginBottom: '6px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flex: 1 }}>
                            <label style={{ fontWeight: 'bold', fontSize: '9px', whiteSpace: 'nowrap' }}>Cliente :</label>
                            <div style={{ borderBottom: '1px solid #333', flex: 1, padding: '2px 4px', fontSize: '9px' }}>{fichaData.cliente}</div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flex: 0.5 }}>
                            <label style={{ fontWeight: 'bold', fontSize: '9px', whiteSpace: 'nowrap' }}>Fecha :</label>
                            <div style={{ borderBottom: '1px solid #333', flex: 1, padding: '2px 4px', fontSize: '9px' }}>{fichaData.fecha}</div>
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: '15px', marginBottom: '6px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flex: 1 }}>
                            <label style={{ fontWeight: 'bold', fontSize: '9px', whiteSpace: 'nowrap' }}>Dirección :</label>
                            <div style={{ borderBottom: '1px solid #333', flex: 1, padding: '2px 4px', fontSize: '9px' }}>{fichaData.direccion}</div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flex: 0.5 }}>
                            <label style={{ fontWeight: 'bold', fontSize: '9px', whiteSpace: 'nowrap' }}>Distrito :</label>
                            <div style={{ borderBottom: '1px solid #333', flex: 1, padding: '2px 4px', fontSize: '9px' }}>{fichaData.distrito}</div>
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
                                            <span style={{ width: '16px', height: '11px', border: '1px solid #333', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '8px', background: fichaData.servicio[key as keyof typeof fichaData.servicio] ? '#333' : 'white', color: fichaData.servicio[key as keyof typeof fichaData.servicio] ? 'white' : 'black' }}>
                                                {fichaData.servicio[key as keyof typeof fichaData.servicio] ? 'X' : ''}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                            <div style={{ flex: 1 }}>
                                <div style={{ background: '#e0e0e0', padding: '4px', textAlign: 'center', fontWeight: 'bold', fontSize: '10px', borderBottom: '2px solid #333' }}>DIAGNÓSTICO DEL ÁREA A TRATAR</div>
                                <div style={{ padding: '8px', minHeight: '70px', fontSize: '9px' }}>{fichaData.diagnostico_area}</div>
                            </div>
                        </div>
                    </div>

                    {/* Sanitary Condition */}
                    <div style={{ border: '2px solid #333', marginBottom: '8px' }}>
                        <div style={{ background: '#e0e0e0', padding: '4px', textAlign: 'center', fontWeight: 'bold', fontSize: '10px', borderBottom: '2px solid #333' }}>CONDICIÓN SANITARIA DE LA ZONA CIRCUNDANTE</div>
                        <div style={{ padding: '4px', minHeight: '40px', fontSize: '9px' }}>{fichaData.condicion_sanitaria}</div>
                    </div>

                    {/* Treatment Types */}
                    <div style={{ border: '2px solid #333', marginBottom: '8px' }}>
                        <div style={{ background: '#e0e0e0', padding: '4px', textAlign: 'center', fontWeight: 'bold', fontSize: '10px', borderBottom: '2px solid #333' }}>TIPOS DE TRATAMIENTO</div>
                        <div style={{ display: 'flex', justifyContent: 'space-around', padding: '8px' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                {['pulverizado', 'atomizado'].map((key) => (
                                    <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '9px' }}>
                                        <span style={{ textTransform: 'capitalize' }}>{key}</span>
                                        <span style={{ width: '16px', height: '11px', border: '1px solid #333', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '8px', background: fichaData.tratamiento[key as keyof typeof fichaData.tratamiento] ? '#333' : 'white', color: fichaData.tratamiento[key as keyof typeof fichaData.tratamiento] ? 'white' : 'black' }}>
                                            {fichaData.tratamiento[key as keyof typeof fichaData.tratamiento] ? 'X' : ''}
                                        </span>
                                    </div>
                                ))}
                                <div style={{ fontSize: '9px' }}>Otros: {fichaData.tratamiento.otros}</div>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                {['thermonebulizado', 'nebulizado_ulv'].map((key) => (
                                    <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '9px' }}>
                                        <span>{key === 'nebulizado_ulv' ? 'Nebulizado ULV' : 'Thermonebulizado'}</span>
                                        <span style={{ width: '16px', height: '11px', border: '1px solid #333', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '8px', background: fichaData.tratamiento[key as keyof typeof fichaData.tratamiento] ? '#333' : 'white', color: fichaData.tratamiento[key as keyof typeof fichaData.tratamiento] ? 'white' : 'black' }}>
                                            {fichaData.tratamiento[key as keyof typeof fichaData.tratamiento] ? 'X' : ''}
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
                                    <th style={{ border: '1px solid #333', padding: '4px', fontSize: '7px', background: '#f5f5f5' }}>FECHA DE<br/>VENCIMIENTO</th>
                                    <th style={{ border: '1px solid #333', padding: '4px', fontSize: '8px', background: '#f5f5f5' }}>UNIDAD</th>
                                    <th style={{ border: '1px solid #333', padding: '4px', fontSize: '8px', background: '#f5f5f5' }}>CONCENTRACIÓN</th>
                                    <th style={{ border: '1px solid #333', padding: '4px', fontSize: '8px', background: '#f5f5f5' }}>CANTIDAD</th>
                                </tr>
                            </thead>
                            <tbody>
                                {fichaData.productos.map((prod, idx) => (
                                    <tr key={idx}>
                                        <td style={{ border: '1px solid #333', padding: '4px', fontSize: '8px', textAlign: 'center' }}>{prod.producto}</td>
                                        <td style={{ border: '1px solid #333', padding: '4px', fontSize: '8px', textAlign: 'center' }}>{prod.composicion}</td>
                                        <td style={{ border: '1px solid #333', padding: '4px', fontSize: '8px', textAlign: 'center' }}>{prod.lote}</td>
                                        <td style={{ border: '1px solid #333', padding: '4px', fontSize: '8px', textAlign: 'center' }}>{prod.fecha_vencimiento}</td>
                                        <td style={{ border: '1px solid #333', padding: '4px', fontSize: '8px', textAlign: 'center' }}>{prod.unidad}</td>
                                        <td style={{ border: '1px solid #333', padding: '4px', fontSize: '8px', textAlign: 'center' }}>{prod.concentracion}</td>
                                        <td style={{ border: '1px solid #333', padding: '4px', fontSize: '8px', textAlign: 'center' }}>{prod.cantidad}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Corrective Actions */}
                    <div style={{ border: '2px solid #333', marginBottom: '8px' }}>
                        <div style={{ background: '#e0e0e0', padding: '4px', textAlign: 'center', fontWeight: 'bold', fontSize: '10px', borderBottom: '2px solid #333' }}>ACCIONES CORRECTIVAS</div>
                        <div style={{ padding: '4px', minHeight: '50px', fontSize: '9px' }}>{fichaData.acciones_correctivas}</div>
                    </div>

                    {/* Treated Areas */}
                    <div style={{ border: '2px solid #333', marginBottom: '8px' }}>
                        <div style={{ background: '#e0e0e0', padding: '4px', textAlign: 'center', fontWeight: 'bold', fontSize: '10px', borderBottom: '2px solid #333' }}>ÁREAS TRATADAS</div>
                        <div style={{ padding: '4px', minHeight: '50px', fontSize: '9px' }}>{fichaData.areas_tratadas}</div>
                    </div>

                    {/* Technical Staff */}
                    <div style={{ border: '2px solid #333', marginBottom: '8px' }}>
                        <div style={{ background: '#e0e0e0', padding: '4px', textAlign: 'center', fontWeight: 'bold', fontSize: '10px', borderBottom: '2px solid #333' }}>PERSONAL TÉCNICO</div>
                        <div style={{ padding: '4px', minHeight: '35px', fontSize: '9px' }}>{fichaData.personal_tecnico}</div>
                        <div style={{ display: 'flex', borderTop: '2px solid #333' }}>
                            <div style={{ flex: 1, padding: '4px', borderRight: '1px solid #333', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <label style={{ fontWeight: 'bold', fontSize: '9px' }}>HORA INICIO :</label>
                                <div style={{ borderBottom: '1px solid #333', flex: 1, fontSize: '9px' }}>{fichaData.hora_inicio}</div>
                            </div>
                            <div style={{ flex: 1, padding: '4px', borderRight: '1px solid #333', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <label style={{ fontWeight: 'bold', fontSize: '9px' }}>HORA TÉRMINO :</label>
                                <div style={{ borderBottom: '1px solid #333', flex: 1, fontSize: '9px' }}>{fichaData.hora_termino}</div>
                            </div>
                            <div style={{ flex: 1, padding: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <label style={{ fontWeight: 'bold', fontSize: '9px' }}>N° CERTIFICADO :</label>
                                <div style={{ borderBottom: '1px solid #333', flex: 1, fontSize: '9px' }}>{fichaData.numero_certificado}</div>
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
                                        <div style={{ flex: 1, borderBottom: '1px solid #333', fontSize: '9px' }}>{fichaData.obs_rec[`observacion_${letter}` as keyof typeof fichaData.obs_rec]}</div>
                                    </div>
                                ))}
                            </div>
                            <div style={{ flex: 1, padding: '4px' }}>
                                <div style={{ fontWeight: 'bold', textAlign: 'center', marginBottom: '4px', fontSize: '9px' }}>RECOMENDACIONES</div>
                                {['a', 'b', 'c'].map((letter) => (
                                    <div key={letter} style={{ display: 'flex', gap: '4px', marginBottom: '3px' }}>
                                        <span style={{ fontSize: '9px' }}>{letter})</span>
                                        <div style={{ flex: 1, borderBottom: '1px solid #333', fontSize: '9px' }}>{fichaData.obs_rec[`recomendacion_${letter}` as keyof typeof fichaData.obs_rec]}</div>
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
                                <div key={value} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '9px', fontWeight: fichaData.satisfaccion === value ? 'bold' : 'normal', background: fichaData.satisfaccion === value ? '#e0e0e0' : 'transparent', padding: '2px 6px', borderRadius: '3px' }}>
                                    <span style={{ fontSize: '14px' }}>{emoji}</span>
                                    <span>{label}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Signatures */}
                    <div style={{ display: 'flex', justifyContent: 'space-around', margin: '25px 0' }}>
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
