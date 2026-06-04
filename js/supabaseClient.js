// js/supabaseClient.js
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm'

const supabaseUrl = 'https://ebgqbbsagemyoacaptmw.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImViZ3FiYnNhZ2VteW9hY2FwdG13Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY1NTE2MTUsImV4cCI6MjA5MjEyNzYxNX0.q-aHsgFuh2RMR-uzPBRmJpxB0KqeANB5W0Ktbk-1P8o'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Configuración
export const CONFIG = {
    MONEDA: 'Fichas',
    SIMBOLO: '🪙',
    FICHAS_INICIALES: 1000,
    FICHAS_RECARGA: 500,
    MIN_APUESTA: 10,
    MAX_APUESTA: 500
}

// ==========================================
// LOGIN Y REGISTRO
// ==========================================

export async function loginUser(email, password) {
    try {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) return { success: false, error: error.message }
        if (!data.user) return { success: false, error: 'Usuario no encontrado' }

        const { data: userData, error: userError } = await supabase
            .from('usuarios')
            .select('*')
            .eq('email', email)
            .single()

        if (userError) {
            const cedula = 'V' + Date.now().toString().slice(-8)
            const { data: newUser, error: insertError } = await supabase
                .from('usuarios')
                .insert([{
                    cedula,
                    nombre: data.user.user_metadata?.nombre || email.split('@')[0],
                    email,
                    telefono: '0000000000',
                    contrasena_hash: 'AUTH',
                    rol: 'user',
                    saldo_monedas: CONFIG.FICHAS_INICIALES,
                    activo: true,
                    auth_id: data.user.id
                }])
                .select()
                .single()
            
            if (insertError) return { success: false, error: insertError.message }
            localStorage.setItem('userSession', JSON.stringify(newUser))
            return { success: true, user: newUser }
        }

        localStorage.setItem('userSession', JSON.stringify(userData))
        return { success: true, user: userData }
    } catch (error) {
        return { success: false, error: error.message }
    }
}

export async function registerUser(email, password, nombre, cedula, telefono = '') {
    try {
        console.log('📝 Registrando usuario con cédula:', cedula);
        
        const { data: authData, error: authError } = await supabase.auth.signUp({
            email, 
            password,
            options: { 
                data: { nombre } 
            }
        })
        
        if (authError) return { success: false, error: authError.message }

        const { data: rpcResult, error: rpcError } = await supabase.rpc('crear_usuario_manual', {
            p_id_usuario: authData.user.id,
            p_correo: email,
            p_nombre: nombre,
            p_cedula: cedula,
            p_telefono: telefono || '0000000000',
            p_rol: 'user',
            p_fichas: CONFIG.FICHAS_INICIALES
        })

        if (rpcError) {
            console.error('❌ Error en RPC:', rpcError);
            return { success: false, error: rpcError.message }
        }

        if (rpcResult && rpcResult.success === false) {
            return { success: false, error: rpcResult.error }
        }

        console.log('✅ Usuario creado exitosamente:', rpcResult);
        return { success: true, user: rpcResult }
    } catch (error) {
        console.error('❌ Error en registro:', error);
        return { success: false, error: error.message }
    }
}

export async function logoutUser() {
    await supabase.auth.signOut()
    localStorage.clear()
    window.location.href = 'index.html'
}

export function validateEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

// ==========================================
// FUNCIONES DE ADMINISTRACIÓN
// ==========================================

export async function getUsers() {
    const { data, error } = await supabase
        .from('usuarios')
        .select('*')
        .order('nombre', { ascending: true })
    
    if (error) throw error
    return data.map(user => ({
        id: user.cedula,
        username: user.nombre,
        email: user.email,
        chips: user.saldo_monedas,
        active: user.activo,
        rol: user.rol
    }))
}

export async function updateUserChips(userId, chips) {
    const { error } = await supabase
        .from('usuarios')
        .update({ saldo_monedas: chips })
        .eq('cedula', userId)
    
    if (error) throw error
    return true
}

export async function toggleUserStatus(userId, active) {
    const { error } = await supabase
        .from('usuarios')
        .update({ activo: active })
        .eq('cedula', userId)
    
    if (error) throw error
    return true
}

export async function updateUserRole(userId, newRole) {
    const { error } = await supabase
        .from('usuarios')
        .update({ rol: newRole })
        .eq('cedula', userId)
    
    if (error) throw error
    return true
}

export async function registerUserFromAdmin(userData) {
    try {
        console.log('Iniciando registro de usuario:', userData.email);
        
        const { data: authData, error: authError } = await supabase.auth.signUp({
            email: userData.email,
            password: userData.password,
            options: {
                data: {
                    nombre: userData.nombre
                }
            }
        });
        
        let authId = null;
        
        if (authError) {
            console.log('Error auth:', authError.message);
            
            if (authError.message.includes('already registered') || 
                authError.message.includes('already exists') ||
                authError.message.includes('duplicate')) {
                
                const { data: existingUser } = await supabase
                    .from('usuarios')
                    .select('cedula, email')
                    .eq('email', userData.email)
                    .maybeSingle();
                
                if (existingUser) {
                    return { success: false, error: 'El email ya está registrado en el sistema' };
                }
            } else {
                throw authError;
            }
        } else {
            authId = authData?.user?.id;
            console.log('Usuario auth creado:', authId);
        }
        
        const cedula = userData.cedula || ('V' + Date.now().toString().slice(-8));
        
        const { data: rpcResult, error: rpcError } = await supabase.rpc('crear_usuario_manual', {
            p_id_usuario: authId,
            p_correo: userData.email,
            p_nombre: userData.nombre,
            p_cedula: cedula,
            p_telefono: userData.telefono || '0000000000',
            p_rol: userData.rol || 'user',
            p_fichas: userData.fichas || CONFIG.FICHAS_INICIALES
        });
        
        if (rpcError) {
            console.error('Error RPC:', rpcError);
            throw new Error('Error al crear usuario: ' + rpcError.message);
        }
        
        if (rpcResult && rpcResult.success === false) {
            throw new Error(rpcResult.error || 'Error desconocido al crear usuario');
        }
        
        console.log('Usuario creado exitosamente:', rpcResult);
        
        return { 
            success: true, 
            user: rpcResult,
            mensaje: 'Usuario registrado exitosamente como ' + userData.rol
        };
        
    } catch (error) {
        console.error('Error registrando usuario:', error);
        return { success: false, error: error.message || 'Error al registrar usuario' };
    }
}

export async function getUserBets(userId) {
    const { data, error } = await supabase
        .from('apuestas')
        .select(`
            *,
            enfrentamientos (
                equipo_local,
                equipo_visitante,
                estado
            )
        `)
        .eq('cedula_usuario', userId)
        .order('fecha_apuesta', { ascending: false })
    
    if (error) throw error
    return data.map(apuesta => ({
        id: apuesta.id,
        usuarioId: apuesta.cedula_usuario,
        partido: apuesta.enfrentamientos ? 
            `${apuesta.enfrentamientos.equipo_local} vs ${apuesta.enfrentamientos.equipo_visitante}` : '',
        seleccion: apuesta.seleccion,
        monto: apuesta.monto_apostado,
        cuota: apuesta.cuota_aplicada,
        ganancia: apuesta.ganancia_potencial,
        estado: apuesta.estado === 'ganada' ? 'pagada' : 
                apuesta.estado === 'perdida' ? 'perdida' : 
                apuesta.estado === 'completado' ? 'completado' : 'pendiente',
        fecha: apuesta.fecha_apuesta
    }))
}

export async function getAllBets() {
    const { data, error } = await supabase
        .from('apuestas')
        .select(`
            *,
            enfrentamientos (
                equipo_local,
                equipo_visitante,
                estado
            )
        `)
        .order('fecha_apuesta', { ascending: false })
        .limit(100)
    
    if (error) throw error
    return data.map(apuesta => ({
        id: apuesta.id,
        usuarioId: apuesta.cedula_usuario,
        usuarioNombre: apuesta.cedula_usuario?.slice(0, 8),
        partido: apuesta.enfrentamientos ? 
            `${apuesta.enfrentamientos.equipo_local} vs ${apuesta.enfrentamientos.equipo_visitante}` : '',
        seleccion: apuesta.seleccion,
        monto: apuesta.monto_apostado,
        cuota: apuesta.cuota_aplicada,
        ganancia: apuesta.ganancia_potencial,
        estado: apuesta.estado === 'ganada' ? 'pagada' : 
                apuesta.estado === 'perdida' ? 'perdida' : 
                apuesta.estado === 'completado' ? 'completado' : 'pendiente',
        fecha: apuesta.fecha_apuesta
    }))
}

export async function createMatch(matchData) {
    const { data, error } = await supabase
        .from('enfrentamientos')
        .insert([{
            equipo_local: matchData.local,
            equipo_visitante: matchData.visitante,
            fecha_hora: matchData.fecha,
            cuota_local: matchData.cuotaLocal,
            cuota_empate: matchData.cuotaEmpate,
            cuota_visitante: matchData.cuotaVisitante,
            estado: 'programado',
            goles_local: 0,
            goles_visitante: 0,
            minuto_actual: 0
        }])
        .select()
        .single()
    
    if (error) throw error
    return {
        id: data.codigo,
        local: data.equipo_local,
        visitante: data.equipo_visitante,
        fecha: data.fecha_hora,
        competicion: data.competicion,
        cuotaLocal: data.cuota_local,
        cuotaEmpate: data.cuota_empate,
        cuotaVisitante: data.cuota_visitante,
        estado: data.estado,
        marcador: `${data.goles_local}-${data.goles_visitante}`,
        minuto: data.minuto_actual
    }
}

export async function updateMatchScore(matchId, localGoles, visitanteGoles, minuto, estado) {
    const updateData = {
        goles_local: localGoles,
        goles_visitante: visitanteGoles,
        minuto_actual: minuto,
        estado: estado
    }
    
    if (estado === 'finalizado') {
        const ganador = localGoles > visitanteGoles ? 'local' : 
                        localGoles < visitanteGoles ? 'visitante' : 'empate'
        updateData.ganador = ganador
        updateData.resultado_local_final = localGoles
        updateData.resultado_visitante_final = visitanteGoles
        
        await processBetsByMatch(matchId, localGoles, visitanteGoles)
    }
    
    const { error } = await supabase
        .from('enfrentamientos')
        .update(updateData)
        .eq('codigo', matchId)
    
    if (error) throw error
    return true
}

async function processBetsByMatch(matchId, localGoles, visitanteGoles) {
    const resultado = localGoles > visitanteGoles ? 'local' : 
                      localGoles < visitanteGoles ? 'visitante' : 'empate'
    
    const { data: apuestas, error } = await supabase
        .from('apuestas')
        .select('*')
        .eq('enfrentamiento_codigo', matchId)
        .in('estado', ['completado', 'pendiente'])
    
    if (error || !apuestas.length) return
    
    for (const apuesta of apuestas) {
        const esGanada = apuesta.seleccion === resultado
        const ganancia = esGanada ? Math.floor(apuesta.monto_apostado * apuesta.cuota_aplicada) : 0
        
        await supabase
            .from('apuestas')
            .update({
                estado: esGanada ? 'ganada' : 'perdida',
                fecha_liquidacion: new Date().toISOString()
            })
            .eq('id', apuesta.id)
        
        if (esGanada) {
            const { data: usuario } = await supabase
                .from('usuarios')
                .select('saldo_monedas')
                .eq('cedula', apuesta.cedula_usuario)
                .single()
            
            if (usuario) {
                const nuevoSaldo = usuario.saldo_monedas + ganancia
                await supabase
                    .from('usuarios')
                    .update({ saldo_monedas: nuevoSaldo })
                    .eq('cedula', apuesta.cedula_usuario)
                
                await supabase.from('transacciones').insert({
                    cedula_usuario: apuesta.cedula_usuario,
                    apuesta_id: apuesta.id,
                    monto: ganancia,
                    tipo_transaccion: 'ganancia_recibida',
                    saldo_anterior: usuario.saldo_monedas,
                    saldo_nuevo: nuevoSaldo,
                    descripcion: `Ganancia por apuesta #${apuesta.id}`
                })
            }
        }
    }
}

export async function getMatches() {
    const { data, error } = await supabase
        .from('enfrentamientos')
        .select('*')
        .order('fecha_hora', { ascending: false })
    
    if (error) throw error
    return data.map(match => ({
        id: match.codigo,
        local: match.equipo_local,
        visitante: match.equipo_visitante,
        fecha: match.fecha_hora,
        competicion: match.competicion,
        cuotaLocal: match.cuota_local,
        cuotaEmpate: match.cuota_empate,
        cuotaVisitante: match.cuota_visitante,
        estado: match.estado,
        marcador: `${match.goles_local}-${match.goles_visitante}`,
        minuto: match.minuto_actual
    }))
}

export async function getMatch(matchId) {
    const { data, error } = await supabase
        .from('enfrentamientos')
        .select('*')
        .eq('codigo', matchId)
        .single()
    
    if (error) return null
    return {
        id: data.codigo,
        local: data.equipo_local,
        visitante: data.equipo_visitante,
        fecha: data.fecha_hora,
        competicion: data.competicion,
        cuotaLocal: data.cuota_local,
        cuotaEmpate: data.cuota_empate,
        cuotaVisitante: data.cuota_visitante,
        estado: data.estado,
        marcador: `${data.goles_local}-${data.goles_visitante}`,
        minuto: data.minuto_actual
    }
}

export async function getLiveMatches() {
    const { data, error } = await supabase
        .from('enfrentamientos')
        .select('*')
        .eq('estado', 'en_vivo')
    
    if (error) throw error
    return data.map(match => ({
        id: match.codigo,
        local: match.equipo_local,
        visitante: match.equipo_visitante,
        fecha: match.fecha_hora,
        competicion: match.competicion,
        cuotaLocal: match.cuota_local,
        cuotaEmpate: match.cuota_empate,
        cuotaVisitante: match.cuota_visitante,
        estado: 'vivo',
        marcador: `${match.goles_local}-${match.goles_visitante}`,
        minuto: match.minuto_actual
    }))
}

export async function getDashboardStats() {
    const { count: totalUsers } = await supabase
        .from('usuarios')
        .select('*', { count: 'exact', head: true })
    
    const today = new Date().toISOString().split('T')[0]
    const { count: totalBetsToday } = await supabase
        .from('apuestas')
        .select('*', { count: 'exact', head: true })
        .gte('fecha_apuesta', today)
    
    const { data: betsToday } = await supabase
        .from('apuestas')
        .select('monto_apostado')
        .gte('fecha_apuesta', today)
    
    const totalChipsBet = betsToday?.reduce((sum, bet) => sum + bet.monto_apostado, 0) || 0
    
    const { count: liveMatches } = await supabase
        .from('enfrentamientos')
        .select('*', { count: 'exact', head: true })
        .eq('estado', 'en_vivo')
    
    return {
        totalUsers: totalUsers || 0,
        totalBetsToday: totalBetsToday || 0,
        totalChipsBet: totalChipsBet,
        liveMatches: liveMatches || 0
    }
}

export async function getRecentActivities() {
    const { data: apuestas, error } = await supabase
        .from('apuestas')
        .select(`
            *,
            enfrentamientos (equipo_local, equipo_visitante)
        `)
        .order('fecha_apuesta', { ascending: false })
        .limit(10)
    
    if (error) return []
    
    return apuestas.map(apuesta => ({
        usuario: apuesta.cedula_usuario?.slice(0, 8),
        descripcion: `Apuesta a ${apuesta.seleccion} en ${apuesta.enfrentamientos?.equipo_local} vs ${apuesta.enfrentamientos?.equipo_visitante}`,
        monto: apuesta.monto_apostado,
        fecha: new Date(apuesta.fecha_apuesta).toLocaleString()
    }))
}

// ==========================================
// SINCRONIZACIÓN - CREA PARTIDOS DE EJEMPLO DIRECTAMENTE
// ==========================================

export async function syncMatchesFromAPI() {
    try {
        console.log('🔄 Creando partidos de ejemplo...');
        
        const partidosEjemplo = [
            { local: "Real Madrid", visitante: "Barcelona", liga: "La Liga", dias: 2 },
            { local: "Manchester City", visitante: "Liverpool", liga: "Premier League", dias: 3 },
            { local: "Bayern Munich", visitante: "Borussia Dortmund", liga: "Bundesliga", dias: 4 },
            { local: "PSG", visitante: "Marseille", liga: "Ligue 1", dias: 5 },
            { local: "Inter Milan", visitante: "AC Milan", liga: "Serie A", dias: 6 },
            { local: "Atletico Madrid", visitante: "Sevilla", liga: "La Liga", dias: 7 },
            { local: "Arsenal", visitante: "Chelsea", liga: "Premier League", dias: 8 },
            { local: "Juventus", visitante: "Napoli", liga: "Serie A", dias: 9 }
        ];
        
        let creados = 0;
        let yaExisten = 0;
        
        for (const partido of partidosEjemplo) {
            // Verificar si ya existe un partido similar
            const { data: existente, error: checkError } = await supabase
                .from('enfrentamientos')
                .select('codigo')
                .eq('equipo_local', partido.local)
                .eq('equipo_visitante', partido.visitante)
                .maybeSingle();
            
            if (checkError) {
                console.error('Error verificando existencia:', checkError);
            }
            
            if (!existente) {
                const fecha = new Date();
                fecha.setDate(fecha.getDate() + partido.dias);
                
                const cuotaLocal = (1.8 + Math.random() * 1.5).toFixed(2);
                const cuotaEmpate = (3.0 + Math.random() * 0.8).toFixed(2);
                const cuotaVisitante = (2.0 + Math.random() * 1.8).toFixed(2);
                
                const { error: insertError } = await supabase
                    .from('enfrentamientos')
                    .insert({
                        equipo_local: partido.local,
                        equipo_visitante: partido.visitante,
                        fecha_hora: fecha.toISOString(),
                        competicion: partido.liga,
                        cuota_local: parseFloat(cuotaLocal),
                        cuota_empate: parseFloat(cuotaEmpate),
                        cuota_visitante: parseFloat(cuotaVisitante),
                        estado: 'programado',
                        goles_local: 0,
                        goles_visitante: 0,
                        minuto_actual: 0
                    });
                
                if (insertError) {
                    console.error(`❌ Error creando ${partido.local}:`, insertError.message);
                } else {
                    creados++;
                    console.log(`✅ Creado: ${partido.local} vs ${partido.visitante}`);
                }
            } else {
                yaExisten++;
                console.log(`⚠️ Ya existe: ${partido.local} vs ${partido.visitante}`);
            }
        }
        
        // Contar partidos totales
        const { count: totalPartidos } = await supabase
            .from('enfrentamientos')
            .select('*', { count: 'exact', head: true });
        
        let mensaje = '';
        if (creados > 0) {
            mensaje = `✅ Se crearon ${creados} partidos nuevos. Total en sistema: ${totalPartidos}`;
        } else if (yaExisten > 0) {
            mensaje = `📋 Ya existen ${yaExisten} partidos. Total en sistema: ${totalPartidos}`;
        } else {
            mensaje = `⚠️ No se pudo crear ningún partido. Verifica la conexión a Supabase.`;
        }
        
        return {
            success: true,
            mensaje: mensaje,
            nuevos: creados,
            total: totalPartidos
        };
        
    } catch (error) {
        console.error('❌ Error en syncMatchesFromAPI:', error);
        return {
            success: false,
            mensaje: `Error: ${error.message}. Los partidos se pueden crear manualmente desde "Gestionar Partidos".`
        };
    }
}

export async function syncResultsFromAPI() {
    try {
        console.log('🔄 Buscando partidos para actualizar resultados...');
        
        // Buscar partidos programados que ya pasaron su fecha
        const ahora = new Date();
        
        const { data: partidosPendientes, error } = await supabase
            .from('enfrentamientos')
            .select('*')
            .eq('estado', 'programado')
            .lt('fecha_hora', ahora.toISOString());
        
        if (error) throw error;
        
        let actualizados = 0;
        
        for (const partido of partidosPendientes || []) {
            // Generar resultados aleatorios para partidos que pasaron su fecha
            const golesLocal = Math.floor(Math.random() * 5);
            const golesVisitante = Math.floor(Math.random() * 5);
            
            await updateMatchScore(partido.codigo, golesLocal, golesVisitante, 90, 'finalizado');
            actualizados++;
            console.log(`📝 Resultado simulado: ${partido.equipo_local} ${golesLocal}-${golesVisitante} ${partido.equipo_visitante}`);
        }
        
        return {
            success: true,
            mensaje: actualizados > 0 ? `✅ ${actualizados} resultados actualizados` : `ℹ️ No hay partidos pendientes por finalizar`,
            actualizados: actualizados
        };
        
    } catch (error) {
        console.error('❌ Error en syncResultsFromAPI:', error);
        return {
            success: false,
            mensaje: `Error: ${error.message}. Los resultados se pueden ingresar manualmente en "Subir Resultados".`
        };
    }
}

// ==========================================
// FUNCIONES DE USUARIO
// ==========================================

export async function getCurrentUser() {
    const session = localStorage.getItem('userSession')
    if (!session) return null
    
    const userData = JSON.parse(session)
    const { data, error } = await supabase
        .from('usuarios')
        .select('*')
        .eq('cedula', userData.cedula)
        .single()
    
    if (error || !data) {
        localStorage.removeItem('userSession')
        return null
    }
    
    return data
}

export async function getPartidosDisponibles() {
    const { data, error } = await supabase
        .from('enfrentamientos')
        .select('*')
        .in('estado', ['programado', 'en_vivo'])
        .order('fecha_hora', { ascending: true })
    
    if (error) return { success: false, error: error.message }
    return { success: true, data }
}

export async function getPartidosEnVivo() {
    const { data, error } = await supabase
        .from('enfrentamientos')
        .select('*')
        .eq('estado', 'en_vivo')
        .order('fecha_hora', { ascending: true })
    
    if (error) return { success: false, error: error.message }
    return { success: true, data }
}

// ==========================================
// FUNCIÓN REALIZAR APUESTA
// ==========================================

export async function realizarApuesta(cedula, codigoPartido, seleccion, monto, cuota) {
    try {
        const { data: usuario, error: userError } = await supabase
            .from('usuarios')
            .select('saldo_monedas')
            .eq('cedula', cedula)
            .single();
        
        if (userError || !usuario) {
            return { success: false, error: 'Usuario no encontrado' };
        }
        
        if (usuario.saldo_monedas < monto) {
            return { success: false, error: `Saldo insuficiente. Tienes ${usuario.saldo_monedas} fichas` };
        }
        
        const { data: partido, error: matchError } = await supabase
            .from('enfrentamientos')
            .select('estado, fecha_hora')
            .eq('codigo', codigoPartido)
            .single();
        
        if (matchError || !partido) {
            return { success: false, error: 'Partido no encontrado' };
        }
        
        if (partido.estado !== 'programado') {
            return { success: false, error: 'El partido ya comenzó o finalizó' };
        }
        
        const fechaPartido = new Date(partido.fecha_hora);
        if (fechaPartido < new Date()) {
            return { success: false, error: 'El partido ya debería haber comenzado' };
        }
        
        const { data: apuesta, error: apuestaError } = await supabase
            .from('apuestas')
            .insert([{
                cedula_usuario: cedula,
                enfrentamiento_codigo: codigoPartido,
                seleccion: seleccion,
                monto_apostado: monto,
                cuota_aplicada: cuota,
                estado: 'completado',
                fecha_apuesta: new Date().toISOString()
            }])
            .select();
        
        if (apuestaError) {
            console.error('Error al crear apuesta:', apuestaError);
            return { success: false, error: apuestaError.message };
        }
        
        const nuevoSaldo = usuario.saldo_monedas - monto;
        const { error: updateError } = await supabase
            .from('usuarios')
            .update({ saldo_monedas: nuevoSaldo })
            .eq('cedula', cedula);
        
        if (updateError) {
            await supabase.from('apuestas').delete().eq('id', apuesta[0]?.id);
            return { success: false, error: 'Error al actualizar saldo' };
        }
        
        await supabase.from('transacciones').insert({
            cedula_usuario: cedula,
            apuesta_id: apuesta[0]?.id,
            monto: monto,
            tipo_transaccion: 'apuesta_realizada',
            saldo_anterior: usuario.saldo_monedas,
            saldo_nuevo: nuevoSaldo,
            descripcion: `Apuesta COMPLETADA a ${seleccion} - Partido #${codigoPartido}`
        });
        
        const gananciaPotencial = Math.floor(monto * cuota);
        
        return { 
            success: true, 
            nuevasFichas: nuevoSaldo,
            apuestaId: apuesta[0]?.id,
            mensaje: `✅ Apuesta completada por ${monto} fichas. Ganancia potencial: ${gananciaPotencial} fichas`
        };
        
    } catch (error) {
        console.error('Error en realizarApuesta:', error);
        return { success: false, error: error.message };
    }
}

// ==========================================
// FUNCIÓN CANCELAR APUESTA
// ==========================================

export async function cancelarApuesta(apuestaId, cedulaUsuario) {
    try {
        const { data: apuesta, error: getError } = await supabase
            .from('apuestas')
            .select('*, enfrentamientos(*)')
            .eq('id', apuestaId)
            .eq('cedula_usuario', cedulaUsuario)
            .single();
        
        if (getError || !apuesta) {
            return { success: false, error: 'Apuesta no encontrada' };
        }
        
        const fechaPartido = new Date(apuesta.enfrentamientos.fecha_hora);
        const ahora = new Date();
        
        if (fechaPartido <= ahora) {
            return { success: false, error: 'No se puede cancelar: el partido ya comenzó o finalizó' };
        }
        
        if (apuesta.enfrentamientos.estado !== 'programado') {
            return { success: false, error: 'No se puede cancelar: el partido ya está en curso' };
        }
        
        if (apuesta.estado !== 'completado' && apuesta.estado !== 'pendiente') {
            return { success: false, error: 'Esta apuesta ya fue procesada y no se puede cancelar' };
        }
        
        const { data: usuario, error: userError } = await supabase
            .from('usuarios')
            .select('saldo_monedas')
            .eq('cedula', cedulaUsuario)
            .single();
        
        if (userError) {
            return { success: false, error: 'Usuario no encontrado' };
        }
        
        const nuevoSaldo = usuario.saldo_monedas + apuesta.monto_apostado;
        
        const { error: updateError } = await supabase
            .from('usuarios')
            .update({ saldo_monedas: nuevoSaldo })
            .eq('cedula', cedulaUsuario);
        
        if (updateError) {
            return { success: false, error: 'Error al devolver las fichas' };
        }
        
        await supabase
            .from('apuestas')
            .update({ 
                estado: 'cancelada',
                fecha_liquidacion: new Date().toISOString()
            })
            .eq('id', apuestaId);
        
        await supabase.from('transacciones').insert({
            cedula_usuario: cedulaUsuario,
            apuesta_id: apuestaId,
            monto: apuesta.monto_apostado,
            tipo_transaccion: 'ajuste_admin',
            saldo_anterior: usuario.saldo_monedas,
            saldo_nuevo: nuevoSaldo,
            descripcion: `Cancelación de apuesta #${apuestaId} - Devolución de ${apuesta.monto_apostado} fichas`
        });
        
        return { 
            success: true, 
            nuevasFichas: nuevoSaldo,
            mensaje: `✅ Apuesta cancelada. Se devolvieron ${apuesta.monto_apostado} fichas`
        };
        
    } catch (error) {
        console.error('Error cancelando apuesta:', error);
        return { success: false, error: error.message };
    }
}

export async function getApuestasUsuario(cedula) {
    const { data, error } = await supabase
        .from('apuestas')
        .select(`
            *,
            enfrentamientos (*)
        `)
        .eq('cedula_usuario', cedula)
        .in('estado', ['completado', 'ganada', 'perdida', 'cancelada', 'pendiente'])
        .order('fecha_apuesta', { ascending: false })
    
    if (error) return { success: false, error: error.message }
    return { success: true, data }
}

// ==========================================
// FUNCIONES DE PAGOS
// ==========================================

export async function recargarFichas(cedula, cantidad) {
    try {
        const { data: usuario } = await supabase
            .from('usuarios')
            .select('saldo_monedas')
            .eq('cedula', cedula)
            .single()
        
        if (!usuario) throw new Error('Usuario no encontrado')
        
        const nuevoSaldo = usuario.saldo_monedas + cantidad
        const { error } = await supabase
            .from('usuarios')
            .update({ saldo_monedas: nuevoSaldo })
            .eq('cedula', cedula)
        
        if (error) throw error
        
        return { success: true, nuevasFichas: nuevoSaldo }
    } catch (error) {
        return { success: false, error: error.message }
    }
}

export async function getPayments(filtroEstado = 'pendiente') {
    let query = supabase
        .from('pagos')
        .select(`
            *,
            usuario:cedula_usuario (
                nombre,
                email
            )
        `)
        .order('fecha_solicitud', { ascending: false });
    
    if (filtroEstado !== 'todos') {
        query = query.eq('estado', filtroEstado);
    }
    
    const { data, error } = await query;
    if (error) throw error;
    return data;
}

export async function checkReferenciaDuplicada(referencia) {
    const { data, error } = await supabase
        .rpc('verificar_referencia_duplicada', {
            p_referencia: referencia
        });
    
    if (error) throw error;
    return data;
}

export async function approvePayment(paymentId, adminCedula) {
    const { data, error } = await supabase
        .rpc('aprobar_pago_manual', {
            p_pago_id: paymentId,
            p_admin_cedula: adminCedula
        });
    
    if (error) throw error;
    return data;
}

export async function rejectPayment(paymentId, adminCedula, motivo) {
    const { error: updateError } = await supabase
        .from('pagos')
        .update({
            estado: 'cancelado',
            procesado_por: adminCedula,
            fecha_procesado: new Date().toISOString(),
            observaciones: '❌ Rechazado: ' + motivo
        })
        .eq('id', paymentId);
    
    if (updateError) throw updateError;
    
    await supabase.from('logs_admin').insert([{
        cedula_admin: adminCedula,
        accion: 'procesar_pago',
        detalles: 'Pago #' + paymentId + ' rechazado: ' + motivo
    }]);
    
    return true;
}