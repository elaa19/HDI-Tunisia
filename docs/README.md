# 🌍 Tunisia SDG 1 Poverty Risk Platform
### AI Geospatial Assistant & Micro-Regional Human Development Index (HDI) Downscaling
> **Methodology Adaptation**: Nature Communications (*Sherman et al., 2026*) MOSAIKS Earth Observation Framework  
> **Deployment Directory**: [`/docs`](file:///c:/Users/ALA%20KAHRI/InternshipHDI/docs) (GitHub Pages Ready)  

---

## 🌟 Executive Overview

The **Tunisia SDG 1 Poverty Risk Platform** is an interactive geospatial machine learning web application designed to address spatial inequality and data scarcity in Tunisia. By leveraging multi-modal Earth Observation (EO) satellite data—including **VIIRS Nighttime Lights (NTL)**, **Sentinel-2 Multi-Spectral Reflectance (NDVI, NDBI, NDWI, EVI)**, **Landsat 8/9 Thermal Infrared (LST)**, and **OpenStreetMap (OSM) vector infrastructure**—the platform downscales poverty risk and predicts a composite **Satellite Human Development Index ($\text{HDI}_{\text{Sat}}$)** across **264 Delegations (ADM2)**, **24 Governorates (ADM1)**, and **100-meter raster grid cells**.

---

## 📸 Screenshots & Interactive Feature Gallery

All high-resolution visual screenshots are hosted in the deployment directory under [`docs/screenshots/`](file:///c:/Users/ALA%20KAHRI/InternshipHDI/docs/screenshots/).

### 1. Main Platform Dashboard (2026 ADM2 Delegation Poverty Risk)
![Main Platform View](./screenshots/01_dashboard_overview_2026.png)
*Figure 1: Main interactive Leaflet dashboard presenting downscaled 2026 delegation poverty estimates, key model performance metrics ($R^2 = 0.412$, Moran's $I = 0.685$), and sidebar search inspector.*

---

### 2. Region Inspector & Satellite HDI Formula Decomposition
![Region Inspector - Hassi El Ferid](./screenshots/02_region_inspector_hassi_el_ferid.png)
*Figure 2: Micro-regional inspector profiling Hassi El Ferid (Highest Risk: 53.5% poverty rate), featuring interactive gauge charts for Income ($I_{\text{Inc}}$), Education/Built-up ($I_{\text{Edu}}$), and Health/Climate ($I_{\text{Health}}$).*

---

### 3. Satellite Human Development Index ($\text{HDI}_{\text{Sat}}$) Map Mode
![Satellite HDI Mode](./screenshots/03_satellite_hdi_map_mode.png)
*Figure 3: Spatial visualization mode rendering predicted composite Satellite HDI scores across 264 Delegations.*

---

### 4. Official INS Tunisia Ground-Truth Validation Modal
![INS Ground-Truth Correlation Modal](./screenshots/04_ins_correlation_modal.png)
*Figure 4: Independent benchmarking modal comparing model predictions against official INS 2015 Census poverty rates ($r = 1.0$, composite score $r = 0.6992$) and UNICEF MICS multi-temporal MPI trajectories.*

---

### 5. Multi-Modal Feature Ablation Study Modal
![Ablation Study Modal](./screenshots/05_ablation_study_modal.png)
*Figure 5: Experimental feature ablation evaluation comparing Daytime Imagery ($R^2=0.284$), Nighttime Lights ($R^2=0.315$), and Multi-Modal Fusion ($R^2=0.412$).*

---

### 6. Socioeconomic Evolution & Multitemporal Dynamics
![Socioeconomic Evolution Modal](./screenshots/06_socioeconomic_evolution_modal.png)
*Figure 6: Multi-temporal trajectory modal showing spatial poverty rate evolution across governorates from 2015 to 2026.*

---

### 7. Time Series Analysis Modal
![Time Series Analysis Modal](./screenshots/07_time_series_analysis_modal.png)
*Figure 7: Multitemporal linear trend line charts comparing regional trajectories across 5 temporal checkpoints.*

---

### 8. Downscaled 100m Pixel Analytics Modal
![Pixel Analytics Modal](./screenshots/08_pixel_analytics_modal.png)
*Figure 8: 100-meter high-resolution spatial raster grid cell analytics viewer for micro-targeted social transfer interventions.*

---

### 9. AI Geospatial Assistant Chatbot Drawer
![AI Geospatial Assistant Chatbot](./screenshots/09_ai_geospatial_assistant_chat.png)
*Figure 9: Built-in AI drawer assistant offering natural language querying of regional statistics, spatial queries, and risk factor explanations.*

---

## 📊 Empirical Validation & Performance Summary

| Analytical Dimension | Evaluation Metric | Empirical Value | Statistical Significance |
| :--- | :--- | :---: | :---: |
| **Model Accuracy (Delegation ADM2)** | Variance Explained ($R^2$) | **$0.412$** | Out-of-Fold 5-Fold CV |
| **Model Pearson Correlation** | Correlation ($r$) | **$+0.655$** | $p < 0.001$ |
| **Governorate INS Validation** | Cross-Sectional Correlation | **$1.000$** | $R^2 = 1.0, RMSE = 0.06\%$ |
| **Satellite Composite Score** | Correlation with INS Poverty | **$0.6992$** | $p = 0.00014$ |
| **Multi-Temporal Trajectory** | Pooled INS MPI Trend Correlation | **$0.7617$** | $p < 0.0001$ |
| **Spatial Autocorrelation** | Global Moran's $I$ | **$0.685$** | $z = 18.4, p < 0.001$ |
| **Ablation Performance Gain** | Multi-Modal Fusion vs Single | **$+30.8\%$** | $R^2: 0.284 \rightarrow 0.412$ |

---

## 🧮 Satellite HDI Formulation

The Satellite Human Development Index ($\text{HDI}_{\text{Sat}}$) is calculated as the geometric mean of three continuous remote sensing sub-indices:

$$\text{HDI}_{\text{Sat}} = \left( I_{\text{Income}} \cdot I_{\text{Education/Built}} \cdot I_{\text{Health/Climate}} \right)^{1/3}$$

1. **Income Index ($I_{\text{Income}}$)**: Derived from $\log(\text{VIIRS Radiance})$ and OpenStreetMap Road Network Density ($\text{km}/\text{km}^2$).
2. **Education & Infrastructure Index ($I_{\text{Education}}$)**: Derived from Sentinel-2 NDBI (Normalized Difference Built-Up Index) and Building footprint density.
3. **Health & Climate Index ($I_{\text{Health}}$)**: Derived from Sentinel-2 NDVI (Vegetation index) and Landsat Thermal LST (°C).

---

## 📁 Repository Structure

```
c:\Users\ALA KAHRI\InternshipHDI/
├── pipeline/                      # Processing Pipeline Scripts (Phases 01 - 12)
│   ├── 01_phase1_boundaries.py    # GADM ADM1/ADM2 GeoJSON boundary processing
│   ├── 02_phase2_features.py      # Earth observation feature extraction (VIIRS, S2, LST)
│   ├── 03_phase3_aggregation.py   # Spatial aggregation & zonal statistics
│   ├── 04_inspect_merge.py        # Dataset merging & validation checks
│   ├── 05_phase5_6_validation_and_mapping.py  # Model training (XGBoost, Ridge, LightGBM)
│   ├── 06_spatial_econometrics.py # Spatial autoregressive models & Moran's I
│   ├── 07_multitemporal_trends.py # 2015-2026 multitemporal trajectory processing
│   ├── 08_shap_interpretability.py# SHAP feature importance analysis
│   ├── 09_ins_correlation_analysis.py # Official INS Census validation
│   ├── 10_governorate_timeseries_analysis.py # ADM1 time series aggregation
│   ├── 11_ablation_daytime_nightlights.py    # Modality ablation study pipeline
│   └── 12_export_raster_pixels.py # 100m grid raster JSON exporter
├── webapp/                        # Master Web Application Source
│   ├── index.html                 # Main Glassmorphism SPA interface
│   ├── style.css                  # Dark glassmorphism design system
│   ├── map.js                     # Leaflet map logic & interactive modals
│   └── data/                      # GeoJSON & JSON analytical data payloads
├── docs/                          # GitHub Pages Deployment Directory
│   ├── index.html                 # Synced static app entry point
│   ├── style.css                  # Synced design system styles
│   ├── map.js                     # Synced application logic
│   ├── data/                      # Synced dataset payloads
│   ├── screenshots/               # High-res screenshot image catalog
│   └── README.md                  # Comprehensive Documentation Page
└── screenshots/                   # Root screenshots storage
```

---

## 🚀 Local Server Execution

To launch the web application locally:

```bash
# Serve the GitHub Pages deployment directory
python -m http.server 8086 --directory docs

# Open in browser:
# http://localhost:8086
```
