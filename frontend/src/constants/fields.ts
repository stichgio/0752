/**
 * Definición de campos para reportes
 */

export interface ReportField {
    id: string;
    label: string;
}

export const REPORT_FIELDS: ReportField[] = [
    { id: 'centro', label: 'Centro' },
    { id: 'nis', label: 'NIS' },
    { id: 'ot', label: 'Nro OT' },
    { id: 'direccion', label: 'Dirección' },
    { id: 'localidad', label: 'Localidad' },
    { id: 'distrito', label: 'Distrito' },
    { id: 'estado', label: 'Estado' },
    { id: 'tipo-red', label: 'Tipo Red' },
    { id: 'sector', label: 'Sector' },
    { id: 'actividad', label: 'Actividad' },
    { id: 'contrata', label: 'Contrata' },
    { id: 'subactividad', label: 'Subactividad' },
    { id: 'cuadrilla', label: 'Cuadrilla' },
    { id: 'obs-sedapal', label: 'Obs. SEDAPAL' },
    { id: 'obs-contrata', label: 'Obs. Contrata' },
    { id: 'observaciones', label: 'Obs. Finales' },
    { id: 'fecha-corte', label: 'Fecha Corte' },
    { id: 'direcciones-afectadas', label: 'Dir. Afectadas' }
];

/**
 * Mapeo de claves de template a nombres de columnas
 */
export const TEMPLATE_KEY_MAP: Record<string, string> = {
    'centro': 'CENTRO',
    'nis': 'NIS',
    'ot': 'OT',
    'direccion': 'DIRECCION',
    'localidad': 'LOCALIDAD',
    'distrito': 'DISTRITO',
    'estado': 'ESTADO',
    'tipo-red': 'TIPO RED',
    'sector': 'SECTOR',
    'actividad': 'ACTIVIDAD',
    'contrata': 'CONTRATA',
    'subactividad': 'SUBACTIVIDAD',
    'cuadrilla': 'CUADRILLA',
    'obs-sedapal': 'OBSERVACION SEDAPAL',
    'obs-contrata': 'OBSERVACION CONTRATA',
    'fecha-corte': 'FECHA CORTE',
    'fecha_corte': 'FECHA CORTE',
    'direcciones-afectadas': 'DIRECCIONES AFECTADAS'
};

/**
 * Campos que son de tipo fecha
 */
export const DATE_FIELDS = ['fecha-corte', 'fecha_corte'];

/**
 * Cabeceras para la plantilla de Excel descargable
 */
export const TEMPLATE_HEADERS = [
    'ID_ORDEN',
    'CENTRO', 'NIS', 'OT',
    'DIRECCION', 'LOCALIDAD', 'DISTRITO', 'ESTADO',
    'TIPO_RED', 'SECTOR', 'ACTIVIDAD',
    'CONTRATA', 'SUBACTIVIDAD', 'CUADRILLA',
    'OBS_SEDAPAL', 'OBS_CONTRATA', 'OBS_FINALES'
];
