"""Exercise preview HTTP responses in memory, without network or dependencies."""
from pathlib import Path
import io
import json
import sys
from types import SimpleNamespace

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from preview_server import PreviewHandler


class Connection:
    def __init__(self, request):
        self.request = request
        self.response = bytearray()

    def makefile(self, *args):
        return io.BytesIO(self.request)

    def sendall(self, data):
        self.response.extend(data)


class QuietHandler(PreviewHandler):
    def log_message(self, *args):
        pass


def request(path, method='GET', byte_range=None):
    headers = f'{method} /{path} HTTP/1.1\r\nHost: localhost\r\n'
    if byte_range is not None:
        headers += f'Range: {byte_range}\r\n'
    conn = Connection((headers + '\r\n').encode('ascii'))
    QuietHandler(conn, ('127.0.0.1', 0), SimpleNamespace(), directory=str(ROOT))
    header, body = bytes(conn.response).split(b'\r\n\r\n', 1)
    lines = header.decode('iso-8859-1').split('\r\n')
    return int(lines[0].split()[1]), dict(line.split(': ', 1) for line in lines[1:]), body


def main():
    path = 'assets/videos/yzbot-gazebo-recording.mp4'
    data = (ROOT/path).read_bytes()
    cases = [
        ('full video', 'GET', None, 200, data),
        ('first bytes', 'GET', 'bytes=0-31', 206, data[:32]),
        ('middle bytes', 'GET', 'bytes=100-199', 206, data[100:200]),
        ('open ended', 'GET', f'bytes={len(data)-20}-', 206, data[-20:]),
        ('suffix', 'GET', 'bytes=-17', 206, data[-17:]),
        ('clamped end', 'GET', f'bytes={len(data)-8}-{len(data)+100}', 206, data[-8:]),
        ('out of bounds', 'GET', f'bytes={len(data)}-', 416, b''),
        ('empty range', 'GET', 'bytes=-', 416, b''),
        ('reversed range', 'GET', 'bytes=40-20', 416, b''),
        ('zero suffix', 'GET', 'bytes=-0', 416, b''),
        ('HEAD range', 'HEAD', 'bytes=0-31', 206, b''),
        ('multipart fallback', 'GET', 'bytes=0-1,10-11', 200, data),
    ]
    checks = []
    for name, method, value, expected_status, expected_body in cases:
        status, headers, body = request(path, method, value)
        passed = status == expected_status and body == expected_body and headers.get('Accept-Ranges') == 'bytes'
        if value == 'bytes=0-31':
            passed = passed and headers.get('Content-Range') == f'bytes 0-31/{len(data)}' and headers.get('Content-Length') == '32'
        checks.append({'name': name, 'passed': passed, 'status': status, 'bytes': len(body)})
    status, _, body = request('index.html')
    checks.append({'name': 'homepage full response', 'passed': status == 200 and body == (ROOT/'index.html').read_bytes(), 'status': status})
    passed = all(c['passed'] for c in checks)
    report = {'scope': 'Real HTTP handler with in-memory transport; browser seeking checked separately.', 'passed': passed, 'checks': checks}
    (ROOT/'reports/merged-preview-checks.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
    print(f'{sum(c["passed"] for c in checks)}/{len(checks)} preview checks passed')
    if not passed:
        print(json.dumps(report, indent=2))
    return 0 if passed else 1


if __name__ == '__main__':
    raise SystemExit(main())
