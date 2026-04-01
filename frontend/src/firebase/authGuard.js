import { onAuthStateChanged } from 'firebase/auth';
import { auth, hasFirebaseConfig } from './config';

/**
 * Standalone auth guard for HTML pages that may not use the React SPA router.
 * Call initAuthGuard() at the top of any standalone entry point to block
 * rendering until Firebase confirms the session.
 *
 * Usage (in a standalone HTML script):
 *   import { initAuthGuard } from './firebase/authGuard';
 *   initAuthGuard();
 */
export function initAuthGuard() {
    if (!hasFirebaseConfig || !auth) {
        window.location.replace('/login');
        return;
    }

    // Create a full-screen loading overlay to prevent content flash
    const overlay = document.createElement('div');
    overlay.id = 'auth-guard-overlay';
    Object.assign(overlay.style, {
        position: 'fixed',
        inset: '0',
        zIndex: '99999',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#0a0a0a',
        color: '#a3a3a3',
        fontFamily: 'Inter, system-ui, sans-serif',
        fontSize: '14px',
    });
    overlay.innerHTML = `
        <div style="display:flex;flex-direction:column;align-items:center;gap:12px;">
            <div style="width:32px;height:32px;border:3px solid #333;border-top-color:#fff;border-radius:50%;animation:auth-spin .7s linear infinite;"></div>
            <span>Verificando sesion&hellip;</span>
        </div>
        <style>@keyframes auth-spin{to{transform:rotate(360deg)}}</style>
    `;
    document.body.prepend(overlay);

    onAuthStateChanged(auth, (user) => {
        if (!user) {
            window.location.replace('/login');
            return;
        }
        // Session confirmed — remove overlay and show page content
        overlay.remove();
    });
}
