# QRSpell 2.1 screenshots

Release set selected by the maintainer on 3 September 2026. Keep this set separate from the older images in `assets/app-preview/`.

- Source folder: `/Users/peerapatj/Documents/demo-qrspell-v2/2.1/2.1_cropped`
- PNGs are copied unchanged: 2880 × 1800, sRGB, 16:10.
- Homepage and lightbox order follows the filename numbers, 0–7.
- No additional cropping, retouching, stretching, or text changes.
- This is the selected release set, not a claim that every image was newly captured from build 7. The two workshop demo images are unchanged from the earlier set (`2.png` and `3.png`).

| Order | File | Shows |
| --- | --- | --- |
| 0 | `0menuBar.png` | Menu bar panel, scan actions, QR creation, recent History |
| 1 | `1demoQRscan.png` | Multiple QR codes detected in a document |
| 2 | `2demoQRpreview.png` | QR location preview, not a website URL preview |
| 3 | `3general.png` | General settings |
| 4 | `4scan.png` | Scan settings, optional URL previews and on-top result windows |
| 5 | `5qr.png` | QR design and data verification |
| 6 | `6history.png` | History storage and optional saved preview images |
| 7 | `7record.3.png` | History window, selection, and storage usage |

## Web copies

The gallery uses WebP copies at 640, 1280, and 2560 pixels wide. The lightbox opens the unchanged sRGB PNG. Aspect ratio is preserved.

To regenerate the WebP copies, run from this directory with `cwebp` installed:

```sh
for image in 0menuBar 1demoQRscan 2demoQRpreview 3general 4scan 5qr 6history 7record.3; do
  for width in 640 1280 2560; do
    cwebp -quiet -q 92 -m 6 -sharp_yuv -metadata icc -resize "$width" 0 \
      "$image.png" -o "web/$image-$width.webp"
  done
done
```

## Original PNG checksums (SHA-256)

```text
add5c02002e1f6c711b012ac5f7456a506e3fe95b7e8940b9ed0217257728e12  0menuBar.png
c31a2057b4ecaf5d055fb67f5f41b91c2f828601168e6eb6faab2696750dbed6  1demoQRscan.png
7db060437df22208db8bf7b8bc6f817c3d2e59c18fc82288f569c059812ee402  2demoQRpreview.png
26557d3b40c00b3b4f309c165f1dca8e7eb6f1bf3ad09d204bb6067ec1ae5730  3general.png
bab389fbb386635f754570eef20e95dc7aae2c128077d67871ab3d29fbfa9dd0  4scan.png
bcdb30f6649e87873fab443b1a7c06b8234b386a1bda20ec4b48e70b6b7b3039  5qr.png
5a10764e5efbda4d1209b482b92bf604b2db6eee5602499ec1977c4d8c1ff714  6history.png
1f3aa2d5252fc0013888accc9dcbcf149e1f11668fe6454d5f63028a69e02c34  7record.3.png
```
