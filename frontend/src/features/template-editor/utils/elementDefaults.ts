import { TemplateElement, TableData } from '../canvasTypes';

// Default dimensions in mm
export const ELEMENT_DEFAULTS: Record<string, Partial<TemplateElement>> = {
    header: { size: { width: 203, height: 16 }, style: { zIndex: 1 } },
    'info-bar': { size: { width: 203, height: 10 }, style: { zIndex: 1 } },
    'section-title': { size: { width: 203, height: 8 }, style: { zIndex: 1 } },
    'data-grid': { size: { width: 203, height: 21 }, style: { zIndex: 1 } },
    'photo-grid': { size: { width: 203, height: 53 }, style: { zIndex: 1 } },
    text: { size: { width: 98, height: 16 }, style: { zIndex: 1 } },
    table: { size: { width: 203, height: 32 }, style: { zIndex: 1 } },
    signature: {
        size: { width: 203, height: 21 },
        style: { zIndex: 1 },
        title: 'SUPERVISOR',
        signatureName: '',
        signatureConfig: [{ title: 'SUPERVISOR', name: '' }],
    },
    footer: { size: { width: 203, height: 8 }, style: { zIndex: 1 } },
    spacer: { size: { width: 203, height: 5 }, style: { zIndex: 1 } },
    shape: { size: { width: 50, height: 50 }, style: { zIndex: 1 } },
    divider: { size: { width: 203, height: 2 }, style: { zIndex: 1 } },
    qr: { size: { width: 26, height: 26 }, style: { zIndex: 1 } },
};

// Full width elements that should stack vertically
export const FLOW_ELEMENTS = [
    'header', 'info-bar', 'section-title', 'data-grid',
    'photo-grid', 'table', 'signature', 'footer',
];

export const defaultTable: TableData = {
    rowCount: 2,
    colCount: 2,
    data: [['', ''], ['', '']],
    borderColor: '#d1d5db',
    colWidths: [50, 50],
    rowHeights: [50, 50],
};

function toSafeCount(value: unknown, fallback: number): number {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(1, Math.floor(n));
}

function buildGridData(rowCount: number, colCount: number, source?: unknown): string[][] {
    const src = Array.isArray(source) ? source : [];
    return Array.from({ length: rowCount }, (_, r) =>
        Array.from({ length: colCount }, (_, c) => {
            const value = Array.isArray(src[r]) ? src[r][c] : '';
            return value == null ? '' : String(value);
        })
    );
}

function toPositiveNumber(value: unknown): number {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return 0;
    return n;
}

function roundPercent(value: number): number {
    return Math.round(value * 1000) / 1000;
}

function normalizeDistribution(source: unknown, count: number): number[] {
    if (count <= 0) return [];

    const fallback = Array.from({ length: count }, () => roundPercent(100 / count));
    const list = Array.isArray(source) ? source : [];
    if (list.length !== count) {
        const fallbackTotal = fallback.reduce((sum, value) => sum + value, 0);
        const fallbackDelta = roundPercent(100 - fallbackTotal);
        if (fallback.length > 0) fallback[fallback.length - 1] = roundPercent(fallback[fallback.length - 1] + fallbackDelta);
        return fallback;
    }
    const raw = Array.from({ length: count }, (_, idx) => toPositiveNumber(list[idx]));
    const rawTotal = raw.reduce((sum, value) => sum + value, 0);

    if (rawTotal <= 0) {
        const fallbackTotal = fallback.reduce((sum, value) => sum + value, 0);
        const fallbackDelta = roundPercent(100 - fallbackTotal);
        if (fallback.length > 0) fallback[fallback.length - 1] = roundPercent(fallback[fallback.length - 1] + fallbackDelta);
        return fallback;
    }

    const normalized = raw.map((value) => roundPercent((value / rawTotal) * 100));
    const normalizedTotal = normalized.reduce((sum, value) => sum + value, 0);
    const delta = roundPercent(100 - normalizedTotal);
    if (normalized.length > 0) normalized[normalized.length - 1] = roundPercent(normalized[normalized.length - 1] + delta);
    return normalized;
}

export function normalizeTableData(element: Pick<TemplateElement, 'tableData' | 'style'>): TableData {
    const raw = element.tableData;
    const headers = Array.isArray(raw?.headers)
        ? raw!.headers.map((h) => (h == null ? '' : String(h)))
        : [];
    const rows = Array.isArray(raw?.rows)
        ? raw!.rows.map((row) =>
            Array.isArray(row) ? row.map((cell) => (cell == null ? '' : String(cell))) : []
        )
        : [];

    const legacySeed = headers.length > 0 ? [headers, ...rows] : rows;
    const hasNewShape = raw && (
        Array.isArray(raw.data) ||
        raw.rowCount !== undefined ||
        raw.colCount !== undefined ||
        Array.isArray(raw.colWidths) ||
        Array.isArray(raw.rowHeights)
    );
    const seed = hasNewShape ? raw?.data : legacySeed;

    const inferredRowCount = legacySeed.length || defaultTable.rowCount;
    const inferredColCount =
        headers.length ||
        (legacySeed.length > 0 ? Math.max(...legacySeed.map((row) => row.length), 0) : 0) ||
        defaultTable.colCount;

    const rowCount = toSafeCount(raw?.rowCount, inferredRowCount);
    const colCount = toSafeCount(raw?.colCount, inferredColCount);
    const borderColor = typeof raw?.borderColor === 'string' && raw.borderColor.trim()
        ? raw.borderColor
        : (element.style?.borderColor || defaultTable.borderColor);

    return {
        rowCount,
        colCount,
        data: buildGridData(rowCount, colCount, seed),
        borderColor,
        colWidths: normalizeDistribution(raw?.colWidths, colCount),
        rowHeights: normalizeDistribution(raw?.rowHeights, rowCount),
    };
}

export function resizeTableData(table: TableData, rowCount: number, colCount: number): TableData {
    const safeRows = toSafeCount(rowCount, table.rowCount || defaultTable.rowCount);
    const safeCols = toSafeCount(colCount, table.colCount || defaultTable.colCount);
    const keepColWidths = safeCols === table.colCount;
    const keepRowHeights = safeRows === table.rowCount;
    return {
        rowCount: safeRows,
        colCount: safeCols,
        borderColor: table.borderColor || defaultTable.borderColor,
        data: buildGridData(safeRows, safeCols, table.data),
        colWidths: normalizeDistribution(keepColWidths ? table.colWidths : undefined, safeCols),
        rowHeights: normalizeDistribution(keepRowHeights ? table.rowHeights : undefined, safeRows),
    };
}

export function getDefaultElementConfig(type: string): Partial<TemplateElement> {
    return ELEMENT_DEFAULTS[type] || { size: { width: 50, height: 50 } };
}

/**
 * Migrates a document to ensure all elements have valid transforms/positions.
 * If elements lack position, it stacks them vertically (legacy import behavior).
 */
export function migrateToCanvas(elements: TemplateElement[]): TemplateElement[] {
    let currentY = 10;

    return elements.map((el, index) => {
        const normalizedTable = el.type === 'table'
            ? normalizeTableData(el)
            : undefined;
        const normalizedSignature = el.type === 'signature'
            ? (() => {
                const legacy = el.signatureConfig?.[0];
                const title = (el.title ?? legacy?.title ?? 'SUPERVISOR').toString();
                const signatureName = (el.signatureName ?? legacy?.name ?? '').toString();
                return {
                    title,
                    signatureName,
                    signatureConfig: [{ title, name: signatureName }],
                };
            })()
            : undefined;

        // If element already has position, keep it (unless it's 0,0 which implies uninitialized)
        if (el.position && (el.position.x !== 0 || el.position.y !== 0)) {
            return {
                ...el,
                ...(normalizedTable ? { tableData: normalizedTable } : {}),
                ...(normalizedSignature || {}),
            };
        }

        const defaults = getDefaultElementConfig(el.type);

        const width = el.size?.width || defaults.size?.width || 200;
        const height = el.size?.height || defaults.size?.height || 50;

        const x = 5;
        const y = currentY;

        currentY += height + 5;

        return {
            ...el,
            position: { x, y },
            size: { width, height },
            rotation: el.rotation || 0,
            style: { ...el.style, zIndex: el.style.zIndex || index + 1 },
            ...(normalizedTable ? { tableData: normalizedTable } : {}),
            ...(normalizedSignature || {}),
        };
    });
}
