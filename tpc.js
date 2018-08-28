/*
 * @author ndixUR https://github.com/ndixUR
 * tpc.js - write B**Ware TPC files
 *
 * Copyright (C) 2018 ndix UR
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, version 3 or any later version.
 *
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License along with this program. If not, see http://www.gnu.org/licenses/
 *
 * Based on code from the xoreos project, http://xoreos.org
 * Original implementation is for decoding, this implementation is encoding.
 * Compatibility with xoreos code intended for ease of porting.
 */

const fs = require('fs');
const dxt = require('dxt-js');
const EventEmitter = require('events');

//XXX UI STUFF
const $ = require('jquery');

const
kEncodingGray         = 1,
kEncodingRGB          = 2,
kEncodingRGBA         = 4,
kEncodingSwizzledBGRA = 12;

const
kPixelFormatRGB  = 'GL_RGB',
kPixelFormatRGBA = 'GL_RGBA',
kPixelFormatBGR  = 'GL_BGR',
kPixelFormatBGRA = 'GL_BGRA';

const
kPixelFormatRGBA8  = 'GL_RGBA8',
kPixelFormatRGB8   = 'GL_RGB8',
kPixelFormatRGB5A1 = 'GL_RGB5_A1',
kPixelFormatRGB5   = 'GL_RGB5',
kPixelFormatDXT1   = 'GL_COMPRESSED_RGB_S3TC_DXT1_EXT',
kPixelFormatDXT3   = 'GL_COMPRESSED_RGBA_S3TC_DXT3_EXT',
kPixelFormatDXT5   = 'GL_COMPRESSED_RGBA_S3TC_DXT5_EXT';

let image = {
  //dataSize:      0,
  dataSize:      0,
  alphaBlending: 1.0, // MAYBE
  width:         0,
  height:        0,
  encoding:      kEncodingRGBA,
  //encoding:      kEncodingRGB,
  mipMapCount:   0,
  format:        kPixelFormatBGRA,
  //format:        kPixelFormatBGR,
  formatRaw:     kPixelFormatRGBA8,
  //formatRaw:     kPixelFormatDXT1,
  alphaFound:    false,
  layerCount:    1,
  layerDim:      { width: 0, height: 0 },
  layerPos:      [],
  txi:           '',
  interpolation: false,
  flip_y:        false,
  flip_x:        false,
  texture:       null
};

let feedback = new EventEmitter();

function getDataSize(format, width, height) {
  if (format == kPixelFormatRGB8) {
    return width * height * 3;
  } else if (format == kPixelFormatRGBA8) {
    return width * height * 4;
  } else if (format == kPixelFormatRGB5A1 ||
             format == kPixelFormatRGB5) {
    return width * height * 2;
  } else if (format == kPixelFormatDXT1) {
    return Math.max(8, parseInt((width + 3) / 4) * parseInt((height + 3) / 4) * 8);
  } else if (format == kPixelFormatDXT3 ||
             format == kPixelFormatDXT5) {
    return Math.max(16, parseInt((width + 3) / 4) * parseInt((height + 3) / 4) * 16);
  }
  // this is an error, really
  return 0;
}

function compressionRequested(format) {
  return (
    format == kPixelFormatDXT1 ||
    format == kPixelFormatDXT3 ||
    format == kPixelFormatDXT5
  );
}

// given a texture and TXI string, prepare the TPC header & general info
function prepare(texture) {
  // texture is data type from three.js tgaloader
  image.texture = texture;
  image.width   = image.texture.image.width;
  image.height  = image.texture.image.height;
  image.size    = image.width * image.height * 4; // size of ImageData buffer
  //console.log(texture);
  //console.log(texture.pixelDepth);

  image.alphaFound = false;
  if (texture.pixelDepth > 24) {
    image.alphaFound = true;
  }

  image.fullImageDataSize = getDataSize(image.formatRaw, image.width, image.height);
  //image.size = image.fullImageDataSize;
  image.dataSize = 0;
  if (compressionRequested(image.formatRaw)) {
    //image.dataSize = getDataSize(image.formatRaw, image.width, image.height);
    image.dataSize = image.fullImageDataSize;
  }

  image.mipMapCount = (Math.log(image.width) / Math.log(2)) + 1;
  image.layerCount = 1;

  if (image.txi && image.txi.match(/^\s*proceduretype\s+cycle/im)) {
    // animated texture, 1 layer per frame,
    // image.dataSize = layers * layerDataSize (sum w/ all mipmaps)
    console.log('make animated texture');
    let numx, numy;
    numx = image.txi.match(/^\s*numx\s+(\d+)/im);
    numy = image.txi.match(/^\s*numy\s+(\d+)/im);
    defwidth  = image.txi.match(/^\s*defaultwidth\s+(\d+)/im);
    defheight = image.txi.match(/^\s*defaultheight\s+(\d+)/im);
    numx = numx ? parseInt(numx[1]) : null;
    numy = numy ? parseInt(numy[1]) : null;
    defwidth = defwidth ? parseInt(defwidth[1]) : null;
    defheight = defheight ? parseInt(defheight[1]) : null;
    if (!defwidth || defwidth > image.width / numx) {
      defwidth = image.width / numx;
    }
    if (!defheight || defheight > image.height / numy) {
      defheight = image.height / numy;
    }
    image.layerCount = numx * numy;
    image.layerDim.width = parseInt(defwidth);
    image.layerDim.height = parseInt(defheight);
    image.layerPos = [];
    for (let y = 0; y < image.height; y += image.layerDim.height) {
      for (let x = 0; x < image.width; x += image.layerDim.width) {
        image.layerPos.push({ x: x, y: y });
      }
    }
    let w = image.layerDim.width;
    let h = image.layerDim.height;
    if (compressionRequested(image.formatRaw)) {
      /*
      if (image.formatRaw != kPixelFormatDXT1) {
        return {error:{
          message: 'DXT1 compression required',
          detail: 'DXT5 animated textures crash the game engine.'
        }};
      }
      */
      image.dataSize = 0;
      while (w >= 1) {
        image.dataSize += getDataSize(image.formatRaw, w, h);
        w /= 2;
        h /= 2;
      }
      //if (image.formatRaw == kPixelFormatDXT1) {
      image.dataSize *= image.layerCount;
      //}
    } else {
      return {error:{
        message: 'compression required',
        detail: 'Uncompressed animated textures not yet implemented.'
      }};
    }
    image.mipMapCount = 1;
    if ((image.layerDim.width && (image.layerDim.width & (image.layerDim.width - 1))) ||
        (image.layerDim.width && (image.layerDim.width & (image.layerDim.width - 1)))) {
      // non-power of 2 width, this is an error
      if (compressionRequested(image.formatRaw)) {
        return {error: {
          message: 'invalid input image',
          detail: 'Invalid input frame size: ' + image.layerDim.width +
                  'px x ' + image.layerDim.height + 'px, ' +
                  'frame x and y must be power of 2.'
        }};
      }
    }
  } else if (image.txi && image.txi.match(/^\s*cube\s+1/im)) {
    // cubemap, 6 layers,
    // image.dataSize = layerDataSize (w/o mipmaps)
    console.log('make cubemap texture');
    image.layerCount = 6;
    image.layerDim.width = image.width;
    image.layerDim.height = image.width;
    image.layerPos = [];
    for (let y = 0; y < image.height; y += image.layerDim.width) {
      image.layerPos.push({ x: 0, y: y });
    }
    if (compressionRequested(image.formatRaw)) {
      image.dataSize = getDataSize(image.formatRaw, image.layerDim.width, image.layerDim.width);
    }
    if (image.layerDim.width && (image.layerDim.width & (image.layerDim.width - 1))) {
      // non-power of 2 width, this is an error
      if (compressionRequested(image.formatRaw)) {
        return {error: {
          message: 'invalid input image',
          detail:  'Invalid input image size: ' + image.width + 'px, ' +
                   'width must be power of 2.'
        }};
      }
    }
  }
  // n power of 2? n && (n & (n - 1)) === 0;
  //console.log(image);
  return image;
};

/*
 * Asynchronous write flow:
 * write_data, write_mipmap (reentrant), write_txi, callback
 */
function write_data(stream, image, cb) {
  let width   = image.width,
      height  = image.height,
      size    = image.size,
      scale   = 1,
      layer   = 1,
      filepos = 128;
  //XXX UI STUFF
  //let cbound = [ $('.preview').get(0).offsetWidth, $('.preview').get(0).offsetWidth ];
  //console.log($('.preview').get(0));
  let cw = Math.min(image.width, $('.preview').get(0).offsetWidth);
  let cbound = [ cw, cw * 2 ];
  //let cbound = [ Math.min(image.width, $('.preview').get(0).offsetWidth), $('.preview').get(0).offsetWidth * 2 ];
  $('.preview').prepend(`<canvas width="${cbound[0]}" height="${cbound[1]}"></canvas>`);
  //$('.preview').prepend(`<canvas width="${image.width}" height="${image.height}"></canvas>`);
  /*
  let ctx = $('.preview > canvas').get(0).getContext('2d');
  ctx.scale($('.preview').get(0).offsetWidth / image.width,
            $('.preview').get(0).offsetWidth / image.width);
  */
  if (image.layerCount > 1) {
    width  = image.layerDim.width;
    height = image.layerDim.height;
    size   = width * height * 4;
  }
  //console.log($('.preview').get(0).offsetWidth / image.width);
  write_mipmap(stream, image, width, height, size, scale, filepos, layer, cb);
}

// emulate the canvas 2d drawing context getImageData function,
// providing a linearized data buffer containing an arbitrary rectangle
function getImageData(data, width, x, y, w, h) {
  const imageData = new Uint8ClampedArray(w * h * 4);
  //console.log(imageData.byteLength);
  //console.log(`width ${width} x ${x} y ${y} w ${w} h ${h}`);
  let imgData_offset = 0;
  for (let i = 0; i < h; i++) {
    const row_begin = (x + (i * width)) * 4;
    const row_end = row_begin + (w * 4);
    //console.log(i + ': ' + row_begin + ' - ' + row_end + ' @' + imgData_offset);
    imageData.set(data.subarray(row_begin, row_end), imgData_offset);
    imgData_offset += row_end - row_begin;
  }
  return imageData;
}

function write_mipmap(stream, image, width, height, size, scale, filepos, layer, cb) {
  if (width < 1) { // || (image.width / width) > image.mipMapCount) {
    // we write mipmaps until we reach 1 pixel
    // the next/final step is writing the txi data
    if (layer < image.layerCount) {
      return write_mipmap(
        stream, image,
        image.layerDim.width, image.layerDim.height,
        image.layerDim.width * image.layerDim.height * 4,
        1, filepos, layer + 1,
        cb
      );
    }
    return write_txi(stream, image, cb);
  }
  //XXX UI STUFF
  let mmapcv = $(`<canvas width="${width}" height="${height}"></canvas>`).get(0);
  let octx = mmapcv.getContext('2d');
  let img = octx.createImageData(width, height);

  let compressed_size = getDataSize(image.formatRaw, width, height);

  console.log(
    'layer ' + layer + ' mipmap ' + (Math.log(scale) / Math.log(2)) + ': ' +
    filepos + '-' + (filepos + compressed_size) + ' (' + compressed_size + ') ' +
    '(' + width + ',' + height + ')'
  );

  // set layer width/height
  let layer_width = image.layerCount > 1 ? image.layerDim.width : image.width;
  let layer_height = image.layerCount > 1 ? image.layerDim.height : image.height;
  let layer_x = image.layerCount > 1 ? image.layerPos[layer - 1].x : 0;
  let layer_y = image.layerCount > 1 ? image.layerPos[layer - 1].y : 0;
  // get the source TGA image's pixel image data
  let ctx, pixels;
  if (image.texture.image && image.texture.mipmaps.length) {
    pixels = { data: getImageData(
      image.texture.mipmaps[0], image.width,
      layer_x, layer_y, layer_width, layer_height
    ) };
  } else {
    ctx = image.texture.image.getContext('2d');
    pixels = ctx.getImageData(layer_x, layer_y, layer_width, layer_height);
  }

  //let pixout = width * height * 4;
  let mipmap = new Uint8Array(size);
  //console.log('interpolation', image.interpolation);
  // process the pixel data
  for (let y_iter = 0; y_iter < height; y_iter++) {
    let y = y_iter;
    if (image.flip_y) {
      y = (height - 1) - y_iter;
      //console.log('flip y ' + y_iter + ' => ' + y);
    }
    for (let x_iter = 0; x_iter < width; x_iter++) {
      let x = x_iter;
      if (image.flip_x) {
        x = (width - 1) - x_iter;
      }
      let x_scaled = x * scale;
      let y_scaled = y * scale;
      //let pixel = ctx.getImageData(x, y, 1, 1);
      //console.log((height - 1));
      //console.log((height - 1) - y);
      //console.log(((height - 1) - y) * width);
      //let in_index = ((((height - 1) - y_scaled) * width) + x_scaled) * 4;
      //let out_index = ((y * width) + x) * 4;
      //let out_index = ((y * width) + x) * 4;
      let out_index = ((y_iter * width) + x_iter) * 4;
      //let in_index  = ((((image.height - 1) - y_scaled) * image.width) + x_scaled) * 4;
      let in_index  = ((((layer_height - 1) - y_scaled) * layer_width) + x_scaled) * 4;
      let int_scaler = Math.max(1, scale / 4);
      //console.log(in_index + ' => ' + out_index);
      for (let i = 0; i < 4; i++) {
        // i = r, g, b, a pixel data
        let datum = pixels.data[in_index + i];
        if (image.interpolation &&
            scale > 1 && y > 0 && x > 0 &&
            y_scaled < layer_height - 1 &&
            x_scaled < layer_width - 1 &&
            (i != 3 || image.alphaFound)) {
          // slightly different approach,
          // if x < width/2, use -1, 0, 1, 2
          // if x >= width/2 use -2, -1, 0, 1
          // if x < width/2, use -1, 0, 1, 2
          // if x >= width/2 use -2, -1, 0, 1
          let x_pts = [ -1, 0, 1, 2 ];
          if (x_scaled > (layer_width - 1) / 2) {
            x_pts = [ -2, -1, 0, 1 ];
          } else if (x_scaled == (layer_width - 1) / 2) {
            x_pts = [ -2, -1, 1, 2 ];
          }
          let y_pts = [ -1, 0, 1, 2 ];
          if (y_scaled > (layer_height - 1) / 2) {
            y_pts = [ -2, -1, 0, 1 ];
          } else if (y_scaled == (layer_height - 1) / 2) {
            y_pts = [ -2, -1, 1, 2 ];
          }
          // pixel datum = (y * width) + x * 4 + i
          // in_index has pixel (red channel) under consideration
          // so, in_index + i = datum under consideration, '-2,-2' = (in_index + i) + (-2 * 4 * int_scaler) + (-2 * 4 * int_scaler * image.width)
          //if (width < 256) {
          let p = [ [], [], [], [] ];
          for (let col in x_pts) {
            let xpt = x_pts[col];
            for (let row in y_pts) {
              let ypt = y_pts[row];
              /*
              console.log(
                x_scaled, y_scaled, xpt, ypt,
                int_scaler, i, in_index, '=>',
                (in_index + i) + (xpt * 4 * int_scaler) + (ypt * 4 * int_scaler * image.width)
              );
              */
              p[col][row] = pixels.data[
                (in_index + i) +
                (xpt * 4 * int_scaler) +
                (ypt * 4 * int_scaler * layer_width)
              ];
            }
          }
          //XXX debug only value
          let original = datum;
          // constrain result to 0-255 range
          datum = Math.round(
            Math.max(0, Math.min(255,
              bicubic_interpolation(p, 0.5, 0.5)
            ))
          );
          if (datum < 0) { 
            p.push(original);
            p.push(datum);
            console.log(p);
          }
        }
        mipmap[out_index + i] = datum;
        img.data[out_index + i] = datum;
      }
    }
  }
  //XXX UI STUFF
  // put image data into this mipmap's full-sized canvas
  octx.putImageData(img, 0, 0);
  // get preview canvas context
  let draw_ctx = $('.preview canvas').get(0).getContext('2d');
  draw_ctx.imageSmoothingEnabled = false;
  // deprecated:
  //draw_ctx.webkitImageSmoothingEnabled = false;
  //console.log(((2 * image.height) - (2 * height)));
  //console.log(((2 * image.height) - (2 * height)) * ($('.preview canvas').get(0).offsetWidth / image.height));
  // draw the full-sized mipmap image, appropriately scaled and positioned
  draw_ctx.drawImage(
    mmapcv,
    0, 0, width, height,
    //0, ((2 * image.height) - (2 * height)),
    0, ((2 * layer_height) - (2 * height)) * Math.min(1, $('.preview canvas').get(0).offsetWidth / layer_height),
    Math.min(width, $('.preview canvas').get(0).offsetWidth / scale),
    Math.min(height, $('.preview canvas').get(0).offsetWidth / scale)
  );

  let img_buf;
  if (compressionRequested(image.formatRaw)) {
    let compression_flags = dxt.flags.ColourIterativeClusterFit | dxt.flags.ColourMetricPerceptual;
    if (image.formatRaw == kPixelFormatDXT1) {
      compression_flags |= dxt.flags.DXT1;
    } else if (image.formatRaw == kPixelFormatDXT3) {
      compression_flags |= dxt.flags.DXT3;
    } else if (image.formatRaw == kPixelFormatDXT5) {
      compression_flags |= dxt.flags.DXT5;
    }
    //let compress = dxt.compress(mipmap.buffer, width, height, compression_flags);
    //console.log(Buffer.from(mipmap.buffer));
    let compress;
    try {
      compress = dxt.compress(Buffer.from(mipmap.buffer), width, height, compression_flags);
    } catch (err) {
      console.log(err);
      return cb({message: 'compression failed', detail: 'DXT compress failed.'});
    }
    //console.log(compress);
    img_buf = Buffer.from(compress);
    //img_buf = compress;
    //console.log(img_buf);
  } else {
    img_buf = Buffer.from(mipmap.buffer);
  }

  // write the mipmap to the TPC output file
  //stream.write(Buffer.from(mipmap.buffer), function(err, bytesWritten, buffer) {
  stream.write(img_buf, function(err, bytesWritten, buffer) {
    if (err) { console.log(err); return; }
    //(Math.log(scale) / Math.log(2)) == mipmap # 
    // mipmap progress = 50% * mipmap num * 50%
    let prog = 1 - (Math.pow(0.5, (Math.log(scale) / Math.log(2)) + 1));
    //console.log('mipmap prog', prog);
    // layer progress
    prog = (prog / image.layerCount) + ((layer - 1) / image.layerCount);
    //console.log(layer, image.layerCount);
    //console.log('layer prog', prog);
    feedback.emit('progress', prog);
    // prepare settings for next run
    //filepos += size;
    //console.log(bytesWritten);
    //filepos += size;
    filepos += compressed_size;
    scale   *= 2;
    width   /= 2;
    height  /= 2;
    size     = width * height * 4;
    //console.log(scale, width, height, size, filepos);
    // proceed to next mipmap, allow UI update w/ immediate timeout
    setTimeout(function() {
      write_mipmap(stream, image, width, height, size, scale, filepos, layer, cb);
    }, 0);
  });
}

function write_txi(stream, image, cb) {
  if (!image || !image.txi || !image.txi.length) {
    feedback.emit('progress', 1);
    stream.end();
    if (cb) return cb();
    return;
  }
  // vanilla tpc uses windows line endings, so replicate that
  image.txi = image.txi.trim().replace(/\r\n/g, '\n').replace(/\n/g, '\r\n');
  // add trailing carriage return/newline
  image.txi += '\r\n';
  stream.write(image.txi, function(err, bytesWritten, buffer) {
    if (err) { console.log(err); return; }
    feedback.emit('progress', 1);
    // final success, callback
    stream.end();
    if (cb) return cb();
    return;
  });
}

/**********************
 * export TPC file for texture, with txi text, interpolate if requested
 * cb called upon completion
 * @public
 */
function export_tpc(filename, texture, cb) {
  /*
  if (fs.existsSync(filename)) {
    console.log(filename + ' already exists');
    return null;
  }
  */
  //txi = txi || '';
  //interpolation = interpolation || false;
  //console.log(image);
  //console.log(texture);
  feedback.emit('progress', 0);

  let result = prepare(texture);
  
  if (!result) {
    return cb({
      message: 'unknown failure',
      detail: 'Unable to prepare texture for unknown reason.'
    });
  }
  if (result.error) {
    return cb(result.error);
  }
  feedback.emit('progress', 0.01);

  //image.txi             = txi;
  //image.interpolation   = interpolation;
  //console.log(image);

  // construct the header as a Uint8 byte array
  let header = new Uint8Array(128);
  let dv = new DataView(header.buffer);
  dv.setUint32(0, image.dataSize, true);
  dv.setFloat32(4, image.alphaBlending, true);
  dv.setUint16(8, image.width, true);
  dv.setUint16(10, image.height, true);
  header[12] = image.encoding;
  header[13] = image.mipMapCount;
  for (let i = 0; i < 114; i++) {
    header[14 + i] = 0;
  }
  //console.log(header);

  // open a write stream for the TPC output file
  let tpc_stream = fs.createWriteStream(filename, {
    autoClose: true
  });
  // when open, write the header
  tpc_stream.addListener('open', function(fd) {
    tpc_stream.write(Buffer.from(header.buffer), function(err, bytesWritten, buffer) {
      //console.log(err);
      //console.log('wrote header to ' + filename);
      // header is written, proceed to writing data
      write_data(tpc_stream, image, cb);
    });
  });
  tpc_stream.addListener('error', function(err) {
    //console.log(err);
    return cb({
      message: 'unknown failure',
      detail: 'Unable to write file for unknown reason.'
    });
  });
}

/**********************
 * cubic interpolation methods, used for bicubic interpolation on reduced size mipmaps
 */
// basic cubic interpolation
function cubic_interpolation(p, x) {
  return p[1] + 0.5 * x * (
    p[2] - p[0] + x * (
      2.0 * p[0] - 5.0 * p[1] + 4.0 * p[2] - p[3] + x * (
        3.0 * (p[1] - p[2]) + p[3] - p[0]
      )
    )
  );
}

// bicubic interpolation built on basic cubic interpolator
function bicubic_interpolation(p, x, y) {
  let result = [
    cubic_interpolation(p[0], y),
    cubic_interpolation(p[1], y),
    cubic_interpolation(p[2], y),
    cubic_interpolation(p[3], y),
  ];
  return cubic_interpolation(result, x);
}

/*
 *
 */
function settings(key, value) {
  if (!key) {
    return image;
  }
  if (key == 'compression') {
    // this is a special composite setting with possible values:
    // none, dxt1, dxt3, dxt5
    if (value == 'none') {
      image.dataSize = 0;
      image.encoding = kEncodingRGBA;
      image.format = kPixelFormatRGBA;
      image.formatRaw = kPixelFormatRGBA8;
    } else if (value == 'dxt1') {
      image.encoding = kEncodingRGB;
      image.format = kPixelFormatBGR;
      image.formatRaw = kPixelFormatDXT1;
    } else if (value == 'dxt3') {
      image.encoding = kEncodingRGBA;
      image.format = kPixelFormatBGRA;
      image.formatRaw = kPixelFormatDXT3;
    } else if (value == 'dxt5') {
      image.encoding = kEncodingRGBA;
      image.format = kPixelFormatBGRA;
      image.formatRaw = kPixelFormatDXT5;
    }
    return;
  }
  image[key] = value;
}

// MODULE EXPORTS
module.exports = {
  export_tpc: export_tpc,
  settings: settings,
  feedback: feedback,
};
