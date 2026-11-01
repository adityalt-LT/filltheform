# Logo tools

`gen.py` and `anim.py` generate the static and animated SVG logos in `brand/`. `letters.json` holds the outlined letters of the wordmark (Inter Bold).
They need Python with `fonttools` and `brotli` (only to re-extract letters from a font; not needed to change colours or timing).
The dashboard's `web/js/logo.js` and the inline logo in `site/onepage/index.html` were generated from the same drawing: edit here, regenerate, paste.
