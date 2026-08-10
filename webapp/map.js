/* ==========================================================================
   Tunisia SDG 1 Poverty Risk Platform - Leaflet.js Interactive Map Logic
   ========================================================================== */

let map;
let currentLayerName = 'delegation'; // 'delegation' or 'gouvernorat'
let currentYear = '2026'; // '2015', '2020', or '2026'
let geojsonLayer;
let delegationData = null;
let gouvernoratData = null;
let currentSelectedProps = null;

// Helper to extract poverty rate for current selected year
function getPovertyRate(props) {
    if (!props) return 0;
    if (currentYear === '2015') {
        let r = props.poverty_2015 !== undefined ? props.poverty_2015 :
                props.taux_pauvrete_2015 !== undefined ? props.taux_pauvrete_2015 :
                props.taux_pauvrete_survey_2015;
        return r !== undefined ? Number(r) : 0;
    } else if (currentYear === '2020') {
        let r = props.poverty_2020 !== undefined ? props.poverty_2020 :
                props.poverty_projected_2020;
        return r !== undefined ? Number(r) : (getPovertyRate({...props}, '2015'));
    } else {
        // 2026 Projection / Downscaled ML
        let r = props.poverty_2026 !== undefined ? props.poverty_2026 :
                props.poverty_2024 !== undefined ? props.poverty_2024 :
                props.y_pred_within_anchored !== undefined ? props.y_pred_within_anchored :
                props.taux_pauvrete_2015;
        return r !== undefined ? Number(r) : 0;
    }
}

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
    let rate = getPovertyRate(feature.properties);

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

// Map technical feature names to clear human-friendly risk factors
function translateRiskFactor(driverName) {
    if (!driverName) return "Low Electrification & Night Lights";
    let d = driverName.toLowerCase();
    
    if (d.includes('ntl_lst_prod') || d.includes('economic-thermal')) return "Economic & Climate Dual Vulnerability";
    if (d.includes('lst_ndvi') || d.includes('aridity')) return "Thermal Heat & Drought Stress";
    if (d.includes('ndbi_ndvi') || d.includes('heat stress')) return "Urban Heat & Built Environment Deficit";
    if (d.includes('electrification') || d.includes('ntl')) return "Limited Nighttime Lighting (Low Economic Activity)";
    if (d.includes('road')) return "Low Road Network Density (Poor Transport Access)";
    if (d.includes('bldg') || d.includes('building')) return "Sparse Urban Infrastructure & Housing";
    if (d.includes('lst') || d.includes('heat') || d.includes('thermal')) return "High Land Surface Temperature (Hot Climate)";
    if (d.includes('ndvi') || d.includes('vegetation') || d.includes('canopy')) return "Low Agricultural & Vegetation Canopy";
    if (d.includes('ndwi') || d.includes('water')) return "Surface Water Scarcity & Drought";
    if (d.includes('savi') || d.includes('evi')) return "Soil Degradation & Vegetative Stress";
    
    return driverName;
}

// Extract distinct, non-repeating key risk factors for a feature
function getDistinctRiskFactors(props) {
    let rawDrivers = [props.shap_driver_1, props.shap_driver_2, props.shap_driver_3];
    let translated = [];
    
    for (let rd of rawDrivers) {
        if (rd) {
            let t = translateRiskFactor(rd);
            if (!translated.includes(t)) {
                translated.push(t);
            }
        }
    }

    let rate = props.y_pred_within_anchored || props.taux_pauvrete_2015 || 18.0;
    let defaultHigh = [
        "Limited Nighttime Lighting (Low Economic Activity)",
        "Low Road Network Density (Poor Transport Access)",
        "High Land Surface Temperature (Hot Climate)"
    ];
    let defaultLow = [
        "Dense Road Network & High Commercial Access",
        "High Nighttime Lighting & Commercial Grid",
        "High Built-Up Urban Infrastructure"
    ];

    let pool = rate > 20.0 ? defaultHigh : defaultLow;
    for (let fallback of pool) {
        if (translated.length < 3 && !translated.includes(fallback)) {
            translated.push(fallback);
        }
    }

    return translated.slice(0, 3);
}

// Update Sidebar Inspector with complete features & distinct risk factors
function updateInspector(props) {
    if (!props) return;
    currentSelectedProps = props;

    let titleEl = document.getElementById('inspect-title');
    let govEl = document.getElementById('inspect-gov');
    let rateEl = document.getElementById('inspect-rate');
    let popEl = document.getElementById('inspect-pop');
    let ndviEl = document.getElementById('inspect-ndvi');
    let ntlEl = document.getElementById('inspect-ntl');
    let lstEl = document.getElementById('inspect-lst');
    let roadEl = document.getElementById('inspect-road');
    let biasEl = document.getElementById('inspect-bias');
    let riskBox = document.getElementById('risk-factors-list');

    // Update inspector rate label to show current year
    let rateLbl = document.querySelector('.inspect-rate-label');
    if (rateLbl) {
        rateLbl.innerText = `Poverty Rate Estimate (${currentYear})`;
    }

    let rate = getPovertyRate(props);
    rateEl.innerText = rate.toFixed(1) + '%';

    // Title and Governorate badge
    if (currentLayerName === 'delegation') {
        let latinName = props.delegation_latin || props.delegation || '';
        let arName = props.delegation_name || '';
        titleEl.innerText = latinName ? `${latinName} (${arName})` : arName;
        govEl.innerText = props.governorate_name || props.gouvernorat || 'ADM2';
        
        let bias = props.aggregation_bias || 0;
        biasEl.innerText = (bias >= 0 ? '+' : '') + bias.toFixed(1) + ' %p';
    } else {
        titleEl.innerText = props.governorate_name || props.gouvernorat || 'Governorate';
        govEl.innerText = props.poverty_risk_tier || 'ADM1';
        
        let composite = props.poverty_composite_score || 0;
        biasEl.innerText = 'Score ' + composite.toFixed(3);
    }

    // Render 3 DISTINCT non-repeating key risk factors
    let distinctFactors = getDistinctRiskFactors(props);
    riskBox.innerHTML = distinctFactors.map((f, i) => `<span class="risk-badge">${i + 1}. ${f}</span>`).join('');

    // Population lookup
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

// AI Geospatial Chatbot Assistant Engine
function submitChatMessage() {
    let inputEl = document.getElementById('chat-input');
    if (!inputEl) return;

    let query = inputEl.value.trim();
    if (query === '') return;

    appendChatMessage(query, 'user-msg');
    inputEl.value = '';

    setTimeout(() => {
        let response = generateDynamicBotResponse(query);
        appendChatMessage(response, 'bot-msg');
    }, 200);
}

function sendSuggestedQuery(text) {
    document.getElementById('chat-input').value = text;
    submitChatMessage();
}

function handleChatKeyPress(e) {
    if (e.key === 'Enter') {
        submitChatMessage();
    }
}

function appendChatMessage(text, className) {
    let msgContainer = document.getElementById('chat-messages');
    if (!msgContainer) return;

    let msgDiv = document.createElement('div');
    msgDiv.className = `chat-msg ${className}`;
    msgDiv.innerHTML = text;
    msgContainer.appendChild(msgDiv);

    msgContainer.scrollTop = msgContainer.scrollHeight;
}

// Advanced NLP & Knowledge Query Engine for Chatbot
function generateDynamicBotResponse(userQuery) {
    let q = userQuery.toLowerCase().trim();

    if (!delegationData || !delegationData.features) {
        return "I am still loading spatial dataset layers. Please ask again in a moment!";
    }

    let features = delegationData.features;

    // Intent 1: Ranking Queries (Poorest / Highest Poverty)
    if (q.includes('poorest') || q.includes('highest poverty') || q.includes('top risk') || q.includes('most vulnerable') || q.includes('highest')) {
        let sorted = [...features].sort((a, b) => {
            let rA = getPovertyRate(a.properties);
            let rB = getPovertyRate(b.properties);
            return rB - rA;
        });

        let top5 = sorted.slice(0, 5).map((f, i) => {
            let p = f.properties;
            let name = p.delegation_latin || p.delegation_name || 'Delegation';
            let gov = p.governorate_name || p.gouvernorat;
            let rate = getPovertyRate(p).toFixed(1);
            return `<strong>${i + 1}. ${name}</strong> (${gov}): ${rate}%`;
        }).join('<br>');

        return `Top 5 Highest Poverty Risk Delegations in Tunisia (${currentYear}):<br>${top5}`;
    }

    if (q.includes('lowest poverty') || q.includes('richest') || q.includes('wealthiest') || q.includes('least poor') || q.includes('lowest')) {
        let sorted = [...features].sort((a, b) => {
            let rA = getPovertyRate(a.properties);
            let rB = getPovertyRate(b.properties);
            return rA - rB;
        });

        let low5 = sorted.slice(0, 5).map((f, i) => {
            let p = f.properties;
            let name = p.delegation_latin || p.delegation_name || 'Delegation';
            let gov = p.governorate_name || p.gouvernorat;
            let rate = getPovertyRate(p).toFixed(1);
            return `<strong>${i + 1}. ${name}</strong> (${gov}): ${rate}%`;
        }).join('<br>');

        return `Top 5 Lowest Poverty Delegations in Tunisia (${currentYear}):<br>${low5}`;
    }

    // Intent 2: Comparison Queries (Compare X and Y)
    if (q.includes('compare') || q.includes(' vs ') || q.includes(' versus ')) {
        let matches = [];
        for (let f of features) {
            let p = f.properties;
            let nameEn = (p.delegation_latin || p.delegation || '').toLowerCase();
            let nameAr = (p.delegation_name || '').toLowerCase();
            let govName = (p.governorate_name || p.gouvernorat || '').toLowerCase();

            if ((nameEn && nameEn.length > 2 && q.includes(nameEn)) || 
                (nameAr && nameAr.length > 2 && q.includes(nameAr)) || 
                (govName && govName.length > 3 && q.includes(govName))) {
                if (!matches.some(m => m.properties.delegation_id === p.delegation_id)) {
                    matches.push(f);
                }
            }
        }

        if (matches.length >= 2) {
            let p1 = matches[0].properties;
            let p2 = matches[1].properties;
            let rate1 = getPovertyRate(p1).toFixed(1);
            let rate2 = getPovertyRate(p2).toFixed(1);
            let name1 = p1.delegation_latin || p1.delegation_name;
            let name2 = p2.delegation_latin || p2.delegation_name;

            return `<strong>Comparison (${currentYear}):</strong><br>• <strong>${name1}</strong> (${p1.governorate_name}): <strong>${rate1}%</strong> poverty rate.<br>• <strong>${name2}</strong> (${p2.governorate_name}): <strong>${rate2}%</strong> poverty rate.<br>Gap: <strong>${Math.abs(rate1 - rate2).toFixed(1)} percentage points</strong>.`;
        }
    }

    // Intent 3: Specific Delegation / Governorate Search
    let matchedFeatures = [];
    for (let f of features) {
        let p = f.properties;
        let nameEn = (p.delegation_latin || p.delegation || '').toLowerCase();
        let nameAr = (p.delegation_name || '').toLowerCase();
        let govName = (p.governorate_name || p.gouvernorat || '').toLowerCase();

        if ((nameEn && nameEn.length > 2 && q.includes(nameEn)) || 
            (nameAr && nameAr.length > 2 && q.includes(nameAr)) || 
            (govName && govName.length > 3 && q.includes(govName))) {
            matchedFeatures.push(f);
        }
    }

    if (matchedFeatures.length > 0) {
        let firstMatch = matchedFeatures[0].properties;
        let name = firstMatch.delegation_latin || firstMatch.delegation_name;
        let gov = firstMatch.governorate_name || firstMatch.gouvernorat;
        let rate = getPovertyRate(firstMatch).toFixed(1);
        let pop = firstMatch.population ? Number(firstMatch.population).toLocaleString() : 'N/A';
        let factors = getDistinctRiskFactors(firstMatch);

        // Highlight and center on map
        if (map && geojsonLayer) {
            geojsonLayer.eachLayer(l => {
                if (l.feature.properties.delegation_id === firstMatch.delegation_id) {
                    l.setStyle({ weight: 4, color: '#ec4899', fillOpacity: 0.95 });
                    map.panTo(l.getBounds().getCenter());
                    updateInspector(firstMatch);
                }
            });
        }

        if (matchedFeatures.length === 1) {
            return `<strong>${name}</strong> (${gov}):<br>• Poverty Rate (${currentYear}): <strong>${rate}%</strong><br>• Population: <strong>${pop}</strong><br>• Main Risk Factors:<br>  1. ${factors[0]}<br>  2. ${factors[1]}<br>  3. ${factors[2]}`;
        } else {
            let govRates = matchedFeatures.map(f => getPovertyRate(f.properties));
            let meanGovRate = (govRates.reduce((a,b)=>a+b,0) / govRates.length).toFixed(1);
            return `<strong>${gov} Governorate</strong> (${matchedFeatures.length} delegations):<br>• Average Poverty Rate (${currentYear}): <strong>${meanGovRate}%</strong><br>• Highlighted Unit: <strong>${name}</strong> (${rate}% poverty rate, ${pop} pop).<br>• Key Risk Factors:<br>  1. ${factors[0]}<br>  2. ${factors[1]}<br>  3. ${factors[2]}`;
        }
    }

    // Default Helpful Multi-Intent Guidance
    return `I searched Tunisia's 264 delegations! Try asking about:<br>• Specific regions: <em>"Tell me about Kasserine"</em> or <em>"Sidi Bouzid"</em><br>• Rankings: <em>"Top 5 poorest delegations"</em> or <em>"Lowest poverty areas"</em><br>• Comparisons: <em>"Compare Tunis and Kairouan"</em>`;
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

    updateSummaryStats();
}

// Switch Active Layer (ADM2 vs ADM1)
function switchLayer(layerName) {
    currentLayerName = layerName;

    document.getElementById('btn-delegation').classList.toggle('active', layerName === 'delegation');
    document.getElementById('btn-gouvernorat').classList.toggle('active', layerName === 'gouvernorat');

    renderLayer();
}

// Switch Active Year (2015, 2020, 2026)
function switchYear(year) {
    currentYear = year;

    let b15 = document.getElementById('btn-year-2015');
    let b20 = document.getElementById('btn-year-2020');
    let b26 = document.getElementById('btn-year-2026');

    if (b15) b15.classList.toggle('active', year === '2015');
    if (b20) b20.classList.toggle('active', year === '2020');
    if (b26) b26.classList.toggle('active', year === '2026');

    if (geojsonLayer) {
        geojsonLayer.setStyle(styleFeature);
    }

    if (currentSelectedProps) {
        updateInspector(currentSelectedProps);
    }

    updateSummaryStats();
}

// Recalculate and update sidebar key metrics cards dynamically for active year
function updateSummaryStats() {
    let data = currentLayerName === 'delegation' ? delegationData : gouvernoratData;
    if (!data || !data.features || data.features.length === 0) return;

    let features = data.features;

    let highest = features[0];
    let lowest = features[0];
    let maxRate = getPovertyRate(highest.properties);
    let minRate = getPovertyRate(lowest.properties);

    for (let f of features) {
        let r = getPovertyRate(f.properties);
        if (r > maxRate) {
            maxRate = r;
            highest = f;
        }
        if (r < minRate) {
            minRate = r;
            lowest = f;
        }
    }

    let maxEl = document.getElementById('val-max-unit');
    if (maxEl) {
        let p = highest.properties;
        let name = p.delegation_latin || p.delegation_name || p.governorate_name || p.gouvernorat;
        maxEl.innerText = name;
        let subEl = maxEl.parentElement.querySelector('.stat-sub');
        if (subEl) subEl.innerText = `${maxRate.toFixed(1)}% Poverty Rate (${currentYear})`;
    }

    let minEl = document.getElementById('val-min-unit');
    if (minEl) {
        let p = lowest.properties;
        let name = p.delegation_latin || p.delegation_name || p.governorate_name || p.gouvernorat;
        minEl.innerText = name;
        let subEl = minEl.parentElement.querySelector('.stat-sub');
        if (subEl) subEl.innerText = `${minRate.toFixed(1)}% Poverty Rate (${currentYear})`;
    }
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
        let nameEn = (props.delegation_latin || props.delegation || '').toLowerCase();
        let nameAr = (props.delegation_name || props.shapeName || '').toLowerCase();
        let govName = (props.governorate_name || props.gouvernorat || '').toLowerCase();

        if (nameEn.includes(query) || nameAr.includes(query) || govName.includes(query)) {
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
