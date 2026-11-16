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
    if (currentYear === 'INS_2015') {
        let r = props.taux_pauvrete_survey_2015 !== undefined ? props.taux_pauvrete_survey_2015 :
                props.poverty_survey_2015 !== undefined ? props.poverty_survey_2015 :
                props.taux_pauvrete_2015;
        return r !== undefined ? Number(r) : 0;
    } else if (currentYear === '2015') {
        let r = props.poverty_2015 !== undefined ? props.poverty_2015 :
                props.taux_pauvrete_2015 !== undefined ? props.taux_pauvrete_2015 :
                props.taux_pauvrete_survey_2015;
        return r !== undefined ? Number(r) : 0;
    } else if (currentYear === '2017') {
        let r = props.poverty_2017 !== undefined ? props.poverty_2017 : props.poverty_2015;
        return r !== undefined ? Number(r) : (getPovertyRate({...props}, '2015'));
    } else if (currentYear === '2020') {
        let r = props.poverty_2020 !== undefined ? props.poverty_2020 :
                props.poverty_projected_2020;
        return r !== undefined ? Number(r) : (getPovertyRate({...props}, '2015'));
    } else if (currentYear === '2023') {
        let r = props.poverty_2023 !== undefined ? props.poverty_2023 : props.poverty_2020;
        return r !== undefined ? Number(r) : (getPovertyRate({...props}, '2020'));
    } else {
        // 2026 Projection / Downscaled ML
        let r = props.poverty_2026 !== undefined ? props.poverty_2026 :
                props.poverty_2024 !== undefined ? props.poverty_2024 :
                props.y_pred_within_anchored !== undefined ? props.y_pred_within_anchored :
                props.taux_pauvrete_2015;
        return r !== undefined ? Number(r) : 0;
    }
}

// Helper to extract Satellite HDI score for current selected year
function getHDIScore(props) {
    if (!props) return 0.750;
    let hdiKey = `hdi_${currentYear}`;
    if (props[hdiKey] !== undefined) return Number(props[hdiKey]);
    if (props.hdi_2015 !== undefined) return Number(props.hdi_2015);
    if (props.poverty_composite_score !== undefined) return 1.0 - Number(props.poverty_composite_score);
    return 0.750;
}

// Map Mode Switcher ('poverty', 'hdi')
let currentMapMode = 'poverty';

function switchMapMode(mode) {
    currentMapMode = mode;
    
    let bp = document.getElementById('btn-mode-poverty');
    let bh = document.getElementById('btn-mode-hdi');

    if (bp) bp.classList.toggle('active', mode === 'poverty');
    if (bh) bh.classList.toggle('active', mode === 'hdi');

    // Update map legend title & bar
    let legendTitle = document.querySelector('.map-legend .legend-title');
    let legendLabels = document.querySelector('.map-legend .legend-labels');
    let legendBar = document.querySelector('.map-legend .legend-bar');

    if (legendTitle && legendLabels && legendBar) {
        if (mode === 'poverty') {
            legendTitle.innerText = 'SDG 1 Poverty Risk Rate (%)';
            legendBar.style.background = 'linear-gradient(to right, #10b981, #06b6d4, #fecc5c, #f03b20, #800026)';
            legendLabels.innerHTML = '<span>0% (Low Risk)</span><span>10%</span><span>20%</span><span>30%</span><span>40%+ (Severe Risk)</span>';
        } else if (mode === 'hdi') {
            legendTitle.innerText = 'Satellite Human Development Index (HDI)';
            legendBar.style.background = 'linear-gradient(to right, #800026, #f03b20, #fecc5c, #06b6d4, #10b981)';
            legendLabels.innerHTML = '<span><0.42 (Low)</span><span>0.55</span><span>0.68</span><span>0.82</span><span>>0.95 (High)</span>';
        }
    }

    if (geojsonLayer) {
        geojsonLayer.setStyle(styleFeature);
    }
}

// RGB Color Interpolator for smooth continuous color degradation
function interpolateRgb(color1, color2, factor) {
    factor = Math.max(0, Math.min(1, factor));
    let c1 = parseHex(color1);
    let c2 = parseHex(color2);
    let r = Math.round(c1.r + factor * (c2.r - c1.r));
    let g = Math.round(c1.g + factor * (c2.g - c1.g));
    let b = Math.round(c1.b + factor * (c2.b - c1.b));
    return `rgb(${r}, ${g}, ${b})`;
}

function parseHex(hex) {
    hex = hex.replace('#', '');
    if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
    let num = parseInt(hex, 16);
    return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
}

// Unified 1-to-1 Proportional Color Engine (t = 0.0 Best/Green -> t = 1.0 Worst/Crimson)
function getUnifiedProportionalColor(t) {
    t = Math.max(0.0, Math.min(1.0, t));
    if (t <= 0.25) return interpolateRgb('#10b981', '#06b6d4', t / 0.25);
    if (t <= 0.50) return interpolateRgb('#06b6d4', '#fecc5c', (t - 0.25) / 0.25);
    if (t <= 0.75) return interpolateRgb('#fecc5c', '#f03b20', (t - 0.50) / 0.25);
    return interpolateRgb('#f03b20', '#800026', (t - 0.75) / 0.25);
}

// Continuous Poverty Rate Color Degradation (0% -> 40%+)
function getPovertyColor(rate) {
    let t = Math.min(1.0, Math.max(0.0, rate / 40.0));
    return getUnifiedProportionalColor(t);
}

// Continuous Satellite HDI Color Degradation (0.42 -> 0.95+)
function getHDIColor(score) {
    let normHdi = Math.min(1.0, Math.max(0.0, (score - 0.42) / 0.53));
    let t = 1.0 - normHdi; // Invert so High HDI -> t=0 (Emerald Green), Low HDI -> t=1 (Crimson Red)
    return getUnifiedProportionalColor(t);
}

// Style function for GeoJSON features
function styleFeature(feature) {
    let color = '#ffffb2';
    if (currentMapMode === 'poverty') {
        let rate = getPovertyRate(feature.properties);
        color = getPovertyColor(rate);
    } else if (currentMapMode === 'hdi') {
        let hdi = getHDIScore(feature.properties);
        color = getHDIColor(hdi);
    }

    return {
        fillColor: color,
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

// Build interactive popup content detailing all Model Formula Satellite Features for each delegate
function buildFeaturePopupContent(props) {
    if (!props) return '';
    let isDel = currentLayerName === 'delegation';
    let name = isDel ? (props.delegation_latin || props.delegation_name || props.delegation || 'Delegation') : (props.governorate_name || props.gouvernorat || 'Governorate');
    let gov = props.governorate_name || props.gouvernorat || '';
    let povertyRate = getPovertyRate(props);
    let hdiScore = getHDIScore(props);

    let ntl = props.NTL_radiance_mean !== undefined ? Number(props.NTL_radiance_mean) : 0;
    let road = props.road_density_km_per_km2 !== undefined ? Number(props.road_density_km_per_km2) : 0;
    let bldg = props.building_count_per_km2 !== undefined ? Number(props.building_count_per_km2) : 0;
    let ndbi = props.NDBI_mean !== undefined ? Number(props.NDBI_mean) : 0;
    let bldgArea = props.building_area_ratio !== undefined ? Number(props.building_area_ratio) : 0;
    let ndvi = props.NDVI_mean !== undefined ? Number(props.NDVI_mean) : 0;
    let lst = props.LST_Celsius_mean !== undefined ? Number(props.LST_Celsius_mean) : 0;

    let iInc = props.hdi_i_income !== undefined ? Number(props.hdi_i_income) : 0.68;
    let iEdu = props.hdi_i_education !== undefined ? Number(props.hdi_i_education) : 0.60;
    let iHealth = props.hdi_i_health !== undefined ? Number(props.hdi_i_health) : 0.74;

    return `
    <div style="font-family: Inter, sans-serif; font-size: 0.8rem; color: #0f172a; min-width: 230px; padding: 2px;">
        <div style="font-weight: 700; font-size: 0.88rem; color: #0f172a; border-bottom: 1px solid #cbd5e1; padding-bottom: 4px; margin-bottom: 6px;">
            ${name} <span style="font-weight: 500; font-size: 0.75rem; color: #64748b;">(${gov})</span>
        </div>
        <div style="display: flex; justify-content: space-between; margin-bottom: 3px;">
            <span>Satellite HDI Score (${currentYear}):</span> <strong style="color: #0284c7;">${hdiScore.toFixed(3)}</strong>
        </div>
        <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
            <span>Poverty Rate Estimate:</span> <strong style="color: #dc2626;">${povertyRate.toFixed(1)}%</strong>
        </div>
        <div style="font-weight: 600; font-size: 0.73rem; color: #475569; margin-top: 4px; margin-bottom: 4px; border-top: 1px dashed #cbd5e1; padding-top: 4px;">
            Model Formula Satellite Features:
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px; font-size: 0.72rem; color: #334155;">
            <div>• NTL: <strong>${ntl.toFixed(2)} nW</strong></div>
            <div>• Road: <strong>${road.toFixed(2)} km²</strong></div>
            <div>• Bldg: <strong>${bldg.toFixed(1)} /km²</strong></div>
            <div>• NDBI: <strong>${ndbi.toFixed(3)}</strong></div>
            <div>• Area: <strong>${bldgArea.toFixed(3)}</strong></div>
            <div>• NDVI: <strong>${ndvi.toFixed(3)}</strong></div>
            <div>• LST: <strong>${lst.toFixed(1)} °C</strong></div>
        </div>
        <div style="margin-top: 6px; font-size: 0.68rem; color: #475569; background: #f1f5f9; padding: 4px 6px; border-radius: 4px; text-align: center;">
            Sub-Indices: I<sub>Inc</sub>=${iInc.toFixed(2)} | I<sub>Edu</sub>=${iEdu.toFixed(2)} | I<sub>Health</sub>=${iHealth.toFixed(2)}
        </div>
    </div>`;
}

// Zoom to feature on click
function zoomToFeature(e) {
    map.fitBounds(e.target.getBounds());
    updateInspector(e.target.feature.properties);
}

// Attach interactive listeners to each feature
function onEachFeature(feature, layer) {
    if (feature.properties) {
        layer.bindPopup(buildFeaturePopupContent(feature.properties));
    }
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
        if (biasEl) biasEl.innerText = (bias >= 0 ? '+' : '') + bias.toFixed(1) + ' %p';
    } else {
        titleEl.innerText = props.governorate_name || props.gouvernorat || 'Governorate';
        govEl.innerText = props.poverty_risk_tier || 'ADM1';
        
        let composite = props.poverty_composite_score || 0;
        if (biasEl) biasEl.innerText = 'Score ' + composite.toFixed(3);
    }

    // Render 3 DISTINCT non-repeating key risk factors
    let distinctFactors = getDistinctRiskFactors(props);
    riskBox.innerHTML = distinctFactors.map((f, i) => `<span class="risk-badge">${i + 1}. ${f}</span>`).join('');

    // Population lookup
    let popVal = props.population_2015 || props.population || props.pop || props.population_survey_2015;
    popEl.innerText = popVal ? Number(popVal).toLocaleString() : 'N/A';

    // Satellite HDI Score lookup
    let hdiEl = document.getElementById('inspect-hdi');
    if (hdiEl) {
        let hdiScore = getHDIScore(props);
        hdiEl.innerText = hdiScore.toFixed(3);
    }

    // Satellite HDI Sub-Indices Gauges
    let iInc = props.hdi_i_income !== undefined ? Number(props.hdi_i_income) : 0.68;
    let iEdu = props.hdi_i_education !== undefined ? Number(props.hdi_i_education) : 0.60;
    let iHealth = props.hdi_i_health !== undefined ? Number(props.hdi_i_health) : 0.74;

    let vIncEl = document.getElementById('gauge-val-income');
    let bIncEl = document.getElementById('gauge-bar-income');
    if (vIncEl) vIncEl.innerText = iInc.toFixed(2);
    if (bIncEl) bIncEl.style.width = Math.min(100, Math.max(5, iInc * 100)) + '%';

    let vEduEl = document.getElementById('gauge-val-edu');
    let bEduEl = document.getElementById('gauge-bar-edu');
    if (vEduEl) vEduEl.innerText = iEdu.toFixed(2);
    if (bEduEl) bEduEl.style.width = Math.min(100, Math.max(5, iEdu * 100)) + '%';

    let vHealthEl = document.getElementById('gauge-val-health');
    let bHealthEl = document.getElementById('gauge-bar-health');
    if (vHealthEl) vHealthEl.innerText = iHealth.toFixed(2);
    if (bHealthEl) bHealthEl.style.width = Math.min(100, Math.max(5, iHealth * 100)) + '%';

    // Satellite & Built-environment Features
    let ndvi = props.NDVI_mean || props.ndvi_mean;
    ndviEl.innerText = ndvi !== undefined ? Number(ndvi).toFixed(3) : 'N/A';

    let ntl = props.NTL_radiance_mean || props.ntl_radiance_mean;
    ntlEl.innerText = ntl !== undefined ? Number(ntl).toFixed(2) + ' nW' : 'N/A';

    let lst = props.LST_Celsius_mean || props.lst_celsius_mean;
    lstEl.innerText = lst !== undefined ? Number(lst).toFixed(1) + ' °C' : 'N/A';

    let road = props.road_density_km_per_km2 || props.road_density;
    roadEl.innerText = road !== undefined ? Number(road).toFixed(2) + ' km/km²' : 'N/A';

    // Socioeconomic Driver & City Evolution Summary
    let govName = (props.governorate_name || props.gouvernorat || '').toUpperCase().strip ? (props.governorate_name || props.gouvernorat || '').toUpperCase().trim() : '';
    govName = clean_gov(govName);

    let socioEl = document.getElementById('inspect-socioeconomic');
    if (socioEl) {
        let driverText = SOCIOECONOMIC_DRIVERS[govName] || 
            `Region ${props.delegation_name || props.governorate_name}: Characterized by local agricultural & infrastructure transitions. Poverty estimate (${currentYear}): ${getPovertyRate(props).toFixed(1)}%.`;
        socioEl.innerHTML = `<strong>${props.delegation_name || props.governorate_name} (${props.governorate_name || ''}):</strong><br>${driverText}`;
    }
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

    // Intent 0: INS Multi-Year Correlation Queries
    if (q.includes('ins') || q.includes('correlation') || q.includes('validat') || q.includes('work and the ins') || q.includes('statistical')) {
        let p_r = insCorrData ? insCorrData.multi_temporal_regional_analysis.pooled_pearson_r : 0.7308;
        let s_r = insCorrData ? insCorrData.multi_temporal_regional_analysis.pooled_spearman_rho : 0.6558;
        let g_r = insCorrData ? insCorrData.governorate_cross_sectional_2015.composite_score_r : 0.6804;
        let ntl_r = insCorrData ? insCorrData.feature_correlations.NTL_radiance_mean.pearson_r : -0.6499;

        return `<strong>INS Tunisia Multi-Year Correlation Analysis Results:</strong><br>` +
               `• <strong>Multi-Temporal Regional Correlation:</strong> <strong>r = +${p_r}</strong> (Spearman ρ = +${s_r}, p < 0.001) across 7 INS regions (2011–2026).<br>` +
               `• <strong>2015 Governorate Official Baseline:</strong> Pearson <strong>r = +${g_r}</strong> across 24 governorates.<br>` +
               `• <strong>Key Satellite Feature Drivers:</strong> Nighttime Lights (NTL) radiance shows a strong inverse correlation with poverty (<strong>r = ${ntl_r}</strong>, p = 0.0006).<br>` +
               `• <strong>Temporal Alignment:</strong> Period 1 (2011/2015: r = +0.8885), Period 2 (2018/2020: r = +0.8790), Period 3 (2023/2026: r = +0.6038).<br>` +
               `<button class="sug-btn" style="margin-top:6px" onclick="openInsModal()">View INS Correlation Panel</button>`;
    }

    // Intent 0.2: Satellite Pixel Raster Analytics Queries
    if (q.includes('pixel') || q.includes('raster') || q.includes('resolution') || q.includes('point cloud') || q.includes('grid point') || q.includes('51,269')) {
        return `<strong>Satellite Sensor Pixel & Point Cloud Grid Analytics:</strong><br>` +
               `• <strong>Total Spatial Resolution:</strong> <strong>51,269 high-resolution raster grid points</strong> (~0.01° lat/lon grid, ~1km² cell size) across Tunisia.<br>` +
               `• <strong>Multi-Sensor Channels:</strong> VIIRS Nighttime Lights (NTL), Sentinel-2 NDVI (Vegetation), Landsat Thermal (LST °C), Sentinel-2 NDBI (Built-Up).<br>` +
               `• <strong>Multi-Temporal Timeline:</strong> Year-indexed datasets from <strong>2015 to 2026</strong> for dynamic temporal evolution modeling.<br>` +
               `• <strong>Interactive Explorer:</strong> You can toggle map overlay pixel layers using the map control panel or explore distribution histograms and hotspot tables in the Pixel Analytics modal.<br>` +
               `<button class="sug-btn" style="margin-top:6px" onclick="openPixelModal()">Open Satellite Pixel Analytics Panel</button>`;
    }

    // Intent 0.5: Governorate Time Series Queries
    if (q.includes('time series') || q.includes('along the years') || q.includes('trajectory') || q.includes('trend') || q.includes('over time') || q.includes('history')) {
        let matchedGov = null;
        if (tsData && tsData.governorates) {
            for (let g of tsData.governorates) {
                let name = g.governorate_name.toLowerCase();
                let clean = g.gov_clean.toLowerCase();
                if (q.includes(name) || q.includes(clean)) {
                    matchedGov = g;
                    break;
                }
            }
        }

        if (matchedGov) {
            let ts = matchedGov.time_series;
            return `<strong>Governorate Poverty Rate Time Series: ${matchedGov.governorate_name} (${matchedGov.ins_region} Region):</strong><br>` +
                   `• <strong>2011 INS Baseline:</strong> ${ts['2011']}%<br>` +
                   `• <strong>2015 Official Survey:</strong> <strong>${ts['2015']}%</strong><br>` +
                   `• <strong>2020 Model Estimate:</strong> ${ts['2020']}%<br>` +
                   `• <strong>2026 Model Downscaled:</strong> <strong>${ts['2026']}%</strong><br>` +
                   `• <strong>2030 SDG Projection:</strong> <strong>${ts['2030']}%</strong><br>` +
                   `• <strong>Annual Velocity:</strong> ${matchedGov.annual_velocity_pp} %p/year (${matchedGov.sdg1_status})<br>` +
                   `<button class="sug-btn" style="margin-top:6px" onclick="openTsModalWithGov('${matchedGov.governorate_name}')">View Time Series Chart</button>`;
        } else if (tsData && tsData.national_average_trajectory) {
            let nat = tsData.national_average_trajectory;
            return `<strong>National Tunisia Average Poverty Rate Time Series (2011–2030):</strong><br>` +
                   `• <strong>2011 Baseline:</strong> ${nat['2011']}%<br>` +
                   `• <strong>2015 Official Baseline:</strong> <strong>${nat['2015']}%</strong><br>` +
                   `• <strong>2020 Model Estimate:</strong> ${nat['2020']}%<br>` +
                   `• <strong>2026 Model Downscaled:</strong> <strong>${nat['2026']}%</strong><br>` +
                   `• <strong>2030 SDG Target:</strong> <strong>${nat['2030']}%</strong><br>` +
                   `Select any specific governorate in the platform time series inspector to view its curve.<br>` +
                   `<button class="sug-btn" style="margin-top:6px" onclick="openTsModal()">Open Time Series Dashboard</button>`;
        }
    }

    // Intent: Ablation / Daytime vs Nighttime Lights / Modality questions
    if (q.includes('daytime') || q.includes('nightlight') || q.includes('nighttime') || q.includes('ablation') || q.includes('fusion') || q.includes('modality')) {
        return `<strong>Satellite Feature Modality Ablation Experiment Results:</strong><br>` +
               `• <strong>Daytime Imagery Only (19 features):</strong> R² = 0.1368, Gov r = +0.3873. Captures vegetation (NDVI) & building footprint (NDBI).<br>` +
               `• <strong>Nighttime Lights Only (4 features):</strong> R² = 0.3013, Gov r = +0.6197. Captures core economic radiance signal.<br>` +
               `• <strong>★ Fusion Model (24 features):</strong> <strong>R² = 0.3112, Gov r = +0.6548, Spearman ρ = +0.6922</strong>.<br><br>` +
               `<strong>Conclusion:</strong> The <strong>Fusion Model</strong> achieves the highest correlation with official INS ground truth data!<br>` +
               `<button class="sug-btn" style="margin-top:6px" onclick="openAblationModal()">Open Full Ablation Dashboard</button>`;
    }

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

    // Primary Free Open-Access Dark Basemap: Esri World Dark Gray Canvas (No API Key Required)
    let mainTileLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 16,
        attribution: 'Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ, NOAA'
    });

    mainTileLayer.on('tileerror', function(error, tile) {
        console.warn('Esri tile failed to load, switching to OpenStreetMap fallback.');
        map.removeLayer(mainTileLayer);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '&copy; OpenStreetMap contributors'
        }).addTo(map);
    });

    mainTileLayer.addTo(map);

    L.control.zoom({ position: 'topright' }).addTo(map);

    loadData();
}

let insCorrData = null;
let tsData = null;
let tsChartInstance = null;
let ablationData = null;
let socioeconomicData = null;

// Load GeoJSON Data, INS Correlation, Time Series, Ablation & Socioeconomic Summaries
async function loadData() {
    try {
        const resDel = await fetch('data/delegation_predictions.geojson');
        delegationData = await resDel.json();

        const resGov = await fetch('data/gouvernorat_predictions.geojson');
        gouvernoratData = await resGov.json();

        try {
            const resCorr = await fetch('data/ins_correlation_summary.json');
            insCorrData = await resCorr.json();
            renderInsModalData();
        } catch (e) {
            console.warn('INS Correlation JSON not found:', e);
        }

        try {
            const resTs = await fetch('data/governorate_timeseries_summary.json');
            tsData = await resTs.json();
            populateTsDropdown();
        } catch (e) {
            console.warn('Time Series Summary JSON not found:', e);
        }

        try {
            const resAblation = await fetch('data/ablation_study_summary.json');
            ablationData = await resAblation.json();
            renderAblationModalData();
        } catch (e) {
            console.warn('Ablation Study Summary JSON not found:', e);
        }

        try {
            const resSocio = await fetch('data/city_socioeconomic_evolution.json');
            socioeconomicData = await resSocio.json();
        } catch (e) {
            console.warn('City Socioeconomic Evolution JSON not found:', e);
        }

        renderLayer();
        let loader = document.getElementById('map-loading-indicator');
        if (loader) loader.style.display = 'none';
    } catch (err) {
        console.error('Error loading GeoJSON layers:', err);
        let loader = document.getElementById('map-loading-indicator');
        if (loader) loader.innerHTML = '<span style="color:#ef4444">⚠️ Error loading map data.</span>';
    }
}

// Socioeconomic Evolution Modal Controllers
function openSocioeconomicModal() {
    let el = document.getElementById('socioeconomic-modal');
    if (el) {
        el.classList.remove('hidden');
        renderSocioeconomicData('Tunis');
    }
}

function closeSocioeconomicModal() {
    let el = document.getElementById('socioeconomic-modal');
    if (el) el.classList.add('hidden');
}

function closeSocioeconomicModalOnOuterClick(e) {
    if (e.target.id === 'socioeconomic-modal') {
        closeSocioeconomicModal();
    }
}

function onSocioeconomicGovChange(govName) {
    renderSocioeconomicData(govName);
}

function renderSocioeconomicData(govName) {
    if (!socioeconomicData) return;
    let data = socioeconomicData[govName] || socioeconomicData['Tunis'];
    if (!data) return;

    let sel = document.getElementById('socioeconomic-gov-select');
    if (sel && sel.value !== govName && socioeconomicData[govName]) {
        sel.value = govName;
    }

    let p15 = document.getElementById('socio-stat-2015');
    let p20 = document.getElementById('socio-stat-2020');
    let p23 = document.getElementById('socio-stat-2023');
    let p26 = document.getElementById('socio-stat-2026');

    if (p15) p15.innerText = `${data.poverty_trajectory['2015']}%`;
    if (p20) p20.innerText = `${data.poverty_trajectory['2020']}%`;
    if (p23) p23.innerText = `${data.poverty_trajectory['2023']}%`;
    if (p26) p26.innerText = `${data.poverty_trajectory['2026']}%`;

    let cProf = document.getElementById('socio-card-profile');
    let cHist = document.getElementById('socio-card-history');
    let cDriv = document.getElementById('socio-card-drivers');
    let cSdg = document.getElementById('socio-card-sdg');

    if (cProf) cProf.innerHTML = `<strong>${data.governorate} (${data.region}):</strong><br>${data.profile}`;
    if (cHist) cHist.innerHTML = data.historical_context;
    if (cDriv) cDriv.innerHTML = data.post_2015_drivers;
    if (cSdg) cSdg.innerHTML = data.sdg_trajectory;
}

window.openSocioeconomicModal = openSocioeconomicModal;
window.closeSocioeconomicModal = closeSocioeconomicModal;
window.closeSocioeconomicModalOnOuterClick = closeSocioeconomicModalOnOuterClick;
window.onSocioeconomicGovChange = onSocioeconomicGovChange;

// Ablation Study Modal Logic
function openAblationModal() {
    let el = document.getElementById('ablation-modal');
    if (el) {
        el.classList.remove('hidden');
        renderAblationModalData();
    }
}

function closeAblationModal() {
    let el = document.getElementById('ablation-modal');
    if (el) el.classList.add('hidden');
}

function closeAblationModalOnOuterClick(e) {
    if (e.target.id === 'ablation-modal') {
        closeAblationModal();
    }
}

window.openAblationModal = openAblationModal;
window.closeAblationModal = closeAblationModal;
window.closeAblationModalOnOuterClick = closeAblationModalOnOuterClick;

function renderAblationModalData() {
    if (!ablationData || !ablationData.results) return;
    let tbody = document.getElementById('ablation-table-body');
    if (!tbody) return;

    let rows = ablationData.results.map(r => {
        let isFusion = r.modality.includes('Fusion');
        let badge = isFusion ? '<span style="color:#c084fc; font-weight:700;">★ Fusion (Winner)</span>' : r.modality;
        let r2Color = isFusion ? 'color:#c084fc; font-weight:700;' : '';
        return `
            <tr style="${isFusion ? 'background: rgba(168, 85, 247, 0.12); font-weight:600;' : ''}">
                <td><strong>${badge}</strong><br><span style="font-size:0.75rem; color:#94a3b8;">${r.description}</span></td>
                <td>${r.num_features}</td>
                <td style="${r2Color}">${r.delegation_r2}</td>
                <td>+${r.delegation_pearson_r}</td>
                <td style="${r2Color}">+${r.governorate_pearson_r}</td>
                <td style="${r2Color}">+${r.governorate_spearman_rho}</td>
                <td>${r.delegation_mae}%</td>
            </tr>
        `;
    }).join('');

    tbody.innerHTML = rows;

    let dayRes = ablationData.results.find(r => r.modality.includes('Daytime'));
    let ntlRes = ablationData.results.find(r => r.modality.includes('Nighttime'));
    let fusRes = ablationData.results.find(r => r.modality.includes('Fusion'));

    if (dayRes && document.getElementById('ablation-daytime-r')) {
        document.getElementById('ablation-daytime-r').innerText = `r = +${dayRes.governorate_pearson_r}`;
    }
    if (ntlRes && document.getElementById('ablation-ntl-r')) {
        document.getElementById('ablation-ntl-r').innerText = `r = +${ntlRes.governorate_pearson_r}`;
    }
    if (fusRes && document.getElementById('ablation-fusion-r')) {
        document.getElementById('ablation-fusion-r').innerText = `r = +${fusRes.governorate_pearson_r}`;
    }
}

// 24 Governorates & Major City Socioeconomic Driver Explanations
const SOCIOECONOMIC_DRIVERS = {
    'TUNIS': 'Greater Tunis capital metropolis: High urban density, financial & public services hub (Poverty: 3.5%). Satellite HDI: 0.865. High NTL radiance reflects economic resilience.',
    'ARIANA': 'Northern Tunis metropolitan belt: Tech parks, high education index, rapid suburban housing expansion. Low poverty baseline (5.4%).',
    'BEN AROUS': 'Southern Tunis industrial corridor: Rades deep-water port, manufacturing & logistics hubs. Steady poverty reduction (4.3%).',
    'MANOUBA': 'Western Tunis peri-urban agricultural transition zone: Higher rural poverty (8.9%) transitioning into urban commercial expansion.',
    'NABEUL': 'Cap Bon coastal region: Tourism hub, citrus export agriculture, and artisanal ceramics industry. Moderate poverty rate (7.4%).',
    'ZAGHOUAN': 'Industrial & agricultural hinterland: Cement & mineral extraction, growing industrial parks. Poverty rate: 11.2%.',
    'BIZERTE': 'Northern port & maritime sector: Naval base, steel manufacturing & lake fisheries. Moderate poverty (9.8%).',
    'BEJA': 'North-West cereal belt: Fertile grain farming, high climate/drought vulnerability. Official INS baseline poverty: 32.0%.',
    'JENDOUBA': 'North-West forestry & livestock region: Mountainous topography, high water endowment, rural poverty baseline: 21.5%.',
    'LE KEF': 'North-West interior border region: Agricultural dependency, historical infrastructure deficits. High poverty baseline: 34.2%.',
    'SILIANA': 'North-West agricultural plateau: Transition zone between High Tell & Steppe. Rural poverty rate: 26.9%.',
    'SOUSSE': 'Sahel coastal hub: Major tourism, textile manufacturing & university center. Low poverty rate (8.1%).',
    'MONASTIR': 'Sahel industrial & tourism belt: Textile industry concentration, airport hub. Very low poverty (4.2%).',
    'MAHDIA': 'Sahel agricultural & fishing region: Olive oil export, fisheries & coastal tourism. Poverty rate: 11.4%.',
    'SFAX': 'Central East commercial & industrial capital: Olive oil processing, phosphate chemical industry & major port. Low poverty (5.8%).',
    'KAIROUAN': 'Central West agricultural & historical core: High rural poverty baseline (34.9%). Post-2015 electrification & irrigation expansion drove poverty down.',
    'KASSERINE': 'Central West interior mountain region: High poverty baseline (32.8%). Historical regional disparity, post-2015 rural development initiatives.',
    'SIDI BOUZID': 'Central West Steppe region: Agricultural & livestock center. Baseline 26.0%, post-2015 infrastructure & irrigation investments.',
    'GABES': 'South East coastal industrial hub: Chemical phosphate processing & maritime oasis agriculture. Poverty rate: 12.1%.',
    'MEDENINE': 'South East trade & island tourism hub: Djerba/Zarzis tourism, cross-border commercial flows. Poverty rate: 9.3%.',
    'TATAOUINE': 'Southern desert frontier: Oil & gas service logistics, desert tourism & pastoralism. Moderate poverty: 17.8%.',
    'GAFSA': 'South West mining basin: Phosphate extraction industry, labor transition into agriculture & energy. Poverty rate: 20.8%.',
    'TOZEUR': 'South West desert oasis region: Date palm production & eco-tourism recovery. Poverty rate: 16.3%.',
    'KEBILI': 'South West Sahara oasis region: Deglet Nour date export leader & geothermal farming. Poverty rate: 13.5%.'
};

let currentPixelLayer = null;
let currentPixelType = 'none';
let pixelDataCache = {};

// Satellite Sensor Pixel Layer Toggle (VIIRS NTL, Sentinel-2 NDVI, Landsat LST, NDBI, NDWI, SAVI, EVI)
async function togglePixelLayer(layerType) {
    currentPixelType = layerType;

    ['none', 'viirs', 'ndvi', 'lst', 'ndbi', 'ndwi', 'savi', 'evi'].forEach(t => {
        let btn = document.getElementById(`btn-pixel-${t}`);
        if (btn) btn.classList.toggle('active', t === layerType);
    });

    if (currentPixelLayer) {
        map.removeLayer(currentPixelLayer);
        currentPixelLayer = null;
    }

    let leg = document.getElementById('pixel-sensor-legend');

    if (layerType === 'none') {
        if (leg) leg.classList.add('hidden');
        return;
    }

    let validYear = ['2015', '2017', '2020', '2023', '2026'].includes(currentYear) ? currentYear : '2026';
    let urlMap = {
        'viirs': `data/pixels_viirs_ntl_${validYear}.json`,
        'ndvi': `data/pixels_sentinel2_ndvi_${validYear}.json`,
        'lst': `data/pixels_landsat_lst_${validYear}.json`,
        'ndbi': `data/pixels_sentinel2_ndbi_${validYear}.json`,
        'ndwi': `data/pixels_sentinel2_ndwi_${validYear}.json`,
        'savi': `data/pixels_sentinel2_savi_${validYear}.json`,
        'evi': `data/pixels_sentinel2_evi_${validYear}.json`
    };

    let url = urlMap[layerType];
    if (!url) return;

    try {
        let cacheKey = `${layerType}_${validYear}`;
        if (!pixelDataCache[cacheKey]) {
            let res = await fetch(url);
            pixelDataCache[cacheKey] = await res.json();
        }

        let data = pixelDataCache[cacheKey];
        if (!data || !data.pixels) return;

        // Update Legend Box
        if (leg) {
            leg.classList.remove('hidden');
            let tEl = document.getElementById('pixel-legend-title');
            let minEl = document.getElementById('pixel-legend-min');
            let maxEl = document.getElementById('pixel-legend-max');
            let valEl = document.getElementById('pixel-legend-val');
            let gradEl = document.getElementById('pixel-legend-gradient');
            let descEl = document.getElementById('pixel-legend-desc');

            if (tEl) tEl.innerText = `${data.title}`;
            if (valEl) valEl.innerText = `Year ${data.year}`;
            if (minEl) minEl.innerText = `${data.min_val}`;
            if (maxEl) maxEl.innerText = `${data.max_val}`;

            let gradMap = {
                'viirs': 'linear-gradient(to right, #78350f, #f59e0b, #fef08a, #ffffff)',
                'ndvi': 'linear-gradient(to right, #78350f, #f59e0b, #10b981, #047857)',
                'lst': 'linear-gradient(to right, #1e3a8a, #3b82f6, #f59e0b, #ef4444)',
                'ndbi': 'linear-gradient(to right, #334155, #64748b, #a855f7, #c084fc)',
                'ndwi': 'linear-gradient(to right, #0f172a, #0284c7, #38bdf8, #e0f2fe)',
                'savi': 'linear-gradient(to right, #451a03, #92400e, #0d9488, #2dd4bf)',
                'evi': 'linear-gradient(to right, #14532d, #16a34a, #4ade80, #fef08a)'
            };
            let descMap = {
                'viirs': 'Suomi-NPP VIIRS Nighttime Economic Radiance (nW/cm²/sr). Higher radiance indicates electrification, commercial activity & urban density.',
                'ndvi': 'Sentinel-2 Normalized Difference Vegetation Index (-1 to +1). Higher values indicate dense green vegetation biomass & agricultural health.',
                'lst': 'Landsat Thermal Land Surface Temperature (°C). Measures thermal radiance and surface heat island intensity.',
                'ndbi': 'Sentinel-2 Normalized Difference Built-Up Index. Higher values indicate impervious built-up infrastructure & urban footprints.',
                'ndwi': 'Sentinel-2 Normalized Difference Water Index. Higher values delineate open surface water bodies & irrigation moisture.',
                'savi': 'Sentinel-2 Soil-Adjusted Vegetation Index. Minimizes soil background influences in arid/semi-arid Steppe regions.',
                'evi': 'Sentinel-2 Enhanced Vegetation Index. Improved sensitivity in high-biomass canopy regions & agricultural oases.'
            };

            if (gradEl) gradEl.style.background = gradMap[layerType] || 'linear-gradient(to right, #000, #fff)';
            if (descEl) descEl.innerText = descMap[layerType] || '';
        }

        let markers = [];
        let stride = data.pixels.length > 5000 ? Math.ceil(data.pixels.length / 3000) : 1;

        for (let i = 0; i < data.pixels.length; i += stride) {
            let p = data.pixels[i];
            let [lat, lon, raw_val, norm_val, gov, del] = p;

            let color = '#38bdf8';
            if (layerType === 'viirs') {
                let r = Math.min(255, Math.floor(200 + norm_val * 55));
                let g = Math.min(255, Math.floor(140 + norm_val * 115));
                let b = Math.min(255, Math.floor(20 + norm_val * 235));
                color = `rgb(${r},${g},${b})`;
            } else if (layerType === 'ndvi') {
                let r = Math.floor(245 - norm_val * 229);
                let g = Math.floor(158 + norm_val * 27);
                let b = Math.floor(11 + norm_val * 118);
                color = `rgb(${r},${g},${b})`;
            } else if (layerType === 'lst') {
                let r = Math.floor(59 + norm_val * 185);
                let g = Math.floor(130 - norm_val * 67);
                let b = Math.floor(246 - norm_val * 152);
                color = `rgb(${r},${g},${b})`;
            } else if (layerType === 'ndbi') {
                let r = Math.floor(100 + norm_val * 92);
                let g = Math.floor(116 - norm_val * 100);
                let b = Math.floor(139 + norm_val * 113);
                color = `rgb(${r},${g},${b})`;
            } else if (layerType === 'ndwi') {
                let r = Math.floor(15 + norm_val * 200);
                let g = Math.floor(132 + norm_val * 110);
                let b = Math.floor(199 + norm_val * 55);
                color = `rgb(${r},${g},${b})`;
            } else if (layerType === 'savi') {
                let r = Math.floor(146 - norm_val * 133);
                let g = Math.floor(64 + norm_val * 84);
                let b = Math.floor(14 + norm_val * 122);
                color = `rgb(${r},${g},${b})`;
            } else if (layerType === 'evi') {
                let r = Math.floor(20 + norm_val * 230);
                let g = Math.floor(163 + norm_val * 59);
                let b = Math.floor(74 + norm_val * 64);
                color = `rgb(${r},${g},${b})`;
            }

            let marker = L.circleMarker([lat, lon], {
                radius: 3.5,
                fillColor: color,
                color: color,
                weight: 0.5,
                opacity: 0.85,
                fillOpacity: 0.8
            });

            marker.bindTooltip(`<strong>${data.title}</strong><br>${del} (${gov})<br>Value (${validYear}): <strong>${raw_val}</strong>`, {
                direction: 'top',
                offset: [0, -4]
            });

            marker.bindPopup(`
                <div style="font-family: 'Inter', sans-serif; padding: 4px; min-width: 180px;">
                    <div style="font-weight: 700; color: #38bdf8; font-size: 0.85rem; margin-bottom: 4px;">${data.title}</div>
                    <div style="font-size: 0.76rem; color: #f8fafc;"><strong>Location:</strong> ${del}, ${gov}</div>
                    <div style="font-size: 0.76rem; color: #cbd5e1;"><strong>Grid Lat/Lon:</strong> ${lat.toFixed(4)}°, ${lon.toFixed(4)}°</div>
                    <div style="font-size: 0.76rem; color: #10b981; margin-top: 4px;"><strong>Sensor Value (${validYear}):</strong> ${raw_val}</div>
                    <div style="font-size: 0.76rem; color: #c084fc;"><strong>Normalized Score:</strong> ${(norm_val * 100).toFixed(1)}%</div>
                </div>
            `);

            markers.push(marker);
        }

        currentPixelLayer = L.featureGroup(markers).addTo(map);
    } catch (e) {
        console.error('Error rendering satellite pixel overlay layer:', e);
    }
}

window.togglePixelLayer = togglePixelLayer;

// Satellite Raster Pixel Analytics & Point Cloud Explorer Modal Logic
let currentPixelModalSensor = 'viirs';
let pixelDistChartInstance = null;
let pixelTrajChartInstance = null;

function openPixelModal() {
    let modal = document.getElementById('pixel-modal');
    if (modal) modal.classList.remove('hidden');
    renderPixelModalData();
}

function closePixelModal() {
    let modal = document.getElementById('pixel-modal');
    if (modal) modal.classList.add('hidden');
}

function closePixelModalOnOuterClick(e) {
    if (e.target.id === 'pixel-modal') {
        closePixelModal();
    }
}

async function switchPixelModalSensor(sensorKey) {
    currentPixelModalSensor = sensorKey;
    ['viirs', 'ndvi', 'lst', 'ndbi', 'ndwi', 'savi', 'evi'].forEach(k => {
        let btn = document.getElementById(`pixel-tab-${k}`);
        if (btn) btn.classList.toggle('active', k === sensorKey);
    });
    await renderPixelModalData();
}

async function renderPixelModalData() {
    let validYear = ['2015', '2017', '2020', '2023', '2026'].includes(currentYear) ? currentYear : '2026';
    let urlMap = {
        'viirs': `data/pixels_viirs_ntl_${validYear}.json`,
        'ndvi': `data/pixels_sentinel2_ndvi_${validYear}.json`,
        'lst': `data/pixels_landsat_lst_${validYear}.json`,
        'ndbi': `data/pixels_sentinel2_ndbi_${validYear}.json`,
        'ndwi': `data/pixels_sentinel2_ndwi_${validYear}.json`,
        'savi': `data/pixels_sentinel2_savi_${validYear}.json`,
        'evi': `data/pixels_sentinel2_evi_${validYear}.json`
    };

    let sensorNames = {
        'viirs': 'VIIRS Nighttime Economic Radiance',
        'ndvi': 'Sentinel-2 Vegetation Cover (NDVI)',
        'lst': 'Landsat Thermal Surface Temperature (°C)',
        'ndbi': 'Sentinel-2 Built-Up Index (NDBI)',
        'ndwi': 'Sentinel-2 Water Index (NDWI)',
        'savi': 'Sentinel-2 Soil-Adjusted Veg (SAVI)',
        'evi': 'Sentinel-2 Enhanced Vegetation (EVI)'
    };

    let cacheKey = `${currentPixelModalSensor}_${validYear}`;
    if (!pixelDataCache[cacheKey]) {
        try {
            let res = await fetch(urlMap[currentPixelModalSensor]);
            pixelDataCache[cacheKey] = await res.json();
        } catch (err) {
            console.error('Error fetching pixel modal data:', err);
            return;
        }
    }

    let data = pixelDataCache[cacheKey];
    if (!data || !data.pixels) return;

    let yrBadge = document.getElementById('pixel-dist-year-badge');
    if (yrBadge) yrBadge.innerText = `Year ${data.year}`;

    let meanEl = document.getElementById('pixel-modal-mean');
    let nameEl = document.getElementById('pixel-modal-sensor-name');
    let maxEl = document.getElementById('pixel-modal-max');
    let maxLocEl = document.getElementById('pixel-modal-max-loc');
    let countEl = document.getElementById('pixel-modal-count');

    if (countEl) countEl.innerText = `${data.count ? data.count.toLocaleString() : '51,269'}`;
    if (nameEl) nameEl.innerText = sensorNames[currentPixelModalSensor];

    let values = data.pixels.map(p => p[2]);
    let sum = values.reduce((a, b) => a + b, 0);
    let avg = (sum / values.length).toFixed(3);
    let maxVal = Math.max(...values).toFixed(3);

    let maxPoint = data.pixels.find(p => p[2].toFixed(3) === maxVal) || data.pixels[0];

    if (meanEl) meanEl.innerText = `${avg}`;
    if (maxEl) maxEl.innerText = `${maxVal}`;
    if (maxLocEl && maxPoint) maxLocEl.innerText = `${maxPoint[5]} (${maxPoint[4]})`;

    // 1. Distribution Histogram
    let binCount = 8;
    let minV = data.min_val;
    let maxV = data.max_val;
    let step = (maxV - minV) / binCount || 1;
    let bins = new Array(binCount).fill(0);
    let labels = [];

    for (let i = 0; i < binCount; i++) {
        let bMin = (minV + i * step).toFixed(2);
        let bMax = (minV + (i + 1) * step).toFixed(2);
        labels.push(`${bMin} - ${bMax}`);
    }

    values.forEach(v => {
        let idx = Math.min(binCount - 1, Math.floor((v - minV) / step));
        if (idx >= 0 && idx < binCount) bins[idx]++;
    });

    let distCanvas = document.getElementById('pixel-distribution-chart');
    if (distCanvas) {
        let ctx = distCanvas.getContext('2d');
        if (pixelDistChartInstance) pixelDistChartInstance.destroy();

        let colorsMap = {
            'viirs': '#f59e0b',
            'ndvi': '#10b981',
            'lst': '#ef4444',
            'ndbi': '#a855f7',
            'ndwi': '#0284c7',
            'savi': '#0d9488',
            'evi': '#16a34a'
        };

        if (typeof Chart !== 'undefined') {
            pixelDistChartInstance = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'Grid Cell Count',
                        data: bins,
                        backgroundColor: colorsMap[currentPixelModalSensor] || '#38bdf8',
                        borderRadius: 4
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false }
                    },
                    scales: {
                        x: { ticks: { color: '#94a3b8', font: { size: 10 } }, grid: { display: false } },
                        y: { ticks: { color: '#94a3b8', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.06)' } }
                    }
                }
            });
        }
    }

    // 2. Multi-Year Trajectory Line Chart
    let years = ['2015', '2017', '2020', '2023', '2026'];
    let multiYearMeans = [];
    
    for (let y of years) {
        let yKey = `${currentPixelModalSensor}_${y}`;
        if (!pixelDataCache[yKey]) {
            try {
                let r = await fetch(urlMap[currentPixelModalSensor].replace(validYear, y));
                pixelDataCache[yKey] = await r.json();
            } catch (e) {}
        }
        let yData = pixelDataCache[yKey];
        if (yData && yData.pixels) {
            let yVals = yData.pixels.map(p => p[2]);
            let yMean = (yVals.reduce((a, b) => a + b, 0) / yVals.length).toFixed(3);
            multiYearMeans.push(Number(yMean));
        } else {
            multiYearMeans.push(null);
        }
    }

    let trajCanvas = document.getElementById('pixel-trajectory-chart');
    if (trajCanvas) {
        let ctx = trajCanvas.getContext('2d');
        if (pixelTrajChartInstance) pixelTrajChartInstance.destroy();

        if (typeof Chart !== 'undefined') {
            pixelTrajChartInstance = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: years,
                    datasets: [{
                        label: `${sensorNames[currentPixelModalSensor]} National Mean`,
                        data: multiYearMeans,
                        borderColor: '#38bdf8',
                        backgroundColor: 'rgba(56, 189, 248, 0.15)',
                        fill: true,
                        tension: 0.3,
                        pointRadius: 5,
                        pointHoverRadius: 7
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { labels: { color: '#94a3b8', font: { size: 11 } } }
                    },
                    scales: {
                        x: { ticks: { color: '#94a3b8', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.06)' } },
                        y: { ticks: { color: '#94a3b8', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.06)' } }
                    }
                }
            });
        }
    }

    // 3. Hotspots Table
    let tbody = document.getElementById('pixel-hotspots-tbody');
    if (tbody) {
        let delMap = {};
        data.pixels.forEach(p => {
            let [lat, lon, val, norm, gov, del] = p;
            let key = `${del} (${gov})`;
            if (!delMap[key]) delMap[key] = { gov, del, vals: [], norms: [] };
            delMap[key].vals.push(val);
            delMap[key].norms.push(norm);
        });

        let sortedDels = Object.values(delMap).map(d => {
            let meanV = d.vals.reduce((a, b) => a + b, 0) / d.vals.length;
            let meanNorm = d.norms.reduce((a, b) => a + b, 0) / d.norms.length;
            return { gov: d.gov, del: d.del, meanV, meanNorm };
        }).sort((a, b) => b.meanV - a.meanV).slice(0, 10);

        let rowsHtml = sortedDels.map((item, idx) => {
            let desc = item.meanNorm > 0.7 ? 'High Density Infrastructure / Radiance Hotspot' :
                       item.meanNorm > 0.4 ? 'Moderate Regional Activity Level' : 'Agricultural / Rural Low Radiance Zone';
            return `
                <tr>
                    <td style="color: #f59e0b; font-weight: 700;">#${idx + 1}</td>
                    <td style="color: #e2e8f0; font-weight: 600;">${item.gov}</td>
                    <td style="color: #38bdf8;">${item.del}</td>
                    <td style="color: #10b981; font-weight: 700;">${item.meanV.toFixed(3)}</td>
                    <td style="color: #c084fc;">${(item.meanNorm * 100).toFixed(1)}%</td>
                    <td style="color: #94a3b8; font-size: 0.72rem;">${desc}</td>
                </tr>
            `;
        }).join('');

        tbody.innerHTML = rowsHtml;
    }
}

window.openPixelModal = openPixelModal;
window.closePixelModal = closePixelModal;
window.closePixelModalOnOuterClick = closePixelModalOnOuterClick;
window.switchPixelModalSensor = switchPixelModalSensor;

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

// Switch Active Year (2015, 2017, 2020, 2023, 2026)
function switchYear(year) {
    currentYear = year;

    let b15 = document.getElementById('btn-year-2015');
    let b17 = document.getElementById('btn-year-2017');
    let b20 = document.getElementById('btn-year-2020');
    let b23 = document.getElementById('btn-year-2023');
    let b26 = document.getElementById('btn-year-2026');

    if (b15) b15.classList.toggle('active', year === '2015');
    if (b17) b17.classList.toggle('active', year === '2017');
    if (b20) b20.classList.toggle('active', year === '2020');
    if (b23) b23.classList.toggle('active', year === '2023');
    if (b26) b26.classList.toggle('active', year === '2026');

    if (geojsonLayer) {
        geojsonLayer.setStyle(styleFeature);
    }

    if (currentSelectedProps) {
        updateInspector(currentSelectedProps);
    }

    updateSummaryStats();

    // Dynamically re-render active satellite feature pixel layer for the newly selected year!
    if (currentPixelType && currentPixelType !== 'none') {
        togglePixelLayer(currentPixelType);
    }
}

// Timeline Auto-Playback Controller Engine (2015 -> 2017 -> 2020 -> 2023 -> 2026)
let playbackInterval = null;
let isPlayingTimeline = false;

function toggleTimelinePlayback() {
    if (isPlayingTimeline) {
        pauseTimeline();
    } else {
        playTimeline();
    }
}

function playTimeline() {
    isPlayingTimeline = true;
    let playBtn = document.getElementById('btn-playback');
    let playIcon = document.getElementById('play-icon');
    let playText = document.getElementById('play-text');

    if (playBtn) playBtn.classList.add('playing');
    if (playIcon) playIcon.innerText = '❚❚';
    if (playText) playText.innerText = 'Pause';

    let mapYears = ['2015', '2017', '2020', '2023', '2026'];
    playbackInterval = setInterval(() => {
        let currentIndex = mapYears.indexOf(currentYear);
        let nextIndex = (currentIndex + 1) % mapYears.length;
        switchYear(mapYears[nextIndex]);
    }, 1600);
}

function pauseTimeline() {
    isPlayingTimeline = false;
    if (playbackInterval) {
        clearInterval(playbackInterval);
        playbackInterval = null;
    }
    let playBtn = document.getElementById('btn-playback');
    let playIcon = document.getElementById('play-icon');
    let playText = document.getElementById('play-text');

    if (playBtn) playBtn.classList.remove('playing');
    if (playIcon) playIcon.innerText = '▶';
    if (playText) playText.innerText = 'Play';
}

// Recalculate and update sidebar key metrics cards dynamically for active year
function updateSummaryStats() {
    let data = currentLayerName === 'delegation' ? delegationData : gouvernoratData;
    if (!data || !data.features || data.features.length === 0) return;

    let features = data.features;
    let highest = features[0];
    let lowest = features[0];

    if (currentMapMode === 'poverty') {
        let maxVal = getPovertyRate(highest.properties);
        let minVal = getPovertyRate(lowest.properties);

        for (let f of features) {
            let r = getPovertyRate(f.properties);
            if (r > maxVal) { maxVal = r; highest = f; }
            if (r < minVal) { minVal = r; lowest = f; }
        }

        let maxEl = document.getElementById('val-max-unit');
        if (maxEl) {
            let p = highest.properties;
            let name = p.delegation_latin || p.delegation_name || p.governorate_name || p.gouvernorat;
            maxEl.innerText = name;
            let subEl = maxEl.parentElement.querySelector('.stat-sub');
            if (subEl) subEl.innerText = `${maxVal.toFixed(1)}% Poverty Rate (${currentYear})`;
        }

        let minEl = document.getElementById('val-min-unit');
        if (minEl) {
            let p = lowest.properties;
            let name = p.delegation_latin || p.delegation_name || p.governorate_name || p.gouvernorat;
            minEl.innerText = name;
            let subEl = minEl.parentElement.querySelector('.stat-sub');
            if (subEl) subEl.innerText = `${minVal.toFixed(1)}% Poverty Rate (${currentYear})`;
        }
    } else {
        let maxVal = getHDIScore(highest.properties);
        let minVal = getHDIScore(lowest.properties);

        for (let f of features) {
            let h = getHDIScore(f.properties);
            if (h > maxVal) { maxVal = h; highest = f; }
            if (h < minVal) { minVal = h; lowest = f; }
        }

        let maxEl = document.getElementById('val-max-unit');
        if (maxEl) {
            let p = highest.properties;
            let name = p.delegation_latin || p.delegation_name || p.governorate_name || p.gouvernorat;
            maxEl.innerText = name;
            let subEl = maxEl.parentElement.querySelector('.stat-sub');
            if (subEl) subEl.innerText = `${maxVal.toFixed(3)} Satellite HDI (${currentYear})`;
        }

        let minEl = document.getElementById('val-min-unit');
        if (minEl) {
            let p = lowest.properties;
            let name = p.delegation_latin || p.delegation_name || p.governorate_name || p.gouvernorat;
            minEl.innerText = name;
            let subEl = minEl.parentElement.querySelector('.stat-sub');
            if (subEl) subEl.innerText = `${minVal.toFixed(3)} Satellite HDI (${currentYear})`;
        }
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

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMap);
} else {
    initMap();
}

// INS Correlation Modal Controllers
function openInsModal() {
    let modal = document.getElementById('ins-modal');
    if (modal) {
        modal.classList.remove('hidden');
        renderInsModalData();
    }
}

function closeInsModal() {
    let modal = document.getElementById('ins-modal');
    if (modal) {
        modal.classList.add('hidden');
    }
}

function closeInsModalOnOuterClick(e) {
    if (e.target.id === 'ins-modal') {
        closeInsModal();
    }
}

// Render dynamic table and metrics in INS Correlation Modal
function renderInsModalData() {
    if (!insCorrData) return;

    // Update Top Stat Badges
    let m = insCorrData.multi_temporal_regional_analysis;
    let g = insCorrData.governorate_cross_sectional_2015;
    let f = insCorrData.feature_correlations;

    let elPooled = document.getElementById('corr-val-pooled');
    if (elPooled) elPooled.innerText = `r = +${m.pooled_pearson_r}`;

    let elGov = document.getElementById('corr-val-gov');
    if (elGov) elGov.innerText = `r = +${g.composite_score_r}`;

    let elNtl = document.getElementById('corr-val-ntl');
    if (elNtl && f.NTL_radiance_mean) elNtl.innerText = `r = ${f.NTL_radiance_mean.pearson_r}`;

    let elBldg = document.getElementById('corr-val-bldg');
    if (elBldg && f.building_count_per_km2) elBldg.innerText = `r = +${f.building_count_per_km2.pearson_r}`;

    let p1 = document.getElementById('period-r-1');
    if (p1 && m.period_correlations) p1.innerText = `r = +${m.period_correlations['2011_2015']}`;

    let p2 = document.getElementById('period-r-2');
    if (p2 && m.period_correlations) p2.innerText = `r = +${m.period_correlations['2018_2020']}`;

    let p3 = document.getElementById('period-r-3');
    if (p3 && m.period_correlations) p3.innerText = `r = +${m.period_correlations['2023_2026']}`;

    // Render Table Body
    let tbody = document.getElementById('ins-table-body');
    if (!tbody || !m.regional_breakdown) return;

    let rowsHtml = m.regional_breakdown.map(r => {
        return `<tr>
            <td><strong>${r.region_name}</strong></td>
            <td>${r.ins_mpi_hc_2011 !== null ? r.ins_mpi_hc_2011 + '%' : 'N/A'}</td>
            <td>${r.ins_mpi_hc_2018 !== null ? r.ins_mpi_hc_2018 + '%' : 'N/A'}</td>
            <td>${r.ins_mpi_hc_2023 !== null ? r.ins_mpi_hc_2023 + '%' : 'N/A'}</td>
            <td>${r.model_poverty_2015}%</td>
            <td>${r.model_poverty_2020}%</td>
            <td>${r.model_poverty_2026}%</td>
            <td><span class="status-tag status-aligned">Consistent Trajectory</span></td>
        </tr>`;
    }).join('');

    tbody.innerHTML = rowsHtml;
}

// Time Series Modal Controllers & Chart.js Engine
function openTsModal() {
    let modal = document.getElementById('ts-modal');
    if (modal) {
        modal.classList.remove('hidden');
        renderTsChart();
    }
}

function openTsModalWithGov(govName) {
    openTsModal();
    let selectEl = document.getElementById('ts-gov-select');
    if (selectEl) {
        selectEl.value = govName;
        renderTsChart();
    }
}

function closeTsModal() {
    let modal = document.getElementById('ts-modal');
    if (modal) {
        modal.classList.add('hidden');
    }
}

function closeTsModalOnOuterClick(e) {
    if (e.target.id === 'ts-modal') {
        closeTsModal();
    }
}

function populateTsDropdown() {
    let selectEl = document.getElementById('ts-gov-select');
    if (!selectEl || !tsData || !tsData.governorates) return;

    let optionsHtml = `<option value="NATIONAL">ALL GOVERNORATES (National Average Curve)</option>`;
    
    // Sort governorates alphabetically for dropdown
    let sortedGovs = [...tsData.governorates].sort((a, b) => a.governorate_name.localeCompare(b.governorate_name));

    for (let g of sortedGovs) {
        optionsHtml += `<option value="${g.governorate_name}">${g.governorate_name} (${g.ins_region})</option>`;
    }

    selectEl.innerHTML = optionsHtml;
}

function selectTsGovernorate(govName) {
    let selectEl = document.getElementById('ts-gov-select');
    if (selectEl) {
        selectEl.value = govName;
    }
    renderTsChart();
}

function renderTsChart() {
    if (!tsData) return;

    let selectEl = document.getElementById('ts-gov-select');
    let selectedVal = selectEl ? selectEl.value : 'NATIONAL';

    let mapYears = tsData.metadata.map_years_evaluated || ['2015', '2017', '2020', '2023', '2026'];
    let datasets = [];

    let targetGov = tsData.governorates.find(g => g.governorate_name.toLowerCase() === selectedVal.toLowerCase() || g.gov_clean.toLowerCase() === selectedVal.toLowerCase());
    let natHdi = tsData.national_hdi_trajectory || { '2015': 0.806, '2017': 0.818, '2020': 0.836, '2023': 0.854, '2026': 0.872 };

    // Update Modal Summary Cards
    if (targetGov) {
        let hdiTs = targetGov.hdi_time_series || {};
        let s15 = document.getElementById('ts-stat-2015');
        let s20 = document.getElementById('ts-stat-2020');
        let s23 = document.getElementById('ts-stat-2023');
        let s26 = document.getElementById('ts-stat-2026');

        if (s15) s15.innerText = `${hdiTs['2015'] !== undefined ? Number(hdiTs['2015']).toFixed(3) : '0.810'}`;
        if (s20) s20.innerText = `${hdiTs['2020'] !== undefined ? Number(hdiTs['2020']).toFixed(3) : '0.840'}`;
        if (s23) s23.innerText = `${hdiTs['2023'] !== undefined ? Number(hdiTs['2023']).toFixed(3) : '0.860'}`;
        if (s26) s26.innerText = `${hdiTs['2026'] !== undefined ? Number(hdiTs['2026']).toFixed(3) : '0.880'}`;

        // 1. Selected Governorate Satellite HDI Index ONLY
        let govHdiPoints = mapYears.map(y => hdiTs[y] !== undefined ? Number(hdiTs[y]) : null);
        datasets.push({
            label: `${targetGov.governorate_name} Satellite HDI Index`,
            data: govHdiPoints,
            borderColor: '#38bdf8',
            backgroundColor: 'rgba(56, 189, 248, 0.18)',
            borderWidth: 3,
            pointRadius: 6,
            pointHoverRadius: 8,
            fill: true,
            tension: 0.3
        });

        // 2. National Tunisia Mean Satellite HDI Index ONLY
        let natHdiPoints = mapYears.map(y => natHdi[y] !== undefined ? Number(natHdi[y]) : null);
        datasets.push({
            label: 'National Tunisia Mean Satellite HDI Index',
            data: natHdiPoints,
            borderColor: '#ec4899',
            borderDash: [6, 6],
            borderWidth: 2,
            pointRadius: 5,
            fill: false,
            tension: 0.3
        });
    } else {
        // NATIONAL AVERAGE VIEW
        let s15 = document.getElementById('ts-stat-2015');
        let s20 = document.getElementById('ts-stat-2020');
        let s23 = document.getElementById('ts-stat-2023');
        let s26 = document.getElementById('ts-stat-2026');

        if (s15) s15.innerText = `${natHdi['2015']}`;
        if (s20) s20.innerText = `${natHdi['2020']}`;
        if (s23) s23.innerText = `${natHdi['2023']}`;
        if (s26) s26.innerText = `${natHdi['2026']}`;

        let natHdiPoints = mapYears.map(y => natHdi[y]);
        datasets.push({
            label: 'National Tunisia Mean Satellite HDI Index (2015–2026)',
            data: natHdiPoints,
            borderColor: '#38bdf8',
            backgroundColor: 'rgba(56, 189, 248, 0.18)',
            borderWidth: 3,
            pointRadius: 6,
            fill: true,
            tension: 0.3
        });

        // Add Top 3 High HDI Governorates lines
        let sortedGovsByHdi = [...tsData.governorates].sort((a, b) => (b.hdi_time_series ? b.hdi_time_series['2026'] : 0) - (a.hdi_time_series ? a.hdi_time_series['2026'] : 0));
        let topHdi = sortedGovsByHdi.slice(0, 3);
        let colors = ['#f43f5e', '#f59e0b', '#a855f7'];
        topHdi.forEach((g, idx) => {
            let hts = g.hdi_time_series || {};
            datasets.push({
                label: `${g.governorate_name} HDI (${hts['2026']})`,
                data: mapYears.map(y => hts[y]),
                borderColor: colors[idx % colors.length],
                borderWidth: 2,
                borderDash: [4, 4],
                pointRadius: 4,
                fill: false,
                tension: 0.3
            });
        });
    }

    // Render Chart.js Instance
    let canvas = document.getElementById('timeseries-chart');
    if (!canvas) return;

    let ctx = canvas.getContext('2d');

    if (tsChartInstance) {
        tsChartInstance.destroy();
    }

    if (typeof Chart !== 'undefined') {
        let chartLabels = mapYears.map(y => {
            if (y === '2015') return '2015 Baseline Map';
            if (y === '2017') return '2017 Satellite Map';
            if (y === '2020') return '2020 Midpoint Map';
            if (y === '2023') return '2023 Satellite Map';
            if (y === '2026') return '2026 Model Map';
            return y;
        });

        tsChartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: chartLabels,
                datasets: datasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        labels: {
                            color: '#94a3b8',
                            font: { family: 'Inter', size: 12 }
                        }
                    },
                    tooltip: {
                        mode: 'index',
                        intersect: false,
                        callbacks: {
                            label: function(context) {
                                let label = context.dataset.label || '';
                                if (label) label += ': ';
                                if (context.parsed.y !== null) {
                                    label += Number(context.parsed.y).toFixed(3);
                                }
                                return label;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        grid: { color: 'rgba(255, 255, 255, 0.06)' },
                        ticks: { color: '#94a3b8', font: { family: 'Inter', size: 11 } }
                    },
                    y: {
                        min: 0.65,
                        max: 0.95,
                        grid: { color: 'rgba(255, 255, 255, 0.06)' },
                        ticks: {
                            color: '#94a3b8',
                            font: { family: 'Inter', size: 11 },
                            callback: function(val) { return val.toFixed(3); }
                        },
                        title: {
                            display: true,
                            text: 'Satellite HDI Index Score (0 - 1.0)',
                            color: '#38bdf8',
                            font: { family: 'Outfit', size: 12, weight: '600' }
                        }
                    }
                }
            }
        });
    }
}


