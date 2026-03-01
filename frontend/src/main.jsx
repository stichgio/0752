import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import { MissingApiConfigBanner } from './components/common'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        <MissingApiConfigBanner />
        <App />
    </React.StrictMode>,
)
