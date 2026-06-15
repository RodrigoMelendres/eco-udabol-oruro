/* =====================================================
   CONFIGURACIÓN DE FIREBASE (¡CONEXIÓN REAL!)
===================================================== */
const FIREBASE_DB_URL = "https://ecoudabol-oruro-default-rtdb.firebaseio.com/";

/* =====================================================
   VARIABLES GLOBALES
===================================================== */
let modo = "vecino";
let puntos = [];
let routingControl = null;
let marcadorUsuarioConectado = null;
let watchIdVecino = null;
let watchIdCamion = null;

/* =====================================================
   COORDENADAS ESTRATÉGICAS DE ORURO
===================================================== */
const PLAZA_10_FEBRERO_VECINO = [-17.9647, -67.1060];
const AV_6_DE_AGOSTO_CAMION = [-17.9703, -67.1105];
const OFICINAS_EMAO_ADMIN = [-17.969861, -67.109500];

/* =====================================================
   LIMITES DE ORURO
===================================================== */
const LIMITES_ORURO = {
    latMin: -18.0200,
    latMax: -17.9100,
    lngMin: -67.1600,
    lngMax: -67.0600
};

/* =====================================================
   MAPA INICIALIZACIÓN
===================================================== */
const map = L.map('map').setView(PLAZA_10_FEBRERO_VECINO, 14);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap'
}).addTo(map);

const cluster = L.markerClusterGroup();
map.addLayer(cluster);

// Inicializar apuntando a Oruro de entrada
establecerPosicionPorRol(PLAZA_10_FEBRERO_VECINO, "🏠 Vecino (Plaza 10 de Febrero)");
ocultarBotonesAdmin();

// Sincronización cíclica cada 3 segundos garantizada para todos los dispositivos
cargarPuntosDesdeLaNube();
setInterval(cargarPuntosDesdeLaNube, 3000);


/* =====================================================
   MENÚ LATERAL DESLIZABLE (LOGICA DE INTERFAZ)
===================================================== */
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const btn = document.getElementById('toggleMenuBtn');
    
    sidebar.classList.toggle('hidden');
    
    if (sidebar.classList.contains('hidden')) {
        btn.innerHTML = `<i class="fas fa-bars"></i>`;
    } else {
        btn.innerHTML = `<i class="fas fa-times"></i>`;
    }
    
    // Forzar a Leaflet a reajustar el tamaño del mapa tras el deslizamiento
    setTimeout(() => {
        map.invalidateSize();
    }, 400);
}


/* =====================================================
   CONEXIÓN CON LA BASE DE DATOS (FIREBASE)
===================================================== */
function cargarPuntosDesdeLaNube() {
    fetch(`${FIREBASE_DB_URL}puntos.json`)
    .then(res => res.json())
    .then(registros => {
        let popupAbiertoLatLng = null;
        if (map._popup && map._popup.getLatLng()) {
            popupAbiertoLatLng = map._popup.getLatLng();
        }

        cluster.clearLayers();
        puntos = [];

        if (registros && typeof registros === 'object') {
            for (let id in registros) {
                const p = registros[id];
                p.id = id;
                dibujarPuntoEnMapa(p);
            }
        }
        
        actualizarStats();
        filtrarMarcadores();

        if (popupAbiertoLatLng) {
            const puntoActualizado = puntos.find(p => p.lat === popupAbiertoLatLng.lat && p.lng === popupAbiertoLatLng.lng);
            if (puntoActualizado) {
                actualizarPopup(puntoActualizado);
            }
        }
    })
    .catch(err => console.error("Error cargando base de datos:", err));
}

function dibujarPuntoEnMapa(puntoData) {
    let color = '#00ff66';
    if (puntoData.nivel === 'medio') color = '#ffb300';
    if (puntoData.nivel === 'alto') color = '#ff245b';

    const marker = L.circleMarker([puntoData.lat, puntoData.lng], {
        radius: 12,
        color: color,
        fillColor: color,
        fillOpacity: 0.8,
        weight: 3
    });

    puntoData.marker = marker;
    puntos.push(puntoData);
    actualizarPopup(puntoData);
    cluster.addLayer(marker);
}


/* =====================================================
   CREAR REPORTE (VECINO)
===================================================== */
async function crearPunto(lat, lng, nivel) {
    map.closePopup();

    const ahora = new Date();
    const fecha = ahora.toLocaleDateString();
    const hora = machinedHora = ahora.toLocaleTimeString();

    let direccion = "Zona Urbana Oruro";
    try {
        const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`);
        const data = await response.json();
        direccion = data.display_name || "Oruro";
    } catch (e) {
        console.log("Dirección genérica mapeada.");
    }

    const nuevoPunto = {
        nivel: nivel,
        estado: 'espera',
        lat: lat,
        lng: lng,
        fecha: fecha,
        hora: hora,
        direccion: direccion
    };

    fetch(`${FIREBASE_DB_URL}puntos.json`, {
        method: 'POST',
        body: JSON.stringify(nuevoPunto),
        headers: { 'Content-Type': 'application/json' }
    })
    .then(res => res.json())
    .then(() => {
        cargarPuntosDesdeLaNube();
    })
    .catch(err => alert("Error de red al reportar: " + err));
}


/* =====================================================
   ACTUALIZAR / FINALIZAR LOGÍSTICA (CAMIÓN / ADMIN)
===================================================== */
function cambiarEstadoEnMemoria(lat, lng, nuevoEstado) {
    const punto = puntos.find(p => p.lat === lat && p.lng === lng);
    if (!punto || !punto.id) return;

    fetch(`${FIREBASE_DB_URL}puntos/${punto.id}.json`, {
        method: 'PATCH',
        body: JSON.stringify({ estado: nuevoEstado }),
        headers: { 'Content-Type': 'application/json' }
    })
    .then(() => {
        if (routingControl !== null && nuevoEstado === 'recogido') {
            map.removeControl(routingControl);
            routingControl = null;
        }
        map.closePopup();
        cargarPuntosDesdeLaNube();
    })
    .catch(err => console.error("Error al despachar el estado:", err));
}

function limpiarPuntos() {
    if (!confirm('¿Desea vaciar por completo todos los puntos activos en Oruro de la nube?')) return;

    fetch(`${FIREBASE_DB_URL}puntos.json`, { method: 'DELETE' })
    .then(() => {
        if (routingControl !== null) { map.removeControl(routingControl); routingControl = null; }
        cluster.clearLayers();
        puntos = [];
        actualizarStats();
        alert('Nube formateada y limpia.');
    });
}


/* =====================================================
   ROLES, LOGINS Y UBICACIONES
===================================================== */
function establecerPosicionPorRol(coords, texto) {
    if (marcadorUsuarioConectado) map.removeLayer(marcadorUsuarioConectado);
    marcadorUsuarioConectado = L.marker(coords).addTo(map).bindPopup(`<b>${texto}</b>`).openPopup();
    map.setView(coords, 15);
}

function iniciarSeguimientoTiempoReal(tipo) {
    if (!navigator.geolocation) return;
    const watchId = navigator.geolocation.watchPosition(function(pos) {
        const lat = pos.coords.latitude; const lng = pos.coords.longitude;
        if (marcadorUsuarioConectado) map.removeLayer(marcadorUsuarioConectado);
        let icono = tipo === "camion" ? "🚛" : "🏠";
        marcadorUsuarioConectado = L.marker([lat, lng]).addTo(map).bindPopup(`<b>${icono} Mi posición real</b>`);
    }, null, { enableHighAccuracy: true });
    if (tipo === "vecino") watchIdVecino = watchId;
    if (tipo === "camion") watchIdCamion = watchId;
}

function loginPersonal() {
    const user = document.getElementById('user').value.trim().toLowerCase();
    const pass = document.getElementById('pass').value.trim();

    if (user === 'rodrigo melendres' && pass === '12345') {
        modo = 'admin';
        document.getElementById('loginScreen').style.display = 'none';
        document.getElementById('userType').innerHTML = `<i class="fas fa-user-shield"></i> Administrador`;
        document.getElementById('exportBtn').style.display = 'block';
        document.getElementById('clearBtn').style.display = 'block';
        establecerPosicionPorRol(OFICINAS_EMAO_ADMIN, "🏢 Oficinas EMAO (Junín y Velasco Galvarro)");
    } 
    else if (user === 'camion' && pass === '12345') {
        modo = 'camion';
        document.getElementById('loginScreen').style.display = 'none';
        document.getElementById('userType').innerHTML = `<i class="fas fa-truck"></i> Operador Camión`;
        document.getElementById('exportBtn').style.display = 'block';
        document.getElementById('clearBtn').style.display = 'none';
        establecerPosicionPorRol(AV_6_DE_AGOSTO_CAMION, "🚛 Base Camión de Basura");
    } else {
        document.getElementById('error').innerHTML = 'Credenciales Incorrectas';
    }
}

function loginVecino() {
    modo = 'vecino';
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('userType').innerHTML = '<i class="fas fa-house"></i> Vecino';
    ocultarBotonesAdmin();
    iniciarSeguimientoTiempoReal("vecino");
}

function ocultarBotonesAdmin() {
    if(document.getElementById('exportBtn')) document.getElementById('exportBtn').style.display = 'none';
    if(document.getElementById('clearBtn')) document.getElementById('clearBtn').style.display = 'none';
}

function activarModoAgregar() {
    alert("Haz clic en cualquier punto del mapa de Oruro para reportar desborde de basura.");
    map.once('click', (e) => {
        const lat = e.latlng.lat; const lng = e.latlng.lng;
        if (lat >= LIMITES_ORURO.latMin && lat <= LIMITES_ORURO.latMax && lng >= LIMITES_ORURO.lngMin && lng <= LIMITES_ORURO.lngMax) {
            mostrarSelectorNivel(lat, lng);
        } else {
            alert("❌ Reporte inválido. El punto debe estar dentro de Oruro.");
        }
    });
}

function mostrarSelectorNivel(lat, lng) {
    const html = `
        <div style="min-width:220px;color:black; font-family:sans-serif;">
            <h3 style="margin:0 0 10px 0; font-size:16px;">Nivel de Residuos</h3>
            <button onclick="crearPunto(${lat},${lng},'bajo')" style="width:100%; margin-bottom:8px; background:#00ff66; padding:8px; border-radius:6px; font-weight:bold; cursor:pointer; border:none;">🟢 Bajo</button>
            <button onclick="crearPunto(${lat},${lng},'medio')" style="width:100%; margin-bottom:8px; background:#ffb300; padding:8px; border-radius:6px; font-weight:bold; cursor:pointer; border:none;">🟠 Medio</button>
            <button onclick="crearPunto(${lat},${lng},'alto')" style="width:100%; background:#ff245b; color:white; padding:8px; border-radius:6px; font-weight:bold; cursor:pointer; border:none;">🔴 Alto</button>
        </div>`;
    L.popup().setLatLng([lat, lng]).setContent(html).openOn(map);
}

function actualizarPopup(punto) {
    let estadoColor = punto.estado === 'camino' ? '#00f0ff' : (punto.estado === 'recogido' ? '#39ff14' : '#ffb300');
    let botonesLogistica = (modo === 'camion' || modo === 'admin') ? `
        <button onclick="trazarRutaHaciaPunto(${punto.lat},${punto.lng})" style="width:100%; margin-bottom:6px; padding:6px; background:#00f0ff; font-weight:bold; cursor:pointer; border-radius:4px; border:none; color:black;">🚛 Trazar Ruta</button>
        <button onclick="cambiarEstadoEnMemoria(${punto.lat},${punto.lng},'recogido')" style="width:100%; padding:6px; background:#39ff14; font-weight:bold; cursor:pointer; border-radius:4px; border:none; color:black;">✅ Finalizar Trabajo</button>
    ` : `<p style="text-align:center; color:#666; font-size:12px; margin:5px 0 0 0;">🕒 En espera de atención EMAO</p>`;

    punto.marker.bindPopup(`
        <div style="color:black; min-width:200px; font-family:sans-serif;">
            <h3 style="margin:0 0 8px 0; font-size:16px;">Reporte Urbano</h3>
            <b>Volumen:</b> ${punto.nivel.toUpperCase()}<br>
            <b>Estado:</b> <span style="color:${estadoColor}; font-weight:bold;">${punto.estado.toUpperCase()}</span><br>
            <b>Ubicación:</b> <br><small style="color:#555;">${punto.direccion}</small><br><br>
            ${botonesLogistica}
        </div>
    `);
}

function trazarRutaHaciaPunto(lat, lng) {
    let origen = marcadorUsuarioConectado ? marcadorUsuarioConectado.getLatLng() : L.latLng(AV_6_DE_AGOSTO_CAMION);
    cambiarEstadoEnMemoria(lat, lng, 'camino');
    if (routingControl !== null) map.removeControl(routingControl);
    routingControl = L.Routing.control({
        waypoints: [L.latLng(origen.lat, origen.lng), L.latLng(lat, lng)],
        lineOptions: { styles: [{ color: '#00f0ff', opacity: 0.8, weight: 6 }] },
        addWaypoints: false, draggableWaypoints: false, fitSelectedRoutes: true,
        createMarker: function() { return null; }
    }).addTo(map);
}

function filtrarMarcadores() {
    cluster.clearLayers();
    const filtro = document.getElementById('mapFilter').value;
    puntos.forEach(punto => {
        if (filtro === 'todos' || (filtro === 'alto' && punto.nivel === 'alto') || (filtro === 'espera' && punto.estado === 'espera')) {
            cluster.addLayer(punto.marker);
        }
    });
}

function enviarMensaje() {
    const text = document.getElementById('mensaje').value; if (text.trim() === '') return;
    const div = document.createElement('div');
    div.className = modo === 'admin' ? 'message admin-message' : (modo === 'camion' ? 'message camion-message' : 'message');
    div.innerHTML = `<strong>${modo === 'admin' ? 'Administrador' : (modo === 'camion' ? 'Camión' : 'Vecino Oruro')}</strong><br>${text}`;
    document.getElementById('messages').prepend(div);
    document.getElementById('mensaje').value = '';
}

function actualizarStats() {
    let bajo = 0, medio = 0, alto = 0, espera = 0, camino = 0, recogido = 0;
    puntos.forEach(p => {
        if (p.nivel === 'bajo') bajo++; if (p.nivel === 'medio') medio++; if (p.nivel === 'alto') alto++;
        if (p.estado === 'espera') espera++; if (p.estado === 'camino') camino++; if (p.estado === 'recogido') recogido++;
    });
    const total = puntos.length || 1;
    if(document.getElementById('barLow')) document.getElementById('barLow').style.width = (bajo * 100 / total) + '%';
    if(document.getElementById('barMed')) document.getElementById('barMed').style.width = (medio * 100 / total) + '%';
    if(document.getElementById('barHigh')) document.getElementById('barHigh').style.width = (alto * 100 / total) + '%';
    
    if(document.getElementById('txtLow')) document.getElementById('txtLow').innerHTML = bajo; 
    if(document.getElementById('txtMed')) document.getElementById('txtMed').innerHTML = medio; 
    if(document.getElementById('txtHigh')) document.getElementById('txtHigh').innerHTML = alto;
    if(document.getElementById('txtEspera')) document.getElementById('txtEspera').innerHTML = espera; 
    if(document.getElementById('txtCamino')) document.getElementById('txtCamino').innerHTML = camino; 
    if(document.getElementById('txtRecogido')) document.getElementById('txtRecogido').innerHTML = recogido;
}

function exportarDatos() {
    if (puntos.length === 0) return alert('No hay datos.');
    let csv = 'Nivel;Estado;Fecha;Hora;Latitud;Longitud;Direccion\n';
    puntos.forEach(p => { csv += `${p.nivel};${p.estado};${p.fecha};${p.hora};${p.lat};${p.lng};"${p.direccion}"\n`; });
    const blob = new Blob(["\uFEFF" + csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = 'reporte_eco_oruro.csv';
    link.click();
}

if(document.getElementById('mapFilter')) {
    document.getElementById('mapFilter').addEventListener('change', filtrarMarcadores);
}
actualizarStats();