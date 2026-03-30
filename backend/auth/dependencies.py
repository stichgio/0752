# -*- coding: utf-8 -*-
"""
FastAPI dependencies para autenticacion con Firebase.
"""

import logging

from fastapi import Depends, HTTPException, Request
from firebase_admin import auth as firebase_auth, firestore as firebase_firestore

from auth.firebase_admin_init import verify_firebase_token, get_firebase_app

logger = logging.getLogger(__name__)


async def get_current_user(request: Request) -> dict:
    """
    Dependency que verifica el token de Firebase del header Authorization.
    Retorna el payload decodificado con uid y email.
    """
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(
            status_code=401,
            detail="Token de autenticacion no proporcionado",
        )

    token = auth_header[7:]  # Remove "Bearer "

    try:
        decoded = verify_firebase_token(token)
    except firebase_auth.InvalidIdTokenError:
        raise HTTPException(status_code=401, detail="Token invalido")
    except firebase_auth.ExpiredIdTokenError:
        raise HTTPException(status_code=401, detail="Token expirado")
    except firebase_auth.RevokedIdTokenError:
        raise HTTPException(status_code=401, detail="Token revocado")
    except Exception as e:
        logger.error("[Auth] Error verificando token: %s", e)
        raise HTTPException(status_code=401, detail="Error de autenticacion")

    return decoded


async def get_admin_user(user: dict = Depends(get_current_user)) -> dict:
    """
    Dependency que extiende get_current_user verificando que el usuario
    tenga rol 'admin' en la coleccion 'users' de Firestore.
    """
    uid = user.get("uid", "")

    try:
        get_firebase_app()
        db = firebase_firestore.client()
        user_doc = db.collection("users").document(uid).get()

        if not user_doc.exists:
            raise HTTPException(
                status_code=403,
                detail="Usuario no registrado en el sistema",
            )

        user_data = user_doc.to_dict()
        if user_data.get("role") != "admin":
            raise HTTPException(
                status_code=403,
                detail="No tienes permisos de administrador",
            )

        # Enriquecer el payload con datos de Firestore
        user["firestore_data"] = user_data
        return user

    except HTTPException:
        raise
    except Exception as e:
        logger.error("[Auth] Error verificando rol de admin: %s", e)
        raise HTTPException(
            status_code=500,
            detail="Error verificando permisos",
        )
