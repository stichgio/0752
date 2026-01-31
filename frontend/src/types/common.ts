/**
 * Tipos comunes compartidos en la aplicación
 */

/**
 * Plantilla personalizada
 */
export interface CustomTemplate {
    name: string;
    content: string;
    isBackendTemplate: boolean;
}

/**
 * Columna personalizada definida por el usuario
 */
export interface CustomColumn {
    id: string;
    name: string;
    mappedTo: string;
}

/**
 * Mapeo de columnas Excel a campos del reporte
 */
export type ColumnMappings = Record<string, string>;

/**
 * Opciones de exportación
 */
export type ExportScope = 'single' | 'all';
export type ExportFormat = 'consolidated' | 'individual';

/**
 * Estado del template
 */
export type TemplateStatus = 'valid' | 'invalid' | null;

/**
 * Estados de status genérico
 */
export type Status = 'draft' | 'completed';
