import React from 'react';
import ReactDOM from 'react-dom/client';
import TemplateEditor from '@/components/tools/TemplateEditor';
import { MissingApiConfigBanner } from '@/components/common';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <MissingApiConfigBanner />
    <TemplateEditor />
  </React.StrictMode>
);
