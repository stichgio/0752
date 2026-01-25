# Deployment Guide

## Frontend (Vercel)

1. Importa tu repositorio en Vercel
2. Configuración del proyecto:
   - **Framework Preset**: Vite
   - **Root Directory**: `frontend`
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
3. **Variables de entorno** (Environment Variables):
   - Agrega: `VITE_API_URL` = `https://tu-space.hf.space/api`
4. Deploy

## Backend (Hugging Face Spaces)

1. Crea un nuevo Space en Hugging Face
2. Selecciona SDK: Docker
3. Conecta tu repositorio de GitHub
4. El Dockerfile en la raíz se detectará automáticamente
5. Puerto: 7860

## CORS

El backend está configurado para permitir requests desde cualquier origen (`allow_origins=["*"]`), compatible con Vercel y HuggingFace Spaces.

## Troubleshooting

### Error "Failed to fetch"
- Verifica que `VITE_API_URL` esté configurada correctamente
- Verifica que el backend esté activo en HuggingFace Spaces
- Revisa los logs del backend en HuggingFace

### CORS Errors
- Backend ya permite todos los orígenes
- Si aún hay errores, revisa la consola del navegador
