import React from 'react'
import ReactDOM from 'react-dom/client'
import FichasTecnicas from '@/components/tools/FichasTecnicas'
import { MissingApiConfigBanner } from '@/components/common'
import './index.css'
import './technical-theme.css'

ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        <MissingApiConfigBanner />
        <FichasTecnicas />
    </React.StrictMode>,
)