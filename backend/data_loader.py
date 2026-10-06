"""
Dataset Downloader & Verifier for Parkinson's Voice Companion.
Fetches real, published UCI datasets:
1. Little et al. (2008) Oxford Parkinson's Disease Detection Dataset (parkinsons.data)
2. Sakar et al. (2019) Parkinson's Disease Classification Dataset (pd_speech_features.csv)
3. Tsanas et al. (2010) Parkinson's Telemonitoring Dataset (parkinsons_updrs.data)
"""
import os
import urllib.request
import zipfile
import io
import pandas as pd

DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
os.makedirs(DATA_DIR, exist_ok=True)

DATASETS = {
    "oxford_little_2008": {
        "url": "https://archive.ics.uci.edu/ml/machine-learning-databases/parkinsons/parkinsons.data",
        "alt_url": "https://archive.ics.uci.edu/static/public/174/parkinsons.zip",
        "target_file": os.path.join(DATA_DIR, "parkinsons.data"),
        "description": "Little et al. 2008 Oxford PD dataset (195 voice recordings, 31 subjects, 22 acoustic features)"
    },
    "sakar_speech_2019": {
        "url": "https://archive.ics.uci.edu/ml/machine-learning-databases/00470/pd_speech_features.csv",
        "alt_url": "https://archive.ics.uci.edu/static/public/470/parkinson+s+disease+classification.zip",
        "target_file": os.path.join(DATA_DIR, "pd_speech_features.csv"),
        "description": "Sakar et al. 2019 PD Speech Features dataset (756 recordings, 754 acoustic features)"
    },
    "tsanas_telemonitoring_2010": {
        "url": "https://archive.ics.uci.edu/ml/machine-learning-databases/parkinsons/telemonitoring/parkinsons_updrs.data",
        "alt_url": "https://archive.ics.uci.edu/static/public/189/parkinsons+telemonitoring.zip",
        "target_file": os.path.join(DATA_DIR, "parkinsons_updrs.data"),
        "description": "Tsanas et al. 2010 Telemonitoring dataset (5,875 recordings, 42 patients, motor & total UPDRS)"
    }
}

def download_file(url: str, dest_path: str, alt_zip_url: str = None):
    print(f"Fetching from {url}...")
    headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}
    try:
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=30) as response, open(dest_path, 'wb') as out_file:
            out_file.write(response.read())
        print(f"-> Successfully saved {dest_path} ({os.path.getsize(dest_path)} bytes)")
        return True
    except Exception as e:
        print(f"Direct download failed: {e}")
        if alt_zip_url:
            print(f"Trying zip fallback: {alt_zip_url}...")
            try:
                req = urllib.request.Request(alt_zip_url, headers=headers)
                with urllib.request.urlopen(req, timeout=30) as response:
                    zip_bytes = response.read()
                    with zipfile.ZipFile(io.BytesIO(zip_bytes)) as z:
                        for fname in z.namelist():
                            if fname.endswith(os.path.basename(dest_path)) or (dest_path.endswith(".csv") and fname.endswith(".csv")) or (dest_path.endswith(".data") and fname.endswith(".data")):
                                with open(dest_path, 'wb') as f:
                                    f.write(z.read(fname))
                                print(f"-> Extracted {fname} to {dest_path} ({os.path.getsize(dest_path)} bytes)")
                                return True
                        # If not matched directly, extract all
                        z.extractall(DATA_DIR)
                        print(f"-> Extracted zip archive to {DATA_DIR}")
                        return True
            except Exception as e2:
                print(f"Fallback zip download failed: {e2}")
    return False

def verify_datasets():
    print("=" * 60)
    print("VERIFYING RESEARCH DATASETS")
    print("=" * 60)
    
    for key, info in DATASETS.items():
        dest = info["target_file"]
        if not os.path.exists(dest) or os.path.getsize(dest) == 0:
            success = download_file(info["url"], dest, info.get("alt_url"))
            if not success:
                print(f"ERROR: Could not download {key}")
                continue
        
        # Load and verify contents
        try:
            if dest.endswith(".data") or dest.endswith(".csv"):
                # Check delimiter
                with open(dest, 'r') as f:
                    first_line = f.readline()
                sep = ',' if ',' in first_line else r'\s+'
                
                # Check if sakar header has 2 header rows
                if "pd_speech_features" in dest:
                    df = pd.read_csv(dest, header=1)
                else:
                    df = pd.read_csv(dest, sep=sep)
                
                print(f" Dataset: {key}")
                print(f"   Description: {info['description']}")
                print(f"   Shape: {df.shape[0]} rows x {df.shape[1]} columns")
                print(f"   Columns: {list(df.columns[:5])} ... {list(df.columns[-3:])}")
                if 'status' in df.columns:
                    print(f"   Target distribution ('status'): {df['status'].value_counts().to_dict()}")
                elif 'class' in df.columns:
                    print(f"   Target distribution ('class'): {df['class'].value_counts().to_dict()}")
                elif 'motor_UPDRS' in df.columns:
                    print(f"   UPDRS range: motor [{df['motor_UPDRS'].min():.1f}, {df['motor_UPDRS'].max():.1f}], total [{df['total_UPDRS'].min():.1f}, {df['total_UPDRS'].max():.1f}]")
                print("-" * 60)
        except Exception as e:
            print(f"Error inspecting {dest}: {e}")

if __name__ == "__main__":
    verify_datasets()
