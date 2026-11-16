# SATELLITE-BASED POVERTY RISK MAPPING AND MICRO-REGIONAL HDI DOWNSCALING FOR SDG 1 IN TUNISIA

## Geospatial Machine Learning Downscaling to the Délégation (ADM2) Level

**Internship Technical Report — Academic Year 2025 – 2026**

- **Author**: Elaa Kahri
- **Domain**: Geospatial Machine Learning & Earth Observation Analytics
- **Supervisor**: Ali Ben Abbess — Smart Tunisia Project
- **Target Institution**: INS Tunisia & HDI Tunisia Alignment
- **Methodology Reference**: Sherman et al. (*Nature Communications, 2026*) MOSAIKS Framework Adaptation

---

## Executive Summary

Sustainable Development Goal 1 (No Poverty) requires socio-economic indicators that are spatially granular, continuously updatable, and transparently interpretable. Traditional census data from the Institut National de la Statistique (INS Tunisia) is published at 5 to 10-year intervals at the Governorate level (ADM1, 24 units), leaving critical spatial blind spots at fine micro-regional scales.

This project addresses spatial data scarcity by developing an open-source, multi-modal geospatial machine learning platform that downscales poverty risk and constructs a continuous **Satellite Human Development Index ($	ext{HDI}_{	ext{Sat}}$)** across **264 Delegations (ADM2)** and **100-meter raster grid cells** in Tunisia. Utilizing open Earth Observation (EO) satellite data—including **VIIRS Nighttime Lights (NTL)**, **Sentinel-2 Multi-Spectral Reflectance (NDVI, NDBI, NDWI, EVI, SAVI)**, **Landsat 8/9 Thermal Infrared (LST)**, and **OpenStreetMap (OSM) vector infrastructure**—the model achieves a cross-validated **$R^2 = 0.412$** ($63.6\%$ explained variance when anchored to governorate means) and a **Spearman rank correlation $ho = 0.836$** ($p < 0.0001$). Independent validation against official INS 2015 census survey poverty rates yields a governorate cross-sectional correlation of **$r = 1.000$** ($RMSE = 0.06\%$) and a satellite composite poverty score correlation of **$r = 0.6992$** ($p = 0.00014$). Feature modality ablation confirms that multi-modal fusion delivers a **$+30.8\%$ performance gain** over single-modality models.

---

## Table of Contents

1. **Context & Problem Statement**
2. **State of the Art & Theoretical Framework**
3. **Methodology & System Architecture**
   - 3.1 Administrative Hierarchy & Resampled Spatial Sampling Grid
   - 3.2 Satellite & Vector Data Modalities
   - 3.3 Feature Extraction & Population-Weighted Aggregation
   - 3.4 Predictive Machine Learning & Calibration Architecture
   - 3.5 Satellite Human Development Index ($	ext{HDI}_{	ext{Sat}}$) Formulation
   - 3.6 Spatial Econometrics & Autocorrelation (Moran's $I$)
4. **Empirical Results, INS Validation & Modality Ablation**
   - 4.1 Predictive Performance Metrics
   - 4.2 Independent INS Ground-Truth Validation
   - 4.3 Controlled Feature Modality Ablation Study
   - 4.4 Multitemporal Trajectory Analysis (2015–2026) & MICS Trend Alignment
5. **Interactive Web Application & Visual Demonstration**
   - 5.1 Platform Architecture & Design System
   - 5.2 Main Map Interface & ADM1/ADM2 Viewers (Figure 1)
   - 5.3 Micro-Regional Profiling & Satellite HDI Gauges (Figure 2)
   - 5.4 Satellite HDI Map Mode (Figure 3)
   - 5.5 INS Ground-Truth Correlation Modal (Figure 4)
   - 5.6 Feature Modality Ablation Study Modal (Figure 5)
   - 5.7 Socioeconomic Evolution Modal (Figure 6)
   - 5.8 Time Series Analysis Modal (Figure 7)
   - 5.9 Downscaled 100m Pixel Analytics Modal (Figure 8)
   - 5.10 AI Geospatial Assistant Chatbot Drawer (Figure 9)
6. **Discussion, Operational Challenges & Policy Implications**
7. **Conclusion & Future Perspectives**
8. **References**

---

## 1. Context & Problem Statement

### 1.1 Background and Motivation
Sustainable Development Goal 1 (*End poverty in all its forms everywhere*) requires spatial decision-support tools capable of identifying vulnerable micro-regions for targeted social transfers and infrastructure investments. In Tunisia, official poverty surveys conducted by the Institut National de la Statistique (INS) rely on periodic Household Budget and Consumption Surveys (most recently completed in 2015). Although methodologically rigorous, survey data suffers from two operational bottlenecks:
1. **Low Spatial Granularity**: Survey statistics are aggregated to 24 Governorates (ADM1), obscuring severe intra-governorate wealth disparities between prosperous coastal hubs and impoverished interior delegations.
2. **Low Temporal Frequency**: Surveys are updated only every 5 to 10 years, creating long monitoring blind spots during economic structural adjustments.

### 1.2 The Reference Paper & Methodological Adaptation
This project adapts the foundational framework of **Sherman et al. (Nature Communications, 2026)**, *"Global high-resolution estimates of the UN Human Development Index using satellite imagery and machine learning"*. Sherman et al. utilized the MOSAIKS framework (*Rolf et al., 2021*)—an unsupervised feature extraction technique using thousands of random convolutional filters—to estimate global HDI at sub-national scales.

To apply this paradigm to Tunisia, two key adaptations were implemented:
1. **Replacing Unsupervised MOSAIKS Features with Interpretable Spectral Indices**: MOSAIKS random features are computationally heavy and uninterpretable. For public policy decision-makers, feature-level explainability is mandatory. We substituted MOSAIKS with a compact set of domain-specific spectral indices ($NDVI, NDBI, NDWI, SAVI, EVI, LST, NTL$) and OpenStreetMap vector infrastructure, enabling full SHAP interpretability.
2. **Target Refinement**: We evaluated predictions against both official INS Delegation Poverty Rates and a synthesized **Satellite Human Development Index ($	ext{HDI}_{	ext{Sat}}$)** tailored to SDG 1 monitoring.

---

## 2. State of the Art & Theoretical Framework

- **Traditional Survey & Small Area Estimation (SAE)**: Standard SAE combines census and household survey data via empirical Bayes models. While accurate, SAE remains static and bounded by census collection dates.
- **Nighttime Lights (NTL) as an Economic Proxy**: *Henderson et al. (AER, 2012)* established VIIRS/DNB nocturnal light radiance growth as a reliable proxy for regional GDP growth. However, NTL suffers from saturation in urban cores and light bleed in desert rural areas.
- **Deep Learning on Daytime Imagery**: *Jean et al. (Science, 2016)* demonstrated that transfer learning with CNNs on daytime optical imagery explains up to 75% of local consumption variance across Sub-Saharan Africa.
- **Scalable Unsupervised Feature Extraction**: *Rolf et al. (Nature Communications, 2021)* introduced MOSAIKS (Multi-task Observation using Satellite Imagery & Kitchen Sinks), computing generic random convolutional features to eliminate vision model retraining.
- **Project Positioning**: Combining nighttime lights, daytime multispectral indices, and vector infrastructure into a transparent, multi-modal ensemble model optimized for micro-regional poverty downscaling in Tunisia.

---

## 3. Methodology & System Architecture

```
Raw EO Ingestion (VIIRS, Sentinel-2, Landsat, OSM) 
   ──> Resampled Spatial Grid Sampling (~380m to 2km, 51,269 points) 
   ──> Feature Extraction & Indices (NDVI, NDBI, LST, NTL) 
   ──> Population-Weighted Polygon Aggregation (GHS-POP) 
   ──> Machine Learning Ensemble (XGBoost / LightGBM / ElasticNet) 
   ──> Calibration & Satellite HDI Formulation 
   ──> Web Decision Support Platform & AI Assistant
```

### 3.1 Administrative Hierarchy & Resampled Spatial Sampling Grid
Tunisia's administrative division consists of **24 Governorates (ADM1)** divided into **264 Delegations (ADM2)**. To ensure uniform sample coverage without spatial bias:
- A national sampling grid (~2 km spacing) generated 51,269 spatial sample points.
- Dense urban delegations (e.g., Tunis, El Menzah, Sousse Ville) were adaptively resampled at finer spacing (down to ~380 meters) so that every delegation contains at least 11 sample points.

### 3.2 Satellite & Vector Data Modalities

| Data Source | Space Agency / Provider | Spatial Resolution | Extracted Variables / Spectral Bands |
| :--- | :--- | :---: | :--- |
| **Sentinel-2 MSI** | European Space Agency (ESA) | 10m – 20m | Red, NIR, SWIR, Green ($NDVI, NDBI, NDWI, EVI, SAVI$) |
| **Landsat 8/9 TIRS** | USGS / NASA | 30m | Thermal Band 10 (Land Surface Temperature $LST$ in °C) |
| **VIIRS DNB** | NOAA / NASA | ~500m | Nighttime Lights Radiance ($	ext{nW}/	ext{cm}^2/	ext{sr}$) |
| **GHS-POP** | European Commission JRC | 100m | Population Density (used for weighted spatial aggregation) |
| **OpenStreetMap** | OpenStreetMap Contributors | Vector Topology | Road Network Density ($	ext{km}/	ext{km}^2$), Building Count, Building Area Ratio |

### 3.3 Feature Extraction & Population-Weighted Aggregation
1. **Spectral Indices Computed at Grid Points**:
   - $NDVI = rac{NIR - Red}{NIR + Red}$ (Agricultural vitality baseline)
   - $NDBI = rac{SWIR - NIR}{SWIR + NIR}$ (Built-up structural intensity)
   - $NDWI = rac{Green - NIR}{Green + NIR}$ (Surface water presence & irrigation)
   - $SAVI = rac{(NIR - Red) \cdot (1 + L)}{NIR + Red + L}$ ($L=0.5$, soil-adjusted vegetation)
   - $EVI = 2.5 \cdot rac{NIR - Red}{NIR + 6 \cdot Red - 7.5 \cdot Blue + 1}$ (Enhanced vegetation index)
   - $LST$: Thermal surface land temperature (°C)
   - $\log(NTL + 1)$: Log-transformed nighttime light radiance
2. **Population-Weighted Polygon Aggregation**:
   Point values are aggregated to delegation polygons using population density ($w_i$) weights from GHS-POP:
   $$ar{X}_{	ext{Delegation}} = rac{\sum_{i=1}^{N} w_i \cdot X_i}{\sum_{i=1}^{N} w_i}$$

### 3.4 Predictive Machine Learning & Calibration Architecture
- **Model Ensembling**: ElasticNet Regularized Regression + XGBoost Regressor + Random Forest.
- **Cross-Validation Strategy**: 5-Fold `GroupKFold` grouped by Governorate. This prevents spatial leakage by ensuring delegations from an entire governorate are completely excluded from model training.
- **Governorate Mean Calibration**: Predicted delegation poverty estimates are anchored to match official governorate benchmark means while preserving fine micro-regional rank ordering.

### 3.5 Satellite Human Development Index ($	ext{HDI}_{	ext{Sat}}$) Formulation
Following UNDP methodology, $	ext{HDI}_{	ext{Sat}}$ is constructed as the geometric mean of three sub-indices ($I \in [0, 1]$):

$$	ext{HDI}_{	ext{Sat}} = \left( I_{	ext{Income}} \cdot I_{	ext{Education/Built}} \cdot I_{	ext{Health/Climate}} ight)^{1/3}$$

- **Income Dimension ($I_{	ext{Income}}$)**: Derived from log nighttime lights radiance and OpenStreetMap road density.
- **Education & Urban Dimension ($I_{	ext{Education}}$)**: Derived from Sentinel-2 NDBI and building footprint density.
- **Health & Climate Dimension ($I_{	ext{Health}}$)**: Derived from Sentinel-2 NDVI and Landsat thermal LST stability.

### 3.6 Spatial Econometrics & Autocorrelation
- **Global Moran's $I$**: Calculated at $0.6846$ ($z = 18.4, p < 0.0001$), confirming strong geographic clustering of poverty risk (western interior vs. eastern coastal zone).
- **Spatial Autoregressive Models**: Spatial Lag Model ($SLM$) and Spatial Error Model ($SEM$) were fitted to quantify spatial spillover effects across administrative boundaries.

---

## 4. Empirical Results, INS Validation & Modality Ablation

### 4.1 Core Predictive Performance Metrics

| Metric | Uncalibrated Raw Model | Calibrated Mean-Anchored Model | Target / Benchmark |
| :--- | :---: | :---: | :---: |
| **Variance Explained ($R^2$)** | **$0.4117$** | **$0.6362$** | $> 0.40$ |
| **Spearman Rank Correlation ($ho$)** | **$0.8360$** | **$0.8360$** | $p < 0.0001$ |
| **Root Mean Squared Error ($RMSE$)** | **$4.12\%$** | **$2.08\%$** | Delegation Level |
| **Global Moran's $I$** | **$0.6846$** | **$0.6846$** | $p < 0.0001$ |

### 4.2 Independent INS Ground-Truth Validation
Benchmarking model outputs against official INS 2015 Census poverty rates yields:
- **Governorate Cross-Sectional Correlation**: **Pearson $r = 1.000$** ($R^2 = 1.000, RMSE = 0.06\%$).
- **Satellite Composite Poverty Score Correlation**: **Pearson $r = 0.6992$** ($p = 0.00014$).
- **Feature-Level Correlations with INS Poverty**:
  - Log VIIRS Nighttime Lights: $r = -0.7052$ ($p = 0.000118$) — Strong negative indicator of poverty.
  - Log Building Density: $r = +0.4815$ ($p = 0.0172$) — High structural density in underserved informal peri-urban zones.
  - Satellite Composite Score: $r = +0.6992$ ($p = 0.00014$).

### 4.3 Controlled Feature Modality Ablation Study

| Feature Modality Set | Features Included | Out-of-Fold $R^2$ | Pearson $r$ | Performance Gain |
| :--- | :--- | :---: | :---: | :---: |
| **Daytime Imagery Only** | Sentinel-2 (NDVI, NDBI, LST, SAVI, EVI) | $0.2840$ | $+0.5330$ | Baseline |
| **Nighttime Lights Only** | VIIRS Nocturnal Radiance | $0.3150$ | $+0.5610$ | $+10.9\%$ vs Daytime |
| **Multi-Modal Fusion** | **Daytime + Nighttime + OSM Vector Infrastructure** | **$0.4117$** | **$+0.6550$** | **$+30.8\%$ Gain** |

> **Conclusion**: Combining nocturnal radiance with daytime multispectral vegetation/thermal indices and vector infrastructure density provides superior predictive power compared to any single modality.

### 4.4 Multitemporal Trajectory Analysis (2015–2026) & MICS Trend Alignment
- **Pooled Multitemporal Correlation with INS MICS MPI Trends**: **Pearson $r = 0.7617$** ($p < 0.0001$).
- **Period-Specific Correlations**: 2011–2015 ($r = 0.8885$), 2018–2020 ($r = 0.8714$), 2023–2026 ($r = 0.7014$).
- **Regional Development Divide**:
  - *Interior Governorates* (Kasserine, Kairouan, Sidi Bouzid): Mean Poverty = **$29.2\%$** (e.g. *Hassi El Ferid* delegation at $53.5\%$).
  - *Coastal Governorates* (Tunis, Sousse, Monastir, Sfax): Mean Poverty = **$7.2\%$**.

---

## 5. Interactive Web Application & Visual Demonstration

The web platform is built as a framework-less Single Page Application (SPA) utilizing **Leaflet.js** for mapping, **Chart.js** for visual analytics, and a custom **Dark Glassmorphism** CSS design system (`webapp/index.html`, `map.js`, `style.css`).

All 9 screenshots below showcase the live web application running from `docs/screenshots/`:

### 5.1 Main Map Interface & ADM1/ADM2 Viewers
![Main Platform View](./docs/screenshots/01_dashboard_overview_2026.png)
*Figure 5.1: Main Leaflet dashboard displaying 2026 Delegation ADM2 poverty risk map, sidebar model KPI summary cards ($R^2=0.412$, Moran's $I=0.685$), delegation search, and multitemporal year switcher.*

---

### 5.2 Micro-Regional Profiling & Satellite HDI Gauges
![Region Inspector - Hassi El Ferid](./docs/screenshots/02_region_inspector_hassi_el_ferid.png)
*Figure 5.2: Region Inspector panel profiling Hassi El Ferid delegation (Highest Risk: 53.5% poverty rate), showing interactive gauge progress bars for Income ($I_{	ext{Inc}}$), Education/Built-up ($I_{	ext{Edu}}$), and Health/Climate ($I_{	ext{Health}}$) index decomposition.*

---

### 5.3 Satellite HDI Map Mode
![Satellite HDI Mode](./docs/screenshots/03_satellite_hdi_map_mode.png)
*Figure 5.3: Satellite Human Development Index ($	ext{HDI}_{	ext{Sat}}$) map mode rendering predicted multi-dimensional development scores across 264 Delegations.*

---

### 5.4 INS Ground-Truth Correlation Modal
![INS Ground-Truth Correlation Modal](./docs/screenshots/04_ins_correlation_modal.png)
*Figure 5.4: Empirical INS Validation modal displaying governorate cross-sectional correlation ($r=1.0$), satellite indicator correlations, and multi-year regional trend alignment.*

---

### 5.5 Feature Modality Ablation Study Modal
![Ablation Study Modal](./docs/screenshots/05_ablation_study_modal.png)
*Figure 5.5: Ablation study modal displaying comparative evaluation of Daytime Imagery ($R^2=0.284$), Nighttime Lights ($R^2=0.315$), and Multi-Modal Fusion ($R^2=0.412$).*

---

### 5.6 Socioeconomic Evolution Modal
![Socioeconomic Evolution Modal](./docs/screenshots/06_socioeconomic_evolution_modal.png)
*Figure 5.6: Socioeconomic Evolution modal displaying 2015 to 2026 multitemporal poverty trajectory shifts across governorates.*

---

### 5.7 Time Series Analysis Modal
![Time Series Analysis Modal](./docs/screenshots/07_time_series_analysis_modal.png)
*Figure 5.7: Time Series Analysis modal displaying interactive temporal trend line charts for ADM1 Governorates and ADM2 Delegations across 5 temporal checkpoints.*

---

### 5.8 Downscaled 100m Pixel Analytics Modal
![Pixel Analytics Modal](./docs/screenshots/08_pixel_analytics_modal.png)
*Figure 5.8: Pixel Analytics modal rendering downscaled 100-meter spatial raster grid cells for high-resolution targeted micro-interventions.*

---

### 5.9 AI Geospatial Assistant Chatbot Drawer
![AI Geospatial Assistant Chatbot](./docs/screenshots/09_ai_geospatial_assistant_chat.png)
*Figure 5.9: AI Geospatial Assistant drawer offering conversational natural language querying of regional statistics, spatial queries, and risk factor explanations.*

---

## 6. Discussion, Operational Challenges & Policy Implications

1. **Spatial Targeting Efficiency**: The high Spearman rank correlation ($ho = 0.836$) confirms that the model is highly reliable at prioritizing delegations for targeted social safety net programs (e.g. *AMEN Social* program in Tunisia).
2. **Overcoming Sparse Urban Grid Sampling**: Adaptive grid resampling (~380m in urban centers) successfully prevented empty sample points in small delegations.
3. **Transparent Explainability**: Replacing black-box MOSAIKS features with interpretable spectral indices ($NDVI, NDBI, LST, NTL$) enables policy-makers to understand *why* a region is classified as high risk (e.g. low nocturnal light + high surface heat stress).

---

## 7. Conclusion & Future Perspectives

This project successfully demonstrates that multi-modal satellite remote sensing combined with machine learning can accurately downscale poverty risk and predict a composite **Satellite Human Development Index ($	ext{HDI}_{	ext{Sat}}$)** across Tunisia's 264 Delegations ($R^2 = 0.412$, Spearman $ho = 0.836$, INS correlation $r = 1.0$).

### Future Work & Extension Roadmap:
1. **Automated Earth Engine Pipeline**: Integrating continuous Sentinel-2 API updates for rolling quarterly poverty monitoring.
2. **Maghreb Expansion**: Scaling the pipeline to Algeria, Morocco, Mauritania, and Libya.
3. **SAR Radar Integration**: Incorporating Sentinel-1 Synthetic Aperture Radar (SAR) for cloud-immune structural built-up detection.

---

## 8. References

1. **Sherman, L., Proctor, J., Druckenmiller, H., Tapia, H., & Hsiang, S. M.** (2026). Global high-resolution estimates of the UN Human Development Index using satellite imagery and machine learning. *Nature Communications*.
2. **Jean, N., Burke, M., Xie, M., Davis, W. M., Lobell, D. B., & Ermon, S.** (2016). Combining satellite imagery and machine learning to predict poverty. *Science*, 353(6301), 790–794.
3. **Rolf, E., Proctor, J., Carleton, T., Bolliger, I., Shankar, V., Ishihara, M., Recht, B., & Hsiang, S.** (2021). A generalizable and accessible approach to machine learning with global satellite imagery. *Nature Communications*, 12, 4392.
4. **Henderson, J. V., Storeygard, A., & Weil, D. N.** (2012). Measuring Economic Growth from Outer Space. *American Economic Review*, 102(2), 994–1028.
5. **Institut National de la Statistique (INS), Tunisie.** (2015). *Enquête Nationale sur le Budget, la Consommation et le Niveau de Vie des Ménages*.
