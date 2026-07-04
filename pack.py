# Packs a folder's contents into a zip using forward-slash paths.
# Windows PowerShell's Compress-Archive writes backslash separators, which
# addons.mozilla.org rejects ("Invalid file name in archive"). This produces a
# spec-compliant zip with manifest.json at the zip root.
# Usage: python pack.py <source_dir> <output_zip>
import sys, os, zipfile

src, out = sys.argv[1], sys.argv[2]
with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
    for root, _dirs, files in os.walk(src):
        for name in sorted(files):
            full = os.path.join(root, name)
            arc = os.path.relpath(full, src).replace(os.sep, '/')
            z.write(full, arc)
print('Packed', out)
