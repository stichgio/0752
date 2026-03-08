import { useState, useRef, isValidElement, cloneElement, createElement } from 'react';
import { Upload, FileUp } from 'lucide-react';
import { motion } from 'framer-motion';

/**
 * Reusable drag-and-drop file upload zone for PDFs.
 * @param {Function} onFiles - Callback with File[] when files are dropped/selected
 * @param {boolean} multiple - Allow multiple files (default false)
 * @param {string} label - Primary label text
 * @param {string} sublabel - Secondary label text
 * @param {React.ReactNode} icon - Custom icon (default Upload)
 */
export default function PdfDropzone({
    onFiles,
    multiple = false,
    label = 'Arrastra tus archivos PDF aqui',
    sublabel = 'o haz click para seleccionar',
    icon,
    compact = false,
}) {
    const [isDragging, setIsDragging] = useState(false);
    const inputRef = useRef(null);

    function filterPdfs(files) {
        return Array.from(files).filter(
            (f) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'),
        );
    }

    function handleDrop(e) {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
        const pdfs = filterPdfs(e.dataTransfer.files);
        if (pdfs.length > 0) onFiles(multiple ? pdfs : [pdfs[0]]);
    }

    function handleChange(e) {
        const pdfs = filterPdfs(e.target.files);
        if (pdfs.length > 0) onFiles(multiple ? pdfs : [pdfs[0]]);
        e.target.value = '';
    }

    const Icon = icon || (multiple ? FileUp : Upload);
    const iconProps = {
        size: compact ? 20 : 28,
        className: 'text-neutral-500',
    };

    function renderIcon() {
        if (isValidElement(Icon)) {
            const currentClassName = Icon.props?.className || '';
            return cloneElement(Icon, {
                ...iconProps,
                ...Icon.props,
                className: [iconProps.className, currentClassName].filter(Boolean).join(' '),
            });
        }

        if (typeof Icon === 'function' || (typeof Icon === 'object' && Icon !== null)) {
            return createElement(Icon, iconProps);
        }

        return null;
    }

    return (
        <motion.div
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            className={`
                relative cursor-pointer border border-dashed rounded-lg transition-all duration-200
                flex flex-col items-center justify-center gap-2 select-none
                ${compact ? 'py-4 px-6' : 'py-10 px-8'}
                ${isDragging
                    ? 'border-white/60 bg-white/[0.04] shadow-[0_0_30px_rgba(255,255,255,0.05)]'
                    : 'border-neutral-700 bg-neutral-900/40 hover:border-neutral-500 hover:bg-neutral-900/60'
                }
            `}
            whileHover={{ scale: 1.005 }}
            whileTap={{ scale: 0.995 }}
        >
            {renderIcon()}
            <span className={`${compact ? 'text-base' : 'text-lg'} text-neutral-300 font-medium`}>
                {label}
            </span>
            <span className={`${compact ? 'text-sm' : 'text-base'} text-neutral-600`}>
                {sublabel}
            </span>

            <input
                ref={inputRef}
                type="file"
                accept=".pdf"
                multiple={multiple}
                onChange={handleChange}
                className="hidden"
            />

            {isDragging && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="absolute inset-0 rounded-lg border-2 border-white/20 pointer-events-none"
                />
            )}
        </motion.div>
    );
}


