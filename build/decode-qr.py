#!/usr/bin/env python3
"""Decode a QR code out of a PNG and print what it says.

Used by test/qr.test.js. The encoder in public/qr.js is not trusted because the
code looks right; it is trusted because the rendered pixels come back off a
real decoder as the string that went in. A dead QR kills a whole mail drop.

    python3 build/decode-qr.py file.png
"""
import sys
import cv2

path = sys.argv[1]
img = cv2.imread(path)
if img is None:
    print("NOIMAGE", file=sys.stderr)
    sys.exit(2)
ok, decoded, points, _ = cv2.QRCodeDetector().detectAndDecodeMulti(img)
if not ok or not decoded or not decoded[0]:
    print("NODECODE", file=sys.stderr)
    sys.exit(1)
sys.stdout.write(decoded[0])
