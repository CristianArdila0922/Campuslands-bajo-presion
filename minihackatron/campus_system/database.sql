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
('admin_salas',       'Admin 1: CRUD exclusivo de aulas y espacios físicos'),
('admin_hardware',    'Admin 2: CRUD de inventario de hardware y recursos tecnológicos'),
('admin_eventos',     'Admin 3: Gestión de salas de conferencias y eventos especiales'),
('profesor',          'Reserva de aulas para clases'),
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
    estado ENUM('pendiente', 'activo', 'bloqueado') DEFAULT 'pendiente',
    penalizaciones INT DEFAULT 0,
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
    estado ENUM('disponible', 'ocupada', 'inhabilitada') DEFAULT 'disponible',
    tiempo_maximo_uso INT DEFAULT 120 COMMENT 'Minutos máximos de uso, configurable por admin',
    activo BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_capacidad CHECK (capacidad > 0)
);

INSERT INTO salas (nombre, capacidad, tiene_computadores, tipo) VALUES
('Auditorio', 100, FALSE, 'auditorio'),
('Cosmos',     25, TRUE,  'laboratorio'),
('Skylab',     20, TRUE,  'laboratorio'),
('Sputnik',    38, TRUE,  'laboratorio'),
('Apolo',      34, TRUE,  'laboratorio'),
('Artemis',    32, TRUE,  'laboratorio'),
('Blanca',     12, FALSE, 'coworking'),
('Azul',       10, FALSE, 'coworking'),
('Amarilla',    6, FALSE, 'sala_reunion'),
('Verde',       6, FALSE, 'sala_reunion');

-- ============================================
-- HARDWARE / RECURSOS TECNOLÓGICOS
-- ============================================
CREATE TABLE hardware (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    tipo ENUM('laptop', 'tablet', 'cable_hdmi', 'adaptador', 'camara', 'microfono', 'otro') NOT NULL,
    codigo_inventario VARCHAR(50) UNIQUE NOT NULL,
    estado ENUM('disponible', 'prestado', 'en_mantenimiento', 'dañado', 'dado_de_baja') DEFAULT 'disponible',
    descripcion VARCHAR(255),
    activo BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Seeders iniciales
INSERT INTO hardware (nombre, tipo, codigo_inventario, descripcion) VALUES
('Laptop Dell 01',     'laptop',     'LAP-001', 'Dell Inspiron 15, 8GB RAM'),
('Laptop Dell 02',     'laptop',     'LAP-002', 'Dell Inspiron 15, 8GB RAM'),
('Laptop Dell 03',     'laptop',     'LAP-003', 'Dell Inspiron 15, 8GB RAM'),
('Laptop HP 01',       'laptop',     'LAP-004', 'HP ProBook 450'),
('Laptop HP 02',       'laptop',     'LAP-005', 'HP ProBook 450'),
('Cable HDMI 01',      'cable_hdmi', 'CAB-001', 'HDMI 2.0 2m'),
('Cable HDMI 02',      'cable_hdmi', 'CAB-002', 'HDMI 2.0 2m'),
('Adaptador USB-C 01', 'adaptador',  'ADP-001', 'USB-C a HDMI'),
('Cámara Web 01',      'camara',     'CAM-001', 'Logitech C920'),
('Micrófono 01',       'microfono',  'MIC-001', 'Blue Yeti');

-- ============================================
-- RESERVAS
-- REGLA 1: No solapamiento de horarios (backend)
-- REGLA 2: Asistentes <= capacidad sala (backend)
-- REGLA 3: No reservar sala inhabilitada/inactiva (backend)
-- ============================================
CREATE TABLE reservas (
    id INT AUTO_INCREMENT PRIMARY KEY,
    numero_reporte VARCHAR(20) NOT NULL UNIQUE COMMENT 'Código único tipo RPT-00001',
    sala_id INT NOT NULL,
    usuario_id INT NOT NULL,
    nombre_solicitante VARCHAR(150) NOT NULL,
    motivo VARCHAR(255) NOT NULL,
    fecha DATE NOT NULL,
    hora_inicio TIME NOT NULL,
    hora_fin TIME NOT NULL,
    num_asistentes INT NOT NULL,
    requiere_hardware BOOLEAN DEFAULT FALSE,
    hardware_id INT NULL COMMENT 'Si pidió hardware, no se libera la sala automáticamente',
    estado ENUM('pendiente', 'aprobada', 'rechazada', 'cancelada', 'en_curso', 'finalizada') DEFAULT 'pendiente',
    liberada_manualmente BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (sala_id) REFERENCES salas(id),
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
    FOREIGN KEY (hardware_id) REFERENCES hardware(id) ON DELETE SET NULL,
    CONSTRAINT chk_horas CHECK (hora_fin > hora_inicio),
    CONSTRAINT chk_asistentes CHECK (num_asistentes > 0)
);

-- ============================================
-- PRÉSTAMOS DE HARDWARE
-- ============================================
CREATE TABLE prestamos_hardware (
    id INT AUTO_INCREMENT PRIMARY KEY,
    hardware_id INT NOT NULL,
    reserva_id INT NULL,
    solicitante_nombre VARCHAR(150) NOT NULL,
    fecha_prestamo DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fecha_devolucion_esperada DATETIME NOT NULL,
    fecha_devolucion_real DATETIME NULL,
    estado ENUM('activo', 'devuelto', 'vencido') DEFAULT 'activo',
    observaciones TEXT,
    FOREIGN KEY (hardware_id) REFERENCES hardware(id),
    FOREIGN KEY (reserva_id) REFERENCES reservas(id) ON DELETE SET NULL,
    CONSTRAINT chk_fechas_prestamo CHECK (fecha_devolucion_esperada > fecha_prestamo)
);

-- ============================================
-- INCIDENCIAS
-- Al crear una incidencia la sala pasa a 'inhabilitada'
-- Solo admin puede cambiarla de vuelta a 'disponible'
-- La IA llena: categoria, prioridad, responsable_sugerido, analisis_ia
-- ============================================
CREATE TABLE incidencias (
    id INT AUTO_INCREMENT PRIMARY KEY,
    titulo VARCHAR(255) NOT NULL,
    descripcion TEXT NOT NULL,
    reportado_por VARCHAR(150) NOT NULL,
    email_reportante VARCHAR(150),
    sala_id INT NULL,
    categoria ENUM('infraestructura', 'tecnologia', 'seguridad', 'bienestar', 'academico', 'otro') DEFAULT 'otro',
    prioridad ENUM('baja', 'media', 'alta', 'critica') DEFAULT 'media',
    responsable_sugerido VARCHAR(150),
    analisis_ia TEXT,
    estado ENUM('abierta', 'en_proceso', 'resuelta', 'cerrada') DEFAULT 'abierta',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (sala_id) REFERENCES salas(id) ON DELETE SET NULL
);

-- ============================================
-- BITÁCORA / AUDITORÍA DE ADMINS
-- ============================================
CREATE TABLE bitacora (
    id INT AUTO_INCREMENT PRIMARY KEY,
    admin_id INT NOT NULL,
    accion VARCHAR(100) NOT NULL COMMENT 'Ej: aprobar_reserva, cancelar_reserva, inhabilitar_sala',
    entidad VARCHAR(50) COMMENT 'reservas, salas, hardware, incidencias',
    entidad_id INT COMMENT 'ID del registro afectado',
    detalle TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (admin_id) REFERENCES usuarios(id)
);

-- ============================================
-- VISTAS ÚTILES
-- ============================================

-- Salas disponibles ahora mismo
CREATE VIEW vista_salas_disponibles AS
SELECT s.id, s.nombre, s.tipo, s.capacidad, s.tiene_computadores, s.tiempo_maximo_uso
FROM salas s
WHERE s.estado = 'disponible' AND s.activo = TRUE;

-- Hardware disponible
CREATE VIEW vista_hardware_disponible AS
SELECT id, nombre, tipo, codigo_inventario, descripcion
FROM hardware
WHERE estado = 'disponible' AND activo = TRUE;

-- Reservas activas hoy
CREATE VIEW vista_reservas_hoy AS
SELECT r.id, r.numero_reporte, s.nombre AS sala, r.nombre_solicitante,
       r.hora_inicio, r.hora_fin, r.estado, r.requiere_hardware
FROM reservas r
JOIN salas s ON r.sala_id = s.id
WHERE r.fecha = CURDATE() AND r.estado IN ('aprobada', 'en_curso');
