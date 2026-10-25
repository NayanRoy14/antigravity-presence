"""Render anim.html frames with headless Chrome and assemble looping GIFs.

usage: python build.py [state ...]   (default: all states)
"""
import os
import subprocess
import sys
import tempfile
from concurrent.futures import ThreadPoolExecutor

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
STATES = ["float", "work", "think", "type", "sleep"]
FRAMES = 30
FRAME_MS = 66  # ~2s loop
SIZE = 256


def render(state, i, out_dir):
    path = os.path.join(out_dir, f"{state}-{i:02d}.png")
    url = "file:///" + os.path.join(HERE, "anim.html").replace("\\", "/") + f"?state={state}&t={i / FRAMES:.4f}"
    subprocess.run(
        [CHROME, "--headless", "--disable-gpu", "--hide-scrollbars", "--window-size=512,512",
         "--force-device-scale-factor=1", f"--screenshot={path}", url],
        check=True, capture_output=True,
    )
    return path


def build(state, tmp):
    with ThreadPoolExecutor(6) as pool:
        paths = list(pool.map(lambda i: render(state, i, tmp), range(FRAMES)))
    frames = [Image.open(p).convert("RGB").resize((SIZE, SIZE), Image.LANCZOS) for p in paths]
    # One shared palette keeps colors stable between frames (no flicker).
    strip = Image.new("RGB", (SIZE, SIZE * len(frames)))
    for n, f in enumerate(frames):
        strip.paste(f, (0, n * SIZE))
    palette = strip.quantize(colors=255, method=Image.Quantize.MEDIANCUT)
    quantized = [f.quantize(palette=palette, dither=Image.Dither.NONE) for f in frames]
    out = os.path.join(HERE, f"antigravity-{state}.gif")
    quantized[0].save(out, save_all=True, append_images=quantized[1:], duration=FRAME_MS, loop=0, optimize=True, disposal=1)
    print(f"{out}  {os.path.getsize(out) // 1024} KB")


if __name__ == "__main__":
    with tempfile.TemporaryDirectory() as tmp:
        for s in sys.argv[1:] or STATES:
            build(s, tmp)
