// ============================================
// CAMPUSLANDS - Sistema Central de Gestión
// Frontend MVP - Vanilla JS (sin dependencia de API)
// ============================================

const API = 'http://localhost:8000/api';
let currentUser = null;
let currentPage = null;

// ─────────────────────────────────────────────
// DATOS LOCALES DEL MVP (cuando no hay API)
// ─────────────────────────────────────────────

const SALAS_DATA = [
  { id:1,  nombre:'Auditorio', capacidad:100, tiene_computadores:false, tipo:'auditorio',    estado:'disponible' },
  { id:2,  nombre:'Cosmos',    capacidad:25,  tiene_computadores:true,  tipo:'laboratorio',  estado:'disponible' },
  { id:3,  nombre:'Skylab',    capacidad:20,  tiene_computadores:true,  tipo:'laboratorio',  estado:'disponible' },
  { id:4,  nombre:'Sputnik',   capacidad:38,  tiene_computadores:true,  tipo:'laboratorio',  estado:'disponible' },
  { id:5,  nombre:'Apolo',     capacidad:34,  tiene_computadores:true,  tipo:'laboratorio',  estado:'disponible' },
  { id:6,  nombre:'Artemis',   capacidad:32,  tiene_computadores:true,  tipo:'laboratorio',  estado:'disponible' },
  { id:7,  nombre:'Blanca',    capacidad:12,  tiene_computadores:false, tipo:'coworking',    estado:'disponible' },
  { id:8,  nombre:'Azul',      capacidad:10,  tiene_computadores:false, tipo:'coworking',    estado:'disponible' },
  { id:9,  nombre:'Amarilla',  capacidad:6,   tiene_computadores:false, tipo:'sala_reunion', estado:'disponible' },
  { id:10, nombre:'Verde',     capacidad:6,   tiene_computadores:false, tipo:'sala_reunion', estado:'disponible' },
];

const HARDWARE_DATA = [
  { id:1, nombre:'Laptop Dell 01',     tipo:'laptop',     codigo_inventario:'LAP-001', estado:'disponible' },
  { id:2, nombre:'Laptop Dell 02',     tipo:'laptop',     codigo_inventario:'LAP-002', estado:'disponible' },
  { id:3, nombre:'Laptop HP 01',       tipo:'laptop',     codigo_inventario:'LAP-003', estado:'disponible' },
  { id:4, nombre:'Cable HDMI 01',      tipo:'cable_hdmi', codigo_inventario:'CAB-001', estado:'disponible' },
  { id:5, nombre:'Adaptador USB-C 01', tipo:'adaptador',  codigo_inventario:'ADP-001', estado:'disponible' },
  { id:6, nombre:'Cámara Web 01',      tipo:'camara',     codigo_inventario:'CAM-001', estado:'disponible' },
];

const ROLES_DATA = [
  { id:4, nombre:'profesor', descripcion:'Profesor' },
  { id:5, nombre:'externo',  descripcion:'Persona / Empresa Externa' },
];

// Almacenamiento local en memoria
let reservas_local   = JSON.parse(localStorage.getItem('reservas')   || '[]');
let incidencias_local= JSON.parse(localStorage.getItem('incidencias')|| '[]');
let usuarios_local   = JSON.parse(localStorage.getItem('usuarios')   || '[]');
let bitacora_local   = JSON.parse(localStorage.getItem('bitacora')   || '[]');
let salas_local      = JSON.parse(localStorage.getItem('salas')      || JSON.stringify(SALAS_DATA));
let hw_local         = JSON.parse(localStorage.getItem('hardware')   || JSON.stringify(HARDWARE_DATA));

// Admins por defecto
const ADMINS_DEFAULT = [
  { id:101, nombre:'Admin Salas',       email:'admin.salas@campuslands.com',    password:'admin123', rol:'admin_salas',     estado:'activo' },
  { id:102, nombre:'Admin Hardware',    email:'admin.hw@campuslands.com',       password:'admin123', rol:'admin_hardware',  estado:'activo' },
  { id:103, nombre:'Admin Eventos',     email:'admin.eventos@campuslands.com',  password:'admin123', rol:'admin_eventos',   estado:'activo' },
];

function saveLocal() {
  localStorage.setItem('reservas',    JSON.stringify(reservas_local));
  localStorage.setItem('incidencias', JSON.stringify(incidencias_local));
  localStorage.setItem('usuarios',    JSON.stringify(usuarios_local));
  localStorage.setItem('bitacora',    JSON.stringify(bitacora_local));
  localStorage.setItem('salas',       JSON.stringify(salas_local));
  localStorage.setItem('hardware',    JSON.stringify(hw_local));
}

function genId(arr) { return arr.length ? Math.max(...arr.map(x=>x.id||0)) + 1 : 1; }
function genReporte() { return 'RPT-' + String(Date.now()).slice(-6); }
function hoy() { return new Date().toISOString().split('T')[0]; }

function logBitacora(adminNombre, accion, entidad, entidadId, detalle='') {
  bitacora_local.unshift({
    id: genId(bitacora_local),
    admin_nombre: adminNombre,
    accion, entidad, entidad_id: entidadId, detalle,
    created_at: new Date().toLocaleString('es-CO')
  });
  saveLocal();
}

// ─────────────────────────────────────────────
// UTILS UI
// ─────────────────────────────────────────────

function toast(msg, type = 'info') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = `toast show ${type}`;
  setTimeout(() => el.classList.remove('show'), 3500);
}

function showModal(html) {
  closeModal();
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `<div class="modal">${html}</div>`;
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
  return overlay;
}

function closeModal() { document.querySelector('.modal-overlay')?.remove(); }

function statusBadge(status) {
  return `<span class="status-badge status-${status}">${status.replace(/_/g,' ')}</span>`;
}

function roleBadge(rol) {
  const map = { admin_salas:'admin', admin_hardware:'admin', admin_eventos:'admin', profesor:'profesor', externo:'externo' };
  return `<span class="badge badge-${map[rol]||'externo'}">${rol.replace(/_/g,' ')}</span>`;
}

function isAdmin() {
  return currentUser && ['admin_salas','admin_hardware','admin_eventos'].includes(currentUser.rol);
}

function setContent(html) {
  document.getElementById('page-content').innerHTML = html;
}

// ─────────────────────────────────────────────
// AUTH
// ─────────────────────────────────────────────

function switchTab(tab) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  event.target.classList.add('active');
  document.getElementById('login-form').style.display    = tab === 'login'    ? 'block' : 'none';
  document.getElementById('register-form').style.display = tab === 'register' ? 'block' : 'none';
}

function loadRolesSelect() {
  const sel = document.getElementById('reg-rol');
  if (!sel) return;
  sel.innerHTML = ROLES_DATA.map(r => `<option value="${r.id}">${r.descripcion}</option>`).join('');
}

function doLogin(e) {
  e.preventDefault();
  const email    = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;

  // Buscar en admins default
  let user = ADMINS_DEFAULT.find(u => u.email === email && u.password === password);

  // Buscar en usuarios registrados
  if (!user) {
    const found = usuarios_local.find(u => u.email === email && u.password === password);
    if (found) {
      if (found.estado === 'pendiente') {
        toast('Tu cuenta está pendiente de aprobación por un administrador.', 'error');
        return;
      }
      user = found;
    }
  }

  if (!user) {
    toast('Email o contraseña incorrectos.', 'error');
    return;
  }

  currentUser = user;
  localStorage.setItem('currentUser', JSON.stringify(user));
  launchApp();
}

function doRegister(e) {
  e.preventDefault();

  const nombre   = document.getElementById('reg-nombre').value.trim();
  const email    = document.getElementById('reg-email').value.trim();
  const password = document.getElementById('reg-password').value;
  const rolId    = parseInt(document.getElementById('reg-rol').value);
  const rolObj   = ROLES_DATA.find(r => r.id === rolId);

  if (!nombre || !email || !password) {
    toast('Por favor completa todos los campos.', 'error');
    return;
  }

  // Verificar email único
  const existe = [...ADMINS_DEFAULT, ...usuarios_local].find(u => u.email === email);
  if (existe) {
    toast('Este email ya está registrado.', 'error');
    return;
  }

  const nuevoUsuario = {
    id:      genId(usuarios_local),
    nombre,
    email,
    password,
    rol:     rolObj?.nombre || 'externo',
    rol_id:  rolId,
    estado:  'pendiente',
    created_at: new Date().toLocaleString('es-CO')
  };

  usuarios_local.push(nuevoUsuario);
  saveLocal();

  toast('¡Registro exitoso! Tu cuenta está pendiente de aprobación.', 'success');

  // Volver a login
  document.getElementById('login-email').value    = email;
  document.getElementById('register-form').style.display = 'none';
  document.getElementById('login-form').style.display    = 'block';
  document.querySelectorAll('.tab-btn').forEach((b,i) => b.classList.toggle('active', i===0));
}

function logout() {
  localStorage.removeItem('currentUser');
  currentUser = null;
  document.getElementById('app-screen').style.display  = 'none';
  document.getElementById('auth-screen').style.display = 'flex';
}

// ─────────────────────────────────────────────
// APP LAUNCH
// ─────────────────────────────────────────────

function launchApp() {
  document.getElementById('auth-screen').style.display = 'none';
  document.getElementById('app-screen').style.display  = 'flex';
  document.getElementById('user-nombre').textContent   = currentUser.nombre;

  const rolClass = isAdmin() ? 'admin' : currentUser.rol === 'profesor' ? 'profesor' : 'externo';
  const badge = document.getElementById('user-badge');
  badge.className   = `badge badge-${rolClass}`;
  badge.textContent = currentUser.rol.replace(/_/g,' ');

  buildNav();
  navigateTo('salas');
}

function buildNav() {
  const nav = document.getElementById('sidebar-nav');
  const items = [
    { id:'salas',       icon:'🏛️', label:'Salas',             always:true },
    { id:'croquis',     icon:'🗺️', label:'Mapa del campus',   always:true },
    { id:'reservas',    icon:'📅', label:'Reservas',           always:true },
    { id:'incidencias', icon:'⚠️', label:'Incidencias',        always:true },
    { id:'hardware',    icon:'💻', label:'Hardware',            admin:true  },
    { id:'usuarios',    icon:'👥', label:'Usuarios pendientes', admin:true  },
    { id:'bitacora',    icon:'📋', label:'Bitácora',            admin:true  },
  ];
  nav.innerHTML = items
    .filter(i => i.always || (i.admin && isAdmin()))
    .map(i => `<div class="nav-item" id="nav-${i.id}" onclick="navigateTo('${i.id}')">
      <span class="nav-icon">${i.icon}</span>${i.label}
    </div>`).join('');
}

function navigateTo(page) {
  currentPage = page;
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById(`nav-${page}`)?.classList.add('active');
  const pages = { salas, croquis, reservas, incidencias, hardware, usuarios, bitacora };
  (pages[page] || (() => {}))();
}

// ─────────────────────────────────────────────
// PAGE: SALAS
// ─────────────────────────────────────────────

function salas() {
  const cards = salas_local.map(s => `
    <div class="card">
      <div class="card-title">${s.nombre}</div>
      <div class="card-meta">
        <span>👥 ${s.capacidad}</span>
        <span>${s.tiene_computadores ? '💻 Con PCs' : '📊 Sin PCs'}</span>
        <span class="badge badge-${s.tipo === 'laboratorio' ? 'profesor' : s.tipo === 'auditorio' ? 'admin' : 'externo'}">${s.tipo.replace('_',' ')}</span>
      </div>
      ${statusBadge(s.estado)}
      <div class="card-actions" style="margin-top:0.75rem">
        <button class="btn btn-secondary btn-sm" onclick="verDisponibilidad(${s.id},'${s.nombre}')">📅 Ver horarios</button>
        <button class="btn btn-primary btn-sm" onclick="modalReservar(${s.id},'${s.nombre}',${s.capacidad})">Reservar</button>
        ${isAdmin() ? `
          <button class="btn btn-secondary btn-sm" onclick="modalEditarSala(${s.id})">✏️</button>
          <button class="btn btn-${s.estado==='inhabilitada'?'success':'danger'} btn-sm"
            onclick="toggleSalaEstado(${s.id})">
            ${s.estado==='inhabilitada'?'✅ Habilitar':'🚫 Inhabilitar'}
          </button>` : ''}
      </div>
    </div>`).join('');

  const disp = salas_local.filter(s=>s.estado==='disponible').length;
  const ocup = salas_local.filter(s=>s.estado==='ocupada').length;
  const inac = salas_local.filter(s=>s.estado==='inhabilitada').length;

  setContent(`
    <div class="page-header">
      <h2>🏛️ Salas</h2>
      ${isAdmin() ? '<button class="btn btn-primary" onclick="modalCrearSala()">+ Nueva sala</button>' : ''}
    </div>
    <div class="stats-row">
      <div class="stat-card"><div class="stat-num">${disp}</div><div class="stat-label">Disponibles</div></div>
      <div class="stat-card"><div class="stat-num">${ocup}</div><div class="stat-label">Ocupadas</div></div>
      <div class="stat-card"><div class="stat-num">${inac}</div><div class="stat-label">Inhabilitadas</div></div>
      <div class="stat-card"><div class="stat-num">${salas_local.length}</div><div class="stat-label">Total</div></div>
    </div>
    <div class="cards-grid">${cards}</div>`);
}

function modalCrearSala() {
  showModal(`
    <div class="modal-header"><h3>Nueva sala</h3><button class="modal-close" onclick="closeModal()">✕</button></div>
    <form onsubmit="crearSala(event)">
      <div class="form-row">
        <div class="form-group"><label>Nombre</label><input id="s-nombre" required/></div>
        <div class="form-group"><label>Capacidad</label><input id="s-cap" type="number" min="1" required/></div>
      </div>
      <div class="form-group"><label>Tipo</label>
        <select id="s-tipo">
          <option value="laboratorio">Laboratorio</option>
          <option value="auditorio">Auditorio</option>
          <option value="coworking">Coworking</option>
          <option value="sala_reunion">Sala de reunión</option>
        </select>
      </div>
      <div class="form-group">
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
          <input type="checkbox" id="s-pcs" style="width:auto"/> Tiene computadores
        </label>
      </div>
      <button type="submit" class="btn btn-primary btn-full">Crear sala</button>
    </form>`);
}

function crearSala(e) {
  e.preventDefault();
  const nueva = {
    id: genId(salas_local),
    nombre: document.getElementById('s-nombre').value.trim(),
    capacidad: parseInt(document.getElementById('s-cap').value),
    tipo: document.getElementById('s-tipo').value,
    tiene_computadores: document.getElementById('s-pcs').checked,
    estado: 'disponible'
  };
  if (nueva.capacidad <= 0) { toast('Capacidad debe ser mayor a 0', 'error'); return; }
  salas_local.push(nueva);
  saveLocal();
  logBitacora(currentUser.nombre, 'crear_sala', 'salas', nueva.id, nueva.nombre);
  closeModal(); toast('Sala creada ✅', 'success'); salas();
}

function modalEditarSala(id) {
  const s = salas_local.find(x => x.id === id); if (!s) return;
  showModal(`
    <div class="modal-header"><h3>Editar — ${s.nombre}</h3><button class="modal-close" onclick="closeModal()">✕</button></div>
    <form onsubmit="editarSala(event,${id})">
      <div class="form-row">
        <div class="form-group"><label>Nombre</label><input id="es-nombre" value="${s.nombre}" required/></div>
        <div class="form-group"><label>Capacidad</label><input id="es-cap" type="number" value="${s.capacidad}" min="1" required/></div>
      </div>
      <div class="form-group"><label>Tipo</label>
        <select id="es-tipo">
          ${['laboratorio','auditorio','coworking','sala_reunion'].map(t =>
            `<option value="${t}" ${t===s.tipo?'selected':''}>${t.replace('_',' ')}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
          <input type="checkbox" id="es-pcs" style="width:auto" ${s.tiene_computadores?'checked':''}/> Tiene computadores
        </label>
      </div>
      <button type="submit" class="btn btn-primary btn-full">Guardar cambios</button>
    </form>`);
}

function editarSala(e, id) {
  e.preventDefault();
  const idx = salas_local.findIndex(x => x.id === id); if (idx < 0) return;
  salas_local[idx] = { ...salas_local[idx],
    nombre: document.getElementById('es-nombre').value.trim(),
    capacidad: parseInt(document.getElementById('es-cap').value),
    tipo: document.getElementById('es-tipo').value,
    tiene_computadores: document.getElementById('es-pcs').checked
  };
  saveLocal();
  logBitacora(currentUser.nombre, 'editar_sala', 'salas', id, salas_local[idx].nombre);
  closeModal(); toast('Sala actualizada ✅', 'success'); salas();
}

function toggleSalaEstado(id) {
  const sala = salas_local.find(s => s.id === id); if (!sala) return;
  sala.estado = sala.estado === 'inhabilitada' ? 'disponible' : 'inhabilitada';
  saveLocal();
  logBitacora(currentUser.nombre, `sala_${sala.estado}`, 'salas', id, sala.nombre);
  toast(`Sala "${sala.nombre}" → ${sala.estado}`, 'success');
  salas();
}

function verDisponibilidad(id, nombre) {
  const hoyStr = hoy();
  const ocup = reservas_local.filter(r =>
    r.sala_id === id && r.fecha === hoyStr && ['aprobada','en_curso'].includes(r.estado)
  );
  const filas = ocup.length
    ? ocup.map(r => `<tr><td>${r.hora_inicio}</td><td>${r.hora_fin}</td><td>${r.nombre_solicitante}</td><td>${statusBadge(r.estado)}</td></tr>`).join('')
    : `<tr><td colspan="4" style="text-align:center;color:var(--text-secondary);padding:1rem">Sin reservas para hoy ✅</td></tr>`;
  showModal(`
    <div class="modal-header"><h3>Disponibilidad hoy — ${nombre}</h3><button class="modal-close" onclick="closeModal()">✕</button></div>
    <div class="table-wrapper"><table>
      <thead><tr><th>Inicio</th><th>Fin</th><th>Solicitante</th><th>Estado</th></tr></thead>
      <tbody>${filas}</tbody>
    </table></div>`);
}

// ─────────────────────────────────────────────
// PAGE: CROQUIS
// ─────────────────────────────────────────────

function croquis() {
  setContent(`
    <div class="page-header">
      <h2>🗺️ Mapa del campus</h2>
      <a href="croquis.html" target="_blank" class="btn btn-secondary">↗ Pantalla completa</a>
    </div>
    <iframe src="croquis.html"
      style="width:100%;height:calc(100vh - 150px);border:1px solid var(--border);border-radius:12px;background:var(--surface);"
      frameborder="0"></iframe>`);
}

// ─────────────────────────────────────────────
// PAGE: RESERVAS
// ─────────────────────────────────────────────

function reservas() {
  const filas = reservas_local.map(r => {
    const sala = salas_local.find(s => s.id === r.sala_id);
    return `<tr>
      <td><code style="color:var(--secondary-accent)">${r.numero_reporte}</code></td>
      <td>${sala?.nombre || '—'}</td>
      <td>${r.nombre_solicitante}</td>
      <td>${r.fecha}<br/><small style="color:var(--text-secondary)">${r.hora_inicio}–${r.hora_fin}</small></td>
      <td>${statusBadge(r.estado)}</td>
      <td>
        ${r.estado==='pendiente' && isAdmin() ? `
          <button class="btn btn-success btn-sm" onclick="accionReserva(${r.id},'aprobada')">✓</button>
          <button class="btn btn-danger btn-sm"  onclick="accionReserva(${r.id},'rechazada')">✗</button>` : ''}
        ${r.estado==='aprobada' && isAdmin() ? `
          <button class="btn btn-info btn-sm" onclick="accionReserva(${r.id},'finalizada')">Finalizar</button>` : ''}
        ${['pendiente','aprobada'].includes(r.estado) ? `
          <button class="btn btn-secondary btn-sm" onclick="cancelarReserva(${r.id})">Cancelar</button>` : ''}
      </td>
    </tr>`;
  }).join('');

  setContent(`
    <div class="page-header">
      <h2>📅 Reservas</h2>
      <button class="btn btn-primary" onclick="modalReservarGeneral()">+ Nueva reserva</button>
    </div>
    <div class="table-wrapper"><table>
      <thead><tr><th>N° Reporte</th><th>Sala</th><th>Solicitante</th><th>Horario</th><th>Estado</th><th>Acciones</th></tr></thead>
      <tbody>${filas || '<tr><td colspan="6" style="text-align:center;padding:2rem;color:var(--text-secondary)">Sin reservas aún</td></tr>'}</tbody>
    </table></div>`);
}

function modalReservar(salaId, nombre, capacidad) {
  const hwOpts = hw_local.filter(h=>h.estado==='disponible')
    .map(h=>`<option value="${h.id}">${h.nombre} (${h.codigo_inventario})</option>`).join('');
  showModal(`
    <div class="modal-header"><h3>Reservar — ${nombre}</h3><button class="modal-close" onclick="closeModal()">✕</button></div>
    <form onsubmit="submitReserva(event,${salaId})">
      <div class="form-group"><label>Nombre del solicitante</label>
        <input id="r-nombre" value="${currentUser?.nombre||''}" required/>
      </div>
      <div class="form-group"><label>Motivo del evento</label>
        <input id="r-motivo" placeholder="Ej: Clase Python, Reunión de equipo..." required/>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Fecha</label>
          <input id="r-fecha" type="date" value="${hoy()}" min="${hoy()}" required/>
        </div>
        <div class="form-group"><label>N° asistentes (máx ${capacidad})</label>
          <input id="r-asist" type="number" min="1" max="${capacidad}" required/>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Hora inicio</label><input id="r-hinicio" type="time" required/></div>
        <div class="form-group"><label>Hora fin</label><input id="r-hfin" type="time" required/></div>
      </div>
      <div class="form-group">
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
          <input type="checkbox" id="r-hw" onchange="toggleHWSelect('hw-grp')" style="width:auto"/>
          Requiere hardware adicional
        </label>
      </div>
      <div class="form-group" id="hw-grp" style="display:none">
        <label>Seleccionar equipo</label>
        <select id="r-hwid"><option value="">-- Ninguno --</option>${hwOpts}</select>
      </div>
      <button type="submit" class="btn btn-primary btn-full">Solicitar reserva</button>
    </form>`);
}

function modalReservarGeneral() {
  const salaOpts = salas_local.filter(s=>s.estado==='disponible')
    .map(s=>`<option value="${s.id}" data-cap="${s.capacidad}">${s.nombre} (cap. ${s.capacidad})</option>`).join('');
  const hwOpts = hw_local.filter(h=>h.estado==='disponible')
    .map(h=>`<option value="${h.id}">${h.nombre} (${h.codigo_inventario})</option>`).join('');

  showModal(`
    <div class="modal-header"><h3>Nueva reserva</h3><button class="modal-close" onclick="closeModal()">✕</button></div>
    <form onsubmit="submitReservaGen(event)">
      <div class="form-group"><label>Sala</label>
        <select id="rg-sala">${salaOpts || '<option value="">Sin salas disponibles</option>'}</select>
      </div>
      <div class="form-group"><label>Solicitante</label>
        <input id="rg-nombre" value="${currentUser?.nombre||''}" required/>
      </div>
      <div class="form-group"><label>Motivo</label>
        <input id="rg-motivo" placeholder="Ej: Clase, taller, reunión..." required/>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Fecha</label>
          <input id="rg-fecha" type="date" value="${hoy()}" min="${hoy()}" required/>
        </div>
        <div class="form-group"><label>N° asistentes</label>
          <input id="rg-asist" type="number" min="1" required/>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Hora inicio</label><input id="rg-hinicio" type="time" required/></div>
        <div class="form-group"><label>Hora fin</label><input id="rg-hfin" type="time" required/></div>
      </div>
      <div class="form-group">
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
          <input type="checkbox" id="rg-hw" onchange="toggleHWSelect('hwgen-grp')" style="width:auto"/>
          Requiere hardware
        </label>
      </div>
      <div class="form-group" id="hwgen-grp" style="display:none">
        <select id="rg-hwid"><option value="">-- Seleccionar --</option>${hwOpts}</select>
      </div>
      <button type="submit" class="btn btn-primary btn-full">Solicitar reserva</button>
    </form>`);
}

function toggleHWSelect(groupId) {
  const cb = event.target;
  document.getElementById(groupId).style.display = cb.checked ? 'block' : 'none';
}

function submitReserva(e, salaId) {
  e.preventDefault();
  const sala = salas_local.find(s => s.id === salaId);
  const hinicio = document.getElementById('r-hinicio').value;
  const hfin    = document.getElementById('r-hfin').value;
  const asist   = parseInt(document.getElementById('r-asist').value);
  const fecha   = document.getElementById('r-fecha').value;

  // REGLA 1: Sala inhabilitada
  if (sala?.estado === 'inhabilitada') { toast('La sala está inhabilitada por una incidencia activa.', 'error'); return; }
  // REGLA 2: Aforo
  if (asist > sala?.capacidad) { toast(`Máximo ${sala.capacidad} asistentes para esta sala.`, 'error'); return; }
  // REGLA 3: Solapamiento
  const solape = reservas_local.find(r =>
    r.sala_id === salaId && r.fecha === fecha &&
    ['aprobada','en_curso'].includes(r.estado) &&
    !(hinicio >= r.hora_fin || hfin <= r.hora_inicio)
  );
  if (solape) { toast('Ya existe una reserva en ese horario para esta sala.', 'error'); return; }
  if (hfin <= hinicio) { toast('La hora fin debe ser mayor a la hora inicio.', 'error'); return; }

  const nueva = {
    id: genId(reservas_local),
    numero_reporte: genReporte(),
    sala_id: salaId,
    usuario_id: currentUser.id,
    nombre_solicitante: document.getElementById('r-nombre').value.trim(),
    motivo: document.getElementById('r-motivo').value.trim(),
    fecha, hora_inicio: hinicio, hora_fin: hfin,
    num_asistentes: asist,
    requiere_hardware: document.getElementById('r-hw')?.checked || false,
    hardware_id: document.getElementById('r-hwid')?.value || null,
    estado: 'pendiente',
    created_at: new Date().toLocaleString('es-CO')
  };
  reservas_local.unshift(nueva);
  saveLocal();
  closeModal();
  toast(`Reserva creada: ${nueva.numero_reporte} ✅`, 'success');
  navigateTo('reservas');
}

function submitReservaGen(e) {
  e.preventDefault();
  const salaId  = parseInt(document.getElementById('rg-sala').value);
  const sala    = salas_local.find(s => s.id === salaId);
  const hinicio = document.getElementById('rg-hinicio').value;
  const hfin    = document.getElementById('rg-hfin').value;
  const asist   = parseInt(document.getElementById('rg-asist').value);
  const fecha   = document.getElementById('rg-fecha').value;

  if (sala?.estado === 'inhabilitada') { toast('La sala está inhabilitada.', 'error'); return; }
  if (asist > sala?.capacidad) { toast(`Máximo ${sala.capacidad} asistentes para ${sala.nombre}.`, 'error'); return; }
  const solape = reservas_local.find(r =>
    r.sala_id === salaId && r.fecha === fecha &&
    ['aprobada','en_curso'].includes(r.estado) &&
    !(hinicio >= r.hora_fin || hfin <= r.hora_inicio)
  );
  if (solape) { toast('Ya existe una reserva en ese horario para esta sala.', 'error'); return; }
  if (hfin <= hinicio) { toast('La hora fin debe ser mayor a la hora inicio.', 'error'); return; }

  const nueva = {
    id: genId(reservas_local),
    numero_reporte: genReporte(),
    sala_id: salaId,
    usuario_id: currentUser.id,
    nombre_solicitante: document.getElementById('rg-nombre').value.trim(),
    motivo: document.getElementById('rg-motivo').value.trim(),
    fecha, hora_inicio: hinicio, hora_fin: hfin,
    num_asistentes: asist,
    requiere_hardware: document.getElementById('rg-hw')?.checked || false,
    hardware_id: document.getElementById('rg-hwid')?.value || null,
    estado: 'pendiente',
    created_at: new Date().toLocaleString('es-CO')
  };
  reservas_local.unshift(nueva);
  saveLocal();
  closeModal();
  toast(`Reserva creada: ${nueva.numero_reporte} ✅`, 'success');
  reservas();
}

function accionReserva(id, estado) {
  const r = reservas_local.find(x => x.id === id); if (!r) return;
  r.estado = estado;
  // Liberar sala si finaliza y no tiene hardware
  if (estado === 'finalizada' && !r.requiere_hardware) {
    const sala = salas_local.find(s => s.id === r.sala_id);
    if (sala) sala.estado = 'disponible';
  }
  saveLocal();
  logBitacora(currentUser.nombre, `reserva_${estado}`, 'reservas', id, r.numero_reporte);
  toast(`Reserva ${estado} ✅`, 'success');
  reservas();
}

function cancelarReserva(id) {
  const r = reservas_local.find(x => x.id === id); if (!r) return;
  if (!isAdmin() && r.usuario_id !== currentUser.id) { toast('No puedes cancelar una reserva que no es tuya.', 'error'); return; }
  r.estado = 'cancelada';
  saveLocal();
  toast('Reserva cancelada', 'success');
  reservas();
}

// ─────────────────────────────────────────────
// PAGE: INCIDENCIAS
// ─────────────────────────────────────────────

function incidencias() {
  const filas = incidencias_local.map(i => {
    const sala = salas_local.find(s => s.id === i.sala_id);
    return `<tr>
      <td><strong>${i.titulo}</strong><br/>
        <small style="color:var(--text-secondary)">${sala?.nombre||'—'}</small></td>
      <td>${i.reportado_por}</td>
      <td>${statusBadge(i.prioridad)}</td>
      <td>${statusBadge(i.categoria)}</td>
      <td>${statusBadge(i.estado)}</td>
      <td>
        <button class="btn btn-secondary btn-sm" onclick="verIncidencia(${i.id})">Ver análisis</button>
        ${isAdmin() && i.estado !== 'resuelta' ?
          `<button class="btn btn-success btn-sm" onclick="resolverInc(${i.id})">✓ Resolver</button>` : ''}
      </td>
    </tr>`;
  }).join('');

  setContent(`
    <div class="page-header">
      <h2>⚠️ Incidencias</h2>
      <button class="btn btn-primary" onclick="modalCrearIncidencia()">+ Reportar</button>
    </div>
    <div class="table-wrapper"><table>
      <thead><tr><th>Incidencia / Sala</th><th>Reportado por</th><th>Prioridad</th><th>Categoría</th><th>Estado</th><th>Acciones</th></tr></thead>
      <tbody>${filas || '<tr><td colspan="6" style="text-align:center;padding:2rem;color:var(--text-secondary)">Sin incidencias ✅</td></tr>'}</tbody>
    </table></div>`);
}

function modalCrearIncidencia() {
  const salaOpts = salas_local.map(s=>`<option value="${s.id}">${s.nombre}</option>`).join('');
  showModal(`
    <div class="modal-header"><h3>Reportar incidencia</h3><button class="modal-close" onclick="closeModal()">✕</button></div>
    <div class="ia-box" style="margin-bottom:1rem">
      <div class="ia-box-title">✨ Triaje automático</div>
      <p>Al guardar, el sistema clasificará la prioridad y categoría automáticamente.</p>
    </div>
    <form onsubmit="submitIncidencia(event)">
      <div class="form-group"><label>Título</label>
        <input id="i-titulo" placeholder="Ej: Proyector roto en Cosmos" required/>
      </div>
      <div class="form-group"><label>Descripción</label>
        <textarea id="i-desc" placeholder="Describe qué ocurrió y el impacto..." required></textarea>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Tu nombre</label>
          <input id="i-quien" value="${currentUser?.nombre||''}" required/>
        </div>
        <div class="form-group"><label>Sala afectada</label>
          <select id="i-sala"><option value="">-- Sin sala específica --</option>${salaOpts}</select>
        </div>
      </div>
      <button type="submit" class="btn btn-primary btn-full">⚠️ Reportar incidencia</button>
    </form>`);
}

function clasificarIncidencia(titulo, descripcion) {
  // Clasificación automática local (reglas simples, sin IA externa)
  const texto = (titulo + ' ' + descripcion).toLowerCase();
  let categoria = 'otro', prioridad = 'media', responsable = 'Soporte general';

  if (texto.match(/proyector|computador|laptop|pantalla|cable|internet|red|wifi|equipo|teclado|mouse/))
    { categoria = 'tecnologia'; responsable = 'Admin Hardware'; }
  else if (texto.match(/silla|mesa|puerta|ventana|luz|eléctric|agua|baño|instalac|daño|roto|pared/))
    { categoria = 'infraestructura'; responsable = 'Mantenimiento'; }
  else if (texto.match(/robo|seguridad|acceso|llave|alarma|emergencia/))
    { categoria = 'seguridad'; responsable = 'Seguridad'; prioridad = 'alta'; }
  else if (texto.match(/salud|bienestar|acoso|estudiante|conflicto/))
    { categoria = 'bienestar'; responsable = 'Bienestar estudiantil'; }
  else if (texto.match(/clase|horario|profesor|materia|calificacion|nota/))
    { categoria = 'academico'; responsable = 'Coordinación académica'; }

  if (texto.match(/urgente|critico|grave|inmediato|peligro|no funciona|bloqueado/)) prioridad = 'critica';
  else if (texto.match(/importante|afecta|varios|muchos|clase/)) prioridad = 'alta';
  else if (texto.match(/menor|pequeño|leve|poco/)) prioridad = 'baja';

  return { categoria, prioridad, responsable,
    analisis: `Incidencia clasificada automáticamente como "${categoria}" con prioridad "${prioridad}". Se sugiere contactar a: ${responsable}.` };
}

function submitIncidencia(e) {
  e.preventDefault();
  const titulo   = document.getElementById('i-titulo').value.trim();
  const desc     = document.getElementById('i-desc').value.trim();
  const quien    = document.getElementById('i-quien').value.trim();
  const salaVal  = document.getElementById('i-sala').value;
  const salaId   = salaVal ? parseInt(salaVal) : null;

  const analisis = clasificarIncidencia(titulo, desc);

  const nueva = {
    id: genId(incidencias_local),
    titulo, descripcion: desc,
    reportado_por: quien,
    sala_id: salaId,
    categoria: analisis.categoria,
    prioridad: analisis.prioridad,
    responsable_sugerido: analisis.responsable,
    analisis_ia: analisis.analisis,
    estado: 'abierta',
    created_at: new Date().toLocaleString('es-CO')
  };

  incidencias_local.unshift(nueva);

  // REGLA: inhabilitación automática de sala
  if (salaId) {
    const sala = salas_local.find(s => s.id === salaId);
    if (sala) sala.estado = 'inhabilitada';
  }

  saveLocal();
  closeModal();
  toast(`Incidencia registrada — Prioridad: ${analisis.prioridad.toUpperCase()} 🚨`, 'success');
  incidencias();
}

function verIncidencia(id) {
  const i = incidencias_local.find(x => x.id === id); if (!i) return;
  showModal(`
    <div class="modal-header"><h3>${i.titulo}</h3><button class="modal-close" onclick="closeModal()">✕</button></div>
    <p style="color:var(--text-secondary);font-size:.88rem;margin-bottom:1rem">${i.descripcion}</p>
    <div class="ia-box">
      <div class="ia-box-title">✨ Análisis automático</div>
      <p><strong>Categoría:</strong> ${i.categoria} &nbsp;|&nbsp; <strong>Prioridad:</strong> ${i.prioridad}</p>
      <p style="margin-top:.5rem"><strong>Responsable sugerido:</strong> ${i.responsable_sugerido||'—'}</p>
      <p style="margin-top:.75rem;color:var(--text-secondary)">${i.analisis_ia||'—'}</p>
    </div>
    <div style="margin-top:1rem;display:flex;gap:.5rem;flex-wrap:wrap">
      ${statusBadge(i.estado)} ${statusBadge(i.prioridad)}
      <span style="font-size:.8rem;color:var(--text-secondary)">${i.created_at}</span>
    </div>`);
}

function resolverInc(id) {
  const inc = incidencias_local.find(x => x.id === id); if (!inc) return;
  inc.estado = 'resuelta';
  if (inc.sala_id) {
    const sala = salas_local.find(s => s.id === inc.sala_id);
    if (sala) sala.estado = 'disponible';
  }
  saveLocal();
  logBitacora(currentUser.nombre, 'resolver_incidencia', 'incidencias', id, inc.titulo);
  toast('Incidencia resuelta y sala rehabilitada ✅', 'success');
  incidencias();
}

// ─────────────────────────────────────────────
// PAGE: HARDWARE
// ─────────────────────────────────────────────

function hardware() {
  if (!isAdmin()) return;
  const filas = hw_local.map(h => `
    <tr>
      <td>${h.nombre}</td>
      <td><code style="color:var(--secondary-accent)">${h.codigo_inventario}</code></td>
      <td>${h.tipo}</td>
      <td>${statusBadge(h.estado)}</td>
      <td>
        <select onchange="cambiarEstadoHW(${h.id},this.value)"
          style="background:var(--surface-2);border:1px solid var(--border);color:var(--text-primary);padding:.25rem .5rem;border-radius:4px;font-size:.8rem">
          ${['disponible','prestado','en_mantenimiento','dañado','dado_de_baja'].map(s=>
            `<option value="${s}" ${s===h.estado?'selected':''}>${s.replace(/_/g,' ')}</option>`).join('')}
        </select>
        <button class="btn btn-danger btn-sm" onclick="eliminarHW(${h.id})">🗑️</button>
      </td>
    </tr>`).join('');

  setContent(`
    <div class="page-header">
      <h2>💻 Hardware</h2>
      <button class="btn btn-primary" onclick="modalCrearHW()">+ Registrar equipo</button>
    </div>
    <div class="table-wrapper"><table>
      <thead><tr><th>Nombre</th><th>Código</th><th>Tipo</th><th>Estado</th><th>Acciones</th></tr></thead>
      <tbody>${filas || '<tr><td colspan="5" style="text-align:center;padding:2rem">Sin equipos</td></tr>'}</tbody>
    </table></div>`);
}

function modalCrearHW() {
  showModal(`
    <div class="modal-header"><h3>Registrar equipo</h3><button class="modal-close" onclick="closeModal()">✕</button></div>
    <form onsubmit="crearHW(event)">
      <div class="form-row">
        <div class="form-group"><label>Nombre</label><input id="hw-nombre" required/></div>
        <div class="form-group"><label>Código inventario</label><input id="hw-codigo" placeholder="LAP-010" required/></div>
      </div>
      <div class="form-group"><label>Tipo</label>
        <select id="hw-tipo">
          <option value="laptop">Laptop</option><option value="tablet">Tablet</option>
          <option value="cable_hdmi">Cable HDMI</option><option value="adaptador">Adaptador</option>
          <option value="camara">Cámara</option><option value="microfono">Micrófono</option>
          <option value="otro">Otro</option>
        </select>
      </div>
      <button type="submit" class="btn btn-primary btn-full">Registrar</button>
    </form>`);
}

function crearHW(e) {
  e.preventDefault();
  const cod = document.getElementById('hw-codigo').value.trim();
  if (hw_local.find(h=>h.codigo_inventario===cod)) { toast('Código ya existe', 'error'); return; }
  const nuevo = {
    id: genId(hw_local),
    nombre: document.getElementById('hw-nombre').value.trim(),
    tipo: document.getElementById('hw-tipo').value,
    codigo_inventario: cod,
    estado: 'disponible'
  };
  hw_local.push(nuevo);
  saveLocal();
  logBitacora(currentUser.nombre, 'crear_hardware', 'hardware', nuevo.id, nuevo.nombre);
  closeModal(); toast('Equipo registrado ✅', 'success'); hardware();
}

function cambiarEstadoHW(id, estado) {
  const h = hw_local.find(x=>x.id===id); if (!h) return;
  h.estado = estado;
  saveLocal();
  logBitacora(currentUser.nombre, `hw_${estado}`, 'hardware', id, h.nombre);
  toast('Estado actualizado', 'success');
}

function eliminarHW(id) {
  hw_local = hw_local.filter(x=>x.id!==id);
  saveLocal();
  logBitacora(currentUser.nombre, 'eliminar_hardware', 'hardware', id);
  toast('Equipo eliminado', 'success'); hardware();
}

// ─────────────────────────────────────────────
// PAGE: USUARIOS PENDIENTES
// ─────────────────────────────────────────────

function usuarios() {
  if (!isAdmin()) return;
  const pendientes = usuarios_local.filter(u => u.estado === 'pendiente');
  const filas = pendientes.map(u => `
    <tr>
      <td>${u.nombre}</td>
      <td>${u.email}</td>
      <td>${roleBadge(u.rol)}</td>
      <td>${u.created_at}</td>
      <td>
        <button class="btn btn-success btn-sm" onclick="aprobarUsuario(${u.id})">✓ Aprobar</button>
        <button class="btn btn-danger btn-sm" onclick="rechazarUsuario(${u.id})">✗ Rechazar</button>
      </td>
    </tr>`).join('');

  setContent(`
    <div class="page-header"><h2>👥 Usuarios pendientes</h2></div>
    <div class="table-wrapper"><table>
      <thead><tr><th>Nombre</th><th>Email</th><th>Rol</th><th>Fecha solicitud</th><th>Acción</th></tr></thead>
      <tbody>${filas || '<tr><td colspan="5" style="text-align:center;padding:2rem;color:var(--text-secondary)">Sin usuarios pendientes ✅</td></tr>'}</tbody>
    </table></div>`);
}

function aprobarUsuario(id) {
  const u = usuarios_local.find(x=>x.id===id); if (!u) return;
  u.estado = 'activo';
  saveLocal();
  logBitacora(currentUser.nombre, 'aprobar_usuario', 'usuarios', id, u.nombre);
  toast(`${u.nombre} aprobado ✅`, 'success'); usuarios();
}

function rechazarUsuario(id) {
  const u = usuarios_local.find(x=>x.id===id); if (!u) return;
  u.estado = 'rechazado';
  saveLocal();
  logBitacora(currentUser.nombre, 'rechazar_usuario', 'usuarios', id, u.nombre);
  toast(`${u.nombre} rechazado`, 'success'); usuarios();
}

// ─────────────────────────────────────────────
// PAGE: BITÁCORA
// ─────────────────────────────────────────────

function bitacora() {
  if (!isAdmin()) return;
  const filas = bitacora_local.map(b => `
    <tr>
      <td style="font-size:.8rem">${b.created_at}</td>
      <td><strong>${b.admin_nombre}</strong></td>
      <td><code style="color:var(--secondary-accent)">${b.accion}</code></td>
      <td style="color:var(--text-secondary)">${b.entidad||'—'} ${b.entidad_id?'#'+b.entidad_id:''}</td>
      <td style="color:var(--text-secondary);font-size:.82rem">${b.detalle||'—'}</td>
    </tr>`).join('');

  setContent(`
    <div class="page-header"><h2>📋 Bitácora de acciones</h2></div>
    <div class="table-wrapper"><table>
      <thead><tr><th>Fecha/Hora</th><th>Admin</th><th>Acción</th><th>Registro</th><th>Detalle</th></tr></thead>
      <tbody>${filas || '<tr><td colspan="5" style="text-align:center;padding:2rem;color:var(--text-secondary)">Sin acciones registradas</td></tr>'}</tbody>
    </table></div>`);
}

// ─────────────────────────────────────────────
// INIT
// ─────────────────────────────────────────────
(function init() {
  loadRolesSelect();
  const saved = localStorage.getItem('currentUser');
  if (saved) {
    try {
      currentUser = JSON.parse(saved);
      launchApp();
    } catch(e) { localStorage.removeItem('currentUser'); }
  }
})();
