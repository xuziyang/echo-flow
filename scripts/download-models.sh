#!/bin/bash
set -e

# Download models to a central cache directory outside the project
MODELS_DIR="${HOME}/.cache/echo-flow/models"
mkdir -p "$MODELS_DIR"

# Whisper GGML model (from HuggingFace)
if [ ! -f "$MODELS_DIR/ggml-base.en.bin" ]; then
    echo "Downloading Whisper GGML model to ${MODELS_DIR}..."
    curl -L -o "$MODELS_DIR/ggml-base.en.bin" \
        "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin"
fi

# Silero VAD model (from HuggingFace)
if [ ! -f "$MODELS_DIR/silero_vad.onnx" ]; then
    echo "Downloading Silero VAD model to ${MODELS_DIR}..."
    curl -L -o "$MODELS_DIR/silero_vad.onnx" \
        "https://huggingface.co/snakers4/silero-vad/resolve/main/silero_vad.onnx"
fi

# Wav2Vec2 alignment model (from HuggingFace)
if [ ! -f "$MODELS_DIR/wav2vec2-base-en.onnx" ]; then
    echo "Downloading Wav2Vec2 model to ${MODELS_DIR}..."
    curl -L -o "$MODELS_DIR/wav2vec2-base-en.onnx" \
        "https://huggingface.co/alphacep/k2-vosk/resolve/main/wav2vec2-base-en.onnx"
fi

# Wav2Vec2 vocab file
if [ ! -f "$MODELS_DIR/wav2vec2-vocab.json" ]; then
    echo "Downloading Wav2Vec2 vocab to ${MODELS_DIR}..."
    curl -L -o "$MODELS_DIR/wav2vec2-vocab.json" \
        "https://huggingface.co/alphacep/k2-vosk/resolve/main/wav2vec2-vocab.json"
fi

echo "All models downloaded to ${MODELS_DIR}."
