import os
import urllib.request
import json

boundary = '----FormBoundary123'
sample_path = os.path.join(os.path.dirname(__file__), "data", "samples", "early_pd_ah.wav")
with open(sample_path, 'rb') as f:
    fb = f.read()

head = f'--{boundary}\r\nContent-Disposition: form-data; name="audio"; filename="early_pd_ah.wav"\r\nContent-Type: audio/wav\r\n\r\n'.encode()
tail = f'\r\n--{boundary}--\r\n'.encode()
body = head + fb + tail

req = urllib.request.Request(
    'http://127.0.0.1:8000/api/analyze-audio',
    data=body,
    headers={'Content-Type': f'multipart/form-data; boundary={boundary}'}
)

with urllib.request.urlopen(req) as r:
    res = json.loads(r.read().decode())
    print('HTTP Status:', r.status)
    print('PD Probability:', res['classification']['ensemble_pd_probability'])
    print('Models breakdown:', res['classification']['models'])
    print('UPDRS Telemonitoring:', res['updrs_telemonitoring'])
    print('Anomaly Detection:', res['anomaly_detection'])
