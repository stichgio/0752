import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [react()],
    build: {
        rollupOptions: {
            input: {
                main: resolve(__dirname, 'index.html'),
                technical: resolve(__dirname, 'reportes-tecnicos.html'),
                fichas: resolve(__dirname, 'fichas-tecnicas.html'),
                imageOptimizer: resolve(__dirname, 'image-optimizer.html'),
                compressor: resolve(__dirname, 'compressor.html'),
                templateEditor: resolve(__dirname, 'template-editor.html'),
                multiSheetReport: resolve(__dirname, 'msheets.html'),
                ocr: resolve(__dirname, 'ocr.html'),
                pdfTools: resolve(__dirname, 'pdf-tools.html')
            }
        }
    },
    resolve: {
        alias: {
            '@': resolve(__dirname, './src'),
            'framer-motion': resolve(__dirname, 'node_modules/framer-motion/dist/cjs/index.js')
        }
    },
    server: {
        proxy: {
            '/api/multi-sheet': {
                target: 'http://localhost:7861',
                changeOrigin: true,
            },
            '/api': {
                target: 'http://localhost:7860',
                changeOrigin: true
            }
        },
        // Permitir acceso a fichas-tecnicas.html directamente
        fs: {
            strict: false
        }
    },
    // Asegurar que todas las páginas HTML sean procesadas
    optimizeDeps: {
        include: ['lucide-react']
    }
})
