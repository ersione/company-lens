# Site icons

The existing Company Lens bar-chart mark in `public/icon.svg` is the source for all browser icons. The dark background and teal bars are preserved.

| URL | Format | Dimensions |
| --- | --- | --- |
| `/favicon.ico` | ICO with three PNG frames | 16, 32, 48 px |
| `/favicon-96.png` | PNG | 96 × 96 px |
| `/apple-touch-icon.png` | PNG | 180 × 180 px |
| `/icon.svg` | SVG | Scalable |

`app/layout.tsx` explicitly declares each URL, MIME type, and size. Keep these files in `public/`: a file-based `app/icon.*` overrides configured icon metadata in Next.js. Do not add a second icon declaration through that convention.

The raster assets were rendered directly from the SVG with Sharp at each target size. The ICO contains a standard ICONDIR and three ICONDIRENTRY records pointing to the corresponding PNG frames. When the source mark changes, regenerate all three raster files and run `tests/browser/site-icons.spec.ts` against a production candidate build. That test checks the rendered head on home, search, and company detail pages, response types, PNG dimensions, and browser decoding of each ICO frame.

These assets provide conventional raster candidates for browsers that do not select the SVG. Desktop browser checks cannot establish whether the iPhone Chrome tab switcher displays the icon; that requires checking the actual device.
