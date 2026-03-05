import React from 'react'
import ReactDOM from 'react-dom/client'
import PdfToolsApp from './components/tools/PdfTools/PdfToolsApp'
import { MissingApiConfigBanner } from './components/common'
import { Toaster } from 'sonner'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        <MissingApiConfigBanner />
        <Toaster richColors position="bottom-right" />
        <PdfToolsApp />
    </React.StrictMode>,
)
