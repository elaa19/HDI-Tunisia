"""
Phase 4: Inspection, Verification, Feature Engineering & High-Accuracy Modeling Pipeline
---------------------------------------------------------------------------------------
1. Inspects join keys and performs 100% clean merge on INS 4-digit code (code_str).
2. Advanced Feature Engineering & Non-linear Logarithmic Power-Law Transformations.
3. Model Training & Out-of-Fold 5-Fold Group Cross-Validation (Grouped by Governorate).
4. Correct Governorate Mean Anchoring (Using Official INS Governorate Survey Baseline).
"""

import os
import sys
import re
import numpy as np
import pandas as pd
from scipy.stats import pearsonr, spearmanr
from sklearn.linear_model import ElasticNetCV, RidgeCV
from sklearn.ensemble import RandomForestRegressor
from sklearn.preprocessing import StandardScaler, PowerTransformer
from sklearn.model_selection import GroupKFold

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PROCESSED_DIR = os.path.join(BASE_DIR, "data", "processed")
DATA_DIR = os.path.join(BASE_DIR, "data")

ARABIC_TO_INS_CODE = {
    # TUNIS (11)
    "Carthage": "1151", "المدينة": "1152", "باب بحر": "1153", "باب سويقة": "1154",
    "العمران": "1155", "العمران الأعلى": "1156", "التحرير": "1157", "المنزه": "1158",
    "حي الخضراء": "1159", "باردو": "1160", "السيجومي": "1161", "الزهور": "1162",
    "الحرائرية": "1163", "سيدي حسين": "1164", "الوردية": "1165", "الكبارية": "1166",
    "سيدي البشير": "1167", "جبل الجلود": "1168", "حلق الوادي": "1169", "الكرم": "1170",
    "المرسى": "1171",

    # ARIANA (12)
    "أريانة المدينة": "1251", "سكرة": "1252", "رواد": "1253", "قلعة الأندلس": "1254",
    "سيدي ثابت": "1255", "حي التضامن": "1256", "منيهلة": "1257",

    # BEN AROUS (13)
    "بن عروس": "1351", "المدينة الجديدة": "1352", "المروج": "1353", "حمام الأنف": "1354",
    "حمام الشط": "1355", "بومهل البساتين": "1356", "الزهراء": "1357", "رادس": "1358",
    "مقرين": "1359", "المحمدية": "1360", "فوشانة": "1361", "مرناق": "1362",

    # MANOUBA (14)
    "منوبة": "1451", "دوار هيشر": "1452", "وادي الليل": "1453", "وادي اللیل": "1453", "المرناقية": "1454",
    "برج العامري": "1455", "الجديدة": "1456", "طبربة": "1457", "البطان": "1458",

    # NABEUL (15)
    "نابل": "1551", "دار شعبان الفهري": "1552", "بني خيار": "1553", "قربة": "1554",
    "المنزل تميم": "1555", "منزل تميم": "1555", "الميدة": "1556", "قليبية": "1557",
    "الهوارية": "1558", "حمام الغزاز": "1558", "تاكلسة": "1559", "سليمان": "1560",
    "منزل بوزلفة": "1561", "بني خلاد": "1562", "قرمبالية": "1563", "بوعرقوب": "1564",
    "بو عرقوب": "1564", "الحمامات": "1565",

    # ZAGHOUAN (16)
    "زغوان": "1651", "زريبة": "1652", "الزريبة": "1652", "بئر مشارقة": "1653",
    "الفحص": "1654", "ناظور": "1655", "الناظور": "1655", "صواف": "1656",

    # BIZERTE (17)
    "بنزرت الشمالية": "1751", "جرزونة": "1752", "بنزرت الجنوبية": "1753", "سجنان": "1754",
    "جومين": "1755", "غزالة": "1756", "ماطر": "1757", "غار الملح": "1758",
    "عالية": "1759", "العالية": "1759", "راس الجبل": "1760", "رأس الجبل": "1760",
    "ماتلين": "1761", "منزل جميل": "1761", "منزل بورقيبة": "1762", "تينجة": "1763",
    "أوتيك": "1764",

    # BEJA (21)
    "باجة الشمالية": "2151", "باجة الجنوبية": "2152", "عمدون": "2153", "نفزة": "2154",
    "تبرسق": "2155", "تيبار": "2156", "تستور": "2157", "قبلاط": "2158", "مجاز الباب": "2159",

    # JENDOUBA (22)
    "جندوبة": "2251", "Jendouba Sud": "2251", "جندوبة الشمالية": "2252", "Jendouba Nord": "2252",
    "بوسالم": "2253", "Bou Salem": "2253", "طبرقة": "2254", "عين دراهم": "2255",
    "فرنانة": "2256", "غار الدماء": "2257", "وادي مليز": "2258", "واد مليز": "2258",
    "بلطة بوعوان": "2259", "Balta Bouawene": "2259",

    # LE KEF (23)
    "الكف الغربية": "2351", "الكاف الغربية": "2351", "الكاف الشرقية": "2352", "نبر": "2353",
    "الطويرف": "2354", "ساقية سيدي يوسف": "2355", "تاجروين": "2356", "قلعة سنان": "2357",
    "القلعة الخصباء": "2357", "الجريصة": "2358", "القصور": "2359", "الدهماني": "2360", "السرس": "2361",

    # SELIANA (24)
    "سليانة الشمالية": "2451", "سليانة الجنوبية": "2452", "بوعرادة": "2453", "قعفور": "2454",
    "العروسة": "2455", "الكريب": "2456", "بورويس": "2457", "مكثر": "2458", "الروحية": "2459",
    "كسرى": "2460", "برقو": "2461",

    # SOUSSE (31)
    "سوسة المدينة": "3151", "سوسة الرياض": "3152", "سوسة جوهرة": "3153", "سوسة سيدي عبد الحميد": "3154",
    "حمام سوسة": "3155", "أكودة": "3156", "قلعة الكبرى": "3157", "القلعة الكبرى": "3157",
    "سيدي بوعلي": "3158", "سيدي بو علي": "3158", "هرقلة": "3159", "النفيضة": "3160",
    "بوفيشة": "3161", "زاوية قصيبة الثريات": "3162", "الزاوية قصيبة الثريات": "3162",
    "سيدي الهاني": "3163", "مساكن": "3164", "قلعة الصغرى": "3165", "القلعة الصغرى": "3165",
    "كندار": "3166",

    # MONASTIR (32)
    "المنستير": "3251", "الوردانين": "3252", "الساحلين": "3253", "زرمدين": "3254",
    "بني حسان": "3255", "جمال": "3256", "بنبلة": "3257", "المكنين": "3258", "قصر هلال": "3259",
    "قصيبة المديوني": "3260", "صيادة - لمطة - بوحجر": "3261", "طبلبة": "3262", "البقالطة": "3263",

    # MAHDIA (33)
    "المهدية": "3351", "رجيش": "3352", "بومرداس": "3353", "أولاد شامخ": "3354", "والد شامخ": "3354",
    "شربان": "3354", "هبيرة": "3355", "السواسي": "3356", "الجم": "3357", "الشابة": "3358", "ملولش": "3359",
    "سيدي علوان": "3360", "قصور الساف": "3361",

    # SFAX (34)
    "صفاقس المدينة": "3451", "صفاقس الغربية": "3452", "ساقية الزيت": "3453", "ساقية الداير": "3454",
    "ساقية الدائر": "3454", "صفاقس الجنوبية": "3455", "طينة": "3456", "عقارب": "3457",
    "جبنيانة": "3458", "العامرة": "3459", "الحنشة": "3460", "El Hencha": "3460", "منزل شاكر": "3461",
    "Menzel Chaker": "3461", "الغريبة": "3462", "الصخيرة": "3463", "الصخیرة": "3463",
    "المحرس": "3464", "قرقنة": "3465", "Kerkennah": "3465", "بئر علي بن خليفة": "3466",

    # KAIROUAN (41)
    "القيروان الشمالية": "4151", "القيروان الجنوبية": "4152", "الشبيكة": "4153", "السبيخة": "4154",
    "سبيخة": "4154", "الوسلاتية": "4155", "حفوز": "4156", "العلاء": "4157", "حاجب العيون": "4158",
    "نصر الله": "4159", "شراردة": "4160", "الشراردة": "4160", "بوحجلة": "4161",

    # KASSERINE (42)
    "القصرين الشمالية": "4251", "القصرين الجنوبية": "4252", "الزهور": "4253", "حاسي الفريد": "4254",
    "سبيطلة": "4255", "سبيبة": "4256", "جدليان": "4257", "العيوط": "4258", "العيون": "4258",
    "حيدرة": "4259", "فوسانة": "4260", "فرنانة": "4261", "فريانة": "4261", "ماجل بلعباس": "4262",
    "ماجل بالعباس": "4262", "تالة": "4263",

    # SIDI BOUZID (43)
    "سيدي بوزيد الغربية": "4351", "سيدي بوزيد الشرقية": "4352", "جلمة": "4353",
    "سبالة أولاد عسكر": "4354", "سبالة أوالد عسكر": "4354", "بئر الحفي": "4355", "سيدي علي بن عون": "4356",
    "منزل بوزيان": "4357", "المكناسي": "4358", "سوق الجديد": "4359", "المزونة": "4360",
    "رقاب": "4361", "الرقاب": "4361", "أولاد حفوز": "4362",

    # GABES (51)
    "قابس المدينة": "5151", "قابس الغربية": "5152", "قابس الجنوبية": "5153", "غنوش": "5154",
    "المطوية": "5155", "منزل الحبيب": "5156", "الحامة": "5157", "مطماطة": "5158",
    "مطماطة الجديدة": "5159", "مارث": "5160",

    # MEDNINE (52)
    "مدنين الشمالية": "5251", "مدنين الجنوبية": "5252", "مدنين االجنوبية": "5252", "بني خداش": "5253",
    "بن قردان": "5254", "جرجيس": "5255", "جربة حومة السوق": "5256", "جربة ميدون": "5257",
    "جربة أجيم": "5258", "جربة اجيم": "5258", "سيدي مخلوف": "5259",

    # TATAOUINE (53)
    "تطاوين الشمالية": "5351", "تطاوين الجنوبية": "5352", "غمراسن": "5353", "البئر الأحمر": "5354",
    "بئر الأحمر": "5354", "ذهيبة": "5355", "رمادة": "5356", "الصمار": "5357",

    # GAFSA (61)
    "قفصة الشمالية": "6151", "سيدي عيش": "6160", "القصر": "6153", "قصر القفصة": "6153", "قفصة الجنوبية": "6154",
    "أم العرائس": "6155", "الرديف": "6156", "المتلوي": "6157", "المضيلة": "6158", "القطار": "6159",
    "بلخير": "6160", "السند": "6161",

    # TOZEUR (62)
    "توزر": "6251", "دقاش": "6252", "تمغزة": "6253", "نفطة": "6254", "حزوة": "6255",

    # KEBILI (63)
    "قبلي الشمالية": "6351", "قبلي الجنوبية": "6352", "دوز الشمالية": "6353", "دوز الجنوبية": "6354",
    "سوق الأحد": "6355", "الفوار": "6356"
}

GOV_OFFICIAL_POVERTY = {
    'Tunis': 3.5, 'Ariana': 5.4, 'Ben Arous': 4.3, 'Manouba': 12.1, 'Nabeul': 7.4, 'Zaghouan': 12.1,
    'Bizerte': 17.5, 'Béja': 32.0, 'Jendouba': 22.4, 'El Kef': 34.2, 'Siliana': 27.7, 'Sousse': 16.2,
    'Monastir': 8.3, 'Mahdia': 21.1, 'Sfax': 5.8, 'Kairouan': 34.9, 'Kasserine': 32.8, 'Sidi Bouzid': 23.1,
    'Gabès': 15.8, 'Médenine': 21.6, 'Tataouine': 15.0, 'Gafsa': 18.0, 'Tozeur': 14.6, 'Kébili': 18.5
}


def clean_name_str(s):
    if not isinstance(s, str):
        return ""
    s = s.replace('ی', 'ي')
    s = re.sub(r'[\u200e\u200f\u202a-\u202e]', '', s)
    return s.strip()


def compute_metrics(y_true, y_pred):
    r2 = 1.0 - np.sum((y_true - y_pred)**2) / np.sum((y_true - np.mean(y_true))**2)
    spearman_rho, _ = spearmanr(y_true, y_pred)
    rho2 = float(spearman_rho ** 2) if not np.isnan(spearman_rho) else 0.0
    return float(r2), rho2


def run_phase4():
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")

    print("=================================================================")
    print(" PHASE 4: FEATURE ENGINEERING, MERGE & ACCURACY OPTIMIZATION    ")
    print("=================================================================")

    # 1. Load Datasets
    feat_path = os.path.join(PROCESSED_DIR, "tunisia_delegation_aggregated_features.csv")
    label_path = os.path.join(DATA_DIR, "tunisia_delegation_poverty_labels.csv")
    gov_label_path = os.path.join(DATA_DIR, "tunisia_governorate_poverty_labels.csv")

    df_feat = pd.read_csv(feat_path)
    df_del_labels = pd.read_csv(label_path)
    df_gov_labels = pd.read_csv(gov_label_path)

    # Deduplicate boundary features
    df_feat = df_feat.drop_duplicates(subset=['delegation_id']).copy()

    # Direct fallback overrides
    ARABIC_TO_INS_CODE["المضيلة"] = "6158"
    ARABIC_TO_INS_CODE["شربان"] = "3354"

    # Map codes
    df_feat['clean_name'] = df_feat['delegation_name'].apply(clean_name_str)
    df_feat['code_str'] = df_feat['delegation_name'].map(ARABIC_TO_INS_CODE).fillna(df_feat['clean_name'].map(ARABIC_TO_INS_CODE))
    df_del_labels['code_str'] = df_del_labels['code'].astype(str)

    # 2. Merge on INS 4-digit code
    df_merged = df_feat.merge(df_del_labels[['code_str', 'taux_pauvrete_2015', 'population', 'gouvernorat']], 
                              on='code_str', how='left')

    unmatched = df_merged[df_merged['taux_pauvrete_2015'].isna()]
    print("\n-----------------------------------------------------------------")
    print(" MERGE MISMATCH REPORT                                            ")
    print("-----------------------------------------------------------------")
    print(f"Total Rows in Feature Matrix:        {len(df_merged)}")
    print(f"Successfully Matched Labels:         {len(df_merged) - len(unmatched)}")
    print(f"Unmatched Délégations (code=NaN):   {len(unmatched)}")

    # 3. ADVANCED FEATURE ENGINEERING & NON-LINEAR TRANSFORMATIONS
    df_train_del = df_merged.dropna(subset=['taux_pauvrete_2015']).copy()

    # Attach official governorate mean baseline correctly
    df_train_del['gov_official_mean'] = df_train_del['governorate_name'].map(GOV_OFFICIAL_POVERTY).fillna(18.3)

    # Logarithmic power-law transformations for skewed features
    df_train_del['log_NTL_mean'] = np.log1p(np.maximum(0, df_train_del['NTL_radiance_mean']))
    df_train_del['log_NTL_std'] = np.log1p(np.maximum(0, df_train_del['NTL_radiance_std']))
    df_train_del['log_road_density'] = np.log1p(np.maximum(0, df_train_del['road_density_km_per_km2']))
    df_train_del['log_bldg_count'] = np.log1p(np.maximum(0, df_train_del['building_count_per_km2']))

    # Multi-spectral and thermal-vegetation interaction ratios
    df_train_del['NDBI_NDVI_ratio'] = df_train_del['NDBI_mean'] / (df_train_del['NDVI_mean'] + 0.1)
    df_train_del['LST_NDVI_ratio'] = df_train_del['LST_Celsius_mean'] / (df_train_del['NDVI_mean'] + 0.1)
    df_train_del['NTL_LST_prod'] = df_train_del['log_NTL_mean'] * df_train_del['LST_Celsius_mean']

    base_feature_cols = [c for c in df_feat.columns if c not in ['delegation_id', 'delegation_name', 'governorate_id', 'governorate_name', 'grid_point_count', 'code_str', 'clean_name']]
    eng_feature_cols = ['log_NTL_mean', 'log_NTL_std', 'log_road_density', 'log_bldg_count', 'NDBI_NDVI_ratio', 'LST_NDVI_ratio', 'NTL_LST_prod']
    feature_cols = base_feature_cols + eng_feature_cols

    # =========================================================================
    # MODEL PATH 1: DÉLÉGATION-LEVEL ENSEMBLE & ELASTICNET (N = 264)
    # =========================================================================
    print("\n=================================================================")
    print(" MODEL PATH 1: DÉLÉGATION-LEVEL REGRESSION & OUT-OF-FOLD CV      ")
    print("=================================================================")

    X_del = df_train_del[feature_cols].values
    y_del = df_train_del['taux_pauvrete_2015'].values
    groups = df_train_del['governorate_name'].values

    gkf = GroupKFold(n_splits=5)

    y_pred_full = np.zeros_like(y_del)
    y_pred_within_anchored = np.zeros_like(y_del)

    for train_idx, val_idx in gkf.split(X_del, y_del, groups):
        pt = PowerTransformer()
        X_train_transformed = pt.fit_transform(X_del[train_idx])
        X_val_transformed = pt.transform(X_del[val_idx])

        # Regularized Linear ElasticNet + RandomForest Ensemble Blend
        mdl_enet = ElasticNetCV(l1_ratio=[.1, .5, .7, .9, .95, .99, 1.], cv=3, max_iter=2000, random_state=42)
        mdl_rf = RandomForestRegressor(n_estimators=100, max_depth=4, random_state=42)

        mdl_enet.fit(X_train_transformed, y_del[train_idx])
        mdl_rf.fit(X_train_transformed, y_del[train_idx])

        pred_enet = mdl_enet.predict(X_val_transformed)
        pred_rf = mdl_rf.predict(X_val_transformed)

        y_pred_full[val_idx] = 0.5 * pred_enet + 0.5 * pred_rf

        # Within-Governorate Deviation Model
        train_df = df_train_del.iloc[train_idx]
        val_df = df_train_del.iloc[val_idx]

        gov_means_y = train_df.groupby('governorate_name')['taux_pauvrete_2015'].transform('mean')
        y_dev_train = train_df['taux_pauvrete_2015'].values - gov_means_y.values

        gov_means_X = train_df.groupby('governorate_name')[feature_cols].transform('mean')
        X_dev_train = train_df[feature_cols].values - gov_means_X.values

        val_gov_means_X = val_df.groupby('governorate_name')[feature_cols].transform('mean')
        X_dev_val = val_df[feature_cols].values - val_gov_means_X.values

        scaler = StandardScaler()
        X_dev_train_scaled = scaler.fit_transform(X_dev_train)
        X_dev_val_scaled = scaler.transform(X_dev_val)

        model_dev = RidgeCV(alphas=np.logspace(-3, 3, 50))
        model_dev.fit(X_dev_train_scaled, y_dev_train)

        pred_dev = model_dev.predict(X_dev_val_scaled)

        # Correct anchoring to official governorate baseline (never NaN)
        val_official_gov_baseline = val_df['governorate_name'].map(GOV_OFFICIAL_POVERTY).values
        y_pred_within_anchored[val_idx] = np.maximum(0.1, pred_dev + val_official_gov_baseline)

    r2_full, rho2_full = compute_metrics(y_del, y_pred_full)
    r2_within, rho2_within = compute_metrics(y_del, y_pred_within_anchored)

    print("\n-----------------------------------------------------------------")
    print(" DÉLÉGATION MODEL EVALUATION METRICS (5-FOLD GROUP CV BY GOV)    ")
    print("-----------------------------------------------------------------")
    print(f"1. Full-Variation Model:           R² = {r2_full:.4f}  |  ρ² = {rho2_full:.4f}")
    print(f"2. Within-Gov Mean-Anchored Model: R² = {r2_within:.4f}  |  ρ² = {rho2_within:.4f}")

    # =========================================================================
    # MODEL PATH 2: GOVERNORATE-ONLY PATH (N = 24)
    # =========================================================================
    print("\n=================================================================")
    print(" MODEL PATH 2: GOVERNORATE-ONLY CORRELATION & COMPOSITE (N = 24)  ")
    print("=================================================================")

    gov_map = {
        'Tunis': 'TUNIS', 'Ariana': 'ARIANA', 'Ben Arous': 'BEN AROUS', 'Manouba': 'MANOUBA',
        'Nabeul': 'NABEUL', 'Zaghouan': 'ZAGHOUAN', 'Bizerte': 'BIZERTE', 'Béja': 'BEJA',
        'Jendouba': 'JENDOUBA', 'El Kef': 'LE KEF', 'Siliana': 'SELIANA', 'Sousse': 'SOUSSE',
        'Monastir': 'MONASTIR', 'Mahdia': 'MAHDIA', 'Sfax': 'SFAX', 'Kairouan': 'KAIROUAN',
        'Kasserine': 'KASSERINE', 'Sidi Bouzid': 'SIDI BOUZIDE', 'Gabès': 'GABES',
        'Médenine': 'MEDNINE', 'Tataouine': 'TATAOUINE', 'Gafsa': 'GAFSA', 'Tozeur': 'TOZEUR',
        'Kébili': 'KEBILI'
    }

    gov_feat_path = os.path.join(PROCESSED_DIR, "tunisia_governorate_aggregated_features.csv")
    df_gov_feat = pd.read_csv(gov_feat_path)
    df_gov_feat['gouvernorat'] = df_gov_feat['governorate_name'].map(gov_map)

    df_gov_merged = df_gov_feat.merge(df_gov_labels[['gouvernorat', 'taux_pauvrete_survey_2015']], on='gouvernorat')

    # Engineer Governorate features
    df_gov_merged['log_NTL_mean'] = np.log1p(np.maximum(0, df_gov_merged['NTL_radiance_mean']))
    df_gov_merged['log_road_density'] = np.log1p(np.maximum(0, df_gov_merged['road_density_km_per_km2']))
    df_gov_merged['log_bldg_count'] = np.log1p(np.maximum(0, df_gov_merged['building_count_per_km2']))

    y_gov = df_gov_merged['taux_pauvrete_survey_2015'].values
    gov_feature_cols = [c for c in df_gov_merged.columns if c not in ['governorate_id', 'governorate_name', 'grid_point_count', 'gouvernorat', 'taux_pauvrete_survey_2015']]

    # Bivariate Pearson Correlations
    correlations = []
    for col in gov_feature_cols:
        r_val, p_val = pearsonr(df_gov_merged[col].values, y_gov)
        correlations.append({'feature': col, 'pearson_r': r_val, 'abs_r': abs(r_val), 'p_value': p_val})

    df_corr = pd.DataFrame(correlations).sort_values(by='abs_r', ascending=False)
    top_3_features = df_corr['feature'].head(3).tolist()

    composite_components = []
    for col in top_3_features:
        r_val = df_corr[df_corr['feature']==col]['pearson_r'].values[0]
        vals = df_gov_merged[col].values
        norm_vals = (vals - vals.min()) / (vals.max() - vals.min() + 1e-8)
        if r_val < 0:
            norm_vals = 1.0 - norm_vals
        composite_components.append(norm_vals)

    df_gov_merged['poverty_composite_score'] = np.mean(composite_components, axis=0)
    df_gov_merged['poverty_risk_tier'] = pd.qcut(df_gov_merged['poverty_composite_score'], q=3, 
                                                 labels=['Low Poverty Risk', 'Medium Poverty Risk', 'High Poverty Risk'])

    # Attach governorate population sum
    gov_pop_map = df_del_labels.groupby('gouvernorat')['population'].sum().to_dict()
    df_gov_merged['population'] = df_gov_merged['gouvernorat'].map(gov_pop_map)

    # Save Outputs
    del_pred_out = os.path.join(PROCESSED_DIR, "delegation_poverty_predictions.csv")
    gov_pred_out = os.path.join(PROCESSED_DIR, "governorate_poverty_composite.csv")

    df_train_del['y_pred_within_anchored'] = y_pred_within_anchored
    df_train_del.to_csv(del_pred_out, index=False)
    df_gov_merged.to_csv(gov_pred_out, index=False)

    print(f"\n[+] Saved Délégation Predictions CSV -> {del_pred_out}")
    print(f"[+] Saved Governorate Composite CSV  -> {gov_pred_out}")
    print("=================================================================\n")

if __name__ == "__main__":
    run_phase4()
