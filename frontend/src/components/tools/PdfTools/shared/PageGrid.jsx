import ZoomControls from './ZoomControls';

/**
 * Scrollable grid container for page thumbnails with zoom controls.
 * @param {number} zoom - Current zoom level
 * @param {Function} onZoomChange - Zoom change handler
 * @param {number} totalPages - Total page count for display
 * @param {React.ReactNode} children - Grid content
 * @param {React.ReactNode} headerRight - Optional right side of header
 * @param {string} maxHeight - Max height of scrollable area
 */
export default function PageGrid({
    zoom,
    onZoomChange,
    totalPages = 0,
    children,
    headerRight = null,
    maxHeight = '500px',
}) {
    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between px-3 py-2 bg-neutral-900/60 border border-neutral-800 rounded-md">
                <span className="text-sm text-neutral-500">
                    <span className="text-neutral-300 font-semibold">{totalPages}</span> paginas
                </span>
                <div className="flex items-center gap-4">
                    {headerRight}
                    <ZoomControls zoom={zoom} onZoomChange={onZoomChange} />
                </div>
            </div>

            <div
                className="overflow-y-auto bg-neutral-900/30 border border-neutral-800/50 rounded-lg p-4"
                style={{ maxHeight }}
            >
                <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-4 items-start">
                    {children}
                </div>
            </div>
        </div>
    );
}
