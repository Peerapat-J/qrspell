# QR Code Styling browser bundle

- Package: `qr-code-styling`
- Version: `1.9.2`
- Source: <https://github.com/kozakdenys/qr-code-styling>
- License: MIT; see `LICENSE`
- Original npm bundle SHA-256: `429de523c7563fc0647e618f5a8ea567d5a16412a13ef5d6a082b4502f5a54f9`
- Vendored bundle SHA-256: `0b6be9dd3e47b64b37c1fe447e374d25957e977444dbce3d47b956dc71236507`

The vendored browser bundle has one narrow compatibility change: its legacy
low-byte string conversion is replaced with the browser `TextEncoder` UTF-8
encoder so Thai text, emoji, and other Unicode content survive an exact QR
encode/decode round trip.
