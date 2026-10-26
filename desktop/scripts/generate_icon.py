"""Generate the branded UNICOSEC icon without committing font or binary files."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

root = Path(__file__).resolve().parents[1] / "build"
root.mkdir(parents=True, exist_ok=True)
size = 1024
icon = Image.new("RGBA", (size, size), (0, 0, 0, 0))
draw = ImageDraw.Draw(icon)

# Navy rounded tile and white wordmark, consistent with the DMS branding.
draw.rounded_rectangle((20, 20, size - 20, size - 20), radius=224, fill="#173e64")
font_paths = [
    Path("C:/Windows/Fonts/arialbd.ttf"),
    Path("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"),
]
font = next((ImageFont.truetype(str(p), 625) for p in font_paths if p.exists()), None)
if font:
    bbox = draw.textbbox((0, 0), "U", font=font, stroke_width=0)
    width, height = bbox[2] - bbox[0], bbox[3] - bbox[1]
    x = (size - width) / 2 - bbox[0]
    y = (size - height) / 2 - bbox[1] - 5
    draw.text((x, y), "U", font=font, fill="#ffffff")
else:
    # Shape fallback if the system has no available font.
    draw.line([(326, 270), (326, 615)], fill="#ffffff", width=113)
    draw.line([(698, 270), (698, 615)], fill="#ffffff", width=113)
    draw.arc((326, 490, 698, 790), 0, 180, fill="#ffffff", width=113)
draw.rounded_rectangle((754, 744, 850, 840), radius=28, fill="#70c2d4")
icon.save(root / "icon.png", format="PNG")
icon.save(root / "icon.ico", format="ICO", sizes=[
    (16, 16), (24, 24), (32, 32), (48, 48),
    (64, 64), (128, 128), (256, 256)
])
print("Generated UNICOSEC Windows icon (PNG and ICO)")
