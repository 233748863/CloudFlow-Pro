import hashlib
import json
import re
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

evidence = Path('D:/CloudFlowPro/.cloudflow-runtime/full-prd-20260915/approved-runtime').resolve(strict=True)
output_name, *source_names = sys.argv[1:]
assert re.fullmatch(r'e1-[a-z-]+-image-review-20261009-r[1-9][0-9]*', output_name)
assert source_names
output = evidence / output_name
assert not output.exists()
output.mkdir()
font = ImageFont.truetype('C:/Windows/Fonts/segoeui.ttf', 18)
manifest = []
for source_name in source_names:
    assert re.fullmatch(r'e1-[a-z-]+-20[0-9]{6}-r[1-9][0-9]*', source_name)
    source = (evidence / source_name).resolve(strict=True)
    assert source.parent == evidence
    paths = sorted(source.glob('*.png'))
    assert paths
    for group_start in range(0, len(paths), 4):
        group = paths[group_start:group_start + 4]
        tiles = []
        for source_path in group:
            with Image.open(source_path) as opened:
                source_image = opened.convert('RGB')
            width = 720 if source_image.width > 800 else 390
            height = round(source_image.height * width / source_image.width)
            source_image = source_image.resize((width, height), Image.Resampling.LANCZOS)
            tiles.append((source_path, source_image))
        row_heights = [max(tile.height for _, tile in tiles[index:index + 2]) + 45 for index in range(0, len(tiles), 2)]
        canvas = Image.new('RGB', (1480, sum(row_heights) + 20), '#e2e8f0')
        drawing = ImageDraw.Draw(canvas)
        top = 10
        for index, (source_path, tile) in enumerate(tiles):
            if index and index % 2 == 0:
                top += row_heights[index // 2 - 1]
            left = 10 + (index % 2) * 740
            drawing.text((left, top), source_path.name, font=font, fill='#0f172a')
            canvas.paste(tile, (left, top + 30))
        sheet = output / (source_name + '-sheet-' + str(group_start // 4 + 1) + '.png')
        canvas.save(sheet)
        manifest.append({'sheet': sheet.name, 'images': [{'path': str(source_path.relative_to(evidence)), 'sha256': hashlib.sha256(source_path.read_bytes()).hexdigest()} for source_path in group]})
(output / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
print('ISOLATED_IMAGE_CONTACTS: originals=' + str(sum(len(entry['images']) for entry in manifest)) + '; sheets=' + str(len(manifest)))
