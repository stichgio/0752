import React from 'react';

export default function PDFTools() {
    return (
        <div className="w-full h-[calc(100vh-80px)] bg-[#0d0d0d] rounded-lg overflow-hidden">
            <iframe
                src="/pdf-tools.html"
                className="w-full h-full border-none"
                title="PDF Tools"
            />
        </div>
    );
}
