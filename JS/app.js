const API_BASE = window.APP_CONFIG?.apiBase || 'http://localhost:5000/api';

async function getData(endpoint) {
  const response = await fetch(`${API_BASE}${endpoint}`);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

function setConnectionStatus(connected) {
  const status = document.querySelector('.status-pill');
  if (!status) return;
  status.classList.toggle('is-offline', !connected);
  status.innerHTML = `<i></i>${connected ? 'MongoDB conectado' : 'API sin conexión'}`;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

function rows(data) { return data.map(item => `<tr>${item}</tr>`).join(''); }
function formatNumber(value, decimals = 4) {
  const number = Number(value);
  return Number.isFinite(number) ? number.toFixed(decimals) : '—';
}

let resultsPage = 1;
let resultsView = 'wind';
let latestResultsItems = [];
let resultDays = [];
const expandedResultDays = new Set();
const expandedResultHours = new Set();
const resultHourCache = new Map();
const resultReadingCache = new Map();
const resultColumnLabels = {
  date: 'Fecha / hora',
  dateutc: 'Fecha UTC (ms)',
  station: 'Estación',
  id_station: 'ID estación',
  city: 'Ciudad',
  latitude: 'Latitud',
  longitude: 'Longitud',
  address: 'Dirección postal',
  anio: 'Año del registro',
  mes: 'Mes del registro',
  inserted_at: 'Fecha de registro',
  lastRain: 'Última lluvia',
  tempf: 'Temperatura exterior',
  temperature_c: 'Temperatura exterior °C',
  tempinf: 'Temperatura interior',
  humidity: 'Humedad exterior',
  humidityin: 'Humedad interior',
  feelsLike: 'Sensación exterior',
  feelsLikein: 'Sensación interior',
  dewPoint: 'Punto de rocío exterior',
  dewPointin: 'Punto de rocío interior',
  windspeedmph: 'Velocidad del viento',
  windgustmph: 'Ráfaga de viento',
  maxdailygust: 'Ráfaga máxima diaria',
  winddir: 'Dirección del viento',
  winddir_avg10m: 'Dirección media (10 min)',
  hourlyrainin: 'Lluvia por hora',
  eventrainin: 'Lluvia del evento',
  dailyrainin: 'Lluvia diaria',
  weeklyrainin: 'Lluvia semanal',
  monthlyrainin: 'Lluvia mensual',
  yearlyrainin: 'Lluvia anual',
  totalrainin: 'Lluvia acumulada',
  baromrelin: 'Presión relativa',
  baromabsin: 'Presión absoluta',
  battout: 'Estado de batería',
};
const resultColumnUnits = {
  latitude: '°', longitude: '°',
  tempf: ' °F', tempinf: ' °F', feelsLike: ' °F', feelsLikein: ' °F',
  dewPoint: ' °F', dewPointin: ' °F',
  temperature_c: ' °C',
  humidity: '%', humidityin: '%',
  windspeedmph: ' mph', windgustmph: ' mph', maxdailygust: ' mph',
  winddir: '°', winddir_avg10m: '°',
  hourlyrainin: ' in', eventrainin: ' in', dailyrainin: ' in',
  weeklyrainin: ' in', monthlyrainin: ' in', yearlyrainin: ' in', totalrainin: ' in',
  baromrelin: ' inHg', baromabsin: ' inHg',
};
const resultColumnDecimals = {
  latitude: 5, longitude: 5, temperature_c: 1, winddir: 0, winddir_avg10m: 0,
  humidity: 0, humidityin: 0, battout: 0,
};
const resultColumnCategories = [
  { title: 'Estación y ubicación', columns: ['station', 'id_station', 'city', 'latitude', 'longitude', 'address'] },
  { title: 'Fechas y periodo', columns: ['date', 'dateutc', 'inserted_at', 'lastRain', 'anio', 'mes'] },
  { title: 'Viento', columns: ['windspeedmph', 'windgustmph', 'maxdailygust', 'winddir', 'winddir_avg10m'] },
  { title: 'Temperatura y sensación', columns: ['tempf', 'temperature_c', 'tempinf', 'feelsLike', 'feelsLikein', 'dewPoint', 'dewPointin'] },
  { title: 'Humedad', columns: ['humidity', 'humidityin'] },
  { title: 'Precipitación', columns: ['hourlyrainin', 'eventrainin', 'dailyrainin', 'weeklyrainin', 'monthlyrainin', 'yearlyrainin', 'totalrainin'] },
  { title: 'Presión atmosférica', columns: ['baromrelin', 'baromabsin'] },
  { title: 'Sistema', columns: ['battout'] },
];
const resultColumns = Object.keys(resultColumnLabels);
const selectedResultColumns = {
  wind: ['date', 'station', 'city', 'windspeedmph', 'winddir', 'humidity'],
  heat: ['date', 'station', 'city', 'tempf', 'temperature_c', 'humidity'],
};

function resultCell(item, column) {
    let value = item[column];
    if (column === 'station' && !value) value = `Estación ${item.id_station}`;
    if (value == null || value === '') return '<td>—</td>';
    if (column === 'dateutc') {
      const timestamp = typeof value === 'object' ? value.$numberLong : value;
      value = new Date(Number(timestamp)).toISOString();
    }
    if (column === 'date' || column === 'inserted_at' || column === 'lastRain') {
      const date = new Date(value);
      value = Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString('es-MX');
    }
    if (typeof value === 'number') {
      value = `${formatNumber(value, resultColumnDecimals[column] ?? 2)}${resultColumnUnits[column] || ''}`;
    }
    const numeric = typeof item[column] === 'number';
    return `<td${numeric || column === 'dateutc' ? ' class="mono"' : ''}>${escapeHtml(value)}</td>`;
}

function renderResultsTable(items) {
  const head = document.querySelector('#results-head');
  const body = document.querySelector('#results-body');
  const visibleColumns = selectedResultColumns[resultsView];
  head.innerHTML = `<tr>${visibleColumns.map(column => `<th>${resultColumnLabels[column]}</th>`).join('')}</tr>`;
  head.hidden = false;
  body.innerHTML = items.length
    ? rows(items.map(item => visibleColumns.map(column => resultCell(item, column)).join('')))
    : `<tr><td colspan="${visibleColumns.length}" class="empty">No hay lecturas en esta página.</td></tr>`;
}

function renderResultsHierarchy() {
  const head = document.querySelector('#results-head');
  const body = document.querySelector('#results-body');
  const visibleColumns = selectedResultColumns[resultsView];
  const hourSelected = expandedResultHours.size > 0;
  head.innerHTML = hourSelected
    ? `<tr>${visibleColumns.map(column => `<th>${resultColumnLabels[column]}</th>`).join('')}</tr>`
    : '';
  head.hidden = !hourSelected;
  const tableRows = [];

  for (const day of resultDays) {
    const dayIsOpen = expandedResultDays.has(day.value);
    tableRows.push(`<tr class="result-group-row"><td colspan="${visibleColumns.length}"><button class="result-expand" type="button" data-expand-day="${escapeHtml(day.value)}" aria-expanded="${dayIsOpen}"><span class="result-chevron">${dayIsOpen ? '▾' : '▸'}</span><strong>${escapeHtml(new Date(`${day.value}T12:00:00`).toLocaleDateString('es-MX', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }))}</strong><span>${Number(day.count).toLocaleString('es-MX')} lecturas</span></button></td></tr>`);
    if (!dayIsOpen) continue;

    const hours = resultHourCache.get(day.value) || [];
    for (const hour of hours) {
      const hourKey = `${day.value}|${hour.value}`;
      const hourIsOpen = expandedResultHours.has(hourKey);
      tableRows.push(`<tr class="result-hour-row"><td colspan="${visibleColumns.length}"><button class="result-expand result-expand-hour" type="button" data-expand-hour="${escapeHtml(hourKey)}" aria-expanded="${hourIsOpen}"><span class="result-chevron">${hourIsOpen ? '▾' : '▸'}</span><strong>${escapeHtml(hour.value)}:00 h</strong><span>${Number(hour.count).toLocaleString('es-MX')} lecturas</span></button></td></tr>`);
      if (!hourIsOpen) continue;

      const readings = resultReadingCache.get(hourKey) || [];
      for (const reading of readings) {
        tableRows.push(`<tr class="result-reading-row">${visibleColumns.map(column => resultCell(reading, column)).join('')}</tr>`);
      }
    }
  }

  body.innerHTML = tableRows.length
    ? tableRows.join('')
    : `<tr><td colspan="${visibleColumns.length}" class="empty">No hay días con lecturas para estos filtros.</td></tr>`;
}

function renderColumnOptions() {
  const container = document.querySelector('#column-options');
  const openCategories = resultsView === 'heat'
    ? new Set(['Estación y ubicación', 'Temperatura y sensación', 'Humedad'])
    : new Set(['Estación y ubicación', 'Viento', 'Humedad']);
  container.replaceChildren(...resultColumnCategories.map(category => {
    const group = document.createElement('details');
    group.className = 'column-category';
    group.open = openCategories.has(category.title);
    const heading = document.createElement('summary');
    heading.textContent = category.title;
    const options = document.createElement('div');
    options.className = 'category-options';
    for (const column of category.columns) {
      const label = document.createElement('label');
      label.className = 'column-check';
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.value = column;
      checkbox.checked = selectedResultColumns[resultsView].includes(column);
      checkbox.addEventListener('change', () => {
        const selected = selectedResultColumns[resultsView];
        if (!checkbox.checked && selected.length === 1) {
          checkbox.checked = true;
          return;
        }
        selectedResultColumns[resultsView] = checkbox.checked
          ? [...selected, column]
          : selected.filter(item => item !== column);
        renderResultsHierarchy();
      });
      label.append(checkbox, document.createTextNode(resultColumnLabels[column]));
      options.appendChild(label);
    }
    group.append(heading, options);
    return group;
  }));
}

function updateResultsPagination(data) {
  document.querySelector('#result-count').textContent = data.total.toLocaleString('es-MX');
  document.querySelector('#page-indicator').textContent =
    `Página ${data.page} de ${data.total_pages} · días`;
  document.querySelector('#previous-page').disabled = data.page <= 1;
  document.querySelector('#next-page').disabled = data.page >= data.total_pages;
}

function compassDirection(degrees) {
  const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSO', 'SO', 'OSO', 'O', 'ONO', 'NO', 'NNO'];
  const normalized = ((Number(degrees) % 360) + 360) % 360;
  return Number.isFinite(normalized) ? directions[Math.round(normalized / 22.5) % 16] : '—';
}

function renderMiniChart(readings) {
  const chart = document.querySelector('.mini-chart');
  const ordered = [...readings].reverse();
  const speeds = ordered.map(item => Number(item.windspeedmph)).filter(Number.isFinite);
  const maximum = Math.max(...speeds, 0);
  chart.replaceChildren(...ordered.map(reading => {
    const speed = Number(reading.windspeedmph);
    const bar = document.createElement('span');
    bar.style.height = Number.isFinite(speed) && maximum > 0
      ? `${Math.max(8, (speed / maximum) * 100)}%`
      : '4%';
    bar.title = `${reading.date}: ${formatNumber(speed, 2)} mph`;
    return bar;
  }));
}

function renderWindDirection(reading) {
  const direction = document.querySelector('.wind-direction');
  const degrees = Number(reading?.winddir);
  if (!Number.isFinite(degrees)) {
    direction.textContent = 'Sin rumbo disponible';
    return;
  }
  const arrow = document.createElement('span');
  arrow.className = 'direction-arrow';
  arrow.textContent = '↑';
  arrow.style.transform = `rotate(${degrees}deg)`;
  direction.replaceChildren(
    arrow,
    document.createTextNode(` ${compassDirection(degrees)} · ${formatNumber(degrees, 0)}°`),
  );
}

async function loadStations() {
  const body = document.querySelector('#stations-body');
  const search = document.querySelector('#station-search');
  const city = document.querySelector('#city-filter');
  try {
    const data = await getData('/estaciones');
    setConnectionStatus(true);
    const render = () => {
      const term = search.value.toLowerCase();
      const selected = city.value;
      const filtered = data.filter(item =>
        `${item.nombre || ''} ${item.city || ''}`.toLowerCase().includes(term)
        && (!selected || item.city === selected)
      );
      body.innerHTML = filtered.length ? rows(filtered.map(item =>
        `<td class="mono">${escapeHtml(item.id_station)}</td>`
        + `<td><strong>${escapeHtml(item.nombre || `Estación ${item.id_station}`)}</strong></td>`
        + `<td>${escapeHtml(item.city || 'Sin ciudad')}</td>`
        + `<td class="mono">${formatNumber(item.latitude)}°, ${formatNumber(item.longitude)}°</td>`
        + `<td><span class="badge">${escapeHtml(item.status || 'Registrada')}</span></td>`
      )) : '<tr><td colspan="5" class="empty">No hay estaciones que coincidan.</td></tr>';
      document.querySelector('#station-count').textContent = filtered.length;
    };
    [...new Set(data.map(item => item.city).filter(Boolean))].forEach(value => {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = value;
      city.appendChild(option);
    });
    search.addEventListener('input', render);
    city.addEventListener('change', render);
    render();
  } catch (error) {
    setConnectionStatus(false);
    body.innerHTML = '<tr><td colspan="5" class="error">No se pudieron cargar las estaciones. Verifica la API.</td></tr>';
    document.querySelector('#station-count').textContent = '—';
  }
}

async function loadResults(page = resultsPage) {
  const body = document.querySelector('#results-body');
  try {
    const parameters = new URLSearchParams({
      level: 'days', page, page_size: 30, ...readResultsFilters(),
    });
    const data = await getData(`/resultados/explorar?${parameters}`);
    setConnectionStatus(true);
    resultsPage = data.page;
    resultDays = data.items;
    latestResultsItems = [];
    expandedResultDays.clear();
    expandedResultHours.clear();
    resultHourCache.clear();
    resultReadingCache.clear();
    document.querySelector('#results-total-label').textContent = 'Días encontrados';
    document.querySelector('#latest-metric-label').textContent = 'Lecturas del día abierto';
    document.querySelector('#latest-speed').textContent = '—';
    document.querySelector('.extremes-strip').hidden = true;
    updateResultsPagination(data);
    renderResultsHierarchy();
  } catch (error) {
    setConnectionStatus(false);
    document.querySelector('#result-count').textContent = '—';
    document.querySelector('#latest-speed').textContent = '—';
    document.querySelector('#minimum-value').textContent = '—';
    document.querySelector('#maximum-value').textContent = '—';
    body.innerHTML = `<tr><td colspan="${selectedResultColumns[resultsView].length}" class="error">No se pudieron cargar las lecturas. Verifica la API.</td></tr>`;
  }
}

async function loadExpandedResultLevel(level, date, hour = '') {
  const parameters = new URLSearchParams({ ...readResultsFilters(), level, date });
  if (hour) parameters.set('hour', hour);
  const data = await getData(`/resultados/explorar?${parameters}`);
  if (level === 'hours') resultHourCache.set(date, data.items);
  if (level === 'readings') {
    const key = `${date}|${hour}`;
    resultReadingCache.set(key, data.items);
    latestResultsItems = data.items;
    document.querySelector('#latest-speed').textContent = data.total.toLocaleString('es-MX');
  }
  renderResultsHierarchy();
}

function updateExpandedResult(level, key) {
  const expanded = level === 'day' ? expandedResultDays : expandedResultHours;
  if (expanded.has(key)) {
    expanded.delete(key);
    if (level === 'day') {
      for (const hourKey of expandedResultHours) {
        if (hourKey.startsWith(`${key}|`)) expandedResultHours.delete(hourKey);
      }
    }
    renderResultsHierarchy();
    return;
  }

  expanded.add(key);
  renderResultsHierarchy();
  const [date, hour] = level === 'day' ? [key, ''] : key.split('|');
  const cache = level === 'day' ? resultHourCache : resultReadingCache;
  const cacheKey = level === 'day' ? date : key;
  if (cache.has(cacheKey)) return;
  loadExpandedResultLevel(level === 'day' ? 'hours' : 'readings', date, hour)
    .catch(error => {
      setConnectionStatus(false);
      cache.set(cacheKey, []);
      renderResultsHierarchy();
      console.error('No se pudo desplegar el nivel de resultados', error);
    });
}

function renderExtremes(extremes) {
  const isHeat = resultsView === 'heat';
  const minimum = isHeat ? extremes.temperature_min_c : extremes.wind_min;
  const maximum = isHeat ? extremes.temperature_max_c : extremes.wind_max;
  const unit = isHeat ? ' °C' : ' mph';
  document.querySelector('#minimum-label').textContent = `Mínimo ${isHeat ? 'calor' : 'viento'}`;
  document.querySelector('#maximum-label').textContent = `Máximo ${isHeat ? 'calor' : 'viento'}`;
  document.querySelector('#minimum-value').textContent = minimum == null ? '—' : `${formatNumber(minimum, isHeat ? 1 : 2)}${unit}`;
  document.querySelector('#maximum-value').textContent = maximum == null ? '—' : `${formatNumber(maximum, isHeat ? 1 : 2)}${unit}`;
}

function readResultsFilters() {
  return {
    year: document.querySelector('#year-filter').value,
    date: document.querySelector('#date-search').value,
    start_date: document.querySelector('#date-start').value,
    end_date: document.querySelector('#date-end').value,
    order: document.querySelector('#date-order').value,
  };
}

function syncResultsViewToOrder() {
  const order = document.querySelector('#date-order').value;
  const isHeatOrder = order.startsWith('temperature_');
  const isWindOrder = order.startsWith('wind_');
  const desiredView = isHeatOrder ? 'heat' : isWindOrder ? 'wind' : resultsView;
  const labels = {
    date_desc: 'Fecha: más recientes',
    date_asc: 'Fecha: más antiguos',
    wind_max: 'Viento: máximo a mínimo',
    wind_min: 'Viento: mínimo a máximo',
    temperature_max: 'Temperatura: máxima a mínima',
    temperature_min: 'Temperatura: mínima a máxima',
  };
  resultsView = desiredView;
  document.querySelector('#sort-summary').textContent = labels[order];
  document.querySelectorAll('[data-results-view]').forEach(tab => {
    const selected = tab.dataset.resultsView === desiredView;
    tab.classList.toggle('active', selected);
    tab.setAttribute('aria-selected', String(selected));
  });
}

function initializeResultsControls() {
  document.querySelector('#results-body').addEventListener('click', event => {
    const dayButton = event.target.closest('[data-expand-day]');
    const hourButton = event.target.closest('[data-expand-hour]');
    if (dayButton) updateExpandedResult('day', dayButton.dataset.expandDay);
    if (hourButton) updateExpandedResult('hour', hourButton.dataset.expandHour);
  });
  document.querySelectorAll('[data-results-view]').forEach(button => {
    button.addEventListener('click', () => {
      resultsView = button.dataset.resultsView;
      document.querySelectorAll('[data-results-view]').forEach(tab => {
        const selected = tab === button;
        tab.classList.toggle('active', selected);
        tab.setAttribute('aria-selected', String(selected));
      });
      renderColumnOptions();
      loadResults();
    });
  });
  document.querySelector('#date-order').addEventListener('change', syncResultsViewToOrder);
  document.querySelector('#apply-results-filters').addEventListener('click', () => {
    syncResultsViewToOrder();
    loadResults(1);
  });
  document.querySelector('#clear-results-filters').addEventListener('click', () => {
    document.querySelector('#year-filter').value = '';
    document.querySelector('#date-search').value = '';
    document.querySelector('#date-start').value = '';
    document.querySelector('#date-end').value = '';
    document.querySelector('#date-order').value = 'date_desc';
    syncResultsViewToOrder();
    loadResults(1);
  });
  document.querySelector('#previous-page').addEventListener('click', () => {
    if (resultsPage > 1) loadResults(resultsPage - 1);
  });
  document.querySelector('#next-page').addEventListener('click', () => {
    loadResults(resultsPage + 1);
  });
}

async function loadHomeSummary() {
  try {
    const response = await getData('/resultados?page=1&page_size=8');
    const readings = response.items;
    const [latest] = readings;
    setConnectionStatus(true);
    renderMiniChart(readings);
    const speed = Number(latest?.windspeedmph);
    document.querySelector('.wind-value').innerHTML =
      `${Number.isFinite(speed) ? (speed * 0.44704).toFixed(1) : '—'} <small>m/s</small>`;
    renderWindDirection(latest);
    const footer = document.querySelector('.visual-footer').children;
    footer[0].textContent = latest?.station || 'Sin estación';
    footer[1].textContent = latest?.date || 'Sin fecha';
    document.querySelector('.coordinate-note').textContent = latest
      ? `Última lectura · ${latest.station || `Estación ${latest.id_station}`}`
      : 'Sin lecturas disponibles';
  } catch (error) {
    setConnectionStatus(false);
    renderMiniChart([]);
    document.querySelector('.wind-value').innerHTML = '— <small>m/s</small>';
    document.querySelector('.wind-direction').textContent = 'API sin conexión';
    document.querySelector('.visual-footer').children[0].textContent = 'Sin datos';
    document.querySelector('.visual-footer').children[1].textContent = 'API desconectada';
    document.querySelector('.coordinate-note').textContent = 'No se pudo consultar MongoDB';
  }
}

if (document.querySelector('#stations-body')) loadStations();
if (document.querySelector('#results-body')) {
  initializeResultsControls();
  renderColumnOptions();
  loadResults();
}
if (document.querySelector('.welcome-visual')) loadHomeSummary();