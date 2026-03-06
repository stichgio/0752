import React from 'react'
import ReactDOM from 'react-dom/client'
import ImageOptimizer from '@/components/tools/ImageOptimizer'
import { MissingApiConfigBanner } from '@/components/common'
import './index.css'
import './technical-theme.css'
import { initializePageShell } from './bootstrapPageShell'

initializePageShell()

ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        <MissingApiConfigBanner />
        <ImageOptimizer />
    </React.StrictMode>,
)

