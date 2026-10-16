import { getStations } from '../src/services/api.js';

async function loadMapStations() {
  const source = await getStations();
  if (!Array.isArray(source)) throw new Error('La API devolvió un formato de estaciones inválido');
  return source.map(station => ({
    id_station: station.id_station,
    nombre: station.nombre || `Estación ${station.id_station}`,
    city: station.city || 'Sin ciudad',
    latitude: Number(station.latitude),
    longitude: Number(station.longitude),
  })).filter(station => Number.isFinite(station.latitude) && Number.isFinite(station.longitude));
}

function setMapConnectionStatus(connected) {
  const status = document.querySelector('.status-pill');
  if (status) {
    status.classList.toggle('is-offline', !connected);
    status.innerHTML = `<i></i>${connected ? 'MongoDB conectado' : 'API sin conexión'}`;
  }
  window.dispatchEvent(new CustomEvent('api-status', { detail: { connected } }));
}

function setMapPageCopy() {
  document.querySelector('.page-heading > p').textContent =
    'Ubicaciones registradas. Selecciona un punto para consultar sus coordenadas.';
  document.querySelector('.map-sidebar h2').textContent = 'Estaciones registradas';
  document.querySelector('.map-legend span:last-child').textContent = 'Ubicación registrada';
}

async function renderMap() {
  setMapPageCopy();
  let stations;
  try {
    stations = await loadMapStations();
    setMapConnectionStatus(true);
  } catch (error) {
    setMapConnectionStatus(false);
    const item = document.createElement('li');
    item.className = 'error';
    item.textContent = error.message;
    document.querySelector('#map-station-list').replaceChildren(item);
    return () => {};
  }
  const map = L.map('station-map').setView([18.53, -88.29], 12);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap contributors', maxZoom: 18 }).addTo(map);
  const list = document.querySelector('#map-station-list'); list.innerHTML = '';
  const bounds = [];
  if (!stations.length) {
    const item = document.createElement('li');
    item.className = 'empty';
    item.textContent = 'La API responde, pero no hay estaciones registradas.';
    list.appendChild(item);
  }
  stations.forEach(station => {
    const point = [Number(station.latitude), Number(station.longitude)]; bounds.push(point);
    const marker = L.circleMarker(point, { radius: 7, color: '#0f5d5b', weight: 2, fillColor: '#d9ed72', fillOpacity: .95 }).addTo(map);
    const popup = document.createElement('div');
    const popupName = document.createElement('strong');
    popupName.textContent = station.nombre;
    const popupCity = document.createElement('div');
    popupCity.textContent = station.city;
    const popupCoordinates = document.createElement('small');
    popupCoordinates.textContent = `${point[0].toFixed(4)}°, ${point[1].toFixed(4)}°`;
    popup.append(popupName, popupCity, popupCoordinates);
    marker.bindPopup(popup);
    const item = document.createElement('li');
    const name = document.createElement('span');
    name.textContent = station.nombre;
    const city = document.createElement('small');
    city.textContent = station.city;
    item.append(name, city);
    item.addEventListener('click', () => { map.setView(point, 14); marker.openPopup(); }); list.appendChild(item);
  });
  if (bounds.length) map.fitBounds(bounds, { padding: [30, 30] });
  return () => map.remove();
}

export function initializeMap() {
  return renderMap();
}
