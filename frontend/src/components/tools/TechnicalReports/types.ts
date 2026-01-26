export type CheckState = 'normal' | 'critico' | 'unchecked';

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
    tipo: 'ELEVADO' | 'ENTERRADO' | 'SEMIENTERRADO';
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
    [key: string]: CheckState; // Allow string indexing
}

export interface ValvulasCanastillas {
    diametros: { '2': number; '3': number; '4': number; '6': number; '8': number; '10': number; '12': number; };
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
    status: 'draft' | 'completed';
    last_modified: string;
}
