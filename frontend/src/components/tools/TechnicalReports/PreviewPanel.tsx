import React from 'react';
import { TechnicalReport } from './types';

interface Props {
    reportData: TechnicalReport | null;
    zoom: number;
    logoLeft?: string | null;
    logoRight?: string | null;
}

export default function PreviewPanel({ reportData, zoom, logoLeft, logoRight }: Props) {
    if (!reportData) {
        return (
            <div className="flex items-center justify-center h-full bg-[#111] rounded-lg border border-[#333]">
                <div className="text-center text-[#666]">
                    <p className="text-lg font-medium">Selecciona un informe</p>
                    <p className="text-sm mt-2">para ver la vista previa</p>
                </div>
            </div>
        );
    }

    const renderCheck = (state: string, type: 'normal' | 'critico') => {
        if (state === type) {
            return <span className={type === 'critico' ? 'text-[#c00] font-bold' : 'text-black font-bold'}>X</span>;
        }
        return null;
    };

    const logoLeftUrl = logoLeft;
    const logoRightUrl = logoRight;

    // Styles matching the HTML template exactly
    const styles = {
        page: {
            width: '210mm',
            minHeight: '297mm',
            padding: '8px', // Matching page-container padding
            backgroundColor: '#fff',
            fontFamily: "'Segoe UI', Calibri, Arial, sans-serif",
            fontSize: '7.5pt',
            lineHeight: '1.15',
            color: '#333',
            boxSizing: 'border-box' as const,
        },
        header: {
            display: 'grid',
            gridTemplateColumns: '120px 1fr 120px',
            gap: '8px',
            alignItems: 'center',
            padding: '8px 10px',
            background: 'linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%)',
            border: '2px solid #0066a1',
            borderRadius: '6px',
            marginBottom: '6px',
        },
        sedapalText: {
            fontSize: '18pt',
            fontWeight: 'bold',
            color: '#0066a1',
            fontFamily: "'Arial Black', Arial, sans-serif",
            letterSpacing: '-1px',
            textShadow: '1px 1px 2px rgba(0,0,0,0.1)',
            textAlign: 'center' as const,
        },
        headerTitle: {
            fontSize: '11pt',
            fontWeight: 'bold',
            color: '#0066a1',
            textTransform: 'uppercase' as const,
            textAlign: 'center' as const,
            lineHeight: '1.2',
            margin: 0,
        },
        metaBox: {
            display: 'flex',
            justifyContent: 'flex-end',
            marginBottom: '6px',
        },
        metaTable: {
            borderCollapse: 'collapse' as const,
            border: '1px solid #ccc',
            fontSize: '7pt',
        },
        metaCell: {
            padding: '3px 6px',
            border: '1px solid #ccc',
            textAlign: 'center' as const,
        },
        metaLabel: {
            background: '#0066a1',
            color: '#fff',
            fontWeight: 'bold',
            textAlign: 'left' as const,
        },
        infoSection: {
            border: '1px solid #999',
            borderRadius: '4px',
            overflow: 'hidden',
            marginBottom: '6px',
        },
        infoRow: {
            display: 'grid',
            borderBottom: '1px solid #ccc',
        },
        infoLabel: {
            fontWeight: 'bold',
            padding: '3px 8px',
            background: '#e9ecef',
            borderRight: '1px solid #ccc',
            display: 'flex',
            alignItems: 'center',
            fontSize: '7pt',
        },
        infoValue: {
            padding: '3px 8px',
            borderRight: '1px solid #ccc',
            display: 'flex',
            alignItems: 'center',
            fontSize: '7pt',
        },
        table: {
            width: '100%',
            borderCollapse: 'collapse' as const,
            marginBottom: '4px',
            fontSize: '7pt',
            tableLayout: 'fixed' as const,
        },
        th: {
            border: '1px solid #999',
            padding: '2px 4px',
            verticalAlign: 'middle',
            background: '#0066a1',
            color: '#fff',
            textTransform: 'uppercase' as const,
            fontSize: '6.5pt',
            textAlign: 'center' as const,
        },
        td: {
            border: '1px solid #999',
            padding: '2px 4px',
            verticalAlign: 'middle',
            background: '#fff',
        },
        rowLabel: {
            background: '#e9ecef',
            fontWeight: 'bold',
        },
        subLabel: {
            fontWeight: 600,
            paddingLeft: '12px',
            background: '#f8f9fa',
        },
    };

    return (
        <div className="h-full overflow-auto bg-gray-900 p-8 rounded-lg border border-gray-800">
            <div
                className="mx-auto !bg-white !text-black shadow-lg"
                style={{
                    ...styles.page,
                    transform: `scale(${zoom / 100})`,
                    transformOrigin: 'top center',
                }}
            >
                {/* HEADER */}
                <div style={styles.header}>
                    <div className="flex flex-col items-center justify-center h-[50px]">
                        {logoLeftUrl ? (
                            <img src={logoLeftUrl} style={{ maxWidth: '100%', maxHeight: '45px', objectFit: 'contain' }} />
                        ) : (
                            <>
                                <div style={styles.sedapalText}>sedapal</div>
                                <div style={{ width: '80px', marginTop: '3px' }}>
                                    <div style={{ height: '3px', background: 'linear-gradient(90deg, #0066a1, #0088cc)', borderRadius: '2px' }}></div>
                                    <div style={{ height: '2px', background: 'linear-gradient(90deg, #66b3d9, #99cce6)', marginTop: '2px', borderRadius: '1px' }}></div>
                                </div>
                            </>
                        )}
                    </div>
                    <div>
                        <h1 style={styles.headerTitle}>
                            Informe Técnico de Limpieza y<br />Desinfección de Reservorios y Cisternas
                        </h1>
                    </div>
                    <div className="flex flex-col items-center justify-center h-[50px]">
                        {logoRightUrl ? (
                            <img src={logoRightUrl} style={{ maxWidth: '100%', maxHeight: '45px', objectFit: 'contain' }} />
                        ) : (
                            <>
                                <div style={{ fontSize: '8pt', fontWeight: 'bold', color: '#333' }}>
                                    HIDROSERVICI<span style={{ color: '#d4a017' }}>✪</span>S <span style={{ fontSize: '12pt', fontWeight: 'bold', color: '#d4a017' }}>AA</span>
                                </div>
                                <div style={{ fontSize: '7pt', fontWeight: 'bold', color: '#666' }}>E.I.R.L.</div>
                            </>
                        )}
                    </div>
                </div>

                {/* METADATA */}
                <div style={styles.metaBox}>
                    <table style={styles.metaTable}>
                        <tbody>
                            <tr>
                                <td style={{ ...styles.metaCell, ...styles.metaLabel }}>INFORME</td>
                                <td style={{ ...styles.metaCell, width: '50px' }}>{reportData.metadata.informe_id}</td>
                                <td style={{ ...styles.metaCell, ...styles.metaLabel }}>DÍA</td>
                                <td style={{ ...styles.metaCell, width: '35px' }}>{reportData.metadata.dia}</td>
                                <td style={{ ...styles.metaCell, ...styles.metaLabel }}>MES</td>
                                <td style={{ ...styles.metaCell, width: '50px' }}>{reportData.metadata.mes}</td>
                                <td style={{ ...styles.metaCell, ...styles.metaLabel }}>AÑO</td>
                                <td style={{ ...styles.metaCell, width: '45px' }}>{reportData.metadata.anio}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                {/* INFO SECTION */}
                <div style={styles.infoSection}>
                    <div style={{ ...styles.infoRow, gridTemplateColumns: '100px 1fr' }}>
                        <div style={styles.infoLabel}>C.S :</div>
                        <div style={styles.infoValue}>{reportData.header.cs}</div>
                    </div>
                    <div style={{ ...styles.infoRow, gridTemplateColumns: '100px 1fr' }}>
                        <div style={styles.infoLabel}>CONTRATISTA :</div>
                        <div style={styles.infoValue}>{reportData.header.contratista}</div>
                    </div>
                    <div style={{ ...styles.infoRow, gridTemplateColumns: '180px 1fr' }}>
                        <div style={styles.infoLabel}>CÓDIGO DE INFRAESTRUCTURA :</div>
                        <div style={{ ...styles.infoValue, fontWeight: 'bold', color: '#0066a1', justifyContent: 'center' }}>{reportData.header.codigo_infraestructura}</div>
                    </div>
                    <div style={{ ...styles.infoRow, gridTemplateColumns: '100px 1fr 80px 100px' }}>
                        <div style={styles.infoLabel}>UBICACIÓN :</div>
                        <div style={styles.infoValue}>{reportData.header.ubicacion}</div>
                        <div style={styles.infoLabel}>TIPO :</div>
                        <div style={{ ...styles.infoValue, justifyContent: 'center' }}>{reportData.header.tipo}</div>
                    </div>
                    <div style={{ ...styles.infoRow, gridTemplateColumns: '100px 1fr 80px 100px', borderBottom: 'none' }}>
                        <div style={styles.infoLabel}>SUMINISTRO :</div>
                        <div style={styles.infoValue}>{reportData.header.suministro}</div>
                        <div style={styles.infoLabel}>VOLUMEN :</div>
                        <div style={{ ...styles.infoValue, justifyContent: 'center' }}>{reportData.header.volumen}</div>
                    </div>
                </div>

                {/* INSPECTION TABLE */}
                <table style={styles.table}>
                    <thead>
                        <tr>
                            <th colSpan={2} style={{ ...styles.th, width: '31.5%' }}>Descripción</th>
                            <th colSpan={2} style={styles.th}>Estado</th>
                            <th rowSpan={2} style={{ ...styles.th, width: '17%' }}>Observaciones</th>
                            <th rowSpan={2} style={{ ...styles.th, width: '18%' }}>Sugerencias</th>
                        </tr>
                        <tr>
                            <th colSpan={2} style={styles.th}></th>
                            <th style={{ ...styles.th, width: '7.5%' }}>Normal</th>
                            <th style={{ ...styles.th, width: '7.5%' }}>Crítico</th>
                        </tr>
                    </thead>
                    <tbody>
                        {[
                            { key: 'caja_registro', label: 'CAJA DE REGISTRO' },
                            { key: 'marco_tapa', label: 'MARCO Y TAPA SANITARIA' },
                        ].map(item => (
                            <tr key={item.key}>
                                <td colSpan={2} style={{ ...styles.td, ...styles.rowLabel }}>{item.label}</td>
                                <td style={{ ...styles.td, textAlign: 'center' }}>{renderCheck(reportData.inspeccion[item.key], 'normal')}</td>
                                <td style={{ ...styles.td, textAlign: 'center' }}>{renderCheck(reportData.inspeccion[item.key], 'critico')}</td>
                                <td style={{ ...styles.td, fontSize: '7pt' }}>{reportData.inspeccion[item.key] === 'critico' ? reportData.observaciones : ''}</td>
                                <td style={{ ...styles.td, fontSize: '7pt' }}>{reportData.inspeccion[item.key] === 'critico' ? reportData.sugerencias : ''}</td>
                            </tr>
                        ))}

                        {/* ESCALERA */}
                        <tr>
                            <td rowSpan={2} style={{ ...styles.td, ...styles.rowLabel, width: '11%', textAlign: 'center' }}>ESCALERA</td>
                            <td style={{ ...styles.td, ...styles.subLabel }}>INTERIOR</td>
                            <td style={{ ...styles.td, textAlign: 'center' }}>{renderCheck(reportData.inspeccion.escalera_interior, 'normal')}</td>
                            <td style={{ ...styles.td, textAlign: 'center' }}>{renderCheck(reportData.inspeccion.escalera_interior, 'critico')}</td>
                            <td style={{ ...styles.td, fontSize: '7pt' }}>{reportData.inspeccion.escalera_interior === 'critico' ? reportData.observaciones : ''}</td>
                            <td style={{ ...styles.td, fontSize: '7pt' }}>{reportData.inspeccion.escalera_interior === 'critico' ? reportData.sugerencias : ''}</td>
                        </tr>
                        <tr>
                            <td style={{ ...styles.td, ...styles.subLabel }}>EXTERIOR</td>
                            <td style={{ ...styles.td, textAlign: 'center' }}>{renderCheck(reportData.inspeccion.escalera_exterior, 'normal')}</td>
                            <td style={{ ...styles.td, textAlign: 'center' }}>{renderCheck(reportData.inspeccion.escalera_exterior, 'critico')}</td>
                            <td style={{ ...styles.td }}></td>
                            <td style={{ ...styles.td }}></td>
                        </tr>

                        {/* CUBA */}
                        <tr>
                            <td rowSpan={2} style={{ ...styles.td, ...styles.rowLabel, textAlign: 'center' }}>CUBA</td>
                            <td style={{ ...styles.td, ...styles.subLabel }}>INTERIOR</td>
                            <td style={{ ...styles.td, textAlign: 'center' }}>{renderCheck(reportData.inspeccion.cuba_interior, 'normal')}</td>
                            <td style={{ ...styles.td, textAlign: 'center' }}>{renderCheck(reportData.inspeccion.cuba_interior, 'critico')}</td>
                            <td style={{ ...styles.td, fontSize: '7pt' }}>{reportData.inspeccion.cuba_interior === 'critico' ? reportData.observaciones : ''}</td>
                            <td style={{ ...styles.td, fontSize: '7pt' }}>{reportData.inspeccion.cuba_interior === 'critico' ? reportData.sugerencias : ''}</td>
                        </tr>
                        <tr>
                            <td style={{ ...styles.td, ...styles.subLabel }}>EXTERIOR</td>
                            <td style={{ ...styles.td, textAlign: 'center' }}>{renderCheck(reportData.inspeccion.cuba_exterior, 'normal')}</td>
                            <td style={{ ...styles.td, textAlign: 'center' }}>{renderCheck(reportData.inspeccion.cuba_exterior, 'critico')}</td>
                            <td style={{ ...styles.td }}></td>
                            <td style={{ ...styles.td }}></td>
                        </tr>

                        {/* Others */}
                        <tr>
                            <td colSpan={2} style={{ ...styles.td, ...styles.rowLabel }}>LOZA DE FONDO</td>
                            <td style={{ ...styles.td, textAlign: 'center' }}>{renderCheck(reportData.inspeccion.loza_fondo, 'normal')}</td>
                            <td style={{ ...styles.td, textAlign: 'center' }}>{renderCheck(reportData.inspeccion.loza_fondo, 'critico')}</td>
                            <td style={{ ...styles.td }}></td>
                            <td style={{ ...styles.td }}></td>
                        </tr>

                        {/* LOZA TECHO */}
                        <tr>
                            <td rowSpan={2} style={{ ...styles.td, ...styles.rowLabel, textAlign: 'center' }}>LOZA DE TECHO</td>
                            <td style={{ ...styles.td, ...styles.subLabel }}>INTERIOR</td>
                            <td style={{ ...styles.td, textAlign: 'center' }}>{renderCheck(reportData.inspeccion.loza_techo_interior, 'normal')}</td>
                            <td style={{ ...styles.td, textAlign: 'center' }}>{renderCheck(reportData.inspeccion.loza_techo_interior, 'critico')}</td>
                            <td style={{ ...styles.td }}>{reportData.inspeccion.loza_techo_interior === 'critico' ? reportData.observaciones : ''}</td>
                            <td style={{ ...styles.td }}>{reportData.inspeccion.loza_techo_interior === 'critico' ? reportData.sugerencias : ''}</td>
                        </tr>
                        <tr>
                            <td style={{ ...styles.td, ...styles.subLabel }}>EXTERIOR</td>
                            <td style={{ ...styles.td, textAlign: 'center' }}>{renderCheck(reportData.inspeccion.loza_techo_exterior, 'normal')}</td>
                            <td style={{ ...styles.td, textAlign: 'center' }}>{renderCheck(reportData.inspeccion.loza_techo_exterior, 'critico')}</td>
                            <td style={{ ...styles.td }}></td>
                            <td style={{ ...styles.td }}></td>
                        </tr>

                        {[
                            { key: 'ducto_ventilacion', label: 'DUCTO DE VENTILACIÓN' },
                            { key: 'cerco_perimetrico', label: 'CERCO PERIMÉTRICO' },
                            { key: 'descarga', label: 'DESCARGA' },
                        ].map(item => (
                            <tr key={item.key}>
                                <td colSpan={2} style={{ ...styles.td, ...styles.rowLabel }}>{item.label}</td>
                                <td style={{ ...styles.td, textAlign: 'center' }}>{renderCheck(reportData.inspeccion[item.key], 'normal')}</td>
                                <td style={{ ...styles.td, textAlign: 'center' }}>{renderCheck(reportData.inspeccion[item.key], 'critico')}</td>
                                <td style={{ ...styles.td }}>{reportData.inspeccion[item.key] === 'critico' ? reportData.observaciones : ''}</td>
                                <td style={{ ...styles.td }}>{reportData.inspeccion[item.key] === 'critico' ? reportData.sugerencias : ''}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>

                {/* VALVULAS TABLE */}
                <table style={styles.table}>
                    <colgroup>
                        <col style={{ width: '11%' }} />
                        <col span={7} />
                        <col style={{ width: '5%' }} />
                        <col style={{ width: '5%' }} />
                        <col style={{ width: '17%' }} />
                        <col style={{ width: '18%' }} />
                    </colgroup>
                    <thead>
                        <tr>
                            <th rowSpan={2} style={styles.th}>Válvulas</th>
                            <th colSpan={7} style={styles.th}>Diámetro de Válvulas</th>
                            <th rowSpan={2} style={styles.th}>Oper.</th>
                            <th rowSpan={2} style={styles.th}>No Op.</th>
                            <th rowSpan={2} style={styles.th}>Observaciones</th>
                            <th rowSpan={2} style={styles.th}>Sugerencias</th>
                        </tr>
                        <tr>
                            {['2\'\'', '3\'\'', '4\'\'', '6\'\'', '8\'\'', '10\'\'', '12\''].map(d => (
                                <th key={d} style={styles.th}>{d}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td style={{ ...styles.td, ...styles.rowLabel }}>CONDUCCIÓN</td>
                            {['2', '3', '4', '6', '8', '10', '12'].map(d => (
                                <td key={d} style={{ ...styles.td, textAlign: 'center' }}>{reportData.valvulas.diametros[d] || ''}</td>
                            ))}
                            <td style={styles.td}></td><td style={styles.td}></td><td style={styles.td}></td><td style={styles.td}></td>
                        </tr>
                        {['ADUCCIÓN', 'BY PASS', 'DESAGÜE'].map(type => (
                            <tr key={type}>
                                <td style={{ ...styles.td, ...styles.rowLabel }}>{type}</td>
                                <td colSpan={7} style={styles.td}></td>
                                <td style={styles.td}></td><td style={styles.td}></td><td style={styles.td}></td><td style={styles.td}></td>
                            </tr>
                        ))}
                        <tr style={{ background: '#d4d8dd' }}>
                            <td style={{ ...styles.td, ...styles.rowLabel }}>TOTAL</td>
                            <td colSpan={7} style={styles.td}></td>
                            <td style={{ ...styles.td, textAlign: 'center', fontWeight: 'bold' }}>{reportData.valvulas.operativas}</td>
                            <td style={{ ...styles.td, textAlign: 'center', fontWeight: 'bold' }}>{reportData.valvulas.no_operativas}</td>
                            <td style={styles.td}></td><td style={styles.td}></td>
                        </tr>
                    </tbody>
                </table>

                {/* CANASTILLA TABLE */}
                <table style={styles.table}>
                    <colgroup>
                        <col style={{ width: '11%' }} />
                        <col span={7} />
                        <col style={{ width: '5%' }} />
                        <col style={{ width: '5%' }} />
                        <col style={{ width: '17%' }} />
                        <col style={{ width: '18%' }} />
                    </colgroup>
                    <thead>
                        <tr>
                            <th rowSpan={2} style={styles.th}>Canastilla</th>
                            <th colSpan={7} style={styles.th}>Diámetro de Canastilla</th>
                            <th rowSpan={2} style={styles.th}>Oper.</th>
                            <th rowSpan={2} style={styles.th}>No Op.</th>
                            <th rowSpan={2} style={styles.th}>Observaciones</th>
                            <th rowSpan={2} style={styles.th}>Sugerencias</th>
                        </tr>
                        <tr>
                            {['2\'\'', '3\'\'', '4\'\'', '6\'\'', '8\'\'', '10\'\'', '12\''].map(d => (
                                <th key={d} style={styles.th}>{d}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td style={{ ...styles.td, ...styles.rowLabel }}>ADUCCION</td>
                            {['2', '3', '4', '6', '8', '10', '12'].map(d => (
                                <td key={d} style={{ ...styles.td, textAlign: 'center' }}>{reportData.canastillas.diametros[d] || ''}</td>
                            ))}
                            <td style={styles.td}></td>
                            <td style={styles.td}></td>
                            <td style={{ ...styles.td, textAlign: 'center', fontWeight: 'bold', color: '#c00' }}>
                                {reportData.canastillas.no_operativas > 0 ? 'NO TIENE' : ''}
                            </td>
                            <td style={{ ...styles.td, textAlign: 'center', fontWeight: 'bold', color: '#c00' }}>
                                {reportData.canastillas.no_operativas > 0 ? 'INSTALAR' : ''}
                            </td>
                        </tr>
                        <tr style={{ background: '#d4d8dd' }}>
                            <td style={{ ...styles.td, ...styles.rowLabel }}>TOTAL</td>
                            <td colSpan={7} style={styles.td}></td>
                            <td style={{ ...styles.td, textAlign: 'center', fontWeight: 'bold' }}>{reportData.canastillas.operativas}</td>
                            <td style={{ ...styles.td, textAlign: 'center', fontWeight: 'bold' }}>{reportData.canastillas.no_operativas}</td>
                            <td style={styles.td}></td><td style={styles.td}></td>
                        </tr>
                    </tbody>
                </table>

                {/* MEDIDAS TABLE */}
                <table style={styles.table}>
                    <colgroup>
                        <col style={{ width: '65%' }} />
                        <col style={{ width: '17%' }} />
                        <col style={{ width: '18%' }} />
                    </colgroup>
                    <thead>
                        <tr>
                            <th style={styles.th}>Medidas</th>
                            <th style={styles.th}>U/M</th>
                            <th style={styles.th}>Cantidad</th>
                        </tr>
                    </thead>
                    <tbody>
                        {[
                            'DIAMETRO', 'DIAMETRO INTERNO', 'ALTURA UTIL', 'ALTURA TOTAL'
                        ].map(m => (
                            <tr key={m}>
                                <td style={{ ...styles.td, ...styles.rowLabel }}>{m}</td>
                                <td style={{ ...styles.td, textAlign: 'center' }}>M</td>
                                <td style={styles.td}></td>
                            </tr>
                        ))}
                    </tbody>
                </table>

                {/* ACTIVIDADES TABLE */}
                <table style={styles.table}>
                    <colgroup>
                        <col style={{ width: '11%' }} />
                        <col />
                    </colgroup>
                    <thead>
                        <tr>
                            <th colSpan={2} style={styles.th}>Actividades Ejecutadas</th>
                        </tr>
                    </thead>
                    <tbody>
                        {[
                            'SEÑALIZACION DE LA ZONA DE TRABAJO',
                            'LLENADO DE FORMATOS: ATS, ALTURA.',
                            'DESCARGA DE HERRAMIENTAS, EQUIPOS E INSUMOS DEL VEHICULO',
                            'VENTILACION DE LA ESTRUCTURA DE ALMACENAMIENTO DE AGUA',
                            'INSTALACION DEL SISTEMA DE ILUMINACION',
                            'TRASLADO E INGRESO DE HERRAMIENTAS NECESARIOS PARA INICIAR LA LIMPIEZA',
                            'RASQUETEO DE LAS PAREDES, PISO Y TECHO CON AYUDA DE HERRAMIENTAS Y EL AGUA',
                            'ENJUAGUE Y DESCARGA DEL AGUA DE LIMPIEZA',
                            'PREPARACION DE LA SOLUCION DE HIPOCLORITO DE CALCIO',
                            'DESINFECCION CON AYUDA DE LA BOMBA DE ALTA PRESION',
                            'SE PROCEDE A CARGAR LAS HERRAMIENTAS, EQUIPOS Y SEÑALIZACION AL VEHICULO.'
                        ].map((act, idx) => (
                            <tr key={idx}>
                                <td style={{ ...styles.td, ...styles.rowLabel, textAlign: 'center' }}>{idx + 1}</td>
                                <td style={{ ...styles.td, paddingLeft: '10px' }}>{act}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>

            </div>
        </div>
    );
}
