# -*- coding: utf-8 -*-
"""
Inicializacion de Firebase Admin SDK para verificacion de tokens
y operaciones administrativas (crear/eliminar usuarios).
"""

import json
import logging
import os
from pathlib import Path

import firebase_admin
from firebase_admin import credentials, auth as firebase_auth

logger = logging.getLogger(__name__)

_app = None


def _initialize_firebase():
    """Inicializa Firebase Admin SDK una sola vez."""
    global _app
    if _app is not None:
        return _app

    # Opcion 1: ruta al archivo JSON del service account
    sa_path = os.environ.get("FIREBASE_SERVICE_ACCOUNT_PATH", "")
    # Opcion 2: JSON como string en variable de entorno
    sa_json = os.environ.get("FIREBASE_SERVICE_ACCOUNT_JSON", "")

    cred = None
    if sa_path and Path(sa_path).is_file():
        cred = credentials.Certificate(sa_path)
        logger.info("[Firebase] Initialized from service account file: %s", sa_path)
    elif sa_json:
        try:
            sa_dict = json.loads(sa_json)
            cred = credentials.Certificate(sa_dict)
            logger.info("[Firebase] Initialized from FIREBASE_SERVICE_ACCOUNT_JSON env var")
        except (json.JSONDecodeError, ValueError) as e:
            logger.error("[Firebase] Failed to parse FIREBASE_SERVICE_ACCOUNT_JSON: %s", e)
            raise RuntimeError(
                "FIREBASE_SERVICE_ACCOUNT_JSON contiene JSON invalido"
            ) from e
    else:
        # Intentar Application Default Credentials (para entornos GCP/Cloud Run)
        try:
            _app = firebase_admin.initialize_app()
            logger.info("[Firebase] Initialized with Application Default Credentials")
            return _app
        except Exception:
            raise RuntimeError(
                "No se encontro configuracion de Firebase Admin. "
                "Configura FIREBASE_SERVICE_ACCOUNT_PATH o FIREBASE_SERVICE_ACCOUNT_JSON."
            )

    _app = firebase_admin.initialize_app(cred)
    return _app


def get_firebase_app():
    """Obtiene la instancia de Firebase Admin (inicializa si es necesario)."""
    return _initialize_firebase()


def verify_firebase_token(token: str) -> dict:
    """
    Verifica un ID token de Firebase y retorna el payload decodificado.

    Args:
        token: ID token JWT del cliente Firebase

    Returns:
        dict con uid, email, y otros claims del token

    Raises:
        firebase_admin.auth.InvalidIdTokenError: si el token es invalido
        firebase_admin.auth.ExpiredIdTokenError: si el token esta expirado
    """
    get_firebase_app()  # Asegurar inicializacion
    return firebase_auth.verify_id_token(token)
