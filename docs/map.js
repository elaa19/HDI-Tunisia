/* ==========================================================================
   Tunisia SDG 1 Poverty Risk Platform - Leaflet.js Interactive Map Logic
   ========================================================================== */

let map;
let currentLayerName = 'delegation'; // 'delegation' or 'gouvernorat'
let geojsonLayer;
let delegationData = null;
let gouvernoratData = null;

// Color scale for poverty rates (%)
function getPovertyColor(rate) {
    return rate > 35.0 ? '#bd0026' :
           rate > 25.0 ? '#f03b20' :
           rate > 15.0 ? '#fd8d3c' :
           rate > 8.0  ? '#fecc5c' :
                         '#ffffb2';
}

// Style function for GeoJSON features
function styleFeature(feature) {
    let rate = 0;
    if (currentLayerName === 'delegation') {
        rate = feature.properties.y_pred_within_anchored || feature.properties.taux_pauvrete_2015 || 0;
    } else {
        rate = feature.properties.taux_pauvrete_survey_2015 || feature.properties.poverty_rate_official || 0;
    }

    return {
        fillColor: getPovertyColor(rate),
        weight: 1.5,
        opacity: 0.8,
        color: 'rgba(255, 255, 255, 0.4)',
        dashArray: '',
        fillOpacity: 0.75
    };
}

// Highlight feature on mouseover
function highlightFeature(e) {
    let layer = e.target;

    layer.setStyle({
        weight: 3,
        color: '#3b82f6',
        opacity: 1,
        fillOpacity: 0.9
    });

    if (!L.Browser.ie && !L.Browser.opera && !L.Browser.edge) {
        layer.bringToFront();
    }

    updateInspector(layer.feature.properties);
}

// Reset feature style on mouseout
function resetHighlight(e) {
    geojsonLayer.resetStyle(e.target);
}

// Zoom to feature on click
function zoomToFeature(e) {
    map.fitBounds(e.target.getBounds());
    updateInspector(e.target.feature.properties);
}

// Attach interactive listeners to each feature
function onEachFeature(feature, layer) {
    layer.on({
        mouseover: highlightFeature,
        mouseout: resetHighlight,
        click: zoomToFeature
    });
}

// Update Sidebar Inspector with complete features for both Delegation & Governorate
function updateInspector(props) {
    if (!props) return;

    let titleEl = document.getElementById('inspect-title');
    let govEl = document.getElementById('inspect-gov');
    let rateEl = document.getElementById('inspect-rate');
    let popEl = document.getElementById('inspect-pop');
    let ndviEl = document.getElementById('inspect-ndvi');
    let ntlEl = document.getElementById('inspect-ntl');
    let lstEl = document.getElementById('inspect-lst');
    let roadEl = document.getElementById('inspect-road');
    let biasEl = document.getElementById('inspect-bias');

    // Title and Governorate badge
    if (currentLayerName === 'delegation') {
        titleEl.innerText = props.delegation_label_name || props.delegation_name || props.delegation || 'Delegation';
        govEl.innerText = props.governorate_name || props.gouvernorat || 'ADM2';
        
        let rate = props.y_pred_within_anchored || props.taux_pauvrete_2015 || 0;
        rateEl.innerText = rate.toFixed(1) + '%';
        
        let bias = props.aggregation_bias || 0;
        biasEl.innerText = (bias >= 0 ? '+' : '') + bias.toFixed(1) + ' %p';
    } else {
        titleEl.innerText = props.governorate_name || props.gouvernorat || 'Governorate';
        govEl.innerText = props.poverty_risk_tier || 'ADM1';
        
        let rate = props.taux_pauvrete_survey_2015 || props.poverty_rate_official || 0;
        rateEl.innerText = rate.toFixed(1) + '%';
        
        let composite = props.poverty_composite_score || 0;
        biasEl.innerText = 'Score ' + composite.toFixed(3);
    }

    // Population lookup (check all candidate keys)
    let popVal = props.population_2015 || props.population || props.pop || props.population_survey_2015;
    popEl.innerText = popVal ? Number(popVal).toLocaleString() : 'N/A';

    // Satellite & Built-environment Features
    let ndvi = props.NDVI_mean || props.ndvi_mean;
    ndviEl.innerText = ndvi !== undefined ? Number(ndvi).toFixed(3) : 'N/A';

    let ntl = props.NTL_radiance_mean || props.ntl_radiance_mean;
    ntlEl.innerText = ntl !== undefined ? Number(ntl).toFixed(2) + ' nW' : 'N/A';

    let lst = props.LST_Celsius_mean || props.lst_celsius_mean;
    lstEl.innerText = lst !== undefined ? Number(lst).toFixed(1) + ' °C' : 'N/A';

    let road = props.road_density_km_per_km2 || props.road_density;
    roadEl.innerText = road !== undefined ? Number(road).toFixed(2) + ' km/km²' : 'N/A';
}

// Initialize Leaflet Map
function initMap() {
    map = L.map('map', {
        zoomControl: false,
        attributionControl: false
    }).setView([34.0, 9.5], 7);

    // Dark Map Tiles (CartoDB Dark Matter)
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        maxZoom: 19,
        subdomains: 'abcd'
    }).addTo(map);

    L.control.zoom({ position: 'topright' }).addTo(map);

    loadData();
}

// Load GeoJSON Data
async function loadData() {
    try {
        const resDel = await fetch('data/delegation_predictions.geojson');
        delegationData = await resDel.json();

        const resGov = await fetch('data/gouvernorat_predictions.geojson');
        gouvernoratData = await resGov.json();

        renderLayer();
    } catch (err) {
        console.error('Error loading GeoJSON layers:', err);
    }
}

// Render Active Layer
function renderLayer() {
    if (geojsonLayer) {
        map.removeLayer(geojsonLayer);
    }

    const dataToRender = currentLayerName === 'delegation' ? delegationData : gouvernoratData;

    if (!dataToRender) return;

    geojsonLayer = L.geoJSON(dataToRender, {
        style: styleFeature,
        onEachFeature: onEachFeature
    }).addTo(map);

    if (dataToRender.features && dataToRender.features.length > 0) {
        updateInspector(dataToRender.features[0].properties);
    }
}

// Switch Active Layer
function switchLayer(layerName) {
    currentLayerName = layerName;

    document.getElementById('btn-delegation').classList.toggle('active', layerName === 'delegation');
    document.getElementById('btn-gouvernorat').classList.toggle('active', layerName === 'gouvernorat');

    renderLayer();
}

// Fixed Search Filter Logic
function filterUnits() {
    let inputEl = document.getElementById('unit-search');
    if (!inputEl) return;

    let query = inputEl.value.trim().toLowerCase();
    if (!geojsonLayer) return;

    if (query === '') {
        geojsonLayer.eachLayer(function(layer) {
            geojsonLayer.resetStyle(layer);
        });
        return;
    }

    let foundMatch = false;

    geojsonLayer.eachLayer(function(layer) {
        let props = layer.feature.properties;
        let nameAr = (props.delegation_name || props.shapeName || '').toLowerCase();
        let nameEn = (props.delegation_label_name || props.delegation || '').toLowerCase();
        let govName = (props.governorate_name || props.gouvernorat || '').toLowerCase();

        if (nameAr.includes(query) || nameEn.includes(query) || govName.includes(query)) {
            layer.setStyle({
                weight: 4,
                color: '#ec4899',
                opacity: 1,
                fillOpacity: 0.95
            });

            if (!foundMatch) {
                map.panTo(layer.getBounds().getCenter());
                updateInspector(props);
                foundMatch = true;
            }
        } else {
            geojsonLayer.resetStyle(layer);
        }
    });
}

document.addEventListener('DOMContentLoaded', initMap);
