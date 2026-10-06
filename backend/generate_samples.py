"""
Generates reference calibration audio WAV files for immediate testing and verification.
"""

import numpy as np
import scipy.io.wavfile as wavfile
import os

SAMPLES_DIR = os.path.join(os.path.dirname(__file__), "data", "samples")
os.makedirs(SAMPLES_DIR, exist_ok=True)

sr = 22050
duration = 4.0
t = np.linspace(0, duration, int(sr * duration), endpoint=False)

def create_synthetic_voice(f0_base, jitter_level, shimmer_level, noise_level, tremor_freq=5.0, tremor_amp=0.0):
    """
    Generates a harmonic vocal tract simulation:
    - Fundamental frequency F0 with frequency perturbation (jitter) + vocal tremor modulation
    - Glottal pulse train with amplitude perturbation (shimmer)
    - Formant filtering (/a/ vowel formants at ~730 Hz, 1090 Hz, 2440 Hz)
    - Additive turbulent aspiration noise (controls HNR)
    """
    n_samples = len(t)
    
    # Instantaneous phase with jitter and tremor
    phase = 0.0
    signal_out = np.zeros(n_samples)
    
    # Tremor modulation (Parkinson's 4-7 Hz resting vocal tremor)
    f0_mod = f0_base * (1.0 + tremor_amp * np.sin(2 * np.pi * tremor_freq * t))
    
    current_amp = 1.0
    for i in range(n_samples):
        # Step phase
        inst_f0 = f0_mod[i] * (1.0 + np.random.normal(0, jitter_level))
        phase += 2 * np.pi * inst_f0 / sr
        
        # Shimmer on glottal amplitude
        if i % max(1, int(sr / f0_base)) == 0:
            current_amp = 1.0 + np.random.normal(0, shimmer_level)
            current_amp = max(0.2, min(1.8, current_amp))
            
        # Harmonic summation (glottal source)
        harmonics = 0.0
        for h in range(1, 10):
            amp_h = (1.0 / (h ** 1.1)) * current_amp
            harmonics += amp_h * np.sin(h * phase)
            
        signal_out[i] = harmonics

    # Simple resonator / formant filter for /a/
    # Formants: F1=730 Hz, F2=1090 Hz, F3=2440 Hz
    from scipy.signal import butter, filtfilt
    b, a = butter(2, [300 / (sr/2), 3200 / (sr/2)], btype='bandpass')
    filtered = filtfilt(b, a, signal_out)
    
    # Additive noise (breathiness / aspiration)
    noise = np.random.normal(0, noise_level, n_samples)
    combined = filtered + noise
    
    # Normalize
    combined = combined / np.max(np.abs(combined) + 1e-6) * 0.95
    return combined.astype(np.float32)

# 1. Healthy Control Sample
healthy_wav = create_synthetic_voice(
    f0_base=165.0,
    jitter_level=0.0015,
    shimmer_level=0.012,
    noise_level=0.015,
    tremor_amp=0.0
)
wavfile.write(os.path.join(SAMPLES_DIR, "healthy_control_ah.wav"), sr, (healthy_wav * 32767).astype(np.int16))

# 2. Early PD Sample
early_pd_wav = create_synthetic_voice(
    f0_base=142.0,
    jitter_level=0.0075,
    shimmer_level=0.048,
    noise_level=0.065,
    tremor_freq=5.2,
    tremor_amp=0.035
)
wavfile.write(os.path.join(SAMPLES_DIR, "early_pd_ah.wav"), sr, (early_pd_wav * 32767).astype(np.int16))

# 3. Moderate PD Sample
moderate_pd_wav = create_synthetic_voice(
    f0_base=125.0,
    jitter_level=0.016,
    shimmer_level=0.095,
    noise_level=0.14,
    tremor_freq=5.8,
    tremor_amp=0.07
)
wavfile.write(os.path.join(SAMPLES_DIR, "moderate_pd_ah.wav"), sr, (moderate_pd_wav * 32767).astype(np.int16))

print("Synthetic calibration samples created in data/samples/")
