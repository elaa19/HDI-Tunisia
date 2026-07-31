"""
Phase 5 & Phase 6: Validation, Choropleth Mapping, and Leaflet.js Web Map Export
-------------------------------------------------------------------------------
1. Phase 5 Validation: Spatial ranking sanity check (Interior vs Coastal Governorates).
2. Phase 6 Choropleth Mapping: Generates static maps (GeoPandas + Matplotlib)
   showing Délégation predictions, Governorate rates, and Aggregation Bias.
3. Exports Leaflet.js interactive web map GeoJSON layers WITH ALL FEATURES:
   - data/processed/delegation_predictions.geojson
   - data/processed/gouvernorat_predictions.geojson
"""

import os
import sys
import json
import numpy as np
import pandas as pd
import geopandas as gpd
import matplotlib.pyplot as plt

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PROCESSED_DIR = os.path.join(BASE_DIR, "data", "processed")
BOUNDARIES_DIR = os.path.join(BASE_DIR, "data", "boundaries")
OUTPUT_DIR = os.path.join(BASE_DIR, "output")
WEBAPP_DIR = os.path.join(BASE_DIR, "webapp")

os.makedirs(OUTPUT_DIR, exist_ok=True)
os.makedirs(os.path.join(WEBAPP_DIR, "data"), exist_ok=True)


def run_validation_and_mapping():
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")

    print("=================================================================")
    print(" PHASE 5 & 6: VALIDATION, CHOROPLETH & LEAFLET.JS GEOJSON EXPORT  ")
    print("=================================================================")

    # Load Datasets
    del_pred_path = os.path.join(PROCESSED_DIR, "delegation_poverty_predictions.csv")
    gov_pred_path = os.path.join(PROCESSED_DIR, "governorate_poverty_composite.csv")
    adm2_geojson = os.path.join(BOUNDARIES_DIR, "tunisia_adm2_delegations.geojson")
    adm1_geojson = os.path.join(BOUNDARIES_DIR, "tunisia_adm1_governorates.geojson")

    df_del_pred = pd.read_csv(del_pred_path)
    df_gov_pred = pd.read_csv(gov_pred_path)
    gdf_adm2 = gpd.read_file(adm2_geojson)
    gdf_adm1 = gpd.read_file(adm1_geojson)

    # Standardize IDs
    if "shapeID" in gdf_adm2.columns:
        gdf_adm2["delegation_id"] = gdf_adm2["shapeID"]
    if "shapeID" in gdf_adm1.columns:
        gdf_adm1["governorate_id"] = gdf_adm1["shapeID"]

    # Deduplicate boundary features
    gdf_adm2 = gdf_adm2.drop_duplicates(subset=["delegation_id"]).copy()
    gdf_adm1 = gdf_adm1.drop_duplicates(subset=["governorate_id"]).copy()

    # =========================================================================
    # PHASE 5: VALIDATION & DIAGNOSTIC SANITY CHECK
    # =========================================================================
    print("\n-----------------------------------------------------------------")
    print(" PHASE 5: SPATIAL PATTERN DIAGNOSTIC SANITY CHECK                ")
    print("-----------------------------------------------------------------")

    interior_govs = ["Kasserine", "Kairouan", "Sidi Bouzid", "Jendouba", "El Kef", "Siliana"]
    coastal_govs = ["Tunis", "Sousse", "Ariana", "Monastir", "Sfax", "Ben Arous"]

    interior_mean_poverty = df_gov_pred[df_gov_pred["governorate_name"].isin(interior_govs)]["taux_pauvrete_survey_2015"].mean()
    coastal_mean_poverty = df_gov_pred[df_gov_pred["governorate_name"].isin(coastal_govs)]["taux_pauvrete_survey_2015"].mean()

    interior_mean_score = df_gov_pred[df_gov_pred["governorate_name"].isin(interior_govs)]["poverty_composite_score"].mean()
    coastal_mean_score = df_gov_pred[df_gov_pred["governorate_name"].isin(coastal_govs)]["poverty_composite_score"].mean()

    print(f"Interior Governorates Mean Official Poverty Rate: {interior_mean_poverty:.1f}%")
    print(f"Coastal Urban Governorates Mean Official Poverty Rate: {coastal_mean_poverty:.1f}%")

    valid = (interior_mean_score > coastal_mean_score) and (interior_mean_poverty > coastal_mean_poverty)
    if valid:
        print("[+] SANITY CHECK PASSED: Model & Composite scores correctly rank interior/southern governorates as higher poverty risk than coastal urban centers.")

    # =========================================================================
    # PHASE 6: MERGE ALL FEATURES INTO GEOJSON LAYERS
    # =========================================================================
    print("\n-----------------------------------------------------------------")
    print(" PHASE 6: CHOROPLETH MAPPING & FULL FEATURE GEOJSON EXPORT       ")
    print("-----------------------------------------------------------------")

    # Calculate Aggregation Bias = (Fine Delegation Prediction - Coarse Gov Rate)
    gov_rate_map = df_gov_pred.set_index('governorate_name')['taux_pauvrete_survey_2015'].to_dict()
    df_del_pred['gov_official_rate'] = df_del_pred['governorate_name'].map(gov_rate_map)
    df_del_pred['aggregation_bias'] = df_del_pred['y_pred_within_anchored'] - df_del_pred['gov_official_rate']

    # Merge ALL columns into GeoDataFrames
    gdf_del_merged = gdf_adm2[['delegation_id', 'geometry']].merge(df_del_pred, on='delegation_id', how='inner')
    gdf_gov_merged = gdf_adm1[['governorate_id', 'geometry']].merge(df_gov_pred, on='governorate_id', how='inner')

    # Round float columns for compact web JSON formatting
    float_cols_del = gdf_del_merged.select_dtypes(include=[np.float64, np.float32]).columns
    for c in float_cols_del:
        gdf_del_merged[c] = gdf_del_merged[c].round(4)

    float_cols_gov = gdf_gov_merged.select_dtypes(include=[np.float64, np.float32]).columns
    for c in float_cols_gov:
        gdf_gov_merged[c] = gdf_gov_merged[c].round(4)

    # 1. Static Matplotlib Figure
    fig, axes = plt.subplots(1, 3, figsize=(18, 9))
    fig.suptitle("Tunisia SDG 1 Poverty Risk Downscaling & Aggregation Bias\n(Sherman, Proctor et al. 2026 Methodology Adaptation)", fontsize=14, fontweight="bold")

    gdf_gov_merged.plot(column='taux_pauvrete_survey_2015', cmap='YlOrRd', legend=True, ax=axes[0],
                        legend_kwds={'label': 'Poverty Rate (%)'})
    axes[0].set_title("A. Coarse Governorate Baseline (ADM1)", fontsize=11)
    axes[0].axis('off')

    gdf_del_merged.plot(column='y_pred_within_anchored', cmap='YlOrRd', legend=True, ax=axes[1],
                        legend_kwds={'label': 'Predicted Poverty Rate (%)'})
    axes[1].set_title("B. Fine Delegation Predictions (ADM2)", fontsize=11)
    axes[1].axis('off')

    gdf_del_merged.plot(column='aggregation_bias', cmap='coolwarm', legend=True, ax=axes[2],
                        legend_kwds={'label': 'Bias (% Points)'})
    axes[2].set_title("C. Sub-Regional Aggregation Bias\n(Fine Prediction - Coarse Gov Rate)", fontsize=11)
    axes[2].axis('off')

    plt.tight_layout()
    static_map_path = os.path.join(OUTPUT_DIR, "tunisia_poverty_downscaling_maps.png")
    plt.savefig(static_map_path, dpi=300, bbox_inches='tight')
    plt.close()

    # 2. Save Web Map GeoJSON Layers
    del_web_geojson = os.path.join(OUTPUT_DIR, "delegation_predictions.geojson")
    gov_web_geojson = os.path.join(OUTPUT_DIR, "gouvernorat_predictions.geojson")

    gdf_del_merged.to_file(del_web_geojson, driver="GeoJSON")
    gdf_gov_merged.to_file(gov_web_geojson, driver="GeoJSON")

    # Copy to webapp/data/
    gdf_del_merged.to_file(os.path.join(WEBAPP_DIR, "data", "delegation_predictions.geojson"), driver="GeoJSON")
    gdf_gov_merged.to_file(os.path.join(WEBAPP_DIR, "data", "gouvernorat_predictions.geojson"), driver="GeoJSON")

    print(f"[+] Saved Delegation GeoJSON with ALL FEATURES ({gdf_del_merged.shape[1]} properties) -> {del_web_geojson}")
    print(f"[+] Saved Governorate GeoJSON with ALL FEATURES ({gdf_gov_merged.shape[1]} properties) -> {gov_web_geojson}")
    print("=================================================================\n")

if __name__ == "__main__":
    run_validation_and_mapping()
