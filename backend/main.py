"""
FastAPI Server for Parkinson's Voice Companion.
Serves:
- Live microphone audio biomarker extraction & classification (SVM, RF, CNN-LSTM, Autoencoder)
- UPDRS Telemonitoring score prediction
- LSVT LOUD vocal loudness & duration coaching
- Motor finger-tapping analysis & multimodal fusion
- Longitudinal tracking & Bayesian Online Changepoint Detection (BOCPD)
- Research dataset provenance & model transparency
"""

import os
import sys
import io
import json
import joblib
import numpy as np
import pandas as pd
from fastapi import FastAPI, File, UploadFile, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse, FileResponse
from pydantic import BaseModel
from typing import List, Optional

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, BASE_DIR)
sys.path.insert(0, os.path.join(BASE_DIR, "ml"))

from dsp.feature_extractor import extract_all_biomarkers, load_audio
from dsp.lsvt_loud import analyze_lsvt_loud
from dsp.motor_tapping import analyze_finger_tapping, compute_multimodal_composite
from ml.longitudinal_tracker import LongitudinalTracker, generate_benchmark_longitudinal_profiles
from ml.deep_learning import Conv1DLSTMParkinsonsNet, HealthyVocalAutoencoder

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODELS_DIR = os.path.join(BASE_DIR, "models")
DATA_DIR = os.path.join(BASE_DIR, "data")

app = FastAPI(title="Parkinson's Voice Companion API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Load Models and Metadata into Memory
models = {}
metadata = {}

try:
    models['oxford_scaler'] = joblib.load(os.path.join(MODELS_DIR, "oxford_scaler.joblib"))
    models['oxford_svm'] = joblib.load(os.path.join(MODELS_DIR, "oxford_svm.joblib"))
    models['oxford_rf'] = joblib.load(os.path.join(MODELS_DIR, "oxford_rf.joblib"))
    models['oxford_gb'] = joblib.load(os.path.join(MODELS_DIR, "oxford_gb.joblib"))
    models['oxford_cnn_lstm'] = joblib.load(os.path.join(MODELS_DIR, "oxford_cnn_lstm.joblib"))
    models['oxford_autoencoder'] = joblib.load(os.path.join(MODELS_DIR, "oxford_autoencoder.joblib"))
    
    models['updrs_scaler'] = joblib.load(os.path.join(MODELS_DIR, "updrs_scaler.joblib"))
    models['updrs_motor_rf'] = joblib.load(os.path.join(MODELS_DIR, "updrs_motor_rf.joblib"))
    models['updrs_total_rf'] = joblib.load(os.path.join(MODELS_DIR, "updrs_total_rf.joblib"))
    
    with open(os.path.join(MODELS_DIR, "oxford_metadata.json"), "r") as f:
        metadata['oxford'] = json.load(f)
        
    with open(os.path.join(MODELS_DIR, "updrs_metadata.json"), "r") as f:
        metadata['updrs'] = json.load(f)
        
    if os.path.exists(os.path.join(MODELS_DIR, "sakar_metadata.json")):
        with open(os.path.join(MODELS_DIR, "sakar_metadata.json"), "r") as f:
            metadata['sakar'] = json.load(f)
            
    print("All ML models and research metadata loaded successfully!")
except Exception as e:
    print(f"Warning during model loading: {e}")

# In-Memory Longitudinal Trackers
user_trackers = {}
benchmark_profiles = generate_benchmark_longitudinal_profiles()


class TappingPayload(BaseModel):
    timestamps_ms: List[float]
    voice_pd_prob: Optional[float] = None
    voice_updrs: Optional[float] = None


class LongitudinalSessionPayload(BaseModel):
    patient_id: Optional[str] = "user_default"
    ppe: float
    jitter_percent: float
    shimmer_percent: float
    hnr: float
    predicted_updrs: float
    pd_probability: float
    med_status: Optional[str] = "ON"
    notes: Optional[str] = ""


@app.get("/api/info")
def get_info():
    """
    Returns research dataset provenance, model architectures, validation metrics,
    normative baseline values, and literature citations.
    """
    return {
        'status': 'active',
        'metadata': metadata,
        'research_papers': [
            {
                'citation': 'Little MA et al. (2009)',
                'title': 'Suitability of Dysphonia Measurements for Telemonitoring of Parkinson’s Disease',
                'journal': 'IEEE Transactions on Biomedical Engineering, 56(4), 1015-1022',
                'dataset': 'UCI Oxford Parkinson\'s Dataset (195 voice recordings, 31 subjects)',
                'key_findings': 'Nonlinear dysphonia measures (PPE, RPDE, DFA) + SVM/RF achieve >90% classification accuracy.'
            },
            {
                'citation': 'Tsanas A et al. (2010)',
                'title': 'Accurate Telemonitoring of Parkinson’s Disease Progression by Noninvasive Speech Tests',
                'journal': 'IEEE Transactions on Biomedical Engineering, 57(4), 884-893',
                'dataset': 'UCI Telemonitoring Dataset (5,875 recordings across 42 patients)',
                'key_findings': 'Acoustic biomarkers track Motor and Total UPDRS scores with mean absolute error of ~1.6 points.'
            },
            {
                'citation': 'Er et al. (2021)',
                'title': 'Deep Learning Frameworks for Parkinson’s Disease Voice Classification',
                'journal': 'Computers in Biology and Medicine',
                'key_findings': '1D Convolutional Neural Networks coupled with LSTM temporal units push diagnostic accuracy to ~95%.'
            },
            {
                'citation': 'Ramig LO et al. (2001) / PD COMM (2024)',
                'title': 'Intensive Voice Treatment (LSVT LOUD) for Patients with Parkinson’s Disease',
                'journal': 'Neurology & BMJ',
                'key_findings': 'Standardized vocal loudness intervention yields durable, clinically meaningful improvements in hypophonia.'
            },
            {
                'citation': 'Zhang et al. (2025)',
                'title': 'Multimodal Fusion of Smartphone Biomarkers in Parkinsonian Motor Fluctuation Monitoring',
                'journal': 'npj Digital Medicine',
                'key_findings': 'Multimodal fusion of acoustic features + rapid finger-tapping tests enhances sensitivity during medication off-phases.'
            }
        ]
    }


@app.post("/api/analyze-audio")
async def analyze_audio_endpoint(audio: UploadFile = File(...)):
    """
    Core analysis endpoint:
    1. Reads audio bytes (WAV, MP3, WebM, OGG).
    2. Deterministically extracts all 22 Little et al. Oxford acoustic biomarkers.
    3. Runs inference through trained models (SVM, Random Forest, Gradient Boosting, CNN-LSTM, Healthy Autoencoder).
    4. Predicts Motor-UPDRS and Total-UPDRS severity scores.
    5. Computes percentile comparison against normative healthy baselines.
    """
    try:
        contents = await audio.read()
        if len(contents) < 500:
            raise HTTPException(status_code=400, detail="Audio file too small or empty.")
            
        oxford_dict, extended_dict, quality_dict = extract_all_biomarkers(contents)
        
        feature_names = metadata['oxford']['feature_names']
        feat_vector = np.array([oxford_dict[f] for f in feature_names]).reshape(1, -1)
        
        # Scale for Oxford models
        scaler_ox = models['oxford_scaler']
        feat_scaled = scaler_ox.transform(feat_vector)
        
        # Model Predictions
        svm_model = models['oxford_svm']
        svm_prob = float(svm_model.predict_proba(feat_scaled)[0, 1])
        svm_pred = int(svm_model.predict(feat_scaled)[0])
        
        rf_model = models['oxford_rf']
        rf_prob = float(rf_model.predict_proba(feat_vector)[0, 1])
        rf_pred = int(rf_model.predict(feat_vector)[0])
        
        gb_model = models['oxford_gb']
        gb_prob = float(gb_model.predict_proba(feat_scaled)[0, 1])
        
        # Deep Learning CNN-LSTM
        cnn_lstm = models['oxford_cnn_lstm']
        dl_prob = float(cnn_lstm.forward(feat_scaled)[0])
        
        # Autoencoder Anomaly Score
        autoencoder = models['oxford_autoencoder']
        mse_rec, residuals, x_rec = autoencoder.compute_anomaly_score(feat_scaled)
        mse_val = float(mse_rec[0])
        healthy_mse_mean = metadata['oxford']['metrics']['autoencoder_anomaly']['healthy_baseline_mse']
        healthy_mse_std = metadata['oxford']['metrics']['autoencoder_anomaly']['healthy_baseline_std']
        anomaly_z_score = float((mse_val - healthy_mse_mean) / max(0.01, healthy_mse_std))
        
        # Ensemble Probability (Weighted combination of SVM, RF, and CNN-LSTM)
        ensemble_prob = float(0.40 * svm_prob + 0.35 * rf_prob + 0.25 * dl_prob)
        is_pd_flagged = bool(ensemble_prob >= 0.50)
        
        # UPDRS Telemonitoring Prediction
        # Prepare 16 features for Tsanas model:
        # ['MDVP:Fo(Hz)', 'MDVP:Fhi(Hz)', 'MDVP:Flo(Hz)', 'MDVP:Jitter(%)', 'MDVP:Jitter(Abs)', 'MDVP:RAP', 'MDVP:PPQ', 'Jitter:DDP', 'MDVP:Shimmer', 'MDVP:Shimmer(dB)', 'Shimmer:APQ3', 'Shimmer:APQ5', 'MDVP:APQ', 'Shimmer:DDA', 'NHR', 'HNR', 'RPDE', 'DFA', 'PPE']
        updrs_features = metadata['updrs']['feature_names']
        # Extract intersection from oxford_dict (providing default values if subject metadata not present)
        up_vec = []
        for f in updrs_features:
            if f in oxford_dict:
                up_vec.append(oxford_dict[f])
            elif f == 'age':
                up_vec.append(64.0)  # median cohort age
            elif f == 'sex':
                up_vec.append(0.0)
            elif f == 'test_time':
                up_vec.append(10.0)
            else:
                up_vec.append(0.0)
                
        up_vec = np.array(up_vec).reshape(1, -1)
        up_scaled = models['updrs_scaler'].transform(up_vec)
        
        pred_motor_updrs = float(models['updrs_motor_rf'].predict(up_scaled)[0])
        pred_total_updrs = float(models['updrs_total_rf'].predict(up_scaled)[0])
        
        # Calculate feature deviations compared to healthy normative baselines
        baselines = metadata['oxford']['normative_baselines']
        biomarker_comparisons = []
        
        for feat in ['PPE', 'spread1', 'spread2', 'MDVP:Jitter(%)', 'MDVP:Shimmer', 'HNR', 'RPDE', 'DFA', 'MDVP:Fo(Hz)']:
            val = oxford_dict[feat]
            h_mean = baselines[feat]['healthy_mean']
            h_std = baselines[feat]['healthy_std']
            pd_mean = baselines[feat]['pd_mean']
            
            z_score = (val - h_mean) / max(1e-6, h_std)
            
            # Clinical interpretation
            if feat == 'HNR':
                status = 'Healthy' if val >= 20.0 else 'Impaired / Breathiness'
            elif feat in ['PPE', 'MDVP:Jitter(%)', 'MDVP:Shimmer', 'RPDE', 'spread1']:
                status = 'Elevated / Dysphonic' if z_score > 1.5 else 'Within Normal Limits'
            else:
                status = 'Within Normal Limits' if abs(z_score) < 1.5 else 'Atypical'
                
            biomarker_comparisons.append({
                'feature': feat,
                'user_value': round(val, 4 if val < 1 else 2),
                'healthy_mean': round(h_mean, 4 if h_mean < 1 else 2),
                'pd_cohort_mean': round(pd_mean, 4 if pd_mean < 1 else 2),
                'z_score_vs_healthy': round(float(z_score), 2),
                'clinical_status': status
            })
            
        return {
            'success': True,
            'audio_quality': quality_dict,
            'classification': {
                'ensemble_pd_probability': round(ensemble_prob, 3),
                'ensemble_pd_percent': round(ensemble_prob * 100.0, 1),
                'is_pd_flagged': is_pd_flagged,
                'confidence': 'High' if (ensemble_prob > 0.80 or ensemble_prob < 0.20) else 'Moderate',
                'models': {
                    'svm': {'pd_probability': round(svm_prob, 3), 'predicted_class': svm_pred},
                    'random_forest': {'pd_probability': round(rf_prob, 3), 'predicted_class': rf_pred},
                    'gradient_boosting': {'pd_probability': round(gb_prob, 3)},
                    'cnn_lstm_deep_learning': {'pd_probability': round(dl_prob, 3)}
                }
            },
            'anomaly_detection': {
                'autoencoder_mse': round(mse_val, 4),
                'healthy_baseline_mse': round(healthy_mse_mean, 4),
                'anomaly_z_score': round(anomaly_z_score, 2),
                'is_anomaly_detected': bool(anomaly_z_score > 2.0)
            },
            'updrs_telemonitoring': {
                'predicted_motor_updrs': round(pred_motor_updrs, 1),
                'predicted_total_updrs': round(pred_total_updrs, 1),
                'severity_stage': 'Mild' if pred_total_updrs < 20 else ('Moderate' if pred_total_updrs < 35 else 'Advanced')
            },
            'extracted_biomarkers': oxford_dict,
            'biomarker_comparisons': biomarker_comparisons,
            'prosody': extended_dict.get('prosody', {})
        }
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/analyze-lsvt")
async def analyze_lsvt_endpoint(audio: UploadFile = File(...), target_db: float = Form(72.0)):
    """
    LSVT LOUD Voice Therapy Endpoint:
    Analyzes sustained 'AHHH' audio for duration, volume, target compliance, and pitch stability.
    """
    try:
        contents = await audio.read()
        y, sr = load_audio(contents)
        result = analyze_lsvt_loud(y, sr, target_db_threshold=target_db)
        return {'success': True, 'lsvt_metrics': result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/analyze-motor")
def analyze_motor_endpoint(payload: TappingPayload):
    """
    Analyzes rapid finger-tapping timestamps and optionally combines with voice predictions
    for multimodal fusion (Zhang et al. 2025).
    """
    try:
        res = analyze_finger_tapping(payload.timestamps_ms)
        if 'error' in res:
            return {'success': False, 'error': res['error']}
            
        multimodal = None
        if payload.voice_pd_prob is not None:
            multimodal = compute_multimodal_composite(
                payload.voice_pd_prob,
                payload.voice_updrs if payload.voice_updrs is not None else 20.0,
                res
            )
            
        return {
            'success': True,
            'motor_metrics': res,
            'multimodal_fusion': multimodal
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/longitudinal/profiles")
def get_longitudinal_profiles():
    """
    Returns benchmark longitudinal tracking profiles (Early PD patient with medication shifts,
    and healthy control cohorts) with Bayesian Online Changepoint Detection data.
    """
    return {
        'success': True,
        'profiles': benchmark_profiles
    }


@app.post("/api/longitudinal/record")
def record_longitudinal_session(payload: LongitudinalSessionPayload):
    """
    Adds a new patient recording session to the longitudinal tracker,
    computes running trends, and executes Bayesian Online Changepoint Detection.
    """
    pid = payload.patient_id or "user_default"
    if pid not in user_trackers:
        user_trackers[pid] = LongitudinalTracker(pid)
        
    tracker = user_trackers[pid]
    record = tracker.add_session(payload.model_dump())
    summary = tracker.get_longitudinal_summary()
    
    return {
        'success': True,
        'latest_record': record,
        'longitudinal_summary': summary
    }


@app.get("/api/samples/{filename}")
def get_sample_audio(filename: str):
    """
    Serves calibration audio WAV files for instantaneous browser testing.
    """
    sample_path = os.path.join(DATA_DIR, "samples", filename)
    if os.path.exists(sample_path):
        return FileResponse(sample_path, media_type="audio/wav", filename=filename)
    raise HTTPException(status_code=404, detail=f"Sample file {filename} not found.")


# Mount static frontend files if directory exists
FRONTEND_DIR = os.path.join(os.path.dirname(BASE_DIR), "frontend")
if os.path.exists(FRONTEND_DIR):
    # Mount assets subdirectory first (more specific path)
    assets_dir = os.path.join(FRONTEND_DIR, "assets")
    if os.path.exists(assets_dir):
        app.mount("/static/assets", StaticFiles(directory=assets_dir), name="assets")
    app.mount("/static", StaticFiles(directory=FRONTEND_DIR), name="static")
    
    @app.get("/")
    def serve_frontend_root():
        return FileResponse(os.path.join(FRONTEND_DIR, "index.html"))
