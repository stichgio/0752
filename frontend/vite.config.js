import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
    plugins: [react()],
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
        }
    },
    optimizeDeps: {
        include: ['lucide-react']
    }
})
