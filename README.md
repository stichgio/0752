---
title: Stich 0752
emoji: 🚀
colorFrom: blue
colorTo: indigo
sdk: docker
pinned: false
---

# Stich 0752
Backend API deployed on Hugging Face Spaces using Docker.
## Configurar push directo a Hugging Face

Se incluye el script `scripts/setup_hf_push.sh` para dejar este repositorio listo para hacer push a un Space de Hugging Face sin incrustar el token en la URL del remote.

```bash
HF_TOKEN=<tu_token> ./scripts/setup_hf_push.sh
```

Opcionalmente puedes pasar una URL de Space distinta:

```bash
HF_TOKEN=<tu_token> ./scripts/setup_hf_push.sh https://huggingface.co/spaces/<usuario>/<space>
```

Después, sube la rama actual al `main` del Space:

```bash
git push huggingface HEAD:main
```
