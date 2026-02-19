import React from 'react';

interface DragTooltipProps {
    cursorX: number;
    cursorY: number;
    x: number;
    y: number;
}

export function DragTooltip({ cursorX, cursorY, x, y }: DragTooltipProps) {
    return (
        <div
            className="pointer-events-none fixed"
            style={{
                left: cursorX + 12,
                top: cursorY + 12,
                zIndex: 2147483647,
                backgroundColor: '#1f2937',
                color: '#ffffff',
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                fontSize: 11,
                lineHeight: '14px',
                borderRadius: 6,
                padding: '4px 6px',
                whiteSpace: 'nowrap',
            }}
        >
            {`X: ${x.toFixed(1)} mm Y: ${y.toFixed(1)} mm`}
        </div>
    );
}
