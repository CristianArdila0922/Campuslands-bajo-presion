-- ============================================
-- SISTEMA CENTRAL DE GESTIÓN OPERATIVA
-- Campuslands - Hackatón
-- ============================================

CREATE DATABASE IF NOT EXISTS campuslands_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE campuslands_db;

-- ============================================
-- ROLES
-- ============================================

CREATE TABLE roles (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(50) NOT NULL UNIQUE,
    descripcion VARCHAR(255)
);

INSERT INTO roles (nombre, descripcion) VALUES
('admin_salas',       'Gestión CRUD de salas'),
('admin_herramientas','Gestión CRUD de salas (sin módulo de computadores por ahora)'),
('admin_agenda',      'Gestiona la sala reservada de Diego Tarazona según su agenda'),
('profesor',          'Puede reservar aulas para clases'),
('externo',           'Persona o empresa externa que reserva salas');

-- ============================================
-- USUARIOS
-- ============================================

CREATE TABLE usuarios (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(150) NOT NULL,
    email VARCHAR(150) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    rol_id INT NOT NULL,
    activo BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (rol_id) REFERENCES roles(id)
);

-- ============================================
-- SALAS
-- ============================================

CREATE TABLE salas (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL UNIQUE,
    capacidad INT NOT NULL,
    tiene_computadores BOOLEAN DEFAULT FALSE,
    tipo ENUM('auditorio', 'laboratorio', 'coworking', 'sala_reunion') NOT NULL,
    activo BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_capacidad CHECK (capacidad > 0)
);

-- ============================================
-- RESERVAS
-- Reglas de negocio:
--   1. No solapamiento de horarios por sala (validado en backend)
--   2. Num asistentes no puede superar capacidad de la sala (validado en backend)
--   3. No se puede reservar una sala inactiva (validado en backend)
--   4. La sala de Diego solo la puede mover admin_agenda (validado en backend)
-- ============================================

CREATE TABLE reservas (
    id INT AUTO_INCREMENT PRIMARY KEY,
    sala_id INT NOT NULL,
    usuario_id INT NOT NULL,
    nombre_solicitante VARCHAR(150) NOT NULL,
    motivo VARCHAR(255) NOT NULL,
    fecha DATE NOT NULL,
    hora_inicio TIME NOT NULL,
    hora_fin TIME NOT NULL,
    num_asistentes INT NOT NULL,
    estado ENUM('pendiente', 'aprobada', 'rechazada', 'cancelada') DEFAULT 'pendiente',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (sala_id) REFERENCES salas(id),
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
    CONSTRAINT chk_horas CHECK (hora_fin > hora_inicio),
    CONSTRAINT chk_asistentes CHECK (num_asistentes > 0)
);

-- ============================================
-- INCIDENCIAS
-- El campo analisis_ia lo llena automáticamente la IA
-- con categoría, prioridad y responsable sugerido
-- ============================================

CREATE TABLE incidencias (
    id INT AUTO_INCREMENT PRIMARY KEY,
    titulo VARCHAR(255) NOT NULL,
    descripcion TEXT NOT NULL,
    reportado_por VARCHAR(150) NOT NULL,
    email_reportante VARCHAR(150),
    categoria ENUM('infraestructura', 'tecnologia', 'seguridad', 'bienestar', 'academico', 'otro') DEFAULT 'otro',
    prioridad ENUM('baja', 'media', 'alta', 'critica') DEFAULT 'media',
    responsable_sugerido VARCHAR(150),
    analisis_ia TEXT,
    estado ENUM('abierta', 'en_proceso', 'resuelta', 'cerrada') DEFAULT 'abierta',
    sala_relacionada INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (sala_relacionada) REFERENCES salas(id) ON DELETE SET NULL
);
