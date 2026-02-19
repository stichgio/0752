import React, { memo, useMemo, useCallback, useEffect, useRef, useState } from 'react';
import { TemplateElement, mmToPx } from '../canvasTypes';
import { TableComponent } from './elements/TableComponent';
import {
    RotateCcw, Type, Heading, Image, Square, Circle, Minus as LineIcon,
    Table, PenTool, Braces, LayoutGrid, Box, SeparatorHorizontal, QrCode,
} from 'lucide-react';

interface CanvasElementProps {
    element: TemplateElement;
    scale: number;
    isSelected: boolean;
    dataPreview?: Record<string, unknown>;
    onSelect: (id: string, multi: boolean) => void;
    onUpdateElement: (id: string, updates: Partial<TemplateElement>) => void;
    onDragStart: (e: React.PointerEvent, id: string) => void;
    onResizeStart: (e: React.PointerEvent, element: TemplateElement, direction: string) => void;
    onRotateStart: (e: React.PointerEvent, element: TemplateElement) => void;
    isDragging?: boolean;
    suppressPointerEvents?: boolean;
    onSetNodeRef?: (id: string, node: HTMLDivElement | null) => void;
    disableInteraction?: boolean;
}

const HANDLE_SIZE = 8;
const ROTATE_HANDLE_OFFSET = 24;
type OddPhotoPosition = 'left' | 'center' | 'right';

function getPhotoGridColumns(count: number): number {
    if (count <= 1) return 1;
    return 2;
}

function getOddPhotoItemStyle(index: number, count: number, oddPosition: OddPhotoPosition): React.CSSProperties {
    if (count % 2 === 0 || index !== count - 1) return {};

    if (oddPosition === 'right') {
        return { gridColumn: '2 / span 1' };
    }

    if (oddPosition === 'center') {
        return {
            gridColumn: '1 / span 2',
            justifySelf: 'center',
            width: '50%',
        };
    }

    return { gridColumn: '1 / span 1' };
}

const TYPE_COLORS: Record<string, string> = {
    text: '#8b5cf6',
    heading: '#7c3aed',
    variable: '#2563eb',
    image: '#f59e0b',
    logo: '#d97706',
    rectangle: '#6b7280',
    circle: '#6b7280',
    line: '#6b7280',
    shape: '#10b981',
    divider: '#6b7280',
    qr: '#000000',
    table: '#ec4899',
    'photo-grid': '#f59e0b',
    signature: '#374151',
    container: '#9ca3af',
    group: '#2563eb',
};

const TYPE_ICONS: Record<string, React.ReactNode> = {
    text: <Type size={10} />,
    heading: <Heading size={10} />,
    variable: <Braces size={10} />,
    image: <Image size={10} />,
    logo: <Image size={10} />,
    rectangle: <Square size={10} />,
    circle: <Circle size={10} />,
    line: <LineIcon size={10} />,
    shape: <Square size={10} />,
    divider: <SeparatorHorizontal size={10} />,
    qr: <QrCode size={10} />,
    table: <Table size={10} />,
    'photo-grid': <LayoutGrid size={10} />,
    signature: <PenTool size={10} />,
    container: <Box size={10} />,
    group: <Box size={10} />,
};

const NOOP_SELECT = () => {};
const NOOP_UPDATE = () => {};
const NOOP_DRAG = () => {};
const NOOP_RESIZE = () => {};
const NOOP_ROTATE = () => {};

function CanvasElementComponent({
    element,
    scale,
    isSelected,
    dataPreview,
    onSelect,
    onUpdateElement,
    onDragStart,
    onResizeStart,
    onRotateStart,
    isDragging = false,
    suppressPointerEvents = false,
    onSetNodeRef,
    disableInteraction = false,
}: CanvasElementProps) {
    if (element.visible === false) return null;

    const { position, size, style, type, content, id, locked, rotation = 0 } = element;
    const isInlineTextEditable = (type === 'text' || type === 'heading') && !locked && !disableInteraction;
    const [isEditing, setIsEditing] = useState(false);
    const editableRef = useRef<HTMLDivElement>(null);
    const draftContentRef = useRef(content || '');
    const initialContentRef = useRef(content || '');
    const cancelEditRef = useRef(false);
    const hasLoadedMedia = (type === 'image' || type === 'logo') && !!element.imageUrl;
    const hasDefaultMediaFrame =
        hasLoadedMedia &&
        (style.borderColor || '').toLowerCase() === '#d1d5db' &&
        (style.borderWidth || 0) <= 1;

    const x = mmToPx(position.x);
    const y = mmToPx(position.y);
    const width = mmToPx(size.width);
    const height = mmToPx(size.height);

    useEffect(() => {
        if (isEditing) return;
        draftContentRef.current = content || '';
        initialContentRef.current = content || '';
    }, [content, isEditing]);

    useEffect(() => {
        if (!isEditing || !editableRef.current) return;
        const node = editableRef.current;
        node.textContent = draftContentRef.current;
        node.focus();
        placeCaretAtEnd(node);
    }, [isEditing]);

    const contentEditableMode = useMemo<React.HTMLAttributes<HTMLDivElement>['contentEditable']>(() => {
        if (typeof document === 'undefined') return true;
        const probe = document.createElement('div');
        probe.setAttribute('contenteditable', 'plaintext-only');
        return probe.contentEditable === 'plaintext-only' ? 'plaintext-only' : true;
    }, []);

    const handleInlineEditCommit = useCallback(() => {
        if (!isInlineTextEditable) return;
        const nextContent = draftContentRef.current;
        if (nextContent !== (content || '')) {
            onUpdateElement(id, { content: nextContent });
        }
        setIsEditing(false);
    }, [isInlineTextEditable, content, onUpdateElement, id]);

    const handleInlineEditCancel = useCallback(() => {
        cancelEditRef.current = true;
        draftContentRef.current = initialContentRef.current;
        if (editableRef.current) {
            editableRef.current.textContent = initialContentRef.current;
        }
    }, []);

    const startInlineEdit = useCallback(() => {
        if (!isInlineTextEditable) return;
        onSelect(id, false);
        cancelEditRef.current = false;
        draftContentRef.current = content || '';
        initialContentRef.current = content || '';
        setIsEditing(true);
    }, [isInlineTextEditable, onSelect, id, content]);

    const handleTextDoubleClick = useCallback((e: React.MouseEvent) => {
        if (!isInlineTextEditable) return;
        e.preventDefault();
        e.stopPropagation();
        startInlineEdit();
    }, [isInlineTextEditable, startInlineEdit]);

    const handleInlineEditorInput = useCallback((e: React.FormEvent<HTMLDivElement>) => {
        draftContentRef.current = e.currentTarget.textContent || '';
    }, []);

    const handleInlineEditorBlur = useCallback(() => {
        if (cancelEditRef.current) {
            cancelEditRef.current = false;
            setIsEditing(false);
            return;
        }
        handleInlineEditCommit();
    }, [handleInlineEditCommit]);

    const handleInlineEditorKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
        e.stopPropagation();
        if (e.key === 'Escape') {
            e.preventDefault();
            handleInlineEditCancel();
            e.currentTarget.blur();
            return;
        }
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            e.preventDefault();
            e.currentTarget.blur();
        }
    }, [handleInlineEditCancel]);

    const accentColor = TYPE_COLORS[type] || '#3b82f6';
    const rotationTransform = rotation ? ` rotate(${rotation}deg)` : '';

    const containerStyle: React.CSSProperties = useMemo(() => ({
        position: 'absolute',
        left: x,
        top: y,
        width,
        height,
        transform: `translate(var(--drag-tx, 0px), var(--drag-ty, 0px))${rotationTransform}`,
        transformOrigin: 'center center',
        zIndex: style.zIndex || 1,
        opacity: style.opacity ?? 1,
        cursor: disableInteraction ? 'default' : locked ? 'default' : isEditing ? 'text' : isSelected ? 'move' : 'pointer',
        outline: isSelected ? `2px solid ${accentColor}` : 'none',
        outlineOffset: '1px',
        pointerEvents: (disableInteraction || suppressPointerEvents) ? 'none' as const : 'auto' as const,
        willChange: isDragging ? 'transform' : undefined,
    }), [
        x,
        y,
        width,
        height,
        rotationTransform,
        style.zIndex,
        style.opacity,
        disableInteraction,
        suppressPointerEvents,
        isDragging,
        locked,
        isEditing,
        isSelected,
        accentColor,
    ]);

    const innerStyle: React.CSSProperties = useMemo(() => ({
        width: '100%',
        height: '100%',
        backgroundColor: hasLoadedMedia ? 'transparent' : style.backgroundColor,
        color: style.color,
        fontSize: style.fontSize ? `${style.fontSize}px` : undefined,
        fontFamily: style.fontFamily,
        fontWeight: style.fontWeight as any,
        textAlign: style.textAlign as any,
        lineHeight: style.lineHeight ? `${style.lineHeight}` : undefined,
        letterSpacing: style.letterSpacing ? `${style.letterSpacing}px` : undefined,
        borderWidth: hasDefaultMediaFrame ? undefined : (style.borderWidth ? `${style.borderWidth}px` : undefined),
        borderStyle: hasDefaultMediaFrame ? undefined : (style.borderStyle || (style.borderWidth ? 'solid' : undefined)),
        borderColor: hasDefaultMediaFrame ? undefined : style.borderColor,
        borderRadius: style.borderRadius ? `${style.borderRadius}%` : undefined,
        padding: style.padding ? `${style.padding}px` : undefined,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column' as const,
        justifyContent: 'center',
        boxSizing: 'border-box' as const,
    }), [style, hasLoadedMedia, hasDefaultMediaFrame]);

    const handlePointerDown = useCallback((e: React.PointerEvent) => {
        e.stopPropagation();
        if (disableInteraction) return;
        if (locked) return;
        if (isEditing) return;

        const isInlineEditableSurface = isInlineTextEditable || type === 'table';
        if (isInlineEditableSurface && !isSelected) {
            // First click selects editable elements without starting drag,
            // so double-click can reliably enter inline edit mode.
            onSelect(id, e.shiftKey);
            return;
        }

        if ((isInlineTextEditable || type === 'table') && e.detail === 2) {
            onSelect(id, e.shiftKey);
            return;
        }
        onSelect(id, e.shiftKey);
        onDragStart(e, id);
    }, [disableInteraction, locked, isEditing, isInlineTextEditable, type, isSelected, onSelect, onDragStart, id]);

    const setWrapperNodeRef = useCallback(
        (node: HTMLDivElement | null) => {
            onSetNodeRef?.(id, node);
        },
        [id, onSetNodeRef],
    );

    const inlineEditorStyle: React.CSSProperties = useMemo(() => ({
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        border: 'none',
        outline: 'none',
        boxSizing: 'border-box',
        backgroundColor: 'transparent',
        color: style.color || '#111827',
        fontSize: style.fontSize ? `${style.fontSize}px` : undefined,
        fontFamily: style.fontFamily,
        fontWeight: style.fontWeight as React.CSSProperties['fontWeight'],
        textAlign: style.textAlign as React.CSSProperties['textAlign'],
        lineHeight: style.lineHeight ? `${style.lineHeight}` : undefined,
        letterSpacing: style.letterSpacing ? `${style.letterSpacing}px` : undefined,
        padding: '2px 4px',
        overflow: 'hidden',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        pointerEvents: 'auto',
        userSelect: 'text',
        cursor: 'text',
    }), [style.color, style.fontSize, style.fontFamily, style.fontWeight, style.textAlign, style.lineHeight, style.letterSpacing]);

    const variableTemplate = useMemo(() => {
        const rawContent = typeof content === 'string' ? content.trim() : '';
        if (rawContent.includes('{{') && rawContent.includes('}}')) {
            return rawContent;
        }

        const rawVariable = (element.variableName || '').trim();
        if (!rawVariable) return '{{variable}}';
        if (rawVariable.startsWith('{{') && rawVariable.endsWith('}}')) {
            return rawVariable;
        }
        return `{{${rawVariable}}}`;
    }, [content, element.variableName]);

    const variableDisplayValue = useMemo(() => {
        if (!dataPreview) return variableTemplate;

        return variableTemplate.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (match, key: string) => {
            const previewValue = dataPreview[key];
            if (previewValue === null || previewValue === undefined || previewValue === '') {
                return match;
            }
            return String(previewValue);
        });
    }, [dataPreview, variableTemplate]);

    const renderContent = () => {
        switch (type) {
            case 'text':
            case 'heading':
                return (
                    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
                        {!isEditing && (
                            <div style={{ whiteSpace: 'pre-wrap', padding: '2px 4px' }}>
                                {content || (
                                    <span style={{ color: '#aaa', fontStyle: 'italic' }}>
                                        {type === 'heading' ? 'Título' : 'Texto...'}
                                    </span>
                                )}
                            </div>
                        )}
                        {isEditing && (
                            <div
                                ref={editableRef}
                                role="textbox"
                                data-inline-editor="true"
                                contentEditable={contentEditableMode}
                                suppressContentEditableWarning
                                spellCheck={false}
                                onInput={handleInlineEditorInput}
                                onBlur={handleInlineEditorBlur}
                                onKeyDown={handleInlineEditorKeyDown}
                                onPointerDown={(e) => e.stopPropagation()}
                                onMouseDown={(e) => e.stopPropagation()}
                                onDoubleClick={(e) => e.stopPropagation()}
                                style={inlineEditorStyle}
                            />
                        )}
                    </div>
                );

            case 'variable':
                return (
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                        padding: '2px 6px',
                        fontFamily: 'monospace',
                        fontSize: style.fontSize || 11,
                    }}>
                        <Braces size={12} style={{ opacity: 0.6, flexShrink: 0 }} />
                        <span>{variableDisplayValue}</span>
                    </div>
                );

            case 'image':
            case 'logo':
                return element.imageUrl ? (
                    <img
                        src={element.imageUrl}
                        alt={type}
                        style={{
                            width: '100%',
                            height: '100%',
                            objectFit: style.objectFit || (type === 'logo' ? 'contain' : 'cover')
                        }}
                        draggable={false}
                    />
                ) : (
                    <div style={{
                        width: '100%',
                        height: '100%',
                        background: 'linear-gradient(135deg, #f3f4f6 0%, #e5e7eb 100%)',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#9ca3af',
                        gap: 4,
                    }}>
                        <Image size={Math.min(24, width * 0.3)} />
                        <span style={{ fontSize: 10 }}>
                            {type === 'logo'
                                ? (element.variableName || 'logo_left')
                                : 'Imagen'}
                        </span>
                    </div>
                );

            case 'rectangle':
                return <div style={{ width: '100%', height: '100%' }} />;

            case 'circle':
                return (
                    <div style={{
                        width: '100%',
                        height: '100%',
                        borderRadius: '50%',
                        backgroundColor: style.backgroundColor || '#e5e7eb',
                        border: `${style.borderWidth || 1}px ${style.borderStyle || 'solid'} ${style.borderColor || '#9ca3af'}`,
                        boxSizing: 'border-box',
                    }} />
                );

            case 'line':
                return (
                    <div style={{
                        width: '100%',
                        height: '100%',
                        display: 'flex',
                        alignItems: 'center',
                    }}>
                        <div style={{
                            width: '100%',
                            height: Math.max(1, style.borderWidth || 1),
                            backgroundColor: style.backgroundColor || '#374151',
                        }} />
                    </div>
                );

            case 'shape': {
                const shape = element.shapeConfig;
                if (!shape) return null;

                const commonShapeStyle: React.CSSProperties = {
                    width: '100%',
                    height: '100%',
                    backgroundColor: shape.fill || 'transparent',
                    border: `${shape.strokeWidth || 1}px solid ${shape.stroke || '#000'}`,
                    boxSizing: 'border-box',
                };

                if (shape.kind === 'rectangle') {
                    return <div style={{ ...commonShapeStyle, borderRadius: shape.borderRadius || 0 }} />;
                } else if (shape.kind === 'circle') {
                    return <div style={{ ...commonShapeStyle, borderRadius: '50%' }} />;
                } else if (shape.kind === 'line') {
                    return (
                        <div style={{ display: 'flex', alignItems: 'center', width: '100%', height: '100%' }}>
                            <div style={{ width: '100%', height: shape.strokeWidth || 2, backgroundColor: shape.stroke || '#000' }} />
                        </div>
                    );
                } else if (shape.kind === 'arrow') {
                    return (
                        <svg viewBox="0 0 100 50" preserveAspectRatio="none" style={{ width: '100%', height: '100%' }}>
                            <defs>
                                <marker id={`arrowhead-${id}`} orient="auto" markerWidth="4" markerHeight="4" refX="3" refY="2">
                                    <path d="M0,0 V4 L4,2 Z" fill={shape.stroke || '#000'} />
                                </marker>
                            </defs>
                            <line x1="2" y1="25" x2="94" y2="25" stroke={shape.stroke || '#000'} strokeWidth={shape.strokeWidth || 2} markerEnd={`url(#arrowhead-${id})`} />
                        </svg>
                    );
                }
                return null;
            }

            case 'divider': {
                const div = element.dividerConfig;
                const isVertical = div?.orientation === 'vertical';
                const thickness = div?.thickness || 1;
                const color = div?.color || '#374151';
                const divStyle = div?.style || 'solid';

                return (
                    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <div style={{
                            width: isVertical ? 0 : '100%',
                            height: isVertical ? '100%' : 0,
                            borderTop: !isVertical ? `${thickness}px ${divStyle} ${color}` : undefined,
                            borderLeft: isVertical ? `${thickness}px ${divStyle} ${color}` : undefined,
                        }} />
                    </div>
                );
            }

            case 'qr': {
                return (
                    <div style={{
                        width: '100%',
                        height: '100%',
                        backgroundColor: element.qrConfig?.background || '#fff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '8%',
                        position: 'relative',
                    }}>
                        <QrCode size={Math.min(width, height) * 0.6} color={element.qrConfig?.foreground || '#000'} />
                        {element.qrConfig?.content && (
                            <div style={{
                                position: 'absolute',
                                bottom: 2,
                                left: 0,
                                right: 0,
                                textAlign: 'center',
                                fontSize: 7,
                                color: '#999',
                                overflow: 'hidden',
                                whiteSpace: 'nowrap',
                                textOverflow: 'ellipsis',
                                padding: '0 4px',
                            }}>
                                {element.qrConfig.content}
                            </div>
                        )}
                    </div>
                );
            }

            case 'table': {
                return (
                    <div style={{ width: '100%', height: '100%', overflow: 'hidden' }}>
                        <TableComponent
                            tableData={element.tableData}
                            style={style}
                            disabled={!!locked || disableInteraction}
                            onTableDataChange={(nextTable) => onUpdateElement(id, { tableData: nextTable })}
                        />
                    </div>
                );
            }

            case 'photo-grid': {
                const count = element.photoConfig?.count || 2;
                const cols = getPhotoGridColumns(count);
                const oddPosition = (element.photoConfig?.oddPosition || 'center') as OddPhotoPosition;
                return (
                    <div style={{ width: '100%', height: '100%', padding: 4 }}>
                        {content && (
                            <div style={{ fontWeight: 'bold', fontSize: 10, marginBottom: 4 }}>{content}</div>
                        )}
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: `repeat(${cols}, 1fr)`,
                            gap: 4,
                            height: content ? 'calc(100% - 20px)' : '100%',
                        }}>
                            {Array.from({ length: count }).map((_, i) => (
                                <div key={i} style={{
                                    background: '#f3f4f6',
                                    border: '1px dashed #d1d5db',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    borderRadius: 4,
                                    ...getOddPhotoItemStyle(i, count, oddPosition),
                                }}>
                                    <Image size={16} color="#ccc" />
                                    {element.photoConfig?.showLabels && (
                                        <span style={{ fontSize: 8, color: '#aaa', marginTop: 2 }}>
                                            {element.photoConfig.labels?.[i] || `Foto ${i + 1}`}
                                        </span>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                );
            }

            case 'signature': {
                const title = element.title ?? element.signatureConfig?.[0]?.title ?? 'SUPERVISOR';
                const signatureName = element.signatureName ?? element.signatureConfig?.[0]?.name ?? '';
                return (
                    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', padding: 4 }}>
                        <div style={{ borderTop: '1px solid #374151', paddingTop: 4, textAlign: 'center' }}>
                            <div style={{ fontSize: 9, fontWeight: 'bold' }}>{title}</div>
                            {signatureName && <div style={{ fontSize: 8, color: '#666' }}>{signatureName}</div>}
                        </div>
                    </div>
                );
            }

            case 'group': {
                const children = (element.groupChildren || [])
                    .filter((child) => child.type !== 'group' && child.visible !== false)
                    .sort((a, b) => (a.style.zIndex || 0) - (b.style.zIndex || 0));

                return (
                    <div
                        style={{
                            width: '100%',
                            height: '100%',
                            position: 'relative',
                            backgroundColor: 'rgba(59, 130, 246, 0.04)',
                        }}
                    >
                        {children.map((child) => (
                            <CanvasElement
                                key={child.id}
                                element={child}
                                scale={scale}
                                isSelected={false}
                                onSelect={NOOP_SELECT}
                                onUpdateElement={NOOP_UPDATE}
                                onDragStart={NOOP_DRAG}
                                onResizeStart={NOOP_RESIZE}
                                onRotateStart={NOOP_ROTATE}
                                disableInteraction
                            />
                        ))}
                    </div>
                );
            }

            case 'container':
                return (
                    <div style={{
                        width: '100%',
                        height: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#9ca3af',
                        fontSize: 10,
                    }}>
                        {content || 'Contenedor'}
                    </div>
                );

            default:
                return <div style={{ padding: 4 }}>{content}</div>;
        }
    };

    const handleSz = HANDLE_SIZE / scale;

    return (
        <div
            ref={setWrapperNodeRef}
            className="canvas-element-wrapper"
            data-element-id={id}
            style={containerStyle}
            onPointerDown={handlePointerDown}
            onDoubleClick={isInlineTextEditable ? handleTextDoubleClick : undefined}
        >
            <div style={innerStyle}>
                {renderContent()}
            </div>

            {/* Type badge (shown when selected or hovered) */}
            {isSelected && (
                <div
                    className="pointer-events-none"
                    style={{
                        position: 'absolute',
                        top: -20 / scale,
                        left: 0,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 3 / scale,
                        padding: `${1 / scale}px ${4 / scale}px`,
                        backgroundColor: accentColor,
                        color: 'white',
                        borderRadius: 3 / scale,
                        fontSize: 9 / scale,
                        fontWeight: 600,
                        whiteSpace: 'nowrap',
                        lineHeight: `${14 / scale}px`,
                    }}
                >
                    {TYPE_ICONS[type]}
                    {element.name}
                </div>
            )}

            {/* Resize + Rotate handles */}
            {isSelected && !disableInteraction && !locked && !isEditing && (
                <>
                    {['nw', 'n', 'ne', 'w', 'e', 'sw', 's', 'se'].map((dir) => (
                        <div
                            key={dir}
                            style={{
                                position: 'absolute',
                                width: handleSz,
                                height: handleSz,
                                backgroundColor: 'white',
                                border: `${1.5 / scale}px solid ${accentColor}`,
                                borderRadius: dir === 'n' || dir === 's' || dir === 'e' || dir === 'w' ? handleSz / 4 : '50%',
                                zIndex: 10,
                                cursor: getCursorForDirection(dir),
                                boxShadow: `0 0 ${2 / scale}px rgba(0,0,0,0.15)`,
                                ...getHandlePosition(dir, width, height, handleSz),
                            }}
                            onPointerDown={(e) => {
                                e.stopPropagation();
                                onResizeStart(e, element, dir);
                            }}
                        />
                    ))}

                    {type !== 'group' && (
                        <div
                            style={{
                                position: 'absolute',
                                top: -(ROTATE_HANDLE_OFFSET + 4) / scale,
                                left: '50%',
                                transform: 'translateX(-50%)',
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                gap: 0,
                                zIndex: 10,
                            }}
                        >
                            <div
                                style={{
                                    width: 18 / scale,
                                    height: 18 / scale,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    backgroundColor: 'white',
                                    border: `${1.5 / scale}px solid ${accentColor}`,
                                    borderRadius: '50%',
                                    cursor: 'grab',
                                    boxShadow: `0 1px ${3 / scale}px rgba(0,0,0,0.15)`,
                                }}
                                onPointerDown={(e) => {
                                    e.stopPropagation();
                                    onRotateStart(e, element);
                                }}
                            >
                                <RotateCcw size={10 / scale} color={accentColor} />
                            </div>
                            <div
                                className="pointer-events-none"
                                style={{
                                    width: 1 / scale,
                                    height: 6 / scale,
                                    backgroundColor: accentColor,
                                    opacity: 0.4,
                                }}
                            />
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

function placeCaretAtEnd(node: HTMLElement) {
    if (typeof window === 'undefined') return;
    const selection = window.getSelection();
    if (!selection) return;
    const range = document.createRange();
    range.selectNodeContents(node);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
}

function areObjectsShallowEqual(
    a: Record<string, unknown> | undefined,
    b: Record<string, unknown> | undefined,
): boolean {
    if (a === b) return true;
    if (!a || !b) return false;

    const aKeys = Object.keys(a);
    const bKeys = Object.keys(b);
    if (aKeys.length !== bKeys.length) return false;

    for (const key of aKeys) {
        if (a[key] !== b[key]) return false;
    }
    return true;
}

function areElementsRenderEqual(prev: TemplateElement, next: TemplateElement): boolean {
    if (prev === next) return true;
    if (prev.id !== next.id) return false;
    if (prev.position.x !== next.position.x || prev.position.y !== next.position.y) return false;
    if (prev.size.width !== next.size.width || prev.size.height !== next.size.height) return false;
    if (!areObjectsShallowEqual(prev.style as Record<string, unknown>, next.style as Record<string, unknown>)) {
        return false;
    }

    // Keep non-layout render updates responsive (text/media/type changes).
    if (prev.type !== next.type) return false;
    if (prev.content !== next.content) return false;
    if (prev.rotation !== next.rotation) return false;
    if (prev.visible !== next.visible) return false;
    if (prev.locked !== next.locked) return false;
    if (prev.name !== next.name) return false;
    if (prev.imageUrl !== next.imageUrl) return false;
    if (prev.variableName !== next.variableName) return false;
    if (prev.title !== next.title) return false;
    if (prev.signatureName !== next.signatureName) return false;
    if (prev.tableData !== next.tableData) return false;
    if (prev.photoConfig !== next.photoConfig) return false;
    if (prev.shapeConfig !== next.shapeConfig) return false;
    if (prev.dividerConfig !== next.dividerConfig) return false;
    if (prev.qrConfig !== next.qrConfig) return false;
    if (prev.signatureConfig !== next.signatureConfig) return false;
    if (prev.groupChildren !== next.groupChildren) return false;
    if (prev.children !== next.children) return false;

    return true;
}

function areCanvasElementPropsEqual(prev: CanvasElementProps, next: CanvasElementProps): boolean {
    if (prev.scale !== next.scale) return false;
    if (prev.isSelected !== next.isSelected) return false;
    if (prev.disableInteraction !== next.disableInteraction) return false;
    if (prev.isDragging !== next.isDragging) return false;
    if (prev.suppressPointerEvents !== next.suppressPointerEvents) return false;
    if (prev.dataPreview !== next.dataPreview) return false;
    return areElementsRenderEqual(prev.element, next.element);
}

export const CanvasElement = memo(CanvasElementComponent, areCanvasElementPropsEqual);

function getHandlePosition(dir: string, w: number, h: number, size: number): React.CSSProperties {
    const half = size / 2;
    switch (dir) {
        case 'nw': return { left: -half, top: -half };
        case 'n': return { left: '50%', top: -half, transform: 'translateX(-50%)' };
        case 'ne': return { right: -half, top: -half };
        case 'w': return { left: -half, top: '50%', transform: 'translateY(-50%)' };
        case 'e': return { right: -half, top: '50%', transform: 'translateY(-50%)' };
        case 'sw': return { left: -half, bottom: -half };
        case 's': return { left: '50%', bottom: -half, transform: 'translateX(-50%)' };
        case 'se': return { right: -half, bottom: -half };
        default: return {};
    }
}

function getCursorForDirection(dir: string): string {
    const map: Record<string, string> = {
        nw: 'nwse-resize', n: 'ns-resize', ne: 'nesw-resize',
        w: 'ew-resize', e: 'ew-resize',
        sw: 'nesw-resize', s: 'ns-resize', se: 'nwse-resize',
    };
    return map[dir] || 'pointer';
}

