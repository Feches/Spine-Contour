"""Entry point for the backend bundled with the desktop application."""

import argparse

import uvicorn

from backend.server import app


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int)
    parser.add_argument("--verify-models", action="store_true")
    parser.add_argument("--gpu", help="GPU identity to verify")
    parser.add_argument("--parity-films", help="Local JSON film manifest for parity verification")
    arguments = parser.parse_args()
    if arguments.verify_models:
        from backend.verify_onnx import verify
        verify(arguments.gpu, arguments.parity_films)
        return
    if arguments.port is None:
        parser.error("--port is required when serving")
    uvicorn.run(app, host=arguments.host, port=arguments.port)


if __name__ == "__main__":
    main()
