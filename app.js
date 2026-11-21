import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged }
    from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, collection, query, where, getDocs, updateDoc, serverTimestamp }
    from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getMessaging, getToken } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging.js";

// ⚠️ CONFIGURA TU FIREBASE AQUÍ
const firebaseConfig = {
    apiKey: "AIzaSyCKlEyQXSpjnos0Nq4ZSicOQm0TvEmxV8w",
    authDomain: "cartas-8ea04.firebaseapp.com",
    projectId: "cartas-8ea04",
    storageBucket: "cartas-8ea04.firebasestorage.app",
    messagingSenderId: "663895466574",
    appId: "1:663895466574:web:7533015ad2b1282e24191f",
    measurementId: "G-4K2Z2YF1YW"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const messaging = getMessaging(app);
// Registrar el Service Worker
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/firebase-messaging-sw.js')
        .then((reg) => console.log('Service Worker registrado:', reg))
        .catch((err) => console.error('Error Service Worker:', err));
}

let currentUser = null;
let cartaActual = null;
let editando = false;
let audioPlaying = false;

// ===== UTILIDADES =====
const $ = (id) => document.getElementById(id);
const mostrarToast = (msg) => {
    const t = $('toast');
    t.textContent = msg;
    t.classList.add('visible');
    setTimeout(() => t.classList.remove('visible'), 3000);
};
const cerrarModal = (id) => $(id).classList.remove('active');
const abrirModal = (id) => $(id).classList.add('active');

// ===== AUTENTICACIÓN =====
onAuthStateChanged(auth, async (user) => {
    currentUser = user;
    const authText = $('authText');
    const authIcon = $('authIcon');
    if (user) {
        authText.textContent = 'Salir';
        authIcon.className = 'fa-solid fa-right-from-bracket';

        // 👇 NUEVO: pedir permiso y guardar token FCM
        try {
            const permission = await Notification.requestPermission();
            if (permission === 'granted') {
                const token = await getToken(messaging, {
                    vapidKey: 'BNB_xvIAV8GaNjJj0CcP1QVvauaHPChBCW2zFjl0KJvzn5KrSZlByAkGtx51TurSvd7-zwVwgCjOHPAYtpr8W1I' 
                });
                if (token) {
                    await setDoc(doc(db, 'tokens', user.uid), { fcmToken: token });
                    console.log('Token FCM guardado:', token);
                }
            }
        } catch (e) {
            console.error('Error obteniendo token FCM:', e);
        }
    } else {
        authText.textContent = 'Entrar';
        authIcon.className = 'fa-solid fa-user';
    }
});
$('authBtn').addEventListener('click', () => {
    if (currentUser) {
        const accion = confirm('¿Ver tus cartas? Acepta = Ver cartas / Cancelar = Cerrar sesión');
        if (accion) cargarMisCartas();
        else signOut(auth);
    } else {
        abrirModal('loginModal');
    }
});

$('loginBtn').addEventListener('click', async () => {
    const email = $('loginEmail').value;
    const pass = $('loginPassword').value;
    try {
        await signInWithEmailAndPassword(auth, email, pass);
        cerrarModal('loginModal');
        mostrarToast('Bienvenido ❤️');
        cargarMisCartas();
    } catch (e) {
        mostrarToast('Error: ' + e.message);
    }
});

$('registerBtn').addEventListener('click', async () => {
    const email = $('registerEmail').value;
    const pass = $('registerPassword').value;
    try {
        const cred = await createUserWithEmailAndPassword(auth, email, pass);
        // 👇 NUEVO: guardar email en colección "usuarios"
        await setDoc(doc(db, 'usuarios', cred.user.uid), {
            email: email,
            creadoEn: serverTimestamp()
        });
        cerrarModal('registerModal');
        mostrarToast('Cuenta creada ✅');
        cargarMisCartas();
    } catch (e) {
        mostrarToast('Error: ' + e.message);
    }
});
// Cerrar modales y cambiar entre login/registro
document.querySelectorAll('.close-modal').forEach(btn => {
    btn.addEventListener('click', () => cerrarModal(btn.dataset.modal));
});
document.querySelectorAll('[data-switch]').forEach(btn => {
    btn.addEventListener('click', () => {
        const [cerrar, abrir] = btn.dataset.switch.split(',');
        cerrarModal(cerrar);
        abrirModal(abrir);
    });
});

// ===== CARGA DE CARTA DESDE URL =====
const params = new URLSearchParams(window.location.search);
const codigoParam = params.get('c');

async function cargarCartaPorCodigo(codigo) {
    try {
        const q = query(collection(db, 'cartas'), where('codigo', '==', codigo));
        const snap = await getDocs(q);
        if (snap.empty) {
            mostrarToast('Carta no encontrada');
            return;
        }
        const docSnap = snap.docs[0];
        const data = docSnap.data();
        cartaActual = { id: docSnap.id, ...data };
        pintarCarta(data);
        $('shareButtons').style.display = 'flex';
        if (currentUser && data.creadorId === currentUser.uid) {
            $('editBtn').style.display = 'inline-block';
        }
    } catch (e) {
        console.error(e);
        mostrarToast('Error al cargar: ' + e.message);
    }
}

function pintarCarta(data) {
    $('letterToDisplay').textContent = 'Para: ' + (data.destinatario || '...');
    $('letterFromDisplay').textContent = data.firma || '';
    const bodyHTML = (data.mensaje || '').split('\n\n').filter(p => p.trim()).map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('');
    $('letterBodyDisplay').innerHTML = bodyHTML || '<p></p>';
    const card = $('letterCard');
    card.className = 'letter-card';
    card.classList.add('plantilla-' + (data.plantilla || 'clasica'));
}

// ===== EDITOR =====
function generarCodigoAleatorio() {
    return Math.random().toString(36).substring(2, 8);
}

$('editBtn').addEventListener('click', () => {
    if (!currentUser) { mostrarToast('Inicia sesión'); return; }
    if (cartaActual && cartaActual.creadorId === currentUser.uid) {
        editando = true;
        $('inputTo').value = cartaActual.destinatario || '';
        $('inputBody').value = cartaActual.mensaje || '';
        $('inputFrom').value = cartaActual.firma || '';
        $('inputPlantilla').value = cartaActual.plantilla || 'clasica';
        $('inputCodigo').value = cartaActual.codigo || '';
        abrirModal('editorModal');
    }
});

$('nuevaCartaBtn').addEventListener('click', () => {
    if (!currentUser) {
        cerrarModal('myCardsModal');
        abrirModal('loginModal');
        return;
    }
    editando = false;
    $('inputTo').value = '';
    $('inputBody').value = '';
    $('inputFrom').value = '';
    $('inputPlantilla').value = 'clasica';
    $('inputCodigo').value = generarCodigoAleatorio();
    cerrarModal('myCardsModal');
    abrirModal('editorModal');
});

$('saveCartaBtn').addEventListener('click', async () => {
    if (!currentUser) { mostrarToast('Inicia sesión'); return; }
    const destinatario = $('inputTo').value.trim();
    const mensaje = $('inputBody').value.trim();
    const firma = $('inputFrom').value.trim();
    const plantilla = $('inputPlantilla').value;
    let codigo = $('inputCodigo').value.trim().toLowerCase();

    if (!destinatario || !mensaje) {
        mostrarToast('Completa destinatario y mensaje');
        return;
    }
    if (!codigo) codigo = generarCodigoAleatorio();
    if (!/^[a-z0-9-]+$/.test(codigo)) {
        mostrarToast('Código solo letras, números y guiones');
        return;
    }

    try {
        if (!editando || (cartaActual && cartaActual.codigo !== codigo)) {
            const q = query(collection(db, 'cartas'), where('codigo', '==', codigo));
            const snap = await getDocs(q);
            if (!snap.empty) {
                mostrarToast('Ese código ya está en uso, elige otro');
                return;
            }
        }

        const datos = {
            destinatario, mensaje, firma, plantilla, codigo,
            creadorId: currentUser.uid,
            actualizadoEn: serverTimestamp()
        };

        if (editando && cartaActual) {
            await updateDoc(doc(db, 'cartas', cartaActual.id), datos);
            cartaActual = { ...cartaActual, ...datos };
            mostrarToast('Carta actualizada ✅');
        } else {
            const nuevoDoc = doc(collection(db, 'cartas'));
            await setDoc(nuevoDoc, { ...datos, creadoEn: serverTimestamp() });
            cartaActual = { id: nuevoDoc.id, ...datos };
            mostrarToast('Carta creada ✅');
            window.history.replaceState({}, '', '?c=' + codigo);
        }

        pintarCarta(datos);
        $('shareButtons').style.display = 'flex';
        $('editBtn').style.display = 'inline-block';
        cerrarModal('editorModal');
    } catch (e) {
        console.error(e);
        mostrarToast('Error: ' + e.message);
    }
});$('copiarBtn').addEventListener('click', async () => {
    const url = window.location.origin + window.location.pathname + '?c=' + (cartaActual?.codigo || '');
    try {
        await navigator.clipboard.writeText(url);
        mostrarToast('Enlace copiado ✅');
    } catch {
        prompt('Copia el enlace:', url);
    }
});

// ===== MIS CARTAS =====
async function cargarMisCartas() {
    if (!currentUser) return;
    const lista = $('myCardsList');
    lista.innerHTML = '<p class="text-slate-400 text-sm text-center py-4">Cargando...</p>';
    abrirModal('myCardsModal');

    try {
        const q = query(collection(db, 'cartas'), where('creadorId', '==', currentUser.uid));
        const snap = await getDocs(q);
        if (snap.empty) {
            lista.innerHTML = '<p class="text-slate-400 text-sm text-center py-4">Aún no tienes cartas. ¡Crea la primera!</p>';
            return;
        }
        lista.innerHTML = '';
        snap.forEach(d => {
            const data = d.data();
            const div = document.createElement('div');
            div.className = 'bg-slate-800 border border-slate-700 rounded-lg p-3 flex justify-between items-center';
            div.innerHTML = `
                <div class="min-w-0">
                    <p class="text-rose-200 font-medium text-sm truncate">Para: ${data.destinatario}</p>
                    <p class="text-slate-400 text-xs truncate">?c=${data.codigo}</p>
                </div>
                <button class="text-rose-400 hover:text-rose-300 text-sm ml-2" data-codigo="${data.codigo}">
                    <i class="fa-solid fa-arrow-right"></i>
                </button>
            `;
            div.querySelector('button').addEventListener('click', () => {
                window.history.replaceState({}, '', '?c=' + data.codigo);
                cargarCartaPorCodigo(data.codigo);
                cerrarModal('myCardsModal');
            });
            lista.appendChild(div);
        });
    } catch (e) {
        lista.innerHTML = '<p class="text-red-400 text-sm text-center py-4">Error: ' + e.message + '</p>';
    }
}

// ===== SOBRE =====
let isEnvelopeOpen = false;
$('envelope').addEventListener('click', () => {
    const envelope = $('envelope');
    const hint = $('envelopeHint');
    isEnvelopeOpen = !isEnvelopeOpen;
    if (isEnvelopeOpen) {
        envelope.classList.add('open');
        hint.style.display = 'none';
        if (!audioPlaying) startAudio();
    } else {
        envelope.classList.remove('open');
        hint.style.display = 'block';
    }
});

// ===== PÉTALOS =====
const canvas = $('petalsCanvas');
const ctx = canvas.getContext('2d');
let width = canvas.width = window.innerWidth;
let height = canvas.height = window.innerHeight;
window.addEventListener('resize', () => {
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;
});
class Petal {
    constructor() { this.reset(); }
    reset() {
        this.x = Math.random() * width;
        this.y = -20 - Math.random() * 50;
        this.size = 8 + Math.random() * 12;
        this.speedY = 0.8 + Math.random() * 1.5;
        this.speedX = -0.5 + Math.random() * 1.0;
        this.rotation = Math.random() * 360;
        this.rotationSpeed = -1 + Math.random() * 2;
        this.opacity = 0.4 + Math.random() * 0.5;
        this.color = Math.random() > 0.3 ? '#fb7185' : '#f43f5e';
    }
    update() {
        this.y += this.speedY;
        this.x += Math.sin(this.y / 30) + this.speedX;
        this.rotation += this.rotationSpeed;
        if (this.y > height + 20 || this.x < -20 || this.x > width + 20) this.reset();
    }
    draw() {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate((this.rotation * Math.PI) / 180);
        ctx.globalAlpha = this.opacity;
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.bezierCurveTo(-this.size, -this.size / 2, -this.size, this.size, 0, this.size * 1.5);
        ctx.bezierCurveTo(this.size, this.size, this.size, -this.size / 2, 0, 0);
        ctx.fill();
        ctx.restore();
    }
}
const petals = Array.from({ length: 30 }, () => new Petal());
function animatePetals() {
    ctx.clearRect(0, 0, width, height);
    petals.forEach(p => { p.update(); p.draw(); });
    requestAnimationFrame(animatePetals);
}
animatePetals();

// ===== MÚSICA =====
let audioCtx = null;
let audioSequenceTimeout = null;
const NOTES = {
    'C4': 261.63, 'D4': 293.66, 'E4': 329.63, 'F4': 349.23, 'G4': 392.00, 'A4': 440.00, 'B4': 493.88,
    'C5': 523.25, 'D5': 587.33, 'E5': 659.25, 'F5': 698.46, 'G5': 783.99, 'A5': 880.00
};
const MELODY = [
    { note: 'E5', duration: 0.6 }, { note: 'D5', duration: 0.6 }, { note: 'C5', duration: 0.8 },
    { note: 'G4', duration: 0.8 }, { note: 'A4', duration: 0.6 }, { note: 'C5', duration: 0.6 },
    { note: 'E5', duration: 1.2 }, { note: 'D5', duration: 0.6 }, { note: 'C5', duration: 0.6 },
    { note: 'B4', duration: 0.8 }, { note: 'G4', duration: 0.8 }, { note: 'A4', duration: 1.4 },
    { note: 'C5', duration: 0.6 }, { note: 'E5', duration: 0.6 }, { note: 'G5', duration: 1.0 },
    { note: 'F5', duration: 0.6 }, { note: 'E5', duration: 0.6 }, { note: 'D5', duration: 1.2 }
];
function playTone(freq, duration) {
    if (!audioCtx || audioCtx.state !== 'running') return;
    try {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
        gain.gain.setValueAtTime(0, audioCtx.currentTime);
        gain.gain.linearRampToValueAtTime(0.15, audioCtx.currentTime + 0.08);
        gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + duration + 0.5);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + duration + 0.6);
    } catch(e) { console.error(e); }
}
let noteIndex = 0;
function playNextNote() {
    if (!audioPlaying) return;
    const item = MELODY[noteIndex];
    if (item && NOTES[item.note]) playTone(NOTES[item.note], item.duration);
    noteIndex = (noteIndex + 1) % MELODY.length;
    const delay = (item ? item.duration : 1) * 750;
    audioSequenceTimeout = setTimeout(playNextNote, delay);
}
function startAudio() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    audioPlaying = true;
    $('musicIcon').className = 'fa-solid fa-volume-high text-rose-400 animate-pulse';
    $('musicText').textContent = 'Sonando';
    playNextNote();
}
function stopAudio() {
    audioPlaying = false;
    if (audioSequenceTimeout) clearTimeout(audioSequenceTimeout);
    $('musicIcon').className = 'fa-solid fa-music text-rose-400';
    $('musicText').textContent = 'Música';
}
$('musicToggleBtn').addEventListener('click', () => {
    if (audioPlaying) stopAudio(); else startAudio();
});

// ===== CARGA INICIAL =====
if (codigoParam) {
    const unsub = onAuthStateChanged(auth, () => {
        cargarCartaPorCodigo(codigoParam);
        unsub();
    });
} else {
    $('letterToDisplay').textContent = 'Para: ...';
    $('letterBodyDisplay').innerHTML = '<p>Haz clic en "Editar" o inicia sesión para crear tu primera carta.</p>';
    $('letterFromDisplay').textContent = '';
}
