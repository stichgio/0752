import React from 'react';

export default function Calculator() {
    return (
        <div className="w-full h-[calc(100vh-80px)] bg-[#0d0d0d] rounded-lg overflow-hidden">
            <iframe
                src="/calculator.html"
                className="w-full h-full border-none"
                title="Calculator Tool"
            />
        </div>
    );
}
