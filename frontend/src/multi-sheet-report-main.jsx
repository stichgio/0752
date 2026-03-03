import React from 'react'
import ReactDOM from 'react-dom/client'
import MultiSheetReportApp from './components/tools/MultiSheetReport/MultiSheetReportApp'
import { MissingApiConfigBanner } from './components/common'
import { Toaster } from 'sonner'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        <MissingApiConfigBanner />
        <Toaster richColors position="bottom-right" />
        <MultiSheetReportApp />
    </React.StrictMode>,
)
