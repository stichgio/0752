export interface ProductoQuimico {
    producto: string;
    composicion: string;
    lote: string;
    fecha_vencimiento: string;
    unidad: string;
    concentracion: string;
    cantidad: string;
}

export interface ServicioEfectuar {
    desinfeccion: boolean;
    limpieza_ambientes: boolean;
    limpieza_pozos_septicos: boolean;
    limpieza_reservorios: boolean;
}

export interface TiposTratamiento {
    pulverizado: boolean;
    atomizado: boolean;
    thermonebulizado: boolean;
    nebulizado_ulv: boolean;
    otros: string;
}

export interface ObservacionesRecomendaciones {
    observacion_a: string;
    observacion_b: string;
    observacion_c: string;
    recomendacion_a: string;
    recomendacion_b: string;
    recomendacion_c: string;
}

export type SatisfaccionType = 'muy_satisfecho' | 'satisfecho' | 'regular' | 'insatisfecho' | '';

export interface FichaTecnica {
    id: string;
    os_numero: string;
    cliente: string;
    fecha: string;
    direccion: string;
    distrito: string;
    servicio: ServicioEfectuar;
    diagnostico_area: string;
    condicion_sanitaria: string;
    tratamiento: TiposTratamiento;
    productos: ProductoQuimico[];
    acciones_correctivas: string;
    areas_tratadas: string;
    personal_tecnico: string[]; // 3 filas x 2 columnas = 6 campos
    hora_inicio: string;
    hora_termino: string;
    numero_certificado: string;
    obs_rec: ObservacionesRecomendaciones;
    satisfaccion: SatisfaccionType;
    status: 'draft' | 'completed';
    last_modified: string;
}

export const createEmptyFicha = (): FichaTecnica => ({
    id: '',
    os_numero: '',
    cliente: '',
    fecha: '',
    direccion: '',
    distrito: '',
    servicio: {
        desinfeccion: false,
        limpieza_ambientes: false,
        limpieza_pozos_septicos: false,
        limpieza_reservorios: false
    },
    diagnostico_area: '',
    condicion_sanitaria: '',
    tratamiento: {
        pulverizado: false,
        atomizado: false,
        thermonebulizado: false,
        nebulizado_ulv: false,
        otros: ''
    },
    productos: [
        { producto: '', composicion: '', lote: '', fecha_vencimiento: '', unidad: '', concentracion: '', cantidad: '' },
        { producto: '', composicion: '', lote: '', fecha_vencimiento: '', unidad: '', concentracion: '', cantidad: '' },
        { producto: '', composicion: '', lote: '', fecha_vencimiento: '', unidad: '', concentracion: '', cantidad: '' },
        { producto: '', composicion: '', lote: '', fecha_vencimiento: '', unidad: '', concentracion: '', cantidad: '' }
    ],
    acciones_correctivas: '',
    areas_tratadas: '',
    personal_tecnico: ['', '', '', '', '', ''],
    hora_inicio: '',
    hora_termino: '',
    numero_certificado: '',
    obs_rec: {
        observacion_a: '',
        observacion_b: '',
        observacion_c: '',
        recomendacion_a: '',
        recomendacion_b: '',
        recomendacion_c: ''
    },
    satisfaccion: '',
    status: 'draft',
    last_modified: ''
});
