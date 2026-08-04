"""
Phase 6: Spatial Econometrics & Autocorrelation Modeling (Moran's I & Spatial Lag)
----------------------------------------------------------------------------------
1. Constructs Queen/Rook spatial contiguity matrix (W) from ADM2 Delegation polygons.
2. Computes Moran's I spatial autocorrelation statistic for official poverty rate and predictions.
3. Fits Spatial Lag Autoregressive Regression Model: y = rho * W * y + X * beta + epsilon.
4. Exports data/processed/spatial_econometrics_report.json.
"""

import os
import sys
import json
import numpy as np
import pandas as pd
import geopandas as gpd
from scipy import stats
from sklearn.linear_model import LinearRegression, Ridge
from sklearn.preprocessing import StandardScaler

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PROCESSED_DIR = os.path.join(BASE_DIR, "data", "processed")
BOUNDARIES_DIR = os.path.join(BASE_DIR, "data", "boundaries")


def compute_moran_i(y, W_norm):
    """Compute Moran's I statistic for spatial autocorrelation."""
    n = len(y)
    z = y - np.mean(y)
    z2_sum = np.sum(z ** 2)
    if z2_sum == 0:
        return 0.0, 1.0

    s0 = np.sum(W_norm)
    I_stat = (n / s0) * (np.sum(W_norm * np.outer(z, z)) / z2_sum)
    
    # Expected I under null hypothesis of no spatial autocorrelation
    E_I = -1.0 / (n - 1)
    
    # Variance approximation for z-score
    var_I = (n * ((n**2 - 3*n + 3)*s0 - n*s0 + 3*s0**2)) / ((n - 1)*(n - 2)*(n - 3)*s0**2) - E_I**2
    z_score = (I_stat - E_I) / np.sqrt(abs(var_I) + 1e-8)
    p_val = 2.0 * (1.0 - stats.norm.cdf(abs(z_score)))

    return float(I_stat), float(p_val)


def run_spatial_econometrics():
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")

    print("=================================================================")
    print(" PHASE 6: SPATIAL ECONOMETRICS & MORAN'S I ANALYSIS              ")
    print("=================================================================")

    # 1. Load Data
    del_pred_path = os.path.join(PROCESSED_DIR, "delegation_poverty_predictions.csv")
    adm2_path = os.path.join(BOUNDARIES_DIR, "tunisia_adm2_delegations.geojson")

    df_del = pd.read_csv(del_pred_path)
    gdf_adm2 = gpd.read_file(adm2_path)

    if "shapeID" in gdf_adm2.columns:
        gdf_adm2["delegation_id"] = gdf_adm2["shapeID"]

    # Deduplicate boundary polygons
    gdf_adm2 = gdf_adm2.drop_duplicates(subset=["delegation_id"]).copy()

    # Merge predictions with spatial geometry
    gdf_spatial = gdf_adm2.merge(df_del, on="delegation_id", how="inner")
    n_units = len(gdf_spatial)
    print(f"[+] Loaded {n_units} delegation geometries for spatial econometric analysis.")

    # 2. Build Queen Spatial Contiguity Weight Matrix W
    W = np.zeros((n_units, n_units))
    geoms = gdf_spatial.geometry.values

    for i in range(n_units):
        for j in range(n_units):
            if i != j:
                if geoms[i].touches(geoms[j]) or geoms[i].intersects(geoms[j]):
                    W[i, j] = 1.0

    # Row-standardize weight matrix W
    row_sums = W.sum(axis=1)
    row_sums[row_sums == 0] = 1.0
    W_norm = W / row_sums[:, np.newaxis]

    # 3. Moran's I Spatial Autocorrelation Test
    y_official = gdf_spatial["taux_pauvrete_2015"].values
    y_pred = gdf_spatial["y_pred_within_anchored"].values

    moran_official, p_official = compute_moran_i(y_official, W_norm)
    moran_pred, p_pred = compute_moran_i(y_pred, W_norm)

    print("\n-----------------------------------------------------------------")
    print(" MORAN'S I SPATIAL AUTOCORRELATION METRICS                       ")
    print("-----------------------------------------------------------------")
    print(f"Official Poverty Rate Moran's I:  {moran_official:.4f} (p-value: {p_official:.2e})")
    print(f"Predicted Poverty Rate Moran's I: {moran_pred:.4f} (p-value: {p_pred:.2e})")

    if moran_official > 0.3:
        print("[+] Strong positive spatial autocorrelation detected (Poverty is heavily clustered regionally).")

    # 4. Spatial Lag Autoregressive Model: y = rho * W * y + X * beta + epsilon
    Wy_pred = np.dot(W_norm, y_pred)
    gdf_spatial["spatial_lag_poverty"] = Wy_pred

    feature_cols = [c for c in gdf_spatial.columns if any(c.startswith(prefix) for prefix in ["log_", "NDVI", "NDWI", "NDBI", "SAVI", "EVI", "LST", "NTL", "road", "building"])]
    X = gdf_spatial[feature_cols].fillna(0).values

    # Include Spatial Lag vector Wy into regression matrix
    X_spatial = np.hstack([Wy_pred.reshape(-1, 1), X])
    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X_spatial)

    model_sar = Ridge(alpha=1.0)
    model_sar.fit(X_scaled, y_official)
    r2_sar = float(model_sar.score(X_scaled, y_official))

    spatial_rho_coef = float(model_sar.coef_[0])
    print("\n-----------------------------------------------------------------")
    print(" SPATIAL LAG AUTOREGRESSIVE REGRESSION RESULTS                   ")
    print("-----------------------------------------------------------------")
    print(f"Spatial Lag Autoregressive Coefficient (rho): {spatial_rho_coef:.4f}")
    print(f"Spatial Lag Model R² Score:                  {r2_sar:.4f}")

    # 5. Save Report JSON
    report = {
        "n_units": n_units,
        "moran_i_official": round(moran_official, 4),
        "moran_p_official": round(p_official, 6),
        "moran_i_pred": round(moran_pred, 4),
        "moran_p_pred": round(p_pred, 6),
        "spatial_rho_coefficient": round(spatial_rho_coef, 4),
        "spatial_lag_r2": round(r2_sar, 4)
    }

    report_path = os.path.join(PROCESSED_DIR, "spatial_econometrics_report.json")
    with open(report_path, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2)

    # Save updated dataframe with spatial lag column
    gdf_spatial.to_csv(del_pred_path, index=False)

    print(f"\n[+] Saved Spatial Econometrics Report -> {report_path}")
    print("=================================================================\n")

if __name__ == "__main__":
    run_spatial_econometrics()
