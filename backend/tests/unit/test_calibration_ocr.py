from backend import calibration
from backend.calibration import resolve_tesseract


def test_tesseract_cmd_override_wins_when_it_exists():
    path = resolve_tesseract(
        env={'TESSERACT_CMD': r'C:\custom\tesseract.exe'},
        which=lambda name: r'C:\PATH\tesseract.exe',
        exists=lambda p: p == r'C:\custom\tesseract.exe',
        platform='nt',
    )
    assert path == r'C:\custom\tesseract.exe'


def test_tesseract_cmd_override_ignored_when_missing():
    path = resolve_tesseract(
        env={'TESSERACT_CMD': r'C:\missing\tesseract.exe'},
        which=lambda name: None,
        exists=lambda p: False,
        platform='nt',
    )
    assert path is None


def test_path_lookup_preferred_over_install_locations():
    path = resolve_tesseract(
        env={'ProgramFiles': r'C:\Program Files'},
        which=lambda name: r'C:\PATH\tesseract.exe',
        exists=lambda p: True,
        platform='nt',
    )
    assert path == r'C:\PATH\tesseract.exe'


# Failed on macOS CI before ntpath was used: os.path.join followed the host's rules, not 'nt'.
def test_windows_program_files_used_when_nothing_on_path():
    program_files = r'C:\Program Files'
    expected = program_files + r'\Tesseract-OCR\tesseract.exe'
    path = resolve_tesseract(
        env={'ProgramFiles': program_files},
        which=lambda name: None,
        exists=lambda p: p == expected,
        platform='nt',
    )
    assert path == expected


def test_windows_candidates_join_with_backslashes_on_any_host():
    probed = []

    def exists(p):
        probed.append(p)
        return False

    path = resolve_tesseract(
        env={
            'ProgramFiles': r'C:\Program Files',
            'ProgramFiles(x86)': r'C:\Program Files (x86)',
            'LOCALAPPDATA': r'C:\Users\x\AppData\Local',
        },
        which=lambda name: None,
        exists=exists,
        platform='nt',
    )
    assert probed == [
        r'C:\Program Files\Tesseract-OCR\tesseract.exe',
        r'C:\Program Files (x86)\Tesseract-OCR\tesseract.exe',
        r'C:\Users\x\AppData\Local\Programs\Tesseract-OCR\tesseract.exe',
    ]
    assert path is None


def test_nothing_found_returns_none():
    path = resolve_tesseract(
        env={},
        which=lambda name: None,
        exists=lambda p: False,
        platform='nt',
    )
    assert path is None


def test_posix_install_locations_checked_in_order():
    path = resolve_tesseract(
        env={},
        which=lambda name: None,
        exists=lambda p: p == '/usr/local/bin/tesseract',
        platform='posix',
    )
    assert path == '/usr/local/bin/tesseract'

    path = resolve_tesseract(
        env={},
        which=lambda name: None,
        exists=lambda p: p in ('/opt/homebrew/bin/tesseract', '/usr/local/bin/tesseract'),
        platform='posix',
    )
    assert path == '/opt/homebrew/bin/tesseract'


def test_configure_ocr_resolves_only_once_per_process(monkeypatch):
    calls = []
    monkeypatch.setattr(calibration, 'resolve_tesseract', lambda *a, **kw: calls.append(1) or None)
    calibration._reset_ocr_cache()
    try:
        calibration.configure_ocr()
        calibration.configure_ocr()
        assert len(calls) == 1
    finally:
        calibration._reset_ocr_cache()
