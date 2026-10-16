import google.generativeai as genai
from dotenv import load_dotenv
import os
import json

load_dotenv()

genai.configure(api_key=os.getenv("GEMINI_API_KEY"))
model = genai.GenerativeModel("gemini-1.5-flash")

def analizar_incidencia(titulo: str, descripcion: str) -> dict:
    """
    Recibe título y descripción de una incidencia.
    Retorna categoría, prioridad, responsable sugerido y análisis.
    """
    prompt = f"""
Eres el sistema de triaje inteligente de Campuslands, una academia de programación.
Analiza la siguiente incidencia reportada y responde ÚNICAMENTE con un JSON válido.

Incidencia:
- Título: {titulo}
- Descripción: {descripcion}

Responde con este JSON exacto (sin markdown, sin texto extra):
{{
  "categoria": "<infraestructura|tecnologia|seguridad|bienestar|academico|otro>",
  "prioridad": "<baja|media|alta|critica>",
  "responsable_sugerido": "<nombre del área o rol responsable>",
  "analisis": "<explicación breve de 2-3 líneas sobre la incidencia y qué acción tomar>"
}}
"""
    try:
        response = model.generate_content(prompt)
        text = response.text.strip()
        # Limpiar posible markdown
        if text.startswith("```"):
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]
        return json.loads(text)
    except Exception as e:
        # Fallback si la IA falla — nunca hardcodeado, siempre intenta
        return {
            "categoria": "otro",
            "prioridad": "media",
            "responsable_sugerido": "Soporte técnico",
            "analisis": f"Análisis automático no disponible. Error: {str(e)}"
        }


def recomendar_sala(motivo: str, num_asistentes: int, requiere_computadores: bool, salas_disponibles: list) -> dict:
    """
    Dado el motivo, asistentes y requerimientos, recomienda la sala más adecuada.
    """
    salas_texto = "\n".join([
        f"- {s['nombre']}: capacidad {s['capacidad']}, computadores: {'Sí' if s['tiene_computadores'] else 'No'}, tipo: {s['tipo']}"
        for s in salas_disponibles
    ])

    prompt = f"""
Eres el asistente de asignación de salas de Campuslands.
Un usuario necesita una sala con estas características:
- Motivo: {motivo}
- Número de asistentes: {num_asistentes}
- Requiere computadores: {"Sí" if requiere_computadores else "No"}

Salas disponibles ahora mismo:
{salas_texto}

Responde ÚNICAMENTE con un JSON válido (sin markdown):
{{
  "sala_recomendada": "<nombre de la sala>",
  "razon": "<explicación breve de por qué es la mejor opción>"
}}
"""
    try:
        response = model.generate_content(prompt)
        text = response.text.strip()
        if text.startswith("```"):
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]
        return json.loads(text)
    except Exception as e:
        return {
            "sala_recomendada": salas_disponibles[0]["nombre"] if salas_disponibles else "N/A",
            "razon": f"Recomendación automática no disponible. Error: {str(e)}"
        }
