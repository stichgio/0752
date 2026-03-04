# Comandos para Push a GitHub y HuggingFace desde Terminal

## GitHub

### Configuración inicial (solo una vez)
```bash
# Configurar usuario Git
git config --global user.name "Tu Nombre"
git config --global user.email "tu@email.com"

# Agregar repositorio remoto
git remote add origin https://github.com/tu-usuario/tu-repositorio.git
```

### Comandos para hacer push
```bash
# Añadir todos los archivos modificados
git add .

# Hacer commit con mensaje
git commit -m "Tu mensaje de commit"

# Push a la rama principal (main o master)
git push origin main

# Push a una rama específica
git push origin nombre-rama
```

---

## HuggingFace

### Instalación de HF CLI (solo una vez)
```bash
pip install huggingface_hub
```

### Configuración inicial
```bash
# Iniciar sesión en HuggingFace
huggingface-cli login

# O usar token de acceso
huggingface-cli token
```

### Comandos para subir repositorios/modelos

```bash
# Crear un nuevo repositorio
huggingface-cli repo create nombre-del-repo --type model

# Clonar un repositorio
git clone https://huggingface.co/tu-usuario/nombre-del-repo

# Añadir cambios
git add .

# Commit y push
git commit -m "Mensaje"
git push

# Para repositorios grandes (modelos)
git lfs install
git lfs track "*.bin" "*.safetensors"
```

---

## Comandos útiles adicionales

```bash
# Ver estado de cambios
git status

# Ver remote configurados
git remote -v

# Forzar push (usar con cuidado)
git push -f origin main

# Pull antes de push (si hay cambios remotos)
git pull origin main

# Cambiar de rama
git checkout nombre-rama
```

---

## Ejemplo completo para GitHub

```bash
cd tu-proyecto
git add .
git commit -m "Actualización"
git push origin main
```

## Ejemplo completo para HuggingFace

```bash
# Desde tu máquina local
git clone https://huggingface.co/tu-usuario/tu-modelo
cd tu-modelo
# Añadir tus archivos
git add .
git commit -m "Upload model"
git push
```
