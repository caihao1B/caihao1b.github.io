"""Local-only portfolio preview; Python standard library, no installation needed."""
from __future__ import annotations
import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import threading
import webbrowser


def make_server(root: Path, port: int) -> ThreadingHTTPServer:
    if not (root / 'index.html').is_file():
        raise FileNotFoundError('index.html is missing. Extract the entire website ZIP first.')
    handler = partial(SimpleHTTPRequestHandler, directory=str(root))
    return ThreadingHTTPServer(('127.0.0.1', port), handler)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=8000)
    parser.add_argument('--no-open', action='store_true')
    args = parser.parse_args()
    if not 0 <= args.port <= 65535:
        parser.error('--port must be between 0 and 65535')
    root = Path(__file__).resolve().parent
    try:
        server = make_server(root, args.port)
    except OSError:
        if args.port == 0:
            raise
        print(f'Port {args.port} is not available; selecting a free local port.')
        server = make_server(root, 0)
    url = f'http://127.0.0.1:{server.server_port}/'
    print('\nPORTFOLIO LOCAL PREVIEW\n' + '=' * 48)
    print('Open this address in your browser:\n\n  ' + url + '\n', flush=True)
    print('Keep this window open. Press Ctrl+C to stop.\nThis is local preview, NOT a public website.\n', flush=True)
    if not args.no_open:
        timer = threading.Timer(.4, lambda: webbrowser.open(url))
        timer.daemon = True
        timer.start()
    try:
        server.serve_forever(poll_interval=.2)
    except KeyboardInterrupt:
        print('\nPreview stopped.')
    finally:
        server.server_close()
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
