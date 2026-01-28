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
    tipo: 'ELEVADO' | 'ENTERRADO' | 'SEMIENTERRADO' | 'APOYADO';
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
    // Per-row observaciones/sugerencias
    observaciones_caja_registro?: string;
    sugerencias_caja_registro?: string;
    observaciones_marco_tapa?: string;
    sugerencias_marco_tapa?: string;
    observaciones_escalera_int?: string;
    sugerencias_escalera_int?: string;
    observaciones_escalera_ext?: string;
    sugerencias_escalera_ext?: string;
    observaciones_cuba_int?: string;
    sugerencias_cuba_int?: string;
    observaciones_cuba_ext?: string;
    sugerencias_cuba_ext?: string;
    observaciones_loza_fondo?: string;
    sugerencias_loza_fondo?: string;
    observaciones_loza_techo_int?: string;
    sugerencias_loza_techo_int?: string;
    observaciones_loza_techo_ext?: string;
    sugerencias_loza_techo_ext?: string;
    observaciones_ducto?: string;
    sugerencias_ducto?: string;
    observaciones_cerco?: string;
    sugerencias_cerco?: string;
    observaciones_descarga?: string;
    sugerencias_descarga?: string;
    [key: string]: CheckState | string | undefined; // Allow string indexing
}

export interface ValvulasCanastillas {
    diametros: { '2': number; '3': number; '4': number; '6': number; '8': number; '10': number; '12'?: number; '14'?: number; };
    aduccion?: { [key: string]: number };
    impulsion?: { [key: string]: number };
    bypass?: { [key: string]: number };
    desague?: { [key: string]: number };
    succion?: { [key: string]: number };
    operativas: number;
    no_operativas: number;
    // Per-row observaciones/sugerencias for valvulas
    observaciones_conduccion?: string;
    sugerencias_conduccion?: string;
    observaciones_impulsion?: string;
    sugerencias_impulsion?: string;
    observaciones_aduccion?: string;
    sugerencias_aduccion?: string;
    observaciones_bypass?: string;
    sugerencias_bypass?: string;
    observaciones_desague?: string;
    sugerencias_desague?: string;
    observaciones_succion?: string;
    sugerencias_succion?: string;
    [key: string]: any; // Allow string indexing
}

export interface MedidasData {
    diametro?: string;
    diametro_interno?: string;
    altura_util?: string;
    altura_total?: string;
    observaciones_diametro?: string;
    sugerencias_diametro?: string;
    observaciones_diametro_interno?: string;
    sugerencias_diametro_interno?: string;
    observaciones_altura_util?: string;
    sugerencias_altura_util?: string;
    observaciones_altura_total?: string;
    sugerencias_altura_total?: string;
    [key: string]: string | undefined;
}

export interface TechnicalReport {
    id: string;
    metadata: ReportMetadata;
    header: ReportHeader;
    inspeccion: InspeccionDescripcion;
    valvulas: ValvulasCanastillas;
    canastillas: ValvulasCanastillas;
    medidas?: MedidasData;
    observaciones: string;
    sugerencias: string;
    status: 'draft' | 'completed';
    last_modified: string;
}
