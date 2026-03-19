import React, { forwardRef, useState, useEffect, useRef } from 'react';
import { formatDateValue } from '../utils';

const PreviewPanel = forwardRef(({ data, images, mappings, logoLeft, logoRight, customTemplate, customColumns = [], isFocusMode = false }, ref) => {
    const [layoutMode, setLayoutMode] = useState('grid');
    const [renderedHtml, setRenderedHtml] = useState('');
    const templateObjUrlsRef = useRef([]);
    const [imageUrls, setImageUrls] = useState([]);

    useEffect(() => {
        if (!images || images.length === 0) {
            setImageUrls([]);
            return;
        }
        const urls = images.map(img => URL.createObjectURL(img));
        setImageUrls(urls);
        return () => urls.forEach(url => URL.revokeObjectURL(url));
    }, [images]);

    const normalizePhotoGridTemplate = (sourceHtml) => {
        if (!sourceHtml || typeof sourceHtml !== 'string') return sourceHtml;
        if (!sourceHtml.includes('photo-cell-wrap')) return sourceHtml;

        if (sourceHtml.includes('photo-grid-compat-fix')) return sourceHtml;

        // CSS-only compat fix that handles both modern (.photo-media wrapper)
        // and legacy (img directly in .photo-cell-wrap) templates without
        // fragile regex-based HTML restructuring.
        const compatCss = `
<style id="photo-grid-compat-fix">
  .photo-cell-wrap {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    justify-content: flex-start;
    width: 100%;
    height: 100%;
    min-height: 0;
    padding: 1mm;
    box-sizing: border-box;
    overflow: hidden;
  }
  .photo-media {
    flex: 1 1 auto;
    min-height: 0;
    min-width: 0;
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  }
  .photo-cell-wrap,
  .photo-media {
    position: relative;
    overflow: hidden;
  }

  /* Modern: img inside .photo-media */
  .photo-media > img {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    object-fit: contain;
    object-position: center;
    display: block;
  }
  .photo-cell-wrap > img {
    flex: 1 1 auto;
    min-height: 0;
    width: 100% !important;
    height: auto !important;
    max-height: 100%;
    object-fit: contain !important;
    object-position: center !important;
    display: block;
  }
  .photo-cell img {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
    object-position: center;
    display: block;
  }
  .photo-label {
    flex-shrink: 0;
    font-weight: 700;
    font-size: 7.5pt;
    text-transform: uppercase;
    margin-top: 1mm;
    text-align: center;
  }
</style>`;

        if (/<\/head>/i.test(sourceHtml)) {
            return sourceHtml.replace(/<\/head>/i, `${compatCss}</head>`);
        }
        return `${compatCss}${sourceHtml}`;
    };

    // Helper to get mapped value with optional date formatting
    const getValue = (fieldId, isDateField = false) => {
        if (!data || !mappings[fieldId]) return '-';
        const value = data[mappings[fieldId]] || '-';
        return isDateField ? formatDateValue(value) : value;
    };

    // Render custom template effect
    useEffect(() => {
        // Revoke old object URLs from previous render
        templateObjUrlsRef.current.forEach(url => URL.revokeObjectURL(url));
        templateObjUrlsRef.current = [];

        if (!customTemplate) {
            setRenderedHtml('');
            return;
        }

        const newObjUrls = [];
        const trackObjectURL = (file) => {
            const url = URL.createObjectURL(file);
            newObjUrls.push(url);
            return url;
        };

        const renderTemplate = async () => {
            let html = normalizePhotoGridTemplate(customTemplate.content);

            // 1. Prepare Data
            const reportData = {};
            // Reverse mapping to help looking up by Label
            // (Standard fields are "CENTRO", "NIS", etc.)
            // We need to support {{ report.data.get('CENTRO', '-') }}
            // We'll iterate the Mappings and providing values for specific Keys
            if (data && mappings) {
                // Define which fields are date fields
                const dateFieldKeys = ['fecha_corte', 'fecha-corte'];

                Object.keys(mappings).forEach(key => {
                    // key is like 'centro', 'nis'
                    // mappings[key] is the Excel Header
                    // data[mappings[key]] is the value
                    let value = data[mappings[key]] || '-';

                    // Apply date formatting for date fields
                    if (dateFieldKeys.includes(key)) {
                        value = formatDateValue(value);
                    }

                    reportData[key.toUpperCase()] = value;
                    reportData[key] = value;

                    // Also add direct access by Excel Header if needed, but the template uses fixed keys like 'CENTRO'
                    // We need to map standard keys:
                    const standardKeys = {
                        'centro': 'CENTRO', 'nis': 'NIS', 'ot': 'Nro OT',
                        'direccion': 'DIRECCION', 'localidad': 'LOCALIDAD', 'distrito': 'DISTRITO',
                        'estado': 'ESTADO', 'tipo-red': 'TIPO RED', 'sector': 'SECTOR',
                        'actividad': 'ACTIVIDAD', 'contrata': 'CONTRATA',
                        'subactividad': 'SUBACTIVIDAD', 'cuadrilla': 'CUADRILLA',
                        'obs-sedapal': 'OBSERVACION SEDAPAL', 'obs-contrata': 'OBSERVACION CONTRATA',
                        'fecha_corte': 'FECHA CORTE', 'fecha-corte': 'FECHA CORTE',
                        'direcciones_afectadas': 'DIRECCIONES AFECTADAS', 'direcciones-afectadas': 'DIRECCIONES AFECTADAS',
                        // Medidas mappings
                        'medidas_diametro': 'DIAMETRO', 'medidas-diametro': 'DIAMETRO',
                        'medidas_diametro_interno': 'DIAMETRO INTERNO', 'medidas-diametro-interno': 'DIAMETRO INTERNO',
                        'medidas_altura_util': 'ALTURA UTIL', 'medidas-altura-util': 'ALTURA UTIL',
                        'medidas_altura_total': 'ALTURA TOTAL', 'medidas-altura-total': 'ALTURA TOTAL'
                    };
                    if (standardKeys[key]) {
                        reportData[standardKeys[key]] = value;
                    }
                });

                // Add custom columns to reportData
                customColumns.forEach(col => {
                    if (mappings[col.id]) {
                        let value = data[mappings[col.id]] || '-';

                        // Check if custom column name suggests it's a date
                        const colNameUpper = col.name.toUpperCase();
                        if (colNameUpper.includes('FECHA') || colNameUpper.includes('DATE')) {
                            value = formatDateValue(value);
                        }

                        reportData[col.name] = value;
                        reportData[col.name.toLowerCase()] = value;
                    }
                });
            }


            // 2. Variable Replacements
            const emptyPixel = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1' height='1'%3E%3C/svg%3E";

            const imageCount = images.length;

            // Handle specific logic for photos and logos before generic stripping
            const photosIfRegex = /\{%\s*if\s+report\.images\s+and\s+report\.images\|length\s*>\s*0\s*%\}([\s\S]*?)\{%\s*else\s*%\}([\s\S]*?)\{%\s*endif\s*%\}/g;
            html = html.replace(photosIfRegex, (match, ifContent, elseContent) => imageCount > 0 ? ifContent : elseContent);

            // Handle nested if/elif/else blocks based on image count (for adaptive grids)
            // Pattern: {% if report.images|length == X %}...{% elif report.images|length == Y %}...{% else %}...{% endif %}
            const imageCountIfElifRegex = /\{%\s*if\s+report\.images\|length\s*==\s*(\d+)\s*%\}([\s\S]*?)\{%\s*elif\s+report\.images\|length\s*==\s*(\d+)\s*%\}([\s\S]*?)\{%\s*else\s*%\}([\s\S]*?)\{%\s*endif\s*%\}/g;
            html = html.replace(imageCountIfElifRegex, (match, count1, content1, count2, content2, elseContent) => {
                if (imageCount === parseInt(count1, 10)) return content1;
                if (imageCount === parseInt(count2, 10)) return content2;
                return elseContent;
            });

            // Handle simple if/else based on image count (without elif)
            const imageCountIfElseRegex = /\{%\s*if\s+report\.images\|length\s*==\s*(\d+)\s*%\}([\s\S]*?)\{%\s*else\s*%\}([\s\S]*?)\{%\s*endif\s*%\}/g;
            html = html.replace(imageCountIfElseRegex, (match, count, ifContent, elseContent) => {
                return imageCount === parseInt(count, 10) ? ifContent : elseContent;
            });

            // Handle if without else based on image count
            const imageCountIfOnlyRegex = /\{%\s*if\s+report\.images\|length\s*==\s*(\d+)\s*%\}([\s\S]*?)\{%\s*endif\s*%\}/g;
            html = html.replace(imageCountIfOnlyRegex, (match, count, content) => {
                return imageCount === parseInt(count, 10) ? content : '';
            });

            // Handle if image count > X with else: {% if report.images|length > X %}...{% else %}...{% endif %}
            const imageCountGtElseRegex = /\{%\s*if\s+report\.images\|length\s*>\s*(\d+)\s*%\}([\s\S]*?)\{%\s*else\s*%\}([\s\S]*?)\{%\s*endif\s*%\}/g;
            html = html.replace(imageCountGtElseRegex, (match, count, ifContent, elseContent) => {
                return imageCount > parseInt(count, 10) ? ifContent : elseContent;
            });

            // Handle if image count > X without else: {% if report.images|length > X %}...{% endif %}
            const imageCountGtRegex = /\{%\s*if\s+report\.images\|length\s*>\s*(\d+)\s*%\}([\s\S]*?)\{%\s*endif\s*%\}/g;
            html = html.replace(imageCountGtRegex, (match, count, content) => {
                return imageCount > parseInt(count, 10) ? content : '';
            });

            // Handle if image count >= X with else
            const imageCountGteElseRegex = /\{%\s*if\s+report\.images\|length\s*>=\s*(\d+)\s*%\}([\s\S]*?)\{%\s*else\s*%\}([\s\S]*?)\{%\s*endif\s*%\}/g;
            html = html.replace(imageCountGteElseRegex, (match, count, ifContent, elseContent) => {
                return imageCount >= parseInt(count, 10) ? ifContent : elseContent;
            });

            // Handle if image count >= X without else
            const imageCountGteRegex = /\{%\s*if\s+report\.images\|length\s*>=\s*(\d+)\s*%\}([\s\S]*?)\{%\s*endif\s*%\}/g;
            html = html.replace(imageCountGteRegex, (match, count, content) => {
                return imageCount >= parseInt(count, 10) ? content : '';
            });

            // Handle if image count < X patterns
            const imageCountLtRegex = /\{%\s*if\s+report\.images\|length\s*<\s*(\d+)\s*%\}([\s\S]*?)\{%\s*endif\s*%\}/g;
            html = html.replace(imageCountLtRegex, (match, count, content) => {
                return imageCount < parseInt(count, 10) ? content : '';
            });

            // Handle if image count != X and != Y patterns (for else-like conditions)
            const imageCountNotAndRegex = /\{%\s*if\s+report\.images\|length\s*!=\s*(\d+)\s+and\s+report\.images\|length\s*!=\s*(\d+)\s*%\}([\s\S]*?)\{%\s*endif\s*%\}/g;
            html = html.replace(imageCountNotAndRegex, (match, count1, count2, content) => {
                return (imageCount !== parseInt(count1, 10) && imageCount !== parseInt(count2, 10)) ? content : '';
            });

            // Handle templates that comp ute image count in a variable:
            // {% set img_count = report.images|length %}
            // {% if img_count == 3 %}...{% else %}...{% endif %}
            html = html.replace(/\{%\s*set\s+img_count\s*=\s*report\.images\|length\s*%\}/g, '');

            const imageCountVarIfElifRegex = /\{%\s*if\s+img_count\s*==\s*(\d+)\s*%\}([\s\S]*?)\{%\s*elif\s+img_count\s*==\s*(\d+)\s*%\}([\s\S]*?)\{%\s*else\s*%\}([\s\S]*?)\{%\s*endif\s*%\}/g;
            html = html.replace(imageCountVarIfElifRegex, (match, count1, content1, count2, content2, elseContent) => {
                if (imageCount === parseInt(count1, 10)) return content1;
                if (imageCount === parseInt(count2, 10)) return content2;
                return elseContent;
            });

            const imageCountVarIfElseRegex = /\{%\s*if\s+img_count\s*==\s*(\d+)\s*%\}([\s\S]*?)\{%\s*else\s*%\}([\s\S]*?)\{%\s*endif\s*%\}/g;
            html = html.replace(imageCountVarIfElseRegex, (match, count, ifContent, elseContent) => (
                imageCount === parseInt(count, 10) ? ifContent : elseContent
            ));

            const imageCountVarIfOnlyRegex = /\{%\s*if\s+img_count\s*==\s*(\d+)\s*%\}([\s\S]*?)\{%\s*endif\s*%\}/g;
            html = html.replace(imageCountVarIfOnlyRegex, (match, count, content) => (
                imageCount === parseInt(count, 10) ? content : ''
            ));

            const imageCountInlineExprRegex = /\{\{\s*img_count\s+if\s+img_count\s+in\s+\[([^\]]+)\]\s+else\s+([^}]+?)\s*\}\}/g;
            html = html.replace(imageCountInlineExprRegex, (match, allowedRaw, fallbackRaw) => {
                const allowed = String(allowedRaw)
                    .split(',')
                    .map((value) => parseInt(value.trim(), 10))
                    .filter((value) => Number.isFinite(value));
                const fallback = String(fallbackRaw).trim().replace(/^['"]|['"]$/g, '');
                return allowed.includes(imageCount) ? String(imageCount) : fallback;
            });

            // Resolve outer image presence block after inner img_count conditions are resolved.
            const reportImagesIfElseRegex = /\{%\s*if\s+report\.images\s*%\}([\s\S]*?)\{%\s*else\s*%\}([\s\S]*?)\{%\s*endif\s*%\}/g;
            html = html.replace(reportImagesIfElseRegex, (match, ifContent, elseContent) => (imageCount > 0 ? ifContent : elseContent));

            const logoLeftRegex = /\{%\s*if\s+logo_left\s*%\}([\s\S]*?)\{%\s*else\s*%\}([\s\S]*?)\{%\s*endif\s*%\}/g;
            html = html.replace(logoLeftRegex, (match, ifPart, elsePart) => logoLeft ? ifPart : elsePart);

            const logoRightRegex = /\{%\s*if\s+logo_right\s*%\}([\s\S]*?)\{%\s*else\s*%\}([\s\S]*?)\{%\s*endif\s*%\}/g;
            html = html.replace(logoRightRegex, (match, ifPart, elsePart) => logoRight ? ifPart : elsePart);

            // Handle {% if logo_left %}...{% endif %} (no else branch — from canvas editor)
            const logoLeftNoElseRegex = /\{%\s*if\s+logo_left\s*%\}([\s\S]*?)\{%\s*endif\s*%\}/g;
            html = html.replace(logoLeftNoElseRegex, (match, content) => logoLeft ? content : '');

            const logoRightNoElseRegex = /\{%\s*if\s+logo_right\s*%\}([\s\S]*?)\{%\s*endif\s*%\}/g;
            html = html.replace(logoRightNoElseRegex, (match, content) => logoRight ? content : '');


            const replacements = {
                '{{ title }}': 'PANEL FOTOGRÁFICO VOLANTEO',
                '{{ logo_left }}': logoLeft || emptyPixel,
                '{{ logo_right }}': logoRight || emptyPixel,
            };

            // Replace simple variables
            Object.keys(replacements).forEach(key => {
                html = html.replaceAll(key, replacements[key]);
            });

            // Replace {{ report.data.get(...) }} progressively to support nesting
            let previousHtml = '';
            while (html !== previousHtml) {
                previousHtml = html;
                // Matches {{ report.data.get('KEY', 'VALUE') }} or {{ report.data.get('KEY', <nested>) }}
                // We use a more permissive regex that handles newlines and doesn't get trapped by inner parentheses.
                html = html.replace(/\{\{\s*report\.data\.get\(\s*'([^']+)'\s*,\s*([\s\S]+?)\s*\)\s*\}\}/g, (match, key, defBlock) => {
                    const cleanKey = key.replace(/\s+/g, ' ').trim();
                    if (reportData[cleanKey] && reportData[cleanKey] !== '-') {
                        return reportData[cleanKey];
                    }
                    // If no valid data is found for this key, return the default block.
                    // The default block might be a nested report.data.get(...) 
                    // or a simple string like '-'
                    let fallback = defBlock.trim();
                    // Strip quotes from fallback if it's a simple string literal
                    if ((fallback.startsWith("'") && fallback.endsWith("'")) ||
                        (fallback.startsWith('"') && fallback.endsWith('"'))) {
                        fallback = fallback.substring(1, fallback.length - 1);
                    }

                    // If the fallback itself is another report.data.get expression, keep it wrapped so the while loop processes it again
                    if (fallback.includes("report.data.get")) {
                        return `{{ ${fallback} }}`;
                    }

                    return fallback;
                });
            }

            // Handle direct image access by index: {{ report.images[0].path }}
            const directImageRegex = /\{\{\s*report\.images\[(\d+)\]\.(path|name)\s*\}\}/g;
            html = html.replace(directImageRegex, (match, indexStr, property) => {
                const index = parseInt(indexStr);
                if (images && images[index]) {
                    if (property === 'path') {
                        return trackObjectURL(images[index]);
                    } else if (property === 'name') {
                        return images[index].name;
                    }
                }
                return '';
            });

            // 3. Image Loop Handling
            // Match {% for img in report.images... %} (permissive match for filter conditions)
            const loopRegex = /\{%\s*for\s+img\s+in\s+report\.images.*?\s*%\}([\s\S]*?)\{%\s*endfor\s*%\}/g;

            // Track which loop index we're on (for format_etapas which has 4 separate loops)
            let loopIndex = 0;
            const matches = [...html.matchAll(loopRegex)];

            for (const match of matches) {
                const fullMatch = match[0];
                const loopContent = match[1]; // inner content (single capture group)

                // Check if loop had a specific slice limit like [:9]
                const limitMatch = match[0].match(/\[:(\d+)\]/);
                const limit = limitMatch ? parseInt(limitMatch[1]) : images.length;

                // Check if this loop (or its content) has a suffix filter like '_1.' in img.name
                // Could be in the loop declaration OR in an if statement inside the loop
                const suffixMatch = fullMatch.match(/'_(\d+)\.'\s+in\s+img\.name/) ||
                    loopContent.match(/'_(\d+)\.'\s+in\s+img\.name/);

                let generatedLoopHtml = '';
                let imagesToRender = [];

                if (suffixMatch) {
                    // This is a suffix-filtered loop (format_etapas style)
                    const targetSuffix = `_${suffixMatch[1]}.`;

                    // Find image matching this suffix
                    const matchingImage = images.find(img => img.name.includes(targetSuffix));

                    if (matchingImage) {
                        imagesToRender = [matchingImage];
                    } else {
                        // Fallback: use image at this loop's index position if available
                        if (loopIndex < images.length) {
                            imagesToRender = [images[loopIndex]];
                        }
                    }
                } else {
                    // Standard loop without suffix filter
                    imagesToRender = images.slice(0, limit);
                }

                for (let i = 0; i < imagesToRender.length; i++) {
                    const img = imagesToRender[i];
                    const imgUrl = trackObjectURL(img);
                    let itemHtml = loopContent;
                    // Replace {{ img.path }}
                    itemHtml = itemHtml.replaceAll('{{ img.path }}', imgUrl);
                    itemHtml = itemHtml.replaceAll('{{ img.name }}', img.name);

                    // Mock metadata
                    const dateStr = new Date(img.lastModified).toLocaleString();
                    itemHtml = itemHtml.replace(/\{\{\s*img\.date.*\}\}/g, dateStr);
                    itemHtml = itemHtml.replace(/\{\{\s*img\.coords.*\}\}/g, '');
                    itemHtml = itemHtml.replaceAll('{{ loop.index }}', i + 1);

                    // Strip namespace and condition statements, just show the inner content
                    itemHtml = itemHtml.replace(/\{%\s*if\s+loop\.first\s*%\}([\s\S]*?)\{%\s*endif\s*%\}/g, (m, c) => i === 0 ? c : '');
                    itemHtml = itemHtml.replace(/\{%\s*if\s+not\s+ns\.found\s+and\s+'_\d+\.'\s+in\s+img\.name\s*%\}([\s\S]*?)\{%\s*endif\s*%\}/g, '$1');
                    itemHtml = itemHtml.replace(/\{%\s*set\s+ns\.found\s*=\s*true\s*%\}/g, '');

                    generatedLoopHtml += itemHtml;
                }

                html = html.replace(fullMatch, generatedLoopHtml);
                loopIndex++;
            }

            // 4. Remove Outer Loop (report_list)
            html = html.replace(/\{%\s*for\s+report\s+in\s+.*%\}/g, '');

            // 5. Clean up other Jinja2 tags (Aggressive)
            // Remove any remaining control blocks that weren't processed
            html = html.replace(/\{%\s*[\s\S]*?\s*%\}/g, '');
            html = html.replace(/\{#.*?#\}/g, '');

            // 6. Remove "Sin imagen" placeholder divs when images are present
            if (images.length > 0) {
                html = html.replace(/<div class="photo-placeholder">Sin imagen<\/div>/g, '');
                html = html.replace(/<div class="photo-placeholder">\s*Sin imagen\s*<\/div>/g, '');
            }

            // 6. Fill remaining loop (range-based) logic
            const rangeRegex = /\{%\s*for\s+i\s+in\s+range\(report\.images\|length,\s*(\d+)\)\s*%\}([\s\S]*?)(?:\{%\s*endfor\s*%\}|$)/g;
            html = html.replace(rangeRegex, (match, max, content) => {
                const remaining = parseInt(max) - images.length;
                if (remaining <= 0) return '';
                return content.repeat(remaining);
            });


            templateObjUrlsRef.current = newObjUrls;
            setRenderedHtml(html);
        };

        renderTemplate();

        return () => {
            // Cleanup on unmount
            templateObjUrlsRef.current.forEach(url => URL.revokeObjectURL(url));
            templateObjUrlsRef.current = [];
        };
    }, [customTemplate, data, images, mappings, logoLeft, logoRight, customColumns]);


    // Detect image orientations and set layout mode
    useEffect(() => {
        if (!images || images.length === 0) {
            setLayoutMode('grid');
            return;
        }

        let cancelled = false;
        const objectUrls = [];

        const analyzeImages = async () => {
            const orientations = await Promise.all(
                images.map(img => new Promise(resolve => {
                    const el = new window.Image();
                    const objUrl = URL.createObjectURL(img);
                    objectUrls.push(objUrl);
                    el.onload = () => resolve(el.width >= el.height); // true = landscape
                    el.onerror = () => resolve(true);
                    el.src = objUrl;
                }))
            );
            // Revoke all object URLs after analysis
            objectUrls.forEach(url => URL.revokeObjectURL(url));

            if (cancelled) return;

            const count = images.length;
            const majorityLandscape = orientations.filter(Boolean).length > orientations.length / 2;

            // Apply same logic as backend
            if (count === 2) {
                setLayoutMode(majorityLandscape ? '2v' : '2h');
            } else if (count === 4) {
                setLayoutMode(majorityLandscape ? '4h' : '4v');
            } else {
                setLayoutMode('grid');
            }
        };

        analyzeImages();
        return () => {
            cancelled = true;
            objectUrls.forEach(url => URL.revokeObjectURL(url));
        };
    }, [images]);

    // Logos (Clear by default)
    const emptyLogo = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1' height='1'%3E%3C/svg%3E";
    const defaultSedapal = emptyLogo;
    const defaultAcciona = emptyLogo;

    // Get grid layout class based on image count (matching PDF template)
    const getPhotoGridStyle = () => {
        const count = images.length;
        const baseStyle = {
            display: 'grid',
            gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
            gap: '2mm',
            width: '100%',
            height: '100%',
            minHeight: 0,
        };

        if (count === 2) {
            return { ...baseStyle, gridTemplateRows: '1fr', alignItems: 'center' };
        } else if (count === 3 || count === 4) {
            return { ...baseStyle, gridTemplateRows: 'repeat(2, minmax(0, 1fr))' };
        }
        return { ...baseStyle, gridAutoRows: '7cm' };
    };

    // Get photo item style based on position and count
    const getPhotoItemStyle = (index) => {
        const count = images.length;
        const baseStyle = {
            border: '1px solid #ddd',
            background: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
            padding: '2mm',
            minHeight: 0,
        };

        if (count === 2) {
            return { ...baseStyle, height: '100%' };
        } else if (count === 3 && index === 2) {
            return {
                ...baseStyle,
                gridColumn: '1 / 3',
                width: '50%',
                maxWidth: '95mm',
                margin: '0 auto',
                height: '100%',
            };
        } else if (count === 4) {
            return { ...baseStyle, height: '100%', minHeight: 0 };
        }
        return { ...baseStyle, height: '7cm' };
    };

    // Auto-resize iframe to match its content height
    const handleIframeLoad = (e) => {
        const iframe = e.target;
        try {
            const doc = iframe.contentDocument || iframe.contentWindow?.document;
            if (doc?.body) {
                // Wait a tick for images/layout to settle
                setTimeout(() => {
                    const contentHeight = doc.documentElement.scrollHeight || doc.body.scrollHeight;
                    iframe.style.height = Math.max(contentHeight, 1122) + 'px'; // 1122px ≈ 297mm
                }, 150);
            }
        } catch {
            // Cross-origin restriction — keep minHeight fallback
        }
    };

    if (customTemplate && renderedHtml) {
        return (
            <div className={`flex-1 p-4 overflow-auto flex justify-center items-start ${isFocusMode ? 'bg-neutral-100' : 'bg-neutral-300'}`}>
                <iframe
                    ref={ref}
                    srcDoc={renderedHtml}
                    sandbox="allow-same-origin"
                    title="Custom Template Preview"
                    className="bg-white text-black shadow-2xl"
                    onLoad={handleIframeLoad}
                    style={{
                        width: '210mm',
                        minHeight: '297mm',
                        border: 'none',
                        display: 'block',
                    }}
                />
            </div>
        );
    }

    return (
        <div className={`flex-1 p-4 overflow-auto flex justify-center items-start ${isFocusMode ? 'bg-neutral-100' : 'bg-neutral-300'}`}>
            {/* A4 Paper Container - Strict dimensions */}
            <div
                ref={ref}
                id="panel-render"
                className="bg-white text-black shadow-2xl flex flex-col"
                style={{
                    width: '210mm',
                    height: '297mm',
                    padding: '5mm',
                    boxSizing: 'border-box',
                    overflow: 'hidden',
                    fontFamily: "'Segoe UI', Arial, sans-serif",
                    fontSize: '8pt',
                    lineHeight: '1.15'
                }}
            >
                {/* HEADER - Fixed Height */}
                <div className="flex justify-between items-center border-b border-neutral-300 pb-1 mb-1" style={{ height: '20mm', flexShrink: 0 }}>
                    <div className="flex items-center" style={{ width: '55mm', height: '18mm' }}>
                        <img src={logoLeft || defaultSedapal} className="max-w-full max-h-full object-contain" alt="Logo" />
                    </div>
                    <div className="flex-1 text-center font-bold uppercase text-neutral-800" style={{ fontSize: '13pt' }}>
                        PANEL FOTOGRÁFICO
                    </div>
                    <div className="flex items-center justify-end" style={{ width: '55mm', height: '18mm' }}>
                        <img src={logoRight || defaultAcciona} className="max-w-full max-h-full object-contain" alt="Logo" />
                    </div>
                </div>

                {/* INFO BAR */}
                <div className="flex justify-between bg-neutral-100 border border-neutral-300 px-2 py-0.5 mb-1" style={{ fontSize: '7.5pt', flexShrink: 0 }}>
                    <div className="flex gap-1"><span className="font-bold text-neutral-600">CENTRO:</span> {getValue('centro')}</div>
                    <div className="flex gap-1"><span className="font-bold text-neutral-600">NIS:</span> {getValue('nis')}</div>
                    <div className="flex gap-1"><span className="font-bold text-neutral-600">Nro OT:</span> {getValue('ot')}</div>
                </div>

                {/* 1.0 LOCALIZACION */}
                <div className="text-[#0056b3] font-bold uppercase border-b border-[#0056b3] pb-0.5 mb-0.5 mt-1" style={{ fontSize: '7.5pt', flexShrink: 0 }}>
                    1.0 LOCALIZACIÓN
                </div>
                <div className="grid gap-x-2 gap-y-0.5 mb-1" style={{ gridTemplateColumns: 'auto 1fr auto 1fr auto 1fr', fontSize: '7pt', flexShrink: 0 }}>
                    <Lbl>DIRECCION:</Lbl><Val>{getValue('direccion')}</Val>
                    <Lbl>LOCALIDAD:</Lbl><Val>{getValue('localidad')}</Val>
                    <Lbl>DISTRITO:</Lbl><Val>{getValue('distrito')}</Val>
                    <Lbl>ESTADO:</Lbl><Val>{getValue('estado')}</Val>
                    <Lbl>TIPO RED:</Lbl><Val>{getValue('tipo-red')}</Val>
                    <Lbl>SECTOR:</Lbl><Val>{getValue('sector')}</Val>
                </div>

                {/* 2.0 DETALLES */}
                <div className="text-[#0056b3] font-bold uppercase border-b border-[#0056b3] pb-0.5 mb-0.5 mt-1" style={{ fontSize: '7.5pt', flexShrink: 0 }}>
                    2.0 DETALLES DE ORDEN DE TRABAJO
                </div>
                <div className="grid gap-x-2 gap-y-0.5 mb-1" style={{ gridTemplateColumns: 'auto 1fr auto 1fr', fontSize: '7pt', flexShrink: 0 }}>
                    <Lbl>ACTIVIDAD:</Lbl><Val>{getValue('actividad')}</Val>
                    <Lbl>CONTRATA:</Lbl><Val>{getValue('contrata')}</Val>
                    <Lbl>SUBACTIVIDAD:</Lbl><Val>{getValue('subactividad')}</Val>
                    <Lbl>CUADRILLA:</Lbl><Val>{getValue('cuadrilla')}</Val>
                    <Lbl>OBS. SEDAPAL:</Lbl><Val className="col-span-3">{getValue('obs-sedapal')}</Val>
                    <Lbl>OBS. CONTRATA:</Lbl><Val className="col-span-3">{getValue('obs-contrata')}</Val>
                </div>

                {/* 3.0 PANEL FOTOGRAFICO - Flex-grow to fill remaining space */}
                <div className="text-[#0056b3] font-bold uppercase border-b border-[#0056b3] pb-0.5 mb-0.5 mt-1" style={{ fontSize: '7.5pt', flexShrink: 0 }}>
                    3.0 PANEL FOTOGRÁFICO
                </div>
                <div className="flex-1 border-2 border-neutral-800 p-1 flex flex-col min-h-0 overflow-hidden">
                    {images.length > 0 ? (
                        images.length === 3 ? (
                            /* Special layout for 3 images - matching PDF template */
                            <div className="flex-1 flex flex-col gap-[2mm]" style={{ minHeight: 0 }}>
                                {/* Top row: 2 images side by side */}
                                <div className="flex flex-row gap-[2mm] min-h-0" style={{ height: 'calc(50% - 1mm)' }}>
                                    <div style={{
                                        flex: 1,
                                        border: '1px solid #ddd',
                                        background: '#fff',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        overflow: 'hidden',
                                        padding: '2mm',
                                        minHeight: 0,
                                    }}>
                                        <img
                                            src={imageUrls[0] || ''}
                                            alt={images[0].name}
                                            style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                                        />
                                    </div>
                                    <div style={{
                                        flex: 1,
                                        border: '1px solid #ddd',
                                        background: '#fff',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        overflow: 'hidden',
                                        padding: '2mm',
                                        minHeight: 0,
                                    }}>
                                        <img
                                            src={imageUrls[1] || ''}
                                            alt={images[1].name}
                                            style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                                        />
                                    </div>
                                </div>
                                {/* Bottom row: 1 image centered */}
                                <div className="flex justify-center min-h-0" style={{ height: 'calc(50% - 1mm)' }}>
                                    <div style={{
                                        width: 'calc(50% - 1mm)',
                                        height: '100%',
                                        border: '1px solid #ddd',
                                        background: '#fff',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        overflow: 'hidden',
                                        padding: '2mm',
                                        minHeight: 0,
                                    }}>
                                        <img
                                            src={imageUrls[2] || ''}
                                            alt={images[2].name}
                                            style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                                        />
                                    </div>
                                </div>
                            </div>
                        ) : (
                            /* Standard grid for 2, 4, or other image counts */
                            <div className="flex-1" style={{ ...getPhotoGridStyle(), minHeight: 0 }}>
                                {images.map((img, idx) => (
                                    <div
                                        key={idx}
                                        style={getPhotoItemStyle(idx)}
                                    >
                                        <img
                                            src={imageUrls[idx] || ''}
                                            alt={img.name}
                                            style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                                        />
                                    </div>
                                ))}
                            </div>
                        )
                    ) : (
                        <div className="flex-1 flex items-center justify-center border border-dashed border-neutral-400 text-neutral-500 italic" style={{ fontSize: '8pt' }}>
                            No se encontraron imágenes asociadas a esta orden.
                        </div>
                    )}
                </div>

            </div>
        </div>
    );
});

// Compact subcomponents
const Lbl = ({ children }) => (
    <span className="font-semibold text-right text-neutral-600 whitespace-nowrap" style={{ fontSize: '6.5pt' }}>
        {children}
    </span>
);

const Val = ({ children, className = '' }) => (
    <div className={`border border-dotted border-neutral-500 bg-white px-1 py-0.5 flex items-center ${className}`} style={{ fontSize: '7pt', minHeight: '4mm' }}>
        {children}
    </div>
);

export default PreviewPanel;
