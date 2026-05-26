# apps/api/app/workers/whisper_setup.py

"""
Pre-download and cache the faster-whisper model on worker startup.
Prevents cold-start latency on the first transcription request.

Model is cached to /tmp/whisper-models by default.
Override with WHISPER_MODEL_CACHE env var to use a mounted volume
in staging/production for persistence across container restarts.

Memory note: the base model is ~150MB resident per worker process.
With 4 Celery workers that's ~600MB. Use WHISPER_MODEL_SIZE=tiny
to reduce to ~75MB if memory is constrained.
"""

from faster_whisper import WhisperModel

from app.config import settings

# Module-level singleton — loaded once per worker process on first use.
# Subsequent calls return the cached instance with no overhead.
_model: WhisperModel | None = None


def get_whisper_model() -> WhisperModel:
    """
    Return the cached WhisperModel, loading it on first call.
    Thread-safe for Celery's prefork pool — each worker process
    gets its own singleton, no locking needed.
    """
    global _model
    if _model is None:
        _model = _load_model()
    return _model


def _load_model() -> WhisperModel:
    """
    Load the faster-whisper model with int8 quantisation.
    int8 gives ~2x speedup on CPU with minimal accuracy loss.
    """
    model = WhisperModel(
        settings.whisper_model_size,
        device="cpu",
        compute_type="int8",
        download_root=settings.whisper_model_cache,
    )
    return model  # Noqa: RET504
