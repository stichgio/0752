import { isApiConfigMissing } from '@/utils/apiBase';

/**
 * Renders a visible warning banner when VITE_API_URL is not set in a
 * non-localhost environment.  Renders nothing when the config is OK.
 */
export default function MissingApiConfigBanner() {
    if (!isApiConfigMissing) return null;

    return (
        <div
            role="alert"
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                zIndex: 9999,
                background: '#7f1d1d',
                color: '#fecaca',
                padding: '10px 16px',
                fontFamily: 'monospace',
                fontSize: '13px',
                textAlign: 'center',
                borderBottom: '2px solid #ef4444',
            }}
        >
            <strong>⚠ Configuración incompleta:</strong>{' '}
            La variable de entorno <code style={{ background: '#450a0a', padding: '2px 6px', borderRadius: 4 }}>VITE_API_URL</code> no está definida.
            Las llamadas al backend podrían fallar.
            Defínela en tu entorno de build apuntando a la URL del backend (ej.{' '}
            <code style={{ background: '#450a0a', padding: '2px 6px', borderRadius: 4 }}>
                https://your-space.hf.space/api
            </code>).
        </div>
    );
}
