"""Query the local OBS session. No request changes OBS state."""
import logging
import os
import sys

import obsws_python as obs

logging.disable(logging.CRITICAL)


def main():
    password = os.environ.pop("EAIC_LOCAL_OBS_PASSWORD")
    client = obs.ReqClient(host="127.0.0.1", port=4455, password=password, timeout=5)
    try:
        if "authentication" not in client.base_client.server_hello["d"]:
            raise ValueError("Enable password authentication in OBS.")
        version = client.get_version().obs_version
        scene = client.get_current_program_scene().current_program_scene_name
        video = client.get_video_settings()
        live = client.get_stream_status().output_active
        print(f"OBS {version} authenticated. Active scene: {scene}")
        print(f"Output: {video.output_width} x {video.output_height}. Stream active: {live}.")
        print("Check that this scene shows a moving picture from the new location.")
    finally:
        client.disconnect()


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"OBS check failed ({type(error).__name__}). Check OBS, port 4455 and the password.", file=sys.stderr)
        sys.exit(1)
