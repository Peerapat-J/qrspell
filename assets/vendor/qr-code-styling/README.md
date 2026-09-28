# QR Code Styling browser bundle

- Package: `qr-code-styling`
- Version: `1.9.2`
- Source: <https://github.com/kozakdenys/qr-code-styling>
- License: MIT; see `LICENSE`
- Original npm bundle SHA-256: `429de523c7563fc0647e618f5a8ea567d5a16412a13ef5d6a082b4502f5a54f9`
- Vendored bundle SHA-256: `257ee6fd3568d5292b4aaa46199464edb77b383460ff578c76a2ef8ccf06d9ae`

The vendored browser bundle has two narrow compatibility changes: its legacy
low-byte string conversion is replaced with the browser `TextEncoder` UTF-8
encoder, and non-ASCII Byte segments include UTF-8 ECI assignment 26 in both
encoding and capacity calculations. Together these changes keep Thai text,
emoji, and other Unicode content interoperable with standards-aware QR readers.
