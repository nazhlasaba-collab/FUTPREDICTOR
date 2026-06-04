// dashboard.js - Panel de Usuario COMPLETO con Carrusel y Retiros Automáticos
import { 
    supabase,
    getCurrentUser,
    getPartidosDisponibles,
    getPartidosEnVivo,
    getApuestasUsuario,
    realizarApuesta,
    cancelarApuesta
} from './supabaseClient.js';

// ==========================================
// CONFIGURACIÓN
// ==========================================
const VALOR_FICHA_BS = 100;
let currentUser = null;
let partidoSeleccionado = null;
let partidoActual = null;
let intervalosActivos = [];
let procesandoRetiro = false;
let ultimoRetiroTimestamp = 0;

// ==========================================
// IMÁGENES DE FÚTBOL PARA EL CARRUSEL
// ==========================================
const IMAGENES_FUTBOL = [
    'carrusel/loquesea.jpg',
    'carrusel/futbol1.jpg',
    'carrusel/nose.jpg',
    'carrusel/pelota.jpg',
    'carrusel/pelota2.jpg',
    'carrusel/pelota3.jpg',
    'carrusel/mundial.jpg',
    'carrusel/mundial1.jpg',
];

// ==========================================
// LISTA DE JUGADORES CON IMÁGENES
// ==========================================
const AVATARES_PREDETERMINADOS = [
    { id: 'messi', nombre: 'Lionel Messi', archivo: 'messi.png' },
    { id: 'ronaldo', nombre: 'Cristiano Ronaldo', archivo: 'ronaldo.png' },
    { id: 'neymar', nombre: 'Neymar Jr', archivo: 'neymar.png' },
    { id: 'mbappe', nombre: 'Kylian Mbappé', archivo: 'mbappe.png' },
    { id: 'haaland', nombre: 'Erling Haaland', archivo: 'haaland.png' },
    { id: 'vinicius', nombre: 'Vinícius Jr', archivo: 'vinicius.png' },
    { id: 'modric', nombre: 'Luka Modrić', archivo: 'modric.png' },
    { id: 'bellingham', nombre: 'Jude Bellingham', archivo: 'bellingham.png' },
    { id: 'salah', nombre: 'Mohamed Salah', archivo: 'salah.png' },
    { id: 'lewandowski', nombre: 'Robert Lewandowski', archivo: 'lewandowski.png' },
    { id: 'pedri', nombre: 'Pedri González', archivo: 'pedri.png' },
    { id: 'valverde', nombre: 'Fede Valverde', archivo: 'valverde.png' }
];

const RUTA_AVATARES = 'avatares/';
const AVATAR_DEFAULT = RUTA_AVATARES + 'avatar-default.png';

// ==========================================
// INICIALIZACIÓN
// ==========================================
document.addEventListener('DOMContentLoaded', async () => {
    const session = localStorage.getItem('userSession');
    if (!session) {
        window.location.href = 'index.html';
        return;
    }
    
    try {
        // Limpiar intervalos anteriores
        intervalosActivos.forEach(interval => clearInterval(interval));
        intervalosActivos = [];
        
        currentUser = JSON.parse(session);
        
        const user = await getCurrentUser();
        if (user) {
            currentUser = user;
            localStorage.setItem('userSession', JSON.stringify(user));
        }
        
        document.getElementById('userName').textContent = currentUser.nombre || 'Usuario';
        document.getElementById('sidebarUserName').textContent = currentUser.nombre || 'Usuario';
        
        await cargarAvatarUsuario();
        await actualizarFichas();
        await cargarTodosLosPartidos();
        await cargarApuestasActivas();
        await cargarPerfil();
        
        configurarMenu();
        configurarEventos();
        configurarFormulariosPagos();
        
        // Actualizar saldo cada 30 segundos
        intervalosActivos.push(setInterval(async () => {
            await actualizarSaldoEnTiempoReal();
        }, 30000));
        
        // Verificar resultados de apuestas cada 30 segundos
        intervalosActivos.push(setInterval(async () => {
            await verificarResultadosApuestas();
        }, 30000));
        
        // Verificar inmediatamente al cargar
        await verificarResultadosApuestas();
        
    } catch (error) {
        console.error('Error en inicialización:', error);
        mostrarNotificacion('Error al cargar datos', 'error');
    }
});

// ==========================================
// CONFIGURAR FORMULARIOS DE PAGOS
// ==========================================
function configurarFormulariosPagos() {
    const formDeposito = document.getElementById('formDeposito');
    if (formDeposito) {
        formDeposito.removeEventListener('submit', registrarDeposito);
        formDeposito.addEventListener('submit', registrarDeposito);
    }
    
    const formRetiro = document.getElementById('formRetiro');
    if (formRetiro) {
        formRetiro.removeEventListener('submit', registrarRetiro);
        formRetiro.addEventListener('submit', registrarRetiro);
    }
    
    const montoDeposito = document.getElementById('montoDeposito');
    if (montoDeposito) {
        montoDeposito.removeEventListener('input', calcularTotalDeposito);
        montoDeposito.addEventListener('input', calcularTotalDeposito);
        calcularTotalDeposito();
    }
    
    const montoRetiro = document.getElementById('montoRetiro');
    if (montoRetiro) {
        montoRetiro.removeEventListener('input', calcularTotalRetiro);
        montoRetiro.addEventListener('input', calcularTotalRetiro);
        calcularTotalRetiro();
    }
    
    const camposRetiro = ['bancoRetiro', 'numeroCuentaRetiro'];
    camposRetiro.forEach(id => {
        const campo = document.getElementById(id);
        if (campo) {
            campo.removeEventListener('change', actualizarResumenRetiro);
            campo.removeEventListener('input', actualizarResumenRetiro);
            campo.addEventListener('change', actualizarResumenRetiro);
            campo.addEventListener('input', actualizarResumenRetiro);
        }
    });
}

function calcularTotalDeposito() {
    const fichas = parseInt(document.getElementById('montoDeposito')?.value) || 0;
    const totalBs = fichas * VALOR_FICHA_BS;
    const totalBsSpan = document.getElementById('totalBsDeposito');
    if (totalBsSpan) totalBsSpan.textContent = totalBs.toFixed(2);
}

function calcularTotalRetiro() {
    const fichas = parseInt(document.getElementById('montoRetiro')?.value) || 0;
    const totalBs = fichas * VALOR_FICHA_BS;
    const totalBsSpan = document.getElementById('totalBsRetiro');
    if (totalBsSpan) totalBsSpan.textContent = totalBs.toFixed(2);
    
    const resumenFichas = document.getElementById('resumenFichas');
    const resumenTotalBs = document.getElementById('resumenTotalBs');
    if (resumenFichas) resumenFichas.textContent = fichas;
    if (resumenTotalBs) resumenTotalBs.textContent = totalBs.toFixed(2) + ' Bs';
    
    verificarLimitesRetiro(fichas);
}

window.actualizarSaldoRetiro = async function() {
    const saldo = await obtenerSaldoActual();
    const saldoSpan = document.getElementById('saldoDisponibleRetiro');
    if (saldoSpan) {
        saldoSpan.textContent = Math.floor(saldo).toLocaleString();
    }
    const fichasSpan = document.getElementById('fichasDisponibles');
    if (fichasSpan) {
        fichasSpan.textContent = Math.floor(saldo).toLocaleString();
    }
    return saldo;
};

async function obtenerSaldoActual() {
    try {
        if (!currentUser?.cedula) return 0;
        
        const { data, error } = await supabase
            .from('usuarios')
            .select('saldo_monedas')
            .eq('cedula', currentUser.cedula)
            .single();
        
        if (error) throw error;
        const saldo = data?.saldo_monedas || 0;
        
        const fichasSpan = document.getElementById('fichasDisponibles');
        if (fichasSpan) {
            fichasSpan.textContent = Math.floor(saldo).toLocaleString();
        }
        
        const saldoRetiroSpan = document.getElementById('saldoDisponibleRetiro');
        if (saldoRetiroSpan) {
            saldoRetiroSpan.textContent = Math.floor(saldo).toLocaleString();
        }
        
        return saldo;
    } catch (error) {
        console.error('Error obteniendo saldo:', error);
        return currentUser?.saldo_monedas || 0;
    }
}

async function actualizarSaldoEnTiempoReal() {
    if (!currentUser?.cedula) return;
    
    try {
        const { data, error } = await supabase
            .from('usuarios')
            .select('saldo_monedas')
            .eq('cedula', currentUser.cedula)
            .single();
        
        if (error) throw error;
        
        const nuevoSaldo = data?.saldo_monedas || 0;
        
        if (currentUser.saldo_monedas !== nuevoSaldo) {
            currentUser.saldo_monedas = nuevoSaldo;
            localStorage.setItem('userSession', JSON.stringify(currentUser));
        }
        
        const fichasSpan = document.getElementById('fichasDisponibles');
        if (fichasSpan) {
            fichasSpan.textContent = Math.floor(nuevoSaldo).toLocaleString();
        }
        
        const saldoRetiroSpan = document.getElementById('saldoDisponibleRetiro');
        if (saldoRetiroSpan) {
            saldoRetiroSpan.textContent = Math.floor(nuevoSaldo).toLocaleString();
        }
        
        return nuevoSaldo;
    } catch (error) {
        console.error('Error actualizando saldo:', error);
        return currentUser?.saldo_monedas || 0;
    }
}

function actualizarResumenRetiro() {
    const banco = document.getElementById('bancoRetiro')?.value;
    const cuenta = document.getElementById('numeroCuentaRetiro')?.value;
    const fichas = parseInt(document.getElementById('montoRetiro')?.value) || 0;
    const totalBs = fichas * VALOR_FICHA_BS;
    
    const resumenBanco = document.getElementById('resumenBanco');
    const resumenCuenta = document.getElementById('resumenCuenta');
    const resumenFichas = document.getElementById('resumenFichas');
    const resumenTotalBs = document.getElementById('resumenTotalBs');
    
    if (resumenBanco) resumenBanco.textContent = banco || '-';
    if (resumenCuenta) resumenCuenta.textContent = cuenta ? '***' + cuenta.slice(-4) : '-';
    if (resumenFichas) resumenFichas.textContent = fichas;
    if (resumenTotalBs) resumenTotalBs.textContent = totalBs.toFixed(2) + ' Bs';
    
    const resumenBox = document.getElementById('resumenRetiroBox');
    if (resumenBox && (banco || cuenta)) {
        resumenBox.style.display = 'block';
    }
}

async function verificarLimitesRetiro(fichas) {
    const errorContainer = document.getElementById('errorRetiroContainer');
    const submitBtn = document.querySelector('#formRetiro button[type="submit"]');
    const saldoActual = await obtenerSaldoActual();
    
    if (!errorContainer) return;
    
    if (fichas < 10 && fichas > 0) {
        errorContainer.innerHTML = '<div style="background: #fff3cd; border-left: 4px solid #ffc107; padding: 10px; border-radius: 8px;"><i class="fas fa-info-circle"></i> El monto mínimo es 10 fichas</div>';
        if (submitBtn) submitBtn.disabled = true;
        return false;
    }
    
    if (fichas > saldoActual) {
        errorContainer.innerHTML = `<div style="background: #ffe6e6; border-left: 4px solid #e74c3c; padding: 10px; border-radius: 8px;"><i class="fas fa-exclamation-circle"></i> Saldo insuficiente. Tienes ${saldoActual.toLocaleString()} fichas</div>`;
        if (submitBtn) submitBtn.disabled = true;
        return false;
    }
    
    const saldoSpan = document.getElementById('saldoDisponibleRetiro');
    if (saldoSpan) {
        saldoSpan.textContent = Math.floor(saldoActual).toLocaleString();
    }
    
    errorContainer.innerHTML = '';
    if (submitBtn) submitBtn.disabled = false;
    return true;
}

// ==========================================
// REGISTRAR DEPÓSITO
// ==========================================
async function registrarDeposito(e) {
    e.preventDefault();
    
    const fichas = parseInt(document.getElementById('montoDeposito').value);
    const metodoPago = document.getElementById('metodoPagoDeposito').value;
    const referencia = document.getElementById('referenciaDeposito').value.trim();
    const telefonoEmisor = document.getElementById('telefonoEmisorDeposito').value.trim();
    const bancoEmisor = document.getElementById('bancoEmisorDeposito').value.trim();
    const totalBs = fichas * VALOR_FICHA_BS;
    
    if (!fichas || fichas <= 0) {
        mostrarNotificacion('Ingresa una cantidad válida', 'warning');
        return;
    }
    
    if (!referencia) {
        mostrarNotificacion('Ingresa la referencia del pago', 'warning');
        return;
    }
    
    if (!confirm(`💰 DEPÓSITO DE FICHAS\n\n📊 Cantidad: ${fichas} fichas\n💵 Total: ${totalBs.toFixed(2)} Bs\n📝 Referencia: ${referencia}\n📱 Método: ${metodoPago === 'pago_movil' ? 'Pago Móvil' : 'Transferencia'}\n\n¿Confirmar el depósito?`)) {
        return;
    }
    
    const submitBtn = e.target.querySelector('button[type="submit"]');
    const originalText = submitBtn.innerHTML;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Procesando...';
    submitBtn.disabled = true;
    
    try {
        const user = await getCurrentUser();
        if (!user) throw new Error('Usuario no identificado');
        
        const { data: userData, error: userError } = await supabase
            .from('usuarios')
            .select('saldo_monedas')
            .eq('cedula', user.cedula)
            .single();
        
        if (userError) throw userError;
        
        const saldoActual = userData.saldo_monedas || 0;
        const nuevoSaldo = saldoActual + fichas;
        
        const { error: updateError } = await supabase
            .from('usuarios')
            .update({ 
                saldo_monedas: nuevoSaldo,
                ultimo_acceso: new Date().toISOString()
            })
            .eq('cedula', user.cedula);
        
        if (updateError) throw updateError;
        
        const timestamp = Date.now();
        const random = Math.floor(Math.random() * 10000);
        const referenciaUnica = `${referencia}_${timestamp}_${random}`;
        
        const { error: pagoError } = await supabase.from('pagos').insert({
            cedula_usuario: user.cedula,
            monto: fichas,
            tipo_pago: 'deposito',
            metodo_pago: metodoPago,
            referencia: referenciaUnica,
            telefono: telefonoEmisor || user.telefono,
            banco_emisor: bancoEmisor || null,
            observaciones: `Total Bs: ${totalBs} | Ref original: ${referencia}`,
            estado: 'completado',
            fecha_solicitud: new Date().toISOString(),
            fecha_procesado: new Date().toISOString()
        });
        
        if (pagoError) throw pagoError;
        
        currentUser.saldo_monedas = nuevoSaldo;
        localStorage.setItem('userSession', JSON.stringify(currentUser));
        
        const fichasSpan = document.getElementById('fichasDisponibles');
        if (fichasSpan) {
            fichasSpan.textContent = Math.floor(nuevoSaldo).toLocaleString();
        }
        
        const saldoRetiroSpan = document.getElementById('saldoDisponibleRetiro');
        if (saldoRetiroSpan) {
            saldoRetiroSpan.textContent = Math.floor(nuevoSaldo).toLocaleString();
        }
        
        mostrarNotificacion(`✅ ¡DEPÓSITO EXITOSO! Se han añadido ${fichas} fichas. Saldo actual: ${nuevoSaldo.toLocaleString()} fichas`, 'success');
        
        document.getElementById('formDeposito').reset();
        document.getElementById('montoDeposito').value = '10';
        document.getElementById('totalBsDeposito').textContent = '1000.00';
        
        await cargarHistorialPagos();
        
    } catch (error) {
        console.error('Error en depósito:', error);
        if (error.message && error.message.includes('duplicate')) {
            mostrarNotificacion('Error: La referencia ya existe. Por favor, usa una referencia diferente.', 'warning');
        } else {
            mostrarNotificacion('Error al procesar el depósito: ' + error.message, 'error');
        }
    } finally {
        submitBtn.innerHTML = originalText;
        submitBtn.disabled = false;
    }
}

// ==========================================
// REGISTRAR RETIRO - VERSIÓN CORREGIDA
// ==========================================
async function registrarRetiro(e) {
    e.preventDefault();
    
    // PREVENIR DOBLE EJECUCIÓN
    if (procesandoRetiro) {
        mostrarNotificacion('⚠️ Ya hay un retiro en proceso, espera...', 'warning');
        return;
    }
    
    // PREVENIR RETIROS EN MENOS DE 5 SEGUNDOS
    const ahora = Date.now();
    if (ahora - ultimoRetiroTimestamp < 5000) {
        mostrarNotificacion('⚠️ Espera 5 segundos antes de otro retiro', 'warning');
        return;
    }
    
    const fichas = parseInt(document.getElementById('montoRetiro').value);
    const banco = document.getElementById('bancoRetiro').value;
    const tipoCuenta = document.getElementById('tipoCuentaRetiro').value;
    const numeroCuenta = document.getElementById('numeroCuentaRetiro').value;
    const cedulaTitular = document.getElementById('cedulaRetiro').value;
    const telefono = document.getElementById('telefonoRetiro').value;
    const nombreTitular = document.getElementById('nombreTitularRetiro').value;
    const totalBs = fichas * VALOR_FICHA_BS;
    
    if (!fichas || fichas < 10) {
        mostrarNotificacion('El monto mínimo de retiro es 10 fichas', 'warning');
        return;
    }
    
    const saldoActual = await obtenerSaldoActual();
    if (saldoActual < fichas) {
        mostrarNotificacion(`❌ Saldo insuficiente. Tienes ${saldoActual.toLocaleString()} fichas disponibles`, 'error');
        return;
    }
    
    if (!banco || !tipoCuenta || !numeroCuenta) {
        mostrarNotificacion('Completa todos tus datos bancarios', 'warning');
        return;
    }
    
    if (!cedulaTitular || !telefono) {
        mostrarNotificacion('Completa tu cédula y teléfono', 'warning');
        return;
    }
    
    const mensajeConfirmacion = `💰 RETIRO DE FICHAS\n\n` +
        `📊 Cantidad: ${fichas} fichas\n` +
        `💵 Recibirás: ${totalBs.toFixed(2)} Bs\n\n` +
        `🏦 Datos de transferencia:\n` +
        `Banco: ${banco}\n` +
        `Tipo: ${tipoCuenta}\n` +
        `Cuenta: ${numeroCuenta}\n` +
        `Titular: ${cedulaTitular}\n` +
        `Teléfono: ${telefono}\n\n` +
        `⚠️ Las fichas serán descontadas de tu saldo.\n` +
        `¿Confirmar el retiro?`;
    
    if (!confirm(mensajeConfirmacion)) {
        return;
    }
    
    // BLOQUEAR PROCESO
    procesandoRetiro = true;
    ultimoRetiroTimestamp = ahora;
    
    const submitBtn = e.target.querySelector('button[type="submit"]');
    const originalText = submitBtn.innerHTML;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Procesando...';
    submitBtn.disabled = true;
    
    try {
        const user = await getCurrentUser();
        if (!user) throw new Error('Usuario no identificado');
        
        // VERIFICAR RETIRO DUPLICADO EN LOS ÚLTIMOS 30 SEGUNDOS
        const hace30Segundos = new Date(ahora - 30000);
        const { data: retirosRecientes, error: checkError } = await supabase
            .from('pagos')
            .select('id, monto')
            .eq('cedula_usuario', user.cedula)
            .eq('tipo_pago', 'retiro')
            .eq('monto', fichas)
            .gte('fecha_solicitud', hace30Segundos.toISOString());
        
        if (!checkError && retirosRecientes && retirosRecientes.length > 0) {
            mostrarNotificacion('⚠️ Este retiro ya se procesó hace instantes', 'warning');
            procesandoRetiro = false;
            submitBtn.disabled = false;
            submitBtn.innerHTML = originalText;
            return;
        }
        
        const { data: userData, error: userError } = await supabase
            .from('usuarios')
            .select('saldo_monedas')
            .eq('cedula', user.cedula)
            .single();
        
        if (userError) throw userError;
        
        const saldoActualFresh = userData.saldo_monedas || 0;
        
        if (saldoActualFresh < fichas) {
            mostrarNotificacion(`❌ Saldo insuficiente. Tienes ${saldoActualFresh.toLocaleString()} fichas disponibles`, 'error');
            procesandoRetiro = false;
            submitBtn.disabled = false;
            submitBtn.innerHTML = originalText;
            return;
        }
        
        const nuevoSaldo = saldoActualFresh - fichas;
        
        const { error: updateError } = await supabase
            .from('usuarios')
            .update({ 
                saldo_monedas: nuevoSaldo,
                ultimo_acceso: new Date().toISOString()
            })
            .eq('cedula', user.cedula);
        
        if (updateError) throw updateError;
        
        const datosPago = {
            banco: banco,
            tipo_cuenta: tipoCuenta,
            numero_cuenta: numeroCuenta,
            cedula: cedulaTitular,
            telefono: telefono,
            nombre_titular: nombreTitular,
            fecha_actualizacion: new Date().toISOString()
        };
        
        const { error: updatePagoError } = await supabase
            .from('usuarios')
            .update({ datos_pago: datosPago })
            .eq('cedula', user.cedula);
        
        if (updatePagoError) console.error('Error guardando datos bancarios:', updatePagoError);
        
        const timestamp = Date.now();
        const random = Math.floor(Math.random() * 10000);
        const referenciaUnica = `RETIRO_${user.cedula}_${timestamp}_${random}`;
        
        const { error: pagoError } = await supabase.from('pagos').insert({
            cedula_usuario: user.cedula,
            monto: fichas,
            tipo_pago: 'retiro',
            metodo_pago: 'transferencia',
            referencia: referenciaUnica,
            telefono: telefono,
            banco_emisor: banco,
            observaciones: `Retiro automático. Cuenta: ${numeroCuenta} - ${banco} | Total Bs: ${totalBs} | Titular: ${cedulaTitular}`,
            estado: 'completado',
            fecha_solicitud: new Date().toISOString(),
            fecha_procesado: new Date().toISOString()
        });
        
        if (pagoError) throw pagoError;
        
        currentUser.saldo_monedas = nuevoSaldo;
        currentUser.datos_pago = datosPago;
        localStorage.setItem('userSession', JSON.stringify(currentUser));
        
        const fichasSpan = document.getElementById('fichasDisponibles');
        if (fichasSpan) {
            fichasSpan.textContent = Math.floor(nuevoSaldo).toLocaleString();
        }
        
        const saldoRetiroSpan = document.getElementById('saldoDisponibleRetiro');
        if (saldoRetiroSpan) {
            saldoRetiroSpan.textContent = Math.floor(nuevoSaldo).toLocaleString();
        }
        
        mostrarNotificacion(`✅ ¡RETIRO EXITOSO! Se han descontado ${fichas} fichas. Saldo actual: ${nuevoSaldo.toLocaleString()} fichas. Recibirás ${totalBs.toFixed(2)} Bs en tu cuenta en las próximas 24 horas.`, 'success');
        
        document.getElementById('formRetiro').reset();
        document.getElementById('montoRetiro').value = '10';
        document.getElementById('totalBsRetiro').textContent = '1000.00';
        document.getElementById('resumenRetiroBox').style.display = 'none';
        document.getElementById('errorRetiroContainer').innerHTML = '';
        
        await cargarHistorialPagos();
        
    } catch (error) {
        console.error('Error en retiro:', error);
        mostrarNotificacion('Error al procesar el retiro: ' + error.message, 'error');
    } finally {
        setTimeout(() => {
            procesandoRetiro = false;
        }, 3000);
        submitBtn.innerHTML = originalText;
        submitBtn.disabled = false;
    }
}

// ==========================================
// CARGAR TODOS LOS PARTIDOS
// ==========================================
async function cargarTodosLosPartidos() {
    await cargarPartidosDisponibles();
    await cargarPartidosEnVivo();
    await cargarCarruselPartidos();
}

// ==========================================
// CARRUSEL DE PARTIDOS
// ==========================================
async function cargarCarruselPartidos() {
    const carruselWrapper = document.getElementById('carruselPartidos');
    if (!carruselWrapper) return;
    
    carruselWrapper.innerHTML = `
        <div class="swiper-slide">
            <div class="partido-carousel-card">
                <div class="carousel-header">
                    <span class="carousel-badge">📅 Cargando</span>
                </div>
                <div class="carousel-body">
                    <div class="loading" style="padding: 40px; text-align: center;">
                        <i class="fas fa-spinner fa-spin"></i> Cargando partidos...
                    </div>
                </div>
            </div>
        </div>
    `;
    
    try {
        const resultado = await getPartidosDisponibles();
        
        if (!resultado.success || !resultado.data || resultado.data.length === 0) {
            carruselWrapper.innerHTML = `
                <div class="swiper-slide">
                    <div class="partido-carousel-card">
                        <div class="carousel-header" style="background-image: linear-gradient(135deg, rgba(0,0,0,0.7), rgba(0,0,0,0.6)), url('${IMAGENES_FUTBOL[0]}'); background-size: cover; background-position: center;">
                            <span class="carousel-badge">📅 Sin partidos</span>
                        </div>
                        <div class="carousel-body">
                            <div style="text-align: center; padding: 40px;">
                                <i class="fas fa-futbol" style="font-size: 3em; color: #00b894; margin-bottom: 15px; display: block;"></i>
                                <p style="color: #7f8c8d;">No hay partidos disponibles</p>
                            </div>
                        </div>
                    </div>
                </div>
            `;
            inicializarSwiper();
            return;
        }
        
        const partidos = resultado.data.filter(p => p.estado === 'programado');
        
        if (partidos.length === 0) {
            carruselWrapper.innerHTML = `
                <div class="swiper-slide">
                    <div class="partido-carousel-card">
                        <div class="carousel-header" style="background-image: linear-gradient(135deg, rgba(0,0,0,0.7), rgba(0,0,0,0.6)), url('${IMAGENES_FUTBOL[1]}'); background-size: cover; background-position: center;">
                            <span class="carousel-badge">📅 Próximamente</span>
                        </div>
                        <div class="carousel-body">
                            <div style="text-align: center; padding: 40px;">
                                <i class="fas fa-calendar-alt" style="font-size: 3em; color: #00b894; margin-bottom: 15px; display: block;"></i>
                                <p style="color: #7f8c8d;">Próximos partidos</p>
                                <p style="font-size: 0.8em; color: #95a5a6;">Vuelve pronto</p>
                            </div>
                        </div>
                    </div>
                </div>
            `;
            inicializarSwiper();
            return;
        }
        
        let html = '';
        partidos.forEach((partido, index) => {
            const fechaObj = partido.fecha_hora ? new Date(partido.fecha_hora) : new Date();
            const fechaFormateada = fechaObj.toLocaleString('es-ES', {
                day: '2-digit',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit'
            });
            
            const imagenFondo = IMAGENES_FUTBOL[index % IMAGENES_FUTBOL.length];
            
            html += `
                <div class="swiper-slide">
                    <div class="partido-carousel-card">
                        <div class="carousel-header" style="background-image: linear-gradient(135deg, rgba(0,0,0,0.75), rgba(0,0,0,0.65)), url('${imagenFondo}'); background-size: cover; background-position: center;">
                            <span class="carousel-badge">
                                <i class="far fa-calendar-alt"></i> PARTIDO
                            </span>
                            <span class="carousel-date">
                                <i class="far fa-clock"></i> ${fechaFormateada}
                            </span>
                        </div>
                        <div class="carousel-body">
                            <div class="carousel-equipos">
                                <div class="carousel-equipo">
                                    <div class="carousel-equipo-icono">
                                        <img src="${imagenFondo}" alt="${escapeHtml(partido.equipo_local)}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">
                                    </div>
                                    <div class="carousel-equipo-nombre">${escapeHtml(partido.equipo_local || 'Local')}</div>
                                    <div class="carousel-equipo-marcador">-</div>
                                </div>
                                <div class="carousel-vs">VS</div>
                                <div class="carousel-equipo">
                                    <div class="carousel-equipo-icono">
                                        <img src="${imagenFondo}" alt="${escapeHtml(partido.equipo_visitante)}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">
                                    </div>
                                    <div class="carousel-equipo-nombre">${escapeHtml(partido.equipo_visitante || 'Visitante')}</div>
                                    <div class="carousel-equipo-marcador">-</div>
                                </div>
                            </div>
                            <div class="carousel-cuotas">
                                <div class="carousel-cuota" onclick="abrirModalApuesta(${partido.codigo}, '${escapeHtml(partido.equipo_local)}', '${escapeHtml(partido.equipo_visitante)}', ${partido.cuota_local}, ${partido.cuota_empate}, ${partido.cuota_visitante})">
                                    <strong>${partido.cuota_local || '-'}</strong>
                                    <span>1</span>
                                </div>
                                <div class="carousel-cuota" onclick="abrirModalApuesta(${partido.codigo}, '${escapeHtml(partido.equipo_local)}', '${escapeHtml(partido.equipo_visitante)}', ${partido.cuota_local}, ${partido.cuota_empate}, ${partido.cuota_visitante})">
                                    <strong>${partido.cuota_empate || '-'}</strong>
                                    <span>X</span>
                                </div>
                                <div class="carousel-cuota" onclick="abrirModalApuesta(${partido.codigo}, '${escapeHtml(partido.equipo_local)}', '${escapeHtml(partido.equipo_visitante)}', ${partido.cuota_local}, ${partido.cuota_empate}, ${partido.cuota_visitante})">
                                    <strong>${partido.cuota_visitante || '-'}</strong>
                                    <span>2</span>
                                </div>
                            </div>
                        </div>
                        <button class="carousel-btn" onclick="abrirModalApuesta(${partido.codigo}, '${escapeHtml(partido.equipo_local)}', '${escapeHtml(partido.equipo_visitante)}', ${partido.cuota_local}, ${partido.cuota_empate}, ${partido.cuota_visitante})">
                            <i class="fas fa-ticket-alt"></i> PREDECIR
                        </button>
                    </div>
                </div>
            `;
        });
        
        carruselWrapper.innerHTML = html;
        inicializarSwiper();
        
    } catch (error) {
        console.error('Error cargando carrusel:', error);
        carruselWrapper.innerHTML = `
            <div class="swiper-slide">
                <div class="partido-carousel-card">
                    <div class="carousel-header" style="background-image: linear-gradient(135deg, rgba(0,0,0,0.7), rgba(0,0,0,0.6)), url('${IMAGENES_FUTBOL[0]}'); background-size: cover; background-position: center;">
                        <span class="carousel-badge">⚠️ Error</span>
                    </div>
                    <div class="carousel-body">
                        <div style="text-align: center; padding: 40px;">
                            <i class="fas fa-exclamation-triangle" style="font-size: 3em; color: #e74c3c; margin-bottom: 15px; display: block;"></i>
                            <p style="color: #7f8c8d;">Error al cargar partidos</p>
                        </div>
                    </div>
                </div>
            </div>
        `;
        inicializarSwiper();
    }
}

function inicializarSwiper() {
    setTimeout(function() {
        if (typeof Swiper !== 'undefined') {
            if (window.partidosSwiperInstance) {
                window.partidosSwiperInstance.destroy(true, true);
            }
            
            window.partidosSwiperInstance = new Swiper('.partidosSwiper', {
                slidesPerView: 1,
                spaceBetween: 25,
                loop: true,
                autoplay: {
                    delay: 5000,
                    disableOnInteraction: false,
                    pauseOnMouseEnter: true
                },
                speed: 800,
                pagination: {
                    el: '.swiper-pagination',
                    clickable: true,
                    dynamicBullets: true
                },
                navigation: {
                    nextEl: '.swiper-button-next',
                    prevEl: '.swiper-button-prev',
                },
                grabCursor: true,
                breakpoints: {
                    640: { slidesPerView: 2, spaceBetween: 20 },
                    1024: { slidesPerView: 3, spaceBetween: 25 },
                    1280: { slidesPerView: 4, spaceBetween: 30 }
                }
            });
        }
    }, 150);
}

// ==========================================
// CONFIGURAR EVENTOS Y MENÚ
// ==========================================
function configurarEventos() {
    const perfilForm = document.getElementById('perfilForm');
    if (perfilForm) {
        perfilForm.removeEventListener('submit', actualizarPerfil);
        perfilForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            await actualizarPerfil();
        });
    }
    
    const filtroEstado = document.getElementById('filtroEstadoApuesta');
    if (filtroEstado) {
        filtroEstado.removeEventListener('change', cargarMisApuestas);
        filtroEstado.addEventListener('change', () => cargarMisApuestas());
    }
}

function configurarMenu() {
    const menuItems = document.querySelectorAll('.admin-menu li');
    const sections = document.querySelectorAll('.admin-section');
    
    menuItems.forEach(item => {
        item.removeEventListener('click', handleMenuClick);
        item.addEventListener('click', handleMenuClick);
    });
    
    async function handleMenuClick() {
        const sectionId = this.dataset.section;
        
        menuItems.forEach(i => i.classList.remove('active'));
        this.classList.add('active');
        
        sections.forEach(section => {
            section.classList.remove('active');
            section.style.display = 'none';
        });
        
        const targetSection = document.getElementById(`${sectionId}-section`);
        if (targetSection) {
            targetSection.classList.add('active');
            targetSection.style.display = 'block';
        }
        
        switch(sectionId) {
            case 'dashboard':
                await cargarPartidosDisponibles();
                await cargarPartidosEnVivo();
                await cargarApuestasActivas();
                await cargarCarruselPartidos();
                break;
            case 'perfil':
                await cargarPerfil();
                break;
            case 'misapuestas':
                await cargarMisApuestas();
                break;
            case 'pagos':
                await window.actualizarSaldoRetiro();
                break;
            case 'historialpagos':
                await cargarHistorialPagos();
                break;
        }
    }
}

// ==========================================
// ACTUALIZAR FICHAS
// ==========================================
async function actualizarFichas() {
    try {
        if (!currentUser?.cedula) return 0;
        
        const { data: userData, error } = await supabase
            .from('usuarios')
            .select('saldo_monedas')
            .eq('cedula', currentUser.cedula)
            .single();
        
        if (error) throw error;
        
        if (userData) {
            currentUser.saldo_monedas = userData.saldo_monedas;
            localStorage.setItem('userSession', JSON.stringify(currentUser));
            const fichasSpan = document.getElementById('fichasDisponibles');
            if (fichasSpan) {
                fichasSpan.textContent = Math.floor(userData.saldo_monedas || 0).toLocaleString();
            }
            const saldoRetiroSpan = document.getElementById('saldoDisponibleRetiro');
            if (saldoRetiroSpan) {
                saldoRetiroSpan.textContent = Math.floor(userData.saldo_monedas || 0).toLocaleString();
            }
            return userData.saldo_monedas;
        }
    } catch (error) {
        console.error('Error actualizando fichas:', error);
    }
    return currentUser?.saldo_monedas || 0;
}

// ==========================================
// PERFIL
// ==========================================
async function cargarPerfil() {
    try {
        const user = await getCurrentUser();
        if (!user) return;
        
        currentUser = user;
        
        const nombreInput = document.getElementById('perfilNombre');
        const emailInput = document.getElementById('perfilEmail');
        const telefonoInput = document.getElementById('perfilTelefono');
        const cedulaInput = document.getElementById('perfilCedula');
        
        if (nombreInput) nombreInput.value = user.nombre || '';
        if (emailInput) emailInput.value = user.email || '';
        if (telefonoInput) telefonoInput.value = user.telefono || '';
        if (cedulaInput) cedulaInput.value = user.cedula || '';
        
    } catch (error) {
        console.error('Error cargando perfil:', error);
        mostrarNotificacion('Error al cargar el perfil', 'error');
    }
}

async function actualizarPerfil() {
    const telefono = document.getElementById('perfilTelefono').value.trim();
    if (!telefono) {
        mostrarNotificacion('Ingrese un número de teléfono', 'warning');
        return;
    }
    
    try {
        const { error } = await supabase
            .from('usuarios')
            .update({ telefono: telefono })
            .eq('cedula', currentUser.cedula);
        
        if (error) throw error;
        
        currentUser.telefono = telefono;
        localStorage.setItem('userSession', JSON.stringify(currentUser));
        mostrarNotificacion('✅ Datos actualizados correctamente', 'success');
    } catch (error) {
        mostrarNotificacion('Error al actualizar datos', 'error');
    }
}

// ==========================================
// AVATARES
// ==========================================
function obtenerUrlAvatar(archivo) {
    return RUTA_AVATARES + archivo;
}

async function cargarAvatarUsuario() {
    try {
        const user = await getCurrentUser();
        if (!user) return;
        
        let avatarUrl = localStorage.getItem(`avatar_${user.cedula}`);
        
        if (!avatarUrl && user.avatar_url) {
            avatarUrl = user.avatar_url;
        }
        
        const headerAvatar = document.getElementById('userAvatarHeader');
        const sidebarAvatar = document.getElementById('userAvatar');
        
        if (avatarUrl && avatarUrl !== 'null' && avatarUrl !== '') {
            if (headerAvatar) {
                headerAvatar.src = avatarUrl;
                headerAvatar.style.display = 'block';
            }
            if (sidebarAvatar) {
                sidebarAvatar.style.backgroundImage = `url('${avatarUrl}')`;
                sidebarAvatar.style.backgroundSize = 'cover';
                sidebarAvatar.style.backgroundPosition = 'center';
                sidebarAvatar.innerHTML = '';
            }
        } else {
            const inicial = (user.nombre || 'U').charAt(0).toUpperCase();
            if (headerAvatar) {
                headerAvatar.src = AVATAR_DEFAULT;
            }
            if (sidebarAvatar) {
                sidebarAvatar.innerHTML = inicial;
                sidebarAvatar.style.backgroundImage = 'none';
                sidebarAvatar.style.background = 'linear-gradient(135deg, #00b894, #019267)';
            }
        }
    } catch (error) {
        console.error('Error cargando avatar:', error);
    }
}

window.abrirModalAvatar = function() {
    const modal = document.getElementById('avatarModal');
    const grid = document.getElementById('avatarGrid');
    
    if (!grid) return;
    
    grid.innerHTML = AVATARES_PREDETERMINADOS.map(jugador => `
        <div class="avatar-option" onclick="seleccionarAvatar('${jugador.id}', '${obtenerUrlAvatar(jugador.archivo)}', '${jugador.nombre}')">
            <img class="avatar-option-img" src="${obtenerUrlAvatar(jugador.archivo)}" 
                 alt="${jugador.nombre}"
                 onerror="this.src='${AVATAR_DEFAULT}'">
            <span class="avatar-option-name">${jugador.nombre}</span>
        </div>
    `).join('');
    
    modal.style.display = 'flex';
};

window.cerrarModalAvatar = function() {
    document.getElementById('avatarModal').style.display = 'none';
};

window.seleccionarAvatar = async function(jugadorId, avatarUrl, jugadorNombre) {
    try {
        const user = await getCurrentUser();
        if (!user) return;
        
        localStorage.setItem(`avatar_${user.cedula}`, avatarUrl);
        
        const { error } = await supabase
            .from('usuarios')
            .update({ avatar_url: avatarUrl })
            .eq('cedula', user.cedula);
        
        if (error) console.error('Error guardando avatar en DB:', error);
        
        await cargarAvatarUsuario();
        cerrarModalAvatar();
        mostrarNotificacion(`✅ Avatar de ${jugadorNombre} seleccionado`, 'success');
        
    } catch (error) {
        console.error('Error seleccionando avatar:', error);
        mostrarNotificacion('Error al seleccionar avatar', 'error');
    }
};

window.abrirSubirFoto = function() {
    document.getElementById('subirFotoInput').click();
};

window.procesarFotoSubida = async function(input) {
    const file = input.files[0];
    if (!file) return;
    
    if (!file.type.startsWith('image/')) {
        mostrarNotificacion('Solo se permiten imágenes', 'warning');
        return;
    }
    
    if (file.size > 2 * 1024 * 1024) {
        mostrarNotificacion('La imagen no puede superar 2MB', 'warning');
        return;
    }
    
    const reader = new FileReader();
    reader.onload = async function(e) {
        const base64Image = e.target.result;
        
        try {
            const user = await getCurrentUser();
            if (!user) return;
            
            localStorage.setItem(`avatar_${user.cedula}`, base64Image);
            
            const { error } = await supabase
                .from('usuarios')
                .update({ avatar_url: base64Image })
                .eq('cedula', user.cedula);
            
            if (error) console.error('Error guardando avatar:', error);
            
            await cargarAvatarUsuario();
            input.value = '';
            cerrarModalAvatar();
            mostrarNotificacion('✅ Foto de perfil actualizada', 'success');
            
        } catch (error) {
            console.error('Error subiendo foto:', error);
            mostrarNotificacion('Error al subir foto', 'error');
        }
    };
    reader.readAsDataURL(file);
};

// ==========================================
// PARTIDOS DISPONIBLES
// ==========================================
async function cargarPartidosDisponibles() {
    const container = document.getElementById('partidosDisponibles');
    if (!container) return;
    
    container.innerHTML = '<div class="loading">Cargando partidos...</div>';
    
    try {
        const resultado = await getPartidosDisponibles();
        
        if (!resultado.success || !resultado.data || resultado.data.length === 0) {
            container.innerHTML = '<div class="empty-message">No hay partidos disponibles</div>';
            return;
        }
        
        const partidos = resultado.data;
        
        container.innerHTML = partidos.map(partido => `
            <div class="partido-card">
                <div class="partido-header">
                    <span class="estado-badge programado">📅 Programado</span>
                    <span class="fecha">${new Date(partido.fecha_hora).toLocaleString()}</span>
                </div>
                <div class="partido-equipos">
                    <div class="equipo">
                        <span class="nombre">${escapeHtml(partido.equipo_local)}</span>
                    </div>
                    <span class="vs">VS</span>
                    <div class="equipo">
                        <span class="nombre">${escapeHtml(partido.equipo_visitante)}</span>
                    </div>
                </div>
                <div class="cuotas-container">
                    <div class="cuota-preview">
                        <span>🏠 Local: ${partido.cuota_local}</span>
                        <span>🤝 Empate: ${partido.cuota_empate}</span>
                        <span>✈️ Visitante: ${partido.cuota_visitante}</span>
                    </div>
                </div>
                <button class="prediccion-btn" onclick="abrirModalApuesta(${partido.codigo}, '${escapeHtml(partido.equipo_local)}', '${escapeHtml(partido.equipo_visitante)}', ${partido.cuota_local}, ${partido.cuota_empate}, ${partido.cuota_visitante})">
                    <i class="fas fa-ticket-alt"></i> ¡Apostar Ahora!
                </button>
            </div>
        `).join('');
        
    } catch (error) {
        console.error('Error:', error);
        container.innerHTML = '<div class="empty-message">Error al cargar partidos</div>';
    }
}

// ==========================================
// APUESTAS
// ==========================================
window.abrirModalApuesta = function(codigo, local, visitante, cuotaLocal, cuotaEmpate, cuotaVisitante) {
    partidoSeleccionado = codigo;
    partidoActual = { local, visitante, cuotaLocal, cuotaEmpate, cuotaVisitante };
    
    document.getElementById('partidoInfo').innerHTML = `
        <div style="text-align: center; padding: 10px; background: #ecf0f1; border-radius: 10px;">
            <strong>🏆 ${local} vs ${visitante}</strong>
        </div>
    `;
    
    const opcionesContainer = document.getElementById('prediccionOpciones');
    opcionesContainer.innerHTML = `
        <div class="opcion-btn" onclick="seleccionarPrediccion('local', ${cuotaLocal}, '${local}')">
            <strong>🏠 ${local}</strong>
            <span class="cuota">Cuota: ${cuotaLocal}</span>
        </div>
        <div class="opcion-btn" onclick="seleccionarPrediccion('empate', ${cuotaEmpate}, 'Empate')">
            <strong>🤝 Empate</strong>
            <span class="cuota">Cuota: ${cuotaEmpate}</span>
        </div>
        <div class="opcion-btn" onclick="seleccionarPrediccion('visitante', ${cuotaVisitante}, '${visitante}')">
            <strong>✈️ ${visitante}</strong>
            <span class="cuota">Cuota: ${cuotaVisitante}</span>
        </div>
    `;
    
    document.getElementById('cuotaSeleccionadaInfo').style.display = 'none';
    document.getElementById('cantidadFichas').value = 50;
    document.getElementById('gananciaPotencial').textContent = '0';
    document.getElementById('gananciaBs').textContent = '0';
    
    window.prediccionSeleccionada = null;
    window.cuotaSeleccionadaValor = 0;
    window.equipoSeleccionado = '';
    
    document.getElementById('apuestaModal').style.display = 'flex';
    
    const cantidadInput = document.getElementById('cantidadFichas');
    cantidadInput.oninput = () => actualizarGananciaPotencial();
};

window.seleccionarPrediccion = function(tipo, cuota, equipo) {
    const btns = document.querySelectorAll('.opcion-btn');
    btns.forEach(btn => btn.classList.remove('selected'));
    
    const btn = event.target.closest('.opcion-btn');
    if (btn) btn.classList.add('selected');
    
    window.prediccionSeleccionada = tipo;
    window.cuotaSeleccionadaValor = cuota;
    window.equipoSeleccionado = equipo;
    
    document.getElementById('cuotaSeleccionadaInfo').style.display = 'block';
    document.getElementById('cuotaSeleccionadaDisplay').textContent = cuota;
    
    actualizarGananciaPotencial();
};

function actualizarGananciaPotencial() {
    const monto = parseInt(document.getElementById('cantidadFichas').value) || 0;
    const gananciaFichas = Math.floor(monto * window.cuotaSeleccionadaValor);
    const gananciaBs = gananciaFichas * VALOR_FICHA_BS;
    
    document.getElementById('gananciaPotencial').textContent = gananciaFichas.toLocaleString();
    document.getElementById('gananciaBs').textContent = gananciaBs.toLocaleString();
}

window.confirmarApuesta = async function() {
    if (!window.prediccionSeleccionada) {
        mostrarNotificacion('Selecciona una predicción', 'warning');
        return;
    }
    
    const cantidad = parseInt(document.getElementById('cantidadFichas').value);
    
    if (!cantidad || cantidad < 10) {
        mostrarNotificacion('Monto mínimo: 10 fichas', 'warning');
        return;
    }
    
    if (cantidad > 500) {
        mostrarNotificacion('Monto máximo: 500 fichas', 'warning');
        return;
    }
    
    const saldoActual = await actualizarFichas();
    
    if (saldoActual < cantidad) {
        mostrarNotificacion(`❌ Saldo insuficiente. Tienes ${saldoActual} fichas`, 'error');
        return;
    }
    
    try {
        const resultado = await realizarApuesta(
            currentUser.cedula,
            partidoSeleccionado,
            window.prediccionSeleccionada,
            cantidad,
            window.cuotaSeleccionadaValor
        );
        
        if (resultado.success) {
            mostrarNotificacion(`✅ Apuesta realizada: ${window.equipoSeleccionado} - ${cantidad} fichas`, 'success');
            cerrarModalPrediccion();
            
            await actualizarFichas();
            await cargarApuestasActivas();
            await cargarMisApuestas();
        } else {
            mostrarNotificacion('❌ Error: ' + resultado.error, 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        mostrarNotificacion('Error al realizar la apuesta', 'error');
    }
};

async function cargarApuestasActivas() {
    const container = document.getElementById('apuestasActivasContainer');
    if (!container) return;
    
    container.innerHTML = '<div class="loading">Cargando tus apuestas...</div>';
    
    try {
        const { data: apuestas, error } = await supabase
            .from('apuestas')
            .select(`*, enfrentamientos(*)`)
            .eq('cedula_usuario', currentUser.cedula)
            .in('estado', ['completado'])
            .order('fecha_apuesta', { ascending: false });
        
        if (error) throw error;
        
        const ahora = new Date();
        const activas = (apuestas || []).filter(a => {
            const fechaPartido = new Date(a.enfrentamientos?.fecha_hora);
            return fechaPartido > ahora && a.enfrentamientos?.estado === 'programado';
        });
        
        if (activas.length === 0) {
            container.innerHTML = '<div class="empty-message">No tienes apuestas activas</div>';
            return;
        }
        
        container.innerHTML = activas.map(a => {
            const fechaPartido = new Date(a.enfrentamientos.fecha_hora);
            const diffMs = fechaPartido - ahora;
            const horas = Math.floor(diffMs / (1000 * 60 * 60));
            const minutos = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
            
            let seleccionTexto = '';
            if (a.seleccion === 'local') seleccionTexto = `${a.enfrentamientos.equipo_local} (1)`;
            else if (a.seleccion === 'empate') seleccionTexto = 'Empate (X)';
            else seleccionTexto = `${a.enfrentamientos.equipo_visitante} (2)`;
            
            return `
                <div class="apuesta-activa-card" data-apuesta-id="${a.id}">
                    <div class="partido-nombre">🏆 ${escapeHtml(a.enfrentamientos.equipo_local)} vs ${escapeHtml(a.enfrentamientos.equipo_visitante)}</div>
                    <div class="partido-fecha">📅 ${fechaPartido.toLocaleString()}</div>
                    <div class="countdown">⏰ Comienza en: ${horas}h ${minutos}m</div>
                    <div class="detalles-apuesta">
                        <div>🎯 <strong>Tu predicción:</strong> <span class="seleccion">${seleccionTexto}</span></div>
                        <div>💰 <strong>Monto:</strong> <span class="monto">${a.monto_apostado} fichas</span></div>
                        <div>📈 <strong>Cuota:</strong> ${a.cuota_aplicada}</div>
                        <div>🏆 <strong>Ganancia potencial:</strong> ${Math.floor(a.monto_apostado * a.cuota_aplicada)} fichas</div>
                        <div>📌 <strong>Estado:</strong> <span class="badge badge-info">ACTIVA</span></div>
                    </div>
                    <div class="acciones">
                        <button class="btn-cancelar" onclick="cancelarApuesta(${a.id})">
                            <i class="fas fa-trash-alt"></i> Cancelar Apuesta
                        </button>
                    </div>
                </div>
            `;
        }).join('');
        
    } catch (error) {
        console.error('Error:', error);
        container.innerHTML = '<div class="empty-message">Error al cargar apuestas</div>';
    }
}

window.cancelarApuesta = async function(apuestaId) {
    if (!confirm('¿Estás seguro de que quieres cancelar esta apuesta?\n\nSe te devolverán TODAS las fichas apostadas.')) {
        return;
    }
    
    mostrarNotificacion('Cancelando apuesta...', 'info');
    
    try {
        const resultado = await cancelarApuesta(apuestaId, currentUser.cedula);
        
        if (resultado.success) {
            mostrarNotificacion(resultado.mensaje || '✅ Apuesta cancelada exitosamente', 'success');
            await actualizarFichas();
            await cargarApuestasActivas();
            await cargarMisApuestas();
        } else {
            mostrarNotificacion('❌ Error: ' + resultado.error, 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        mostrarNotificacion('Error al cancelar la apuesta', 'error');
    }
};

async function cargarPartidosEnVivo() {
    const container = document.getElementById('partidosEnVivo');
    if (!container) return;
    
    container.innerHTML = '<div class="loading">Cargando partidos en vivo...</div>';
    
    try {
        const resultado = await getPartidosEnVivo();
        
        if (!resultado.success || !resultado.data || resultado.data.length === 0) {
            container.innerHTML = '<div class="empty-message">No hay partidos en vivo</div>';
            return;
        }
        
        container.innerHTML = resultado.data.map(partido => `
            <div class="partido-card live">
                <div class="partido-header">
                    <span class="estado-badge vivo">🔴 EN VIVO ${partido.minuto_actual || 0}'</span>
                </div>
                <div class="partido-equipos">
                    <div class="equipo"><span class="nombre">${escapeHtml(partido.equipo_local)}</span><span class="marcador">${partido.goles_local || 0}</span></div>
                    <span class="vs">VS</span>
                    <div class="equipo"><span class="marcador">${partido.goles_visitante || 0}</span><span class="nombre">${escapeHtml(partido.equipo_visitante)}</span></div>
                </div>
                <div class="apuestas-cerradas"><i class="fas fa-lock"></i> Apuestas cerradas</div>
            </div>
        `).join('');
    } catch (error) {
        console.error('Error:', error);
        container.innerHTML = '<div class="empty-message">Error</div>';
    }
}

// ==========================================
// HISTORIAL DE APUESTAS
// ==========================================
async function cargarMisApuestas() {
    const tbody = document.getElementById('tablaMisApuestas');
    if (!tbody) return;
    
    tbody.innerHTML = '<tr><td colspan="7" class="text-center">📡 Cargando apuestas...</td></tr>';
    
    try {
        const filtro = document.getElementById('filtroEstadoApuesta')?.value || 'todas';
        const resultado = await getApuestasUsuario(currentUser.cedula);
        
        if (!resultado.success) {
                                    tbody.innerHTML = '<tr><td colspan="7" class="text-center">❌ Error al cargar apuestas</td></tr>';
            return;
        }
        
        let apuestas = resultado.data || [];
        if (filtro !== 'todas') apuestas = apuestas.filter(a => a.estado === filtro);
        
        if (apuestas.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="text-center">📭 No hay apuestas registradas</td></tr>';
            return;
        }
        
        tbody.innerHTML = '';
        
        for (const a of apuestas) {
            const row = tbody.insertRow();
            
            const cellPartido = row.insertCell(0);
            cellPartido.innerHTML = `<strong>${escapeHtml(a.enfrentamientos?.equipo_local || 'N/A')} vs ${escapeHtml(a.enfrentamientos?.equipo_visitante || 'N/A')}</strong>`;
            cellPartido.style.minWidth = '200px';
            
            const cellSeleccion = row.insertCell(1);
            let seleccionTexto = '';
            let seleccionIcono = '';
            if (a.seleccion === 'local') {
                seleccionTexto = escapeHtml(a.enfrentamientos?.equipo_local || 'Local');
                seleccionIcono = '🏠';
            } else if (a.seleccion === 'empate') {
                seleccionTexto = 'Empate';
                seleccionIcono = '🤝';
            } else {
                seleccionTexto = escapeHtml(a.enfrentamientos?.equipo_visitante || 'Visitante');
                seleccionIcono = '✈️';
            }
            cellSeleccion.innerHTML = `<span class="badge badge-info">${seleccionIcono} ${seleccionTexto}</span>`;
            
            const cellMonto = row.insertCell(2);
            cellMonto.innerHTML = `<span style="color: #00b894; font-weight: bold;">${a.monto_apostado} 🪙</span>`;
            cellMonto.style.textAlign = 'center';
            
            const cellCuota = row.insertCell(3);
            cellCuota.innerHTML = `<span style="font-weight: bold;">${a.cuota_aplicada}</span>`;
            cellCuota.style.textAlign = 'center';
            
            const cellGanancia = row.insertCell(4);
            let gananciaMostrar = '';
            let gananciaColor = '#666';
            
            if (a.estado === 'ganada') {
                gananciaMostrar = `+${Math.floor(a.ganancia_potencial || 0)} 🪙`;
                gananciaColor = '#2ecc71';
            } else if (a.estado === 'perdida') {
                gananciaMostrar = `-${a.monto_apostado} 🪙`;
                gananciaColor = '#e74c3c';
            } else if (a.estado === 'completado') {
                gananciaMostrar = `⏳ Pendiente`;
                gananciaColor = '#f39c12';
            } else if (a.estado === 'cancelada') {
                gananciaMostrar = `🚫 Cancelada`;
                gananciaColor = '#95a5a6';
            }
            cellGanancia.innerHTML = `<span style="color: ${gananciaColor}; font-weight: bold;">${gananciaMostrar}</span>`;
            cellGanancia.style.textAlign = 'center';
            
            const cellEstado = row.insertCell(5);
            let estadoClass = 'badge-warning';
            let estadoTexto = '';
            let estadoIcono = '';
            
            if (a.estado === 'ganada') {
                estadoClass = 'badge-success';
                estadoIcono = '🏆';
                estadoTexto = 'GANADA';
            } else if (a.estado === 'perdida') {
                estadoClass = 'badge-danger';
                estadoIcono = '❌';
                estadoTexto = 'PERDIDA';
            } else if (a.estado === 'completado') {
                estadoClass = 'badge-info';
                estadoIcono = '🟢';
                estadoTexto = 'ACTIVA';
            } else if (a.estado === 'cancelada') {
                estadoClass = 'badge-secondary';
                estadoIcono = '⛔';
                estadoTexto = 'CANCELADA';
            }
            cellEstado.innerHTML = `<span class="badge ${estadoClass}">${estadoIcono} ${estadoTexto}</span>`;
            cellEstado.style.textAlign = 'center';
            
            const cellFecha = row.insertCell(6);
            const fechaObj = new Date(a.fecha_apuesta);
            const fechaFormateada = fechaObj.toLocaleDateString('es-ES', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
            cellFecha.innerHTML = `<i class="far fa-calendar-alt"></i> ${fechaFormateada}`;
            cellFecha.style.whiteSpace = 'nowrap';
        }
        
        const totalApuestas = apuestas.length;
        const ganadas = apuestas.filter(a => a.estado === 'ganada').length;
        const perdidas = apuestas.filter(a => a.estado === 'perdida').length;
        
        const totalSpan = document.getElementById('totalApuestasCount');
        const ganadasSpan = document.getElementById('apuestasGanadasCount');
        const perdidasSpan = document.getElementById('apuestasPerdidasCount');
        
        if (totalSpan) totalSpan.textContent = totalApuestas;
        if (ganadasSpan) ganadasSpan.textContent = ganadas;
        if (perdidasSpan) perdidasSpan.textContent = perdidas;
        
    } catch (error) {
        console.error('Error cargando apuestas:', error);
        tbody.innerHTML = '<tr><td colspan="7" class="text-center">❌ Error: ' + error.message + '</td></tr>';
    }
}

// ==========================================
// HISTORIAL DE PAGOS
// ==========================================
async function cargarHistorialPagos() {
    const tbody = document.getElementById('tablaHistorialPagos');
    if (!tbody) return;
    
    tbody.innerHTML = '<tr><td colspan="6" class="text-center">Cargando...</td></tr>';
    
    try {
        const user = await getCurrentUser();
        if (!user) return;
        
        const { data: pagos, error } = await supabase
            .from('pagos')
            .select('*')
            .eq('cedula_usuario', user.cedula)
            .order('fecha_solicitud', { ascending: false });
        
        if (error) throw error;
        
        if (!pagos || pagos.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center">No hay pagos</td></tr>';
            return;
        }
        
        let totalDepositos = 0;
        let totalRetiros = 0;
        let totalFichasMovidas = 0;
        
        pagos.forEach(p => {
            totalFichasMovidas += p.monto;
            if (p.tipo_pago === 'deposito') {
                totalDepositos += p.monto;
            } else {
                totalRetiros += p.monto;
            }
        });
        
        const totalDepositosSpan = document.getElementById('totalDepositos');
        const totalRetirosSpan = document.getElementById('totalRetiros');
        const totalFichasMovidasSpan = document.getElementById('totalFichasMovidas');
        
        if (totalDepositosSpan) totalDepositosSpan.textContent = totalDepositos;
        if (totalRetirosSpan) totalRetirosSpan.textContent = totalRetiros;
        if (totalFichasMovidasSpan) totalFichasMovidasSpan.textContent = totalFichasMovidas;
        
        tbody.innerHTML = pagos.map(p => {
            let estadoClass = 'badge-warning';
            let estadoTexto = p.estado;
            let metodoTexto = p.metodo_pago === 'pago_movil' ? '📱 Pago Móvil' : '🏦 Transferencia';
            
            if (p.estado === 'completado') {
                estadoClass = 'badge-success';
                estadoTexto = 'COMPLETADO';
            } else if (p.estado === 'cancelado') {
                estadoClass = 'badge-danger';
                estadoTexto = 'CANCELADO';
            } else {
                estadoClass = 'badge-warning';
                estadoTexto = 'PENDIENTE';
            }
            
            return `
                <tr>
                    <td><strong>${p.monto} 🪙</strong></td>
                    <td><span class="badge ${p.tipo_pago === 'deposito' ? 'badge-success' : 'badge-warning'}">${p.tipo_pago === 'deposito' ? 'Depósito' : 'Retiro'}</span></td>
                    <td>${metodoTexto}</td>
                    <td><code>${p.referencia || 'N/A'}</code></td>
                    <td><span class="badge ${estadoClass}">${estadoTexto}</span></td>
                    <td>${new Date(p.fecha_solicitud).toLocaleString()}</td>
                </tr>
            `;
        }).join('');
        
    } catch (error) {
        console.error('Error:', error);
        tbody.innerHTML = '<tr><td colspan="6" class="text-center">Error</td></tr>';
    }
}

// ==========================================
// ANIMACIONES DE LETRAS PARA RESULTADOS MEJORADAS
// ==========================================

// ==========================================
// ANIMACIÓN DE GOOOL CON IMAGEN Y FUEGOS ARTIFICIALES
// ==========================================
function mostrarAnimacionGol(montoApostado, ganancia, nuevoSaldo) {
    // Crear overlay principal
    const overlay = document.createElement('div');
    overlay.className = 'gol-overlay';
    
    // Contenedor de fuegos artificiales (canvas)
    const canvas = document.createElement('canvas');
    canvas.id = 'fireworksCanvas';
    canvas.style.position = 'absolute';
    canvas.style.top = '0';
    canvas.style.left = '0';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.pointerEvents = 'none';
    overlay.appendChild(canvas);
    
    // Contenido principal
    const container = document.createElement('div');
    container.className = 'gol-container';
    
    // Imagen de GOOL
    const imgGol = document.createElement('img');
    imgGol.src = 'carrusel/gool.png';
    imgGol.className = 'gol-imagen';
    imgGol.alt = '¡GOOOL!';
    imgGol.onerror = function() {
        // Si no encuentra la imagen, mostrar texto como fallback
        this.style.display = 'none';
        const textoGol = document.createElement('div');
        textoGol.className = 'gol-texto-fallback';
        textoGol.innerHTML = '<span>G</span><span>O</span><span>O</span><span>L</span><span>!</span>';
        container.appendChild(textoGol);
    };
    container.appendChild(imgGol);
    
    // Subtexto
    const subtexto = document.createElement('div');
    subtexto.className = 'gol-subtexto';
    subtexto.innerHTML = '🎉 ¡GANASTE LA APUESTA! 🎉';
    container.appendChild(subtexto);
    
    // Detalles de la ganancia
    const detalles = document.createElement('div');
    detalles.className = 'gol-detalles';
    detalles.innerHTML = `
        <div class="detalle-item">
            <i class="fas fa-coins"></i>
            <span>Monto: <strong>${montoApostado.toLocaleString()}</strong> fichas</span>
        </div>
        <div class="detalle-item ganancia">
            <i class="fas fa-trophy"></i>
            <span>Ganancia: <strong>+${Math.floor(ganancia).toLocaleString()}</strong> fichas</span>
        </div>
        <div class="detalle-item">
            <i class="fas fa-wallet"></i>
            <span>Nuevo saldo: <strong>${nuevoSaldo.toLocaleString()}</strong> fichas</span>
        </div>
    `;
    container.appendChild(detalles);
    
    // Botón para cerrar
    const btnCerrar = document.createElement('button');
    btnCerrar.className = 'gol-cerrar-btn';
    btnCerrar.innerHTML = '<i class="fas fa-futbol"></i> ¡SEGUIR APOSTANDO! <i class="fas fa-futbol"></i>';
    btnCerrar.onclick = () => {
        if (fireworksInterval) clearInterval(fireworksInterval);
        if (animationId) cancelAnimationFrame(animationId);
        overlay.remove();
    };
    container.appendChild(btnCerrar);
    
    overlay.appendChild(container);
    document.body.appendChild(overlay);
    
    // Iniciar fuegos artificiales
    let fireworksInterval, animationId = null;
    
    // Configurar canvas para fuegos artificiales
    const ctx = canvas.getContext('2d');
    let particles = [];
    
    function resizeCanvas() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }
    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();
    
    // Clase para partículas de fuegos artificiales
    class FireworkParticle {
        constructor(x, y, color) {
            this.x = x;
            this.y = y;
            this.color = color;
            this.size = Math.random() * 4 + 2;
            this.speedX = (Math.random() - 0.5) * 8;
            this.speedY = (Math.random() - 0.5) * 8 - 2;
            this.gravity = 0.15;
            this.alpha = 1;
            this.decay = 0.02 + Math.random() * 0.02;
        }
        
        update() {
            this.speedY += this.gravity;
            this.x += this.speedX;
            this.y += this.speedY;
            this.alpha -= this.decay;
            return this.alpha > 0;
        }
        
        draw() {
            ctx.save();
            ctx.globalAlpha = this.alpha;
            ctx.fillStyle = this.color;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
    }
    
    function crearExplosion(x, y) {
        const colores = ['#ff0000', '#ff6600', '#ffcc00', '#00ff00', '#00ccff', '#ff00ff', '#ffffff', '#ff3333', '#ffff00', '#ff9900'];
        const numParticulas = 50 + Math.floor(Math.random() * 40);
        for (let i = 0; i < numParticulas; i++) {
            const color = colores[Math.floor(Math.random() * colores.length)];
            particles.push(new FireworkParticle(x, y, color));
        }
    }
    
    function generarFuegosArtificiales() {
        const numExplosiones = 4 + Math.floor(Math.random() * 4);
        for (let i = 0; i < numExplosiones; i++) {
            const x = Math.random() * canvas.width;
            const y = Math.random() * canvas.height * 0.7;
            setTimeout(() => crearExplosion(x, y), i * 120);
        }
        
        setTimeout(() => {
            crearExplosion(canvas.width / 2 + (Math.random() - 0.5) * 250, canvas.height / 2 + (Math.random() - 0.5) * 150);
        }, 80);
        setTimeout(() => {
            crearExplosion(canvas.width / 2 + (Math.random() - 0.5) * 200, canvas.height / 2 + (Math.random() - 0.5) * 180);
        }, 250);
    }
    
    function animarFuegos() {
        if (!canvas.parentNode) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        let alive = false;
        for (let i = 0; i < particles.length; i++) {
            if (particles[i].update()) {
                particles[i].draw();
                alive = true;
            } else {
                particles.splice(i, 1);
                i--;
            }
        }
        
        if (alive) {
            animationId = requestAnimationFrame(animarFuegos);
        } else {
            if (animationId) cancelAnimationFrame(animationId);
            animationId = null;
        }
    }
    
    // Generar fuegos artificiales cada 1.5 segundos
    fireworksInterval = setInterval(() => {
        if (document.body.contains(overlay)) {
            generarFuegosArtificiales();
            if (!animationId && particles.length > 0) {
                animarFuegos();
            } else if (particles.length === 0) {
                generarFuegosArtificiales();
                animarFuegos();
            }
        } else {
            clearInterval(fireworksInterval);
        }
    }, 1500);
    
    // Generar explosión inicial
    setTimeout(() => {
        generarFuegosArtificiales();
        animarFuegos();
    }, 100);
    
    setTimeout(() => {
        generarFuegosArtificiales();
    }, 500);
    
    // Auto-cerrar después de 8 segundos
    setTimeout(() => {
        if (overlay && overlay.parentNode) {
            if (fireworksInterval) clearInterval(fireworksInterval);
            if (animationId) cancelAnimationFrame(animationId);
            overlay.remove();
        }
    }, 8000);
}

// ==========================================
// ANIMACIÓN DE PERDISTE CON FRASE ANIMADA
// ==========================================
function mostrarAnimacionPerdiste(montoApostado, nuevoSaldo) {
    const overlay = document.createElement('div');
    overlay.className = 'perdiste-overlay';
    
    const container = document.createElement('div');
    container.className = 'perdiste-container';
    
    // Frase animada "PERDISTE"
    const textoPerdiste = document.createElement('div');
    textoPerdiste.className = 'perdiste-texto-animado';
    const letras = ['P', 'E', 'R', 'D', 'I', 'S', 'T', 'E'];
    letras.forEach((letra, index) => {
        const span = document.createElement('span');
        span.textContent = letra;
        span.style.animationDelay = `${index * 0.1}s`;
        textoPerdiste.appendChild(span);
    });
    container.appendChild(textoPerdiste);
    
    // Subtexto de ánimo
    const subtexto = document.createElement('div');
    subtexto.className = 'perdiste-subtexto';
    subtexto.innerHTML = '💪 ¡ÁNIMO! LA PRÓXIMA SERÁ MEJOR 💪';
    container.appendChild(subtexto);
    
    // Detalles de la pérdida
    const detalles = document.createElement('div');
    detalles.className = 'perdiste-detalles';
    detalles.innerHTML = `
        <div class="detalle-item perdido">
            <i class="fas fa-coins"></i>
            <span>Monto perdido: <strong>${montoApostado.toLocaleString()}</strong> fichas</span>
        </div>
        <div class="detalle-item">
            <i class="fas fa-wallet"></i>
            <span>Saldo actual: <strong>${nuevoSaldo.toLocaleString()}</strong> fichas</span>
        </div>
        <div class="detalle-item consejo">
            <i class="fas fa-lightbulb"></i>
            <span>⭐ ¡No te rindas, la próxima puede ser la buena! ⭐</span>
        </div>
    `;
    container.appendChild(detalles);
    
    // Botón para cerrar
    const btnCerrar = document.createElement('button');
    btnCerrar.className = 'perdiste-cerrar-btn';
    btnCerrar.innerHTML = '<i class="fas fa-redo-alt"></i> ¡PROBAR SUERTE DE NUEVO! <i class="fas fa-redo-alt"></i>';
    btnCerrar.onclick = () => overlay.remove();
    container.appendChild(btnCerrar);
    
    overlay.appendChild(container);
    document.body.appendChild(overlay);
    
    // Auto-cerrar después de 5 segundos
    setTimeout(() => {
        if (overlay && overlay.parentNode) overlay.remove();
    }, 5000);
}

function mostrarResultadoAnimado(tipo, montoApostado, ganancia, nuevoSaldo) {
    if (tipo === 'ganaste') {
        mostrarAnimacionGol(montoApostado, ganancia, nuevoSaldo);
    } else {
        mostrarAnimacionPerdiste(montoApostado, nuevoSaldo);
    }
}

async function verificarResultadosApuestas() {
    try {
        const user = await getCurrentUser();
        if (!user) return;
        
        const { data: apuestas, error } = await supabase
            .from('apuestas')
            .select(`*, enfrentamientos(*)`)
            .eq('cedula_usuario', user.cedula)
            .in('estado', ['ganada', 'perdida'])
            .is('notificado', null)
            .order('fecha_resolucion', { ascending: false });
        
        if (error) throw error;
        
        if (apuestas && apuestas.length > 0) {
            for (const apuesta of apuestas) {
                await supabase
                    .from('apuestas')
                    .update({ notificado: true, notificado_en: new Date().toISOString() })
                    .eq('id', apuesta.id);
                
                const montoApostado = apuesta.monto_apostado;
                const ganancia = apuesta.ganancia_potencial || 0;
                
                const { data: userData } = await supabase
                    .from('usuarios')
                    .select('saldo_monedas')
                    .eq('cedula', user.cedula)
                    .single();
                
                const nuevoSaldo = userData?.saldo_monedas || 0;
                
                if (apuesta.estado === 'ganada') {
                    mostrarResultadoAnimado('ganaste', montoApostado, ganancia, nuevoSaldo);
                } else if (apuesta.estado === 'perdida') {
                    mostrarResultadoAnimado('perdiste', montoApostado, 0, nuevoSaldo);
                }
            }
        }
        
    } catch (error) {
        console.error('Error verificando resultados:', error);
    }
}

// ==========================================
// UTILIDADES
// ==========================================
function cerrarModalPrediccion() {
    document.getElementById('apuestaModal').style.display = 'none';
    partidoSeleccionado = null;
    window.prediccionSeleccionada = null;
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}

function mostrarNotificacion(mensaje, tipo = 'info') {
    let toast = document.getElementById('toastNotification');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'toastNotification';
        toast.style.cssText = 'position:fixed;bottom:20px;right:20px;padding:12px 24px;border-radius:8px;color:white;font-weight:500;z-index:9999;animation:slideInRight 0.3s ease;box-shadow:0 4px 12px rgba(0,0,0,0.15);';
        document.body.appendChild(toast);
        
        if (!document.querySelector('#toastAnimation')) {
            const style = document.createElement('style');
            style.textContent = '@keyframes slideInRight{from{transform:translateX(100%);opacity:0}to{transform:translateX(0);opacity:1}}';
            document.head.appendChild(style);
        }
    }
    
    const colores = { success: '#2ecc71', error: '#e74c3c', warning: '#f39c12', info: '#3498db' };
    toast.style.backgroundColor = colores[tipo] || colores.info;
    toast.textContent = mensaje;
    toast.style.display = 'block';
    setTimeout(() => toast.style.display = 'none', 3000);
}

window.logout = function() {
    if (confirm('¿Cerrar sesión?')) {
        localStorage.removeItem('userSession');
        window.location.href = 'index.html';
    }
};

window.cerrarModalPrediccion = cerrarModalPrediccion;
window.cargarMisApuestas = cargarMisApuestas;
window.cargarHistorialPagos = cargarHistorialPagos;
window.inicializarSwiper = inicializarSwiper;