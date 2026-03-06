import { useEffect, useRef } from 'react';
import MultiSheetReportApp from '../components/tools/MultiSheetReport/MultiSheetReportApp';
import PageDocument from './PageDocument';

const GRID_PREVIEW_SELECTOR =
    '.bg-white.rounded-lg.shadow-md.overflow-hidden.border.border-neutral-200 .mt-2.grid.gap-1.p-1.bg-neutral-50.rounded.border.border-neutral-200';
const LOCAL_IFRAME_SELECTOR = 'iframe[title="Local Template Preview"]';

function applyGridPreviewFix(root) {
    const gridPreviews = root.querySelectorAll(GRID_PREVIEW_SELECTOR);
    gridPreviews.forEach((grid) => {
        grid.classList.add('msheets-a4-grid-preview');
        Array.from(grid.children).forEach((cell) => {
            if (!(cell instanceof HTMLElement)) {
                return;
            }
            cell.classList.add('msheets-grid-cell');
        });
    });
}

function applyIframeFix(iframe) {
    if (!(iframe instanceof HTMLIFrameElement)) {
        return;
    }

    if (iframe.dataset.msheetsNoScrollApplied === '1') {
        return;
    }

    iframe.dataset.msheetsNoScrollApplied = '1';
    iframe.setAttribute('scrolling', 'no');

    const injectNoScrollStyle = () => {
        const doc = iframe.contentDocument;
        if (!doc || doc.getElementById('__msheets_iframe_noscroll__')) {
            return;
        }

        const style = doc.createElement('style');
        style.id = '__msheets_iframe_noscroll__';
        style.textContent = `
            html, body {
                overflow: hidden !important;
                scrollbar-width: none !important;
                -ms-overflow-style: none !important;
            }
            html::-webkit-scrollbar,
            body::-webkit-scrollbar {
                width: 0 !important;
                height: 0 !important;
                display: none !important;
            }
        `;
        (doc.head || doc.documentElement).appendChild(style);
    };

    iframe.addEventListener('load', injectNoScrollStyle);
    injectNoScrollStyle();
}

export default function MultiSheetReportPage() {
    const pageRef = useRef(null);

    useEffect(() => {
        const root = pageRef.current;
        if (!root) {
            return undefined;
        }

        let rafId = 0;
        const applyAllPreviewFixes = () => {
            applyGridPreviewFix(root);
            root.querySelectorAll(LOCAL_IFRAME_SELECTOR).forEach((iframe) => {
                applyIframeFix(iframe);
            });
        };

        applyAllPreviewFixes();

        const observer = new MutationObserver(() => {
            cancelAnimationFrame(rafId);
            rafId = window.requestAnimationFrame(applyAllPreviewFixes);
        });

        observer.observe(root, {
            childList: true,
            subtree: true,
        });

        return () => {
            cancelAnimationFrame(rafId);
            observer.disconnect();
        };
    }, []);

    return (
        <PageDocument title="Informe Multi-Hoja - Glitch" bodyClassName="bg-neutral-950 text-neutral-200 min-h-screen">
            <div ref={pageRef} data-msheets-page className="h-full min-h-0 overflow-hidden">
                <MultiSheetReportApp />
            </div>
        </PageDocument>
    );
}
