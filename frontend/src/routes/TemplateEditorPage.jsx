import { useEffect, useState } from 'react';
import TemplateEditor from '../components/tools/TemplateEditor';
import PageDocument from './PageDocument';

export default function TemplateEditorPage() {
    const [isReady, setIsReady] = useState(false);

    useEffect(() => {
        let cancelled = false;
        let frameA = 0;
        let frameB = 0;
        const fallbackId = window.setTimeout(() => {
            if (!cancelled) {
                setIsReady(true);
            }
        }, 900);

        frameA = window.requestAnimationFrame(() => {
            frameB = window.requestAnimationFrame(() => {
                if (!cancelled) {
                    setIsReady(true);
                }
            });
        });

        return () => {
            cancelled = true;
            window.clearTimeout(fallbackId);
            window.cancelAnimationFrame(frameA);
            window.cancelAnimationFrame(frameB);
        };
    }, []);

    return (
        <PageDocument title="Template Editor">
            <div className={`template-editor-page-shell${isReady ? ' app-ready' : ''}`}>
                <div className="template-editor-boot-loader" aria-hidden="true">
                    <div className="template-editor-boot-card">
                        <div className="template-editor-boot-title">Template Editor</div>
                        <div className="template-editor-boot-subtitle">
                            Preparando interfaz y restaurando sesion local...
                        </div>
                        <div className="template-editor-boot-track">
                            <div className="template-editor-boot-bar"></div>
                        </div>
                    </div>
                </div>
                <div className="template-editor-page-zoom">
                    <TemplateEditor />
                </div>
            </div>
        </PageDocument>
    );
}
