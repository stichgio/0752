// Tipos para informes técnicos - sincronizados con backend/technical_reports/models.py

export type CheckState = 'normal' | 'critico' | 'unchecked';
export type ReportStatus = 'draft' | 'completed';

export interface ReportMetadata {
    informe_id: number;
    dia: number;
    mes: string;
    anio: number;
    pagina: string;
}

export interface ReportHeader {
    cs: string;
    contratista: string;
    codigo_infraestructura: string;
    ubicacion: string;
    suministro: string;
    tipo: string; // Flexible, acepta cualquier string
    volumen: number;
}

export interface InspeccionDescripcion {
    caja_registro: CheckState;
    marco_tapa: CheckState;
    escalera_interior: CheckState;
    escalera_exterior: CheckState;
    cuba_interior: CheckState;
    cuba_exterior: CheckState;
    loza_fondo: CheckState;
    loza_techo_interior: CheckState;
    loza_techo_exterior: CheckState;
    ducto_ventilacion: CheckState;
    cerco_perimetrico: CheckState;
    descarga: CheckState;
}

export interface DiametrosMap {
    '2': number;
    '3': number;
    '4': number;
    '6': number;
    '8': number;
    '10': number;
    '12': number;
    [key: string]: number; // Index signature para acceso dinámico
}

export interface ValvulasCanastillas {
    diametros: DiametrosMap;
    operativas: number;
    no_operativas: number;
}

export interface TechnicalReport {
    id: string;
    metadata: ReportMetadata;
    header: ReportHeader;
    inspeccion: InspeccionDescripcion;
    valvulas: ValvulasCanastillas;
    canastillas: ValvulasCanastillas;
    observaciones: string;
    sugerencias: string;
    status: ReportStatus;
    last_modified: string;
}

export interface ReportListItem {
    id: string;
    informe_id: number;
    cs: string;
    codigo_infraestructura: string;
    status: ReportStatus;
    last_modified: string;
}

// Helper para crear un reporte vacío
export function createEmptyReport(id: number): TechnicalReport {
    return {
        id: `RPT-${id.toString().padStart(4, '0')}`,
        metadata: {
            informe_id: id,
            dia: 1,
            mes: '',
            anio: new Date().getFullYear(),
            pagina: '1 de 2'
        },
        header: {
            cs: '',
            contratista: '',
            codigo_infraestructura: '',
            ubicacion: '',
            suministro: '',
            tipo: 'ELEVADO',
            volumen: 0
        },
        inspeccion: {
            caja_registro: 'unchecked',
            marco_tapa: 'unchecked',
            escalera_interior: 'unchecked',
            escalera_exterior: 'unchecked',
            cuba_interior: 'unchecked',
            cuba_exterior: 'unchecked',
            loza_fondo: 'unchecked',
            loza_techo_interior: 'unchecked',
            loza_techo_exterior: 'unchecked',
            ducto_ventilacion: 'unchecked',
            cerco_perimetrico: 'unchecked',
            descarga: 'unchecked'
        },
        valvulas: {
            diametros: { '2': 0, '3': 0, '4': 0, '6': 0, '8': 0, '10': 0, '12': 0 },
            operativas: 0,
            no_operativas: 0
        },
        canastillas: {
            diametros: { '2': 0, '3': 0, '4': 0, '6': 0, '8': 0, '10': 0, '12': 0 },
            operativas: 0,
            no_operativas: 0
        },
        observaciones: '',
        sugerencias: '',
        status: 'draft',
        last_modified: new Date().toISOString()
    };
}
