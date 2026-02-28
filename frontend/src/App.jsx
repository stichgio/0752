import { useState, useRef, useEffect } from 'react';
import * as XLSX from 'xlsx';
import html2canvas from 'html2canvas';
import { downloadBlob } from './utils/downloadBlob';
import { FileSpreadsheet, Image as ImageIcon, Printer, Settings, FileCode, CheckCircle, AlertCircle, RotateCcw, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import PreviewPanel from './components/PreviewPanel';
import { Step, LoadingModal } from './components/common';
import DashboardLayout from './components/DashboardLayout';

import { REPORT_FIELDS, TEMPLATE_KEY_MAP, DATE_FIELDS, TEMPLATE_HEADERS } from './constants';
import { useFocusMode } from './hooks/useFocusMode';
import { useSSEProgress } from './hooks/useSSEProgress';
import { getApiBase } from './utils/apiBase';
import { excelSerialToDate, formatDateValue, isDateColumn } from './utils';

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

export default function App() {
    const panelRef = useRef(null);


    // Data State
    const [data, setData] = useState([]);
    const [headers, setHeaders] = useState([]);
    const [images, setImages] = useState([]);

    // Configuration State
    const [mappings, setMappings] = useState({});
    const [idColumn, setIdColumn] = useState('');

    // Selection State
    const [selectedIndex, setSelectedIndex] = useState('');
    const [searchOrder, setSearchOrder] = useState('');

    // Custom Logos State
    const [logoLeft, setLogoLeft] = useState(null);
    const [logoRight, setLogoRight] = useState(null);
    const [logoLeftFile, setLogoLeftFile] = useState(null);
    const [logoRightFile, setLogoRightFile] = useState(null);

    // Export Mode State
    const [exportScope, setExportScope] = useState('single'); // 'single' | 'all'
    const [exportFormat, setExportFormat] = useState('consolidated'); // 'consolidated' | 'individual'


    // Custom Template State
    const [customTemplate, setCustomTemplate] = useState(null); // { name, content }
    const [templateStatus, setTemplateStatus] = useState(null); // 'valid' | 'invalid' | null
    const [templateError, setTemplateError] = useState('');
    const [availableTemplates, setAvailableTemplates] = useState([]);

    // Custom Columns State
    const [customColumns, setCustomColumns] = useState(() => {
        // Load from localStorage on initial render
        const saved = localStorage.getItem('customColumns');
        return saved ? JSON.parse(saved) : [];
    });
    const [showColumnModal, setShowColumnModal] = useState(false);
    const [newColumnName, setNewColumnName] = useState('');
    const [newColumnMapping, setNewColumnMapping] = useState('');
    const [columnError, setColumnError] = useState('');

    // Images Required State - for templates that don't need images
    const [requiresImages, setRequiresImages] = useState(true);

    // PDF Loading State
    const [isPdfLoading, setIsPdfLoading] = useState(false);
    const [pdfLoadingMessage, setPdfLoadingMessage] = useState('');
    const sseProgress = useSSEProgress();

    // Focus Mode
    const isFocusMode = useFocusMode();

    // Save custom columns to localStorage whenever they change
    useEffect(() => {
        localStorage.setItem('customColumns', JSON.stringify(customColumns));
    }, [customColumns]);







    // Fetch available system templates on mount.
    useEffect(() => {
        let cancelled = false;

        const loadTemplates = async () => {
            try {
                const res = await fetch(`${API_BASE_URL}/templates`);
                if (!res.ok) throw new Error('Failed to fetch templates');
                const data = await res.json();

                if (cancelled) return;
                setAvailableTemplates(Array.isArray(data.templates) ? data.templates : []);
            } catch (err) {
                console.error("Error fetching templates:", err);
            }
        };

        loadTemplates();
        return () => {
            cancelled = true;
        };
    }, []);

    // Navigation helpers for Focus Mode
    const canPrevRow = selectedIndex !== '' && parseInt(selectedIndex) > 0;
    const canNextRow = selectedIndex !== '' && parseInt(selectedIndex) < data.length - 1;
    const goToPrevRow = () => {
        if (canPrevRow) setSelectedIndex(String(parseInt(selectedIndex) - 1));
    };
    const goToNextRow = () => {
        if (canNextRow) setSelectedIndex(String(parseInt(selectedIndex) + 1));
    };

    // Logo Upload Handler
    const handleLogoUpload = (e, side) => {
        const file = e.target.files[0];
        if (file) {
            if (side === 'left') setLogoLeftFile(file);
            else setLogoRightFile(file);

            const reader = new FileReader();
            reader.onload = (evt) => {
                if (side === 'left') setLogoLeft(evt.target.result);
                else setLogoRight(evt.target.result);
            };
            reader.readAsDataURL(file);
        }
    };

    // Custom Template Upload Handler
    const validateTemplateStructure = (content) => {
        // Check for common Jinja2 template patterns used in report templates
        const validPatterns = [
            '{{ data',       // Legacy single data
            '{{ images',     // Legacy single images  
            '{{ reports',    // Batch reports list
            'report.data',   // Report object data access
            'report.images', // Report object images access
            'report_list'    // Report list variable
        ];
        const hasValidPattern = validPatterns.some(v => content.includes(v));

        if (!hasValidPattern) {
            return {
                valid: false,
                error: 'La plantilla debe contener variables Jinja2 como {{ data }}, {{ images }}, {{ reports }} o report.data/report.images'
            };
        }

        // Check for basic HTML structure
        if (!content.includes('<html') && !content.includes('<!DOCTYPE')) {
            return {
                valid: false,
                error: 'La plantilla debe ser un documento HTML válido'
            };
        }

        return { valid: true, error: '' };
    };

    const handleTemplateUpload = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        if (!file.name.endsWith('.html')) {
            setTemplateStatus('invalid');
            setTemplateError('Solo se aceptan archivos .html');
            return;
        }

        const reader = new FileReader();
        reader.onload = (evt) => {
            const content = evt.target.result;
            const validation = validateTemplateStructure(content);

            if (validation.valid) {
                // User-uploaded template - will send full content
                setCustomTemplate({ name: file.name, content, isBackendTemplate: false });
                setTemplateStatus('valid');
                setTemplateError('');
            } else {
                setCustomTemplate(null);
                setTemplateStatus('invalid');
                setTemplateError(validation.error);
            }
        };
        reader.readAsText(file);
    };

    const handleResetTemplate = () => {
        setCustomTemplate(null);
        setTemplateStatus(null);
        setTemplateError('');
        setRequiresImages(true); // Reset to default (images required)
        // Reset file input
        const input = document.getElementById('templateInput');
        if (input) input.value = '';
    };

    const handleBackendTemplateSelect = async (e) => {
        const filename = e.target.value;
        if (!filename) return;

        try {
            const res = await fetch(`${API_BASE_URL}/templates/${filename}`);
            if (!res.ok) throw new Error("Failed to load template");
            const data = await res.json();

            const validation = validateTemplateStructure(data.content);
            if (validation.valid) {
                // Mark as backend template - will send templateName instead of full content
                setCustomTemplate({ name: data.name, content: data.content, isBackendTemplate: true });
                setTemplateStatus('valid');
                setTemplateError('');

                // Auto-detect if template requires images
                const templateContent = data.content.toLowerCase();
                const hasImageBlocks = templateContent.includes('report.images') ||
                    templateContent.includes('photo-grid') ||
                    templateContent.includes('photo-cell') ||
                    templateContent.includes('panel-fotografico');
                setRequiresImages(hasImageBlocks);
            } else {
                setCustomTemplate(null);
                setTemplateStatus('invalid');
                setTemplateError(validation.error);
            }
        } catch (err) {
            console.error(err);
            setTemplateStatus('invalid');
            setTemplateError("Error al cargar la plantilla: " + err.message);
        }
    };


    // Handlers
    const handleFileUpload = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (evt) => {
            const bstr = evt.target.result;
            // FIX: Use cellDates:false to get raw number for dates, preventing timezone issues
            const wb = XLSX.read(bstr, { type: 'binary', cellDates: false, cellNF: true });
            const wsname = wb.SheetNames[0];
            const ws = wb.Sheets[wsname];

            // FIX: Use raw option to get original values, then format dates manually
            const jsonData = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, dateNF: 'dd/mm/yy' });

            if (jsonData.length > 0) {
                const _headers = jsonData[0];
                const _data = jsonData.slice(1).map(row => {
                    let obj = {};
                    _headers.forEach((h, i) => {
                        let cellValue = row[i];

                        // FIX: Check if this looks like a date column and value is a number (Excel serial date)
                        if (isDateColumn(h) && typeof cellValue === 'number' && cellValue > 1000 && cellValue < 100000) {
                            // Convert Excel serial date to DD/MM/YY format manually
                            // This avoids timezone issues by treating it as pure numbers
                            cellValue = excelSerialToDate(cellValue);
                        }

                        obj[h] = cellValue;
                    });
                    return obj;
                });
                setHeaders(_headers);
                setData(_data);
                // Auto-map logic
                autoMapFields(_headers);
            }
        };
        reader.readAsBinaryString(file);
    };

    const autoMapFields = (_headers) => {
        const newMap = {};
        REPORT_FIELDS.forEach(field => {
            const match = _headers.find(h =>
                h.toLowerCase().includes(field.id) ||
                h.toLowerCase().includes(field.label.toLowerCase())
            );
            if (match) newMap[field.id] = match;
        });
        setMappings(newMap);
    };

    const handleImageUpload = (e) => {
        setImages(Array.from(e.target.files));
    };

    // Custom Column Handlers
    const addCustomColumn = () => {
        // Validation
        if (!newColumnName.trim()) {
            setColumnError('El nombre de la columna es requerido');
            return;
        }
        if (!newColumnMapping) {
            setColumnError('Debe seleccionar una columna del CSV');
            return;
        }

        // Check for duplicate names
        const allColumnNames = [
            ...REPORT_FIELDS.map(f => f.label.toLowerCase()),
            ...customColumns.map(c => c.name.toLowerCase())
        ];
        if (allColumnNames.includes(newColumnName.trim().toLowerCase())) {
            setColumnError('Ya existe una columna con ese nombre');
            return;
        }

        const newColumn = {
            id: `custom_${Date.now()}`,
            name: newColumnName.trim().toUpperCase(),
            mappedTo: newColumnMapping
        };

        setCustomColumns([...customColumns, newColumn]);
        setMappings({ ...mappings, [newColumn.id]: newColumnMapping });
        resetColumnModal();
    };

    const removeCustomColumn = (columnId) => {
        setCustomColumns(customColumns.filter(c => c.id !== columnId));
        const newMappings = { ...mappings };
        delete newMappings[columnId];
        setMappings(newMappings);
    };

    const resetColumnModal = () => {
        setShowColumnModal(false);
        setNewColumnName('');
        setNewColumnMapping('');
        setColumnError('');
    };


    // Helper: Match image name to record ID with exact prefix matching
    // Pattern: ID_NUMBER.ext or ID.ext (e.g., 1_1.jpeg, 1_2.jpg, 1.png)
    // Prevents ID "1" from matching "11_1.jpeg" or "12_2.jpg"
    const matchesRecordId = (imageName, recordId) => {
        const id = String(recordId).trim();
        const name = imageName.toLowerCase();
        // Regex: ^ID followed by (separator + digits) or directly by .extension
        // Example: For ID "1", matches: 1_1.jpg, 1_2.jpeg, 1-1.png, 1.jpg
        // Does NOT match: 11_1.jpg, 12.jpg, 21_1.jpg
        const regex = new RegExp(`^${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:[-_]\\d+)?\\.(jpg|jpeg|png|gif|webp)$`, 'i');
        return regex.test(name);
    };

    const getFilteredImages = () => {
        if (selectedIndex === '' || selectedIndex === null || selectedIndex === undefined) return [];

        const index = Number(selectedIndex);
        if (Number.isNaN(index) || index < 0 || index >= data.length) return [];

        const row = data[index];
        if (!row || !idColumn) return [];

        const recordId = String(row[idColumn]);

        // Use exact matching to prevent ID collisions
        const filtered = images.filter(img => matchesRecordId(img.name, recordId));

        // Remove duplicates by name (in case of re-uploads)
        const seen = new Set();
        return filtered.filter(img => {
            if (seen.has(img.name)) return false;
            seen.add(img.name);
            return true;
        });
    };

    const handleDownload = async () => {
        if (!panelRef.current) return;

        // When a custom template is active, panelRef points to an <iframe>.
        // html2canvas cannot capture iframe content directly, so we render
        // from the iframe's inner document instead.
        let target = panelRef.current;
        const canvasOptions = {
            scale: 2,
            useCORS: true,
            allowTaint: true,
            backgroundColor: '#ffffff',
        };
        if (panelRef.current.tagName === 'IFRAME') {
            const iframeDoc = panelRef.current.contentDocument || panelRef.current.contentWindow?.document;
            if (iframeDoc?.body) {
                // Ensure assets are loaded before rasterizing the iframe content.
                if (iframeDoc.fonts?.ready) {
                    try {
                        await iframeDoc.fonts.ready;
                    } catch {
                        // Ignore font loading errors and continue with image wait.
                    }
                }

                const imagePromises = Array.from(iframeDoc.images || []).map((img) => {
                    if (img.complete) return Promise.resolve();
                    return new Promise((resolve) => {
                        const done = () => resolve();
                        img.addEventListener('load', done, { once: true });
                        img.addEventListener('error', done, { once: true });
                    });
                });
                await Promise.all(imagePromises);

                target = iframeDoc.querySelector('.page') || iframeDoc.body;
                const width = Math.ceil(target.scrollWidth || target.clientWidth || 0);
                const height = Math.ceil(target.scrollHeight || target.clientHeight || 0);
                if (width > 0 && height > 0) {
                    canvasOptions.width = width;
                    canvasOptions.height = height;
                    canvasOptions.windowWidth = width;
                    canvasOptions.windowHeight = height;
                }
            }
        }

        const canvas = await html2canvas(target, canvasOptions);
        const link = document.createElement('a');
        link.download = `Panel_${data[selectedIndex]?.[idColumn] || 'Output'}.png`;
        link.href = canvas.toDataURL();
        link.click();
    };

    const handleBackendDownload = async () => {
        if (exportScope === 'single' && selectedIndex === '') return;
        if (exportScope === 'all' && data.length === 0) return;

        // Helper to format a single row
        const formatRowData = (row) => {
            const rowData = {};
            Object.keys(mappings).forEach(key => {
                const excelHeader = mappings[key];
                let value = row[excelHeader];

                // Apply date formatting if this is a date field
                if (DATE_FIELDS.includes(key)) {
                    value = formatDateValue(value);
                }

                if (TEMPLATE_KEY_MAP[key]) rowData[TEMPLATE_KEY_MAP[key]] = value;
            });

            // Add custom columns to the row data
            customColumns.forEach(col => {
                if (mappings[col.id]) {
                    const excelHeader = mappings[col.id];
                    let value = row[excelHeader];

                    // Check if custom column name suggests it's a date
                    const colNameUpper = col.name.toUpperCase();
                    if (colNameUpper.includes('FECHA') || colNameUpper.includes('DATE')) {
                        value = formatDateValue(value);
                    }

                    rowData[col.name] = value;
                }
            });

            if (idColumn) rowData['Nro OT'] = row[idColumn];
            return rowData;
        };

        const formData = new FormData();
        let payload = [];
        let allImages = new Set(); // Track unique images to upload

        if (exportScope === 'single') {
            const row = data[selectedIndex];
            const rowData = formatRowData(row);

            // Only get images if required
            const rowImages = requiresImages ? getFilteredImages() : [];

            // For single mode, maintain legacy structure check or use list
            // Using list structure for uniformity since backend supports it
            const imgNames = rowImages.map(f => f.name);
            payload.push({ row_data: rowData, image_filenames: imgNames });

            rowImages.forEach(img => allImages.add(img));
        } else {
            // Bulk Mode
            data.forEach(row => {
                const recordId = String(row[idColumn]);

                if (requiresImages) {
                    // Use exact matching to prevent ID collisions (e.g., ID "1" matching "11")
                    const rowImages = images.filter(img => matchesRecordId(img.name, recordId));

                    if (rowImages.length > 0) {
                        const rowData = formatRowData(row);
                        const imgNames = rowImages.map(f => f.name);
                        payload.push({ row_data: rowData, image_filenames: imgNames });
                        rowImages.forEach(img => allImages.add(img));
                    }
                } else {
                    // No images required: include all rows
                    const rowData = formatRowData(row);
                    payload.push({ row_data: rowData, image_filenames: [] });
                }
            });

            if (exportFormat === 'individual') {
                alert("Modo 'Individuales' en bloque: Funcionalidad de descarga ZIP pendiente. Por favor use 'Consolidado' por ahora.");
                return;
            }
        }

        formData.append('data', JSON.stringify(payload));

        // Append all unique images
        allImages.forEach(img => formData.append('files', img));

        if (logoLeftFile) formData.append('logoLeft', logoLeftFile);
        if (logoRightFile) formData.append('logoRight', logoRightFile);

        // Append custom template if exists
        if (customTemplate) {
            if (customTemplate.isBackendTemplate) {
                // Backend template: send only the name (avoids encoding issues with large HTML)
                formData.append('templateName', customTemplate.name);
            } else {
                // User-uploaded template: send full content
                formData.append('customTemplate', customTemplate.content);
            }
        }

        const isBatch = exportScope === 'all' && payload.length > 1;

        if (isBatch) {
            // Use SSE for batch mode with real-time progress
            setPdfLoadingMessage(`Generando PDF consolidado (${payload.length} registros)...`);
            console.log(`Sending SSE PDF request: ${payload.length} reports, ${allImages.size} images`);
            sseProgress.run('/api/generate-pdf-progress', formData, {
                onComplete: async (downloadUrl) => {
                    try {
                        const base = getApiBase();
                        const resp = await fetch(`${base}${downloadUrl}`);
                        if (!resp.ok) throw new Error(`Download failed: ${resp.status}`);
                        const blob = await resp.blob();
                        downloadBlob(blob, `Paneles_Consolidado_${new Date().toISOString().split('T')[0]}.pdf`);
                    } catch (err) {
                        alert(`Error descargando PDF: ${err.message}`);
                    }
                },
                onError: async (errMsg) => {
                    // Fallback to original non-SSE endpoint
                    console.warn('SSE failed, falling back to standard fetch:', errMsg);
                    try {
                        setIsPdfLoading(true);
                        setPdfLoadingMessage(`Generando PDF consolidado (${payload.length} registros)...`);
                        const response = await fetch(`${API_BASE_URL}/generate-pdf`, { method: 'POST', body: formData });
                        if (!response.ok) throw new Error(`Server returned ${response.status}`);
                        const blob = await response.blob();
                        downloadBlob(blob, `Paneles_Consolidado_${new Date().toISOString().split('T')[0]}.pdf`);
                    } catch (fallbackErr) {
                        alert(`Error generando PDF: ${fallbackErr.message}`);
                    } finally {
                        setIsPdfLoading(false);
                    }
                }
            });
        } else {
            // Single mode or simple request - use original fetch
            try {
                setIsPdfLoading(true);
                setPdfLoadingMessage(exportScope === 'single' ? 'Generando PDF...' : `Generando PDF consolidado (${payload.length} registros)...`);

                console.log(`Sending PDF request: ${payload.length} reports, ${allImages.size} images`);
                const response = await fetch(`${API_BASE_URL}/generate-pdf`, {
                    method: 'POST',
                    body: formData,
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    throw new Error(`Server returned ${response.status}: ${errorText}`);
                }

                const blob = await response.blob();
                const filename = `Reporte_${data[selectedIndex][idColumn] || 'Output'}.pdf`;
                downloadBlob(blob, filename);

            } catch (err) {
                console.error("PDF Generation Error:", err);
                let errorMessage = 'Error al generar PDF: ';
                if (err.message.includes('Failed to fetch')) {
                    errorMessage += 'No se puede conectar con el servidor. Verifica que el backend esté activo y la URL sea correcta.';
                } else if (err.message.includes('NetworkError')) {
                    errorMessage += 'Error de red. Verifica tu conexión a internet.';
                } else {
                    errorMessage += err.message;
                }
                alert(errorMessage);
            } finally {
                setIsPdfLoading(false);
            }
        }
    };

    const handleDownloadTemplate = () => {
        const ws = XLSX.utils.aoa_to_sheet([TEMPLATE_HEADERS]);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Plantilla");
        const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
        const dataBlob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;charset=UTF-8' });
        downloadBlob(dataBlob, 'Plantilla_Importacion.xlsx');
    };
    const handlePrint = () => {
        window.print();
    };

    return (
        <DashboardLayout>
            <div className="flex h-full w-full bg-neutral-900 overflow-hidden font-sans text-sm">

                {/* Sidebar */}
                <aside className={`bg-neutral-950 text-white flex flex-col transition-all duration-300 translate-x-0 ${isFocusMode ? 'w-0 overflow-hidden opacity-0 border-none' : 'w-96 border-r border-neutral-800'}`}>




                    <div className="flex-1 overflow-y-auto p-4 space-y-6">

                        {/* Step 0: Logos */}
                        <Step number="0" title="Logos y Cabecera" icon={<Settings size={16} />}>
                            <div className="grid grid-cols-2 gap-2">
                                <div className="text-center">
                                    <label className="block text-xs text-neutral-400 mb-1">Logo Izq</label>
                                    <div className="border border-dashed border-neutral-700 h-16 rounded flex items-center justify-center cursor-pointer hover:bg-neutral-800 relative overflow-hidden"
                                        onClick={() => document.getElementById('logoLeftInput').click()}>
                                        {logoLeft ? <img src={logoLeft} className="h-full object-contain" /> : <div className="text-xs text-neutral-500">Subir Logo</div>}
                                    </div>
                                    <input id="logoLeftInput" type="file" hidden accept="image/*" onChange={(e) => handleLogoUpload(e, 'left')} />
                                </div>
                                <div className="text-center">
                                    <label className="block text-xs text-neutral-400 mb-1">Logo Der</label>
                                    <div className="border border-dashed border-neutral-700 h-16 rounded flex items-center justify-center cursor-pointer hover:bg-neutral-800 relative overflow-hidden"
                                        onClick={() => document.getElementById('logoRightInput').click()}>
                                        {logoRight ? <img src={logoRight} className="h-full object-contain" /> : <div className="text-xs text-neutral-500">Subir Logo</div>}
                                    </div>
                                    <input id="logoRightInput" type="file" hidden accept="image/*" onChange={(e) => handleLogoUpload(e, 'right')} />
                                </div>
                            </div>
                        </Step>

                        {/* Step 1: Custom Template */}
                        <Step number="1" title="Cargar Plantilla" icon={<FileCode size={16} />}>
                            <div className="space-y-2">
                                {/* Upload Button */}
                                <label className="block w-full cursor-pointer group">
                                    <div className={`border border-dashed rounded-lg p-3 text-center transition-colors ${templateStatus === 'valid' ? 'border-green-500 bg-green-500/10' :
                                        templateStatus === 'invalid' ? 'border-red-500 bg-red-500/10' :
                                            'border-neutral-700 hover:bg-neutral-900'
                                        }`}>
                                        <div className="flex items-center justify-center gap-2">
                                            {templateStatus === 'valid' && <CheckCircle size={14} className="text-green-500" />}
                                            {templateStatus === 'invalid' && <AlertCircle size={14} className="text-red-500" />}
                                            <span className={`text-xs transition-colors ${templateStatus === 'valid' ? 'text-green-400' :
                                                templateStatus === 'invalid' ? 'text-red-400' :
                                                    'text-neutral-400 group-hover:text-white'
                                                }`}>
                                                {customTemplate ? customTemplate.name : 'Subir Plantilla HTML'}
                                            </span>
                                        </div>
                                    </div>
                                    <input
                                        id="templateInput"
                                        type="file"
                                        hidden
                                        accept=".html"
                                        onChange={handleTemplateUpload}
                                    />
                                </label>

                                {/* Backend Template Dropdown */}
                                <div className="mt-2">
                                    <label className="block text-xs text-neutral-400 mb-1">O seleccionar existente:</label>
                                    <select
                                        className="w-full bg-neutral-900 border border-neutral-700 rounded p-1.5 text-xs text-white focus:border-white outline-none disabled:opacity-50"
                                        onChange={handleBackendTemplateSelect}
                                        value={availableTemplates.includes(customTemplate?.name) ? customTemplate.name : ""}
                                        disabled={availableTemplates.length === 0}
                                    >
                                        <option value="">
                                            {availableTemplates.length === 0 ? "Sin plantillas (Verificar Backend)" : "-- Elegir Plantilla --"}
                                        </option>
                                        {availableTemplates.map(t => (
                                            <option key={t} value={t}>{t}</option>
                                        ))}
                                    </select>
                                </div>

                                {/* Error Message */}
                                {templateStatus === 'invalid' && templateError && (
                                    <div className="text-[10px] text-red-400 px-1">
                                        ⚠️ {templateError}
                                    </div>
                                )}

                                {/* Active Template Indicator */}
                                <div className={`flex items-center justify-between p-2 rounded text-[10px] ${customTemplate ? 'bg-green-500/10 border border-green-500/30' : 'bg-neutral-800 border border-neutral-700'
                                    }`}>
                                    <span className="text-neutral-400">Plantilla activa:</span>
                                    <span className={customTemplate ? 'text-green-400 font-medium' : 'text-neutral-500'}>
                                        {customTemplate ? customTemplate.name : 'Predeterminada'}
                                    </span>
                                </div>

                                {/* Reset Button */}
                                {customTemplate && (
                                    <button
                                        onClick={handleResetTemplate}
                                        className="w-full flex items-center justify-center gap-2 border border-dashed border-neutral-700 hover:border-neutral-500 rounded p-2 text-center hover:bg-neutral-800 transition-all text-[10px] text-neutral-400 hover:text-white"
                                    >
                                        <RotateCcw size={12} />
                                        Usar Plantilla Predeterminada
                                    </button>
                                )}

                                {/* Images Required Toggle */}
                                <div className={`flex items-center justify-between p-2 rounded border transition-colors ${requiresImages
                                    ? 'bg-neutral-800 border-neutral-700'
                                    : 'bg-amber-500/10 border-amber-500/30'
                                    }`}>
                                    <div className="flex items-center gap-2">
                                        <ImageIcon size={12} className={requiresImages ? 'text-neutral-400' : 'text-amber-400'} />
                                        <span className="text-[10px] text-neutral-300">Requiere imágenes</span>
                                    </div>
                                    <label className="relative inline-flex items-center cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={requiresImages}
                                            onChange={(e) => setRequiresImages(e.target.checked)}
                                            className="sr-only peer"
                                        />
                                        <div className="w-8 h-4 bg-neutral-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-green-600"></div>
                                    </label>
                                </div>
                                {!requiresImages && (
                                    <div className="text-[9px] text-amber-400/80 px-1">
                                        ⚠️ Esta plantilla no requiere imágenes (ej: certificados)
                                    </div>
                                )}
                            </div>
                        </Step>

                        {/* Step 2: Upload Data */}
                        <Step number="2" title="Cargar Datos" icon={<FileSpreadsheet size={16} />}>
                            <label className="block w-full cursor-pointer group">
                                <div className="border border-dashed border-neutral-700 rounded-lg p-3 text-center hover:bg-neutral-900 transition-colors">
                                    <div className="text-neutral-400 text-xs group-hover:text-white transition-colors">
                                        {headers.length > 0 ? `${data.length} registros cargados` : 'Seleccionar Excel / CSV'}
                                    </div>
                                </div>
                                <input type="file" hidden accept=".csv,.xlsx,.xls" onChange={handleFileUpload} />
                            </label>
                        </Step>

                        {/* Step 3: Mapping */}
                        <Step number="3" title="Mapeo de Columnas" icon={<Settings size={16} />}>
                            <div className={`transition-all duration-300 ${headers.length === 0 ? 'opacity-30 pointer-events-none' : ''}`}>
                                <div className="mb-3">
                                    <label className="block text-neutral-400 text-sm mb-1.5 font-semibold">Columna ID (Clave)</label>
                                    <select
                                        className="w-full bg-neutral-900 border border-neutral-700 rounded p-2 text-sm text-white focus:border-white outline-none"
                                        value={idColumn}
                                        onChange={e => setIdColumn(e.target.value)}
                                    >
                                        <option value="">-- Seleccionar ID --</option>
                                        {headers.map(h => <option key={h} value={h}>{h}</option>)}
                                    </select>
                                </div>

                                <div className="space-y-2 border-t border-neutral-800 pt-3 max-h-56 overflow-y-auto pr-1">
                                    {/* Predefined Fields */}
                                    {REPORT_FIELDS.map(field => (
                                        <div key={field.id} className="grid grid-cols-2 gap-2 items-center">
                                            <span className="text-neutral-500 text-xs uppercase font-medium">{field.label}</span>
                                            <select
                                                className={`bg-neutral-900 border border-neutral-700 rounded px-2 py-1.5 text-xs text-white outline-none ${mappings[field.id] ? 'border-l-2 border-l-green-500' : ''}`}
                                                value={mappings[field.id] || ''}
                                                onChange={(e) => setMappings({ ...mappings, [field.id]: e.target.value })}
                                            >
                                                <option value="">Ignorar</option>
                                                {headers.map(h => <option key={h} value={h}>{h}</option>)}
                                            </select>
                                        </div>
                                    ))}

                                    {/* Custom Columns */}
                                    {customColumns.map(col => (
                                        <div key={col.id} className="grid grid-cols-[1fr_auto_auto] gap-2 items-center bg-neutral-800/50 rounded px-2 py-1">
                                            <span className="text-white text-xs uppercase font-medium">{col.name}</span>
                                            <select
                                                className={`bg-neutral-900 border border-neutral-700 rounded px-2 py-1.5 text-xs text-white outline-none ${mappings[col.id] ? 'border-l-2 border-l-neutral-500' : ''}`}
                                                value={mappings[col.id] || col.mappedTo || ''}
                                                onChange={(e) => setMappings({ ...mappings, [col.id]: e.target.value })}
                                            >
                                                <option value="">Ignorar</option>
                                                {headers.map(h => <option key={h} value={h}>{h}</option>)}
                                            </select>
                                            <button
                                                onClick={() => removeCustomColumn(col.id)}
                                                className="text-red-400 hover:text-red-300 text-xs px-1 hover:bg-red-500/20 rounded transition-colors"
                                                title="Eliminar columna personalizada"
                                            >
                                                ✕
                                            </button>
                                        </div>
                                    ))}
                                </div>

                                {/* Add Custom Column Button */}
                                <button
                                    onClick={() => setShowColumnModal(true)}
                                    disabled={headers.length === 0}
                                    className="w-full mt-3 border border-dashed border-white/70 hover:border-white text-white/70 hover:text-white rounded p-2.5 text-center hover:bg-white/5 transition-all flex items-center justify-center gap-2 text-xs disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <span>+</span> Agregar Columna Personalizada
                                </button>
                            </div>

                            <button
                                onClick={handleDownloadTemplate}
                                className="w-full mt-3 border border-dashed border-neutral-700 hover:border-neutral-500 rounded p-2.5 text-center hover:bg-neutral-800 transition-all flex items-center justify-center gap-2 text-xs text-neutral-400 hover:text-white"
                            >
                                <span>📥</span> Descargar Plantilla Excel
                            </button>
                        </Step>

                        {/* Step 4: Images */}
                        <Step number="4" title={requiresImages ? "Cargar Imágenes" : "Imágenes (Opcional)"} disabled={!idColumn || !requiresImages} icon={<ImageIcon size={16} />}>
                            {requiresImages ? (
                                <label className="block w-full cursor-pointer group">
                                    <div className="border border-dashed border-neutral-700 rounded-lg p-3 text-center hover:bg-neutral-900 transition-colors">
                                        <div className="text-neutral-400 text-xs group-hover:text-white transition-colors">
                                            {images.length > 0 ? `${images.length} imágenes` : 'Subir Carpeta de Fotos'}
                                        </div>
                                    </div>
                                    <input type="file" hidden multiple accept="image/*" onChange={handleImageUpload} />
                                </label>
                            ) : (
                                <div className="border border-dashed border-neutral-700/50 rounded-lg p-3 text-center bg-neutral-800/30">
                                    <div className="text-neutral-500 text-xs">
                                        No requerido para esta plantilla
                                    </div>
                                </div>
                            )}
                        </Step>

                        {/* Step 5: Select Record */}
                        <Step number="5" title="Seleccionar Orden" disabled={requiresImages ? images.length === 0 : data.length === 0}>
                            <div className="relative mb-2">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" size={16} />
                                <input
                                    type="text"
                                    placeholder="Buscar orden..."
                                    value={searchOrder}
                                    onChange={(e) => {
                                        const term = e.target.value;
                                        setSearchOrder(term);
                                        if (term) {
                                            const matchIdx = data.findIndex((row, idx) => {
                                                const label = idColumn ? String(row[idColumn]) : `Fila ${idx + 1}`;
                                                return label.toLowerCase().includes(term.toLowerCase()) || String(idx + 1).includes(term);
                                            });
                                            if (matchIdx !== -1) {
                                                setSelectedIndex(String(matchIdx));
                                                setExportScope('single');
                                            }
                                        }
                                    }}
                                    className="w-full pl-9 pr-3 py-2 bg-neutral-900 border border-neutral-700 rounded text-white text-sm focus:border-white outline-none placeholder:text-neutral-500"
                                />
                            </div>
                            <select
                                className="w-full bg-white text-black font-bold border border-neutral-300 rounded p-2.5 text-sm focus:outline-none disabled:opacity-50"
                                value={selectedIndex}
                                onChange={e => {
                                    setSelectedIndex(e.target.value);
                                    setExportScope('single');
                                }}
                                disabled={exportScope === 'all'}
                            >
                                <option value="">-- Seleccionar Fila --</option>
                                {data.map((row, idx) => (
                                    <option key={idx} value={idx}>
                                        {idx + 1}. {idColumn ? row[idColumn] : `Fila ${idx + 1}`}
                                    </option>
                                ))}
                            </select>

                            {/* EXPORT OPTIONS */}
                            <div className="bg-neutral-900 border border-neutral-800 rounded p-3 mt-3">
                                <h4 className="text-xs uppercase text-neutral-500 font-bold mb-3">Opciones de Exportación</h4>

                                <div className="flex gap-2 mb-3">
                                    <button
                                        className={`flex-1 py-1.5 px-3 rounded text-xs font-medium transition-colors ${exportScope === 'single' ? 'bg-black text-white border border-white' : 'bg-neutral-800 text-neutral-400'}`}
                                        onClick={() => setExportScope('single')}
                                    >
                                        Solo Actual
                                    </button>
                                    <button
                                        className={`flex-1 py-1.5 px-3 rounded text-xs font-medium transition-colors ${exportScope === 'all' ? 'bg-black text-white border border-white' : 'bg-neutral-800 text-neutral-400'}`}
                                        onClick={() => setExportScope('all')}
                                    >
                                        Todo ({data.length})
                                    </button>
                                </div>

                                {exportScope === 'all' && (
                                    <div className="flex flex-col gap-2">
                                        <label className="flex items-center gap-2 cursor-pointer">
                                            <input
                                                type="radio"
                                                name="format"
                                                checked={exportFormat === 'consolidated'}
                                                onChange={() => setExportFormat('consolidated')}
                                                className="text-blue-500 bg-neutral-800 border-neutral-600"
                                            />
                                            <span className="text-white text-xs">PDF Consolidado (1 Archivo)</span>
                                        </label>
                                        <label className="flex items-center gap-2 cursor-pointer opacity-50">
                                            <input
                                                type="radio"
                                                name="format"
                                                checked={exportFormat === 'individual'}
                                                onChange={() => setExportFormat('individual')}
                                                className="text-blue-500 bg-neutral-800 border-neutral-600"
                                            />
                                            <span className="text-white text-xs">PDFs Individuales (ZIP)</span>
                                        </label>
                                    </div>
                                )}
                            </div>

                            <div className="grid grid-cols-1 gap-2 mt-4">
                                <button
                                    onClick={handleBackendDownload}
                                    disabled={exportScope === 'single' && selectedIndex === ''}
                                    className="flex items-center justify-center gap-2 bg-black hover:bg-neutral-900 border border-neutral-700 text-white font-bold p-3 rounded disabled:opacity-50 transition-colors shadow-lg text-sm"
                                >
                                    <Printer size={18} /> Descargar PDF
                                </button>
                                <div className="grid grid-cols-2 gap-2">
                                    <button
                                        onClick={handlePrint}
                                        disabled={selectedIndex === ''}
                                        className="flex items-center justify-center gap-2 bg-neutral-800 hover:bg-neutral-700 text-white p-2.5 rounded disabled:opacity-50 transition-colors text-xs"
                                    >
                                        Impresión Rápida
                                    </button>
                                    <button
                                        onClick={handleDownload}
                                        disabled={selectedIndex === ''}
                                        className="flex items-center justify-center gap-2 bg-neutral-800 hover:bg-neutral-700 text-white p-2.5 rounded disabled:opacity-50 transition-colors text-xs"
                                    >
                                        PNG Screenshot
                                    </button>
                                </div>
                            </div>
                        </Step>



                    </div>
                </aside>

                {/* Main Preview */}
                <main className="flex-1 flex flex-col h-full overflow-hidden relative">
                    <PreviewPanel
                        ref={panelRef}
                        data={data[selectedIndex]}
                        images={getFilteredImages()}
                        mappings={mappings}
                        logoLeft={logoLeft}
                        logoRight={logoRight}
                        customTemplate={customTemplate}
                        customColumns={customColumns}
                        isFocusMode={isFocusMode}
                    />

                    {/* Focus Mode Navigation Arrows */}
                    {isFocusMode && (
                        <>
                            <button
                                onClick={goToPrevRow}
                                disabled={!canPrevRow}
                                className={`fixed left-4 top-1/2 -translate-y-1/2 p-2 transition-colors z-[100] outline-none ${!canPrevRow ? 'text-gray-700 opacity-50 cursor-not-allowed' : 'text-red-600 hover:text-red-500 opacity-80 hover:opacity-100'}`}
                                title="Registro Anterior"
                            >
                                <ChevronLeft size={80} strokeWidth={1.5} />
                            </button>

                            <button
                                onClick={goToNextRow}
                                disabled={!canNextRow}
                                className={`fixed right-4 top-1/2 -translate-y-1/2 p-2 transition-colors z-[100] outline-none ${!canNextRow ? 'text-gray-700 opacity-50 cursor-not-allowed' : 'text-red-600 hover:text-red-500 opacity-80 hover:opacity-100'}`}
                                title="Siguiente Registro"
                            >
                                <ChevronRight size={80} strokeWidth={1.5} />
                            </button>

                            {/* Focus Mode Hint */}
                            <div className="fixed top-4 right-4 z-[100] text-white/50 text-xs font-mono pointer-events-none select-none">
                                MODO FOCUS (CTRL + .)
                            </div>

                            {/* Current position indicator */}
                            <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[100] text-white/50 text-sm font-mono bg-black/50 px-4 py-2 rounded-full">
                                {selectedIndex !== '' ? `${parseInt(selectedIndex) + 1} / ${data.length}` : 'Sin registro seleccionado'}
                            </div>
                        </>
                    )}
                </main>

                {/* Custom Column Modal - Nothing Tech Style */}
                {
                    showColumnModal && (
                        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
                            <div className="bg-[#0a0a0a] border border-white/20 rounded-lg p-6 w-full max-w-md mx-4 shadow-2xl">
                                <h3 className="text-white font-mono font-bold text-base mb-5 flex items-center gap-2 tracking-wide">
                                    <span className="text-white">+</span> Agregar Columna Personalizada
                                </h3>

                                {columnError && (
                                    <div className="bg-white/5 border border-white/30 text-white text-xs rounded p-2 mb-4 flex items-center gap-2">
                                        <AlertCircle size={14} />
                                        {columnError}
                                    </div>
                                )}

                                <div className="space-y-5">
                                    <div>
                                        <label className="block text-white/60 text-xs mb-2 font-mono uppercase tracking-wider">
                                            Nombre de la Columna
                                        </label>
                                        <input
                                            type="text"
                                            value={newColumnName}
                                            onChange={(e) => setNewColumnName(e.target.value)}
                                            placeholder="Ej: FECHA CORTE, OBSERVACIONES EXTRA"
                                            className="w-full bg-white text-black border-0 rounded p-3 text-sm font-mono focus:ring-2 focus:ring-white/50 outline-none placeholder:text-neutral-400"
                                        />
                                        <p className="text-white/40 text-[10px] mt-1.5 font-mono">
                                            Este nombre aparecerá en el reporte generado
                                        </p>
                                    </div>

                                    <div>
                                        <label className="block text-white/60 text-xs mb-2 font-mono uppercase tracking-wider">
                                            Columna del CSV a Mapear
                                        </label>
                                        <select
                                            value={newColumnMapping}
                                            onChange={(e) => setNewColumnMapping(e.target.value)}
                                            className="w-full bg-[#1a1a1a] border border-white/20 rounded p-3 text-sm text-white font-mono focus:border-white/50 outline-none cursor-pointer"
                                        >
                                            <option value="">-- Seleccionar Columna --</option>
                                            {headers.map(h => <option key={h} value={h}>{h}</option>)}
                                        </select>
                                        <p className="text-white/40 text-[10px] mt-1.5 font-mono">
                                            Los datos de esta columna se agregarán al reporte
                                        </p>
                                    </div>
                                </div>

                                <div className="flex gap-3 mt-6">
                                    <button
                                        onClick={resetColumnModal}
                                        className="flex-1 border border-white/30 text-white/60 hover:text-white hover:border-white/60 rounded py-2.5 text-sm font-mono transition-colors"
                                    >
                                        Cancelar
                                    </button>
                                    <button
                                        onClick={addCustomColumn}
                                        className="flex-1 bg-white hover:bg-white/90 text-black rounded py-2.5 text-sm font-mono font-semibold transition-colors"
                                    >
                                        Agregar Columna
                                    </button>
                                </div>
                            </div>
                        </div>
                    )
                }



                {/* PDF Loading Modal */}
                {(isPdfLoading || sseProgress.isLoading) && (
                    <LoadingModal
                        message={pdfLoadingMessage}
                        accentColor="#D71921"
                        progress={sseProgress.isLoading ? sseProgress.progress : null}
                    />
                )}

            </div>
        </DashboardLayout>
    );
}
