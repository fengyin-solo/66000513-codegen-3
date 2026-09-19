import math
import random
import time
import numpy as np
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI(title="RF Signal Analyzer")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

MODULATION_TYPES = ["AM", "FM", "BPSK", "QPSK", "16QAM"]


class GenerateRequest(BaseModel):
    modulation: str = "QPSK"
    samples: int = 1024
    snr: float = 20.0


class BatchRequest(BaseModel):
    items: list[GenerateRequest]


def validate_params(mod: str, samples: int, snr: float):
    """Raise ValueError with a human-readable reason when params are invalid"""
    if mod not in MODULATION_TYPES:
        raise ValueError(f"不支持的调制方式: {mod}（支持: {'/'.join(MODULATION_TYPES)}）")
    if not 256 <= samples <= 8192:
        raise ValueError(f"样本数 {samples} 超出范围（256–8192）")
    if not 0 <= snr <= 40:
        raise ValueError(f"SNR {snr}dB 超出范围（0–40）")


def generate_signal(mod: str, samples: int, snr: float) -> np.ndarray:
    """Generate IQ samples for given modulation"""
    t = np.arange(samples) / samples * 10  # time vector
    i, q = np.zeros(samples), np.zeros(samples)
    noise_scale = 10 ** (-snr / 20) * 0.5

    if mod == "AM":
        i = 0.7 * (1 + 0.5 * np.sin(2 * np.pi * 1.5 * t)) * np.cos(2 * np.pi * 5 * t)
        q = np.zeros(samples)
    elif mod == "FM":
        msg = np.sin(2 * np.pi * 1.2 * t)
        phase = np.cumsum(2 * np.pi * (5 + 3 * msg) / samples * 10)
        i = np.cos(phase) * 0.7
        q = np.sin(phase) * 0.7
    elif mod == "BPSK":
        symbols = np.sign(np.random.randn(samples // 16 + 1))
        symbols_upsampled = np.repeat(symbols, 16)[:samples]
        i = symbols_upsampled * np.cos(2 * np.pi * 5 * t) * 0.7
        q = np.zeros(samples)
    elif mod == "QPSK":
        sym_i = np.sign(np.random.randn(samples // 16 + 1))
        sym_q = np.sign(np.random.randn(samples // 16 + 1))
        si = np.repeat(sym_i, 16)[:samples]
        sq = np.repeat(sym_q, 16)[:samples]
        i = si * 0.5
        q = sq * 0.5
    elif mod == "16QAM":
        levels = np.array([-3, -1, 1, 3]) * 0.25
        sym_i = np.random.choice(levels, samples // 16 + 1)
        sym_q = np.random.choice(levels, samples // 16 + 1)
        i = np.repeat(sym_i, 16)[:samples]
        q = np.repeat(sym_q, 16)[:samples]
    else:
        i = np.cos(2 * np.pi * 5 * t) * 0.7
        q = np.sin(2 * np.pi * 5 * t) * 0.7

    # Add noise
    i += np.random.randn(samples) * noise_scale
    q += np.random.randn(samples) * noise_scale

    return i, q


def compute_fft(i: np.ndarray, q: np.ndarray, fs: float = 1000.0):
    """Compute FFT magnitude spectrum in dB"""
    iq = i + 1j * q
    n = len(iq)
    fft = np.fft.fftshift(np.fft.fft(iq))
    mag = np.abs(fft) / n
    mag_db = 20 * np.log10(mag + 1e-10)
    freqs = np.fft.fftshift(np.fft.fftfreq(n, 1/fs))
    return freqs.tolist(), mag_db.tolist()


def compute_waterfall(i: np.ndarray, q: np.ndarray, fs: float = 1000.0, rows: int = 40):
    """Compute spectrogram waterfall"""
    n = len(i)
    seg = n // rows
    waterfall = []
    for r in range(rows):
        seg_i = i[r * seg:(r + 1) * seg]
        seg_q = q[r * seg:(r + 1) * seg]
        if len(seg_i) < 32:
            break
        fft = np.fft.fftshift(np.fft.fft(seg_i + 1j * seg_q))
        mag_db = 20 * np.log10(np.abs(fft) / len(seg_i) + 1e-10)
        half = len(mag_db) // 2
        waterfall.append({
            "time": r * seg / fs,
            "values": mag_db[half:].tolist()
        })
    return waterfall


def classify_modulation(i: np.ndarray, q: np.ndarray) -> dict:
    """Simple modulation classification based on features"""
    iq = i + 1j * q
    amp = np.abs(iq)
    phase = np.angle(iq)

    scores = {}
    amp_var = np.var(amp) / (np.mean(np.abs(amp)) + 1e-5)
    phase_var = np.var(phase)

    # AM: high amplitude variation, low phase variation
    scores["AM"] = min(1.0, amp_var * 3) * (1 - min(0.5, phase_var / 5))
    # FM: low amplitude variation, high phase variation
    scores["FM"] = (1 - min(0.8, amp_var * 2)) * min(1.0, phase_var / 5 * 3)
    # BPSK: moderate amplitude
    scores["BPSK"] = 0.5 + 0.3 * np.abs(amp_var - 0.5)
    # QPSK
    scores["QPSK"] = 0.6 + 0.2 * (1 - amp_var)
    # 16QAM: higher amplitude variation than QPSK
    scores["16QAM"] = 0.5 + 0.4 * amp_var

    # Normalize
    total = sum(scores.values()) or 1
    scores = {k: v / total for k, v in scores.items()}

    best = max(scores, key=scores.get)
    candidates = sorted([{"type": k, "score": round(v, 3)} for k, v in scores.items()], key=lambda x: x["score"], reverse=True)

    return {
        "type": best,
        "confidence": round(scores[best], 3),
        "candidates": candidates,
        "symbolRate": 1000 / 16 if best in ("BPSK", "QPSK", "16QAM") else None,
        "frequencyOffset": round(random.uniform(-5, 5), 2)
    }


@app.post("/api/generate")
def generate_and_analyze(req: GenerateRequest):
    i, q = generate_signal(req.modulation, req.samples, req.snr)
    freqs, mags = compute_fft(i, q)
    waterfall = compute_waterfall(i, q)
    modulation = classify_modulation(i, q)

    n = len(i)
    step = max(1, n // 200)
    constellation = [{"i": float(i[k]), "q": float(q[k])} for k in range(0, n, step)]

    return {
        "spectrum": {"frequencies": freqs, "magnitudes": mags},
        "waterfall": waterfall,
        "constellation": constellation,
        "modulation": modulation
    }


@app.post("/api/batch")
def batch_analyze(req: BatchRequest):
    """Run a batch of parameter sets one by one and report per-item results"""
    if not req.items:
        raise HTTPException(status_code=400, detail="批量参数为空，请至少添加一组参数")

    items = []
    success_count = 0
    total_ms = 0.0

    for idx, item in enumerate(req.items):
        start = time.perf_counter()
        entry = {
            "index": idx,
            "params": {"modulation": item.modulation, "samples": item.samples, "snr": item.snr},
            "success": False,
            "detectedType": None,
            "confidence": None,
            "durationMs": 0.0,
            "error": None,
        }
        try:
            validate_params(item.modulation, item.samples, item.snr)
            i, q = generate_signal(item.modulation, item.samples, item.snr)
            modulation = classify_modulation(i, q)
            entry["success"] = True
            entry["detectedType"] = modulation["type"]
            entry["confidence"] = modulation["confidence"]
            success_count += 1
        except Exception as e:
            entry["error"] = str(e)
        entry["durationMs"] = round((time.perf_counter() - start) * 1000, 1)
        total_ms += entry["durationMs"]
        items.append(entry)

    n = len(items)
    return {
        "items": items,
        "summary": {
            "total": n,
            "success": success_count,
            "failed": n - success_count,
            "avgDurationMs": round(total_ms / n, 1) if n else 0.0
        }
    }