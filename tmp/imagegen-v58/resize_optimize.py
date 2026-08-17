from pathlib import Path
from PIL import Image
import sys
src=Path(sys.argv[1]); out=Path(sys.argv[2])
im=Image.open(src).convert("RGBA")
box=im.getbbox()
if box:
    im=im.crop(box)
canvas=Image.new("RGBA",(192,192),(0,0,0,0))
im.thumbnail((176,176),Image.Resampling.LANCZOS)
canvas.alpha_composite(im,((192-im.width)//2,(192-im.height)//2))
canvas.save(out,"PNG",optimize=True,compress_level=9)
