"""Configure the released Windows gateway and OBS for automatic single-venue booking discovery."""
import argparse
import ctypes
import hashlib
import ipaddress
import json
import logging
import os
from pathlib import Path
import secrets
import socket
import subprocess
import sys
import tempfile
import time
from urllib.parse import urlsplit
from urllib.request import Request, urlopen
from urllib.error import URLError

import obsws_python
from hmac import compare_digest

TOOLS = Path(__file__).resolve().parent
PROFILE = "EAIC Site"
SCENE = "EAIC External Camera"
SOURCE = "EAIC Site Camera"
PS = str(Path(os.environ["SystemRoot"]) / "System32/WindowsPowerShell/v1.0/powershell.exe")
SITE_MODULES = {'eaic-site-assignment-v1.mjs': '19baa9d55f158d810fa58610f55d2efd128145f098e4540a03f01ff94ac1d15c', 'eaic-site-bridge-v1.mjs': '47d59871b4814ab11d309126f1dc3443bee305d2c4b6a879ed996a025a001148'}
logging.disable(logging.CRITICAL)


def powershell(arguments, **kwargs):
    env = os.environ.copy()
    env["PSModulePath"] = os.pathsep.join([str(Path(PS).parent / "Modules"), env.get("PSModulePath","")])
    return subprocess.run([PS,"-NoProfile",*arguments], env=env, check=True, **kwargs)


def load(path):
    return json.loads(path.read_text(encoding="utf-8-sig"))


def load_connection(path):
    try:
        settings = load(path)
    except FileNotFoundError:
        raise ValueError("Place your private Site connection.json beside START HERE.cmd.") from None
    except (OSError, UnicodeError, json.JSONDecodeError):
        raise ValueError("Site connection.json must be a readable UTF-8 JSON file.") from None
    if not isinstance(settings, dict):
        raise ValueError("Site connection.json must contain a JSON object.")
    for field in ("cloudUrl", "cloudKey", "whipServer", "whipToken"):
        value = settings.get(field)
        if not isinstance(value, str) or not value.strip() or value != value.strip():
            raise ValueError(f"Fill in {field} in Site connection.json without surrounding spaces.")
    for field in ("cloudUrl", "whipServer"):
        try:
            url = urlsplit(settings[field])
            valid = (url.scheme == "https" and url.hostname and not url.username
                     and not url.password and not url.fragment
                     and not any(char.isspace() for char in settings[field]))
        except ValueError:
            valid = False
        if not valid:
            raise ValueError(f"Enter a valid HTTPS URL for {field} in Site connection.json.")
    cloud = urlsplit(settings["cloudUrl"])
    if cloud.path.rstrip("/") or cloud.query:
        raise ValueError("cloudUrl must be the Supabase project URL without a path or query.")
    return settings


def atomic_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(dir=path.parent, delete=False, mode="w", encoding="utf-8") as f:
        temp = Path(f.name)
        try:
            json.dump(value, f, indent=2)
            f.flush()
            os.fsync(f.fileno())
        except BaseException:
            f.close()
            temp.unlink(missing_ok=True)
            raise
    try:
        os.replace(temp, path)
    finally:
        temp.unlink(missing_ok=True)


def pick(items, describe, label):
    if not items:
        raise ValueError(f"No {label} available.")
    for i, item in enumerate(items, 1):
        print(f"  {i}. {describe(item)}")
    while True:
        value = input(f"Pick {label} (1-{len(items)}): ").strip()
        if value.isdecimal() and 1 <= int(value) <= len(items):
            return items[int(value)-1]


def install_site_runtime(root):
    # Add uniquely named modules alongside the release so its relative imports
    # resolve normally. Gateway lock is held; the stock runtime stays intact.
    for name, pin in SITE_MODULES.items():
        data = (TOOLS/name).read_bytes()
        if hashlib.sha256(data).hexdigest() != pin:
            raise ValueError(f"Damaged site file: {name}. Extract a fresh copy of the ZIP.")
        destination = root/"scripts"/name
        if destination.exists() and destination.read_bytes() == data:
            continue
        with tempfile.NamedTemporaryFile(dir=destination.parent, delete=False) as temp:
            temp.write(data)
        try:
            os.replace(temp.name, destination)
        finally:
            Path(temp.name).unlink(missing_ok=True)


def local_obs_password(config_file, running):
    config = load(config_file) if config_file.exists() else {}
    if (config.get("auth_required") and config.get("server_enabled") and
            config.get("server_port") == 4455 and config.get("server_password")):
        return config["server_password"]
    if running:
        raise ValueError("Close OBS normally once, then run Quick setup again so it can enable local control.")
    password = config.get("server_password") or secrets.token_urlsafe(32)
    config.update(server_enabled=True, auth_required=True, server_port=4455,
                  server_password=password, first_load=False)
    atomic_json(config_file, config)
    return password


def open_obs(exe):
    check = subprocess.run(["tasklist.exe","/FI","IMAGENAME eq obs64.exe","/FO","CSV","/NH"],
                           capture_output=True, check=True)
    running = b'"obs64.exe"' in check.stdout.lower()
    path = Path(os.environ["APPDATA"]) / "obs-studio/plugin_config/obs-websocket/config.json"
    password = local_obs_password(path, running)
    if not running:
        subprocess.Popen([str(exe),"--disable-shutdown-check"], cwd=str(exe.parent))
    deadline = time.monotonic()+65
    while time.monotonic() < deadline:
        try:
            client = obsws_python.ReqClient(host="127.0.0.1",port=4455,password=password,timeout=3)
        except Exception:
            time.sleep(1)
            continue
        if "authentication" not in client.base_client.server_hello["d"]:
            client.disconnect()
            raise ValueError("Close OBS normally and enable password authentication on port 4455.")
        return client,password
    raise ValueError("OBS did not answer on port 4455. Dismiss any OBS first-run dialog and retry.")


def setup_camera(client, settings):
    if client.get_stream_status().output_active or client.get_record_status().output_active or client.get_virtual_cam_status().output_active:
        raise ValueError("OBS has an active output. Finish it before changing the site camera.")
    if PROFILE not in client.get_profile_list().profiles:
        client.create_profile(PROFILE)
    if client.get_profile_list().current_profile_name != PROFILE:
        client.set_current_profile(PROFILE)
    # A separate collection keeps the previous camera scene intact.
    if PROFILE not in client.get_scene_collection_list().scene_collections:
        client.create_scene_collection(PROFILE)
    if client.get_scene_collection_list().current_scene_collection_name != PROFILE:
        client.set_current_scene_collection(PROFILE)
    scenes = client.get_scene_list().scenes
    if not any(item["sceneName"]==SCENE for item in scenes):
        client.create_scene(SCENE)
    if not any(item["inputName"]==SOURCE for item in client.get_input_list().inputs):
        client.create_input(SCENE,SOURCE,"dshow_input",{},False)
    items = client.get_scene_item_list(SCENE).scene_items
    item = next((i["sceneItemId"] for i in items if i["sourceName"]==SOURCE),None)
    if item is None:
        item = client.create_scene_item(SCENE,SOURCE,False).scene_item_id
    devices = client.get_input_properties_list_property_items(SOURCE,"video_device_id").property_items
    available = [d for d in devices if d.get("itemEnabled",True) and d.get("itemValue") and d.get("itemName")]
    device = pick(available, lambda d:d["itemName"], "camera")
    client.set_input_settings(SOURCE,{"video_device_id":device["itemValue"]},True)
    client.set_scene_item_enabled(SCENE,item,True)
    client.set_current_program_scene(SCENE)
    video = client.get_video_settings()
    client.set_scene_item_transform(SCENE,item,{"boundsType":"OBS_BOUNDS_SCALE_INNER",
        "boundsWidth":float(video.base_width),"boundsHeight":float(video.base_height),
        "positionX":0.0,"positionY":0.0,"alignment":5})
    client.set_stream_service_settings("whip_custom",{"server":settings["whipServer"],"bearer_token":settings["whipToken"]})
    saved = client.get_stream_service_settings()
    if (saved.stream_service_type!="whip_custom" or saved.stream_service_settings.get("server")!=settings["whipServer"]
        or not compare_digest(saved.stream_service_settings.get("bearer_token","").encode(), settings["whipToken"].encode())
        or client.get_input_settings(SOURCE).input_settings.get("video_device_id")!=device["itemValue"]
        or client.get_current_program_scene().current_program_scene_name!=SCENE):
        raise ValueError("OBS did not retain the selected camera or LiveKit destination.")
    print("OBS saved the LiveKit connection and camera:",device["itemName"])


def check_site_connections(settings, model, host):
    # Empty tables pass. This read neither claims a session nor reserves a slot.
    base = settings["cloudUrl"].rstrip("/")
    key = settings["cloudKey"]
    request = Request(base+"/rest/v1/agentech_robot_sessions?select=id&limit=1",
                      headers={"apikey":key, "Authorization":"Bearer "+key})
    failures = []
    try:
        with urlopen(request, timeout=10) as response:
            if not isinstance(json.load(response), list):
                raise ValueError("Unexpected booking table response.")
        print("Cloud authentication and booking table access passed.")
    except (URLError, TimeoutError, ValueError):
        failures.append("Cloud check failed. Check internet and Supabase access.")
    port = 9090 if model == "navi" else 22
    try:
        with socket.create_connection((host,port), timeout=4):
            pass
        print(f"Robot {host} answered on TCP {port}.")
    except OSError:
        failures.append(f"Robot did not answer on TCP {port}. Check its IP, service and LAN.")
    if failures:
        raise ValueError(" ".join(failures))


def run_gateway(root, action):
    powershell(["-ExecutionPolicy","Bypass","-File",str(TOOLS/"site-gateway.ps1"),"-GatewayRoot",str(root),"-Action",action])


class SetupLock:
    """Use the released launcher's OS lock while configuring this installation."""
    def __init__(self, root):
        self.path = root/".gateway-launch.lock"
    def __enter__(self):
        kernel = ctypes.windll.kernel32
        create = kernel.CreateFileW
        create.restype = ctypes.c_void_p
        self.handle = create(str(self.path),0xC0000000,0,None,4,0x80,None)
        if self.handle == ctypes.c_void_p(-1).value:
            raise ValueError("The installed gateway is running or its configuration is busy.")
        return self
    def __exit__(self,*args):
        ctypes.windll.kernel32.CloseHandle(ctypes.c_void_p(self.handle))


def check_idle(root):
    state = root/".robot-stream-runtime/state.json"
    if not state.exists():
        return
    script = r"""$ErrorActionPreference='Stop'
$root=[Console]::In.ReadToEnd() | ConvertFrom-Json
. (Join-Path $root 'scripts/robot-stream-process.ps1')
$state=Get-Content -LiteralPath (Join-Path $root '.robot-stream-runtime/state.json') -Raw | ConvertFrom-Json
$blockers=@(Get-RobotStreamRestartBlockers -State $state)
if($blockers.Count){throw ($blockers -join [Environment]::NewLine)}"""
    powershell(["-ExecutionPolicy","Bypass","-Command",script],input=json.dumps(str(root)).encode("ascii"))


def site_answers(settings,root,model,host,obs_password,existing):
    answers = {"gatewayId":"eaic-"+os.environ["COMPUTERNAME"][:45],
               "model":model,"robotHost":host,"obsPassword":obs_password,
               "cloudUrl":settings["cloudUrl"],"cloudKey":settings["cloudKey"]}
    if model=="aegis":
        user = os.environ.get("ROBOT_SSH_USER") or settings.get("aegisUser")
        if not isinstance(user, str) or not user.strip():
            raise ValueError("Set aegisUser in Site connection.json for this robot.")
        key_name = settings.get("aegisKeyName") or ""
        if not isinstance(key_name, str) or (key_name and (Path(key_name).name != key_name or key_name in {'.', '..'})):
            raise ValueError("aegisKeyName must be a filename under .ssh, or empty to prompt for a key.")
        ssh_key = Path(os.environ.get("ROBOT_SSH_KEY") or existing.get("sshKey") or
                       Path.home()/".ssh"/key_name)
        if not ssh_key.is_file():
            ssh_key = Path(input("Path to this PC's provisioned Aegis SSH key: ").strip().strip('"'))
        if not ssh_key.is_file():
            raise ValueError("Aegis requires its provisioned SSH key on this PC.")
        answers.update(sshKey=str(ssh_key.resolve()),aegisUser=user)
    if model=="master":
        candidate = next((p for p in [os.environ.get("AGENTECH_MASTER_DEPLOYMENT_FILE"),
            existing.get("masterDeployment"), str(root/"master-config"/"master-deployment.json")] if p and Path(p).is_file()),None)
        if not candidate:
            candidate=input("Full path to the reviewed Master deployment for this PC: ").strip().strip('"')
        if not candidate or not Path(candidate).is_file():
            raise ValueError("Master requires its reviewed deployment file. Use M in the menu to prepare a draft.")
        deployment=load(Path(candidate))
        if (deployment.get("enabled") is not True or deployment.get("host")!=host or
            Path(deployment["sdk_root"]).resolve()!=(root/"sdk").resolve()):
            raise ValueError("Master deployment must be commissioned for this IP and the installed SDK.")
        answers["masterDeployment"]=str(Path(candidate).resolve())
    return answers


def save_gateway(root, answers, existing):
    if not existing:
        # Use the release's user-only ACL, DPAPI and SDK verification. Secrets travel through stdin.
        powershell(["-ExecutionPolicy","Bypass","-File",str(TOOLS/"configure-answers.ps1"),
            "-GatewayRoot",str(root)],input=json.dumps(answers).encode("ascii"))
        return
    if existing["cloudUrl"]!=answers["cloudUrl"]:
        raise ValueError("This installation belongs to a different cloud project.")
    config_dir=root/"configuration"
    # Existing credential files remain protected. Check they still match before reassigning.
    script = """$ErrorActionPreference='Stop'
$a=[Console]::In.ReadToEnd() | ConvertFrom-Json
foreach($pair in @(@('cloud-key.dpapi','cloudKey'),@('obs-key.dpapi','obsPassword'))){
$s=ConvertTo-SecureString ((Get-Content -LiteralPath (Join-Path $a.dir $pair[0]) -Raw).Trim())
if([Net.NetworkCredential]::new('',$s).Password -cne $a.($pair[1])){throw 'Saved credentials differ. Use the gateway credential maintenance procedure.'}}"""
    powershell(["-Command",script],input=json.dumps({**answers,"dir":str(config_dir)}).encode("ascii"))
    model=answers["model"]
    updated={**existing,"models":[model],"sessionIds":[],"discoveryMode":"single-venue",
        "naviHost":answers["robotHost"] if model=="navi" else "unused.invalid",
        "aegisHost":answers["robotHost"] if model=="aegis" else "unused.invalid",
        "sshKey":answers.get("sshKey",""),"aegisUser":answers.get("aegisUser","unused"),
        "masterDeployment":answers.get("masterDeployment","")}
    atomic_json(config_dir/"gateway.json",updated)


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("root",type=Path)
    parser.add_argument("obs",type=Path)
    args=parser.parse_args()
    settings=load_connection(TOOLS.parent/"Site connection.json")
    model=pick(["master","navi","aegis"],str.upper,"robot model")
    host=str(ipaddress.ip_address(input("Robot IP at this location: ").strip()))
    config=args.root/"configuration/gateway.json"
    with SetupLock(args.root):
        check_idle(args.root)
        install_site_runtime(args.root)
        client,password=open_obs(args.obs)
        try:
            existing=load(config) if config.exists() else {}
            setup_camera(client,settings)
            check_site_connections(settings,model,host)
            answers=site_answers(settings,args.root,model,host,password,existing)
            save_gateway(args.root,answers,existing)
        finally:
            client.disconnect()
    run_gateway(args.root,"Check")
    print(f"Site checks passed for {model.upper()} at {host}. Check the moving picture in OBS.")
    print("Choose S in START HERE to listen for future website bookings. No booking is needed now.")

if __name__=="__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.exit("Setup cancelled.")
    except subprocess.CalledProcessError:
        sys.exit("Setup check failed. See the message above.")
    except (ValueError,FileNotFoundError) as error:
        sys.exit(str(error))
    except Exception as error:
        sys.exit(f"Quick setup failed ({type(error).__name__}). Check OBS and the installation, then retry.")
