import { useState, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { excelSerialToDate, isDateColumn } from '../utils/dateUtils';

interface ExcelData {
    headers: string[];
    data: Record<string, unknown>[];
}

interface UseExcelParserReturn {
    headers: string[];
    data: Record<string, unknown>[];
    isLoading: boolean;
    error: string | null;
    parseFile: (file: File) => void;
    reset: () => void;
}

/**
 * Hook para parsear archivos Excel/CSV
 */
export function useExcelParser(): UseExcelParserReturn {
    const [headers, setHeaders] = useState<string[]>([]);
    const [data, setData] = useState<Record<string, unknown>[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const parseFile = useCallback((file: File) => {
        setIsLoading(true);
        setError(null);

        const reader = new FileReader();

        reader.onload = (evt) => {
            try {
                const bstr = evt.target?.result;
                // Usar cellDates:false para obtener números crudos para fechas
                const wb = XLSX.read(bstr, { type: 'binary', cellDates: false, cellNF: true });
                const wsname = wb.SheetNames[0];
                const ws = wb.Sheets[wsname];

                // Usar opción raw para obtener valores originales
                const jsonData = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, dateNF: 'dd/mm/yy' }) as unknown[][];

                if (jsonData.length > 0) {
                    const _headers = jsonData[0] as string[];
                    const _data = jsonData.slice(1).map(row => {
                        const obj: Record<string, unknown> = {};
                        _headers.forEach((h, i) => {
                            let cellValue = (row as unknown[])[i];

                            // Verificar si parece ser una columna de fecha y el valor es un número serial de Excel
                            if (isDateColumn(h) && typeof cellValue === 'number' && cellValue > 1000 && cellValue < 100000) {
                                cellValue = excelSerialToDate(cellValue);
                            }

                            obj[h] = cellValue;
                        });
                        return obj;
                    });

                    setHeaders(_headers);
                    setData(_data);
                }
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Error al parsear archivo');
            } finally {
                setIsLoading(false);
            }
        };

        reader.onerror = () => {
            setError('Error al leer el archivo');
            setIsLoading(false);
        };

        reader.readAsBinaryString(file);
    }, []);

    const reset = useCallback(() => {
        setHeaders([]);
        setData([]);
        setError(null);
    }, []);

    return {
        headers,
        data,
        isLoading,
        error,
        parseFile,
        reset
    };
}

export default useExcelParser;
