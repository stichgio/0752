# -*- coding: utf-8 -*-
"""
Router de administracion de usuarios.
Todos los endpoints requieren rol 'admin'.
"""

import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr, Field
from firebase_admin import auth as firebase_auth, firestore as firebase_firestore

from auth.dependencies import get_admin_user
from auth.firebase_admin_init import get_firebase_app

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/admin/users",
    tags=["admin-users"],
)


# ── Pydantic models ──────────────────────────────────────────────────────

class CreateUserRequest(BaseModel):
    email: EmailStr
    nombre: str = Field(..., min_length=1)
    password: str = Field(..., min_length=6)
    role: str = Field(default="user", pattern=r"^(admin|user)$")


class UpdateUserRequest(BaseModel):
    nombre: Optional[str] = None
    role: Optional[str] = Field(default=None, pattern=r"^(admin|user)$")
    active: Optional[bool] = None


# ── Helpers ───────────────────────────────────────────────────────────────

def _get_firestore_client():
    get_firebase_app()
    return firebase_firestore.client()


# ── Endpoints ─────────────────────────────────────────────────────────────

@router.get(
    "",
    summary="Listar todos los usuarios",
    response_model=None,
)
async def list_users(_admin: dict = Depends(get_admin_user)):
    """Lista todos los usuarios registrados en Firestore."""
    try:
        db = _get_firestore_client()
        users_ref = db.collection("users").order_by("createdAt").stream()

        users = []
        for doc in users_ref:
            data = doc.to_dict()
            data["uid"] = doc.id
            # Convertir Timestamp a ISO string para serializacion JSON
            if data.get("createdAt"):
                try:
                    data["createdAt"] = data["createdAt"].isoformat()
                except AttributeError:
                    pass
            users.append(data)

        return {"users": users}
    except Exception as e:
        logger.error("[AdminUsers] Error listando usuarios: %s", e)
        raise HTTPException(status_code=500, detail="Error al listar usuarios")


@router.post(
    "",
    summary="Crear nuevo usuario",
    status_code=201,
    response_model=None,
)
async def create_user(
    body: CreateUserRequest,
    _admin: dict = Depends(get_admin_user),
):
    """Crea un usuario en Firebase Auth y su documento en Firestore."""
    try:
        # Crear en Firebase Auth
        user_record = firebase_auth.create_user(
            email=body.email,
            password=body.password,
            display_name=body.nombre,
        )

        # Crear documento en Firestore
        db = _get_firestore_client()
        user_data = {
            "uid": user_record.uid,
            "email": body.email,
            "nombre": body.nombre,
            "role": body.role,
            "active": True,
            "createdAt": datetime.now(timezone.utc),
        }
        db.collection("users").document(user_record.uid).set(user_data)

        logger.info("[AdminUsers] Usuario creado: %s (%s)", body.email, user_record.uid)

        return {
            "uid": user_record.uid,
            "email": body.email,
            "nombre": body.nombre,
            "role": body.role,
        }

    except firebase_auth.EmailAlreadyExistsError:
        raise HTTPException(status_code=409, detail="El correo ya esta registrado")
    except Exception as e:
        logger.error("[AdminUsers] Error creando usuario: %s", e)
        raise HTTPException(status_code=500, detail="Error al crear usuario")


@router.put(
    "/{uid}",
    summary="Actualizar usuario",
    response_model=None,
)
async def update_user(
    uid: str,
    body: UpdateUserRequest,
    _admin: dict = Depends(get_admin_user),
):
    """Actualiza nombre, rol y/o estado activo de un usuario en Firestore."""
    try:
        db = _get_firestore_client()
        doc_ref = db.collection("users").document(uid)

        if not doc_ref.get().exists:
            raise HTTPException(status_code=404, detail="Usuario no encontrado")

        update_data = {}
        if body.nombre is not None:
            update_data["nombre"] = body.nombre
            # Actualizar tambien en Firebase Auth
            try:
                firebase_auth.update_user(uid, display_name=body.nombre)
            except Exception:
                pass  # No fallar si Auth update falla
        if body.role is not None:
            update_data["role"] = body.role
        if body.active is not None:
            update_data["active"] = body.active
            # Desactivar/activar en Firebase Auth tambien
            try:
                firebase_auth.update_user(uid, disabled=not body.active)
            except Exception:
                pass

        if not update_data:
            raise HTTPException(status_code=400, detail="No se proporcionaron campos para actualizar")

        doc_ref.update(update_data)
        logger.info("[AdminUsers] Usuario actualizado: %s -> %s", uid, update_data)

        return {"uid": uid, **update_data}

    except HTTPException:
        raise
    except Exception as e:
        logger.error("[AdminUsers] Error actualizando usuario %s: %s", uid, e)
        raise HTTPException(status_code=500, detail="Error al actualizar usuario")


@router.delete(
    "/{uid}",
    summary="Eliminar usuario",
    response_model=None,
)
async def delete_user(
    uid: str,
    _admin: dict = Depends(get_admin_user),
):
    """Elimina un usuario de Firebase Auth y Firestore."""
    try:
        # Eliminar de Firebase Auth
        try:
            firebase_auth.delete_user(uid)
        except firebase_auth.UserNotFoundError:
            pass  # Ya no existe en Auth, continuar con Firestore

        # Eliminar de Firestore
        db = _get_firestore_client()
        db.collection("users").document(uid).delete()

        logger.info("[AdminUsers] Usuario eliminado: %s", uid)
        return {"detail": "Usuario eliminado exitosamente"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error("[AdminUsers] Error eliminando usuario %s: %s", uid, e)
        raise HTTPException(status_code=500, detail="Error al eliminar usuario")
