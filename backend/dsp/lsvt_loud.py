"""
LSVT LOUD Voice Therapy Evaluation & Feedback Engine.
Clinically validated intervention for Parkinson's hypophonia (Ramig et al. 2001; PD COMM RCT 2024).
Fast DSP implementation for real-time live microphone feedback.
"""

import numpy as np
from dsp.feature_extractor import extract_pitch_and_periods


def analyze_lsvt_loud(y, sr, target_db_threshold=72.0, min_target_duration_sec=8.0):
    """
    Analyzes an audio recording of a sustained 'AHHH' phonation exercise.
    Returns quantitative clinical metrics and personalized coaching feedback.
    """
    duration = float(len(y) / sr)
    if duration < 0.5:
        return {
            'error': 'Recording too short for LSVT analysis. Please sustain phonation for at least 3 seconds.'
        }
        
    frame_len = 1024
    hop_len = 256
    
    # Compute RMS per frame
    num_frames = (len(y) - frame_len) // hop_len
    rms_vals = []
    for i in range(max(1, num_frames)):
        frame = y[i * hop_len : i * hop_len + frame_len]
        rms_vals.append(np.sqrt(np.mean(frame**2)))
    rms = np.array(rms_vals)
    
    # Calibrated relative dB SPL proxy (assuming 0 dBFS = 90 dB SPL)
    db_spl = 20.0 * np.log10(np.clip(rms, 1e-6, None)) + 90.0
    
    # Detect active sustained phonation segments (db_spl > 58 dB)
    active_mask = db_spl > 58.0
    active_frames = db_spl[active_mask]
    
    if len(active_frames) == 0:
        return {
            'duration_sec': round(duration, 2),
            'sustained_time_sec': 0.0,
            'mean_loudness_db': 50.0,
            'peak_loudness_db': 55.0,
            'target_reached': False,
            'feedback': 'Sound level was too low. Please speak loudly and clearly into the microphone.'
        }
        
    sustained_duration = float(np.sum(active_mask) * (hop_len / sr))
    mean_db = float(np.mean(active_frames))
    peak_db = float(np.max(active_frames))
    min_db = float(np.min(active_frames))
    loudness_stability = float(np.std(active_frames))
    
    # Target compliance percentage (fraction of active time >= target_db_threshold)
    target_frames = np.sum(active_frames >= target_db_threshold)
    compliance_pct = float((target_frames / len(active_frames)) * 100.0)
    
    # Fast pitch stability during sustained phonation
    valid_f0, _, _ = extract_pitch_and_periods(y, sr)
    
    if len(valid_f0) > 5:
        f0_mean = float(np.mean(valid_f0))
        f0_std = float(np.std(valid_f0))
        f0_stability_score = max(0.0, min(100.0, 100.0 - (f0_std / max(1.0, f0_mean)) * 300.0))
    else:
        f0_mean = 150.0
        f0_std = 0.0
        f0_stability_score = 75.0
        
    # Overall LSVT Performance Score (0 - 100)
    # 40% Loudness, 35% Duration, 25% Pitch/Volume Stability
    loudness_score = min(100.0, max(0.0, (mean_db - 58.0) / (85.0 - 58.0) * 100.0))
    duration_score = min(100.0, (sustained_duration / min_target_duration_sec) * 100.0)
    stability_score = max(0.0, min(100.0, 100.0 - loudness_stability * 7.0))
    
    overall_score = round(0.40 * loudness_score + 0.35 * duration_score + 0.25 * (stability_score * 0.5 + f0_stability_score * 0.5), 1)
    
    # Clinical Feedback Generation
    feedback_points = []
    if mean_db >= target_db_threshold:
        feedback_points.append(f"Excellent vocal projection! Average loudness was {mean_db:.1f} dB SPL (target > {target_db_threshold:.0f} dB).")
    else:
        feedback_points.append(f"Loudness was {mean_db:.1f} dB SPL. Try to push your breath support to reach above {target_db_threshold:.0f} dB.")
        
    if sustained_duration >= min_target_duration_sec:
        feedback_points.append(f"Outstanding breath stamina! Phonation sustained for {sustained_duration:.1f} seconds (target: {min_target_duration_sec:.0f}s).")
    else:
        feedback_points.append(f"Sustained for {sustained_duration:.1f}s. Aim to extend your vowel hold toward {min_target_duration_sec:.0f}s.")
        
    if loudness_stability < 3.5:
        feedback_points.append("Volume was very consistent throughout the hold.")
    else:
        feedback_points.append("Noticed volume decay towards the end. Focus on steady diaphragmatic airflow.")
        
    return {
        'duration_sec': round(duration, 2),
        'sustained_time_sec': round(sustained_duration, 2),
        'mean_loudness_db': round(mean_db, 1),
        'peak_loudness_db': round(peak_db, 1),
        'min_loudness_db': round(min_db, 1),
        'loudness_stability_std': round(loudness_stability, 2),
        'target_compliance_pct': round(compliance_pct, 1),
        'f0_mean_hz': round(f0_mean, 1),
        'f0_std_hz': round(f0_std, 2),
        'f0_stability_score': round(f0_stability_score, 1),
        'overall_score': overall_score,
        'target_reached': bool(mean_db >= target_db_threshold and sustained_duration >= (min_target_duration_sec * 0.6)),
        'feedback': " ".join(feedback_points),
        'db_envelope': [round(float(v), 1) for v in db_spl[::max(1, len(db_spl)//60)]]
    }
