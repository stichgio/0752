#!/usr/bin/env bash
set -euo pipefail

HF_SPACE_URL="${1:-https://huggingface.co/spaces/shengio/stich-0752}"
HF_TOKEN="${HF_TOKEN:-${2:-}}"
REMOTE_NAME="${REMOTE_NAME:-huggingface}"
CREDENTIALS_FILE=".git/hf-credentials"

if [[ -z "$HF_TOKEN" ]]; then
  echo "Uso: HF_TOKEN=<token> $0 [space_url]"
  echo "o:   $0 [space_url] <token>"
  exit 1
fi

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "Este script debe ejecutarse dentro de un repositorio git."
  exit 1
fi

SPACE_PATH="${HF_SPACE_URL#https://huggingface.co/}"
REMOTE_URL="https://huggingface.co/${SPACE_PATH}"

# Configuración local (solo este repo)
git config --local credential.helper "store --file=${CREDENTIALS_FILE}"

# Guardar credencial para huggingface.co sin exponer token en el remote URL
printf "https://user:%s@huggingface.co\n" "$HF_TOKEN" > "$CREDENTIALS_FILE"
chmod 600 "$CREDENTIALS_FILE"

if git remote get-url "$REMOTE_NAME" >/dev/null 2>&1; then
  git remote set-url "$REMOTE_NAME" "$REMOTE_URL"
else
  git remote add "$REMOTE_NAME" "$REMOTE_URL"
fi

echo "Remote '$REMOTE_NAME' configurado: $REMOTE_URL"
echo "Credenciales guardadas en $CREDENTIALS_FILE (permisos 600)."
echo "Próximo paso: git push $REMOTE_NAME HEAD:main"
