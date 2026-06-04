// Este archivo contiene las funciones necesarias para las operaciones de Firebase
// Reemplaza con tu configuración real de Firebase

// Ejemplo de estructura de las funciones que deben existir en services.js:

import { db } from './firebase-config.js';
import { 
    collection, getDocs, getDoc, addDoc, updateDoc, deleteDoc, doc, query, where, orderBy, limit 
} from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';

// Obtener todos los usuarios
export async function getUsers() {
    const usersRef = collection(db, 'users');
    const snapshot = await getDocs(usersRef);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

// Actualizar fichas del usuario
export async function updateUserChips(userId, chips) {
    const userRef = doc(db, 'users', userId);
    await updateDoc(userRef, { chips });
}

// Cambiar estado del usuario
export async function toggleUserStatus(userId, active) {
    const userRef = doc(db, 'users', userId);
    await updateDoc(userRef, { active });
}

// Obtener apuestas de un usuario
export async function getUserBets(userId) {
    const betsRef = collection(db, 'bets');
    const q = query(betsRef, where('userId', '==', userId), orderBy('fecha', 'desc'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

// Obtener todas las apuestas
export async function getAllBets() {
    const betsRef = collection(db, 'bets');
    const q = query(betsRef, orderBy('fecha', 'desc'), limit(100));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

// Crear partido
export async function createMatch(matchData) {
    const matchesRef = collection(db, 'matches');
    const newMatch = {
        ...matchData,
        estado: 'programado',
        marcador: '0-0',
        minuto: 0,
        fecha: new Date(matchData.fecha).toISOString(),
        createdAt: new Date().toISOString()
    };
    const docRef = await addDoc(matchesRef, newMatch);
    return { id: docRef.id, ...newMatch };
}

// Actualizar marcador del partido
export async function updateMatchScore(matchId, localGoles, visitanteGoles, minuto, estado) {
    const matchRef = doc(db, 'matches', matchId);
    const marcador = `${localGoles}-${visitanteGoles}`;
    
    await updateDoc(matchRef, {
        marcador,
        minuto,
        estado,
        resultado: estado === 'finalizado' ? (
            localGoles > visitanteGoles ? 'local' : 
            localGoles < visitanteGoles ? 'visitante' : 'empate'
        ) : null,
        fechaActualizacion: new Date().toISOString()
    });
    
    // Si el partido finalizó, procesar apuestas
    if (estado === 'finalizado') {
        await procesarApuestasPartido(matchId, localGoles, visitanteGoles);
    }
}

// Procesar apuestas al finalizar partido
async function procesarApuestasPartido(matchId, golesLocal, golesVisitante) {
    const betsRef = collection(db, 'bets');
    const q = query(betsRef, where('matchId', '==', matchId), where('estado', '==', 'pendiente'));
    const snapshot = await getDocs(q);
    
    let resultado;
    if (golesLocal > golesVisitante) resultado = 'local';
    else if (golesLocal < golesVisitante) resultado = 'visitante';
    else resultado = 'empate';
    
    for (const betDoc of snapshot.docs) {
        const bet = betDoc.data();
        let nuevoEstado = '';
        let ganancia = 0;
        
        if (bet.seleccion === resultado) {
            nuevoEstado = 'pagada';
            ganancia = bet.monto * bet.cuota;
            
            // Agregar ganancia al usuario
            const userRef = doc(db, 'users', bet.userId);
            const userDoc = await getDoc(userRef);
            if (userDoc.exists()) {
                const chipsActuales = userDoc.data().chips || 0;
                await updateDoc(userRef, { chips: chipsActuales + ganancia });
            }
        } else {
            nuevoEstado = 'perdida';
        }
        
        await updateDoc(betDoc.ref, {
            estado: nuevoEstado,
            ganancia: ganancia,
            resultadoFinal: resultado,
            fechaResolucion: new Date().toISOString()
        });
    }
}

// Obtener todos los partidos
export async function getMatches() {
    const matchesRef = collection(db, 'matches');
    const q = query(matchesRef, orderBy('fecha', 'desc'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

// Obtener un partido específico
export async function getMatch(matchId) {
    const matchRef = doc(db, 'matches', matchId);
    const snapshot = await getDoc(matchRef);
    if (snapshot.exists()) {
        return { id: snapshot.id, ...snapshot.data() };
    }
    return null;
}

// Obtener partidos en vivo
export async function getLiveMatches() {
    const matchesRef = collection(db, 'matches');
    const q = query(matchesRef, where('estado', '==', 'vivo'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

// Obtener estadísticas del dashboard
export async function getDashboardStats() {
    const [users, bets, matches] = await Promise.all([
        getDocs(collection(db, 'users')),
        getDocs(query(collection(db, 'bets'), where('fecha', '>=', new Date().setHours(0, 0, 0, 0)))),
        getDocs(query(collection(db, 'matches'), where('estado', '==', 'vivo')))
    ]);
    
    let totalChipsBet = 0;
    bets.forEach(bet => {
        totalChipsBet += bet.data().monto || 0;
    });
    
    return {
        totalUsers: users.size,
        totalBetsToday: bets.size,
        totalChipsBet: totalChipsBet,
        liveMatches: matches.size
    };
}

// Obtener actividades recientes
export async function getRecentActivities() {
    const activitiesRef = collection(db, 'activities');
    const q = query(activitiesRef, orderBy('fecha', 'desc'), limit(10));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

// Sincronizar partidos desde API externa
export async function syncMatchesFromAPI() {
    // Implementa la llamada a tu API de football-data.org
    // Necesitas una API key
    const response = await fetch('https://api.football-data.org/v4/matches', {
        headers: { 'X-Auth-Token': 'TU_API_KEY_AQUI' }
    });
    const data = await response.json();
    // Procesa y guarda los partidos...
    return { mensaje: 'Sincronización completada', nuevos: data.matches?.length || 0 };
}

// Sincronizar resultados
export async function syncResultsFromAPI() {
    // Similar a syncMatchesFromAPI pero actualizando resultados
    return { mensaje: 'Resultados actualizados', actualizados: 0 };
}