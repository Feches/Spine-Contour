"""Make a relocatable Tesseract runtime, including Homebrew's transitive dylibs."""
from pathlib import Path
import shutil
import subprocess
import sys

prefix = Path(subprocess.check_output(['brew', '--prefix', 'tesseract'], text=True).strip())
output = Path(sys.argv[1] if len(sys.argv) > 1 else 'build/ocr').resolve()
output.mkdir(parents=True, exist_ok=True)
visited = {}


def copy_binary(source):
    source = source.resolve()
    if source in visited:
        return visited[source]
    target = output/source.name
    if target in visited.values():
        raise RuntimeError(f'Duplicate library basename: {source.name}')
    shutil.copy2(source, target)
    target.chmod(0o755)
    visited[source] = target
    dependencies = subprocess.check_output(['otool', '-L', str(source)], text=True).splitlines()[1:]
    for line in dependencies:
        dependency = line.strip().split(' (')[0]
        if dependency.startswith(('/usr/lib/', '/System/')):
            continue
        if dependency.startswith('@loader_path/'):
            resolved = source.parent/dependency.removeprefix('@loader_path/')
        elif dependency.startswith('@rpath/'):
            # Homebrew dependencies normally use absolute paths; resolve local rpath siblings.
            resolved = source.parent/Path(dependency).name
        else:
            resolved = Path(dependency)
        if resolved.resolve() == source:
            continue
        if not resolved.is_file():
            raise RuntimeError(f'Cannot resolve {dependency} required by {source}')
        copied = copy_binary(resolved)
        subprocess.run(['install_name_tool', '-change', dependency, f'@loader_path/{copied.name}', str(target)], check=True)
    if target.suffix == '.dylib':
        subprocess.run(['install_name_tool', '-id', f'@loader_path/{target.name}', str(target)], check=True)
    subprocess.run(['codesign', '--force', '--sign', '-', str(target)], check=True, capture_output=True)
    return target


copy_binary(prefix/'bin/tesseract')
data = output/'tessdata'
data.mkdir(exist_ok=True)
for name in ['eng.traineddata', 'osd.traineddata']:
    shutil.copy2(prefix/'share/tessdata'/name, data/name)
print(f'Bundled {len(visited)} binaries in {output}')
