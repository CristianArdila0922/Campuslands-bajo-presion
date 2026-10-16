from fastapi import FastAPI, HTTPException, Header, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from typing import Optional
from datetime import date, time
import random, string

from db import get_connection
from auth import hash_password, verify_password, create_token, decode_token
from ia_service import analizar_incidencia, recomendar_sala

app = FastAPI(title="Campuslands - Sistema Central de Gestión Operativa")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Servir frontend estático
app.mount("/app", StaticFiles(directory="../frontend", html=True), name="frontend")

# ─────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────

def get_current_user(authorization: str = Header(...)):
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Token inválido")
    token = authorization.split(" ")[1]
    payload = decode_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Token expirado o inválido")
    return payload

def require_roles(*roles):
    def checker(user=Depends(get_current_user)):
        if user.get("rol") not in roles:
            raise HTTPException(status_code=403, detail="No tienes permisos para esta acción")
        return user
    return checker

def generar_numero_reporte():
    return "RPT-" + "".join(random.choices(string.digits, k=6))

def registrar_bitacora(admin_id, accion, entidad, entidad_id, detalle=""):
    conn = get_connection()
    cur = conn.cursor()
    cur.execute(
        "INSERT INTO bitacora (admin_id, accion, entidad, entidad_id, detalle) VALUES (%s,%s,%s,%s,%s)",
        (admin_id, accion, entidad, entidad_id, detalle)
    )
    conn.commit()
    cur.close()
    conn.close()

# ─────────────────────────────────────────────
# MODELOS PYDANTIC
# ─────────────────────────────────────────────

class LoginInput(BaseModel):
    email: str
    password: str

class RegisterInput(BaseModel):
    nombre: str
    email: str
    password: str
    rol_id: int

class SalaInput(BaseModel):
    nombre: str
    capacidad: int
    tiene_computadores: bool
    tipo: str
    tiempo_maximo_uso: Optional[int] = 120

class ReservaInput(BaseModel):
    sala_id: int
    nombre_solicitante: str
    motivo: str
    fecha: str
    hora_inicio: str
    hora_fin: str
    num_asistentes: int
    requiere_hardware: Optional[bool] = False
    hardware_id: Optional[int] = None

class IncidenciaInput(BaseModel):
    titulo: str
    descripcion: str
    reportado_por: str
    email_reportante: Optional[str] = None
    sala_id: Optional[int] = None

class HardwareInput(BaseModel):
    nombre: str
    tipo: str
    codigo_inventario: str
    descripcion: Optional[str] = None

class RecomendacionInput(BaseModel):
    motivo: str
    num_asistentes: int
    requiere_computadores: bool

# ─────────────────────────────────────────────
# AUTH
# ─────────────────────────────────────────────

@app.post("/api/auth/login")
def login(data: LoginInput):
    conn = get_connection()
    cur = conn.cursor(dictionary=True)
    cur.execute("""
        SELECT u.*, r.nombre as rol FROM usuarios u
        JOIN roles r ON u.rol_id = r.id
        WHERE u.email = %s AND u.estado = 'activo'
    """, (data.email,))
    user = cur.fetchone()
    cur.close(); conn.close()

    if not user or not verify_password(data.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Credenciales incorrectas o cuenta pendiente de aprobación")

    token = create_token({"sub": user["id"], "nombre": user["nombre"], "rol": user["rol"], "rol_id": user["rol_id"]})
    return {"token": token, "nombre": user["nombre"], "rol": user["rol"]}


@app.post("/api/auth/register")
def register(data: RegisterInput):
    conn = get_connection()
    cur = conn.cursor()
    # Verificar email único
    cur.execute("SELECT id FROM usuarios WHERE email = %s", (data.email,))
    if cur.fetchone():
        raise HTTPException(status_code=400, detail="El email ya está registrado")

    hashed = hash_password(data.password)
    # Estado pendiente hasta que un admin lo apruebe
    cur.execute(
        "INSERT INTO usuarios (nombre, email, password_hash, rol_id, estado) VALUES (%s,%s,%s,%s,'pendiente')",
        (data.nombre, data.email, hashed, data.rol_id)
    )
    conn.commit(); cur.close(); conn.close()
    return {"message": "Registro exitoso. Tu cuenta está pendiente de aprobación por un administrador."}


@app.get("/api/roles")
def get_roles():
    conn = get_connection()
    cur = conn.cursor(dictionary=True)
    cur.execute("SELECT id, nombre, descripcion FROM roles")
    roles = cur.fetchall()
    cur.close(); conn.close()
    return roles


# ─────────────────────────────────────────────
# ADMIN: GESTIÓN DE USUARIOS PENDIENTES
# ─────────────────────────────────────────────

@app.get("/api/admin/usuarios-pendientes")
def usuarios_pendientes(user=Depends(require_roles("admin_salas", "admin_hardware", "admin_eventos"))):
    conn = get_connection()
    cur = conn.cursor(dictionary=True)
    cur.execute("""
        SELECT u.id, u.nombre, u.email, r.nombre as rol, u.created_at
        FROM usuarios u JOIN roles r ON u.rol_id = r.id
        WHERE u.estado = 'pendiente'
    """)
    usuarios = cur.fetchall()
    cur.close(); conn.close()
    return usuarios


@app.put("/api/admin/usuarios/{usuario_id}/aprobar")
def aprobar_usuario(usuario_id: int, user=Depends(require_roles("admin_salas", "admin_hardware", "admin_eventos"))):
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("UPDATE usuarios SET estado='activo' WHERE id=%s", (usuario_id,))
    conn.commit(); cur.close(); conn.close()
    registrar_bitacora(user["sub"], "aprobar_usuario", "usuarios", usuario_id)
    return {"message": "Usuario aprobado"}


# ─────────────────────────────────────────────
# SALAS
# ─────────────────────────────────────────────

@app.get("/api/salas")
def get_salas():
    conn = get_connection()
    cur = conn.cursor(dictionary=True)
    cur.execute("SELECT * FROM salas WHERE activo = TRUE ORDER BY nombre")
    salas = cur.fetchall()
    cur.close(); conn.close()
    return salas


@app.get("/api/salas/disponibles")
def salas_disponibles(fecha: str = None, hora_inicio: str = None, hora_fin: str = None,
                      capacidad: int = 0, computadores: bool = None):
    conn = get_connection()
    cur = conn.cursor(dictionary=True)

    query = "SELECT * FROM salas WHERE estado = 'disponible' AND activo = TRUE"
    params = []

    if capacidad > 0:
        query += " AND capacidad >= %s"
        params.append(capacidad)
    if computadores is not None:
        query += " AND tiene_computadores = %s"
        params.append(computadores)

    # Excluir salas con reservas solapadas
    if fecha and hora_inicio and hora_fin:
        query += """
            AND id NOT IN (
                SELECT sala_id FROM reservas
                WHERE fecha = %s AND estado IN ('aprobada','en_curso')
                AND NOT (%s >= hora_fin OR %s <= hora_inicio)
            )
        """
        params += [fecha, hora_inicio, hora_fin]

    cur.execute(query, params)
    salas = cur.fetchall()
    cur.close(); conn.close()
    return salas


@app.post("/api/salas")
def crear_sala(data: SalaInput, user=Depends(require_roles("admin_salas", "admin_hardware"))):
    conn = get_connection()
    cur = conn.cursor()
    # REGLA: capacidad > 0
    if data.capacidad <= 0:
        raise HTTPException(status_code=400, detail="La capacidad debe ser mayor a 0")
    cur.execute(
        "INSERT INTO salas (nombre, capacidad, tiene_computadores, tipo, tiempo_maximo_uso) VALUES (%s,%s,%s,%s,%s)",
        (data.nombre, data.capacidad, data.tiene_computadores, data.tipo, data.tiempo_maximo_uso)
    )
    new_id = cur.lastrowid
    conn.commit(); cur.close(); conn.close()
    registrar_bitacora(user["sub"], "crear_sala", "salas", new_id, data.nombre)
    return {"message": "Sala creada", "id": new_id}


@app.put("/api/salas/{sala_id}")
def actualizar_sala(sala_id: int, data: SalaInput, user=Depends(require_roles("admin_salas", "admin_hardware"))):
    conn = get_connection()
    cur = conn.cursor()
    cur.execute(
        "UPDATE salas SET nombre=%s, capacidad=%s, tiene_computadores=%s, tipo=%s, tiempo_maximo_uso=%s WHERE id=%s",
        (data.nombre, data.capacidad, data.tiene_computadores, data.tipo, data.tiempo_maximo_uso, sala_id)
    )
    conn.commit(); cur.close(); conn.close()
    registrar_bitacora(user["sub"], "actualizar_sala", "salas", sala_id, data.nombre)
    return {"message": "Sala actualizada"}


@app.delete("/api/salas/{sala_id}")
def eliminar_sala(sala_id: int, user=Depends(require_roles("admin_salas", "admin_hardware"))):
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("UPDATE salas SET activo=FALSE WHERE id=%s", (sala_id,))
    conn.commit(); cur.close(); conn.close()
    registrar_bitacora(user["sub"], "eliminar_sala", "salas", sala_id)
    return {"message": "Sala desactivada"}


@app.put("/api/salas/{sala_id}/estado")
def cambiar_estado_sala(sala_id: int, estado: str, user=Depends(require_roles("admin_salas", "admin_hardware", "admin_eventos"))):
    estados_validos = ["disponible", "ocupada", "inhabilitada"]
    if estado not in estados_validos:
        raise HTTPException(status_code=400, detail=f"Estado inválido. Opciones: {estados_validos}")
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("UPDATE salas SET estado=%s WHERE id=%s", (estado, sala_id))
    conn.commit(); cur.close(); conn.close()
    registrar_bitacora(user["sub"], f"cambiar_estado_sala_{estado}", "salas", sala_id)
    return {"message": f"Sala actualizada a '{estado}'"}


# ─────────────────────────────────────────────
# RESERVAS
# ─────────────────────────────────────────────

@app.get("/api/reservas")
def get_reservas(user=Depends(get_current_user)):
    conn = get_connection()
    cur = conn.cursor(dictionary=True)
    if user["rol"] in ("admin_salas", "admin_hardware", "admin_eventos"):
        cur.execute("""
            SELECT r.*, s.nombre as sala_nombre FROM reservas r
            JOIN salas s ON r.sala_id = s.id ORDER BY r.fecha DESC, r.hora_inicio
        """)
    else:
        cur.execute("""
            SELECT r.*, s.nombre as sala_nombre FROM reservas r
            JOIN salas s ON r.sala_id = s.id
            WHERE r.usuario_id = %s ORDER BY r.fecha DESC
        """, (user["sub"],))
    reservas = cur.fetchall()
    cur.close(); conn.close()
    return reservas


@app.post("/api/reservas")
def crear_reserva(data: ReservaInput, user=Depends(get_current_user)):
    conn = get_connection()
    cur = conn.cursor(dictionary=True)

    # REGLA 1: Sala debe existir y estar disponible
    cur.execute("SELECT * FROM salas WHERE id=%s AND activo=TRUE", (data.sala_id,))
    sala = cur.fetchone()
    if not sala:
        raise HTTPException(status_code=404, detail="Sala no encontrada")
    if sala["estado"] == "inhabilitada":
        raise HTTPException(status_code=400, detail="La sala está inhabilitada por una incidencia activa")
    if sala["estado"] == "ocupada":
        raise HTTPException(status_code=400, detail="La sala está actualmente ocupada")

    # REGLA 2: Asistentes no pueden superar capacidad
    if data.num_asistentes > sala["capacidad"]:
        raise HTTPException(
            status_code=400,
            detail=f"El número de asistentes ({data.num_asistentes}) supera la capacidad de la sala ({sala['capacidad']})"
        )

    # REGLA 3: No solapamiento de horarios
    cur.execute("""
        SELECT id FROM reservas
        WHERE sala_id=%s AND fecha=%s AND estado IN ('aprobada','en_curso')
        AND NOT (%s >= hora_fin OR %s <= hora_inicio)
    """, (data.sala_id, data.fecha, data.hora_inicio, data.hora_fin))
    if cur.fetchone():
        raise HTTPException(status_code=400, detail="Ya existe una reserva en ese horario para esta sala")

    # Si requiere hardware, verificar que esté disponible
    if data.requiere_hardware and data.hardware_id:
        cur.execute("SELECT estado FROM hardware WHERE id=%s", (data.hardware_id,))
        hw = cur.fetchone()
        if not hw or hw["estado"] != "disponible":
            raise HTTPException(status_code=400, detail="El hardware solicitado no está disponible")

    numero = generar_numero_reporte()
    cur2 = conn.cursor()
    cur2.execute("""
        INSERT INTO reservas (numero_reporte, sala_id, usuario_id, nombre_solicitante, motivo,
                              fecha, hora_inicio, hora_fin, num_asistentes, requiere_hardware, hardware_id, estado)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'pendiente')
    """, (numero, data.sala_id, user["sub"], data.nombre_solicitante, data.motivo,
          data.fecha, data.hora_inicio, data.hora_fin, data.num_asistentes,
          data.requiere_hardware, data.hardware_id))
    conn.commit()
    cur.close(); cur2.close(); conn.close()
    return {"message": "Reserva creada exitosamente", "numero_reporte": numero}


@app.put("/api/reservas/{reserva_id}/estado")
def cambiar_estado_reserva(reserva_id: int, estado: str,
                            user=Depends(require_roles("admin_salas", "admin_hardware", "admin_eventos"))):
    estados_validos = ["aprobada", "rechazada", "cancelada", "en_curso", "finalizada"]
    if estado not in estados_validos:
        raise HTTPException(status_code=400, detail="Estado inválido")

    conn = get_connection()
    cur = conn.cursor(dictionary=True)
    cur.execute("SELECT * FROM reservas WHERE id=%s", (reserva_id,))
    reserva = cur.fetchone()
    if not reserva:
        raise HTTPException(status_code=404, detail="Reserva no encontrada")

    cur2 = conn.cursor()
    cur2.execute("UPDATE reservas SET estado=%s WHERE id=%s", (estado, reserva_id))

    # Lógica de liberación de sala
    if estado == "finalizada":
        if reserva["requiere_hardware"]:
            # Con hardware: NO se libera automáticamente
            pass
        else:
            # Sin hardware: liberar sala automáticamente
            cur2.execute("UPDATE salas SET estado='disponible' WHERE id=%s", (reserva["sala_id"],))

    conn.commit(); cur.close(); cur2.close(); conn.close()
    registrar_bitacora(user["sub"], f"reserva_{estado}", "reservas", reserva_id)
    return {"message": f"Reserva actualizada a '{estado}'"}


@app.put("/api/reservas/{reserva_id}/cancelar")
def cancelar_reserva(reserva_id: int, user=Depends(get_current_user)):
    conn = get_connection()
    cur = conn.cursor(dictionary=True)
    cur.execute("SELECT * FROM reservas WHERE id=%s", (reserva_id,))
    reserva = cur.fetchone()
    if not reserva:
        raise HTTPException(status_code=404, detail="Reserva no encontrada")
    # Solo el dueño o un admin puede cancelar
    is_admin = user["rol"] in ("admin_salas", "admin_hardware", "admin_eventos")
    if not is_admin and reserva["usuario_id"] != user["sub"]:
        raise HTTPException(status_code=403, detail="No puedes cancelar una reserva que no es tuya")
    if reserva["estado"] in ("cancelada", "finalizada", "rechazada"):
        raise HTTPException(status_code=400, detail="Esta reserva ya no puede cancelarse")

    cur2 = conn.cursor()
    cur2.execute("UPDATE reservas SET estado='cancelada' WHERE id=%s", (reserva_id,))
    conn.commit(); cur.close(); cur2.close(); conn.close()
    return {"message": "Reserva cancelada"}


# ─────────────────────────────────────────────
# HARDWARE
# ─────────────────────────────────────────────

@app.get("/api/hardware")
def get_hardware():
    conn = get_connection()
    cur = conn.cursor(dictionary=True)
    cur.execute("SELECT * FROM hardware WHERE activo=TRUE ORDER BY nombre")
    hw = cur.fetchall()
    cur.close(); conn.close()
    return hw


@app.post("/api/hardware")
def crear_hardware(data: HardwareInput, user=Depends(require_roles("admin_hardware"))):
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("SELECT id FROM hardware WHERE codigo_inventario=%s", (data.codigo_inventario,))
    if cur.fetchone():
        raise HTTPException(status_code=400, detail="Ya existe un equipo con ese código de inventario")
    cur.execute(
        "INSERT INTO hardware (nombre, tipo, codigo_inventario, descripcion) VALUES (%s,%s,%s,%s)",
        (data.nombre, data.tipo, data.codigo_inventario, data.descripcion)
    )
    new_id = cur.lastrowid
    conn.commit(); cur.close(); conn.close()
    registrar_bitacora(user["sub"], "crear_hardware", "hardware", new_id, data.nombre)
    return {"message": "Hardware registrado", "id": new_id}


@app.put("/api/hardware/{hw_id}/estado")
def cambiar_estado_hardware(hw_id: int, estado: str, user=Depends(require_roles("admin_hardware"))):
    estados_validos = ["disponible", "prestado", "en_mantenimiento", "dañado", "dado_de_baja"]
    if estado not in estados_validos:
        raise HTTPException(status_code=400, detail="Estado inválido")
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("UPDATE hardware SET estado=%s WHERE id=%s", (estado, hw_id))
    conn.commit(); cur.close(); conn.close()
    registrar_bitacora(user["sub"], f"hardware_{estado}", "hardware", hw_id)
    return {"message": f"Hardware actualizado a '{estado}'"}


@app.delete("/api/hardware/{hw_id}")
def eliminar_hardware(hw_id: int, user=Depends(require_roles("admin_hardware"))):
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("UPDATE hardware SET activo=FALSE WHERE id=%s", (hw_id,))
    conn.commit(); cur.close(); conn.close()
    registrar_bitacora(user["sub"], "eliminar_hardware", "hardware", hw_id)
    return {"message": "Hardware dado de baja"}


# ─────────────────────────────────────────────
# INCIDENCIAS
# ─────────────────────────────────────────────

@app.get("/api/incidencias")
def get_incidencias(user=Depends(get_current_user)):
    conn = get_connection()
    cur = conn.cursor(dictionary=True)
    cur.execute("""
        SELECT i.*, s.nombre as sala_nombre FROM incidencias i
        LEFT JOIN salas s ON i.sala_id = s.id
        ORDER BY i.created_at DESC
    """)
    incidencias = cur.fetchall()
    cur.close(); conn.close()
    return incidencias


@app.post("/api/incidencias")
def crear_incidencia(data: IncidenciaInput, user=Depends(get_current_user)):
    # Llamar a la IA para clasificar automáticamente
    resultado_ia = analizar_incidencia(data.titulo, data.descripcion)

    conn = get_connection()
    cur = conn.cursor()
    cur.execute("""
        INSERT INTO incidencias (titulo, descripcion, reportado_por, email_reportante,
                                 sala_id, categoria, prioridad, responsable_sugerido, analisis_ia)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)
    """, (data.titulo, data.descripcion, data.reportado_por, data.email_reportante,
          data.sala_id, resultado_ia["categoria"], resultado_ia["prioridad"],
          resultado_ia["responsable_sugerido"], resultado_ia["analisis"]))
    new_id = cur.lastrowid

    # REGLA: Si hay sala relacionada, inhabilitarla automáticamente
    if data.sala_id:
        cur.execute("UPDATE salas SET estado='inhabilitada' WHERE id=%s", (data.sala_id,))

    conn.commit(); cur.close(); conn.close()
    return {
        "message": "Incidencia registrada. La sala ha sido inhabilitada automáticamente.",
        "id": new_id,
        "analisis_ia": resultado_ia
    }


@app.put("/api/incidencias/{inc_id}/resolver")
def resolver_incidencia(inc_id: int, user=Depends(require_roles("admin_salas", "admin_hardware", "admin_eventos"))):
    conn = get_connection()
    cur = conn.cursor(dictionary=True)
    cur.execute("SELECT * FROM incidencias WHERE id=%s", (inc_id,))
    inc = cur.fetchone()
    if not inc:
        raise HTTPException(status_code=404, detail="Incidencia no encontrada")

    cur2 = conn.cursor()
    cur2.execute("UPDATE incidencias SET estado='resuelta' WHERE id=%s", (inc_id,))
    # Rehabilitar sala
    if inc["sala_id"]:
        cur2.execute("UPDATE salas SET estado='disponible' WHERE id=%s", (inc["sala_id"],))

    conn.commit(); cur.close(); cur2.close(); conn.close()
    registrar_bitacora(user["sub"], "resolver_incidencia", "incidencias", inc_id)
    return {"message": "Incidencia resuelta y sala rehabilitada"}


# ─────────────────────────────────────────────
# IA: RECOMENDACIÓN DE SALA
# ─────────────────────────────────────────────

@app.post("/api/ia/recomendar-sala")
def recomendar(data: RecomendacionInput, user=Depends(get_current_user)):
    conn = get_connection()
    cur = conn.cursor(dictionary=True)
    cur.execute("SELECT * FROM vista_salas_disponibles WHERE capacidad >= %s", (data.num_asistentes,))
    salas = cur.fetchall()
    cur.close(); conn.close()

    if not salas:
        raise HTTPException(status_code=404, detail="No hay salas disponibles con esa capacidad")

    resultado = recomendar_sala(data.motivo, data.num_asistentes, data.requiere_computadores, salas)
    return resultado


# ─────────────────────────────────────────────
# BITÁCORA
# ─────────────────────────────────────────────

@app.get("/api/bitacora")
def get_bitacora(user=Depends(require_roles("admin_salas", "admin_hardware", "admin_eventos"))):
    conn = get_connection()
    cur = conn.cursor(dictionary=True)
    cur.execute("""
        SELECT b.*, u.nombre as admin_nombre FROM bitacora b
        JOIN usuarios u ON b.admin_id = u.id
        ORDER BY b.created_at DESC LIMIT 100
    """)
    logs = cur.fetchall()
    cur.close(); conn.close()
    return logs
