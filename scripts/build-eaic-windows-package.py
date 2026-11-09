"""Build a credential-free Windows gateway installer from explicit runtime pins."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import zipfile

HERE=Path(__file__).resolve().parent
ROOT=HERE.parent
def run(*args,**kwargs):return subprocess.check_output([str(x) for x in args],**kwargs)
def digest(file):return hashlib.sha256(file.read_bytes()).hexdigest()
def copy_tree(source,target):
    shutil.copytree(source,target,ignore=shutil.ignore_patterns('__pycache__','*.pyc','*.pyo'))

def main():
    p=argparse.ArgumentParser(description=__doc__)
    for name in ('sdk','node','node-license','python','python-site-packages','python-home-site-packages','makensis','out'):p.add_argument('--'+name,type=Path,required=True)
    p.add_argument('--version',default='1.0.0')
    a=p.parse_args()
    contract=json.loads((HERE/'eaic-sdk-contract.json').read_text())
    out=a.out.resolve();out.mkdir(parents=True,exist_ok=True)
    stage=out/('EAIC-Gateway-'+a.version+'-Windows-x64')
    if stage.exists():raise SystemExit('Output staging directory already exists; use a fresh output directory')
    stage.mkdir();(stage/'scripts').mkdir();(stage/'runtime/node').mkdir(parents=True)
    # Include every reviewed runtime dependency, plus setup diagnostics. No
    # .env, SSH keys, deployment credentials or local ownership state enter here.
    code="import {compatibilityPaths} from './scripts/robot-gateway-release.mjs'; console.log(JSON.stringify(compatibilityPaths))"
    paths=json.loads(run(a.node,'--input-type=module','-e',code,cwd=ROOT))
    paths+=['scripts/eaic-windows-gateway.ps1','scripts/eaic-package-check.py','scripts/ensure-obs-running-hidden.vbs','scripts/ensure-obs-running.ps1']
    for relative in paths:shutil.copy2(ROOT/relative,stage/relative)
    (stage/'sdk').mkdir()
    revision=contract['revision']
    tracked=run('git','-C',a.sdk,'ls-tree','-r','--name-only',revision,'--','agentech').decode().splitlines()
    for relative in tracked:
        file=stage/'sdk'/relative;file.parent.mkdir(parents=True,exist_ok=True)
        file.write_bytes(run('git','-C',a.sdk,'show',revision+':'+relative))
    for relative in ('LICENSE','pyproject.toml'):
        (stage/'sdk'/relative).write_bytes(run('git','-C',a.sdk,'show',revision+':'+relative))
    copy_tree(a.python,stage/'runtime/python')
    copy_tree(a.python_site_packages,stage/'runtime/site-packages')
    shutil.copytree(a.python_home_site_packages,stage/'runtime/site-packages',dirs_exist_ok=True,ignore=shutil.ignore_patterns('__pycache__','*.pyc','*.pyo'))
    pth=next((stage/'runtime/python').glob('python*._pth'))
    archive=next((stage/'runtime/python').glob('python*.zip')).name
    pth.write_text(archive+'\n.\n../../sdk\n../../scripts\n../site-packages\nimport site\n',encoding='utf-8')
    shutil.copy2(a.node,stage/'runtime/node/node.exe')
    shutil.copy2(a.node_license,stage/'runtime/node/LICENSE.txt')
    run(a.node,HERE/'stage-eaic-node.mjs',stage,cwd=ROOT)
    shutil.copy2(ROOT/'docs/operations/eaic-new-windows-gateway.md',stage/'START-HERE.md')
    index=['# EAIC SDK command index','',f'SDK revision: `{revision}`. Customer access is subject to booking, device capability and live SDK admission.','', '| Robot | Function | Access | Effect |','|---|---|---|---|']
    for e in contract['entries']:index.append(f"| {e['robot']} | `Agentech.{e['method']}()` | {e['policy']} | {e['effect']} |")
    (stage/'SDK-COMMANDS.md').write_text('\n'.join(index)+'\n',encoding='utf-8')
    for action in ('Configure','Offline','Check','Start'):
        (stage/(action+'.cmd')).write_text('@echo off\r\ncd /d "%~dp0"\r\npowershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\\eaic-windows-gateway.ps1" -Action '+action+'\r\nif errorlevel 1 echo Gateway command failed. Review the message above.\r\npause\r\n',encoding='ascii')
    manifest={'version':a.version,'platform':'windows-x64','sourceRevision':run('git','-C',ROOT,'rev-parse','HEAD').decode().strip(),
        'sdkRevision':revision,'sdkContract':contract['hash'],'sdkFiles':len(tracked),
        'qualification':'Offline package validation only; new PC, cloud assignment, stream and robot commissioning pending',
        'files':{f.relative_to(stage).as_posix():digest(f) for f in sorted(stage.rglob('*')) if f.is_file()}}
    (stage/'package-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
    installer=out/('EAIC-Gateway-'+a.version+'-Setup-Windows-x64.exe')
    # Fresh versioned directory only. An installer cannot overwrite a live gateway.
    nsi=out/'setup.nsi'
    def nsis(value):return str(value).replace('$','$$').replace('"','$\\"')
    nsi.write_text('''Unicode true
RequestExecutionLevel user
Name "Agentech EAIC Gateway"
OutFile "'''+nsis(installer)+'''"
InstallDir "$LOCALAPPDATA\\Agentech\\EAICGateway\\'''+a.version+'''"
Page directory
Page instfiles
Section
IfFileExists "$INSTDIR\\*" 0 fresh
MessageBox MB_OK "Choose a fresh directory. Installation will not replace an existing directory or running gateway."
Abort
fresh:
SetOutPath "$INSTDIR"
File /r "'''+nsis(stage)+'''\\*"
CreateDirectory "$SMPROGRAMS\\Agentech EAIC Gateway"
CreateShortcut "$SMPROGRAMS\\Agentech EAIC Gateway\\1 Configure.lnk" "$INSTDIR\\Configure.cmd"
CreateShortcut "$SMPROGRAMS\\Agentech EAIC Gateway\\2 Offline check.lnk" "$INSTDIR\\Offline.cmd"
CreateShortcut "$SMPROGRAMS\\Agentech EAIC Gateway\\3 Connectivity check.lnk" "$INSTDIR\\Check.cmd"
CreateShortcut "$SMPROGRAMS\\Agentech EAIC Gateway\\4 Start gateway.lnk" "$INSTDIR\\Start.cmd"
CreateShortcut "$SMPROGRAMS\\Agentech EAIC Gateway\\Instructions.lnk" "$INSTDIR\\START-HERE.md"
SectionEnd
''',encoding='utf-8')
    run(a.makensis,'/V2',nsi)
    (out/'SHA256SUMS.txt').write_text(digest(installer)+'  '+installer.name+'\n')
    print(json.dumps({'installer':str(installer),'sha256':digest(installer),'files':len(manifest['files']),'sdk_files':len(tracked)}))

if __name__=='__main__':main()
