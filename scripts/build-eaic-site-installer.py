"""Build the public Windows venue installer from the site launcher and template."""

import argparse
import hashlib
from pathlib import Path
import shutil
import subprocess


SOURCE = Path(__file__).resolve().parent / "eaic-site-setup"
FILES = (
    "EAIC Hub.url",
    "READ ME.txt",
    "SITE DETAILS.txt",
    "START HERE.cmd",
    "Site connection.example.json",
    "WHIP ingress example.json",
    "Tools/Site-Setup.ps1",
    "Tools/check-obs.py",
    "Tools/configure-answers.ps1",
    "Tools/eaic-site-assignment-v1.mjs",
    "Tools/eaic-site-bridge-v1.mjs",
    "Tools/prepare-master-gateway.py",
    "Tools/quick-setup.py",
    "Tools/site-gateway.ps1",
)


def nsis_path(path):
    return str(path).replace("$", "$$").replace('"', '$\\"')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--makensis", required=True, type=Path)
    parser.add_argument("--out", required=True, type=Path)
    args = parser.parse_args()

    out = args.out.resolve()
    out.mkdir(parents=True, exist_ok=True)
    stage = out / "EAIC Site Setup"
    stage.mkdir()
    for name in FILES:
        destination = stage / name
        destination.parent.mkdir(exist_ok=True)
        shutil.copyfile(SOURCE / name, destination)

    installer = out / "EAIC-Site-Setup-Windows-x64.exe"
    nsi = out / "site-setup.nsi"
    nsi.write_text(
        rf'''Unicode true
RequestExecutionLevel user
Name "EAIC Site Setup"
OutFile "{nsis_path(installer)}"
InstallDir "$LOCALAPPDATA\Agentech\EAIC Site Setup"
Page directory
Page instfiles
Section
SetOutPath "$INSTDIR"
File /r "{nsis_path(stage)}\*"
CreateShortcut "$SMPROGRAMS\EAIC Site Setup.lnk" "$INSTDIR\START HERE.cmd"
CreateShortcut "$SMPROGRAMS\EAIC Site Setup folder.lnk" "$INSTDIR"
SectionEnd
''',
        encoding="utf-8",
    )
    subprocess.run([str(args.makensis.resolve()), "/V2", str(nsi)], check=True)
    with installer.open("rb") as file:
        sha256 = hashlib.file_digest(file, "sha256").hexdigest()
    (out / "EAIC-Site-Setup-SHA256SUMS.txt").write_text(
        f"{sha256}  {installer.name}\n", encoding="ascii"
    )
    print(installer)


if __name__ == "__main__":
    main()
