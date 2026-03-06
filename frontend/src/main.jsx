import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { Toaster } from 'sonner'
import AppRouter from './AppRouter.jsx'
import { MissingApiConfigBanner } from './components/common'
import './index.css'
import './technical-theme.css'

ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        <BrowserRouter>
            <MissingApiConfigBanner />
            <Toaster richColors position="bottom-right" />
            <AppRouter />
        </BrowserRouter>
    </React.StrictMode>,
)
