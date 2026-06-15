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
const OFICINAS_EMAO_ADMIN = [-17.9691, -67.1132];

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

/* =====================================================
   INICIO DEL SISTEMA
===================================================== */
establecerPosicionPorRol(PLAZA_10_FEBRERO_VECINO, "🏠 Vecino (Plaza 10 de Febrero)");
ocultarBotonesAdmin();

/* =====================================================
   POSICIÓN MANUAL
===================================================== */
function establecerPosicionPorRol(coords, texto) {
    if (marcadorUsuarioConectado) {
        map.removeLayer(marcadorUsuarioConectado);
    }

    marcadorUsuarioConectado = L.marker(coords)
        .addTo(map)
        .bindPopup(`
            <b>${texto}</b><br>
            Posición activa en el sistema.
        `)
        .openPopup();

    map.setView(coords, 16);
}

/* =====================================================
   GPS TIEMPO REAL
===================================================== */
function iniciarSeguimientoTiempoReal(tipo) {
    if (!navigator.geolocation) {
        alert("Tu navegador no soporta geolocalización.");
        return;
    }

    const watchId = navigator.geolocation.watchPosition(
        function(pos) {
            const lat = pos.coords.latitude;
            const lng = pos.coords.longitude;

            if (marcadorUsuarioConectado) {
                map.removeLayer(marcadorUsuarioConectado);
            }

            let icono = "🏠";
            if (tipo === "camion") {
                icono = "🚛";
            }

            marcadorUsuarioConectado = L.marker([lat, lng])
                .addTo(map)
                .bindPopup(`
                    <b>${icono} ${tipo.toUpperCase()}</b><br>
                    Latitud: ${lat}<br>
                    Longitud: ${lng}
                `);

            map.setView([lat, lng], 16);
        },
        function(error) {
            console.log("Error GPS:", error);
        },
        {
            enableHighAccuracy: true,
            maximumAge: 0,
            timeout: 10000
        }
    );

    if (tipo === "vecino") {
        watchIdVecino = watchId;
    }
    if (tipo === "camion") {
        watchIdCamion = watchId;
    }
}

/* =====================================================
   GPS CAMIÓN CADA 30 SEGUNDOS
===================================================== */
function iniciarCamion30Segundos() {
    navigator.geolocation.getCurrentPosition(
        function(pos) {
            const lat = pos.coords.latitude;
            const lng = pos.coords.longitude;

            if (marcadorUsuarioConectado) {
                map.removeLayer(marcadorUsuarioConectado);
            }

            marcadorUsuarioConectado = L.marker([lat, lng])
                .addTo(map)
                .bindPopup(`<b>Summary 1🚛 Camión Recolector</b>`);

            map.setView([lat, lng], 16);
        },
        function(error) {
            console.log(error);
        },
        {
            enableHighAccuracy: true
        }
    );
}

/* =====================================================
   LOGIN ADMINISTRADOR Y CAMIÓN
===================================================== */
function loginPersonal() {
    const user = document.getElementById('user').value.trim().toLowerCase();
    const pass = document.getElementById('pass').value.trim();

    if (user === 'rodrigo melendres' && pass === '12345') {
        modo = 'admin';
        document.getElementById('loginScreen').style.display = 'none';
        document.getElementById('userType').innerHTML = `<i class="fas fa-user-shield"></i> Administrador`;
        document.getElementById('exportBtn').style.display = 'block';
        document.getElementById('clearBtn').style.display = 'block';

        establecerPosicionPorRol(OFICINAS_EMAO_ADMIN, "🏢 Oficinas EMAO");
        alert('Bienvenido Administrador');
    } 
    else if (user === 'camion' && pass === '12345') {
        modo = 'camion';
        document.getElementById('loginScreen').style.display = 'none';
        document.getElementById('userType').innerHTML = `<i class="fas fa-truck"></i> Operador Camión`;
        document.getElementById('exportBtn').style.display = 'block';
        document.getElementById('clearBtn').style.display = 'none';

        iniciarCamion30Segundos();
        setInterval(() => {
            iniciarCamion30Segundos();
        }, 30000);

        alert('Bienvenido Chofer - Sistema de monitoreo activado.');
    } 
    else {
        document.getElementById('error').innerHTML = 'Usuario o contraseña incorrectos';
    }
}

/* =====================================
   LOGIN VECINO
===================================== */
function loginVecino() {
    modo = 'vecino';
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('userType').innerHTML = '<i class="fas fa-house"></i> Vecino';
    ocultarBotonesAdmin();
    iniciarSeguimientoTiempoReal("vecino");
}

/* =====================================
   OCULTAR BOTONES ADMIN
===================================== */
function ocultarBotonesAdmin() {
    document.getElementById('exportBtn').style.display = 'none';
    document.getElementById('clearBtn').style.display = 'none';
}

/* =====================================
   AGREGAR PUNTOS
===================================== */
function activarModoAgregar() {
    alert("Haz clic en cualquier zona de Oruro para reportar acumulación de residuos.");

    map.once('click', (e) => {
        const clickLat = e.latlng.lat;
        const clickLng = e.latlng.lng;

        if (
            clickLat >= LIMITES_ORURO.latMin &&
            clickLat <= LIMITES_ORURO.latMax &&
            clickLng >= LIMITES_ORURO.lngMin &&
            clickLng <= LIMITES_ORURO.lngMax
        ) {
            mostrarSelectorNivel(clickLat, clickLng);
        } else {
            alert("❌ ECO-UDABOL solo funciona dentro de la ciudad de Oruro.");
        }
    });
}

/* =====================================
   SELECCIÓN DE NIVEL (POPUP HTML)
===================================== */
function mostrarSelectorNivel(lat, lng) {
    const html = `
        <div style="min-width:220px;color:black;">
            <h3 style="margin-bottom:10px;">Nivel de Residuos</h3>
            <button onclick="crearPunto(${lat},${lng},'bajo')" style="width:100%; margin-bottom:8px; padding:8px; background:#00ff66; border:none; border-radius:6px; font-weight:bold; cursor:pointer;">🟢 Bajo</button>
            <button onclick="crearPunto(${lat},${lng},'medio')" style="width:100%; margin-bottom:8px; padding:8px; background:#ffb300; border:none; border-radius:6px; font-weight:bold; cursor:pointer;">🟠 Medio</button>
            <button onclick="crearPunto(${lat},${lng},'alto')" style="width:100%; padding:8px; background:#ff245b; color:white; border:none; border-radius:6px; font-weight:bold; cursor:pointer;">🔴 Alto</button>
        </div>
    `;

    L.popup()
        .setLatLng([lat, lng])
        .setContent(html)
        .openOn(map);
}

/* =====================================
   CREAR PUNTO
===================================== */
async function crearPunto(lat, lng, nivel) {
    map.closePopup();

    let color = '#00ff66';
    if (nivel === 'medio') color = '#ffb300';
    if (nivel === 'alto') color = '#ff245b';

    const ahora = new Date();
    const fecha = ahora.toLocaleDateString();
    const hora = ahora.toLocaleTimeString();

    const punto = {
        nivel: nivel,
        estado: 'espera',
        lat: lat,
        lng: lng,
        fecha: fecha,
        hora: hora,
        direccion: 'Buscando dirección...'
    };

    const marker = L.circleMarker([lat, lng], {
        radius: 12,
        color: color,
        fillColor: color,
        fillOpacity: 0.8,
        weight: 3
    });

    punto.marker = marker;
    actualizarPopup(punto);
    puntos.push(punto);

    filtrarMarcadores();
    actualizarStats();

    try {
        const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`);
        const data = await response.json();
        punto.direccion = data.display_name || "Oruro";
        actualizarPopup(punto);
    } catch {
        punto.direccion = "Zona Urbana Oruro";
        actualizarPopup(punto);
    }
}

/* =====================================
   ACTUALIZAR POPUP
===================================== */
function actualizarPopup(punto) {
    let estadoColor = '#ffb300';
    if (punto.estado === 'camino') estadoColor = '#00f0ff';
    if (punto.estado === 'recogido') estadoColor = '#39ff14';

    let botonesLogistica = '';

    if (modo === 'camion' || modo === 'admin') {
        botonesLogistica = `
            <button onclick="trazarRutaHaciaPunto(${punto.lat},${punto.lng})" style="width:100%; margin-bottom:6px; padding:6px; border:none; border-radius:4px; background:#00f0ff; color:black; font-weight:bold; cursor:pointer;">Resumen 2🚛 Trazar Ruta</button>
            <button onclick="marcarComoRecogido(${punto.lat},${punto.lng})" style="width:100%; padding:6px; border:none; border-radius:4px; background:#39ff14; color:black; font-weight:bold; cursor:pointer;">✅ Finalizar Trabajo</button>
        `;
    } else {
        botonesLogistica = `
            <p style="text-align:center; color:#666; font-size:12px;">🕒 En espera de atención EMAO</p>
        `;
    }

    punto.marker.bindPopup(`
        <div style="min-width:220px;color:black;">
            <h3 style="margin-bottom:8px;">Reporte Urbano</h3>
            <b>Volumen:</b> ${punto.nivel.toUpperCase()}<br>
            <b>Estado:</b> <span style="color:${estadoColor}; font-weight:bold;">${punto.estado.toUpperCase()}</span><br>
            <b>Hora:</b> ${punto.hora}<br>
            <b>Dirección:</b> <small>${punto.direccion}</small><br><br>
            ${botonesLogistica}
        </div>
    `);
}

/* =====================================
   TRAZAR RUTA
===================================== */
function trazarRutaHaciaPunto(lat, lng) {
    let origen = marcadorUsuarioConectado ? marcadorUsuarioConectado.getLatLng() : L.latLng(AV_6_DE_AGOSTO_CAMION);

    cambiarEstadoEnMemoria(lat, lng, 'camino');

    if (routingControl !== null) {
        map.removeControl(routingControl);
    }

    routingControl = L.Routing.control({
        waypoints: [
            L.latLng(origen.lat, origen.lng),
            L.latLng(lat, lng)
        ],
        lineOptions: {
            styles: [{ color: '#00f0ff', opacity: 0.8, weight: 6 }]
        },
        addWaypoints: false,
        draggableWaypoints: false,
        fitSelectedRoutes: true,
        createMarker: function() { return null; }
    }).addTo(map);

    map.closePopup();
}

/* =====================================
   MARCAR RECOGIDO
===================================== */
function marcarComoRecogido(lat, lng) {
    cambiarEstadoEnMemoria(lat, lng, 'recogido');

    if (routingControl !== null) {
        map.removeControl(routingControl);
        routingControl = null;
    }

    map.closePopup();
}

/* =====================================
   CAMBIAR ESTADO
===================================== */
function cambiarEstadoEnMemoria(lat, lng, nuevoEstado) {
    const punto = puntos.find(p => p.lat === lat && p.lng === lng);
    if (!punto) return;

    punto.estado = nuevoEstado;
    actualizarPopup(punto);
    actualizarStats();
    filtrarMarcadores();
}

/* =====================================
   FILTRAR MARCADORES
===================================== */
function filtrarMarcadores() {
    cluster.clearLayers();
    const filtro = document.getElementById('mapFilter').value;

    puntos.forEach(punto => {
        if (filtro === 'todos') {
            cluster.addLayer(punto.marker);
        } 
        else if (filtro === 'alto' && punto.nivel === 'alto') {
            cluster.addLayer(punto.marker);
        } 
        else if (filtro === 'espera' && punto.estado === 'espera') {
            cluster.addLayer(punto.marker);
        }
    });
}

/* =====================================
   CHAT INTERNO
===================================== */
function enviarMensaje() {
    const text = document.getElementById('mensaje').value;
    if (text.trim() === '') return;

    const div = document.createElement('div');

    if (modo === 'admin') {
        div.className = 'message admin-message';
        div.innerHTML = `<strong>Administrador (EMAO)</strong><br>${text}`;
    } 
    else if (modo === 'camion') {
        div.className = 'message camion-message';
        div.innerHTML = `<strong>Camión Operador</strong><br>${text}`;
    } 
    else {
        div.className = 'message';
        div.innerHTML = `<strong>Vecino Oruro</strong><br>${text}`;
    }

    document.getElementById('messages').prepend(div);
    document.getElementById('mensaje').value = '';
}

/* =====================================
   ESTADÍSTICAS
===================================== */
function actualizarStats() {
    let bajo = 0, medio = 0, alto = 0;
    let espera = 0, camino = 0, recogido = 0;

    puntos.forEach(p => {
        if (p.nivel === 'bajo') bajo++;
        if (p.nivel === 'medio') medio++;
        if (p.nivel === 'alto') alto++;

        if (p.estado === 'espera') espera++;
        if (p.estado === 'camino') camino++;
        if (p.estado === 'recogido') recogido++;
    });

    const total = puntos.length || 1;

    document.getElementById('barLow').style.width = (bajo * 100 / total) + '%';
    document.getElementById('barMed').style.width = (medio * 100 / total) + '%';
    document.getElementById('barHigh').style.width = (alto * 100 / total) + '%';

    document.getElementById('txtLow').innerHTML = bajo;
    document.getElementById('txtMed').innerHTML = medio;
    document.getElementById('txtHigh').innerHTML = alto;

    document.getElementById('txtEspera').innerHTML = espera;
    document.getElementById('txtCamino').innerHTML = camino;
    document.getElementById('txtRecogido').innerHTML = recogido;
}

/* =====================================
   EXPORTAR CSV
===================================== */
function exportarDatos() {
    if (puntos.length === 0) {
        alert('No existen registros para exportar.');
        return;
    }

    let csv = 'Nivel;Estado;Fecha;Hora;Latitud;Longitud;Direccion\n';

    puntos.forEach(p => {
        csv += `${p.nivel};${p.estado};${p.fecha};${p.hora};${p.lat};${p.lng};"${p.direccion}"\n`;
    });

    const blob = new Blob(["\uFEFF" + csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'reporte_eco_oruro.csv';

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

/* =====================================
   LIMPIAR MAPA
===================================== */
function limpiarPuntos() {
    if (!confirm('¿Desea eliminar todos los reportes?')) return;

    if (routingControl !== null) {
        map.removeControl(routingControl);
        routingControl = null;
    }

    cluster.clearLayers();
    puntos = [];
    actualizarStats();

    alert('Mapa limpiado correctamente.');
}

/* =====================================
   EVENT LISTENERS E INICIALIZACIÓN
===================================== */
document.getElementById('mapFilter').addEventListener('change', filtrarMarcadores);

// Ejecución inicial de estadísticas
actualizarStats();