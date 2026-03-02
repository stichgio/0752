import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import { Toaster } from 'sonner'
import { MissingApiConfigBanner } from './components/common'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        <MissingApiConfigBanner />
        <Toaster richColors position="bottom-right" />
        <App />
    </React.StrictMode>,
)
