import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { Toaster } from 'sonner'
import AppRouter from './AppRouter.jsx'
import { ConfirmDialogProvider, MissingApiConfigBanner } from './components/ui'
import './index.css'
import './technical-theme.css'

ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
            <ConfirmDialogProvider>
                <MissingApiConfigBanner />
                <Toaster richColors position="bottom-right" />
                <AppRouter />
            </ConfirmDialogProvider>
        </BrowserRouter>
    </React.StrictMode>,
)