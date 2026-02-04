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
                technical: resolve(__dirname, 'technical-reports.html'),
                fichas: resolve(__dirname, 'fichas-tecnicas.html'),
                imageOptimizer: resolve(__dirname, 'image-optimizer.html'),
                compressor: resolve(__dirname, 'compressor.html')
            }
        }
    },
    resolve: {
        alias: {
            '@': resolve(__dirname, './src')
        }
    },
    server: {
        proxy: {
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
