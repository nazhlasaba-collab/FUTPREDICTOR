// admin.js - Panel de Administración COMPLETO con SIMULACIÓN DE PARTIDOS
import { 
    getUsers,
    updateUserChips,
    toggleUserStatus,
    updateUserRole,
    registerUserFromAdmin,
    getUserBets,
    getAllBets,
    createMatch,
    updateMatchScore,
    getMatches,
    getMatch,
    getLiveMatches,
    getDashboardStats,
    getRecentActivities,
    syncMatchesFromAPI,
    syncResultsFromAPI
} from './supabaseClient.js';

import { supabase } from './supabaseClient.js';

// Variables globales
let currentAdmin = null;
let currentMatchId = null;
let matchesList = [];
let usersList = [];
let betsList = [];
let adminProfileData = null;

// ==========================================
// INICIALIZACIÓN
// ==========================================
document.addEventListener('DOMContentLoaded', async () => {
    const session = localStorage.getItem('userSession');
    if (!session) {
        window.location.href = 'index.html';
        return;
    }
    
    const userData = JSON.parse(session);
    
    if (userData.rol !== 'admin') {
        window.location.href = 'index.html';
        return;
    }
    
    currentAdmin = userData;
    document.getElementById('adminName').textContent = userData.nombre || 'Admin';
    document.getElementById('sidebarAdminName').textContent = userData.nombre || 'Administrador';
    document.getElementById('adminAvatar').textContent = (userData.nombre?.charAt(0) || 'A').toUpperCase();
    
    await cargarDashboardStats();
    await cargarPartidos();
    await cargarUsuarios();
    await cargarApuestas();
    await cargarPartidosEnVivo();
    await cargarPartidosPendientesResultados();
    await cargarPerfilAdmin();
    
    configurarMenu();
});

function configurarMenu() {
    const menuItems = document.querySelectorAll('.admin-menu li');
    const sections = document.querySelectorAll('.admin-section');
    
    menuItems.forEach(item => {
        item.addEventListener('click', () => {
            const sectionId = item.dataset.section;
            
            menuItems.forEach(i => i.classList.remove('active'));
            item.classList.add('active');
            
            sections.forEach(section => {
                section.classList.remove('active');
                if (section.id === `${sectionId}-section`) {
                    section.classList.add('active');
                }
            });
            
            switch(sectionId) {
                case 'dashboard': cargarDashboardStats(); break;
                case 'partidos': cargarPartidos(); break;
                case 'resultados': cargarPartidosPendientesResultados(); break;
                case 'usuarios': cargarUsuarios(); break;
                case 'apuestas': cargarApuestas(); break;
                case 'envivo': cargarPartidosEnVivo(); break;
                case 'perfil': cargarPerfilAdmin(); break;
                case 'sincronizar': break;
            }
        });
    });
}

// ==========================================
// PERFIL DE ADMINISTRADOR
// ==========================================

async function cargarPerfilAdmin() {
    try {
        const session = localStorage.getItem('userSession');
        if (!session) return;
        
        const userData = JSON.parse(session);
        
        const { data, error } = await supabase
            .from('usuarios')
            .select('*')
            .eq('email', userData.email)
            .single();
        
        if (error) throw error;
        
        adminProfileData = data;
        currentAdmin = data;
        
        document.getElementById('viewNombre').textContent = data.nombre || 'No especificado';
        document.getElementById('viewEmail').textContent = data.email || 'No especificado';
        document.getElementById('viewCedula').textContent = data.cedula || 'No especificado';
        document.getElementById('viewTelefono').textContent = data.telefono || 'No especificado';
        document.getElementById('viewFichas').textContent = (data.saldo_monedas || 0) + ' fichas';
        document.getElementById('viewFechaRegistro').textContent = data.fecha_registro ? new Date(data.fecha_registro).toLocaleDateString() : 'No especificado';
        
        document.getElementById('editNombre').value = data.nombre || '';
        document.getElementById('editTelefono').value = data.telefono || '';
        document.getElementById('editPassword').value = '';
        
        const avatarElement = document.getElementById('profileAvatar');
        if (avatarElement) {
            avatarElement.textContent = (data.nombre?.charAt(0) || 'A').toUpperCase();
        }
        
        const sidebarName = document.getElementById('sidebarAdminName');
        if (sidebarName) sidebarName.textContent = data.nombre || 'Administrador';
        
        const adminNameSpan = document.getElementById('adminName');
        if (adminNameSpan) adminNameSpan.textContent = data.nombre || 'Admin';
        
        const adminAvatar = document.getElementById('adminAvatar');
        if (adminAvatar) adminAvatar.textContent = (data.nombre?.charAt(0) || 'A').toUpperCase();
        
        localStorage.setItem('userSession', JSON.stringify(data));
        
    } catch (error) {
        console.error('Error cargando perfil:', error);
        mostrarNotificacion('Error al cargar el perfil', 'error');
    }
}

window.toggleEditProfile = function() {
    const viewMode = document.getElementById('profileViewMode');
    const editMode = document.getElementById('profileEditMode');
    viewMode.style.display = 'none';
    editMode.style.display = 'block';
};

window.cancelEditProfile = function() {
    const viewMode = document.getElementById('profileViewMode');
    const editMode = document.getElementById('profileEditMode');
    document.getElementById('editNombre').value = adminProfileData?.nombre || '';
    document.getElementById('editTelefono').value = adminProfileData?.telefono || '';
    document.getElementById('editPassword').value = '';
    viewMode.style.display = 'block';
    editMode.style.display = 'none';
};

window.saveProfile = async function() {
    const nuevoNombre = document.getElementById('editNombre').value.trim();
    const nuevoTelefono = document.getElementById('editTelefono').value.trim();
    const nuevaPassword = document.getElementById('editPassword').value;
    
    if (!nuevoNombre) {
        mostrarNotificacion('El nombre no puede estar vacío', 'error');
        return;
    }
    
    try {
        const session = localStorage.getItem('userSession');
        if (!session) throw new Error('No hay sesión');
        
        const userData = JSON.parse(session);
        
        const { error: updateError } = await supabase
            .from('usuarios')
            .update({ nombre: nuevoNombre, telefono: nuevoTelefono })
            .eq('email', userData.email);
        
        if (updateError) throw updateError;
        
        if (nuevaPassword && nuevaPassword.length >= 6) {
            const { error: passwordError } = await supabase.auth.updateUser({ password: nuevaPassword });
            if (passwordError) throw passwordError;
            mostrarNotificacion('Contraseña actualizada correctamente', 'success');
        } else if (nuevaPassword && nuevaPassword.length < 6) {
            mostrarNotificacion('La contraseña debe tener al menos 6 caracteres', 'warning');
        }
        
        await cargarPerfilAdmin();
        cancelEditProfile();
        mostrarNotificacion('Perfil actualizado correctamente', 'success');
        await cargarUsuarios();
        
    } catch (error) {
        console.error('Error guardando perfil:', error);
        mostrarNotificacion('Error al guardar los cambios: ' + error.message, 'error');
    }
};

// ==========================================
// RESULTADOS Y LIQUIDACIÓN CON SIMULACIÓN
// ==========================================

async function cargarPartidosPendientesResultados() {
    try {
        const { data, error } = await supabase
            .from('enfrentamientos')
            .select('*')
            .in('estado', ['programado', 'en_vivo'])
            .order('fecha_hora', { ascending: true });
        
        if (error) throw error;
        
        const container = document.getElementById('partidosFinalizadosContainer');
        
        if (!data || data.length === 0) {
            container.innerHTML = '<div class="empty-message">📋 No hay partidos pendientes por finalizar</div>';
            return;
        }
        
        container.innerHTML = data.map(partido => `
            <div class="resultados-form" id="resultado-form-${partido.codigo}">
                <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap;">
                    <h3><i class="fas fa-futbol"></i> ${escapeHtml(partido.equipo_local)} vs ${escapeHtml(partido.equipo_visitante)}</h3>
                    <div style="display: flex; gap: 10px;">
                        <span class="badge ${partido.estado === 'en_vivo' ? 'badge-danger' : 'badge-info'}">
                            ${partido.estado === 'en_vivo' ? '🔴 EN VIVO' : '⏳ PROGRAMADO'}
                        </span>
                        <button class="btn-sm btn-info" onclick="simularResultado(${partido.codigo})" title="Generar resultado aleatorio">
                            <i class="fas fa-dice"></i> Aleatorio
                        </button>
                    </div>
                </div>
                <p><strong>📅 Fecha:</strong> ${new Date(partido.fecha_hora).toLocaleString()}</p>
                
                <div class="resultados-grid">
                    <div class="resultado-input">
                        <label><i class="fas fa-home"></i> ${escapeHtml(partido.equipo_local)}</label>
                        <input type="number" id="goles_local_${partido.codigo}" min="0" value="${partido.goles_local || 0}" class="resultado-input-number">
                    </div>
                    <div class="resultado-input">
                        <label><i class="fas fa-futbol"></i> ${escapeHtml(partido.equipo_visitante)}</label>
                        <input type="number" id="goles_visitante_${partido.codigo}" min="0" value="${partido.goles_visitante || 0}" class="resultado-input-number">
                    </div>
                </div>
                
                <div style="display: flex; gap: 10px; margin-top: 15px;">
                    <button class="btn-liquidar" onclick="liquidarPartido(${partido.codigo})">
                        <i class="fas fa-flag-checkered"></i> Finalizar y Liquidar
                    </button>
                    <button class="btn-simular" onclick="simularFinalizarPartido(${partido.codigo})">
                        <i class="fas fa-magic"></i> Simular y Finalizar
                    </button>
                </div>
                
                <div id="simulacion-preview-${partido.codigo}" class="simulacion-preview" style="display: none;"></div>
            </div>
        `).join('');
        
    } catch (error) {
        console.error('Error cargando partidos pendientes:', error);
        document.getElementById('partidosFinalizadosContainer').innerHTML = '<div class="empty-message">❌ Error cargando partidos pendientes</div>';
    }
}

// Generar resultado aleatorio realista
function generarResultadoAleatorio() {
    // Distribución más realista de goles
    const distribucion = Math.random();
    let golesLocal, golesVisitante;
    
    if (distribucion < 0.3) { // 30% empates
        const empate = Math.floor(Math.random() * 4); // 0-0, 1-1, 2-2, 3-3
        golesLocal = empate;
        golesVisitante = empate;
    } else if (distribucion < 0.65) { // 35% victoria local
        golesLocal = Math.floor(Math.random() * 4) + 1; // 1-4 goles
        golesVisitante = Math.floor(Math.random() * (golesLocal));
    } else { // 35% victoria visitante
        golesVisitante = Math.floor(Math.random() * 4) + 1;
        golesLocal = Math.floor(Math.random() * (golesVisitante));
    }
    
    return { golesLocal, golesVisitante };
}

// Simular resultado aleatorio (solo mostrar, sin finalizar)
window.simularResultado = async function(codigoPartido) {
    const previewDiv = document.getElementById(`simulacion-preview-${codigoPartido}`);
    const golesLocalInput = document.getElementById(`goles_local_${codigoPartido}`);
    const golesVisitanteInput = document.getElementById(`goles_visitante_${codigoPartido}`);
    
    previewDiv.style.display = 'block';
    previewDiv.innerHTML = `
        <div class="simulacion-card simulando">
            <i class="fas fa-spinner fa-spin"></i>
            <span>🎲 Generando resultado aleatorio...</span>
        </div>
    `;
    
    // Pequeña pausa para efecto visual
    await new Promise(resolve => setTimeout(resolve, 600));
    
    // Generar resultado aleatorio realista
    const { golesLocal, golesVisitante } = generarResultadoAleatorio();
    
    // Mostrar resultado generado
    previewDiv.innerHTML = `
        <div class="simulacion-card resultado-generado">
            <i class="fas fa-dice-d6"></i>
            <div class="resultado-generado-content">
                <strong>🎲 Resultado sugerido:</strong>
                <span class="resultado-marcador">${golesLocal} - ${golesVisitante}</span>
                <div style="display: flex; gap: 8px;">
                    <button class="btn-sm btn-success" onclick="aceptarResultadoSimulado(${codigoPartido}, ${golesLocal}, ${golesVisitante})">
                        <i class="fas fa-check"></i> Usar
                    </button>
                    <button class="btn-sm btn-info" onclick="simularResultado(${codigoPartido})">
                        <i class="fas fa-dice"></i> Generar otro
                    </button>
                </div>
            </div>
        </div>
    `;
};

// Aceptar resultado simulado
window.aceptarResultadoSimulado = function(codigoPartido, golesLocal, golesVisitante) {
    const golesLocalInput = document.getElementById(`goles_local_${codigoPartido}`);
    const golesVisitanteInput = document.getElementById(`goles_visitante_${codigoPartido}`);
    const previewDiv = document.getElementById(`simulacion-preview-${codigoPartido}`);
    
    golesLocalInput.value = golesLocal;
    golesVisitanteInput.value = golesVisitante;
    previewDiv.style.display = 'none';
    
    mostrarNotificacion(`✅ Resultado ${golesLocal} - ${golesVisitante} cargado. Haz clic en "Finalizar" para liquidar.`, 'success');
};

// Simular y finalizar partido (todo en uno)
window.simularFinalizarPartido = async function(codigoPartido) {
    if (!confirm(`🎲 ¿SIMULAR PARTIDO COMPLETO?\n\nEl sistema generará un resultado aleatorio REALISTA y liquidará automáticamente todas las apuestas.\n\n⚠️ Esta acción NO se puede deshacer.\n\n¿Deseas continuar?`)) {
        return;
    }
    
    const previewDiv = document.getElementById(`simulacion-preview-${codigoPartido}`);
    previewDiv.style.display = 'block';
    previewDiv.innerHTML = `
        <div class="simulacion-card simulando">
            <i class="fas fa-spinner fa-spin"></i>
            <span>🎲 Simulando partido...</span>
        </div>
    `;
    
    await new Promise(resolve => setTimeout(resolve, 800));
    
    const { golesLocal, golesVisitante } = generarResultadoAleatorio();
    
    previewDiv.innerHTML = `
        <div class="simulacion-card simulando">
            <i class="fas fa-futbol"></i>
            <span>📊 Resultado: ${golesLocal} - ${golesVisitante}</span>
        </div>
    `;
    
    await new Promise(resolve => setTimeout(resolve, 800));
    
    previewDiv.innerHTML = `
        <div class="simulacion-card simulando">
            <i class="fas fa-coins"></i>
            <span>💰 Liquidando apuestas...</span>
        </div>
    `;
    
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    try {
        const { data, error } = await supabase.rpc('liquidar_apuestas_partido', {
            p_partido_codigo: codigoPartido,
            p_goles_local: golesLocal,
            p_goles_visitante: golesVisitante
        });
        
        if (error) throw error;
        
        if (data && data.success) {
            previewDiv.innerHTML = `
                <div class="simulacion-card exito">
                    <i class="fas fa-check-circle"></i>
                    <div>
                        <strong>✅ PARTIDO SIMULADO Y FINALIZADO</strong>
                        <div class="resultado-stats">
                            <span>🎯 Resultado: ${golesLocal} - ${golesVisitante}</span>
                            <span>🏆 Apuestas ganadas: ${data.apuestas_ganadas || 0}</span>
                            <span>💸 Total pagado: ${(data.total_pagado_fichas || 0).toLocaleString()} fichas</span>
                        </div>
                    </div>
                </div>
            `;
            
            mostrarNotificacion(`🎲 Partido finalizado: ${golesLocal} - ${golesVisitante}`, 'success');
            mostrarNotificacion(`💰 ${data.apuestas_ganadas || 0} apuestas GANADAS - Total pagado: ${(data.total_pagado_fichas || 0).toLocaleString()} fichas`, 'success');
            
            setTimeout(async () => {
                await cargarPartidosPendientesResultados();
                await cargarPartidos();
                await cargarApuestas();
                await cargarDashboardStats();
                await cargarPartidosEnVivo();
            }, 2000);
        } else {
            throw new Error(data?.error || 'Error desconocido');
        }
        
    } catch (error) {
        console.error('Error simulando partido:', error);
        previewDiv.innerHTML = `
            <div class="simulacion-card error">
                <i class="fas fa-exclamation-triangle"></i>
                <span>❌ Error: ${error.message}</span>
            </div>
        `;
        mostrarNotificacion('Error al simular el partido: ' + error.message, 'error');
    }
};

// Liquidar partido manualmente
window.liquidarPartido = async function(codigoPartido) {
    const golesLocal = parseInt(document.getElementById(`goles_local_${codigoPartido}`).value);
    const golesVisitante = parseInt(document.getElementById(`goles_visitante_${codigoPartido}`).value);
    
    if (isNaN(golesLocal) || isNaN(golesVisitante)) {
        mostrarNotificacion('Ingresa un resultado válido', 'error');
        return;
    }
    
    if (!confirm(`⚠️ ¿Finalizar partido con resultado ${golesLocal} - ${golesVisitante}?\n\nSe liquidarán todas las apuestas.\n\nEsta acción NO se puede deshacer.`)) {
        return;
    }
    
    try {
        const { data, error } = await supabase.rpc('liquidar_apuestas_partido', {
            p_partido_codigo: codigoPartido,
            p_goles_local: golesLocal,
            p_goles_visitante: golesVisitante
        });
        
        if (error) throw error;
        
        if (data && data.success) {
            mostrarNotificacion(data.mensaje || 'Partido finalizado correctamente', 'success');
            mostrarNotificacion(`📊 ${data.apuestas_ganadas || 0} apuestas GANADAS - Total pagado: ${(data.total_pagado_fichas || 0).toLocaleString()} fichas`, 'success');
            
            await cargarPartidosPendientesResultados();
            await cargarPartidos();
            await cargarApuestas();
            await cargarDashboardStats();
            await cargarPartidosEnVivo();
        } else {
            mostrarNotificacion(data?.error || 'Error al liquidar', 'error');
        }
        
    } catch (error) {
        console.error('Error liquidando partido:', error);
        mostrarNotificacion('Error al liquidar: ' + error.message, 'error');
    }
};

// ==========================================
// DASHBOARD
// ==========================================

async function cargarDashboardStats() {
    try {
        const stats = await getDashboardStats();
        document.getElementById('totalUsuarios').textContent = stats.totalUsers || 0;
        document.getElementById('totalApuestas').textContent = stats.totalBetsToday || 0;
        document.getElementById('fichasApostadas').textContent = stats.totalChipsBet || 0;
        document.getElementById('partidosVivo').textContent = stats.liveMatches || 0;
        await cargarActividadesRecientes();
    } catch (error) {
        console.error('Error cargando estadísticas:', error);
    }
}

async function cargarActividadesRecientes() {
    try {
        const actividades = await getRecentActivities();
        const container = document.getElementById('actividadesRecientes');
        
        if (!actividades || actividades.length === 0) {
            container.innerHTML = '<div class="empty-message">No hay actividades recientes</div>';
            return;
        }
        
        container.innerHTML = `
            <div style="display: flex; flex-direction: column; gap: 12px;">
                ${actividades.map(act => `
                    <div style="padding: 12px 16px; background: var(--light); border-radius: 12px; border-left: 4px solid var(--primary);">
                        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap;">
                            <strong><i class="fas fa-user"></i> ${escapeHtml(act.usuario)}</strong>
                            <small style="color: var(--gray);"><i class="far fa-clock"></i> ${act.fecha}</small>
                        </div>
                        <div style="margin-top: 8px; color: var(--dark);">${escapeHtml(act.descripcion)}</div>
                        ${act.monto ? `<div style="margin-top: 6px; color: var(--primary); font-weight: 600;"><i class="fas fa-coins"></i> Monto: ${act.monto} fichas</div>` : ''}
                    </div>
                `).join('')}
            </div>
        `;
    } catch (error) {
        console.error('Error cargando actividades:', error);
        document.getElementById('actividadesRecientes').innerHTML = '<div class="empty-message">Error cargando actividades</div>';
    }
}

// ==========================================
// GESTIÓN DE PARTIDOS
// ==========================================

async function cargarPartidos() {
    try {
        const { data, error } = await supabase
            .from('enfrentamientos')
            .select('*')
            .order('fecha_hora', { ascending: false });
        
        if (error) throw error;
        
        const tbody = document.getElementById('tablaPartidos');
        
        if (!data || data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center"><i class="fas fa-info-circle"></i> No hay partidos registrados</td>';
            return;
        }
        
        tbody.innerHTML = '';
        
        for (const match of data) {
            const row = tbody.insertRow();
            
            const cellPartido = row.insertCell(0);
            cellPartido.innerHTML = `<strong>${escapeHtml(match.equipo_local)}</strong> vs <strong>${escapeHtml(match.equipo_visitante)}</strong>`;
            
            const cellFecha = row.insertCell(1);
            cellFecha.innerHTML = new Date(match.fecha_hora).toLocaleString();
            cellFecha.style.whiteSpace = 'nowrap';
            
            const cellEstado = row.insertCell(2);
            let estadoHtml = '';
            if (match.estado === 'programado') {
                estadoHtml = `<span class="badge badge-info"><i class="fas fa-clock"></i> Programado</span>`;
            } else if (match.estado === 'en_vivo') {
                estadoHtml = `<span class="badge badge-danger"><i class="fas fa-play-circle"></i> EN VIVO ${match.minuto_actual || 0}'</span>`;
            } else {
                estadoHtml = `<span class="badge badge-success"><i class="fas fa-check-circle"></i> Finalizado</span>`;
            }
            cellEstado.innerHTML = estadoHtml;
            cellEstado.style.textAlign = 'center';
            
            const cellResultado = row.insertCell(3);
            let resultadoHtml = '-';
            if (match.resultado_local_final !== null && match.resultado_visitante_final !== null) {
                resultadoHtml = `<strong>${match.resultado_local_final}</strong> - <strong>${match.resultado_visitante_final}</strong>`;
            } else if (match.goles_local !== null && match.goles_visitante !== null && match.estado === 'en_vivo') {
                resultadoHtml = `${match.goles_local} - ${match.goles_visitante} (Vivo)`;
            }
            cellResultado.innerHTML = resultadoHtml;
            cellResultado.style.textAlign = 'center';
            
            const cellCuotas = row.insertCell(4);
            cellCuotas.innerHTML = `
                <div class="cuotas-mini">
                    <span class="cuota-mini">🏠 ${match.cuota_local}</span>
                    <span class="cuota-mini">🤝 ${match.cuota_empate}</span>
                    <span class="cuota-mini">✈️ ${match.cuota_visitante}</span>
                </div>
            `;
            
            const cellAcciones = row.insertCell(5);
            let accionesHtml = `
                <div class="acciones-btns">
                    <button class="btn-sm btn-info" onclick="controlarPartido(${match.codigo})" title="Controlar">
                        <i class="fas fa-gamepad"></i>
                    </button>
                    <button class="btn-sm btn-warning" onclick="editarCuotas(${match.codigo})" title="Editar cuotas">
                        <i class="fas fa-chart-line"></i>
                    </button>
                    <button class="btn-sm btn-danger" onclick="eliminarPartido(${match.codigo})" title="Eliminar">
                        <i class="fas fa-trash-alt"></i>
                    </button>
            `;
            if (match.estado === 'programado') {
                accionesHtml += `<button class="btn-sm btn-success" onclick="iniciarPartido(${match.codigo})" title="Iniciar">
                                    <i class="fas fa-play"></i>
                                </button>`;
            }
            accionesHtml += `</div>`;
            cellAcciones.innerHTML = accionesHtml;
        }
        
    } catch (error) {
        console.error('Error cargando partidos:', error);
        document.getElementById('tablaPartidos').innerHTML = '<tr><td colspan="6" class="text-center">❌ Error cargando partidos</td>';
    }
}

window.mostrarFormularioPartido = function() {
    const form = document.getElementById('formularioPartido');
    form.style.display = form.style.display === 'none' ? 'block' : 'none';
    if (form.style.display === 'block') {
        const defaultDate = new Date();
        defaultDate.setHours(defaultDate.getHours() + 2);
        document.getElementById('fechaHora').value = defaultDate.toISOString().slice(0, 16);
    }
};

window.ocultarFormularioPartido = function() {
    document.getElementById('formularioPartido').style.display = 'none';
};

document.getElementById('nuevoPartidoForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const partidoData = {
        local: document.getElementById('equipoLocal').value,
        visitante: document.getElementById('equipoVisitante').value,
        fecha: document.getElementById('fechaHora').value,
        cuotaLocal: parseFloat(document.getElementById('cuotaLocal').value),
        cuotaEmpate: parseFloat(document.getElementById('cuotaEmpate').value),
        cuotaVisitante: parseFloat(document.getElementById('cuotaVisitante').value)
    };
    
    try {
        await createMatch(partidoData);
        mostrarNotificacion('✅ Partido creado exitosamente', 'success');
        ocultarFormularioPartido();
        document.getElementById('nuevoPartidoForm').reset();
        await cargarPartidos();
        await cargarPartidosEnVivo();
        await cargarPartidosPendientesResultados();
    } catch (error) {
        console.error('Error creando partido:', error);
        mostrarNotificacion('Error al crear el partido', 'error');
    }
});

window.controlarPartido = async function(matchId) {
    currentMatchId = matchId;
    const modal = document.getElementById('controlPartidoModal');
    
    try {
        const { data: match, error } = await supabase
            .from('enfrentamientos')
            .select('*')
            .eq('codigo', matchId)
            .single();
            
        if (error) throw error;
        
        if (!match) { 
            mostrarNotificacion('No se encontró el partido', 'error');
            return; 
        }
        
        document.getElementById('partidoControlInfo').innerHTML = `
            <div style="text-align: center; margin-bottom: 20px;">
                <h3>${escapeHtml(match.equipo_local)} vs ${escapeHtml(match.equipo_visitante)}</h3>
                <span class="badge ${match.estado === 'en_vivo' ? 'badge-danger' : 'badge-info'}">${match.estado === 'en_vivo' ? '🔴 EN VIVO' : '⏳ PROGRAMADO'}</span>
            </div>
        `;
        document.getElementById('nombreLocal').innerHTML = `<strong>🏠 ${escapeHtml(match.equipo_local)}</strong>`;
        document.getElementById('nombreVisitante').innerHTML = `<strong>✈️ ${escapeHtml(match.equipo_visitante)}</strong>`;
        
        document.getElementById('golesLocal').value = match.goles_local || 0;
        document.getElementById('golesVisitante').value = match.goles_visitante || 0;
        document.getElementById('minutoActual').value = match.minuto_actual || 1;
        
        modal.style.display = 'flex';
    } catch (error) {
        console.error('Error cargando partido:', error);
        mostrarNotificacion('Error al cargar los datos del partido', 'error');
    }
};

window.iniciarPartido = async function(matchId) {
    if (confirm('¿Estás seguro de iniciar este partido?')) {
        try {
            await updateMatchScore(matchId, 0, 0, 1, 'en_vivo');
            mostrarNotificacion('✅ Partido iniciado correctamente', 'success');
            await cargarPartidos();
            await cargarPartidosEnVivo();
            await cargarPartidosPendientesResultados();
        } catch (error) {
            console.error('Error iniciando partido:', error);
            mostrarNotificacion('Error al iniciar el partido', 'error');
        }
    }
};

window.actualizarMarcador = async function() {
    if (!currentMatchId) return;
    
    const golesLocal = parseInt(document.getElementById('golesLocal').value) || 0;
    const golesVisitante = parseInt(document.getElementById('golesVisitante').value) || 0;
    const minuto = parseInt(document.getElementById('minutoActual').value) || 1;
    
    try {
        await updateMatchScore(currentMatchId, golesLocal, golesVisitante, minuto, 'en_vivo');
        mostrarNotificacion('✅ Marcador actualizado correctamente', 'success');
        await cargarPartidos();
        await cargarPartidosEnVivo();
        await cargarPartidosPendientesResultados();
    } catch (error) {
        console.error('Error actualizando marcador:', error);
        mostrarNotificacion('Error al actualizar el marcador', 'error');
    }
};

window.finalizarPartido = async function() {
    if (!currentMatchId) return;
    
    const golesLocal = parseInt(document.getElementById('golesLocal').value) || 0;
    const golesVisitante = parseInt(document.getElementById('golesVisitante').value) || 0;
    
    if (confirm(`¿Finalizar partido con resultado ${golesLocal} - ${golesVisitante}?`)) {
        try {
            const { data, error } = await supabase.rpc('liquidar_apuestas_partido', {
                p_partido_codigo: currentMatchId,
                p_goles_local: golesLocal,
                p_goles_visitante: golesVisitante
            });
            
            if (error) throw error;
            
            if (data && data.success) {
                mostrarNotificacion(data.mensaje || 'Partido finalizado', 'success');
                cerrarModalControl();
                await cargarPartidos();
                await cargarPartidosEnVivo();
                await cargarPartidosPendientesResultados();
                await cargarDashboardStats();
                await cargarApuestas();
            } else {
                mostrarNotificacion(data?.error || 'Error al finalizar', 'error');
            }
        } catch (error) {
            console.error('Error finalizando partido:', error);
            mostrarNotificacion('Error al finalizar el partido', 'error');
        }
    }
};

window.editarCuotas = async function(matchId) {
    const nuevasCuotas = prompt('Ingresa las nuevas cuotas en formato: Local,Empate,Visitante\nEjemplo: 2.10,3.20,2.80');
    
    if (nuevasCuotas) {
        const cuotas = nuevasCuotas.split(',').map(Number);
        if (cuotas.length === 3 && cuotas.every(c => !isNaN(c) && c >= 1)) {
            try {
                const { error } = await supabase
                    .from('enfrentamientos')
                    .update({
                        cuota_local: cuotas[0],
                        cuota_empate: cuotas[1],
                        cuota_visitante: cuotas[2]
                    })
                    .eq('codigo', matchId);
                
                if (error) throw error;
                mostrarNotificacion('✅ Cuotas actualizadas', 'success');
                await cargarPartidos();
            } catch (error) {
                console.error('Error actualizando cuotas:', error);
                mostrarNotificacion('Error al actualizar las cuotas', 'error');
            }
        } else {
            mostrarNotificacion('Formato inválido', 'error');
        }
    }
};

window.eliminarPartido = async function(matchId) {
    if (confirm('¿Eliminar este partido? Esta acción no se puede deshacer.')) {
        try {
            const { error } = await supabase.from('enfrentamientos').delete().eq('codigo', matchId);
            if (error) throw error;
            mostrarNotificacion('✅ Partido eliminado', 'success');
            await cargarPartidos();
            await cargarPartidosEnVivo();
            await cargarPartidosPendientesResultados();
        } catch (error) {
            console.error('Error eliminando partido:', error);
            mostrarNotificacion('Error al eliminar el partido', 'error');
        }
    }
};

// ==========================================
// PARTIDOS EN VIVO// ==========================================

async function cargarPartidosEnVivo() {
    try {
        const { data, error } = await supabase
            .from('enfrentamientos')
            .select('*')
            .eq('estado', 'en_vivo')
            .order('fecha_hora', { ascending: true });
        
        if (error) throw error;
        
        const container = document.getElementById('partidosEnVivoAdmin');
        
        if (!data || data.length === 0) {
            container.innerHTML = '<div class="empty-message">📺 No hay partidos en vivo</div>';
            return;
        }
        
        container.innerHTML = `
            <div style="display: grid; gap: 20px;">
                ${data.map(match => `
                    <div class="live-match-control">
                        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap;">
                            <div>
                                <h3>${escapeHtml(match.equipo_local)} vs ${escapeHtml(match.equipo_visitante)}</h3>
                                <p><i class="fas fa-clock"></i> Minuto ${match.minuto_actual || 0}'</p>
                                <div class="resultado-vivo-grande">
                                    <span class="resultado-numero">${match.goles_local || 0}</span>
                                    <span class="resultado-separador">-</span>
                                    <span class="resultado-numero">${match.goles_visitante || 0}</span>
                                </div>
                            </div>
                            <div>
                                <button class="btn-info" onclick="controlarPartido(${match.codigo})">
                                    <i class="fas fa-edit"></i> Controlar
                                </button>
                            </div>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    } catch (error) {
        console.error('Error cargando partidos en vivo:', error);
        document.getElementById('partidosEnVivoAdmin').innerHTML = '<div class="empty-message">❌ Error</div>';
    }
}

// ==========================================
// GESTIÓN DE USUARIOS
// ==========================================

async function cargarUsuarios() {
    try {
        const { data, error } = await supabase
            .from('usuarios')
            .select('*')
            .order('nombre', { ascending: true });
        
        if (error) throw error;
        
        usersList = data || [];
        const tbody = document.getElementById('tablaUsuarios');
        
        if (!usersList || usersList.length === 0) {
            tbody.innerHTML = '<td><td colspan="6" class="text-center">No hay usuarios</td>';
            return;
        }
        
        tbody.innerHTML = '';
        
        for (const user of usersList) {
            const row = tbody.insertRow();
            
            const cellUsuario = row.insertCell(0);
            cellUsuario.innerHTML = `<strong>${escapeHtml(user.nombre || user.email?.split('@')[0])}</strong>`;
            
            const cellEmail = row.insertCell(1);
            cellEmail.innerHTML = user.email;
            
            const cellRol = row.insertCell(2);
            cellRol.innerHTML = user.rol === 'admin' 
                ? '<span class="badge badge-danger">Admin</span>'
                : '<span class="badge badge-info">Usuario</span>';
            cellRol.style.textAlign = 'center';
            
            const cellFichas = row.insertCell(3);
            cellFichas.innerHTML = `<i class="fas fa-coins"></i> ${(user.saldo_monedas || 0).toLocaleString()}`;
            cellFichas.style.textAlign = 'center';
            
            const cellEstado = row.insertCell(4);
            cellEstado.innerHTML = user.activo !== false
                ? '<span class="badge badge-success">Activo</span>'
                : '<span class="badge badge-danger">Bloqueado</span>';
            cellEstado.style.textAlign = 'center';
            
            const cellAcciones = row.insertCell(5);
            cellAcciones.innerHTML = `
                <div class="acciones-usuario">
                    <input type="number" id="chips_${user.cedula}" value="0" placeholder="Cantidad" class="input-fichas" style="width: 70px;">
                    <button class="btn-sm btn-success" onclick="agregarFichas('${user.cedula}')" title="Agregar"><i class="fas fa-plus"></i></button>
                    <button class="btn-sm btn-warning" onclick="quitarFichas('${user.cedula}')" title="Quitar"><i class="fas fa-minus"></i></button>
                    <button class="btn-sm btn-info" onclick="verApuestasUsuario('${user.cedula}')" title="Ver apuestas"><i class="fas fa-ticket-alt"></i></button>
                    <button class="btn-sm ${user.activo !== false ? 'btn-danger' : 'btn-success'}" onclick="toggleUserStatusHandler('${user.cedula}')" title="${user.activo !== false ? 'Bloquear' : 'Activar'}">
                        <i class="fas ${user.activo !== false ? 'fa-ban' : 'fa-check'}"></i>
                    </button>
                </div>
            `;
        }
        
    } catch (error) {
        console.error('Error cargando usuarios:', error);
        document.getElementById('tablaUsuarios').innerHTML = '<td><td colspan="6" class="text-center">Error</td>';
    }
}

window.mostrarFormularioRegistro = function() {
    const form = document.getElementById('formularioRegistro');
    form.style.display = form.style.display === 'none' ? 'block' : 'none';
};

window.ocultarFormularioRegistro = function() {
    document.getElementById('formularioRegistro').style.display = 'none';
};

document.getElementById('nuevoUsuarioForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const userData = {
        nombre: document.getElementById('regNombre').value.trim(),
        email: document.getElementById('regEmail').value.trim(),
        password: document.getElementById('regPassword').value,
        rol: document.getElementById('regRol').value,
        fichas: parseInt(document.getElementById('regFichas').value) || 1000,
        telefono: document.getElementById('regTelefono').value.trim() || '0000000000'
    };
    
    if (!userData.nombre || !userData.email || !userData.password) {
        mostrarNotificacion('Complete todos los campos', 'error');
        return;
    }
    
    if (userData.password.length < 6) {
        mostrarNotificacion('La contraseña debe tener al menos 6 caracteres', 'error');
        return;
    }
    
    try {
        const resultado = await registerUserFromAdmin(userData);
        if (resultado.success) {
            mostrarNotificacion(`✅ ${userData.nombre} registrado exitosamente`, 'success');
            ocultarFormularioRegistro();
            await cargarUsuarios();
            await cargarDashboardStats();
        } else {
            mostrarNotificacion(`Error: ${resultado.error}`, 'error');
        }
    } catch (error) {
        mostrarNotificacion('Error al registrar: ' + error.message, 'error');
    }
});

window.agregarFichas = async function(userId) {
    const input = document.getElementById(`chips_${userId}`);
    const cantidad = parseInt(input.value);
    if (!cantidad || cantidad <= 0) {
        mostrarNotificacion('Ingrese una cantidad válida', 'error');
        return;
    }
    
    if (confirm(`¿Agregar ${cantidad} fichas?`)) {
        try {
            const user = usersList.find(u => u.cedula === userId);
            const nuevasFichas = (user.saldo_monedas || 0) + cantidad;
            await updateUserChips(userId, nuevasFichas);
            mostrarNotificacion(`✅ Se agregaron ${cantidad} fichas`, 'success');
            input.value = 0;
            await cargarUsuarios();
            await cargarDashboardStats();
        } catch (error) {
            mostrarNotificacion('Error al agregar fichas', 'error');
        }
    }
};

window.quitarFichas = async function(userId) {
    const input = document.getElementById(`chips_${userId}`);
    const cantidad = parseInt(input.value);
    if (!cantidad || cantidad <= 0) {
        mostrarNotificacion('Ingrese una cantidad válida', 'error');
        return;
    }
    
    if (confirm(`¿Quitar ${cantidad} fichas?`)) {
        try {
            const user = usersList.find(u => u.cedula === userId);
            const nuevasFichas = Math.max(0, (user.saldo_monedas || 0) - cantidad);
            await updateUserChips(userId, nuevasFichas);
            mostrarNotificacion(`✅ Se quitaron ${cantidad} fichas`, 'success');
            input.value = 0;
            await cargarUsuarios();
            await cargarDashboardStats();
        } catch (error) {
            mostrarNotificacion('Error al quitar fichas', 'error');
        }
    }
};

window.toggleUserStatusHandler = async function(userId) {
    const user = usersList.find(u => u.cedula === userId);
    const newStatus = user.activo !== false ? false : true;
    const action = newStatus ? 'activar' : 'bloquear';
    
    if (confirm(`¿${action} este usuario?`)) {
        try {
            await toggleUserStatus(userId, newStatus);
            mostrarNotificacion(`✅ Usuario ${action}do`, 'success');
            await cargarUsuarios();
            await cargarDashboardStats();
        } catch (error) {
            mostrarNotificacion('Error al cambiar estado', 'error');
        }
    }
};

window.verApuestasUsuario = async function(userId) {
    try {
        const user = usersList.find(u => u.cedula === userId);
        const { data: apuestas, error } = await supabase
            .from('apuestas')
            .select(`*, enfrentamientos(*)`)
            .eq('cedula_usuario', userId)
            .order('fecha_apuesta', { ascending: false });
        
        if (error) throw error;
        
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.style.display = 'flex';
        modal.innerHTML = `
            <div class="modal-content modal-large">
                <div class="modal-header">
                    <h3>Apuestas de ${escapeHtml(user.nombre || user.email)}</h3>
                    <button class="close-btn" onclick="this.closest('.modal').remove()">&times;</button>
                </div>
                <div class="modal-body">
                    ${apuestas && apuestas.length > 0 ? `
                        <table class="modern-table">
                            <thead>
                                <tr><th>Partido</th><th>Selección</th><th>Monto</th><th>Estado</th></tr>
                            </thead>
                            <tbody>
                                ${apuestas.map(bet => `
                                    <tr>
                                        <td>${escapeHtml(bet.enfrentamientos?.equipo_local || '?')} vs ${escapeHtml(bet.enfrentamientos?.equipo_visitante || '?')}</td>
                                        <td>${bet.seleccion === 'local' ? '🏠 Local' : bet.seleccion === 'visitante' ? '✈️ Visitante' : '🤝 Empate'}</td>
                                        <td>${bet.monto_apostado} 🪙</td>
                                        <td><span class="badge ${bet.estado === 'ganada' ? 'badge-success' : bet.estado === 'perdida' ? 'badge-danger' : 'badge-info'}">${bet.estado || 'Activa'}</span></td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    ` : '<div class="empty-message">No hay apuestas</div>'}
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
    } catch (error) {
        mostrarNotificacion('Error al cargar apuestas', 'error');
    }
};

// ==========================================
// APUESTAS
// ==========================================

async function cargarApuestas() {
    try {
        const { data, error } = await supabase
            .from('apuestas')
            .select(`*, usuarios(nombre, email), enfrentamientos(equipo_local, equipo_visitante)`)
            .order('fecha_apuesta', { ascending: false })
            .limit(100);
        
        if (error) throw error;
        
        const tbody = document.getElementById('tablaApuestas');
        
        if (!data || data.length === 0) {
            tbody.innerHTML = '<td><td colspan="7" class="text-center">No hay apuestas</td>';
            return;
        }
        
        tbody.innerHTML = '';
        
        for (const bet of data) {
            const row = tbody.insertRow();
            
            row.insertCell(0).innerHTML = bet.usuarios?.nombre || bet.usuarios?.email || 'N/A';
            row.insertCell(1).innerHTML = `${bet.enfrentamientos?.equipo_local || '?'} vs ${bet.enfrentamientos?.equipo_visitante || '?'}`;
            row.insertCell(2).innerHTML = bet.seleccion === 'local' ? '🏠 Local' : bet.seleccion === 'visitante' ? '✈️ Visitante' : '🤝 Empate';
            row.insertCell(3).innerHTML = `${bet.monto_apostado} 🪙`;
            row.insertCell(4).innerHTML = bet.cuota_aplicada;
            
            const cellGanancia = row.insertCell(5);
            let gananciaColor = '#666';
            let gananciaTexto = `${bet.monto_pagado || 0} 🪙`;
            if (bet.estado === 'ganada') {
                gananciaColor = '#2ecc71';
                gananciaTexto = `+${bet.monto_pagado || 0} 🪙`;
            } else if (bet.estado === 'perdida') {
                gananciaColor = '#e74c3c';
                gananciaTexto = `-${bet.monto_apostado} 🪙`;
            } else if (bet.estado === 'completado') {
                gananciaColor = '#f39c12';
                gananciaTexto = '⏳ Pendiente';
            }
            cellGanancia.innerHTML = `<span style="color: ${gananciaColor}; font-weight: bold;">${gananciaTexto}</span>`;
            cellGanancia.style.textAlign = 'center';
            
            const cellEstado = row.insertCell(6);
            let estadoHtml = '';
            if (bet.estado === 'completado') estadoHtml = '<span class="badge badge-info">Activa</span>';
            else if (bet.estado === 'ganada') estadoHtml = '<span class="badge badge-success">Ganada</span>';
            else if (bet.estado === 'perdida') estadoHtml = '<span class="badge badge-danger">Perdida</span>';
            else estadoHtml = '<span class="badge badge-warning">Pendiente</span>';
            cellEstado.innerHTML = estadoHtml;
            cellEstado.style.textAlign = 'center';
        }
        
    } catch (error) {
        console.error('Error cargando apuestas:', error);
        document.getElementById('tablaApuestas').innerHTML = '<tr><td colspan="7" class="text-center">Error</td>';
    }
}

// ==========================================
// SINCRONIZACIÓN API
// ==========================================

window.sincronizarPartidos = async function() {
    const btn = document.querySelector('#sincronizar-section .btn-success');
    const originalText = btn.innerHTML;
    const syncDiv = document.getElementById('resultadoSync');
    
    try {
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sincronizando...';
        btn.disabled = true;
        
        syncDiv.innerHTML = '<div class="sync-status info">Conectando con la API...</div>';
        
        const resultado = await syncMatchesFromAPI();
        
        if (resultado.success) {
            syncDiv.innerHTML = `
                <div class="sync-status success">
                    <i class="fas fa-check-circle"></i> ${resultado.mensaje}
                    ${resultado.nuevos ? `<br>📅 Nuevos: ${resultado.nuevos}` : ''}
                </div>
            `;
            document.getElementById('ultimaSync').textContent = new Date().toLocaleString();
            await cargarPartidos();
            mostrarNotificacion(resultado.mensaje, 'success');
        } else {
            throw new Error(resultado.mensaje);
        }
        
    } catch (error) {
        syncDiv.innerHTML = `<div class="sync-status error">Error: ${error.message}</div>`;
        mostrarNotificacion('Error al sincronizar', 'error');
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
};

window.sincronizarResultados = async function() {
    const btn = document.querySelector('#sincronizar-section .btn-info');
    const originalText = btn.innerHTML;
    const syncDiv = document.getElementById('resultadoSync');
    
    try {
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Actualizando...';
        btn.disabled = true;
        
        const resultado = await syncResultsFromAPI();
        
        if (resultado.success) {
            syncDiv.innerHTML = `<div class="sync-status success">${resultado.mensaje}</div>`;
            await cargarPartidos();
            await cargarPartidosPendientesResultados();
            mostrarNotificacion(resultado.mensaje, 'success');
        } else {
            throw new Error(resultado.mensaje);
        }
        
    } catch (error) {
        syncDiv.innerHTML = `<div class="sync-status error">Error: ${error.message}</div>`;
        mostrarNotificacion('Error al actualizar', 'error');
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
};

// ==========================================
// FUNCIONES AUXILIARES
// ==========================================

window.cerrarModalControl = function() {
    document.getElementById('controlPartidoModal').style.display = 'none';
    currentMatchId = null;
};

window.onclick = function(event) {
    const modal = document.getElementById('controlPartidoModal');
    if (event.target === modal) cerrarModalControl();
};

window.logout = async function() {
    if (confirm('¿Cerrar sesión?')) {
        localStorage.removeItem('userSession');
        window.location.href = 'index.html';
    }
};

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}

function mostrarNotificacion(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.innerHTML = `<i class="fas ${type === 'success' ? 'fa-check-circle' : type === 'error' ? 'fa-exclamation-circle' : 'fa-info-circle'}"></i> ${message}`;
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 14px 20px;
        background: ${type === 'success' ? '#2ecc71' : type === 'error' ? '#e74c3c' : '#3498db'};
        color: white;
        border-radius: 12px;
        z-index: 10000;
        animation: slideIn 0.3s ease;
        box-shadow: 0 4px 15px rgba(0,0,0,0.2);
        font-weight: 500;
    `;
    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 4000);
}

// Agregar estilos adicionales
if (!document.querySelector('#adminExtraStyles')) {
    const style = document.createElement('style');
    style.id = 'adminExtraStyles';
    style.textContent = `
        @keyframes slideIn {
            from { transform: translateX(100%); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
        }
        
        .resultados-form {
            background: var(--light);
            padding: 24px;
            border-radius: var(--border-radius);
            margin-bottom: 28px;
            border: 1px solid var(--gray-light);
        }
        
        .resultados-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 24px;
            margin: 20px 0;
        }
        
        .resultado-input-number {
            font-size: 2em;
            text-align: center;
            width: 120px;
            padding: 10px;
            border: 2px solid var(--gray-light);
            border-radius: 10px;
            margin: 0 auto;
            display: block;
        }
        
        .btn-liquidar {
            background: linear-gradient(135deg, #2ecc71, #27ae60);
            color: white;
            border: none;
            padding: 12px 24px;
            border-radius: 8px;
            cursor: pointer;
            font-weight: 600;
            flex: 1;
        }
        
        .btn-simular {
            background: linear-gradient(135deg, #667eea, #764ba2);
            color: white;
            border: none;
            padding: 12px 24px;
            border-radius: 8px;
            cursor: pointer;
            font-weight: 600;
            flex: 1;
        }
        
        .btn-sm {
            padding: 6px 12px;
            font-size: 0.8rem;
            border: none;
            border-radius: 6px;
            cursor: pointer;
        }
        
        .simulacion-preview {
            margin-top: 15px;
        }
        
        .simulacion-card {
            background: linear-gradient(135deg, #667eea15, #764ba215);
            border-radius: 12px;
            padding: 15px;
            border: 1px solid #667eea30;
        }
        
        .simulacion-card.simulando {
            background: #d1ecf1;
            border-color: #17a2b8;
            color: #0c5460;
        }
        
        .simulacion-card.exito {
            background: #d4edda;
            border-color: #28a745;
            color: #155724;
        }
        
        .simulacion-card.error {
            background: #f8d7da;
            border-color: #dc3545;
            color: #721c24;
        }
        
        .resultado-generado-content {
            display: flex;
            align-items: center;
            gap: 15px;
            flex-wrap: wrap;
        }
        
        .resultado-marcador {
            font-size: 1.3rem;
            font-weight: bold;
            color: var(--primary);
            background: white;
            padding: 4px 12px;
            border-radius: 20px;
        }
        
        .resultado-stats {
            display: flex;
            flex-direction: column;
            gap: 5px;
            margin-top: 8px;
        }
        
        .cuotas-mini {
            display: flex;
            gap: 8px;
            justify-content: center;
        }
        
        .cuota-mini {
            background: rgba(0,184,148,0.1);
            padding: 4px 8px;
            border-radius: 20px;
            font-size: 0.8em;
            font-weight: 600;
            color: #00b894;
        }
        
        .acciones-btns {
            display: flex;
            gap: 5px;
            justify-content: center;
        }
        
        .resultado-vivo-grande {
            font-size: 2em;
            font-weight: 800;
            display: flex;
            align-items: center;
            gap: 20px;
            margin-top: 10px;
        }
        
        .resultado-numero {
            background: #2c3e50;
            color: white;
            padding: 8px 20px;
            border-radius: 12px;
            min-width: 80px;
            text-align: center;
        }
        
        .resultado-separador {
            font-size: 1.5em;
            color: #e74c3c;
        }
        
        @media (max-width: 768px) {
            .resultados-grid {
                grid-template-columns: 1fr;
            }
            .resultado-input-number {
                width: 100px;
                font-size: 1.5em;
            }
        }
    `;
    document.head.appendChild(style);
}