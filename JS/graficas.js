import { getCharts, getStations } from '../src/services/api.js';
const metricLabels = {
    windspeedmph: 'Velocidad del viento',
    tempf: 'Temperatura',
    humidity: 'Humedad',
    windgustmph: 'Ráfaga de viento',
    baromrelin: 'Presión atmosférica',
    hourlyrainin: 'Lluvia por hora',
};
const periodLabels = {
    '24h': 'Últimas 24 horas',
    range: 'Rango seleccionado',
};
const numberFormat = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 1 });
const rangeStartInput = document.querySelector('#graph-start-date');
const rangeEndInput = document.querySelector('#graph-end-date');
const chartMessage = document.querySelector('#chart-message');
let activePeriod = '24h';
let graphChart = null;
let stations = [];
let graphRequestId = 0;

function formatNumber(value) {
    return Number.isFinite(Number(value)) ? numberFormat.format(Number(value)) : '—';
}

function formatBucket(value) {
    const date = new Date(value);
    if (activePeriod === 'range' && rangeDurationDays() > 90) {
        return new Intl.DateTimeFormat('es-MX', { month: 'short' }).format(date);
    }
    if (activePeriod === 'range' && rangeDurationDays() > 2) {
        return new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short' }).format(date);
    }
    return new Intl.DateTimeFormat('es-MX', {
        ...(activePeriod === '24h' || (activePeriod === 'range' && rangeDurationDays() <= 2) ? { hour: '2-digit', minute: '2-digit' } : {}),
        day: 'numeric', month: 'short',
    }).format(date);
}

function rangeDurationDays() {
    if (!rangeStartInput.value || !rangeEndInput.value) return 0;
    const start = new Date(`${rangeStartInput.value}T00:00:00`);
    const end = new Date(`${rangeEndInput.value}T00:00:00`);
    return Math.floor((end - start) / 86400000) + 1;
}

function updateSummary(points, unit) {
    const values = points.flatMap(point => [Number(point.minimum), Number(point.maximum)]).filter(Number.isFinite);
    const average = points.length
        ? points.reduce((sum, point) => sum + Number(point.average), 0) / points.length
        : null;
    document.querySelector('#summary-average').textContent = average == null ? '—' : `${formatNumber(average)} ${unit}`;
    document.querySelector('#summary-minimum').textContent = values.length
        ? `${formatNumber(Math.min(...values))} ${unit}` : '—';
    document.querySelector('#summary-maximum').textContent = values.length
        ? `${formatNumber(Math.max(...values))} ${unit}` : '—';
}

function combineCityPoints(city, stationPoints) {
    const buckets = new Map();
    for (const points of stationPoints) {
        for (const point of points) {
            const bucket = buckets.get(point.date) || {
                weightedTotal: 0,
                count: 0,
                minimum: Infinity,
                maximum: -Infinity,
            };
            const count = Number(point.count) || 0;
            bucket.weightedTotal += Number(point.average) * count;
            bucket.count += count;
            bucket.minimum = Math.min(bucket.minimum, Number(point.minimum));
            bucket.maximum = Math.max(bucket.maximum, Number(point.maximum));
            buckets.set(point.date, bucket);
        }
    }
    return {
        city,
        points: [...buckets.entries()].map(([date, bucket]) => ({
            date,
            average: bucket.count ? bucket.weightedTotal / bucket.count : null,
            minimum: Number.isFinite(bucket.minimum) ? bucket.minimum : null,
            maximum: Number.isFinite(bucket.maximum) ? bucket.maximum : null,
            count: bucket.count,
        })).sort((left, right) => new Date(left.date) - new Date(right.date)),
    };
}

function selectedCities() {
    return [...document.querySelectorAll('#graph-cities input:checked')].map(input => input.value);
}

function updateCitySummary() {
    const selected = selectedCities();
    document.querySelector('#graph-city-summary').textContent = selected.length
        ? selected.join(', ')
        : 'Elige al menos una ciudad';
}

function renderChart(data) {
    const canvas = document.querySelector('#weather-chart');
    const citySeries = data.citySeries;
    const points = citySeries ? citySeries.flatMap(series => series.points) : data.points;
    updateSummary(points, data.unit);
    document.querySelector('#chart-caption').textContent = `${data.label} · ${periodLabels[activePeriod]}${citySeries ? ' · Por ciudad' : ''} · ${data.unit}`;
    document.querySelector('#reading-count').textContent = points
        .reduce((sum, point) => sum + point.count, 0).toLocaleString('es-MX');

    if (graphChart) graphChart.destroy();
    if (!points.length) {
        canvas.hidden = true;
        chartMessage.hidden = false;
        chartMessage.textContent = 'No hay mediciones disponibles para este periodo.';
        return;
    }

    chartMessage.hidden = true;
    canvas.hidden = false;
    const labels = citySeries
        ? [...new Set(citySeries.flatMap(series => series.points.map(point => point.date)))].sort((left, right) => new Date(left) - new Date(right))
        : points.map(point => point.date);
    const cityColors = ['#0f5d5b', '#d86b48', '#628b35', '#477b9a', '#a34c67', '#8a741f'];
    const datasets = citySeries
        ? citySeries.flatMap((series, index) => {
            const color = cityColors[index % cityColors.length];
            const pointsByDate = new Map(series.points.map(point => [point.date, point]));
            const valuesFor = field => labels.map(date => pointsByDate.get(date)?.[field] ?? null);
            return [
                { label: `${series.city} · mínimo`, data: valuesFor('minimum'), borderColor: 'transparent', pointRadius: 0, fill: false, _cityRange: true },
                { label: `${series.city} · máximo`, data: valuesFor('maximum'), borderColor: 'transparent', backgroundColor: `${color}30`, pointRadius: 0, fill: '-1', _cityRange: true },
                { label: series.city, data: valuesFor('average'), borderColor: color, backgroundColor: color, borderWidth: 2, pointRadius: labels.length > 40 ? 0 : 2, pointHoverRadius: 3, tension: 0.25, fill: false },
            ];
        })
        : [
            { label: 'Mínimo', data: points.map(point => point.minimum), borderColor: 'transparent', pointRadius: 0, fill: false },
            { label: 'Máximo', data: points.map(point => point.maximum), borderColor: 'transparent', backgroundColor: 'rgba(217, 237, 114, 0.35)', pointRadius: 0, fill: '-1' },
            { label: data.label, data: points.map(point => point.average), borderColor: '#0f5d5b', backgroundColor: 'rgba(15, 93, 91, 0.1)', borderWidth: 2, pointRadius: points.length > 40 ? 0 : 2, pointHoverRadius: 3, tension: 0.25, fill: false },
        ];
    graphChart = new Chart(canvas, {
        type: 'line',
        data: {
            labels: labels.map(formatBucket),
            datasets,
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { intersect: false, mode: 'index' },
            plugins: {
                legend: {
                    display: Boolean(citySeries),
                    labels: { filter: item => !datasets[item.datasetIndex]?._cityRange },
                },
                tooltip: {
                    callbacks: {
                        label: context => `${context.dataset.label}: ${formatNumber(context.parsed.y)} ${data.unit}`,
                    },
                },
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: { maxTicksLimit: 9, maxRotation: 0, color: '#6d7e7c' },
                },
                y: {
                    title: { display: true, text: data.unit, color: '#6d7e7c' },
                    ticks: { color: '#6d7e7c' },
                    grid: { color: 'rgba(22, 39, 41, 0.08)' },
                },
            },
        },
    });
}

async function loadGraph() {
    const requestId = ++graphRequestId;
    const parameters = new URLSearchParams({
        period: activePeriod,
        metric: document.querySelector('#graph-metric').value,
        station: document.querySelector('#graph-station').value,
    });
    if (activePeriod === 'range') {
        parameters.set('start_date', rangeStartInput.value);
        parameters.set('end_date', rangeEndInput.value);
    }

    chartMessage.hidden = false;
    const separateByCity = document.querySelector('#graph-station').value === 'all';
    chartMessage.textContent = separateByCity ? 'Cargando mediciones por ciudad...' : 'Cargando mediciones...';
    document.querySelector('#weather-chart').hidden = true;
    if (activePeriod === 'range' && (!rangeStartInput.value || !rangeEndInput.value)) {
        chartMessage.textContent = 'Selecciona las fechas inicial y final del rango.';
        updateSummary([], '');
        document.querySelector('#reading-count').textContent = '0';
        return;
    }
    if (activePeriod === 'range' && rangeStartInput.value > rangeEndInput.value) {
        chartMessage.textContent = 'La fecha inicial no puede ser posterior a la fecha final.';
        updateSummary([], '');
        document.querySelector('#reading-count').textContent = '0';
        return;
    }
    try {
        let data;
        if (separateByCity) {
            if (!stations.length) throw new Error('No hay estaciones disponibles para agrupar por ciudad');
            const chosenCities = selectedCities();
            if (!chosenCities.length) {
                chartMessage.textContent = 'Selecciona al menos una ciudad para mostrar sus mediciones.';
                updateSummary([], '');
                document.querySelector('#reading-count').textContent = '0';
                return;
            }
            const cities = new Map();
            for (const station of stations) {
                const city = station.city || 'Sin ciudad';
                if (!chosenCities.includes(city)) continue;
                if (!cities.has(city)) cities.set(city, []);
                cities.get(city).push(station);
            }
            const cityResults = await Promise.all([...cities.entries()].map(async ([city, cityStations]) => {
                const stationResults = await Promise.all(cityStations.map(async station => {
                    const stationParameters = new URLSearchParams(parameters);
                    stationParameters.set('station', station.id_station);
                    return getCharts(stationParameters);
                }));
                return {
                    series: combineCityPoints(city, stationResults.map(result => result.points || [])),
                    response: stationResults[0],
                };
            }));
            data = { ...cityResults[0].response, citySeries: cityResults.map(result => result.series) };
        } else {
            data = await getCharts(parameters);
        }
        if (requestId !== graphRequestId) return;
        renderChart(data);
        const status = document.querySelector('.status-pill');
        status.classList.remove('is-offline');
        status.innerHTML = '<i></i> MongoDB conectado';
        window.dispatchEvent(new CustomEvent('api-status', { detail: { connected: true } }));
    } catch (error) {
        if (requestId !== graphRequestId) return;
        chartMessage.hidden = false;
        chartMessage.textContent = `No se pudieron cargar las gráficas: ${error.message}. Verifica que la API esté activa.`;
        updateSummary([], '');
        document.querySelector('#reading-count').textContent = '—';
        const status = document.querySelector('.status-pill');
        status.classList.add('is-offline');
        status.innerHTML = '<i></i> API sin conexión';
        window.dispatchEvent(new CustomEvent('api-status', { detail: { connected: false } }));
    }
}

async function loadStations() {
    try {
        stations = await getStations();
        stations.sort((left, right) => (left.city || '').localeCompare(right.city || '')
            || (left.nombre || '').localeCompare(right.nombre || ''));
        const stationSelect = document.querySelector('#graph-station');
        for (const station of stations) {
            const option = document.createElement('option');
            option.value = station.id_station;
            option.textContent = `${station.nombre || `Estación ${station.id_station}`} · ${station.city || 'Sin ciudad'}`;
            stationSelect.appendChild(option);
        }
        const cityContainer = document.querySelector('#graph-cities');
        const cities = [...new Set(stations.map(station => station.city || 'Sin ciudad'))].sort((left, right) => left.localeCompare(right));
        for (const city of cities) {
            const label = document.createElement('label');
            label.className = 'graph-city-option';
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.value = city;
            checkbox.checked = city === 'Chetumal';
            checkbox.addEventListener('change', () => {
                updateCitySummary();
                if (stationSelect.value === 'all') loadGraph();
            });
            label.append(checkbox, document.createTextNode(city));
            cityContainer.appendChild(label);
        }
        updateCitySummary();
    } catch {
        chartMessage.textContent = 'No se pudieron cargar las estaciones; puedes consultar el promedio general.';
        window.dispatchEvent(new CustomEvent('api-status', { detail: { connected: false } }));
    }
}

document.querySelectorAll('[data-period]').forEach(button => {
    button.addEventListener('click', () => {
        activePeriod = button.dataset.period;
        document.querySelectorAll('[data-period]').forEach(tab => {
            const selected = tab === button;
            tab.classList.toggle('active', selected);
            tab.setAttribute('aria-pressed', String(selected));
        });
        document.querySelector('#range-start-filter').hidden = activePeriod !== 'range';
        document.querySelector('#range-end-filter').hidden = activePeriod !== 'range';
        if (activePeriod === 'range' && !rangeStartInput.value) {
            const today = new Date();
            const start = new Date(today);
            start.setDate(start.getDate() - 6);
            rangeStartInput.value = start.toLocaleDateString('en-CA');
            rangeEndInput.value = today.toLocaleDateString('en-CA');
        }
        loadGraph();
    });
});

document.querySelector('#graph-metric').addEventListener('change', loadGraph);
document.querySelector('#graph-station').addEventListener('change', () => {
    document.querySelector('#graph-city-filter').disabled = document.querySelector('#graph-station').value !== 'all';
    loadGraph();
});
rangeStartInput.addEventListener('change', () => {
    rangeEndInput.min = rangeStartInput.value;
    loadGraph();
});
rangeEndInput.addEventListener('change', () => {
    rangeStartInput.max = rangeEndInput.value;
    loadGraph();
});
rangeEndInput.max = new Date().toLocaleDateString('en-CA');
loadStations().finally(loadGraph);