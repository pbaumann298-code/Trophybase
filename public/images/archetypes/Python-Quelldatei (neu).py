from pathlib import Path
from PIL import Image

src_dir = Path("public/images/archetypes")  # Ordner mit deinen 6 Bildern
for img_path in src_dir.glob("*.*"):
    if img_path.suffix.lower() in (".jpg", ".jpeg", ".png"):
        with Image.open(img_path) as im:
            im = im.convert("RGB")
            im.thumbnail((600, 800), Image.Resampling.LANCZOS)
            out_path = img_path.with_suffix(".webp")
            im.save(out_path, "WEBP", quality=84, method=6)
            print(f"✅ {out_path.name} ({out_path.stat().st_size // 1024} KB)")
