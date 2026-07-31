"""
Phase 1: Boundary Retrieval, Spatial Grid Generation, and Adaptive Delegation Tagging
------------------------------------------------------------------------------------
1. Fetches official Tunisia ADM1 (Governorate) & ADM2 (Délégation) boundaries from geoBoundaries API.
2. Generates a ~2km spatial grid across Tunisia (spacing ~0.018 degrees).
3. Performs spatial join (sjoin) to tag each grid point with Governorate and Délégation IDs/Names.
4. Performs point density sanity check per delegation polygon.
5. ADAPTIVE RESAMPLING: For any delegation with < 10 points (including 0-point urban delegations),
   regenerates points at a fine resolution (300m-400m, ~0.0035 degrees) restricted to that polygon.
   Falls back to representative point (guaranteed inside polygon) if fine grid yields 0 points.
6. Confirms 0 delegations have 0 points and saves CSV & GeoJSON outputs.
"""

import os
import sys
import json
import math
import requests
import numpy as np
import pandas as pd
import geopandas as gpd
from shapely.geometry import Point, MultiPolygon, Polygon

# Path configuration
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BOUNDARIES_DIR = os.path.join(BASE_DIR, "data", "boundaries")
PROCESSED_DIR = os.path.join(BASE_DIR, "data", "processed")
RAW_DIR = os.path.join(BASE_DIR, "data", "raw")

os.makedirs(BOUNDARIES_DIR, exist_ok=True)
os.makedirs(PROCESSED_DIR, exist_ok=True)
os.makedirs(RAW_DIR, exist_ok=True)

# geoBoundaries API Endpoints
GEOBOUNDARIES_ADM1_URL = "https://www.geoboundaries.org/api/current/gbOpen/TUN/ADM1/"
GEOBOUNDARIES_ADM2_URL = "https://www.geoboundaries.org/api/current/gbOpen/TUN/ADM2/"


def fetch_geoboundaries(api_url: str, output_path: str) -> gpd.GeoDataFrame:
    """Fetch GeoJSON boundaries from geoBoundaries API or load local file if present."""
    if os.path.exists(output_path):
        print(f"[+] Loading boundaries from local file: {output_path}")
        return gpd.read_file(output_path)

    print(f"[*] Querying geoBoundaries API: {api_url} ...")
    resp = requests.get(api_url, timeout=30)
    resp.raise_for_status()
    metadata = resp.json()
    
    geojson_url = metadata.get("gjDownloadURL")
    if not geojson_url:
        raise ValueError(f"No gjDownloadURL found in geoBoundaries API response: {metadata}")

    print(f"[*] Downloading GeoJSON from: {geojson_url} ...")
    gjson_resp = requests.get(geojson_url, timeout=60)
    gjson_resp.raise_for_status()

    with open(output_path, "w", encoding="utf-8") as f:
        f.write(gjson_resp.text)

    gdf = gpd.read_file(output_path)
    print(f"[+] Downloaded {len(gdf)} administrative features -> {output_path}")
    return gdf


def generate_spatial_grid(bbox: tuple, step_deg: float = 0.018, prefix: str = "GRID") -> gpd.GeoDataFrame:
    """
    Generate regular sampling grid over bounding box.
    step_deg ~ 0.018 degrees corresponds to ~2km at latitude 34°N.
    """
    minx, miny, maxx, maxy = bbox
    lons = np.arange(minx, maxx, step_deg)
    lats = np.arange(miny, maxy, step_deg)

    grid_points = []
    point_id = 1
    for lat in lats:
        for lon in lons:
            grid_points.append({
                "point_id": f"{prefix}_{point_id:06d}",
                "latitude": round(float(lat), 6),
                "longitude": round(float(lon), 6),
                "geometry": Point(lon, lat)
            })
            point_id += 1

    gdf_grid = gpd.GeoDataFrame(grid_points, crs="EPSG:4326")
    return gdf_grid


def resample_low_density_delegations(gdf_adm2: gpd.GeoDataFrame, 
                                     joined_grid: gpd.GeoDataFrame, 
                                     threshold: int = 10, 
                                     fine_step_deg: float = 0.0035) -> gpd.GeoDataFrame:
    """
    For any delegation with < threshold grid points (including 0-point urban delegations),
    resamples points at fine resolution (~380-400m) restricted to the delegation polygon.
    If fine sampling yields 0 points, falls back to representative_point().
    """
    point_counts = joined_grid.groupby("delegation_id").size().to_dict()
    
    flagged_row_indices = []
    for idx, row in gdf_adm2.iterrows():
        del_id = row["delegation_id"]
        cnt = point_counts.get(del_id, 0)
        if cnt < threshold:
            flagged_row_indices.append(idx)

    print(f"[*] Resampling {len(flagged_row_indices)} delegations with < {threshold} points at fine resolution ({fine_step_deg*111000:.0f}m)...")

    # Keep existing grid points for non-flagged delegations
    flagged_del_ids = set(gdf_adm2.loc[flagged_row_indices, "delegation_id"])
    kept_grid = joined_grid[~joined_grid["delegation_id"].isin(flagged_del_ids)].copy()

    fine_points = []
    fine_id_counter = 1

    for idx in flagged_row_indices:
        row = gdf_adm2.loc[idx]
        del_id = row["delegation_id"]
        del_name = row["delegation_name"]
        geom = row["geometry"]

        minx, miny, maxx, maxy = geom.bounds
        lons = np.arange(minx, maxx + fine_step_deg, fine_step_deg)
        lats = np.arange(miny, maxy + fine_step_deg, fine_step_deg)

        added_for_this_del = 0
        for lat in lats:
            for lon in lons:
                pt = Point(lon, lat)
                if geom.intersects(pt):
                    fine_points.append({
                        "point_id": f"FINE_{fine_id_counter:06d}",
                        "latitude": round(float(lat), 6),
                        "longitude": round(float(lon), 6),
                        "delegation_id": del_id,
                        "delegation_name": del_name,
                        "geometry": pt
                    })
                    fine_id_counter += 1
                    added_for_this_del += 1

        # Fallback to representative point if polygon is smaller than fine step or yields 0 points
        if added_for_this_del == 0:
            rep_pt = geom.representative_point()
            fine_points.append({
                "point_id": f"FINE_{fine_id_counter:06d}",
                "latitude": round(float(rep_pt.y), 6),
                "longitude": round(float(rep_pt.x), 6),
                "delegation_id": del_id,
                "delegation_name": del_name,
                "geometry": rep_pt
            })
            fine_id_counter += 1
            print(f"  [!] Fallback to representative point for delegation: {del_name} ({del_id})")

    gdf_fine = gpd.GeoDataFrame(fine_points, crs="EPSG:4326")
    print(f"[+] Generated {len(gdf_fine)} fine-resolution grid points across low-density delegations.")

    # Combine kept main grid points and fine grid points
    cols_to_keep = ["point_id", "latitude", "longitude", "delegation_id", "delegation_name", "geometry"]
    combined_gdf = pd.concat([kept_grid[cols_to_keep], gdf_fine[cols_to_keep]], ignore_index=True)
    combined_gdf = gpd.GeoDataFrame(combined_gdf, crs="EPSG:4326")

    return combined_gdf


def main():
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")

    print("=================================================================")
    print(" PHASE 1 (PATCHED): ADAPTIVE BOUNDARIES & DELEGATION GRID JOIN  ")
    print("=================================================================")

    # 1. Fetch ADM1 (Governorates) & ADM2 (Délégations)
    adm1_file = os.path.join(BOUNDARIES_DIR, "tunisia_adm1_governorates.geojson")
    adm2_file = os.path.join(BOUNDARIES_DIR, "tunisia_adm2_delegations.geojson")

    gdf_adm1 = fetch_geoboundaries(GEOBOUNDARIES_ADM1_URL, adm1_file)
    gdf_adm2 = fetch_geoboundaries(GEOBOUNDARIES_ADM2_URL, adm2_file)

    # Standardize column names
    if "shapeName" in gdf_adm2.columns:
        gdf_adm2["delegation_name"] = gdf_adm2["shapeName"]
    elif "name" in gdf_adm2.columns:
        gdf_adm2["delegation_name"] = gdf_adm2["name"]
    else:
        gdf_adm2["delegation_name"] = [f"Delegation_{i+1}" for i in range(len(gdf_adm2))]

    if "shapeID" in gdf_adm2.columns:
        gdf_adm2["delegation_id"] = gdf_adm2["shapeID"]
    else:
        gdf_adm2["delegation_id"] = [f"DEL_{i+1:03d}" for i in range(len(gdf_adm2))]

    if "shapeName" in gdf_adm1.columns:
        gdf_adm1["governorate_name"] = gdf_adm1["shapeName"]
    elif "name" in gdf_adm1.columns:
        gdf_adm1["governorate_name"] = gdf_adm1["name"]
    else:
        gdf_adm1["governorate_name"] = [f"Gov_{i+1}" for i in range(len(gdf_adm1))]

    if "shapeID" in gdf_adm1.columns:
        gdf_adm1["governorate_id"] = gdf_adm1["shapeID"]
    else:
        gdf_adm1["governorate_id"] = [f"GOV_{i+1:02d}" for i in range(len(gdf_adm1))]

    # 2. Initial ~2km grid generation
    print("[*] Generating base 2km grid over Tunisia bounding box...")
    bbox = gdf_adm2.total_bounds
    gdf_grid = generate_spatial_grid(bbox, step_deg=0.018)

    # Spatial join with ADM2
    print("[*] Initial spatial join with ADM2 Delegation boundaries...")
    joined = gpd.sjoin(gdf_grid, gdf_adm2[["delegation_id", "delegation_name", "geometry"]], how="inner", predicate="intersects")

    # 3. Adaptive Fine Resampling for Low-Density (<10 points) Delegations
    resampled_grid = resample_low_density_delegations(gdf_adm2, joined, threshold=10, fine_step_deg=0.0035)

    # 4. Spatial join with ADM1 Governorates for complete administrative tagging
    print("[*] Tagging governorate IDs & names via ADM1 spatial join...")
    final_joined = gpd.sjoin(resampled_grid.drop(columns=["index_right"], errors="ignore"), 
                             gdf_adm1[["governorate_id", "governorate_name", "geometry"]], 
                             how="inner", predicate="intersects")

    print(f"[+] Total grid points across Tunisia after adaptive resampling: {len(final_joined)}")

    # 5. Point Density Sanity Check & Verification
    gdf_adm2_utm = gdf_adm2.to_crs(epsg=32632)
    gdf_adm2["area_km2"] = gdf_adm2_utm.geometry.area / 1e6

    point_counts = final_joined.groupby("delegation_id").size().reset_index(name="point_count")
    
    density_report = gdf_adm2[["delegation_id", "delegation_name", "area_km2"]].merge(point_counts, on="delegation_id", how="left")
    density_report["point_count"] = density_report["point_count"].fillna(0).astype(int)
    density_report["density_pts_per_km2"] = density_report["point_count"] / density_report["area_km2"]
    
    zero_dels = density_report[density_report["point_count"] == 0]
    low_dels = density_report[density_report["point_count"] < 10]

    print("\n-----------------------------------------------------------------")
    print(" UPDATED POINT DENSITY SANITY CHECK SUMMARY                       ")
    print("-----------------------------------------------------------------")
    print(f"Total Délégations (ADM2):        {len(density_report)}")
    print(f"Mean Points per Délégation:       {density_report['point_count'].mean():.2f}")
    print(f"Min Points per Délégation:        {density_report['point_count'].min()}")
    print(f"Max Points per Délégation:        {density_report['point_count'].max()}")
    print(f"Délégations with 0 points:        {len(zero_dels)} ({'CONFIRMED ZERO' if len(zero_dels)==0 else 'FAIL'})")
    print(f"Délégations with < 10 points:     {len(low_dels)} ({len(low_dels)/len(density_report)*100:.1f}%)")
    
    if len(zero_dels) > 0:
        print("\n[!] WARNING: Delegations with 0 points still exist:")
        print(zero_dels[["delegation_id", "delegation_name", "area_km2"]].to_string(index=False))

    # 6. Save Outputs
    output_cols = ["point_id", "latitude", "longitude", "governorate_id", "governorate_name", "delegation_id", "delegation_name"]
    df_output = final_joined[output_cols].copy()
    
    csv_out = os.path.join(PROCESSED_DIR, "tunisia_grid_delegations.csv")
    geojson_out = os.path.join(PROCESSED_DIR, "tunisia_grid_delegations.geojson")
    report_out = os.path.join(PROCESSED_DIR, "delegation_point_density_report.csv")

    df_output.to_csv(csv_out, index=False)
    final_joined[output_cols + ["geometry"]].to_file(geojson_out, driver="GeoJSON")
    density_report.to_csv(report_out, index=False)

    print(f"\n[+] Saved Patched Délégation-tagged Grid CSV -> {csv_out}")
    print(f"[+] Saved Patched Délégation-tagged Grid GeoJSON -> {geojson_out}")
    print(f"[+] Saved Patched Point Density Report -> {report_out}")
    print("=================================================================\n")

if __name__ == "__main__":
    main()
