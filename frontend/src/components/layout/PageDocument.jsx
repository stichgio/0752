import { useEffect } from 'react';

function getClassNames(value) {
    return String(value || '')
        .split(/\s+/)
        .map((item) => item.trim())
        .filter(Boolean);
}

export default function PageDocument({ title, bodyClassName = '', children }) {
    useEffect(() => {
        const previousTitle = document.title;
        const bodyClasses = getClassNames(bodyClassName);

        if (title) {
            document.title = title;
        }

        bodyClasses.forEach((className) => {
            document.body.classList.add(className);
        });

        return () => {
            document.title = previousTitle;
            bodyClasses.forEach((className) => {
                document.body.classList.remove(className);
            });
        };
    }, [bodyClassName, title]);

    return children;
}
