/*
 * tga2tpc User Interface (jQuery-based)
 *
 * Copyright (C) 2018 ndix UR
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, version 3 or any later version.
 *
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License along with this program. If not, see http://www.gnu.org/licenses/
 */

// high-resolution time constant
const NS_PER_SEC = 1e9;

let $    = require('jquery');
let ldr  = new THREE.TGALoader();
let path = require('path');
let tpc  = require(path.normalize(__dirname + '/tpc.js'));

const app_info = require(path.normalize(__dirname + '/package.json'));
// set application version string
(function() {
  $('h1 .version').text('v' + app_info.version);
})();

// native file open/save dialog support
const {dialog} = require('electron').remote;

// modal synchronization, prevent multiple dialogs
let dialog_lock = false;

function load_txi() {
  if (dialog_lock) {
    return;
  }
  dialog_lock = true;
  dialog.showOpenDialog({
    title: 'Open TXI file',
    filters: [
      { name: 'TXI Texture Info', extensions: ['txi'] },
      { name: 'TXI Text', extensions: ['txt'] },
    ],
    properties: [
      'openFile'
    ]
  },
  (fileNames) => {
    dialog_lock = false;
    if (fileNames === undefined || !fileNames.length) {
      return;
    }
    // read txi file, put it into txi text area
    $('.txi_data').val(
      require('fs').readFileSync(fileNames[0])
    );
  });
}
function load_files() {
  if (dialog_lock) {
    return;
  }
  dialog_lock = true;
  dialog.showOpenDialog({
    title: 'Open images for conversion',
    filters: [
      { name: 'TGA Image', extensions: ['tga'] }
    ],
    properties: [
      'openFile', 'multiSelections'
    ]
  },
  (fileNames) => {
    dialog_lock = false;
    if (fileNames === undefined || !fileNames.length) {
      return;
    }
    $(fileNames).each(function() {
      let absfile = this.toString();
      enqueue(absfile);
    });
    queue_state();
  });
}

function export_dir(cb) {
  if (dialog_lock) {
    return;
  }
  dialog_lock = true;
  dialog.showOpenDialog({
    title: 'Select destination folder for TPC exports',
    properties: [
      'openDirectory'
    ],
  },
  (folderPaths) => {
    dialog_lock = false;
    if (folderPaths === undefined ||
        !folderPaths.length) {
      return;
    }
    $('input.savepath').val(folderPaths[0]);
    if (cb && typeof cb === 'function') {
      return cb();
    }
  });
}
/********************************
 * queue control and execution
 */
// queue runner, load TGA image and process it
function run_queue() {
  let outpath = $('input.savepath').val();
  if (!outpath.length) {
    return export_dir(run_queue);
  }
  if (!$('.queue li.pending').length ||
      $('.halt_queue').length) {
    $('.halt_queue').remove();
    queue_state();
    return;
  }
  if ($('.preview canvas').length > 2) {
    $('.preview canvas').last().remove();
  }
  let queue_item = $('.queue li.pending').first();
  queue_item.toggleClass('pending active alert-info');
  queue_state();
  let alphaBlending = parseFloat(queue_item.attr('data-alpha'));
  //console.log(alphaBlending);
  let infile = queue_item.attr('data-filename');
  let outfile = infile.substr(Math.max(infile.lastIndexOf('/'), infile.lastIndexOf('\\')));
  // load TXI file if autoloading requested
  let file_stem = infile.match(/^(.+)\.tga/i);
  // retain this, as its value could change during processing
  let use_txi_file = $('.txi_use_file.yes.enabled').length ? true : false;
  if (use_txi_file &&
      file_stem && file_stem.length > 1 && file_stem[1] &&
      require('fs').existsSync(file_stem[1] + '.txi')) {
    $('.txi_data').val(require('fs').readFileSync(file_stem[1] + '.txi'));
  }
  //console.log(outfile);
  //console.log(outfile.lastIndexOf('.'));
  outfile = outpath + outfile.substr(0, outfile.lastIndexOf('.')) + '.tpc';
  //console.log(outfile);
  let t0 = process.hrtime();
  ldr.load(infile, (texture) => {
    //texture.image.getContext('2d').scale(0.5, 0.5);
    //$('.preview').empty().append(texture.image);
    let pixel_format = 'auto'; // automatic
    let pfsetting = $('.settings-menu a.pfraw.enabled');
    if (pfsetting.hasClass('dxt1')) {
      pixel_format = 'dxt1';
    } else if(pfsetting.hasClass('dxt3')) {
      pixel_format = 'dxt3';
    } else if(pfsetting.hasClass('dxt5')) {
      pixel_format = 'dxt5';
    } else if(pfsetting.hasClass('rgba8')) {
      pixel_format = 'none'; // uncompressed
    }
    tpc.settings(
      'flip_x',
      $('.settings-menu a.flip_x.enabled').length ? true : false
    );
    tpc.settings(
      'flip_y',
      $('.settings-menu a.flip_y.enabled').length ? true : false
    );
    tpc.settings(
      'interpolation',
      $('.settings-menu a.interp.enabled').length ? true : false
    );
    tpc.settings('txi', $('.txi_data').val());
    tpc.settings('compression', pixel_format);
    tpc.settings('alphaBlending', alphaBlending);
    tpc.export_tpc(
      outfile, texture,
      (err) => {
        if (use_txi_file) {
            // TXI autoloading
            // clear the TXI field after each process
            $('.txi_data').val('');
        }
        if (err) {
          queue_item.toggleClass('active alert-info done alert-danger');
          queue_item.append(
            `<div title="${err.detail}"><small>failed: ${err.message}</small></div>`
          );
          tpc.feedback.emit('progress', 1);
        } else {
          queue_item.toggleClass('active alert-info done alert-success');
          let t1 = process.hrtime(t0);
          queue_item.append(
            `<div><small>completed in ${(t1[0] + (t1[1] / NS_PER_SEC)).toFixed(4)}s</small></div>`
          );
        }
        run_queue();
      }
    );
  },
  () => { true; }, //onProgress
  (err) => {
    //onError
    if (use_txi_file) {
        // TXI autoloading
        // clear the TXI field after each process
        $('.txi_data').val('');
    }
    //console.log(err);
    // three.js gives us a generic ProgressEvent of type error
    // in error cases, with no specific message, thanks.
    if (!err.message || !err.detail) {
      err.message = 'unknown failure';
      err.detail = `file failed to load: ${infile}`;
    }
    queue_item.toggleClass('active alert-info done alert-danger');
    queue_item.append(
      `<div title="${err.detail}"><small>failed: ${err.message}</small></div>`
    );
    tpc.feedback.emit('progress', 1);
    run_queue();
  });
}
// pause queue after current image finishes
function pause_queue() {
  //$('button.queuestop').attr('disabled', 'disabled');
  $('body').append('<div class="halt_queue" style="display:none;"></div>');
  queue_state();
}
// clear queue, reset state, clear preview area
function clear_queue() {
  $('ul.queue li, .halt_queue, .preview *').remove();
  queue_state();
}
// add image file to queue
function enqueue(absfile) {
  let file = absfile.substr(Math.max(absfile.lastIndexOf('/'), absfile.lastIndexOf('\\')) + 1);
  $('.queue').append(
    `<li data-filename="${absfile}" data-alpha="1.0" class="list-group-item file pending">
      ${file}
      <span class="glyphicon glyphicon-remove close"></span>
      <span class="glyphicon glyphicon-eye-open alpha toggle"></span>
      <div class="alpha hide">
        <span class="glyphicon glyphicon-chevron-left down"></span>
        <span class="glyphicon glyphicon-chevron-right up"></span>
        <span style="opacity:1.0">blend 1.0</span>
      </div>
    </li>`
  );
  $('.queue li').last().find('.close').on('click', (ev) => {
    $(ev.target).closest('li').remove();
    queue_state();
  });
  $('.queue li').last().find('.alpha .down').on('mousedown', (ev) => {
    var queue_item_el = $(ev.target).closest('li');
    var a = parseFloat(queue_item_el.attr('data-alpha'));
    a = Math.max(a - 0.1, 0.0);
    //console.log(a);
    queue_item_el.attr('data-alpha', a.toFixed(1));
    queue_item_el.find('.alpha span').last().css(
      'opacity',
      a.toFixed(1)).text('blend ' + a.toFixed(1)
    );
    ev.preventDefault();
  });
  $('.queue li').last().find('.alpha .up').on('mousedown', (ev) => {
    var queue_item_el = $(ev.target).closest('li');
    var a = parseFloat(queue_item_el.attr('data-alpha'));
    a = Math.min(a + 0.1, 1.0);
    //console.log(a);
    queue_item_el.attr('data-alpha', a.toFixed(1));
    queue_item_el.find('.alpha span').last().css(
      'opacity',
      a.toFixed(1)).text('blend ' + a.toFixed(1)
    );
    ev.preventDefault();
  });
  $('.queue li').last().find('.alpha.toggle').on('click', (ev) => {
    $(ev.target).closest('li').find('div.alpha').toggleClass('hide');
  });
}
// update UI state for queue
function queue_state() {
  $('button.queuestop,button.queuestart').attr('disabled', 'disabled');
  if ($('.queue li.active').length && !$('.halt_queue').length) {
    $('button.queuestop').removeAttr('disabled');
  }
  if ($('.queue li.pending').length && !$('.queue li.active').length && !$('.halt_queue').length) {
    $('button.queuestart').removeAttr('disabled');
  }
}
// update image settings from UI state
function settings_state() {
  
}
function settings_update() {
  
}

/********************************
 * UI event handlers
 */
// button event handlers
$('button.loader').on('click',      load_files);
$('button.loader_txi').on('click',  load_txi);
$('button.savepath').on('click',    export_dir);
$('button.queuestart').on('click',  run_queue);
$('button.queuestop').on('click',   pause_queue);
$('button.queueclear').on('click',  clear_queue);
/*
$('button.interp').on('click', (ev) => { 
  $(ev.target).find('input').prop(
    'checked', !$(ev.target).find('input').prop('checked')
  )
});
*/
$('.settings-menu a').not('.pfraw').not('.txi_use_file').on('click', (ev) => {
  $(ev.currentTarget).toggleClass('enabled');
  ev.stopPropagation();
});
$('.settings-menu a.pfraw').on('click', (ev) => {
  //let make_enabled = true;
  //if ($(ev.target).is('.enabled')) {
  //  make_enabled = false;
  //}
  $('.settings-menu a.pfraw').removeClass('enabled');
  //if (make_enabled) {
    $(ev.currentTarget).addClass('enabled');
  //}
  ev.stopPropagation();
});
$('.settings-menu a.txi_use_file').on('click', (ev) => {
  // have some related UI state change, so we actually care about initial state
  let initial_state = false;
  if ($('.settings-menu a.txi_use_file.yes.enabled').length) {
    initial_state = true;
  }
  // perform a maybe toggle
  $('.settings-menu a.txi_use_file').removeClass('enabled');
  $(ev.currentTarget).addClass('enabled');
  if (!initial_state &&
      $('.settings-menu a.txi_use_file.yes.enabled').length) {
    // turning on TXI auto load files
    $('.txi_data').val('').attr('readonly', 'readonly');
    $('button.loader_txi').attr('disabled', 'disabled');
  } else if(initial_state &&
            $('.settings-menu a.txi_use_file.no.enabled').length) {
    // turning on TXI text field
    $('.txi_data').removeAttr('readonly');
    $('button.loader_txi').removeAttr('disabled');
  }
  ev.preventDefault();
  ev.stopPropagation();
});

tpc.feedback.on('progress', function(progress) {
  let width = (progress * 100) + '%';
  if (progress === 0) {
    $('.progress-bar').width('0%').closest('.progress').show();
  } else if (progress === 1) {
    $('.progress-bar').width('0%').closest('.progress').hide();
  } else {
    $('.progress-bar').width(width);
  }
  //console.log('progress ' + (progress * 100) + '%');
});

// drop TGA files into the queue
(function() {

  // insert frame for dragover hover effect
  $('body').prepend(`<div class="underlay"></div>`);

  // drag and drop handlers
  window.ondragend = (ev) => {
    $('div.underlay').removeClass('drag-hover');
    return false;
  }
  window.ondragleave = (ev) => {
    $('div.underlay').removeClass('drag-hover');
    return false;
  }
  window.ondragover = (ev) => {
    $('div.underlay').addClass('drag-hover');
    return false;
  }
  window.ondrop = (ev) => {
    ev.preventDefault();
    $('div.underlay').removeClass('drag-hover');
    if (!ev.dataTransfer ||
        !ev.dataTransfer.files ||
        !ev.dataTransfer.files.length) {
      return false;
    }
    let txi_file = null;
    $(ev.dataTransfer.files).each(function() {
      //console.log(this);
      let absfile = this.path;
      if (absfile.match(/\.tga$/i)) {
        enqueue(absfile);
      } else if (absfile.match(/\.txi$/i)) {
        // only loading the last TXI file, so record it now, read it later
        txi_file = absfile;
      }
    });
    queue_state();
    if (txi_file && $('.settings-menu .txi_use_file.no.enabled').length) {
      // read txi file, put it into txi text area
      $('.txi_data').val(
        require('fs').readFileSync(txi_file)
      );
    }
    return false;
  }
})();

