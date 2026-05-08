#!/usr/bin/env python3
"""
Export facebook/wav2vec2-base-960h to ONNX for echo-flow alignment.

Expected by Rust aligner:
- input name: "input"
- input shape: [1, sequence_length] (float32 waveform, 16kHz)
- output name: "logits"
- output shape: [1, time_frames, vocab_size]
"""

import json
import os
import sys
from pathlib import Path

# Use a cache dir outside the project
CACHE_DIR = Path.home() / ".cache" / "echo-flow" / "models"
CACHE_DIR.mkdir(parents=True, exist_ok=True)

ONNX_PATH = CACHE_DIR / "wav2vec2-base-en.onnx"
VOCAB_PATH = CACHE_DIR / "wav2vec2-vocab.json"

# Also update the project's copy of vocab.json for reference
PROJECT_VOCAB = Path(__file__).resolve().parent.parent / "src-tauri" / "models" / "wav2vec2-vocab.json"


def download_vocab():
    """Download and save the vocab.json from the model tokenizer."""
    try:
        from transformers import Wav2Vec2Processor
    except ImportError:
        print("Installing transformers...")
        os.system(f"{sys.executable} -m pip install transformers --quiet")
        from transformers import Wav2Vec2Processor

    print("Loading Wav2Vec2 processor...")
    processor = Wav2Vec2Processor.from_pretrained("facebook/wav2vec2-base-960h")

    vocab = processor.tokenizer.get_vocab()
    print(f"Vocab size: {len(vocab)}")
    print(f"Vocab: {vocab}")

    # Save to cache
    with open(VOCAB_PATH, "w", encoding="utf-8") as f:
        json.dump(vocab, f, ensure_ascii=False)
    print(f"Saved vocab to {VOCAB_PATH}")

    # Also update project vocab for reference
    if PROJECT_VOCAB.parent.exists():
        with open(PROJECT_VOCAB, "w", encoding="utf-8") as f:
            json.dump(vocab, f, ensure_ascii=False)
        print(f"Updated project vocab at {PROJECT_VOCAB}")

    return vocab


def export_onnx():
    """Export wav2vec2 model to ONNX."""
    try:
        import torch
        from transformers import Wav2Vec2ForCTC
    except ImportError:
        print("Installing torch and transformers...")
        os.system(f"{sys.executable} -m pip install torch transformers --quiet")
        import torch
        from transformers import Wav2Vec2ForCTC

    print("Loading Wav2Vec2 model...")
    model = Wav2Vec2ForCTC.from_pretrained("facebook/wav2vec2-base-960h")
    model.eval()

    # Create dummy input: [batch=1, samples=16000] for 1 second of 16kHz audio
    dummy_input = torch.randn(1, 16000, dtype=torch.float32)

    # Export
    print(f"Exporting ONNX to {ONNX_PATH}...")
    torch.onnx.export(
        model,
        dummy_input,
        str(ONNX_PATH),
        input_names=["input"],
        output_names=["logits"],
        dynamic_axes={
            "input": {0: "batch_size", 1: "sequence_length"},
            "logits": {0: "batch_size", 1: "time_frames"},
        },
        opset_version=14,
        do_constant_folding=True,
    )
    print(f"ONNX model exported to {ONNX_PATH}")

    # Verify
    try:
        import onnx
        onnx_model = onnx.load(str(ONNX_PATH))
        onnx.checker.check_model(onnx_model)
        print("ONNX model validation passed.")
    except ImportError:
        print("onnx package not installed, skipping validation.")
    except Exception as e:
        print(f"ONNX validation warning: {e}")


def main():
    if ONNX_PATH.exists():
        print(f"ONNX model already exists at {ONNX_PATH}")
    else:
        export_onnx()

    if VOCAB_PATH.exists():
        print(f"Vocab already exists at {VOCAB_PATH}")
    else:
        download_vocab()

    print("\nAll done!")
    print(f"Models cached in: {CACHE_DIR}")


if __name__ == "__main__":
    main()
