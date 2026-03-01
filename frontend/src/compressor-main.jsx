import React from 'react'
import ReactDOM from 'react-dom/client'
import Compressor from '@/components/tools/Compressor'
import { MissingApiConfigBanner } from '@/components/common'
import './index.css'
import './technical-theme.css'

ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        <MissingApiConfigBanner />
        <Compressor />
    </React.StrictMode>,
)
