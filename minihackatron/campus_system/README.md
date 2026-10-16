# CAMPUS BAJO PRESIÓN 🏛️🔥

Sistema inteligente de gestión, control de accesos y validación de solicitudes para espacios del campus universitario.

---

## 📋 Descripción del Proyecto

*CAMPUS BAJO PRESIÓN* es una solución diseñada para administrar el flujo de usuarios, optimizar la asignación de espacios según el tipo de salón y validar operaciones mediante un pipeline innovador que combina consultas a bases de datos con validación a través de Inteligencia Artificial.

---

## 🚀 Módulos y Funcionalidades Principales

### 1. Sistema de Logging y Autenticación
* *Verificación de Usuario:* El sistema valida si el usuario ya se encuentra registrado en la base de datos.
  * *Si está registrado:* Pasa directamente al menú principal.
  * *Si NO está registrado:* El sistema exige el ingreso de la *identificación completa* de la persona para el proceso de registro.
* *Gestión de Roles:* Durante el registro, el usuario selecciona un rol. Este quedará en estado *pendiente* hasta que un *Administrador* acepte y valide la asignación del rol.

### 2. Módulo de Profesores y Aforos Automatizados
* *Selección por Tipo de Salón:* Los profesores no necesitan ingresar manualmente la capacidad o aforo requerido para el aula. El registro se realiza indicando el tipo de salón (ej. S2, K4), y el sistema deduce automáticamente la cantidad de alumnos asignada a dicha tipología.
* *Permisos Especiales:* El sistema contempla privilegios y accesos diferenciados según el perfil o tipo de profesor.

### 3. Arquitectura Central: DB + Inteligencia Artificial (Core Idea)
El núcleo de validación de solicitudes opera bajo el siguiente flujo:
1. *Consulta a Base de Datos:* Desde el lenguaje de programación elegido (Lenguaje X), se ejecuta una consulta en la base de datos para extraer la información requerida de la solicitud.
2. *Procesamiento por IA:* Una vez la respuesta de la base de datos está lista, los datos son enviados a un modelo de Inteligencia Artificial.
3. *Verificación y Confirmación:* La IA analiza la solicitud del usuario frente al resultado obtenido de la base de datos para verificar, contrastar y confirmar la veracidad o viabilidad de la petición.

---

## 🛠️ Tecnologías Sugeridas
* *Lenguaje Backend (Lenguaje X):* Python / Node.js / Java (a definir según el equipo).
* *Base de Datos:* Relacional o NoSQL (para gestión de usuarios, roles, tipos de salón y registros).
* *Integración con IA:* API de Inteligencia Artificial para el filtrado, validación y confirmación lógica de solicitudes.

---

## ⚙️ Indicaciones de Ejecución y Puesta en Marcha

   git clone y ejecutar.