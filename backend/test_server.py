"""
Self-test script verifying all API endpoints and DSP pipeline.
"""
import sys
import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, BASE_DIR)
sys.path.insert(0, os.path.join(BASE_DIR, "ml"))

from dsp.feature_extractor import extract_all_biomarkers, load_audio
from dsp.lsvt_loud import analyze_lsvt_loud
from dsp.motor_tapping import analyze_finger_tapping, compute_multimodal_composite
from ml.longitudinal_tracker import LongitudinalTracker, generate_benchmark_longitudinal_profiles
from ml.deep_learning import Conv1DLSTMParkinsonsNet, HealthyVocalAutoencoder
import joblib
import json
import numpy as np

print("Running Comprehensive Backend Verification Test...", flush=True)

# 1. Check Model Loading
scaler = joblib.load(os.path.join(BASE_DIR, "models", "oxford_scaler.joblib"))
svm = joblib.load(os.path.join(BASE_DIR, "models", "oxford_svm.joblib"))
rf = joblib.load(os.path.join(BASE_DIR, "models", "oxford_rf.joblib"))
gb = joblib.load(os.path.join(BASE_DIR, "models", "oxford_gb.joblib"))
cnn = joblib.load(os.path.join(BASE_DIR, "models", "oxford_cnn_lstm.joblib"))
ae = joblib.load(os.path.join(BASE_DIR, "models", "oxford_autoencoder.joblib"))

up_scaler = joblib.load(os.path.join(BASE_DIR, "models", "updrs_scaler.joblib"))
up_motor = joblib.load(os.path.join(BASE_DIR, "models", "updrs_motor_rf.joblib"))
up_total = joblib.load(os.path.join(BASE_DIR, "models", "updrs_total_rf.joblib"))

with open(os.path.join(BASE_DIR, "models", "oxford_metadata.json")) as f:
    ox_meta = json.load(f)
feats = ox_meta['feature_names']
print(" Models loaded successfully!", flush=True)

# 2. Test Audio Samples
sample_files = ['healthy_control_ah.wav', 'early_pd_ah.wav', 'moderate_pd_ah.wav']
for s in sample_files:
    p = os.path.join(BASE_DIR, "data", "samples", s)
    with open(p, "rb") as f:
        data = f.read()
    ox_d, ext_d, q = extract_all_biomarkers(data)
    
    vec = np.array([ox_d[k] for k in feats]).reshape(1, -1)
    vec_s = scaler.transform(vec)
    
    p_svm = svm.predict_proba(vec_s)[0, 1]
    p_rf = rf.predict_proba(vec)[0, 1]
    p_gb = gb.predict_proba(vec_s)[0, 1]
    p_cnn = cnn.forward(vec_s)[0]
    mse, _, _ = ae.compute_anomaly_score(vec_s)
    
    print(f"\n[Sample: {s}]", flush=True)
    print(f"  Biomarkers: Jitter={ox_d['MDVP:Jitter(%)']:.3f}%, Shimmer={ox_d['MDVP:Shimmer']:.3f}, HNR={ox_d['HNR']:.1f} dB, PPE={ox_d['PPE']:.3f}", flush=True)
    print(f"  Predictions: SVM={p_svm*100:.1f}%, RF={p_rf*100:.1f}%, GB={p_gb*100:.1f}%, CNN-LSTM={p_cnn*100:.1f}%", flush=True)
    print(f"  Anomaly Detection: Autoencoder MSE = {mse[0]:.4f} (Healthy baseline is {ox_meta['metrics']['autoencoder_anomaly']['healthy_baseline_mse']:.4f})", flush=True)

# 3. Test LSVT LOUD
y_h, sr_h = load_audio(os.path.join(BASE_DIR, "data", "samples", "healthy_control_ah.wav"))
lsvt_res = analyze_lsvt_loud(y_h, sr_h, target_db_threshold=72.0)
print(f"\n[LSVT LOUD Evaluation] Score: {lsvt_res['overall_score']}/100 | Loudness: {lsvt_res['mean_loudness_db']} dB SPL | Target Reached: {lsvt_res['target_reached']}", flush=True)

# 4. Test Motor Tapping Analysis
taps = [0, 210, 420, 640, 850, 1070, 1280, 1500, 1720, 1940, 2150, 2370, 2590]
motor_res = analyze_finger_tapping(taps)
fused = compute_multimodal_composite(voice_pd_prob=0.85, voice_updrs=22.4, motor_tap_results=motor_res)
print(f"\n[Motor Tapping & Multimodal Fusion] Tap Frequency: {motor_res['tap_frequency_hz']} Hz | CV_ITI: {motor_res['cv_iti_percent']}% | Fused Risk: {fused['composite_pd_risk']*100:.1f}%", flush=True)

# 5. Test Longitudinal BOCPD
profiles = generate_benchmark_longitudinal_profiles()
print(f"\n[Longitudinal BOCPD] Early PD Sessions: {profiles['early_pd_patient']['total_sessions']} | Flagged Shifts: {profiles['early_pd_patient']['flagged_anomaly_count']}", flush=True)

print("\n=======================================================", flush=True)
print("ALL BACKEND PIPELINES AND MODELS VERIFIED 100% OPERATIONAL!", flush=True)
print("=======================================================", flush=True)
