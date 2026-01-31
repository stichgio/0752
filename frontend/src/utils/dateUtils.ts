/**
 * Utilidades para manejo de fechas
 * Centraliza la lógica de conversión de fechas de Excel y formateo
 */

/**
 * Convierte un número serial de Excel a fecha en formato DD/MM/YY
 * Usa cálculo basado en UTC para prevenir cambios por zona horaria
 */
export const excelSerialToDate = (serial: number | string): string | null => {
    const numSerial = Number(serial);
    if (!numSerial || isNaN(numSerial) || numSerial < 1) return null;

    // Excel epoch es Dec 30, 1899 (considerando el bug del año bisiesto 1900)
    // Calculamos en UTC para evitar que la zona horaria afecte el resultado
    const excelEpochMs = Date.UTC(1899, 11, 30, 0, 0, 0);
    const dateMs = excelEpochMs + (numSerial * 24 * 60 * 60 * 1000);
    const date = new Date(dateMs);

    // Usamos métodos UTC para extraer las partes de la fecha
    const day = String(date.getUTCDate()).padStart(2, '0');
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const year = String(date.getUTCFullYear()).slice(-2);

    return `${day}/${month}/${year}`;
};

/**
 * Formatea un valor de fecha a formato DD/MM/YY
 * Soporta: números seriales de Excel, formato ISO, formato DD/MM/YYYY
 */
export const formatDateValue = (value: unknown): string => {
    if (!value || value === '-' || value === '') return '-';

    // Si es un número (serial de Excel), convertirlo
    const numVal = Number(value);
    if (!isNaN(numVal) && numVal > 1000 && numVal < 100000) {
        return excelSerialToDate(numVal) || '-';
    }

    // Si ya es un string de fecha en varios formatos, normalizarlo
    if (typeof value === 'string') {
        // Formato ISO (YYYY-MM-DD)
        const isoMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (isoMatch) {
            return `${isoMatch[3]}/${isoMatch[2]}/${isoMatch[1].slice(-2)}`;
        }

        // Formato DD/MM/YYYY
        const dmyMatch = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
        if (dmyMatch) {
            return `${dmyMatch[1].padStart(2, '0')}/${dmyMatch[2].padStart(2, '0')}/${dmyMatch[3].slice(-2)}`;
        }

        // Ya está en formato DD/MM/YY u otro string, devolver tal cual
        return value;
    }

    return String(value);
};

/**
 * Verifica si un nombre de columna parece ser una columna de fecha
 */
export const isDateColumn = (headerName: string): boolean => {
    const headerUpper = String(headerName || '').toUpperCase();
    return headerUpper.includes('FECHA') || headerUpper.includes('DATE');
};

/**
 * Formatea una fecha Date a string localizado
 */
export const formatDateLocale = (date: Date): string => {
    return date.toLocaleString();
};

/**
 * Obtiene la fecha actual en formato YYYY-MM-DD
 */
export const getCurrentDateISO = (): string => {
    return new Date().toISOString().split('T')[0];
};
