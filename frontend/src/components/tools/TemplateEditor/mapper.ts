import { CanvasDocument, TemplateElement, normalizePageSettings } from './canvasTypes';

// Matches the backend structure expectation if necessary
interface LegacyTemplateBlock {
    type: string;
    content?: string;
    metadata?: {
        layout?: {
            x: number;
            y: number;
            width: number;
            height: number;
            rotation?: number;
            zIndex?: number;
        };
        style?: any;
        [key: string]: any;
    };
    locked?: boolean;
}

interface LegacyTemplate {
    name: string;
    type: 'report' | 'sheet';
    sections: Array<{
        name: string;
        blocks: LegacyTemplateBlock[];
    }>;
    metadata?: {
        source: 'canvas-editor-v3';
        version: number;
        pageSettings?: any;
    };
}

export function documentToLegacyTemplate(doc: CanvasDocument): LegacyTemplate {
    const blocks: LegacyTemplateBlock[] = doc.elements.map(el => ({
        type: el.type,
        content: el.content,
        metadata: {
            layout: {
                x: el.position.x,
                y: el.position.y,
                width: el.size.width,
                height: el.size.height,
                rotation: el.rotation,
                zIndex: el.style.zIndex
            },
            style: el.style,
            // Pass through other configs
            shapeConfig: el.shapeConfig,
            dividerConfig: el.dividerConfig,
            photoConfig: el.photoConfig,
            tableData: el.tableData,
            signatureConfig: el.signatureConfig,
        },
        locked: el.locked
    }));

    return {
        name: doc.name,
        type: 'report', // Default
        sections: [
            {
                name: 'Page 1',
                blocks
            }
        ],
        metadata: {
            source: 'canvas-editor-v3',
            version: doc.version,
            pageSettings: doc.pageSettings
        }
    };
}

export function legacyTemplateToDocument(json: LegacyTemplate, id: string, name: string): CanvasDocument {
    // Basic implementation to satisfy contract
    const blocks = json.sections?.[0]?.blocks || [];

    // Convert blocks to elements
    const elements: TemplateElement[] = blocks.map((b, i) => ({
        id: `el_${Date.now()}_${i}`,
        type: b.type as any,
        name: `Element ${i}`,
        position: {
            x: b.metadata?.layout?.x || 0,
            y: b.metadata?.layout?.y || 0
        },
        size: {
            width: b.metadata?.layout?.width || 100,
            height: b.metadata?.layout?.height || 50
        },
        style: b.metadata?.style || {},
        content: b.content,
        locked: b.locked,
        visible: true,
        rotation: b.metadata?.layout?.rotation,
        tableData: b.metadata?.tableData,
        photoConfig: b.metadata?.photoConfig,
        signatureConfig: b.metadata?.signatureConfig,
        shapeConfig: b.metadata?.shapeConfig,
        dividerConfig: b.metadata?.dividerConfig,
    }));

    return {
        id,
        name: json.name || name,
        elements,
        pageSettings: normalizePageSettings(json.metadata?.pageSettings),
        version: json.metadata?.version || 1,
        status: 'draft',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    };
}
