import React, { isValidElement, cloneElement, createElement } from 'react';
import { Upload, FileUp } from 'lucide-react';
import UploadZone from '../../../components/ui/UploadZone';

/**
 * Reusable drag-and-drop file upload zone for PDFs.
 *
 * Backwards-compatible wrapper around the design-system UploadZone.
 * Keeps PDF filtering logic and the same external API.
 *
 * @param {Function} onFiles - Callback with File[] when files are dropped/selected
 * @param {boolean} multiple - Allow multiple files (default false)
 * @param {string} label - Primary label text
 * @param {string} sublabel - Secondary label text
 * @param {React.ReactNode} icon - Custom icon (default Upload)
 * @param {boolean} compact - Smaller variant
 */
export default function PdfDropzone({
    onFiles,
    multiple = false,
    label = 'Arrastra tus archivos PDF aqui',
    sublabel = 'o haz click para seleccionar',
    icon,
    compact = false,
}) {
    function filterPdfs(files) {
        return files.filter(
            (f) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'),
        );
    }

    function handleFiles(files) {
        const pdfs = filterPdfs(files);
        if (pdfs.length > 0) onFiles(multiple ? pdfs : [pdfs[0]]);
    }

    // Resolve icon to a ReactNode
    const DefaultIcon = multiple ? FileUp : Upload;
    let resolvedIcon = null;

    if (icon) {
        if (isValidElement(icon)) {
            const currentClassName = icon.props?.className || '';
            resolvedIcon = cloneElement(icon, {
                size: compact ? 20 : 28,
                className: ['text-[var(--g-text-dim)]', currentClassName].filter(Boolean).join(' '),
                ...icon.props,
            });
        } else if (typeof icon === 'function' || (typeof icon === 'object' && icon !== null)) {
            resolvedIcon = createElement(icon, {
                size: compact ? 20 : 28,
                className: 'text-[var(--g-text-dim)]',
            });
        }
    }

    return (
        <UploadZone
            onFiles={handleFiles}
            accept=".pdf,application/pdf"
            multiple={multiple}
            icon={resolvedIcon || <DefaultIcon size={compact ? 20 : 28} className="text-[var(--g-text-dim)]" />}
            title={label}
            description={sublabel}
            className={compact ? 'py-4 px-6' : undefined}
        />
    );
}
