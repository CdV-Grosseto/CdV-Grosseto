// ==========================================
// CONFIGURAZIONE SUPABASE
// ==========================================
const SUPABASE_URL = 'https://wszrdapqvnygwhtjinjj.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndzenJkYXBxdm55Z3dodGppbmpqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM5Mjk3MzgsImV4cCI6MjA3OTUwNTczOH0.eDLdHZqqFxACcm1BsaJ_29KU-p8aXL9VfUQNA8nm90c';
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const VAPID_PUBLIC_KEY = 'BBQI-AyZacTAcx78H5SLPEgnrgvyJLFGnwRv5bKakr9JisauagodVDxNUDB874FaLkmNuyB2sgzWQLxoqTkstJo';

// --- AUTO-UPDATE CONFIGURATION ---
const APP_VERSION = 'v68';

async function checkAppVersion() {
    try {
        const response = await fetch('version.json?t=' + new Date().getTime());
        if (!response.ok) return;
        const data = await response.json();
        const remoteVersion = data.version;

        if (remoteVersion !== APP_VERSION) {
            console.log(`Aggiornamento trovato: ${APP_VERSION} -> ${remoteVersion}`);

            // AGGIORNAMENTO NUCLEAR
            if ('serviceWorker' in navigator) {
                const registrations = await navigator.serviceWorker.getRegistrations();
                for (let registration of registrations) {
                    await registration.unregister();
                }
            }

            if ('caches' in window) {
                const keys = await caches.keys();
                await Promise.all(keys.map(key => caches.delete(key)));
            }

            alert(`Nuova versione disponibile (${remoteVersion})! L'app verrà aggiornata.`);
            window.location.reload(true);
        }
    } catch (e) {
        console.warn("Impossibile verificare aggiornamenti:", e);
    }
}
// Controllo all'avvio
checkAppVersion();
// Controllo al ritorno in focus
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') checkAppVersion();
});
// ---------------------------------

// --- VARIABILI DI STATO ---
let currentUser = null;
let currentProfile = null;
let currentGroupSettings = null;
let map = null;
let markersLayer = null;
let groupsLayer = null;
let userMarker = null;
let tempReportMarker = null;
let tempLocation = null;
let selectedCategory = 'sospetto';
let availableGroups = [];
let allReportsCache = [];
let profilesCache = {};
let currentFilter = 'all';
let pickingMode = null;
let selectedGroupIdFilter = null;
let markersMap = {};
// Geofencing State
let drawingMode = false;
let tempBoundaryPoints = [];
let tempPolygonLayer = null;
let groupPolygonsLayer = new L.LayerGroup();

// Nuovi Filtri
let currentSearchText = '';
let currentDateFilter = 'all';

// Stato Dossier
let isDossierMode = false;
let selectedReportIds = new Set();

// Stato Online (Presence)
let onlineUsers = new Set();
let presenceChannel = null;

// Stato PWA Install
let deferredPrompt;

// Utente Protetto
const PROTECTED_EMAIL = 'info.michele.rosati@gmail.com';

// ==========================================
// CONFIGURAZIONE SINONIMI E INTELLIGENZA SEMANTICA
// ==========================================
// Algoritmo di Levenshtein per la tolleranza ai refusi (es. "maccina" -> "macchina")
function levenshtein(a, b) {
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;
    const matrix = [];
    for (let i = 0; i <= b.length; i++) matrix[i] = [i];
    for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(matrix[i - 1][j - 1] + 1, Math.min(matrix[i][j - 1] + 1, matrix[i - 1][j] + 1));
            }
        }
    }
    return matrix[b.length][a.length];
}

const SYNONYM_GROUPS = [
    ['auto', 'macchina', 'veicolo', 'mezzo', 'vettura', 'automobile', 'suv', 'furgone', 'camion', 'utilitaria', 'autovettura', 'station wagon'],
    ['uomo', 'uomini', 'persona', 'persone', 'soggetto', 'soggetti', 'individuo', 'individui', 'maschio', 'maschi', 'tipo', 'tipi', 'tizio', 'tizi'],
    ['donna', 'donne', 'signora', 'signore', 'ragazza', 'ragazze', 'femmina', 'femmine'],
    ['ragazzo', 'ragazzi', 'giovane', 'giovani', 'adolescente', 'adolescenti', 'minorenne', 'minorenni', 'bambino'],
    ['sospetto', 'sospetti', 'estraneo', 'estranei', 'sconosciuto', 'sconosciuti', 'losco', 'furtivo'],
    ['extracomunitario', 'extracomunitari', 'straniero', 'stranieri', 'africano', 'nordafricano', 'colore'],
    ['scuro', 'scuri', 'scura', 'scure', 'nero', 'neri', 'nera', 'nere'],
    ['bianco', 'bianchi', 'bianca', 'bianche', 'chiaro', 'chiari'],
    ['rosso', 'rossi', 'rossa', 'rosse', 'bordeaux'],
    ['blu', 'azzurro', 'scuro', 'notte'],
    ['grigio', 'grigia', 'argento', 'silver', 'metallizzato'],
    ['targa', 'numero', 'lettere', 'targato', 'targata', 'inizia', 'finisce'],
    ['rubare', 'furto', 'scassinare', 'ladro', 'ladri', 'rubato', 'rubata', 'topo', 'topi', 'intrusione'],
    ['cane', 'cani', 'animale', 'animali', 'guinzaglio'],
    ['droga', 'spaccio', 'sostanze', 'bustina', 'pusher', 'spacciatore', 'scambio'],
    ['scendere', 'sceso', 'scesi', 'uscire', 'uscito', 'montare'],
    ['sostare', 'fermo', 'fermi', 'parcheggiato', 'appostato', 'attesa'],
    ['urla', 'gridare', 'litigio', 'rissa', 'schiamazzi', 'casino', 'rumore'],
    ['luce', 'lampione', 'buio', 'spento', 'illuminazione'],
    ['1', 'uno', 'una', 'un'],
    ['2', 'due', 'coppia', 'paio', 'entrambi'],
    ['3', 'tre'],
    ['4', 'quattro']
];

// ================= GESTIONE PWA INSTALLAZIONE =================
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    document.getElementById('pwa-install-banner').style.display = 'flex';
});

async function installPWA() {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    console.log(`User response to install prompt: ${outcome}`);
    deferredPrompt = null;
    document.getElementById('pwa-install-banner').style.display = 'none';
}

window.addEventListener('appinstalled', () => {
    document.getElementById('pwa-install-banner').style.display = 'none';
    deferredPrompt = null;
    console.log('PWA was installed');
});

// ================= GESTIONE FILTRI AVANZATI =================
function handleSearch(text) {
    currentSearchText = text.toLowerCase().trim();
    const clearBtn = document.getElementById('clear-search-btn');
    clearBtn.hidden = (text === '');
    renderMapMarkers();
    if (document.getElementById('view-list').style.display === 'block') renderReportsList();
}

function clearSearch() {
    document.getElementById('map-search-input').value = '';
    handleSearch('');
}

function toggleDateFilter() {
    let btnText = '📅 Tutto';

    if (currentDateFilter === 'all') {
        currentDateFilter = 'today';
        btnText = '📅 Oggi';
    } else if (currentDateFilter === 'today') {
        currentDateFilter = 'week';
        btnText = '📅 7 Giorni';
    } else if (currentDateFilter === 'week') {
        currentDateFilter = 'month';
        btnText = '📅 30 Giorni';
    } else {
        currentDateFilter = 'all';
        btnText = '📅 Tutto';
    }

    document.querySelectorAll('.date-filter-btn').forEach(btn => {
        btn.innerText = btnText;
        if (currentDateFilter !== 'all') btn.classList.add('date-active');
        else btn.classList.remove('date-active');
    });

    renderMapMarkers();
    if (document.getElementById('view-list').style.display === 'block') renderReportsList();
}

// ================= UTILS UI =================
function showMessage(title, text, type = 'info') {
    document.getElementById('msg-title').innerText = title;
    document.getElementById('msg-text').innerText = text;
    const icon = document.getElementById('msg-icon');
    if (type === 'error') icon.innerText = '❌';
    else if (type === 'success') icon.innerText = '✅';
    else icon.innerText = 'ℹ️';
    document.getElementById('modal-message').style.display = 'flex';
}

function showConfirm(title, text, onConfirm) {
    document.getElementById('confirm-title').innerText = title;
    document.getElementById('confirm-text').innerText = text;
    const btn = document.getElementById('btn-confirm-ok');

    const newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);

    newBtn.addEventListener('click', () => {
        closeModal('modal-confirm');
        if (onConfirm) onConfirm();
    });

    document.getElementById('modal-confirm').style.display = 'flex';
}

function openPolicyModal() {
    document.getElementById('modal-policy').style.display = 'flex';
}

// ================= 1. AUTENTICAZIONE =================
async function checkSession() {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session) handleLoginSuccess(session.user);
}
checkSession();

function toggleAuthMode(mode) {
    document.getElementById('form-login').style.display = (mode === 'login') ? 'block' : 'none';
    document.getElementById('form-signup').style.display = (mode === 'signup') ? 'block' : 'none';
}

function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}

async function subscribeToPush(silent = false) {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;

    try {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
        });

        console.log('Push Subscription:', JSON.stringify(subscription));

        if (currentUser) {
            const { error } = await supabaseClient.from('push_subscriptions').upsert({
                user_id: currentUser.id,
                group_id: currentProfile ? currentProfile.group_id : null,
                subscription: subscription
            }, { onConflict: 'user_id, subscription' });

            if (error) {
                console.warn("Errore salvataggio push:", error.message);
                if (!silent) showMessage("Errore", "Impossibile attivare le notifiche.", "error");
            }
            else {
                console.log("Push subscription salvata nel DB");
                if (!silent) showMessage("Notifiche Attive", "Riceverai avvisi per le emergenze nel tuo quartiere.", "success");
                updatePushUI(true);
            }
        }
    } catch (e) {
        console.warn("Utente ha rifiutato notifiche o errore:", e);
        if (!silent) showMessage("Attenzione", "Hai bloccato le notifiche. Sbloccali dalle impostazioni del browser.", "error");
        updatePushUI(false);
    }
}

async function updatePushUI(forceState = null) {
    const btn = document.getElementById('btn-notifications');
    const icon = document.getElementById('icon-notif');
    if (!btn) return;

    // Check permission logic if forceState is null
    if (forceState !== null) {
        if (forceState) {
            icon.innerText = 'notifications_active';
            icon.style.color = '#1F2937'; // Grigio scuro (visibile su giallo)
        } else {
            icon.innerText = 'notifications_off';
            icon.style.color = '#ef4444'; // Rosso spento
        }
        return;
    }

    if (!('serviceWorker' in navigator)) {
        btn.style.display = 'none';
        return;
    }

    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();

    if (sub) {
        icon.innerText = 'notifications_active';
        icon.style.color = '#1F2937'; // Grigio scuro
    } else {
        icon.innerText = 'notifications_none';
        icon.style.color = 'white';
    }
}

async function handleLogin() {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) showMessage("Errore Login", error.message, 'error');
    else handleLoginSuccess(data.user);
}

async function handleSignUp() {
    const name = document.getElementById('signup-name').value;
    const email = document.getElementById('signup-email').value;
    const password = document.getElementById('signup-password').value;

    if (!name) return showMessage("Attenzione", "Inserisci Nome e Cognome", 'error');

    const { data, error } = await supabaseClient.auth.signUp({
        email,
        password,
        options: { data: { full_name: name } }
    });

    if (error) {
        showMessage("Errore Registrazione", error.message, 'error');
    } else {
        if (data.user) {
            const { error: profileError } = await supabaseClient.from('profiles').upsert([
                { id: data.user.id, role: 'utente', full_name: name, email: email }
            ]);
            if (profileError) console.warn("Errore upsert profilo:", profileError);
        }
        showMessage("Successo", "Registrazione completata! Ora puoi accedere.", 'success');
        toggleAuthMode('login');
    }
}

async function handleLoginSuccess(user) {
    currentUser = user;

    let { data: profile } = await supabaseClient.from('profiles').select('*').eq('id', user.id).single();

    if (!profile) {
        const fullName = user.user_metadata?.full_name || user.email.split('@')[0];

        const { data: newProfile, error: insertError } = await supabaseClient.from('profiles').upsert([
            { id: user.id, role: 'utente', full_name: fullName, email: user.email }
        ]).select().single();

        if (insertError) { showMessage("Errore DB", insertError.message, 'error'); return; }
        profile = newProfile;
    }
    else if (!profile.email && user.email) {
        const { error: updateError } = await supabaseClient.from('profiles').update({ email: user.email }).eq('id', user.id);
        if (!updateError) profile.email = user.email;
    }

    if (profile) {
        currentProfile = profile;
    } else {
        showMessage("Errore", "Impossibile caricare il profilo.", 'error');
        return;
    }

    document.getElementById('view-login').style.display = 'none';

    // --- RIPRISTINO VISIBILITÀ NAVBAR ---
    document.getElementById('nav-tabs').style.display = 'flex';
    const userNameDisplay = document.getElementById('nav-user-name');
    if (userNameDisplay) {
        const shortName = currentProfile.full_name ? currentProfile.full_name.split(' ')[0] : 'Utente';
        userNameDisplay.innerText = shortName;
        userNameDisplay.style.display = 'block';
    }
    document.getElementById('btn-logout').style.display = 'block';

    // MOSTRA BOTTONE NOTIFICHE
    const notifBtn = document.getElementById('btn-notifications');
    if (notifBtn) {
        notifBtn.style.display = 'block';
        updatePushUI(); // Controlla stato iniziale
    }
    // -------------------------------------

    const navTitle = document.querySelector('.nav-title');
    if (currentProfile.group_id) {
        const { data: userGroup } = await supabaseClient.from('groups').select('*').eq('id', currentProfile.group_id).single();
        if (userGroup) {
            navTitle.innerText = `C.d.V - ${userGroup.name}`;
            currentGroupSettings = userGroup;
        }
    } else if (currentProfile.role === 'coord_generale') {
        navTitle.innerText = 'C.d.V - Admin';
    } else {
        navTitle.innerText = 'C.d.V Grosseto';
    }

    // --- CONTROLLO CAMBIO PASSWORD FORZATO ---
    if (currentProfile.force_password_change) {
        document.getElementById('modal-force-password').style.display = 'flex';
        // Non carichiamo il resto dell'app finché non cambia password
        return;
    }
    // -----------------------------------------

    loadGroups();
    setupRealtime(); // Avvia la sincronizzazione e la Presence

    if (currentProfile) {
        if (currentProfile.role === 'coord_generale' || currentProfile.role === 'coord_gruppo') {
            document.getElementById('tab-users').style.display = 'block';
            document.getElementById('admin-archive-section').style.display = 'block';
            loadArchive();
        }
        if (currentProfile.role === 'coord_generale') {
            document.getElementById('btn-open-stats').style.display = 'flex';
            document.getElementById('admin-group-tools').style.display = 'block';
            document.getElementById('btn-start-dossier').style.display = 'flex';
            document.getElementById('btn-toggle-groups').style.display = 'flex';
        }
        if (currentProfile.group_id || currentProfile.role === 'coord_generale') {
            document.getElementById('fab-add').style.display = 'flex';
        }
    }

    switchTab('map');
    initMap();
    loadReports();
    // Tenta iscrizione notifiche (in background, senza bloccare)
    subscribeToPush(true);
}

async function handleLogout() {
    if (presenceChannel) await presenceChannel.untrack();
    supabaseClient.removeAllChannels();
    await supabaseClient.auth.signOut();
    window.location.reload();
}

function setupRealtime() {
    // 1. Canale per i dati del DB
    const dbChannel = supabaseClient.channel('db-changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'reports' }, (payload) => {
            // Se è una NUOVA emergenza, apriamo il modale ALERT
            if (payload.eventType === 'INSERT' && payload.new.category === 'emergenza') {
                triggerEmergencyAlert(payload.new);
            }

            loadReports();
            if (currentProfile && (currentProfile.role === 'coord_generale' || currentProfile.role === 'coord_gruppo')) {
                loadArchive();
            }
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'groups' }, (payload) => {
            loadGroups();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, (payload) => {
            if (document.getElementById('view-users').style.display === 'block') loadUsers();
        })
        .subscribe();

    // 2. Canale per lo Stato Online (Presence)
    presenceChannel = supabaseClient.channel('online-users');

    presenceChannel
        .on('presence', { event: 'sync' }, () => {
            const newState = presenceChannel.presenceState();
            onlineUsers.clear();

            // Estrai gli user_id dallo stato della presence
            for (const id in newState) {
                const users = newState[id];
                users.forEach(u => {
                    if (u.user_id) onlineUsers.add(u.user_id);
                });
            }

            // Se siamo nella schermata utenti, aggiorna la lista per vedere i pallini
            if (document.getElementById('view-users').style.display === 'block') {
                loadUsers();
            }
        })
        .subscribe(async (status) => {
            if (status === 'SUBSCRIBED' && currentUser) {
                await presenceChannel.track({
                    user_id: currentUser.id,
                    online_at: new Date().toISOString()
                });
            }
        });
}

// ================= 2. NAVIGAZIONE & UI =================
function switchTab(tabName) {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    const activeBtn = document.querySelector(`.tab[onclick="switchTab('${tabName}')"]`);
    if (activeBtn) activeBtn.classList.add('active');

    document.getElementById('view-map').style.display = 'none';
    document.getElementById('view-list').style.display = 'none';
    document.getElementById('view-users').style.display = 'none';

    if (pickingMode && tabName !== 'map') cancelLocationPick();

    if (tabName === 'map') {
        document.getElementById('view-map').style.display = 'block';
        setTimeout(() => {
            if (map) {
                map.invalidateSize();
                renderMapMarkers();
                if (currentGroupSettings && currentGroupSettings.lat && currentGroupSettings.lng) {
                    // Non sovrascrivere se stiamo zoomando su un report specifico
                }
                else if (markersLayer && markersLayer.getLayers().length > 0) {
                    // Rimossa fitBounds automatica per evitare salti continui
                }
            }
        }, 200);
    } else if (tabName === 'list') {
        document.getElementById('view-list').style.display = 'block';
        renderReportsList();
    } else if (tabName === 'users') {
        document.getElementById('view-users').style.display = 'block';
        loadUsers();
    }
}

function applyFilter(filterType) {
    currentFilter = filterType;
    document.querySelectorAll('.filter-chip').forEach(b => b.classList.remove('active'));
    if (filterType) {
        document.querySelectorAll(`.filter-chip[data-filter="${filterType}"]`).forEach(b => b.classList.add('active'));
    }
    renderMapMarkers();
    if (document.getElementById('view-list').style.display === 'block') renderReportsList();
}

function handleListSearch(text) {
    currentSearchText = text.toLowerCase();

    // Sincronizza input mappa se esiste
    const mapInput = document.getElementById('map-search-input');
    if (mapInput) mapInput.value = currentSearchText;

    // Gestione X
    const clearBtn = document.getElementById('clear-list-search-btn');
    if (clearBtn) clearBtn.hidden = (text.length === 0);

    renderMapMarkers();
    renderReportsList();
}

function clearListSearch() {
    currentSearchText = '';
    document.getElementById('list-search-input').value = '';
    document.getElementById('clear-list-search-btn').hidden = true;

    const mapInput = document.getElementById('map-search-input');
    if (mapInput) mapInput.value = '';

    renderMapMarkers();
    renderReportsList();
}

// ================= 3. MAPPA & INSERIMENTO =================
function initMap() {
    if (map) return;

    let startLat = 42.760;
    let startLng = 11.108;
    let startZoom = 13;

    if (currentGroupSettings && currentGroupSettings.lat && currentGroupSettings.lng) {
        startLat = currentGroupSettings.lat;
        startLng = currentGroupSettings.lng;
        startZoom = currentGroupSettings.zoom || 15;
    }

    map = L.map('map', { zoomControl: false }).setView([startLat, startLng], startZoom);
    L.control.zoom({ position: 'bottomright' }).addTo(map);

    // LAYER GRUPPI (POLIGONI)
    groupPolygonsLayer.addTo(map);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap',
        maxZoom: 19
    }).addTo(map);

    markersLayer = L.markerClusterGroup();
    map.addLayer(markersLayer);

    groupsLayer = L.featureGroup();

    map.on('click', function (e) {
        // GESTIONE DISEGNO POLIGONO
        if (drawingMode) {
            tempBoundaryPoints.push([e.latlng.lat, e.latlng.lng]);
            renderTempPolygon();
            return;
        }

        if (!pickingMode) return;
        tempLocation = e.latlng;

        if (tempReportMarker) {
            tempReportMarker.setLatLng(e.latlng);
        } else {
            const redIcon = new L.Icon({
                iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
                shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
                iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41]
            });
            tempReportMarker = L.marker(e.latlng, { icon: redIcon }).addTo(map);
        }
        document.getElementById('btn-confirm-pos').style.display = 'inline-block';
        document.getElementById('picker-instruction').innerText = "Punto fissato. Premi CONFERMA.";
    });
}

// NUOVA FUNZIONE: Vai al marker dalla lista
function goToReportMarker(id) {
    const marker = markersMap[id];

    // Se siamo in modalità selezione dossier, non navighiamo
    if (isDossierMode) return;

    if (marker) {
        switchTab('map');
        // zoomToShowLayer è una funzione di Leaflet.markercluster
        // Espande il cluster se necessario e zooma sul marker
        markersLayer.zoomToShowLayer(marker, function () {
            marker.openPopup();
        });
    } else {
        // Fallback: se il marker non è nel layer (es. filtri), proviamo a trovare le coord
        const r = allReportsCache.find(x => x.id === id);
        if (r) {
            const coords = parseCoordinates(r);
            if (coords) {
                switchTab('map');
                map.setView(coords, 18);
            } else {
                showMessage("Attenzione", "Impossibile localizzare la segnalazione sulla mappa.", "info");
            }
        }
    }
}

function toggleGroupMarkers() {
    const btn = document.getElementById('btn-toggle-groups');

    if (map.hasLayer(groupsLayer)) {
        map.removeLayer(groupsLayer);
        btn.classList.remove('active');
    } else {
        groupsLayer.clearLayers();

        const groupIcon = L.divIcon({
            className: 'custom-group-marker',
            html: `<div style="background:#1F2937; color:#FCD34D; border-radius:50%; width:30px; height:30px; display:flex; justify-content:center; align-items:center; border:2px solid white; box-shadow:0 2px 5px rgba(0,0,0,0.3);">
                     <span class="material-icons" style="font-size:18px">flag</span>
                   </div>`,
            iconSize: [30, 30],
            iconAnchor: [15, 15]
        });

        availableGroups.forEach(g => {
            if (g.lat && g.lng) {
                const marker = L.marker([g.lat, g.lng], { icon: groupIcon });
                marker.bindPopup(`<b>Quartiere: ${g.name}</b>`);
                groupsLayer.addLayer(marker);
            }
        });

        map.addLayer(groupsLayer);
        btn.classList.add('active');
        if (availableGroups.length > 0) {
            try { map.fitBounds(groupsLayer.getBounds(), { padding: [50, 50] }); } catch (e) { }
        }
    }
}

function startLocationPick() {
    pickingMode = 'report';
    document.getElementById('fab-add').style.display = 'none';
    document.getElementById('location-picker-ui').style.display = 'block';
    document.getElementById('btn-confirm-pos').style.display = 'none';
    document.getElementById('picker-instruction').innerText = "Tocca dove è successo il fatto";
    if (tempReportMarker) { map.removeLayer(tempReportMarker); tempReportMarker = null; }
    switchTab('map');
}

function startGroupLocationPick() {
    pickingMode = 'group';
    document.getElementById('fab-add').style.display = 'none';
    document.getElementById('location-picker-ui').style.display = 'block';
    document.getElementById('btn-confirm-pos').style.display = 'none';
    document.getElementById('picker-instruction').innerText = "Tocca il centro della zona/quartiere";
    if (tempReportMarker) { map.removeLayer(tempReportMarker); tempReportMarker = null; }
    switchTab('map');
}

function startGroupLocationEdit() {
    pickingMode = 'group-edit';
    closeModal('modal-group-edit');
    document.getElementById('location-picker-ui').style.display = 'block';
    document.getElementById('btn-confirm-pos').style.display = 'none';
    document.getElementById('picker-instruction').innerText = "Tocca il NUOVO centro del quartiere";
    if (tempReportMarker) { map.removeLayer(tempReportMarker); tempReportMarker = null; }
    switchTab('map');
}

function cancelLocationPick() {
    pickingMode = null;
    document.getElementById('location-picker-ui').style.display = 'none';

    if (document.getElementById('view-users').style.display === 'block') {
        if (document.getElementById('edit-group-id').value) {
            document.getElementById('modal-group-edit').style.display = 'flex';
        }
    } else {
        document.getElementById('fab-add').style.display = 'flex';
    }

    if (tempReportMarker) { map.removeLayer(tempReportMarker); tempReportMarker = null; }
    if (pickingMode === 'group' || pickingMode === 'group-edit') switchTab('users');
}

function confirmLocation() {
    if (!tempLocation) return showMessage("Attenzione", "Devi prima cliccare sulla mappa!", 'error');

    if (pickingMode === 'report') {
        document.getElementById('location-picker-ui').style.display = 'none';
        document.getElementById('fab-add').style.display = 'flex';
        document.getElementById('modal-safety').style.display = 'flex';
    }
    else if (pickingMode === 'group') {
        document.getElementById('new-group-lat').value = tempLocation.lat.toFixed(5);
        document.getElementById('new-group-lng').value = tempLocation.lng.toFixed(5);
        document.getElementById('location-picker-ui').style.display = 'none';
        if (tempReportMarker) { map.removeLayer(tempReportMarker); tempReportMarker = null; }
        switchTab('users');
    }
    else if (pickingMode === 'group-edit') {
        document.getElementById('edit-group-lat').value = tempLocation.lat.toFixed(5);
        document.getElementById('edit-group-lng').value = tempLocation.lng.toFixed(5);
        document.getElementById('location-picker-ui').style.display = 'none';
        if (tempReportMarker) { map.removeLayer(tempReportMarker); tempReportMarker = null; }
        switchTab('users');
        document.getElementById('modal-group-edit').style.display = 'flex';
    }

    pickingMode = null;
}

function locateMe() {
    if (!navigator.geolocation) return showMessage("Errore", "GPS non disponibile", 'error');
    navigator.geolocation.getCurrentPosition(pos => {
        const lat = pos.coords.latitude; const lng = pos.coords.longitude;
        map.setView([lat, lng], 16);
        if (userMarker) map.removeLayer(userMarker);
        userMarker = L.circleMarker([lat, lng], { radius: 10, color: 'blue', fillColor: '#3388ff', fillOpacity: 0.8 }).addTo(map);
    }, (err) => showMessage("Errore GPS", err.message, 'error'));
}

// ================= 4. GESTIONE SEGNALAZIONI & DOSSIER =================
async function loadReports() {
    let query = supabaseClient.from('reports').select('*').order('created_at', { ascending: false });

    if (currentProfile && currentProfile.role !== 'coord_generale') {
        if (!currentProfile.group_id) {
            allReportsCache = [];
            renderMapMarkers();

            if (!sessionStorage.getItem('no_group_warned')) {
                showMessage("Benvenuto!", "Il tuo account è attivo ma non sei ancora stato assegnato a un gruppo/quartiere. Contatta il coordinatore.", "info");
                sessionStorage.setItem('no_group_warned', 'true');
            }
            return;
        }
        query = query.eq('group_id', currentProfile.group_id);
    }

    const { data, error } = await query;
    if (error) return console.error("Errore reports:", error);

    allReportsCache = data || [];

    const userIds = [...new Set(allReportsCache.map(r => r.user_id))];
    const missingIds = userIds.filter(id => !profilesCache[id]);

    if (missingIds.length > 0) {
        const { data: profiles } = await supabaseClient.from('profiles').select('id, full_name').in('id', missingIds);
        if (profiles) {
            profiles.forEach(p => { profilesCache[p.id] = p.full_name; });
        }
    }

    // --- AUTO-ARCHIVE CHECK (SOLO ADMIN) ---
    if (currentProfile && currentProfile.role === 'coord_generale') {
        const now = new Date();
        const expired = allReportsCache.filter(r => r.category === 'emergenza' && r.status !== 'archiviata' && r.expires_at && new Date(r.expires_at) < now);

        if (expired.length > 0) {
            console.log(`Admin Check: Trovate ${expired.length} emergenze scadute. Archiviazione in corso...`);
            expired.forEach(async (r) => {
                await supabaseClient.from('reports').update({ status: 'archiviata' }).eq('id', r.id);
            });
            // Ricarica per pulire l'interfaccia
            setTimeout(loadReports, 1000);
            return;
        }
    }

    // --- STARTUP EMERGENCY CHECK ---
    // Se ci sono emergenze attive e non le abbiamo ancora mostrate in questa sessione
    const activeEmergencies = allReportsCache.filter(r =>
        r.category === 'emergenza' &&
        r.status !== 'archiviata' &&
        (!r.expires_at || new Date(r.expires_at) > new Date()) &&
        !sessionStorage.getItem('emergency_shown_' + r.id)
    );

    if (activeEmergencies.length > 0) {
        triggerEmergencyAlert(activeEmergencies);

        // Segniamo tutto come mostrato
        activeEmergencies.forEach(r => {
            sessionStorage.setItem('emergency_shown_' + r.id, 'true');
        });
    }
    // -------------------------------

    renderMapMarkers();
    renderReportsList();
    if (currentProfile && (currentProfile.role === 'coord_generale' || currentProfile.role === 'coord_gruppo')) loadArchive();
}

function getFilteredReports() {
    let reports = allReportsCache;

    // 1. FILTRO SCADENZA (Escludi EMERGENZE scadute)
    const now = new Date();
    reports = reports.filter(r => {
        if (r.category === 'emergenza' && r.expires_at) {
            return new Date(r.expires_at) > now;
        }
        return true;
    });

    // 2. FILTRO GRUPPO
    if (currentProfile.group_id) {
        reports = reports.filter(r => r.group_id === currentProfile.group_id);
    }

    // 3. FILTRO ARCHIVIO / ATTIVI
    if (currentFilter === 'archivio') {
        // Se filtro è archivio, mostra SOLO archiviati
        reports = reports.filter(r => r.status === 'archiviata');
    } else {
        // ALTRIMENTI: Mostra SOLO ATTIVI (non archiviati) ...
        // ... MA includi SEMPRE le emergenze (se non scadute, già filtrato sopra)

        // Logica combinata:
        // (Status NON archiviata O Categoria è Emergenza)
        // Nota: Un'emergenza archiviata manualmente dall'admin deve sparire? 
        // Sì, se è archiviata è chiusa. Quindi rimuoviamo sempre le archiviate qui.
        reports = reports.filter(r => r.status !== 'archiviata');

        // 4. FILTRO CATEGORIA / STATO
        if (currentFilter !== 'all') {
            if (currentFilter === 'nuova') {
                reports = reports.filter(r => r.status === 'nuova' || r.category === 'emergenza');
            } else {
                reports = reports.filter(r => r.category === currentFilter || r.category === 'emergenza');
            }
        }
    }

    // NOTA: Se ci sono emergenze, le mostriamo sempre in cima o evidenziate?
    // Per ora seguono i filtri standard, ma il marker sarà sempre evidente.


    if (currentSearchText && currentSearchText.length > 0) {
        const tokens = currentSearchText.split(/\s+/).filter(t => t.length > 0);

        reports = reports.filter(r => {
            const desc = (r.description || '').toLowerCase();
            const author = (profilesCache[r.user_id] || '').toLowerCase();
            const fullText = desc + " " + author;

            // NEW: Ricerca "Fuzzy" Intelligente
            // Divide la descrizione in parole singole per confronto mirato
            const descWords = desc.replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, "").split(/\s+/);

            return tokens.every(token => {
                // 1. Match Esatto (il più veloce)
                if (fullText.includes(token)) return true;

                // 2. Espansione Sinonimi & Controllo Fuzzy
                let allVariants = [token];

                // Trova sinonimi
                for (const group of SYNONYM_GROUPS) {
                    if (group.includes(token)) {
                        allVariants = [...allVariants, ...group];
                        break; // Trovato il gruppo, non serve cercarne altri
                    }
                }

                // Controlla se una variante "matcha" una parola del testo (con tolleranza refusi)
                return allVariants.some(variant => {
                    // Controlla substring diretta della variante
                    if (fullText.includes(variant)) return true;

                    // Controlla distanza di Levenshtein sulle singole parole
                    return descWords.some(word => {
                        // Tolleranza: 0 per parole corte (<4), 1 per medie (4-6), 2 per lunghe (>6)
                        let threshold = 1;
                        if (variant.length < 4) threshold = 0;
                        if (variant.length > 6) threshold = 2;

                        return levenshtein(word, variant) <= threshold;
                    });
                });
            });
        });
    }

    if (currentDateFilter !== 'all') {
        const now = new Date();
        const todayStart = new Date(now.setHours(0, 0, 0, 0));

        reports = reports.filter(r => {
            const rDate = new Date(r.created_at);
            if (currentDateFilter === 'today') {
                return rDate >= todayStart;
            } else if (currentDateFilter === 'week') {
                const weekAgo = new Date(todayStart);
                weekAgo.setDate(todayStart.getDate() - 7);
                return rDate >= weekAgo;
            } else if (currentDateFilter === 'month') {
                const monthAgo = new Date(todayStart);
                monthAgo.setDate(todayStart.getDate() - 30);
                return rDate >= monthAgo;
            }
            return true;
        });
    }

    return reports;
}

function parseCoordinates(r) {
    if (r.lat && r.lng) return [parseFloat(r.lat), parseFloat(r.lng)];
    if (typeof r.location === 'string') {
        const matches = r.location.match(/(-?\d+(\.\d+)?)/g);
        if (matches && matches.length >= 2) {
            return [parseFloat(matches[1]), parseFloat(matches[0])];
        }
    }
    return null;
}

function renderMapMarkers() {
    if (!map || !markersLayer) return;
    markersLayer.clearLayers();

    // PULIZIA MARKERS EMERGENZA (FUORI CLUSTER)
    if (window.emergencyMarkers) {
        window.emergencyMarkers.forEach(m => map.removeLayer(m));
        window.emergencyMarkers = [];
    }

    markersMap = {}; // Reset della cache dei marker

    const reports = getFilteredReports();

    const getSvgIcon = (fillColor) => {
        const svgHtml = `
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="40" height="40">
                <path fill="${fillColor}" stroke="#1F2937" stroke-width="2" d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
            </svg>`;

        return L.divIcon({
            className: 'custom-marker',
            html: svgHtml,
            iconSize: [40, 40],
            iconAnchor: [20, 40],
            popupAnchor: [0, -40]
        });
    };

    reports.forEach(r => {
        const coords = parseCoordinates(r);
        if (coords) {
            let color = '#808080';

            if (r.status === 'archiviata') {
                color = '#374151';
            } else if (r.category === 'sospetto') {
                color = (r.status === 'validata') ? '#cc0000' : '#ff6666';
            } else if (r.category === 'degrado') {
                color = (r.status === 'validata') ? '#006400' : '#90ee90';
            } else if (r.category === 'assistenza') {
                color = (r.status === 'validata') ? '#c71585' : '#ffb6c1';
            } else if (r.category === 'emergenza') {
                color = '#EF4444'; // Rosso emergenza
            }

            // GESTIONE MARKER EMERGENZA (PULSANTI)
            if (r.category === 'emergenza' && r.status !== 'archiviata') {
                const pulsingIcon = L.divIcon({
                    className: 'custom-marker', // Usa la classe base trasparente (senza animazione che rompe il transform)
                    html: `<div class="marker-pulse" style="width:100%; height:100%; border-radius:50%; background:#EF4444; border:3px solid white; display:flex; align-items:center; justify-content:center;">
                             <span class="material-icons" style="color:white; font-size:20px;">warning</span>
                           </div>`,
                    iconSize: [40, 40],
                    iconAnchor: [20, 20],
                    popupAnchor: [0, -20]
                });
                const marker = L.marker(coords, { icon: pulsingIcon, zIndexOffset: 2000 }); // Z-index ancora più alto

                // Popup standard - CALCOLO COUNTDOWN
                const authorName = profilesCache[r.user_id] || "Utente";

                let timeRemainingStr = "";
                if (r.expires_at) {
                    const diffMs = new Date(r.expires_at) - new Date();
                    if (diffMs > 0) {
                        const hours = Math.floor(diffMs / (1000 * 60 * 60));
                        const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
                        timeRemainingStr = `<div style="color:#DC2626; font-weight:bold; margin-top:5px; font-size:0.9rem;">⏳ Scade tra: ${hours}h ${minutes}m</div>`;
                    } else {
                        timeRemainingStr = `<div style="color:#666; font-weight:bold; margin-top:5px; font-size:0.9rem;">⚠️ Scaduta</div>`;
                    }
                }

                const popupContent = `
                    <div style="min-width:180px; text-align:center; border:2px solid #EF4444; padding:5px; border-radius:8px; background:#FEF2F2;">
                        <b style="color:#DC2626">⚠️ ALLERTA AMBIENTALE</b><br>
                        <small>${new Date(r.created_at).toLocaleString('it-IT')}</small><br>
                        ${timeRemainingStr}
                        <hr style="border-top:1px solid #ffcccc; margin:5px 0;">
                        <div style="font-weight:bold; font-size:1.1rem; margin-bottom:5px;">"${r.description}"</div>
                        <div style="font-size:0.8rem;">Emessa da: ${authorName}</div>
                        ${(currentProfile.role === 'coord_generale') ?
                        `<button style="width:100%; margin-top:5px; background:#666; color:white; border:none; padding:5px; cursor:pointer;" onclick="archiveReport('${r.id}')">Chiudi Allerta</button>` : ''}
                    </div>`;
                marker.bindPopup(popupContent);

                // MODIFICA: Aggiungi DIRETTAMENTE alla mappa, NON al cluster
                marker.addTo(map);
                // Nota: Dobbiamo ricordarci di rimuoverlo quando si aggiorna la mappa.
                // Usiamo un array a parte o lo gestiamo nella pulizia, ma per ora il modo più semplice è 
                // aggiungerlo ai "markersMap" e poi pulire manualmente all'inizio di renderMapMarkers.
                // Per semplicità qui:
                if (!window.emergencyMarkers) window.emergencyMarkers = [];
                window.emergencyMarkers.push(marker);

                markersMap[r.id] = marker;
                return; // Esce dal ciclo
            }

            // Marker standard per le altre categorie
            const marker = L.marker(coords, { icon: getSvgIcon(color) });
            const canManage = currentProfile && (currentProfile.role === 'coord_generale' ||
                (currentProfile.role === 'coord_gruppo' && r.group_id === currentProfile.group_id));

            const authorName = profilesCache[r.user_id] || "Utente";

            let popupContent = `
                <div style="min-width:160px; text-align:center">
                    <b>${r.category.toUpperCase()}</b> <span class="badge ${r.status === 'validata' ? 'validata' : (r.status === 'archiviata' ? 'archiviata' : '')}">${r.status}</span><br>
                    <small>${new Date(r.created_at).toLocaleString('it-IT')}</small><br>
                    <div style="background:#f3f4f6; padding:4px; margin:5px 0; border-radius:4px; font-size:0.8rem;">
                        👤 <b>${authorName}</b>
                    </div>
                    <p style="margin:5px 0; font-style:italic">"${r.description}"</p>
                    <div style="font-size:0.7rem; color:#999; margin-top:5px">📍 ${coords[0].toFixed(4)}, ${coords[1].toFixed(4)}</div>
                    ${canManage && r.status === 'nuova' ?
                    `<button style="width:100%; margin-top:5px" class="btn-validate" onclick="updateReport('${r.id}', 'validata')">Convalida</button>` : ''}
                </div>`;
            marker.bindPopup(popupContent);
            markersLayer.addLayer(marker);

            // Salviamo il riferimento al marker
            markersMap[r.id] = marker;
        }
    });
}

// ------------------- GESTIONE ARCHIVIO -------------------
function loadArchive() {
    const archiveList = document.getElementById('archive-list-items');
    const archiveCount = document.getElementById('archive-count');
    if (!archiveList) return;

    const archivedReports = allReportsCache.filter(r => r.status === 'archiviata');
    archiveCount.innerText = archivedReports.length;

    archiveList.innerHTML = '';
    if (archivedReports.length === 0) {
        archiveList.innerHTML = '<div style="padding:10px; text-align:center; color:#999;">Nessuna segnalazione in archivio.</div>';
        return;
    }

    archivedReports.forEach(r => {
        const dateStr = new Date(r.created_at).toLocaleDateString('it-IT');
        const authorName = profilesCache[r.user_id] || "Utente sconosciuto";
        const groupObj = availableGroups.find(g => g.id === r.group_id);
        const groupName = groupObj ? groupObj.name : "Generale";

        const item = document.createElement('div');
        item.className = 'archive-item';
        item.innerHTML = `
            <div style="width: 100%; padding-right: 10px;">
                <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
                    <b>${dateStr}</b> 
                    <span class="badge ${r.category}" style="font-size:0.7rem">${r.category}</span>
                </div>
                <div style="font-size:0.8rem; color:#4b5563; margin-bottom:4px;">
                    👤 <b>${authorName}</b> | 📍 <i>${groupName}</i>
                </div>
                <div style="font-size:0.9rem; color:#333; background:#f9fafb; padding:8px; border-radius:4px; margin-top:5px; border:1px solid #eee;">
                    ${r.description}
                </div>
            </div>
            <div style="display:flex; flex-direction:column; gap:5px; justify-content:center;">
                 <button class="btn-small btn-delete" title="Elimina definitivamente" onclick="deleteReport('${r.id}')">🗑️</button>
            </div>
        `;
        archiveList.appendChild(item);
    });
}

function viewArchiveOnMap() {
    currentFilter = 'archivio';
    document.querySelectorAll('.filter-chip').forEach(b => b.classList.remove('active'));
    renderMapMarkers();
    switchTab('map');
    showMessage("Modalità Archivio", "Stai visualizzando le segnalazioni storiche. Clicca su 'Tutti' per tornare alla vista normale.", "info");
}

function toggleDossierReport(id, checkbox) {
    if (checkbox.checked) selectedReportIds.add(id);
    else selectedReportIds.delete(id);
    document.getElementById('dossier-count').innerText = `${selectedReportIds.size} Selezionati`;
}

function toggleDossierMode() {
    isDossierMode = !isDossierMode;
    selectedReportIds.clear();

    document.getElementById('dossier-bar').style.display = isDossierMode ? 'block' : 'none';
    document.getElementById('dossier-count').innerText = "0 Selezionati";
    renderReportsList();
}

function openDossierModal() {
    if (selectedReportIds.size === 0) return showMessage("Attenzione", "Seleziona almeno una segnalazione.", "error");
    document.getElementById('dossier-count-modal').innerText = selectedReportIds.size;
    document.getElementById('modal-dossier').style.display = 'flex';
}

async function printReport(id) {
    const r = allReportsCache.find(report => report.id === id);
    if (!r) return;

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    const dateStr = new Date(r.created_at).toLocaleString('it-IT');
    const authorName = profilesCache[r.user_id] || "Utente";
    const groupObj = availableGroups.find(g => g.id === r.group_id);
    const groupName = groupObj ? groupObj.name : "Generale";
    const coords = parseCoordinates(r);
    const locationStr = coords ? `${coords[0].toFixed(6)}, ${coords[1].toFixed(6)}` : "N/D";

    doc.setFontSize(20);
    doc.setTextColor(245, 158, 11);
    doc.text("C.d.V Grosseto - Dettaglio Segnalazione", 10, 20);

    doc.setFontSize(12);
    doc.setTextColor(0);
    doc.setFont("helvetica", "bold");
    doc.text(`Categoria: ${r.category.toUpperCase()}`, 10, 40);

    doc.setFont("helvetica", "normal");
    doc.text(`Stato: ${r.status}`, 10, 48);
    doc.text(`Data e Ora: ${dateStr}`, 10, 56);
    doc.text(`Gruppo: ${groupName}`, 10, 64);
    doc.text(`Autore: ${authorName}`, 10, 72);
    doc.text(`Coordinate: ${locationStr}`, 10, 80);

    doc.setFont("helvetica", "bold");
    doc.text("Descrizione:", 10, 95);

    doc.setFont("helvetica", "italic");
    doc.setFontSize(11);
    const descSplit = doc.splitTextToSize(r.description, 180);
    doc.text(descSplit, 15, 105);

    doc.save(`CDV_Segnalazione_${dateStr.replace(/[\/:\s,]/g, '_')}.pdf`);
}

function shareReport(id) {
    const r = allReportsCache.find(x => x.id === id);
    if (!r) return;

    const dateStr = new Date(r.created_at).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    const groupObj = availableGroups.find(g => g.id === r.group_id);
    const groupName = groupObj ? groupObj.name : "Generale";
    const coords = parseCoordinates(r);
    const mapLink = coords ? `https://www.google.com/maps/search/?api=1&query=${coords[0]},${coords[1]}` : "N/D";

    const text = `🚨 *C.d.V. SEGNALAZIONE* 🚨\n\n` +
        `📅 *Data:* ${dateStr}\n` +
        `📍 *Zona:* ${groupName}\n` +
        `⚠️ *Categoria:* ${r.category.toUpperCase()}\n\n` +
        `📝 *Dettagli:*\n${r.description}\n\n` +
        `🗺️ *Posizione:*\n${mapLink}`;

    const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
}

function renderReportsList() {
    const container = document.getElementById('reports-list');
    if (!container) return;
    container.innerHTML = '';
    const reports = getFilteredReports();

    if (reports.length === 0) container.innerHTML = '<p style="text-align:center; padding:20px;">Nessuna segnalazione.</p>';

    reports.forEach(r => {
        const canManage = currentProfile && (currentProfile.role === 'coord_generale' ||
            (currentProfile.role === 'coord_gruppo' && r.group_id === currentProfile.group_id));

        let adminHtml = '';
        if (canManage && !isDossierMode) {
            const btnArchive = (r.status !== 'archiviata') ?
                `<button class="btn-small" style="background:#6b7280;" onclick="event.stopPropagation(); archiveReport('${r.id}')">📂 Archivia</button>` :
                '';

            const btnPrint = `<button class="btn-small btn-print" onclick="event.stopPropagation(); printReport('${r.id}')">🖨️ PDF</button>`;

            const btnValidate = (r.status === 'nuova') ?
                `<button class="btn-small btn-validate" onclick="event.stopPropagation(); updateReport('${r.id}', 'validata')">✅ Convalida</button>` :
                '';

            adminHtml = `
                <div class="admin-controls">
                    ${btnValidate}
                    ${btnPrint}
                    ${btnArchive}
                    <button class="btn-small btn-delete" onclick="event.stopPropagation(); deleteReport('${r.id}')">🗑️ Elimina</button>
                </div>`;
        }

        let checkboxHtml = '';
        if (isDossierMode && currentProfile.role === 'coord_generale') {
            const isChecked = selectedReportIds.has(r.id) ? 'checked' : '';
            checkboxHtml = `<input type="checkbox" class="card-checkbox" onchange="event.stopPropagation(); toggleDossierReport('${r.id}', this)" ${isChecked}>`;
        }

        let groupName = '';
        const g = availableGroups.find(g => g.id === r.group_id);
        if (g) {
            groupName = `<span style="font-size:0.7rem; color:#666; display:block; margin-bottom:4px">📍 ${g.name}</span>`;
        } else {
            groupName = `<span style="font-size:0.7rem; color:#999; display:block; margin-bottom:4px">📍 Generale</span>`;
        }

        const authorName = profilesCache[r.user_id] || "Utente";

        const card = document.createElement('div');
        const isSelectable = isDossierMode && currentProfile.role === 'coord_generale';

        // Assegno classe dossier-mode se attivo per stile CSS
        card.className = `report-card ${isSelectable ? 'selectable dossier-mode' : ''}`;

        // Aggiungo onclick sull'intera card
        // Se NON siamo in modalità dossier, il click porta alla mappa.
        // Se siamo in modalità dossier, il click potrebbe servire per selezionare (ma c'è la checkbox), 
        // quindi meglio disabilitare la navigazione.
        card.onclick = () => {
            if (!isDossierMode) {
                goToReportMarker(r.id);
            }
        };

        card.innerHTML = `
            ${checkboxHtml}
            <div class="report-header">
                <span>${new Date(r.created_at).toLocaleString('it-IT')}</span>
                <span class="badge ${r.status === 'validata' ? 'validata' : (r.status === 'archiviata' ? 'archiviata' : '')}">${r.status}</span>
            </div>
            ${groupName}
            <div style="font-size:0.8rem; font-weight:bold; color:#4b5563; margin-bottom:4px;">👤 ${authorName}</div>
            <div class="report-title">${r.description}</div>
            <div class="report-badges">
                <span class="badge ${r.category}">${r.category}</span>
                <button class="btn-whatsapp" onclick="event.stopPropagation(); shareReport('${r.id}')">
                    <span class="material-icons" style="font-size:16px">share</span> Condividi
                </button>
            </div>
            ${adminHtml}`;
        container.appendChild(card);
    });
}

async function generateDossierPDF() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    const title = document.getElementById('dossier-title').value;
    const notes = document.getElementById('dossier-notes').value;
    const selectedReports = allReportsCache.filter(r => selectedReportIds.has(r.id));

    doc.setFontSize(22);
    doc.setTextColor(245, 158, 11);
    doc.text("C.d.V Grosseto - Report", 10, 20);

    doc.setFontSize(12);
    doc.setTextColor(0);
    doc.text(`Generato il: ${new Date().toLocaleString('it-IT')}`, 10, 30);
    doc.text(`Autore Report: ${currentProfile.full_name}`, 10, 36);

    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text(title, 10, 50);

    if (notes) {
        doc.setFontSize(11);
        doc.setFont("helvetica", "italic");
        doc.text("Note per le autorità:", 10, 60);
        doc.setFont("helvetica", "normal");
        const splitNotes = doc.splitTextToSize(notes, 180);
        doc.text(splitNotes, 10, 66);
    }

    let yPos = notes ? 80 + (notes.length / 2) : 60;

    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("Dettaglio Segnalazioni Selezionate", 10, yPos);
    yPos += 10;

    selectedReports.forEach((r, i) => {
        if (yPos > 270) { doc.addPage(); yPos = 20; }

        const coords = parseCoordinates(r);
        const locationStr = coords ? `${coords[0].toFixed(5)}, ${coords[1].toFixed(5)}` : "Posizione non disp.";
        const author = profilesCache[r.user_id] || "N/D";
        const dateStr = new Date(r.created_at).toLocaleString('it-IT');

        doc.setFillColor(245, 245, 245);
        doc.rect(10, yPos, 190, 35, 'F');

        doc.setFontSize(10);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(0);
        doc.text(`#${i + 1} - ${r.category.toUpperCase()} (${dateStr})`, 15, yPos + 8);

        doc.setFont("helvetica", "normal");
        doc.text(`Luogo: ${locationStr}`, 15, yPos + 14);
        doc.text(`Segnalato da: ${author}`, 15, yPos + 20);

        doc.setFont("helvetica", "italic");
        const descSplit = doc.splitTextToSize(r.description, 180);
        doc.text(descSplit, 15, yPos + 28);

        yPos += 40;
    });

    doc.save("CDV_Dossier.pdf");
    closeModal('modal-dossier');
    toggleDossierMode();
    showMessage("Completato", "Il Dossier PDF è stato scaricato.", "success");
}

function openReportModal() {
    if (currentProfile.role === 'coord_generale') {
        const container = document.getElementById('admin-report-group-container');
        const select = document.getElementById('report-group-select');
        select.innerHTML = '<option value="">-- Seleziona Gruppo --</option>';
        availableGroups.forEach(g => {
            select.innerHTML += `<option value="${g.id}">${g.name}</option>`;
        });
        container.style.display = 'block';

        // MOSTRA PULSANTE EMERGENZA
        document.getElementById('btn-cat-emergency').style.display = 'flex';
    } else if (currentProfile.role === 'coord_gruppo') {
        document.getElementById('admin-report-group-container').style.display = 'none';
        // MOSTRA PULSANTE EMERGENZA ANCHE A COORD GRUPPO
        document.getElementById('btn-cat-emergency').style.display = 'flex';
    } else {
        document.getElementById('admin-report-group-container').style.display = 'none';
        document.getElementById('btn-cat-emergency').style.display = 'none';
    }

    document.getElementById('modal-report').style.display = 'flex';
}

// NUOVA: Trigger Alert Modale
function triggerEmergencyAlert(reports) {
    const contentDiv = document.getElementById('emergency-text');

    // Supporta sia oggetto singolo che array
    const list = Array.isArray(reports) ? reports : [reports];
    if (list.length === 0) return;

    if (list.length === 1) {
        contentDiv.innerText = list[0].description || "ALLERTA GENERALE";
    } else {
        // Genera lista HTML per multiple emergenze
        let html = '<ul style="text-align:left; padding-left:20px; margin:0; list-style-type: disc;">';
        list.forEach(r => {
            const safeDesc = (r.description || "ALLERTA").replace(/</g, "&lt;").replace(/>/g, "&gt;");
            html += `<li style="margin-bottom:8px;">${safeDesc}</li>`;
        });
        html += '</ul>';
        contentDiv.innerHTML = html;
    }

    document.getElementById('modal-emergency').style.display = 'flex';

    // Suono (prova a riprodurre, i browser potrebbero bloccare se non c'è stata interazione)
    const audio = document.getElementById('siren-sound');
    if (audio) {
        audio.currentTime = 0;
        audio.play().catch(e => console.log("Audio play bloccato da policy browser:", e));
    }
}


function closeModal(id) { document.getElementById(id).style.display = 'none'; }
// --- SCELTA CATEGORIA ---
function setCategory(cat, btn) {
    selectedCategory = cat;
    document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');

    // Mostra/Nascondi opzioni durata se è emergenza
    const durationBox = document.getElementById('emergency-duration-options');
    if (cat === 'emergenza') {
        durationBox.style.display = 'block';
    } else {
        durationBox.style.display = 'none';
    }
}


async function submitReport() {
    const desc = document.getElementById('report-desc').value;
    if (!desc || !tempLocation) return showMessage("Dati mancanti", "Inserisci una descrizione e un punto.", 'error');

    let targetGroupId = currentProfile.group_id;

    if (currentProfile.role === 'coord_generale') {
        targetGroupId = document.getElementById('report-group-select').value;
        if (!targetGroupId) return showMessage("Gruppo Mancante", "Come Admin, devi specificare a quale gruppo appartiene questa segnalazione.", 'error');
    }

    if (!targetGroupId && currentProfile.role !== 'coord_generale') return showMessage("Errore", "Nessun gruppo assegnato.", 'error');

    // --- CONTROLLO GEOFENCING (POLIGONO) ---
    // Se l'utente non è Coord. Generale (che può postare ovunque), controlliamo se è nel suo recinto
    if (currentProfile.role !== 'coord_generale' && targetGroupId) {
        const group = availableGroups.find(g => g.id === targetGroupId);
        if (group && group.boundary_coords && group.boundary_coords.length > 2) {
            // Verifica
            const isInside = isPointInPolygon([tempLocation.lat, tempLocation.lng], group.boundary_coords);
            if (!isInside) {
                return showMessage("Fuori Zona", `Non puoi creare segnalazioni fuori dal confine del gruppo "${group.name}".`, 'error');
            }
        }
    }
    // ---------------------------------------

    const wkt = `POINT(${tempLocation.lng} ${tempLocation.lat})`;

    // CALCOLO SCADENZA (Solo se emergenza)
    let expiresAt = null;
    if (selectedCategory === 'emergenza') {
        const hours = document.querySelector('input[name="em_duration"]:checked').value;
        const d = new Date();
        d.setHours(d.getHours() + parseInt(hours));
        expiresAt = d.toISOString();
    }

    const { data, error } = await supabaseClient.from('reports').insert({
        user_id: currentUser.id,
        group_id: targetGroupId,
        category: selectedCategory,
        description: desc,
        location: wkt,
        lat: tempLocation.lat,
        lng: tempLocation.lng,
        status: 'nuova',
        expires_at: expiresAt
    }).select().single();

    if (error) showMessage("Errore Invio", error.message, 'error');
    else {
        showMessage("Ottimo", "Segnalazione inviata con successo!", 'success');
        closeModal('modal-report');
        document.getElementById('report-desc').value = '';
        if (tempReportMarker) { map.removeLayer(tempReportMarker); tempReportMarker = null; }

        // TRIGGER MANUALE SOS (Per l'admin che lo invia)
        if (selectedCategory === 'emergenza') {
            triggerEmergencyAlert(data);
        }
    }
}

function updateReport(id, status) {
    showConfirm("Conferma Validazione", "Vuoi validare questa segnalazione?", async () => {
        const { error } = await supabaseClient.from('reports').update({ status }).eq('id', id);
        if (error) showMessage("Errore", error.message, 'error');
    });
}

function archiveReport(id) {
    showConfirm("Archivia Segnalazione", "La segnalazione verrà spostata in archivio e non sarà più visibile nella mappa principale.", async () => {
        const { error } = await supabaseClient.from('reports').update({ status: 'archiviata' }).eq('id', id);
        if (error) showMessage("Errore", error.message, 'error');
        else showMessage("Archiviata", "Segnalazione spostata in archivio.", "success");
    });
}

function deleteReport(id) {
    showConfirm("Elimina Segnalazione", "Questa azione è irreversibile.", async () => {
        await supabaseClient.from('reports').delete().eq('id', id);
    });
}

// ================= 5. GESTIONE UTENTI & GRUPPI =================
async function loadGroups() {
    const { data } = await supabaseClient.from('groups').select('*').order('name');
    if (data) {
        availableGroups = data;
        renderGroupsList();
        renderAllGroupPolygons(); // Visualizza confini
    }
}

function filterUsersByGroup(groupId) {
    selectedGroupIdFilter = groupId;
    renderGroupsList();
    loadUsers();
}

function renderGroupsList() {
    const list = document.getElementById('groups-list');
    if (!list) return;
    list.innerHTML = '';

    const divAll = document.createElement('div');
    divAll.className = `group-item ${selectedGroupIdFilter === null ? 'active-filter' : ''}`;
    divAll.style.background = selectedGroupIdFilter === null ? '#e0f2fe' : 'white';
    divAll.innerHTML = `<span onclick="filterUsersByGroup(null)" style="cursor:pointer; font-weight:bold; flex-grow:1;">Mostra Tutti</span>`;
    list.appendChild(divAll);

    if (availableGroups.length === 0) { return; }

    availableGroups.forEach(g => {
        const div = document.createElement('div');
        const isActive = selectedGroupIdFilter === g.id;
        div.className = `group-item ${isActive ? 'active-filter' : ''}`;
        div.style.background = isActive ? '#e0f2fe' : 'white';
        div.innerHTML = `
            <span onclick="filterUsersByGroup('${g.id}')" style="cursor:pointer; flex-grow:1; display:block;">${g.name}</span>
            <div style="display:flex; gap:5px;">
                <button class="btn-small btn-edit" onclick="openEditGroup('${g.id}')">✏️</button>
                <button class="btn-small btn-delete" onclick="deleteGroup('${g.id}')">🗑️</button>
            </div>
        `;
        list.appendChild(div);
    });
}

function openEditGroup(id) {
    const group = availableGroups.find(g => g.id === id);
    if (!group) return;

    document.getElementById('edit-group-id').value = group.id;
    document.getElementById('edit-group-name').value = group.name;
    document.getElementById('edit-group-lat').value = group.lat;
    document.getElementById('edit-group-lng').value = group.lng;

    document.getElementById('modal-group-edit').style.display = 'flex';
}

async function saveGroupChanges() {
    const id = document.getElementById('edit-group-id').value;
    const name = document.getElementById('edit-group-name').value;
    const lat = document.getElementById('edit-group-lat').value;
    const lng = document.getElementById('edit-group-lng').value;

    if (!name || !lat || !lng) return showMessage("Errore", "Dati mancanti", 'error');

    const { error } = await supabaseClient.from('groups').update({
        name: name,
        lat: parseFloat(lat),
        lng: parseFloat(lng)
    }).eq('id', id);

    if (error) {
        showMessage("Errore", error.message, 'error');
    } else {
        showMessage("Successo", "Gruppo aggiornato", 'success');
        closeModal('modal-group-edit');
        loadGroups();
    }
}

async function createNewGroup() {
    const name = document.getElementById('new-group-name').value;
    const lat = document.getElementById('new-group-lat').value || 42.760;
    const lng = document.getElementById('new-group-lng').value || 11.108;
    const zoom = document.getElementById('new-group-zoom').value || 15;

    if (!name) return showMessage("Manca il nome", "Inserisci un nome per il gruppo", 'error');
    if (!lat || !lng) return showMessage("Manca posizione", "Seleziona prima un punto sulla mappa!", 'error');

    const { error } = await supabaseClient.from('groups').insert({
        name: name,
        lat: parseFloat(lat),
        lng: parseFloat(lng),
        zoom: parseInt(zoom)
    });

    if (error) {
        showMessage("Errore", error.message, 'error');
    } else {
        document.getElementById('new-group-name').value = '';
        document.getElementById('new-group-lat').value = '';
        document.getElementById('new-group-lng').value = '';
    }
}

function deleteGroup(id) {
    showConfirm("Elimina Gruppo", "Il gruppo verrà eliminato e gli utenti scollegati.", async () => {
        const { error: err1 } = await supabaseClient.from('profiles').update({ group_id: null }).eq('group_id', id);
        if (err1) return showMessage("Errore Profili", err1.message, 'error');

        const { error: err2 } = await supabaseClient.from('reports').update({ group_id: null }).eq('group_id', id);
        if (err2) return showMessage("Errore Reports", err2.message, 'error');

        const { error: err3 } = await supabaseClient.from('groups').delete().eq('id', id);
        if (err3) showMessage("Errore Eliminazione", err3.message, 'error');
        else showMessage("Eliminato", "Gruppo cancellato correttamente.", 'success');
    });
}

function deleteUser(id) {
    showConfirm("Elimina Utente", "Sei sicuro di voler rimuovere questo utente (Login e Profilo)?", async () => {
        // Usa la funzione RPC per cancellare auth.users e public.profiles
        const { error } = await supabaseClient.rpc('delete_user_complete', { target_id: id });

        if (error) {
            console.error(error);
            // Fallback: se la funzione non esiste ancora o fallisce, prova a cancellare solo il profilo
            const { error: profileError } = await supabaseClient.from('profiles').delete().eq('id', id);

            if (profileError) {
                showMessage("Errore", error.message, 'error');
            } else {
                showMessage("Attenzione", "Cancellato solo il profilo. Esegui la query SQL su Supabase per abilitare la cancellazione completa.", 'info');
                loadUsers();
            }
        } else {
            showMessage("Fatto", "Utente eliminato definitivamente.", 'success');
            loadUsers();
        }
    });
}

async function loadUsers() {
    if (!currentProfile) return;
    let query = supabaseClient.from('profiles').select('*').order('created_at', { ascending: false });
    if (currentProfile.role === 'coord_gruppo') query = query.eq('group_id', currentProfile.group_id);

    const { data: users } = await query;
    const container = document.getElementById('users-list');
    container.innerHTML = '';

    let displayUsers = users;
    if (currentProfile.role === 'coord_generale' && selectedGroupIdFilter) {
        displayUsers = users.filter(u => u.group_id === selectedGroupIdFilter);
    }

    let unassignedHtml = '', assignedHtml = '';

    displayUsers.forEach(user => {
        const grp = availableGroups.find(g => g.id === user.group_id);
        const isUnassigned = !user.group_id;
        let canEdit = (currentProfile.role === 'coord_generale') || (currentProfile.role === 'coord_gruppo' && user.role === 'utente');

        let actionButtons = '';

        const isProtected = (user.email === PROTECTED_EMAIL);

        if (canEdit) {
            actionButtons += `<button class="btn-small btn-edit" style="margin-right:5px;" onclick="openEditUser('${user.id}')">✏️</button>`;

            if (!isProtected) {
                actionButtons += `<button class="btn-small btn-delete" onclick="deleteUser('${user.id}')">🗑️</button>`;
            }
        }

        let emailDisplay = '';
        if (currentProfile.role === 'coord_generale' || currentProfile.role === 'coord_gruppo') {
            emailDisplay = `<div class="email-display">📧 ${user.email || 'N/D'}</div>`;
        }

        // --- PRESENCE STATUS DOT (Solo per Admin) ---
        let statusDot = '';
        if (currentProfile.role === 'coord_generale') {
            const isOnline = onlineUsers.has(user.id);
            const color = isOnline ? '#10B981' : '#EF4444'; // Green o Red
            statusDot = `<span title="${isOnline ? 'Online' : 'Offline'}" style="height:10px; width:10px; background-color:${color}; border-radius:50%; display:inline-block; margin-right:8px; box-shadow:0 0 4px rgba(0,0,0,0.2);"></span>`;
        }
        // ---------------------------------------------

        const cardHtml = `
            <div class="user-card ${user.role}" style="${isUnassigned ? 'border-left-color: #f59e0b; background: #fffbeb;' : ''}">
                <div style="display:flex; justify-content:space-between; align-items:flex-start">
                    <div>
                        <div style="font-weight:bold; font-size:1rem; display:flex; align-items:center;">
                            ${statusDot}
                            ${user.full_name || 'Senza Nome'}
                        </div>
                        ${emailDisplay}
                        <div style="font-size:0.8rem; margin-top:2px;">📞 ${user.phone || 'No tel'}</div>
                        <div class="user-role">${user.role}</div>
                        <div style="font-size:0.9rem; color:${grp ? '#666' : '#d97706'}">${grp ? '📍 ' + grp.name : 'DA ASSEGNARE'}</div>
                    </div>
                    <div style="margin-left:10px;">${actionButtons}</div>
                </div>
            </div>`;

        if (isUnassigned && currentProfile.role === 'coord_generale') unassignedHtml += cardHtml;
        else assignedHtml += cardHtml;
    });

    if (unassignedHtml && !selectedGroupIdFilter) container.innerHTML += unassignedHtml + '<hr>';
    container.innerHTML += assignedHtml || '<p style="text-align:center; padding:10px">Nessun utente trovato.</p>';
}

async function openEditUser(uid) {
    const { data: u } = await supabaseClient.from('profiles').select('*').eq('id', uid).single();
    if (!u) { showMessage("Errore", "Dati utente non trovati", 'error'); return; }

    document.getElementById('edit-user-id').value = u.id;

    const nameInput = document.getElementById('edit-user-name');
    nameInput.value = u.full_name || '';
    nameInput.disabled = false;
    nameInput.style.background = 'white';

    document.getElementById('edit-user-email').value = u.email || '';
    document.getElementById('edit-user-phone').value = u.phone || '';

    if (currentProfile.role === 'coord_generale') {
        document.getElementById('super-admin-fields').style.display = 'block';
        document.getElementById('admin-reset-pwd-box').style.display = 'block'; // Mostra box reset
        document.getElementById('coord-fields').style.display = 'none';
        const gs = document.getElementById('edit-user-group');
        gs.innerHTML = '<option value="">-- Nessun --</option>';
        availableGroups.forEach(g => {
            const o = document.createElement('option'); o.value = g.id; o.text = g.name;
            if (g.id === u.group_id) o.selected = true;
            gs.appendChild(o);
        });
        document.getElementById('edit-user-role').value = u.role;
        document.getElementById('btn-save-user').onclick = saveUserChanges;
        document.getElementById('btn-save-user').style.display = 'block';
    } else if (currentProfile.role === 'coord_gruppo') {
        document.getElementById('super-admin-fields').style.display = 'none';
        document.getElementById('admin-reset-pwd-box').style.display = 'none'; // Nascondi box reset
        document.getElementById('coord-fields').style.display = 'block';
        document.getElementById('btn-save-user').onclick = saveUserChanges;
        document.getElementById('btn-save-user').style.display = 'block';
    }
    document.getElementById('modal-user-edit').style.display = 'flex';
}

// --- NUOVE FUNZIONI RESET PASSWORD (ADMIN) ---
function openResetPasswordPrompt() {
    document.getElementById('modal-admin-reset-prompt').style.display = 'flex';
    document.getElementById('admin-temp-password').value = '';
}

async function confirmResetPassword() {
    const targetUserId = document.getElementById('edit-user-id').value;
    const tempPass = document.getElementById('admin-temp-password').value;

    if (!tempPass || tempPass.length < 6) return showMessage("Errore", "La password deve avere almeno 6 caratteri.", "error");

    showMessage("Attendere...", "Reset in corso...", "info");

    const { error } = await supabaseClient.rpc('admin_reset_password', {
        target_user_id: targetUserId,
        temp_password: tempPass
    });

    if (error) {
        showMessage("Errore RPC", error.message, 'error');
    } else {
        closeModal('modal-admin-reset-prompt');
        showMessage("Successo", "Password resettata! L'utente dovrà cambiarla al prossimo login.", "success");
    }
}


async function saveUserChanges() {
    const uid = document.getElementById('edit-user-id').value;

    const updateData = {
        phone: document.getElementById('edit-user-phone').value,
        full_name: document.getElementById('edit-user-name').value
    };

    if (currentProfile.role === 'coord_generale') {
        updateData.role = document.getElementById('edit-user-role').value;
        updateData.group_id = document.getElementById('edit-user-group').value || null;
    }

    const { error } = await supabaseClient.from('profiles').update(updateData).eq('id', uid);

    if (error) {
        showMessage("Errore Salvataggio", error.message, 'error');
    } else {
        closeModal('modal-user-edit');
        showMessage("Salvato", "Profilo aggiornato correttamente.", 'success');
        loadUsers();
    }
}

function removeUserFromGroup() {
    showConfirm("Rimuovi utente", "Rimuovere questo utente dal gruppo?", async () => {
        const { error } = await supabaseClient.from('profiles').update({ group_id: null }).eq('id', document.getElementById('edit-user-id').value);

        if (error) {
            showMessage("Errore", error.message, 'error');
        } else {
            closeModal('modal-user-edit');
            showMessage("Fatto", "Utente rimosso dal gruppo.", 'success');
            loadUsers();
        }
    });
}

async function openStatsModal() {
    document.getElementById('modal-stats').style.display = 'flex';
    document.getElementById('stat-total').innerText = allReportsCache.length;

    const statsBody = document.getElementById('stats-groups-body');
    statsBody.innerHTML = '';

    let activeGroupsCount = 0;
    const stats = {};

    availableGroups.forEach(g => {
        stats[g.id] = { name: g.name, total: 0, sospetto: 0, degrado: 0, assistenza: 0 };
    });

    stats['null'] = { name: 'Generale', total: 0, sospetto: 0, degrado: 0, assistenza: 0 };

    allReportsCache.forEach(r => {
        const gid = r.group_id || 'null';
        if (!stats[gid]) stats[gid] = { name: 'Sconosciuto', total: 0, sospetto: 0, degrado: 0, assistenza: 0 };

        stats[gid].total++;
        if (r.category === 'sospetto') stats[gid].sospetto++;
        if (r.category === 'degrado') stats[gid].degrado++;
        if (r.category === 'assistenza') stats[gid].assistenza++;
    });

    Object.keys(stats).forEach(gid => {
        const s = stats[gid];
        if (s.total > 0) {
            if (gid !== 'null') activeGroupsCount++;

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${s.name}</td>
                <td><b>${s.total}</b></td>
                <td>${s.sospetto}</td>
                <td>${s.degrado}</td>
                <td>${s.assistenza}</td>
            `;
            statsBody.appendChild(tr);
        }
    });

    document.getElementById('stat-active-groups').innerText = activeGroupsCount;
}

// --- LOGICA CAMBIO PASSWORD FORZATO (UTENTE) ---
async function performForcedPasswordChange() {
    const p1 = document.getElementById('new-forced-password').value;
    const p2 = document.getElementById('confirm-forced-password').value;

    if (!p1 || p1.length < 6) return alert("La password deve avere almeno 6 caratteri.");
    if (p1 !== p2) return alert("Le password non coincidono.");

    // 1. Aggiorna password in auth
    const { error } = await supabaseClient.auth.updateUser({ password: p1 });
    if (error) return alert("Errore cambio password: " + error.message);

    // 2. Togli il flag chiamando la funzione sicura o aggiornando il profilo
    // Proviamo procedura diretta + funzione backup
    const { error: profileError } = await supabaseClient.from('profiles').update({ force_password_change: false }).eq('id', currentUser.id);

    if (profileError) {
        console.warn("Update profile fallito, provo RPC...", profileError);
        // Fallback su RPC se le policy bloccano l'update diretto
        await supabaseClient.rpc('confirm_password_change');
    }

    alert("Password aggiornata con successo! Benvenuto.");
    document.getElementById('modal-force-password').style.display = 'none';

    // Ricarichiamo la pagina per un avvio pulito
    window.location.reload();
}

// ================= GEOFENCING LOGIC =================

function startDrawingBoundary() {
    closeModal('modal-group-edit');
    drawingMode = true;
    tempBoundaryPoints = [];

    // Setup UI
    document.getElementById('fab-add').style.display = 'none';
    document.getElementById('location-picker-ui').style.display = 'none';
    document.getElementById('drawing-ui').style.display = 'block';

    // Zoom sul gruppo se possibile
    const limitLat = document.getElementById('edit-group-lat').value;
    const limitLng = document.getElementById('edit-group-lng').value;
    if (limitLat && limitLng) {
        map.setView([parseFloat(limitLat), parseFloat(limitLng)], 15);
    }

    switchTab('map');

    // Carica poligono esistente se c'è
    const gid = document.getElementById('edit-group-id').value;
    const group = availableGroups.find(g => g.id === gid);
    if (group && group.boundary_coords) {
        tempBoundaryPoints = [...group.boundary_coords];
        renderTempPolygon();
    }
}

function renderTempPolygon() {
    if (tempPolygonLayer) map.removeLayer(tempPolygonLayer);

    if (tempBoundaryPoints.length > 0) {
        // Punti (Marker)
        const markers = tempBoundaryPoints.map(p => L.circleMarker(p, { radius: 4, color: 'orange' }).addTo(map));

        // Linea/Poligono
        const poly = L.polygon(tempBoundaryPoints, { color: 'orange', dashArray: '5, 5' }).addTo(map);

        tempPolygonLayer = L.layerGroup([...markers, poly]);
        map.addLayer(tempPolygonLayer);
    }
}

function undoLastPoint() {
    if (tempBoundaryPoints.length > 0) {
        tempBoundaryPoints.pop();
        renderTempPolygon();
    }
}

function cancelDrawing() {
    drawingMode = false;
    tempBoundaryPoints = [];
    if (tempPolygonLayer) map.removeLayer(tempPolygonLayer);
    document.getElementById('drawing-ui').style.display = 'none';
    document.getElementById('fab-add').style.display = 'flex';
    document.getElementById('modal-group-edit').style.display = 'flex';
    switchTab('users');
}

async function saveBoundary() {
    if (tempBoundaryPoints.length < 3) return showMessage("Errore", "Disegna almeno 3 punti per chiudere un'area.", 'error');

    const gid = document.getElementById('edit-group-id').value;

    const { error } = await supabaseClient.from('groups').update({
        boundary_coords: tempBoundaryPoints
    }).eq('id', gid);

    if (error) {
        showMessage("Errore", error.message, 'error');
    } else {
        showMessage("Confine Salvato", "Area di competenza aggiornata.", 'success');

        // Aggiorna locale
        const group = availableGroups.find(g => g.id === gid);
        if (group) group.boundary_coords = tempBoundaryPoints;

        loadGroups(); // Ricarica per aggiornare mappa
        cancelDrawing(); // Chiude UI e torna modale
    }
}

// Ray-Casting Algorithm for Point in Polygon
function isPointInPolygon(point, vs) {
    // point = [lat, lng] OR {lat, lng}
    // vs = [[lat, lng], [lat, lng], ...] OR [{lat, lng}, {lat, lng}, ...]

    // Normalize point
    const x = (Array.isArray(point)) ? point[0] : point.lat;
    const y = (Array.isArray(point)) ? point[1] : point.lng;

    let inside = false;
    for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
        // Normalize vertices
        const xi = (Array.isArray(vs[i])) ? vs[i][0] : vs[i].lat;
        const yi = (Array.isArray(vs[i])) ? vs[i][1] : vs[i].lng;
        const xj = (Array.isArray(vs[j])) ? vs[j][0] : vs[j].lat;
        const yj = (Array.isArray(vs[j])) ? vs[j][1] : vs[j].lng;

        const intersect = ((yi > y) !== (yj > y))
            && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}

// Renderizza i poligoni di TUTTI i gruppi sulla mappa
function renderAllGroupPolygons() {
    groupPolygonsLayer.clearLayers();

    // Opzionale: Mostra solo il poligono del PROPRIO gruppo se si è User/Coord
    // O tutti se si è Coord Generale?
    // Facciamo vedere tutti i confini per chiarezza

    availableGroups.forEach(g => {
        if (g.boundary_coords && g.boundary_coords.length > 2) {
            const poly = L.polygon(g.boundary_coords, {
                color: '#3B82F6',
                weight: 2,
                fillColor: '#3B82F6',
                fillOpacity: 0.05, // Molto leggero
                interactive: false // PERMETTE AI CLICK DI PASSARE ALLA MAPPA SOTTOSTANTE
            });
            // poly.bindPopup(`Zona: <b>${g.name}</b>`);
            groupPolygonsLayer.addLayer(poly);
        }
    });
}
