import React from 'react'
import ReactDOM from 'react-dom/client'
import OCRTool from './components/tools/OCRTool'
import { MissingApiConfigBanner } from '@/components/common'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        <MissingApiConfigBanner />
        <OCRTool />
    </React.StrictMode>,
)
