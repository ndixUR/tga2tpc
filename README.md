# tga2tpc

**Convert TGA format image files into TPC format used as textures in Odyssey engine games.**

Uses a slightly modified TGA loader based on three.js example, but returning a bit more information in the image object.

**Features**

* Queued operation for mass conversions
* Drag and drop TGA and TXI files
* Bicubic downsampling for mipmaps (very slow implementation)
* DXT1/5 compression
* Cube maps
* Animated textures
* Horizontal/Vertical flipping for those TGAs that are wrongly oriented


## Dev Install

* Clone the repository
* `npm install`
* **dxt-js** has special requirements, because the distributed version lacks memory grow support, so you will want to rebuild it. Theoretically there are other workarounds, maybe some that work better, but this is the one I used.
  * must have `emscripten` installed, in-path
  * need an altered `dxt-js/squish/build.sh` file (included), because default script's browser/worker/nodejs context detection replacement doesn't yield correct behavior in electron.
  * `cp dxtjs-squish-build.sh node_modules/dxt-js/squish/build.sh`
  * `cd node_modules/dxt-js/squish/; ./build.sh; cd -;`

## Build Instructions

**Building from MacOS**

`npm run dist` to start the build process for MacOS & Windows.

Make sure wine binaries are in-path. If not, you may be able to run it like this:

`PATH="/Applications/Wine Stable.app/Contents/Resources/wine/bin:$PATH" npm run dist`

Project is set to use NSIS Windows target, even though I've never seen the installer it yields function properly. As a result, I just distribute contents of `dist/win-unpacked`. Probably if you have Windows it is easier to get something else to work.


### Known issues

**The application becomes unresponsive during conversion.** Restructuring to make more of the conversion non-blocking would be good.

**Conversion queue only stops between images, not immediately when you hit stop.**

**Cannot create animated uncompressed textures.** It is not clear how this works in the TPC format, assuming it is possible.

**This project code isn't well-structured; it was designed to be implemented in a few hours.**
If anyone wanted to make it into something bigger & better, I would recommend refactoring the TPC library to not maintain internal state, at least. Also the jquery UI is basically at its limit, anything more complicated is likely to benefit from a more advanced UI framework.


## License

[BSD-2-Clause](LICENSE)
