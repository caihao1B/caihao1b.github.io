"""Local-only portfolio preview; Python standard library, no installation needed."""
from __future__ import annotations
import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import threading
import webbrowser
import re


class PreviewHandler(SimpleHTTPRequestHandler):
    """Support single byte ranges so local MP4 chapter seeking works."""

    def end_headers(self):
        self.send_header('Accept-Ranges', 'bytes')
        super().end_headers()

    def send_head(self):
        self.range_remaining = None
        requested = self.headers.get('Range', '')
        path = Path(self.translate_path(self.path))
        if not requested.startswith('bytes=') or ',' in requested or not path.is_file():
            return super().send_head()
        # An If-Range request can safely fall back to a full response.
        if self.headers.get('If-Range'):
            return super().send_head()
        match = re.fullmatch(r'bytes=(\d*)-(\d*)', requested)
        stream = path.open('rb')
        size = path.stat().st_size
        try:
            if not match or not any(match.groups()) or size == 0:
                raise ValueError('Invalid byte range')
            first, last = match.groups()
            if first:
                start = int(first)
                end = min(int(last), size - 1) if last else size - 1
            else:
                suffix = int(last)
                if suffix <= 0:
                    raise ValueError('Invalid suffix range')
                start, end = max(0, size - suffix), size - 1
            if start > end or start >= size:
                raise ValueError('Range outside file')
        except ValueError:
            stream.close()
            self.send_response(416)
            self.send_header('Content-Range', f'bytes */{size}')
            self.send_header('Content-Length', '0')
            self.end_headers()
            return None
        self.send_response(206)
        self.send_header('Content-Type', self.guess_type(str(path)))
        self.send_header('Content-Range', f'bytes {start}-{end}/{size}')
        self.send_header('Content-Length', str(end - start + 1))
        self.send_header('Last-Modified', self.date_time_string(path.stat().st_mtime))
        self.end_headers()
        stream.seek(start)
        self.range_remaining = end - start + 1
        return stream

    def copyfile(self, source, outputfile):
        if self.range_remaining is None:
            try:
                return super().copyfile(source, outputfile)
            except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
                return
        remaining = self.range_remaining
        try:
            while remaining > 0:
                block = source.read(min(64 * 1024, remaining))
                if not block:
                    break
                outputfile.write(block)
                remaining -= len(block)
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
            pass  # A seek or page change may cancel an in-flight video request.


def make_server(root: Path, port: int) -> ThreadingHTTPServer:
    if not (root / 'index.html').is_file():
        raise FileNotFoundError('index.html is missing. Extract the entire website ZIP first.')
    handler = partial(PreviewHandler, directory=str(root))
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
