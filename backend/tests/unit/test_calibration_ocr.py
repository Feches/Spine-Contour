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


def test_nothing_found_returns_none():
    path = resolve_tesseract(
        env={},
        which=lambda name: None,
        exists=lambda p: False,
        platform='nt',
    )
    assert path is None
