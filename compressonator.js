//===============================================================================
// Copyright (c) 2007-2016  Advanced Micro Devices, Inc. All rights reserved.
// Copyright (c) 2004-2006 ATI Technologies Inc.
//===============================================================================
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files(the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and / or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions :
// 
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
// 
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
// THE SOFTWARE.
//
//
//  File Name:   compressonator.js
//  Description: Performs the DXT-style block compression
//  
//  From compressonator/CompressonatorLib.
//  Javascript version ported from C++ by ndix UR.
//  Only BC1/3 portions required for this project were ported.
//  Original filenames: Codec_DXT5.cpp, Codec_DXT1.cpp,
//                      Codec_DXTC_Alpha.cpp, Codec_DXTC_Alpha.cpp,
//                      CompressonatorXCodec.cpp
//
//////////////////////////////////////////////////////////////////////////////

/// An enum selecting the speed vs. quality trade-off.
const CMP_Speed_Normal    = 1; ///< Highest quality mode
const CMP_Speed_Fast      = 2; ///< Slightly lower quality but much faster compression mode - DXTn & ATInN only
const CMP_Speed_SuperFast = 3; ///< Slightly lower quality but much, much faster compression mode - DXTn & ATInN only

const MAX_BLOCK = 64;
const MAX_POINTS = 16;

const MAX_ERROR = 128000.0;

const NUM_CHANNELS = 4;
const NUM_ENDPOINTS = 2;

const BLOCK_SIZE = MAX_BLOCK;

const EPS = (2.0 / 255.0) * (2.0 / 255.0);
const EPS2 = 3.0 * (2.0 / 255.0) * (2.0 / 255.0);

const BLOCK_SIZE_4X4 = 16;
const BLOCK_SIZE_4X4_RGBA = 64;

const FLT_MAX = Number.POSITIVE_INFINITY;

const GBL_SCH_STEP_MXS = 0.018;
const GBL_SCH_EXT_MXS  = 0.1;
const LCL_SCH_STEP_MXS = 0.6;
const GBL_SCH_STEP_MXQ = 0.0175;
const GBL_SCH_EXT_MXQ  = 0.154;
const LCL_SCH_STEP_MXQ = 0.45;

const GBL_SCH_STEP = GBL_SCH_STEP_MXS
const GBL_SCH_EXT  = GBL_SCH_EXT_MXS
const LCL_SCH_STEP = LCL_SCH_STEP_MXS

// number of search steps to make at each end of interval
const SCH_STPS = 3;

const sMvF = [ 0.0,
              -1.0,  1.0, -2.0,  2.0, -3.0,  3.0, -4.0,  4.0,
              -5.0,  5.0, -6.0,  6.0, -7.0,  7.0, -8.0,  8.0 ];

// Channel indexes
const RC = 0;
const GC = 1;
const BC = 2;
const AC = 3;

/*
Channel Bits
*/
const RG = 5;
const GG = 6;
const BG = 5;

// DXT encodings supported, BC1 aka DXT1 and BC3 aka DXT5
const ENCODING_DXT1 = 2;
const ENCODING_DXT5 = 4;

// Grid precision
const PIX_GRID = 8;

const dwRndAmount = [0, 0, 0, 0, 1, 1, 2, 2, 3];
const nByteBitsMask = 
[
    0x00,
    0x80,
    0xc0,
    0xe0,
    0xf0,
    0xf8,
    0xfc,
    0xfe,
    0xff,
];
const m_fBaseChannelWeights = [ 0.3086, 0.6094, 0.0820 ];

const options = {
    encoding: ENCODING_DXT1,
    m_bUseChannelWeighting: true,
    m_bUseAdaptiveWeighting: true,
    m_fChannelWeights: [],
    m_bUseFloat: false,
    m_b3DRefinement: false,
    m_nRefinementSteps: 1,
    m_nCompressionSpeed: CMP_Speed_Normal,
    //m_nCompressionSpeed: CMP_Speed_Fast,
    m_bSwizzleChannels: false
};

options.m_fChannelWeights[0] = m_fBaseChannelWeights[0];
options.m_fChannelWeights[1] = m_fBaseChannelWeights[1];
options.m_fChannelWeights[2] = m_fBaseChannelWeights[2];

if (!module) var module = {};
module.exports = {
    compress,
    ENCODING_DXT1,
    ENCODING_DXT5,
    CMP_Speed_Normal,
    CMP_Speed_Fast,
    CMP_Speed_SuperFast
};

function GetParameter(name) {
    const parameter_map = {
        UseChannelWeighting:  'm_bUseChannelWeighting',
        UseAdaptiveWeighting: 'm_bUseAdaptiveWeighting',
        '3DRefinement':       'm_b3DRefinement',
        RefinementSteps:      'm_nRefinementSteps',
        CompressionSpeed:     'm_nCompressionSpeed',
    };
    if (parameter_map[name] == null) {
        return null;
    }
    return options[parameter_map[name]];
}
function SetParameter(opts) {
    opts = opts || {};
    if (opts.UseChannelWeighting != null) {
        options.m_bUseChannelWeighting = opts.UseChannelWeighting ? true : false;
    }
    if (opts.UseAdaptiveWeighting != null) {
        options.m_bUseAdaptiveWeighting = opts.UseAdaptiveWeighting ? true : false;
    }
    if (opts['3DRefinement'] != null) {
        options.m_b3DRefinement = opts['3DRefinement'] ? true : false;
    }
    if (opts.RefinementSteps != null) {
        options.m_nRefinementSteps = parseInt(opts.RefinementSteps);
    }
    if (opts.CompressionSpeed != null) {
        if (opts.CompressionSpeed == CMP_Speed_Normal ||
            opts.CompressionSpeed == CMP_Speed_Fast ||
            opts.CompressionSpeed == CMP_Speed_SuperFast) {
            options.m_nCompressionSpeed = parseInt(opts.CompressionSpeed);
        } else {
            options.m_nCompressionSpeed = CMP_Speed_Normal;
        }
    }
    if (opts.encoding != null &&
        (opts.encoding == ENCODING_DXT1 ||
         opts.encoding == ENCODING_DXT5)) {
        options.encoding = parseInt(opts.encoding);
    }
    //console.log(options);
    return options;
}

function compress(buffer, width, height, opts) {
    opts = opts || {};
    const dwBlocksX = Math.ceil(width / 4);
    const dwBlocksY = Math.ceil(height / 4);

    // configure compressor
    SetParameter(opts);

    const block_size = opts.encoding == ENCODING_DXT5 ? 16 : 8
    const output = new Uint8ClampedArray(dwBlocksY * dwBlocksX * block_size);
    for (let j = 0; j < dwBlocksY; j++) {
        for (let i = 0; i < dwBlocksX; i++) {
            const block_idx = i + (j * dwBlocksX);
            const compressed_block_offset = block_idx * block_size;
            const alpha_block_offset = compressed_block_offset;
            const rgb_block_offset = compressed_block_offset + (
                opts.encoding == ENCODING_DXT5 ? block_size / 2 : 0
            );
            const block_buffer = ReadBlockRGBA(i * 4, j * 4, 4, 4, buffer, width, height);
            if (opts.encoding == ENCODING_DXT5) {
                // construct block of alpha bytes manually
                // yes, I know this is a little insane.
                const alpha_buffer = new Uint8ClampedArray([
                    block_buffer[3],  block_buffer[7],  block_buffer[11], block_buffer[15],
                    block_buffer[19], block_buffer[23], block_buffer[27], block_buffer[31],
                    block_buffer[35], block_buffer[39], block_buffer[43], block_buffer[47],
                    block_buffer[51], block_buffer[55], block_buffer[59], block_buffer[63]
                ]);
                ablock = CompressAlphaBlock(alpha_buffer);
                output.set(ablock, alpha_block_offset);
            }
            const cblock = CompressRGBBlock(
                new Uint32Array(block_buffer.buffer),
                //output.subarray(rgb_block_offset, rgb_block_offset + 8),
                CalculateColourWeightings(block_buffer),
                opts.encoding == ENCODING_DXT1, // DXT1?
                false, 0.0 // DXT1 Alpha settings, unused
            );
            output.set(cblock, rgb_block_offset);
        }
    }
    return output;
}

function ReadBlockRGBA(x, y, w, h, buffer, src_width, src_height) {
    const block = new Uint8ClampedArray(w * h * 4);
    //const src_offset = ((y * src_width) + x) * 4
    for (let j = 0; j < h; j++) {
        // can't really set by row, because of boundary conditions :(
        //block.set(buffer.subarray(src_offset + (i * src_width), src_offset + (i * src_width) + 4);
        const src_y = Math.min(y + j, src_height - 1);
        const src_y_width = src_y * src_width;
        for (let i = 0; i < w; i++) {
            const src_x = Math.min(x + i, src_width - 1);
            //block[i + (i * j)] = buffer[((src_y * src_width) + src_x) * 4];
            // set one RGBA pixel into block buffer
            block.set(buffer.subarray(
                ((src_y_width) + src_x) * 4,
                (((src_y_width) + src_x) * 4) + 4
            ), (i + (w * j)) * 4);
        }
    }
    return block;
}

function CompressAlphaBlock(alphaBlock)
{
    //const compressedBlock = new Uint32Array(2);
    const compressedBlock = new Uint8ClampedArray(8);
    const nEndpoints = [[], []]; //[2][2];
    const nIndices = [[], []]; //[2][BLOCK_SIZE_4X4];
    const m_bUseSSE2 = false;
    const fError8 = CompBlock1X(
        alphaBlock, BLOCK_SIZE_4X4,
        nEndpoints[0], nIndices[0], 8, false,
        m_bUseSSE2, 8, 0, true
    );
    const fError6 = (
        (fError8 == 0.0) ? FLT_MAX : CompBlock1X(
            alphaBlock, BLOCK_SIZE_4X4,
            nEndpoints[1], nIndices[1], 6, true,
            m_bUseSSE2, 8, 0, true
        )
    );
    if(fError8 <= fError6)
        EncodeAlphaBlock(compressedBlock, nEndpoints[0], nIndices[0]);
    else
        EncodeAlphaBlock(compressedBlock, nEndpoints[1], nIndices[1]);

    return compressedBlock;
}

function EncodeAlphaBlock(compressedBlock, nEndpoints, nIndices)
{
    compressedBlock[0] = nEndpoints[0];
    compressedBlock[1] = nEndpoints[1];
    compressedBlock[2] =  (nIndices[0]  & 0x7);
    compressedBlock[2] |= (nIndices[1]  & 0x7) << 3;
    compressedBlock[2] |= (nIndices[2]  & 0x3) << 6;
    compressedBlock[3] =  (nIndices[2]  & 0x4) >> 2;
    compressedBlock[3] |= (nIndices[3]  & 0x7) << 1;
    compressedBlock[3] |= (nIndices[4]  & 0x7) << 4;
    compressedBlock[3] |= (nIndices[5]  & 0x1) << 7;
    compressedBlock[4] =  (nIndices[5]  & 0x6) >> 1;
    compressedBlock[4] |= (nIndices[6]  & 0x7) << 2;
    compressedBlock[4] |= (nIndices[7]  & 0x7) << 5;
    compressedBlock[5] =  (nIndices[8]  & 0x7);
    compressedBlock[5] |= (nIndices[9]  & 0x7) << 3;
    compressedBlock[5] |= (nIndices[10] & 0x3) << 6;
    compressedBlock[6] =  (nIndices[10] & 0x4) >> 2;
    compressedBlock[6] |= (nIndices[11] & 0x7) << 1;
    compressedBlock[6] |= (nIndices[12] & 0x7) << 4;
    compressedBlock[6] |= (nIndices[13] & 0x1) << 7;
    compressedBlock[7] =  (nIndices[13] & 0x6) >> 1;
    compressedBlock[7] |= (nIndices[14] & 0x7) << 2;
    compressedBlock[7] |= (nIndices[15] & 0x7) << 5;
    /*
    compressedBlock[0] = (nEndpoints[0]) | ((nEndpoints[1])<<8);
    compressedBlock[1] = 0;

    for(let i = 0; i < BLOCK_SIZE_4X4; i++)
    {
        if(i < 5)
            compressedBlock[0] |= (nIndices[i] & 0x7) << (16 + (i * 3));
        else if(i > 5)
            compressedBlock[1] |= (nIndices[i] & 0x7) << (2 + (i-6) * 3);
        else
        {
            compressedBlock[0] |= (nIndices[i] & 0x1) << 31;
            compressedBlock[1] |= (nIndices[i] & 0x6) >> 1;
        }
    }
    */
}

function CompressRGBBlock(rgbBlock,
                          //compressedBlock,
                          pfChannelWeights,
                          bDXT1, bDXT1UseAlpha, nDXT1AlphaThreshold) {
    /*
    ARGB Channel indexes
    */

    // rgbBlock = 16 Uint32 RGBA entries

    const nEndpoints = [[],[]];
    const nIndices   = [[],[]];

    const compressedBlock = new Uint8ClampedArray(8);
    const cb_view = new DataView(compressedBlock.buffer);
    const m_bUseSSE2 = false;

    let nMethod = 1;
    const m_bUseFast = options.m_nCompressionSpeed != CMP_Speed_Normal;
    if (bDXT1 && !m_bUseFast) {
        const fError3 = CompRGBBlock(
            rgbBlock, BLOCK_SIZE_4X4,
            RG, GG, BG,
            nEndpoints[0], nIndices[0], 3,
            m_bUseSSE2, options.m_b3DRefinement, options.m_nRefinementSteps,
            pfChannelWeights, bDXT1UseAlpha, nDXT1AlphaThreshold
        );
        const fError4 = (
            (fError3 == 0.0) ? FLT_MAX : CompRGBBlock(
                rgbBlock, BLOCK_SIZE_4X4,
                RG, GG, BG,
                nEndpoints[1], nIndices[1], 4,
                m_bUseSSE2, options.m_b3DRefinement, options.m_nRefinementSteps,
                pfChannelWeights, bDXT1UseAlpha, nDXT1AlphaThreshold
            )
        );
        nMethod = (fError3 <= fError4) ? 0 : 1;
    } else {
        CompRGBBlock(
            rgbBlock, BLOCK_SIZE_4X4,
            RG, GG, BG,
            nEndpoints[1], nIndices[1], 4,
            m_bUseSSE2, options.m_b3DRefinement, options.m_nRefinementSteps,
            pfChannelWeights, bDXT1UseAlpha, nDXT1AlphaThreshold
        );
    }

    const c0 = ConstructColour(
        (nEndpoints[nMethod][RC][0] >> (8-RG)),
        (nEndpoints[nMethod][GC][0] >> (8-GG)),
        (nEndpoints[nMethod][BC][0] >> (8-BG))
    );
    const c1 = ConstructColour(
        (nEndpoints[nMethod][RC][1] >> (8-RG)),
        (nEndpoints[nMethod][GC][1] >> (8-GG)),
        (nEndpoints[nMethod][BC][1] >> (8-BG))
    );
    if((nMethod == 1 && c0 <= c1) ||
       (nMethod == 0 && c0 > c1)) {
        cb_view.setUint16(0, c1, true);
        cb_view.setUint16(2, c0, true);
        //compressedBlock[0] = c1 | (c0<<16);
    } else {
        cb_view.setUint16(0, c0, true);
        cb_view.setUint16(2, c1, true);
        //compressedBlock[0] = c0 | (c1<<16);
    }

    compressedBlock[4] =  nIndices[nMethod][0]        |
                         (nIndices[nMethod][1]  << 2) |
                         (nIndices[nMethod][2]  << 4) |
                         (nIndices[nMethod][3]  << 6);
    compressedBlock[5] =  nIndices[nMethod][4]        |
                         (nIndices[nMethod][5]  << 2) |
                         (nIndices[nMethod][6]  << 4) |
                         (nIndices[nMethod][7]  << 6);
    compressedBlock[6] =  nIndices[nMethod][8]        |
                         (nIndices[nMethod][9]  << 2) |
                         (nIndices[nMethod][10] << 4) |
                         (nIndices[nMethod][11] << 6);
    compressedBlock[7] =  nIndices[nMethod][12]       |
                         (nIndices[nMethod][13] << 2) |
                         (nIndices[nMethod][14] << 4) |
                         (nIndices[nMethod][15] << 6);
    /* uint32 method:
    compressedBlock[1] = 0;
    for (let i = 0; i < 16; i++) {
        compressedBlock[1] |= (nIndices[nMethod][i] << (2*i));
    }
    */

    return compressedBlock;
}

function CompRGBBlock(block_32, dwBlockSize,
                      nRedBits, nGreenBits, nBlueBits, 
                      nEndpoints, //[3][NUM_ENDPOINTS],
                      pcIndices, dwNumPoints, 
                      _bUseSSE2, b3DRefinement, nRefinementSteps, _pfChannelWeights, 
                      _bUseAlpha, _nAlphaThreshold) {
    // get colors
    const dwBlk = [];
    const Rpt = [];
    // values in block_32 are ABGR due to endian change
    for (let i = 0; i < block_32.length; i++) {
        dwBlk[i] = block_32[i] | 0xff000000;
    }
    const dwBlkU = {};
    for (let c of dwBlk) {
        dwBlkU[c] = dwBlkU[c] ? dwBlkU[c] + 1 : 1;
    }
    const uniqCol = Object.keys(dwBlkU);
    const dwUniqueColors = uniqCol.length;
    const BlkIn = [];
    for (let i in uniqCol) {
        BlkIn[i] = BlkIn[i] || [];
        BlkIn[i][BC] = (uniqCol[i] >> 16) & 0xff;
        BlkIn[i][GC] = (uniqCol[i] >> 8) & 0xff;
        BlkIn[i][RC] = (uniqCol[i]) & 0xff;
        BlkIn[i][AC] = 255;
        Rpt[i] = dwBlkU[uniqCol[i]];
    }

   CompressRGBBlockX(nEndpoints, BlkIn, Rpt, dwUniqueColors, dwNumPoints,
                     b3DRefinement, nRefinementSteps, 
                     _pfChannelWeights, nRedBits, nGreenBits, nBlueBits);

   return Clstr(block_32, dwBlockSize, nEndpoints, pcIndices, dwNumPoints,
                _pfChannelWeights,
                _bUseAlpha, _nAlphaThreshold,
                nRedBits, nGreenBits, nBlueBits);
}

function CompressRGBBlockX(_RsltRmpPnts, //[NUM_CHANNELS][NUM_ENDPOINTS],
                           _BlkIn, //[MAX_BLOCK][NUM_CHANNELS],
                           _Rpt, //[MAX_BLOCK],
                           _UniqClrs,
                           dwNumPoints, b3DRefinement, nRefinementSteps,
                           _pfWeights, 
                           nRedBits, nGreenBits, nBlueBits) {
    const LineDirG = [[], [], [], []];
    const PosG = [];
    const BlkSh = [];
    const LineDir0 = [[], [], [], []];
    const Mdl = [[], [], [], []];
    const rsltC = [[], [], [], []];
    // strangely, this seems to be most performant way to copy/map this array;
    // I had assumed Array.from and/or map would be better, they are not.
    const Blk = [];
    for (let i in _BlkIn) {
        Blk[i] = Blk[i] || [];
        Blk[i][RC] = _BlkIn[i][RC] / 255.0;
        Blk[i][GC] = _BlkIn[i][GC] / 255.0;
        Blk[i][BC] = _BlkIn[i][BC] / 255.0;
        Blk[i][AC] = _BlkIn[i][AC] / 255.0;
    }

    let isDONE = false;

    if (_BlkIn.length <= 2) {
        for (let j = 0; j < 3; j++) {
            rsltC[j][0] = _BlkIn[0][j];
            rsltC[j][1] = _BlkIn[_BlkIn.length - 1][j];
        }
        isDONE = true;
    }

    let bSmall = true;
    if (!isDONE) {
//    This is our first attempt to find an axis we will go along.
//    The cumulation is done to find a line minimizing the MSE from the input 3D points.
        bSmall = FindAxis(BlkSh, LineDir0, Mdl, Blk, _Rpt, 3, _UniqClrs);

//    While trying to find the axis we found that the diameter of the input set is quite small.
//    Do not bother.
        if(bSmall) {
            for (let j = 0; j < 3; j++) {
                rsltC[j][0] = _BlkIn[0][j];
                rsltC[j][1] = _BlkIn[_BlkIn.length - 1][j];
            }
            isDONE = true;
        }
    }

    if (!isDONE) {
        let ErrG = FLT_MAX;
        const Prj0 = [];
        const Prj = [];
        const PrjErr = [];
        const LineDir = [];
        const RmpIndxs = [];
        const PrjBnd = [];
        const PreMRep = [];
        // LineDir = LineDir0?
        //for(j =0; j < 3; j++) {
        //    LineDir[j] = LineDir0[j];
        //}
        LineDir[0] = LineDir0[0];
        LineDir[1] = LineDir0[1];
        LineDir[2] = LineDir0[2];
        // js-efficient copy, except not:
        //const LineDir = Array.from(LineDir0);

//    Here is the main loop.
//    1. Project input set on the axis in consideration.
//    2. Run 1 dimensional search (see scalar case) to find an (sub) optimal pair of end points.
//    3. Compute the vector of indexes (or clusters) for the current approximate ramp.
//    4. Present our color channels as 3 16DIM vectors.
//    5. Find closest approximation of each of 16DIM color vector with the projection of the 16DIM index vector.
//    6. Plug the projections as a new directional vector for the axis.
//    7. Goto 1.

//    D - is 16 dim "index" vector (or 16 DIM vector of indexes - {0, 1/3, 2/3, 0, ...,}, but shifted and normalized).
//    Ci - is a 16 dim vector of color i.
//    for each Ci find a scalar Ai such that
//    (Ai * D - Ci) (Ai * D - Ci) -> min , i.e distance between vector AiD and C is min.
//    You can think of D as a unit interval(vector) "clusterizer",
//    and Ai is a scale you need to apply to the clusterizer to 
//    approximate the Ci vector instead of the unit vector.

//    Solution is 

    //    Ai = (D . Ci) / (D . D); . - is a dot product.

//    in 3 dim space Ai(s) represent a line direction, along which
//    we again try to find (sub)optimal quantizer.

//    That's what our while(true) loop is about.
        while (true) {
            //  1. Project input set on the axis in consideration.
            // From Foley & Van Dam: Closest point of approach of a line (P + v) to a point (R) is
            //                            P + ((R-P).v) / (v.v))v
            // The distance along v is therefore (R-P).v / (v.v)
            // (v.v) is 1 if v is a unit vector.
            //
            PrjBnd[0] = 1000.0;
            PrjBnd[1] = -1000.0;
            for(let i = 0; i < MAX_BLOCK; i++) {
                Prj0[i] = Prj[i] = PrjErr[i] = PreMRep[i] = 0.0;
            }

            for(let i = 0; i < _UniqClrs; i++)
            {
                Prj0[i] = Prj[i] = BlkSh[i][0] * LineDir[0] + BlkSh[i][1] * LineDir[1] + BlkSh[i][2] * LineDir[2];

                PrjErr[i] = (BlkSh[i][0] - LineDir[0] * Prj[i]) * (BlkSh[i][0] - LineDir[0] * Prj[i])
                    + (BlkSh[i][1] - LineDir[1] * Prj[i]) * (BlkSh[i][1] - LineDir[1] * Prj[i])
                    + (BlkSh[i][2] - LineDir[2] * Prj[i]) * (BlkSh[i][2] - LineDir[2] * Prj[i]);

                PrjBnd[0] = Math.min(PrjBnd[0], Prj[i]);
                PrjBnd[1] = Math.max(PrjBnd[1], Prj[i]);
            }

            //  2. Run 1 dimensional search (see scalar case) to find an (sub) optimal pair of end points.

            // min and max of the search interval
            const Scl = []; //[NUM_ENDPOINTS];
            Scl[0] = PrjBnd[0] - (PrjBnd[1] - PrjBnd[0]) * 0.125;
            Scl[1] = PrjBnd[1] + (PrjBnd[1] - PrjBnd[0]) * 0.125;

            // compute scaling factor to scale down the search interval to [0.,1] 
            const Scl2 = (Scl[1] - Scl[0]) * (Scl[1] - Scl[0]);
            const overScl = 1.0/(Scl[1] - Scl[0]);

            for(let i = 0; i < _UniqClrs; i++)
            {
                // scale them
                Prj[i] = (Prj[i] - Scl[0]) * overScl;
                // premultiply the scale squire to plug into error computation later
                PreMRep[i] = _Rpt[i] * Scl2;
            }

            // scale first approximation of end points
            for(let k = 0; k < 2; k++)
                PrjBnd[k] = (PrjBnd[k] - Scl[0]) * overScl;

            Err = MAX_ERROR;

            // search step
            const stp = 0.025;

            // low Start/End; high Start/End
            const lS = (PrjBnd[0] - 2.0 * stp > 0.0) ?  PrjBnd[0] - 2.0 * stp : 0.0;
            const hE = (PrjBnd[1] + 2.0 * stp < 1.0) ?  PrjBnd[1] + 2.0 * stp : 1.0;

            // find the best endpoints 
            const Pos = []; //[NUM_ENDPOINTS];
            //let lP, hP;
            //let l, h;
            for(let l = 0, lP = lS; l < 8; l++, lP += stp)
            {
                for(let h = 0, hP = hE; h < 8; h++, hP -= stp)
                {
                    let err = Err;
                    // compute an error for the current pair of end points.
                    err = RampSrchW(Prj, PrjErr, PreMRep, err, lP, hP, _UniqClrs, dwNumPoints);

                    if(err < Err)
                    {
                        // save better result
                        Err = err;
                        Pos[0] = lP;
                        Pos[1] = hP;
                    }
                }
            }

            // inverse the scaling
            for(let k = 0; k < 2; k++)
                Pos[k] = Pos[k] * (Scl[1] - Scl[0]) + Scl[0];

            // did we find somthing better from the previous run?
            if(Err + 0.001 < ErrG)
            {
                // yes, remember it
                ErrG = Err;
                LineDirG[0] =  LineDir[0];
                LineDirG[1] =  LineDir[1];
                LineDirG[2] =  LineDir[2];
                PosG[0] = Pos[0];
                PosG[1] = Pos[1];
                //  3. Compute the vector of indexes (or clusters) for the current approximate ramp.
                // indexes
                const step = (Pos[1] - Pos[0]) / (dwNumPoints - 1);
                const step_h = step * 0.5;
                const rstep = 1.0 / step;
                const overBlkTp = 1.0/  (dwNumPoints - 1) ;  

                // here the index vector is computed, 
                // shifted and normalized
                const indxAvrg = (dwNumPoints - 1) / 2.0; 

                for(let i = 0; i < _UniqClrs; i++)
                {
                    const del = Prj0[i] - Pos[0];
                    //int n = (int)((b - _min_ex + (step*0.5)) * rstep);
                    if(del <= 0)
                        RmpIndxs[i] = 0.0;
                    else if(Prj0[i] -  Pos[1] >= 0)
                        RmpIndxs[i] = (dwNumPoints - 1);
                    else
                        RmpIndxs[i] = Math.floor((del + step_h) * rstep);
                    // shift and normalization
                    RmpIndxs[i] = (RmpIndxs[i] - indxAvrg) * overBlkTp;
                }

                //  4. Present our color channels as 3 16DIM vectors.
                //  5. Find closest aproximation of each of 16DIM color vector with the pojection of the 16DIM index vector.
                let Crs = [], Len, Len2;
                let i;
                for (i = 0, Crs[0] = Crs[1] = Crs[2] = Len = 0.0; i < _UniqClrs; i++)
                {
                    const PreMlt = RmpIndxs[i] * _Rpt[i];
                    Len += RmpIndxs[i] * PreMlt;
                    for(j = 0; j < 3; j++)
                        Crs[j] += BlkSh[i][j] * PreMlt;
                }

                LineDir[0] = LineDir[1] = LineDir[2] = 0.0;
                if(Len > 0.0)
                {
                    LineDir[0] = Crs[0]/ Len;
                    LineDir[1] = Crs[1]/ Len;
                    LineDir[2] = Crs[2]/ Len;

                    //  6. Plug the projections as a new directional vector for the axis.
                    //  7. Goto 1.
                    Len2 = (LineDir[0] * LineDir[0]) +
                           (LineDir[1] * LineDir[1]) +
                           (LineDir[2] * LineDir[2]);
                    Len2 = Math.sqrt(Len2);

                    LineDir[0] /= Len2;
                    LineDir[1] /= Len2;
                    LineDir[2] /= Len2;
                }
            } 
            else { // We was not able to find anything better.  Drop dead.
                break;
            }
        } 

        // inverse transform to find end-points of 3-color ramp
        for(let k = 0; k < 2; k++) {
            for(let j = 0; j < 3; j++) {
                rsltC[j][k] = (PosG[k] * LineDirG[j]  + Mdl[j]) * 255.0;
            }
        }
    }

// We've dealt with (almost) unrestricted full precision realm.
// Now back to the dirty digital world.

// round the end points to make them look like compressed ones
    const inpRmpEndPts = [[], [], [], []]; //[NUM_CHANNELS][NUM_ENDPOINTS];
    MkRmpOnGrid(inpRmpEndPts, rsltC, 0.0, 255.0, nRedBits, nGreenBits, nBlueBits);


//    This not a small procedure squeezes and stretches the ramp along each axis (R,G,B) separately while other 2 are fixed.
//    It does it only over coarse grid - 565 that is. It tries to squeeze more precision for the real world ramp.
    if(b3DRefinement) {
        Refine3D(
            _RsltRmpPnts, inpRmpEndPts, _BlkIn,
            _Rpt, _UniqClrs, dwNumPoints, _pfWeights,
            nRedBits, nGreenBits, nBlueBits, nRefinementSteps
        );
    } else {
        Refine(
            _RsltRmpPnts, inpRmpEndPts, _BlkIn,
            _Rpt, _UniqClrs, dwNumPoints, _pfWeights,
            nRedBits, nGreenBits, nBlueBits, nRefinementSteps
        );
    }
}

/*------------------------------------------------------------------------------------------------
// this is how the end points is going to be rounded in compressed format
------------------------------------------------------------------------------------------------*/
function MkRmpOnGrid(_RmpF, //[NUM_CHANNELS][NUM_ENDPOINTS],
                     _MnMx, //[NUM_CHANNELS][NUM_ENDPOINTS], 
                     _Min, _Max, nRedBits, nGreenBits, nBlueBits)
{
    const Fctrs0 = []; 
    const Fctrs1 = []; 

    Fctrs1[RC] = (1 << nRedBits);  
    Fctrs1[GC] = (1 << nGreenBits);  
    Fctrs1[BC] = (1 << nBlueBits);
    Fctrs0[RC] = (1 << (PIX_GRID-nRedBits));  
    Fctrs0[GC] = (1 << (PIX_GRID-nGreenBits));  
    Fctrs0[BC] = (1 << (PIX_GRID-nBlueBits));

    for(let j = 0; j < 3; j++)
    {
        for(let k = 0; k < 2; k++)
        {
            _RmpF[j][k] = Math.floor(_MnMx[j][k]);
            if(_RmpF[j][k] <= _Min)
                _RmpF[j][k] = _Min;
            else
            {
                _RmpF[j][k] += Math.floor(128.0 / Fctrs1[j]) - Math.floor(_RmpF[j][k] / Fctrs1[j]); 
                _RmpF[j][k] = Math.min(_RmpF[j][k], _Max);
            }

            _RmpF[j][k] = Math.floor(_RmpF[j][k] / Fctrs0[j]) * Fctrs0[j];
        }
    }
}

function Refine(_OutRmpPnts, //[NUM_CHANNELS][NUM_ENDPOINTS],
                _InpRmpPnts, //[NUM_CHANNELS][NUM_ENDPOINTS],
                _Blk, //[MAX_BLOCK][NUM_CHANNELS],
                _Rpt, //[MAX_BLOCK], 
                _NmrClrs, dwNumPoints, _pfWeights, 
                nRedBits, nGreenBits, nBlueBits, nRefineSteps)
{
    const Rmp = [[], [], [], []]; //[NUM_CHANNELS][MAX_POINTS];

    /* this copy operation seems unnecessary
    const Blk = [];//[MAX_BLOCK][NUM_CHANNELS];
    for(let i = 0; i < _NmrClrs; i++) {
        for(let j = 0; j < 3; j++) {
           Blk[i] = Blk[i] || [];
           Blk[i][j] = _Blk[i][j];
        }
    }
    */
    const Blk = _Blk;

    const fWeightRed = _pfWeights ? _pfWeights[0] : 1.0;
    const fWeightGreen = _pfWeights ? _pfWeights[1] : 1.0;
    const fWeightBlue = _pfWeights ? _pfWeights[2] : 1.0;

    // here is our grid
    const Fctrs = []; 
    Fctrs[RC] = (1 << (PIX_GRID-nRedBits));  
    Fctrs[GC] = (1 << (PIX_GRID-nGreenBits));  
    Fctrs[BC] = (1 << (PIX_GRID-nBlueBits));

    const InpRmp0 = [[], [], [], []]; //[NUM_CHANNELS][NUM_ENDPOINTS];
    const InpRmp = [[], [], [], []]; //[NUM_CHANNELS][NUM_ENDPOINTS];
    for(let k = 0; k < 2; k++) {
        for(let j = 0; j < 3; j++) {
            _OutRmpPnts[j] = _OutRmpPnts[j] || [];
            InpRmp0[j][k] = InpRmp[j][k] = _OutRmpPnts[j][k] = _InpRmpPnts[j][k];
        }
    }

    // make ramp endpoints the way they'll going to be decompressed
    // plus check whether the ramp is flat
    let Eq;
    const WkRmpPts = [[], [], [], []]; //[NUM_CHANNELS][NUM_ENDPOINTS];
    Eq = MkWkRmpPts(WkRmpPts, InpRmp, nRedBits, nGreenBits, nBlueBits);

    // build ramp for all 3 colors
    BldRmp(Rmp, WkRmpPts, dwNumPoints); 

    // clusterize for the current ramp
    let bestE = ClstrErr(Blk, _Rpt, Rmp, _NmrClrs, dwNumPoints, Eq, _pfWeights);
    if(bestE == 0.0 || !nRefineSteps)    // if exact, we've done
        return bestE;

    // Tweak each component in isolation and get the best values
    let DistR, DistG, DistB;

    // precompute ramp errors for Green and Blue
    const RmpErr = [];//[MAX_POINTS][MAX_BLOCK];
    for(let i = 0; i < _NmrClrs; i++)
    {
        for(let r = 0; r < dwNumPoints; r++)
        {
            RmpErr[r] = RmpErr[r] || [];
            //const DistG = (Rmp[GC][r] - Blk[i][GC]);
            //const DistB = (Rmp[BC][r] - Blk[i][BC]);
            DistG = (Rmp[GC][r] - Blk[i][GC]);
            DistB = (Rmp[BC][r] - Blk[i][BC]);
            RmpErr[r][i] = DistG * DistG * fWeightGreen + DistB * DistB * fWeightBlue;
        }
    }

    // First Red
    let bstC0 = InpRmp0[RC][0];
    let bstC1 = InpRmp0[RC][1];
    const nRefineStart = 0 - (Math.min(nRefineSteps, 8));
    const nRefineEnd = Math.min(nRefineSteps, 8);
    for(let i = nRefineStart; i <= nRefineEnd; i++)
    {
        for(let j = nRefineStart; j <= nRefineEnd; j++)
        {
            // make a move; both sides of interval.        
            InpRmp[RC][0] = Math.min(Math.max(InpRmp0[RC][0] + i * Fctrs[RC], 0.0), 255.0);
            InpRmp[RC][1] = Math.min(Math.max(InpRmp0[RC][1] + j * Fctrs[RC], 0.0), 255.0);

            // make ramp endpoints the way they'll going to be decompressed
            // plus check whether the ramp is flat
            Eq = MkWkRmpPts(WkRmpPts, InpRmp, nRedBits, nGreenBits, nBlueBits);

            // build ramp only for red
            BldClrRmp(Rmp[RC], WkRmpPts[RC], dwNumPoints);

            // compute cumulative error
            let mse = 0.0;
            const rmp_l = (Eq) ? 1 : dwNumPoints;
            let Dist, Err;
            for(let k = 0; k < _NmrClrs; k++)
            {
                let MinErr = 10000000.0;
                for(let r = 0; r < rmp_l; r++)
                {
                    //const Dist = (Rmp[RC][r] - Blk[k][RC]);
                    //const Err = RmpErr[r][k] + (Dist * Dist * fWeightRed);
                    Dist = (Rmp[RC][r] - Blk[k][RC]);
                    Err = RmpErr[r][k] + (Dist * Dist * fWeightRed);
                    MinErr = Math.min(MinErr, Err);
                }
                mse += MinErr * _Rpt[k];
            }

            // save if we achieve better result
            if(mse < bestE)
            {
                bstC0 = InpRmp[RC][0];
                bstC1 = InpRmp[RC][1];
                bestE = mse;
            }
        }
    }

    // our best REDs
    InpRmp[RC][0] = bstC0;
    InpRmp[RC][1] = bstC1;

    // make ramp endpoints the way they'll going to be decompressed
    // plus check whether the ramp is flat
    Eq = MkWkRmpPts(WkRmpPts, InpRmp, nRedBits, nGreenBits, nBlueBits);

    // build ramp only for green
    BldRmp(Rmp, WkRmpPts, dwNumPoints); 

    // precompute ramp errors for Red and Blue
    for(let i = 0; i < _NmrClrs; i++)
    {
        for(let r = 0; r < dwNumPoints; r++)
        {
            //const DistR = (Rmp[RC][r] - Blk[i][RC]);
            //const DistB = (Rmp[BC][r] - Blk[i][BC]);
            DistR = (Rmp[RC][r] - Blk[i][RC]);
            DistB = (Rmp[BC][r] - Blk[i][BC]);
            RmpErr[r][i] = DistR * DistR * fWeightRed + DistB * DistB * fWeightBlue;
        }
    }

    // Now green
    bstC0 = InpRmp0[GC][0];
    bstC1 = InpRmp0[GC][1];
    for(let i = nRefineStart; i <= nRefineEnd; i++)
    {
        for(let j = nRefineStart; j <= nRefineEnd; j++)
        {
            InpRmp[GC][0] = Math.min(Math.max(InpRmp0[GC][0] + i * Fctrs[GC], 0.0), 255.0);
            InpRmp[GC][1] = Math.min(Math.max(InpRmp0[GC][1] + j * Fctrs[GC], 0.0), 255.0);

            Eq = MkWkRmpPts(WkRmpPts, InpRmp, nRedBits, nGreenBits, nBlueBits);
            BldClrRmp(Rmp[GC], WkRmpPts[GC], dwNumPoints);

            let mse = 0.0;
            const rmp_l = (Eq) ? 1 : dwNumPoints;
            let Dist, Err;
            for(let k = 0; k < _NmrClrs; k++)
            {
                let MinErr = 10000000.0;
                for(let r = 0; r < rmp_l; r++)
                {
                    //const Dist = (Rmp[GC][r] - Blk[k][GC]);
                    //const Err = RmpErr[r][k] +  Dist * Dist * fWeightGreen;
                    Dist = (Rmp[GC][r] - Blk[k][GC]);
                    Err = RmpErr[r][k] +  Dist * Dist * fWeightGreen;
                    MinErr = Math.min(MinErr, Err);
                }
                mse += MinErr * _Rpt[k];
            }

            if(mse < bestE)
            {
                bstC0 = InpRmp[GC][0];
                bstC1 = InpRmp[GC][1];
                bestE = mse;
            }
        }
    }

    // our best GREENs
    InpRmp[GC][0] = bstC0;
    InpRmp[GC][1] = bstC1;

    Eq = MkWkRmpPts(WkRmpPts, InpRmp, nRedBits, nGreenBits, nBlueBits);
    BldRmp(Rmp, WkRmpPts, dwNumPoints); 

    // ramp err for Red and Green
    for(let i=0; i < _NmrClrs; i++)
    {
        for(let r = 0; r < dwNumPoints; r++)
        {
            //const DistR = (Rmp[RC][r] - Blk[i][RC]);
            //const DistG = (Rmp[GC][r] - Blk[i][GC]);
            DistR = (Rmp[RC][r] - Blk[i][RC]);
            DistG = (Rmp[GC][r] - Blk[i][GC]);
            RmpErr[r][i] = DistR * DistR * fWeightRed + DistG * DistG * fWeightGreen;
        }
    }

    bstC0 = InpRmp0[BC][0];
    bstC1 = InpRmp0[BC][1];
    // Now blue
    for(let i = nRefineStart; i <= nRefineEnd; i++)
    {
        for(let j = nRefineStart; j <= nRefineEnd; j++)
        {
            InpRmp[BC][0] = Math.min(Math.max(InpRmp0[BC][0] + i * Fctrs[BC], 0.0), 255.0);
            InpRmp[BC][1] = Math.min(Math.max(InpRmp0[BC][1] + j * Fctrs[BC], 0.0), 255.0);

            Eq = MkWkRmpPts(WkRmpPts, InpRmp, nRedBits, nGreenBits, nBlueBits);
            BldClrRmp(Rmp[BC], WkRmpPts[BC], dwNumPoints);

            let mse = 0.0;
            const rmp_l = (Eq) ? 1 : dwNumPoints;
            let Dist, Err;
            for(let k = 0; k < _NmrClrs; k++)
            {
                let MinErr = 10000000.0;
                for(let r = 0; r < rmp_l; r++)
                {
                    //const Dist = (Rmp[BC][r] - Blk[k][BC]);
                    //const Err = RmpErr[r][k] +  Dist * Dist * fWeightBlue;
                    Dist = (Rmp[BC][r] - Blk[k][BC]);
                    Err = RmpErr[r][k] +  Dist * Dist * fWeightBlue;
                    MinErr = Math.min(MinErr, Err);
                }
                mse += MinErr * _Rpt[k];
            }

            if(mse < bestE)
            {
                bstC0 = InpRmp[BC][0];
                bstC1 = InpRmp[BC][1];
                bestE = mse;
            }
        }
    }

    // our best BLUEs
    InpRmp[BC][0] = bstC0;
    InpRmp[BC][1] = bstC1;

    // return our best choice
    for(let j = 0; j < 3; j++) {
        for(let k = 0; k < 2; k++) {
            _OutRmpPnts[j] = _OutRmpPnts[j] || [];
            _OutRmpPnts[j][k] = InpRmp[j][k];
        }
    }

    return bestE;
}

function Refine3D(_OutRmpPnts, //[NUM_CHANNELS][NUM_ENDPOINTS],
                  _InpRmpPnts, //[NUM_CHANNELS][NUM_ENDPOINTS],
                  _Blk, //[MAX_BLOCK][NUM_CHANNELS],
                  _Rpt, //[MAX_BLOCK], 
                  _NmrClrs, dwNumPoints, _pfWeights, 
                  nRedBits, nGreenBits, nBlueBits, nRefineSteps)
{
    const Rmp = [[], [], [], []]; //[NUM_CHANNELS][MAX_POINTS];

    /* this copy operation seems unnecessary
    const Blk= []; //[MAX_BLOCK][NUM_CHANNELS];
    for(let i = 0; i < _NmrClrs; i++) {
        for(let j = 0; j < 3; j++) {
            Blk[i] = Blk[i] || [];
            Blk[i][j] = _Blk[i][j];
        }
    }
    */
    const Blk = _Blk;

    const fWeightRed = _pfWeights ? _pfWeights[0] : 1.0;
    const fWeightGreen = _pfWeights ? _pfWeights[1] : 1.0;
    const fWeightBlue = _pfWeights ? _pfWeights[2] : 1.0;

    // here is our grid
    let Fctrs = []; 
    Fctrs[RC] = (1 << (PIX_GRID-nRedBits));  
    Fctrs[GC] = (1 << (PIX_GRID-nGreenBits));  
    Fctrs[BC] = (1 << (PIX_GRID-nBlueBits));

    const InpRmp0 = [[], [], [], []]; //[NUM_CHANNELS][NUM_ENDPOINTS];
    const InpRmp = [[], [], [], []]; //[NUM_CHANNELS][NUM_ENDPOINTS];
    for(let k = 0; k < 2; k++) {
        for(let j = 0; j < 3; j++) {
            _OutRmpPnts[j] = _OutRmpPnts[j] || [];
            InpRmp0[j][k] = InpRmp[j][k] = _OutRmpPnts[j][k] = _InpRmpPnts[j][k];
        }
    }

    // make ramp endpoints the way they'll going to be decompressed
    // plus check whether the ramp is flat
    let Eq;
    const WkRmpPts = [[], [], [], []]; //[NUM_CHANNELS][NUM_ENDPOINTS];
    Eq = MkWkRmpPts(WkRmpPts, InpRmp, nRedBits, nGreenBits, nBlueBits);

    // build ramp for all 3 colors
    BldRmp(Rmp, WkRmpPts, dwNumPoints); 

    // clusterize for the current ramp
    let bestE = ClstrErr(Blk, _Rpt, Rmp, _NmrClrs, dwNumPoints, Eq, _pfWeights);
    if(bestE == 0.0 || !nRefineSteps)    // if exact, we've done
        return bestE;

    // Jitter endpoints in each direction
    const nRefineStart = 0 - (Math.min(nRefineSteps, 8));
    const nRefineEnd = Math.min(nRefineSteps, 8);
    for(let nJitterG0 = nRefineStart; nJitterG0 <= nRefineEnd; nJitterG0++)
    {
        InpRmp[GC][0] = Math.min(Math.max(InpRmp0[GC][0] + nJitterG0 * Fctrs[GC], 0.0), 255.0);
        for(let nJitterG1 = nRefineStart; nJitterG1 <= nRefineEnd; nJitterG1++)
        {
            InpRmp[GC][1] = Math.min(Math.max(InpRmp0[GC][1] + nJitterG1 * Fctrs[GC], 0.0), 255.0);
            Eq = MkWkRmpPts(WkRmpPts, InpRmp, nRedBits, nGreenBits, nBlueBits);
            BldClrRmp(Rmp[GC], WkRmpPts[GC], dwNumPoints);

            const RmpErrG = []; //[MAX_POINTS][MAX_BLOCK];
            for(let i = 0; i < _NmrClrs; i++)
            {
                for(let r = 0; r < dwNumPoints; r++)
                {
                    const DistG = (Rmp[GC][r] - Blk[i][GC]);
                    RmpErrG[r] = RmpErrG[r] || [];
                    RmpErrG[r][i] = DistG * DistG * fWeightGreen;
                }
            }
            
            for(let nJitterB0 = nRefineStart; nJitterB0 <= nRefineEnd; nJitterB0++)
            {
                InpRmp[BC][0] = Math.min(Math.max(InpRmp0[BC][0] + nJitterB0 * Fctrs[BC], 0.0), 255.0);
                for(let nJitterB1 = nRefineStart; nJitterB1 <= nRefineEnd; nJitterB1++)
                {
                    InpRmp[BC][1] = Math.min(Math.max(InpRmp0[BC][1] + nJitterB1 * Fctrs[BC], 0.0), 255.0);
                    Eq = MkWkRmpPts(WkRmpPts, InpRmp, nRedBits, nGreenBits, nBlueBits);
                    BldClrRmp(Rmp[BC], WkRmpPts[BC], dwNumPoints);

                    const RmpErr = []; //[MAX_POINTS][MAX_BLOCK];
                    for(let i=0; i < _NmrClrs; i++)
                    {
                        for(let r = 0; r < dwNumPoints; r++)
                        {
                            const DistB = (Rmp[BC][r] - Blk[i][BC]);
                            RmpErr[r] = RmpErr[r] || [];
                            RmpErr[r][i] = RmpErrG[r][i] + DistB * DistB * fWeightBlue;
                        }
                    }

                    for(let nJitterR0 = nRefineStart; nJitterR0 <= nRefineEnd; nJitterR0++)
                    {
                        InpRmp[RC][0] = Math.min(Math.max(InpRmp0[RC][0] + nJitterR0 * Fctrs[RC], 0.0), 255.0);
                        for(let nJitterR1 = nRefineStart; nJitterR1 <= nRefineEnd; nJitterR1++)
                        {
                            InpRmp[RC][1] = Math.min(Math.max(InpRmp0[RC][1] + nJitterR1 * Fctrs[RC], 0.0), 255.0);
                            Eq = MkWkRmpPts(WkRmpPts, InpRmp, nRedBits, nGreenBits, nBlueBits);
                            BldClrRmp(Rmp[RC], WkRmpPts[RC], dwNumPoints);

                            // compute cumulative error
                            let mse = 0.0;
                            const rmp_l = (Eq) ? 1 : dwNumPoints;
                            for(let k = 0; k < _NmrClrs; k++)
                            {
                                let MinErr = 10000000.0;
                                for(let r = 0; r < rmp_l; r++)
                                {
                                    const Dist = (Rmp[RC][r] - Blk[k][RC]);
                                    const Err = RmpErr[r][k] + Dist * Dist * fWeightRed;
                                    MinErr = Math.min(MinErr, Err);
                                }
                                mse += MinErr * _Rpt[k];
                            }

                            // save if we achieve better result
                            if(mse < bestE)
                            {
                                bestE = mse;
                                for(let k = 0; k < 2; k++)
                                    for(let j = 0; j < 3; j++)
                                        _OutRmpPnts[j][k] = InpRmp[j][k];
                            }
                        }
                    }
                }
            }
        }
    }

    return bestE;
}

/*------------------------------------------------------------------------------------------------
1 dim error
------------------------------------------------------------------------------------------------*/
function RampSrchW(_Blck, //[MAX_BLOCK],
                   _BlckErr, //[MAX_BLOCK],
                   _Rpt, //[MAX_BLOCK],
                   _maxerror, _min_ex, _max_ex,
                   _NmbClrs, _block)
{
    let error = 0;
    const step = (_max_ex - _min_ex) / (_block - 1);
    const step_h = step * 0.5;
    const rstep = 1.0 / step;
    
    let v, d;
    for(let i=0; i < _NmbClrs; i++)
    {
        // Work out which value in the block this select
        const del = _Blck[i] - _min_ex;

        if(del <= 0)
            v = _min_ex;
        else if(_Blck[i] - _max_ex >= 0)
            v = _max_ex;
        else
            v = Math.floor((del + step_h) * rstep) * step + _min_ex;

        // And accumulate the error
        //d = Math.pow(_Blck[i] - v, 2);
        d = _Blck[i] - v;
        d = d * d;
        //err = (_Rpt[i] * d) + _BlckErr[i];
        //error += err;
        error += (_Rpt[i] * d) + _BlckErr[i];
        if(_maxerror < error)
        {
            error = _maxerror;
            break;
        }
    }
    return error;
}

// Find the first approximation of the line
// Assume there is a linear relation
//   Z = a * X_In
//   Z = b * Y_In
// Find a,b to minimize MSE between Z and Z_In
function FindAxis(_outBlk, //[MAX_BLOCK][NUM_CHANNELS],
                  fLineDirection, //[NUM_CHANNELS],
                  fBlockCenter, //[NUM_CHANNELS],
                  _inpBlk, //[MAX_BLOCK][NUM_CHANNELS],
                  _inpRpt, //[MAX_BLOCK],
                  nDimensions, nNumColors) {
    const Crrl = [];
    const RGB2 = [];
    fLineDirection[0] = fLineDirection[1] = fLineDirection[2] = RGB2[0] = RGB2[1] = RGB2[2] = 
        Crrl[0] = Crrl[1] = Crrl[2] = fBlockCenter[0] = fBlockCenter[1] = fBlockCenter[2] = 0.0;

    // sum position of all points
    let fNumPoints = 0.0;
    for (let i = 0; i < nNumColors; i++) {
        fBlockCenter[0] += _inpBlk[i][0] * _inpRpt[i];
        fBlockCenter[1] += _inpBlk[i][1] * _inpRpt[i];
        fBlockCenter[2] += _inpBlk[i][2] * _inpRpt[i];
        fNumPoints += _inpRpt[i];
    }

    // and then average to calculate center coordinate of block
    fBlockCenter[0] /= fNumPoints;
    fBlockCenter[1] /= fNumPoints;
    fBlockCenter[2] /= fNumPoints;

    for(let i = 0; i < nNumColors; i++)
    {
        _outBlk[i] = _outBlk[i] || [];
        // calculate output block as offsets around block center
        _outBlk[i][0] = _inpBlk[i][0] - fBlockCenter[0];
        _outBlk[i][1] = _inpBlk[i][1] - fBlockCenter[1];
        _outBlk[i][2] = _inpBlk[i][2] - fBlockCenter[2];

        // compute correlation matrix
        // RGB2 = sum of ((distance from point from center) squared)
        // Crrl = ???????. Seems to be be some calculation based on distance from point center in two dimensions
        for(let j = 0; j < nDimensions; j++)
        {
            RGB2[j] += _outBlk[i][j] * _outBlk[i][j] * _inpRpt[i];
            Crrl[j] += _outBlk[i][j] * _outBlk[i][(j+1)%3] * _inpRpt[i];
        }
    }

    // if set's diameter is small
    let i0 = 0, i1 = 1;
    let mxRGB2 = 0.0;
    let k = 0, j = 0;
    const fEPS = fNumPoints * EPS;
    for(let k = 0, j = 0; j < 3; j++)
    {
        if(RGB2[j] >= fEPS)
            k++;
        else
            RGB2[j] = 0.0;

        if(mxRGB2 < RGB2[j])
        {
            mxRGB2 = RGB2[j];
            i0 = j;
        }
    }

    const fEPS2 = fNumPoints * EPS2;
    let _pbSmall = true;
    for(let j = 0; j < 3; j++)
        _pbSmall = _pbSmall && (RGB2[j] < fEPS2);

    if(_pbSmall) // all are very small to avoid division on the small determinant
        return _pbSmall;

    if(k == 1) { // really only 1 dimension
        fLineDirection[i0]= 1.0;
    } else if(k == 2) { // really only 2 dimensions
        i1 = (RGB2[(i0+1)%3] > 0.0) ? (i0+1)%3 : (i0+2)%3;
        const Crl = (i1 == (i0+1)%3) ? Crrl[i0] : Crrl[(i0+2)%3];
        fLineDirection[i1] = Crl/ RGB2[i0];
        fLineDirection[i0]= 1.0;
    } else {
        const maxDet = 100000.0;
        const Cs = [];
        // select max det for precision
        for(let j = 0; j < nDimensions; j++)
        {
            const Det = RGB2[j] * RGB2[(j+1)%3] - Crrl[j] * Crrl[j];
            Cs[j] = Math.abs(Crrl[j]/Math.sqrt(RGB2[j] * RGB2[(j+1)%3]));
            if(maxDet < Det)
            {
                maxDet = Det;
                i0 = j;
            }
        }

        // inverse correl matrix
        //  --      --       --      --
        //  |  A   B |       |  C  -B |
        //  |  B   C |  =>   | -B   A |
        //  --      --       --     --
        const mtrx1 = [[], []];
        const vc1 = [];
        const vc = [];
        vc1[0] = Crrl[(i0 + 2) %3];
        vc1[1] = Crrl[(i0 + 1) %3];
        // C
        mtrx1[0][0] = RGB2[(i0+1)%3]; 
        // A
        mtrx1[1][1] = RGB2[i0]; 
        // -B
        mtrx1[1][0] = mtrx1[0][1] = -Crrl[i0]; 
        // find a solution
        vc[0] = mtrx1[0][0] * vc1[0] + mtrx1[0][1] * vc1[1];
        vc[1] = mtrx1[1][0] * vc1[0] + mtrx1[1][1] * vc1[1];
        // normalize
        vc[0] /= maxDet;
        vc[1] /= maxDet;
        // find a line direction vector
        fLineDirection[i0] = 1.0;
        fLineDirection[(i0 + 1) %3] = 1.0;
        fLineDirection[(i0 + 2) %3] = vc[0] + vc[1];
    }

    // normalize direction vector
    let Len = fLineDirection[0] * fLineDirection[0] + fLineDirection[1] * fLineDirection[1] + fLineDirection[2] * fLineDirection[2];
    Len = Math.sqrt(Len);

    for(let j = 0; j < 3; j++) {
        fLineDirection[j] = (Len > 0.0) ? fLineDirection[j] / Len : 0.0;
    }

    return _pbSmall;
}

function Clstr(block_32, //[MAX_BLOCK],
               dwBlockSize, 
               nEndpoints, //[3][NUM_ENDPOINTS],
               pcIndices, dwNumPoints,
               _pfWeights, _bUseAlpha, _nAlphaThreshold, 
               nRedBits, nGreenBits, nBlueBits) {
    const c0 = ConstructColor(nEndpoints[RC][0], nRedBits, nEndpoints[GC][0], nGreenBits, nEndpoints[BC][0], nBlueBits);
    const c1 = ConstructColor(nEndpoints[RC][1], nRedBits, nEndpoints[GC][1], nGreenBits, nEndpoints[BC][1], nBlueBits);
    let nEndpointIndex0 = 0;
    let nEndpointIndex1 = 1;
    if((!(dwNumPoints & 0x1) && c0 <= c1) || ((dwNumPoints & 0x1) && c0 > c1))
    {
        nEndpointIndex0 = 1;
        nEndpointIndex1 = 0;
    }

    //CODECFLOAT InpRmp[NUM_CHANNELS][NUM_ENDPOINTS];
    const InpRmp = [[], [], [], []];
    InpRmp[RC][0] = nEndpoints[RC][nEndpointIndex0];
    InpRmp[RC][1] = nEndpoints[RC][nEndpointIndex1];
    InpRmp[GC][0] = nEndpoints[GC][nEndpointIndex0];
    InpRmp[GC][1] = nEndpoints[GC][nEndpointIndex1];
    InpRmp[BC][0] = nEndpoints[BC][nEndpointIndex0];
    InpRmp[BC][1] = nEndpoints[BC][nEndpointIndex1];

    //DWORD dwAlphaThreshold = _nAlphaThreshold << 24;
    const dwAlphaThreshold = _nAlphaThreshold;
    //CODECFLOAT Blk[MAX_BLOCK][NUM_CHANNELS];
    const Blk = [];
    for(let i = 0; i < dwBlockSize; i++)
    {
        Blk[i] = Blk[i] || [];
        Blk[i][BC] = ((block_32[i] & 0xff0000) >> 16);
        Blk[i][GC] = ((block_32[i] & 0xff00) >> 8);
        Blk[i][RC] = (block_32[i] & 0xff);
        if(_bUseAlpha)
            Blk[i][AC] = ((block_32[i] & 0xff000000 >> 24) >= dwAlphaThreshold) ? 1.0 : 0.0;
    }

    return ClstrBas(pcIndices, Blk, InpRmp, dwBlockSize, dwNumPoints, _pfWeights, _bUseAlpha, nRedBits, nGreenBits, nBlueBits);
}

function ClstrBas(_Indxs,
                  _Blk, //[MAX_BLOCK][NUM_CHANNELS],
                  _InpRmp, //[NUM_CHANNELS][NUM_ENDPOINTS],
                  dwBlockSize, dwNumPoints, _pfWeights, 
                  _bUseAlpha, nRedBits, nGreenBits, nBlueBits) {
    // make ramp endpoints the way they'll going to be decompressed
    let Eq = true;
    const InpRmp = [[], [], [], []];
    Eq = MkWkRmpPts(InpRmp, _InpRmp, nRedBits, nGreenBits, nBlueBits);

    // build ramp as it would be built by decompressor
    const Rmp = [[], [], [], []];
    BldRmp(Rmp, InpRmp, dwNumPoints);

    // clusterize and find a cumulative error
    return ClstrIntnl(_Blk, _Indxs, Rmp, dwBlockSize, dwNumPoints, Eq,  _pfWeights, _bUseAlpha);
}

function MkWkRmpPts(_OutRmpPts, //[NUM_CHANNELS][NUM_ENDPOINTS], 
                    _InpRmpPts, //[NUM_CHANNELS][NUM_ENDPOINTS],
                    nRedBits, nGreenBits, nBlueBits)
{
    const Fctrs = [];
    Fctrs[RC] = (1 << nRedBits);
    Fctrs[GC] = (1 << nGreenBits);
    Fctrs[BC] = (1 << nBlueBits);

    //_bEq = true;
    // find whether input ramp is flat
    //for(let j = 0; j < 3; j++) {
    //   _bEq  = _bEq && (_InpRmpPts[j][0] == _InpRmpPts[j][1]);
    //}
    _bEq = (_InpRmpPts[0][0] == _InpRmpPts[0][1]) &&
           (_InpRmpPts[1][0] == _InpRmpPts[1][1]) &&
           (_InpRmpPts[2][0] == _InpRmpPts[2][1]);

    // end points on the integer grid
    for(let j = 0; j <3; j++)
    {
        /*
        for(let k = 0; k <2; k++)
        {
            // Apply the lower bit replication to give full dynamic range
            _OutRmpPts[j][k] = _InpRmpPts[j][k] + Math.floor(_InpRmpPts[j][k] / Fctrs[j]);
            _OutRmpPts[j][k] = Math.max(_OutRmpPts[j][k], 0.0);
            _OutRmpPts[j][k] = Math.min(_OutRmpPts[j][k], 255.0);
        }
        */
        // Apply the lower bit replication to give full dynamic range
        _OutRmpPts[j][0] = _InpRmpPts[j][0] + Math.floor(_InpRmpPts[j][0] / Fctrs[j]);
        _OutRmpPts[j][0] = Math.max(_OutRmpPts[j][0], 0.0);
        _OutRmpPts[j][0] = Math.min(_OutRmpPts[j][0], 255.0);
        _OutRmpPts[j][1] = _InpRmpPts[j][1] + Math.floor(_InpRmpPts[j][1] / Fctrs[j]);
        _OutRmpPts[j][1] = Math.max(_OutRmpPts[j][1], 0.0);
        _OutRmpPts[j][1] = Math.min(_OutRmpPts[j][1], 255.0);
    }

    return _bEq;
}

function BldRmp(_Rmp, //[NUM_CHANNELS][MAX_POINTS],
                _InpRmp, //[NUM_CHANNELS][NUM_ENDPOINTS], 
                dwNumPoints)
{
    /*
    for(let j = 0; j < 3; j++) {
        BldClrRmp(_Rmp[j], _InpRmp[j], dwNumPoints);
    }
    */
    BldClrRmp(_Rmp[0], _InpRmp[0], dwNumPoints);
    BldClrRmp(_Rmp[1], _InpRmp[1], dwNumPoints);
    BldClrRmp(_Rmp[2], _InpRmp[2], dwNumPoints);
}

function BldClrRmp(_Rmp, //[MAX_POINTS],
                   _InpRmp, //[NUM_ENDPOINTS],
                   dwNumPoints)
{
    // linear interpolate end points to get the ramp 
    _Rmp[0] = _InpRmp[0];
    _Rmp[dwNumPoints - 1] = _InpRmp[1];
    if(dwNumPoints % 2)
        _Rmp[dwNumPoints] = 1000000.0; // for 3 point ramp; not to select the 4th point as min
    for(let e = 1; e < dwNumPoints - 1; e++) {
        _Rmp[e] = Math.floor(
            ((_Rmp[0] * (dwNumPoints - 1 - e)) +
             (_Rmp[dwNumPoints - 1] * e) +
             dwRndAmount[dwNumPoints]) /
            (dwNumPoints - 1)
        );
    }
}

/*------------------------------------------------------------------------------------------------
Compute cumulative error for the current cluster
------------------------------------------------------------------------------------------------*/
function ClstrErr(_Blk, //[MAX_BLOCK][NUM_CHANNELS],
                  _Rpt, //[MAX_BLOCK], 
                  _Rmp, //[NUM_CHANNELS][MAX_POINTS],
                  _NmbClrs, _blcktp, 
                  _ConstRamp, _pfWeights)
{
    let fError = 0.0;
    const rmp_l = (_ConstRamp) ? 1 : _blcktp;

    // For each colour in the original block, find the closest cluster
    // and compute the comulative error
    for(let i=0; i<_NmbClrs; i++)
    {
        let fShortest = 99999999999.0;

        const pfWeights = _pfWeights || [1.0, 1.0, 1.0, 1.0];
        for(let r=0; r < rmp_l; r++)
        {
            // calculate the distance for each component
            const fDistance = (_Blk[i][RC] - _Rmp[RC][r]) * (_Blk[i][RC] - _Rmp[RC][r]) * pfWeights[0] + 
                              (_Blk[i][GC] - _Rmp[GC][r]) * (_Blk[i][GC] - _Rmp[GC][r]) * pfWeights[1] + 
                              (_Blk[i][BC] - _Rmp[BC][r]) * (_Blk[i][BC] - _Rmp[BC][r]) * pfWeights[2];

            if(fDistance < fShortest)
                fShortest = fDistance;
        }

        // accumulate the error
        fError += fShortest * _Rpt[i];
    }

    return fError;
}

// Compute error and find DXTC indexes for the current cluster
function ClstrIntnl(_Blk, //[MAX_BLOCK][NUM_CHANNELS],
                    _Indxs, 
                    _Rmp, //[NUM_CHANNELS][MAX_POINTS],
                    dwBlockSize, dwNumPoints, 
                    _ConstRamp, _pfWeights, _bUseAlpha)
{
    Err = 0.0;
    rmp_l = (_ConstRamp) ? 1 : dwNumPoints;

    // For each colour in the original block assign it
    // to the closest cluster and compute the cumulative error
    for(let i = 0; i< dwBlockSize; i++)
    {
        if(_bUseAlpha && _Blk[i][AC] == 0) {
            _Indxs[i] = dwNumPoints;
        }
        else
        {
            let shortest = 99999999999.0;
            let shortestIndex = 0;
            const pfWeights = _pfWeights || [1, 1, 1, 1];
            for(let r = 0; r < rmp_l; r++)
            {
                // calculate the distance for each component
                const distance =    (_Blk[i][RC] - _Rmp[RC][r]) * (_Blk[i][RC] - _Rmp[RC][r]) * pfWeights[0] + 
                                    (_Blk[i][GC] - _Rmp[GC][r]) * (_Blk[i][GC] - _Rmp[GC][r]) * pfWeights[1] + 
                                    (_Blk[i][BC] - _Rmp[BC][r]) * (_Blk[i][BC] - _Rmp[BC][r]) * pfWeights[2];

                if(distance < shortest)
                {
                    shortest = distance;
                    shortestIndex = r;
                }
            }

            Err += shortest;

            // We have the index of the best cluster, so assign this in the block
            // Reorder indices to match correct DXTC ordering
            if(shortestIndex == dwNumPoints - 1) {
                shortestIndex = 1;
            } else if(shortestIndex) {
                shortestIndex++;
            }
            _Indxs[i] = shortestIndex;
        }
    }

    return Err;
}


function ConstructColour(r, g, b) {
    return ((r << 11) | (g << 5) | b);
}

function ConstructColor(R, nRedBits, G, nGreenBits, B, nBlueBits)
{
    return (((R & nByteBitsMask[nRedBits])   << (nGreenBits + nBlueBits - (PIX_GRID - nRedBits))) |
            ((G & nByteBitsMask[nGreenBits]) << (nBlueBits - (PIX_GRID - nGreenBits))) |
            ((B & nByteBitsMask[nBlueBits])  >> ((PIX_GRID - nBlueBits))));
}

function CalculateColourWeightings(block) {
    if(!options.m_bUseChannelWeighting)
        return null;

    //XXX RESET HERE BECAUSE WE DON'T HAVE A WAY TO SET THEM CURRENTLY
    const m_fChannelWeights = options.m_fChannelWeights;
    m_fChannelWeights[0] = m_fBaseChannelWeights[0];
    m_fChannelWeights[1] = m_fBaseChannelWeights[1];
    m_fChannelWeights[2] = m_fBaseChannelWeights[2];

    if(options.m_bUseAdaptiveWeighting) {
        let averageR = 0.0, averageG = 0.0, averageB = 0.0;

        for(let k = 0; k < MAX_BLOCK; k+=4)
        {
            averageB += block[k + 2];
            averageG += block[k + 1];
            averageR += block[k];
        }

        averageR /= BLOCK_SIZE_4X4;
        averageG /= BLOCK_SIZE_4X4;
        averageB /= BLOCK_SIZE_4X4;

        // Now skew the colour weightings based on the gravity center of the block
        const largest = Math.max(Math.max(averageR, averageG), averageB);

        if(largest > 0)
        {
            averageR /= largest;
            averageG /= largest;
            averageB /= largest;
        }
        else
            averageR = averageG = averageB = 1.0;

        // Scale weightings back up to 1.0f
        fWeightScale = 1.0 / (m_fBaseChannelWeights[0] + m_fBaseChannelWeights[1] + m_fBaseChannelWeights[2]);
        m_fChannelWeights[0] *= m_fBaseChannelWeights[0] * fWeightScale;
        m_fChannelWeights[1] *= m_fBaseChannelWeights[1] * fWeightScale;
        m_fChannelWeights[2] *= m_fBaseChannelWeights[2] * fWeightScale;
        m_fChannelWeights[0] = ((m_fChannelWeights[0] * 3 * averageR) + m_fChannelWeights[0]) * 0.25;
        m_fChannelWeights[1] = ((m_fChannelWeights[1] * 3 * averageG) + m_fChannelWeights[1]) * 0.25;
        m_fChannelWeights[2] = ((m_fChannelWeights[2] * 3 * averageB) + m_fChannelWeights[2]) * 0.25;
        fWeightScale = 1.0 / (m_fChannelWeights[0] + m_fChannelWeights[1] + m_fChannelWeights[2]);
        m_fChannelWeights[0] *= fWeightScale;
        m_fChannelWeights[1] *= fWeightScale;
        m_fChannelWeights[2] *= fWeightScale;
    }

    //console.log(m_fChannelWeights);
    return m_fChannelWeights;
}

// DXT5 Alpha stuff:
//



function CompBlock1X(_Blk,
                     dwBlockSize, nEndpoints, //[2],
                     pcIndices,
                     dwNumPoints, bFixedRampPoints, _bUseSSE2, _intPrec, _fracPrec, _bFixedRamp)
{
    // just to make them initialized
    if(!_bFixedRamp)
    {
        _intPrec = 8;
        _fracPrec = 0;
    }

    // convert 8-bit alpha values to floating point
    fBlk = [];
    for (let i in _Blk) {
        fBlk[i] = _Blk[i] / 255.0;
    }

    // this one makes the bulk of the work
    const Ramp = []; //[NUM_ENDPOINTS];
    CompBlock1(Ramp, fBlk, dwBlockSize, dwNumPoints, bFixedRampPoints, _intPrec, _fracPrec, _bFixedRamp, _bUseSSE2);

    // final clusterization applied
    const fError = Clstr1(pcIndices, fBlk, Ramp, dwBlockSize, dwNumPoints, bFixedRampPoints, _intPrec, _fracPrec, _bFixedRamp);
    nEndpoints[0] = Ramp[0] & 0xff;
    nEndpoints[1] = Ramp[1] & 0xff;

    return fError;
}

function CompBlock1(_RmpPnts, //[NUM_ENDPOINTS],
                    _Blk, //[MAX_BLOCK],
                    _Nmbr,
                    dwNumPoints, bFixedRampPoints,
                    _IntPrc, _FracPrc, _bFixedRamp, _bUseSSE2)
{
    let fMaxError = 0.0;

    const Ramp = [];//[NUM_ENDPOINTS];

    const IntFctr = (1 << _IntPrc);
//    CODECFLOAT FracFctr = (CODECFLOAT)(1 << _FracPrc);

    const afUniqueValues = [];//[MAX_BLOCK];
    const afValueRepeats = [];//[MAX_BLOCK];
    for(let i = 0; i < MAX_BLOCK; i++)
        afUniqueValues[i] = afValueRepeats[i] = 0.0;

// For each unique value we compute the number of it appearances.
    const fBlk = _Blk.slice(0);
    fBlk.sort();
    //const fBlk = [];//[MAX_BLOCK];
    //std::memcpy(fBlk, _Blk, _Nmbr * sizeof(CODECFLOAT));

    // sort the input
    //qsort((void *)fBlk, (size_t)_Nmbr, sizeof(CODECFLOAT), QSortFCmp);
            // mechanism for providing values by reference to Refine1
    

    let new_p = -2.0;

    let N0s = 0, N1s = 0;
    let dwUniqueValues = 0;
    //afUniqueValues[0] = 0.0;

    let requiresCalculation = true;

    if(bFixedRampPoints)
    {
        for(let i = 0; i < _Nmbr; i++)
        {
            if(new_p != fBlk[i])
            {
                new_p = fBlk[i];
                if(new_p <= 1.5/255.0) {
                    N0s++;
                } else if(new_p >= 253.5/255.0) {
                    N1s++;
                }
                else
                {
                    afUniqueValues[dwUniqueValues] = fBlk[i];
                    afValueRepeats[dwUniqueValues] = 1.0;
                    dwUniqueValues++;
                }
            }
            else if(dwUniqueValues > 0 && afUniqueValues[dwUniqueValues - 1] == new_p)
            {
                afValueRepeats[dwUniqueValues - 1] += 1.0;
            }
        }

        // if number of unique colors is less or eq 2 we've done either, but we know that we may have 0s and/or 1s as well.
        // To avoid for the ramp to be considered flat we invented couple entries on the way.
        if(dwUniqueValues <= 2)
        {
            if(dwUniqueValues == 2) // if 2, take them
            {
                Ramp[0]  = Math.floor(afUniqueValues[0] * (IntFctr - 1) + 0.5);
                Ramp[1]  = Math.floor(afUniqueValues[1] * (IntFctr - 1) + 0.5);
            }
            else if(dwUniqueValues == 1) // if 1, add another one
            {
                Ramp[0]  = Math.floor(afUniqueValues[0] * (IntFctr - 1) + 0.5);
                Ramp[1] = Ramp[0] + 1.0;
            }
            else // if 0, invent them
            {
                Ramp[0]  = 128.0;
                Ramp[1] = Ramp[0] + 1.0;
            }

            fMaxError = 0.0;
            requiresCalculation = false;
        }
    }
    else
    {
        for(let i = 0; i < _Nmbr; i++)
        {
            if(new_p != fBlk[i])
            {
                afUniqueValues[dwUniqueValues] = new_p = fBlk[i];
                afValueRepeats[dwUniqueValues] = 1.0;
                dwUniqueValues++;
            }
            else
                afValueRepeats[dwUniqueValues - 1] += 1.0;
        }

        // if number of unique colors is less or eq 2, we've done
        if(dwUniqueValues <= 2)
        {
            Ramp[0] = Math.floor(afUniqueValues[0] * (IntFctr - 1) + 0.5);
            if(dwUniqueValues == 1)
                Ramp[1] = Ramp[0] + 1.0;
            else
                Ramp[1] = Math.floor(afUniqueValues[1] * (IntFctr - 1) + 0.5);
            fMaxError = 0.0;
            requiresCalculation = false;
        }
    }

    const _INT_GRID = _bFixedRamp && _FracPrc == 0;

    if ( requiresCalculation )
    {
        let min_ex  = afUniqueValues[0];
        let max_ex  = afUniqueValues[dwUniqueValues - 1];
        const min_bnd = 0, max_bnd = 1.;
        let min_r = min_ex, max_r = max_ex;
        let gbl_l = 0, gbl_r = 0;
        const cntr = (min_r + max_r)/2;

        let gbl_err = MAX_ERROR;
        // Trying to avoid unnecessary calculations. Heuristics: after some analisis it appears
        // that in integer case, if the input interval not more then 48 we won't get much better

        const wantsSearch = !( _INT_GRID && max_ex - min_ex <= 48.0 / IntFctr );

        if ( wantsSearch )
        {
            // Search.
            // 1. take the vicinities of both low and high bound of the input interval.
            // 2. setup some search step
            // 3. find the new low and high bound which provides an (sub) optimal (infinite precision) clusterization.
            const gbl_llb = (min_bnd >  min_r - GBL_SCH_EXT) ? min_bnd : min_r - GBL_SCH_EXT;
            const gbl_rrb = (max_bnd <  max_r + GBL_SCH_EXT) ? max_bnd : max_r + GBL_SCH_EXT;
            const gbl_lrb = (cntr <  min_r + GBL_SCH_EXT) ? cntr : min_r + GBL_SCH_EXT;
            const gbl_rlb = (cntr >  max_r - GBL_SCH_EXT) ? cntr : max_r - GBL_SCH_EXT;
            for(let step_l = gbl_llb; step_l < gbl_lrb ; step_l+= GBL_SCH_STEP)
            {
                for(let step_r = gbl_rrb; gbl_rlb <= step_r; step_r-=GBL_SCH_STEP)
                {
                    const sch_err = RmpSrch1(afUniqueValues, afValueRepeats, gbl_err, step_l, step_r, dwUniqueValues, dwNumPoints);
                    if(sch_err < gbl_err)
                    {
                        gbl_err = sch_err;
                        gbl_l = step_l;
                        gbl_r = step_r;
                    }
                }
            }

            min_r = gbl_l;
            max_r = gbl_r;
        }

        // mechanism for providing values by reference to Refine1
        const minmax_r = {
            min: min_r, max: max_r
        };

        // This is a refinement call. The function tries to make several small stretches or squashes to
        // minimize quantization error.
        const m_step = LCL_SCH_STEP/ IntFctr;
        fMaxError = Refine1(afUniqueValues, afValueRepeats, gbl_err, minmax_r, m_step, min_bnd, max_bnd, dwUniqueValues,
                        dwNumPoints, _bUseSSE2);

        min_ex = minmax_r.min;
        max_ex = minmax_r.max;

        max_ex *= (IntFctr - 1);
        min_ex *= (IntFctr - 1);
/*
this one is tricky. for the float or high fractional precision ramp it tries to avoid
for the ramp to be collapsed into one integer number after rounding.
Notice the condition. There is a difference between max_ex and min_ex but after rounding
they may collapse into the same integer.
So we try to run the same refinement procedure but with starting position on the integer grid
and step equal 1.
*/
        if(!_INT_GRID && (max_ex - min_ex > 0.0) &&
           (Math.floor(min_ex + 0.5) == Math.floor(max_ex + 0.5)))
        {
            m_step = 1.0;
            gbl_err = MAX_ERROR;
            for(let i = 0; i < dwUniqueValues; i++)
                afUniqueValues[i] *= (IntFctr - 1);

            max_ex = min_ex = Math.floor(min_ex + 0.5);

            // mechanism for providing values by reference to Refine1
            const minmax_ex = {
                min: min_ex, max: max_ex
            };

            gbl_err = Refine1(afUniqueValues, afValueRepeats, gbl_err, minmax_ex, m_step, 0.0, 255.0, dwUniqueValues, dwNumPoints, _bUseSSE2);

            fMaxError = gbl_err;

        }
        Ramp[1] = Math.floor(max_ex + 0.5);
        Ramp[0] = Math.floor(min_ex + 0.5);
    }

    // Ensure that the two endpoints are not the same
    // This is legal but serves no need & can break some optimizations in the compressor
    if(Ramp[0] == Ramp[1])
    {
        if(Ramp[1] < 255.0)
            Ramp[1]++;
        else
            Ramp[1]--;
    }
    _RmpPnts[0] = Ramp[0];
    _RmpPnts[1] = Ramp[1];

    return fMaxError;
}

/*--------------------------------------------------------------------------------------------
---------------------------------------------------------------------------------------------*/
function RmpSrch1(_Blk, //[MAX_BLOCK],
                  _Rpt, //[MAX_BLOCK],
                  _maxerror,
                  _min_ex,
                  _max_ex,
                  _NmbrClrs,
                  nNumPoints)
{
    let error = 0;
    const step = (_max_ex - _min_ex) / (nNumPoints - 1);
    const step_h = step * 0.5;
    const rstep = 1.0 / step;

    for(let i = 0; i< _NmbrClrs; i++)
    {
        let v;
        // Work out which value in the block this select
        let del;

        if((del = _Blk[i] - _min_ex) <= 0)
            v = _min_ex;
        else if(_Blk[i] -  _max_ex >= 0)
            v = _max_ex;
        else
            v = (Math.floor((del + step_h) * rstep) * step) + _min_ex;

        // And accumulate the error
        const del2 = (_Blk[i] - v);
        error += del2 * del2 * _Rpt[i];

        // if we've already lost to the previous step bail out
        if(_maxerror < error)
        {
        error  = _maxerror;
        break;
        }
    }
    return error;
}

/*--------------------------------------------------------------------------------------------
---------------------------------------------------------------------------------------------*/

function Refine1(_Blk, //[MAX_BLOCK],
                 _Rpt, //[MAX_BLOCK],
                 _MaxError,
                 _minmax_ex,
                 //CODECFLOAT& _min_ex,
                 //CODECFLOAT& _max_ex,
                 _m_step,
                 _min_bnd,
                 _max_bnd, _NmbrClrs,
                 dwNumPoints, _bUseSSE2)
{
    // Start out assuming our endpoints are the min and max values we've determined

    // Attempt a (simple) progressive refinement step to reduce noise in the
    // output image by trying to find a better overall match for the endpoints.

    let maxerror = _MaxError;
    let min_ex = _minmax_ex.min;
    let max_ex = _minmax_ex.max;

    let mode, bestmode;
    do
    {
        let cr_min0 = min_ex;
        let cr_max0 = max_ex;
        for(bestmode = -1, mode = 0; mode < SCH_STPS * SCH_STPS; mode++)
        {
            // check each move (see sStep for direction)
            let cr_min =  min_ex + _m_step * sMvF[mode / SCH_STPS];
            let cr_max =  max_ex + _m_step * sMvF[mode % SCH_STPS];

            cr_min = Math.max(cr_min, _min_bnd);
            cr_max = Math.min(cr_max, _max_bnd);

            let error;
            if(_bUseSSE2)
                error = RmpSrch1SSE2(_Blk, _Rpt, maxerror, cr_min, cr_max, _NmbrClrs, dwNumPoints);
            else
                error = RmpSrch1(_Blk, _Rpt, maxerror, cr_min, cr_max, _NmbrClrs, dwNumPoints);

            if(error < maxerror)
            {
                maxerror = error;
                bestmode = mode;
                cr_min0 = cr_min;
                cr_max0 = cr_max;
            }
        }

        if(bestmode != -1)
        {
            // make move (see sStep for direction)
            min_ex = cr_min0;
            max_ex = cr_max0;
        }
    } while(bestmode != -1);

    _minmax_ex.min = min_ex;
    _minmax_ex.max = max_ex;

    return maxerror;
}


/*--------------------------------------------------------------------------------------------
---------------------------------------------------------------------------------------------*/
function Clstr1(pcIndices,
                _blockIn, //[MAX_BLOCK],
                _ramp, //[NUM_ENDPOINTS],
                _NmbrClrs, nNumPoints, bFixedRampPoints, _intPrec, _fracPrec, _bFixedRamp)
{
    let Err = 0.0;
    const alpha = [];//[MAX_POINTS];

    for(let i = 0; i < _NmbrClrs; i++)
        pcIndices[i] = 0;

    if(_ramp[0] == _ramp[1])
        return Err;

    if(!_bFixedRamp)
    {
       _intPrec = 8;
       _fracPrec = 0;
    }

    GetRmp1(alpha, _ramp, nNumPoints, bFixedRampPoints, _intPrec, _fracPrec, _bFixedRamp);

    if(bFixedRampPoints)
        nNumPoints += 2;

    const OverIntFctr = 1.0 / ((1 << _intPrec) - 1.0);
    for(let i = 0; i < nNumPoints; i++)
       alpha[i] *= OverIntFctr;

    // For each colour in the original block, calculate its weighted
    // distance from each point in the original and assign it
    // to the closest cluster
    for(let i = 0; i < _NmbrClrs; i++)
    {
        let shortest = 10000000.0;

        // Get the original alpha
        const acur = _blockIn[i];

        for(let j = 0; j < nNumPoints; j++)
        {
            const adist = Math.pow(acur - alpha[j], 2);
            //adist *= adist;

            if(adist < shortest)
            {
                shortest = adist;
                pcIndices[i] = j;
            }
        }

        Err += shortest;
    }

    return Err;
}

/*--------------------------------------------------------------------------------------------
---------------------------------------------------------------------------------------------*/
function GetRmp1(_rampDat, //[MAX_POINTS],
                 _ramp, //[NUM_ENDPOINTS],
                 nNumPoints,
                 bFixedRampPoints, _intPrec, _fracPrec, _bFixedRamp)
{
    if(_ramp[0] == _ramp[1])
        return;

    if(!bFixedRampPoints  && _ramp[0] <= _ramp[1] || bFixedRampPoints && _ramp[0] > _ramp[1])
    {
        const t = _ramp[0];
        _ramp[0] = _ramp[1];
        _ramp[1] = t;
    }

    _rampDat[0] = _ramp[0];
    _rampDat[1] = _ramp[1];

    const IntFctr = (1 << _intPrec);
    const FracFctr = (1 << _fracPrec);

    const ramp = []; //[NUM_ENDPOINTS];
    ramp[0] = _ramp[0] * FracFctr;
    ramp[1] = _ramp[1] * FracFctr;

    BldRmp1(_rampDat, ramp, nNumPoints);
    if(bFixedRampPoints)
    {
        _rampDat[nNumPoints] = 0.0;
        _rampDat[nNumPoints+1] = FracFctr * IntFctr - 1.0;
    }

    if(_bFixedRamp)
    {
        for(let i = 0; i < nNumPoints; i++)
        {
            _rampDat[i] = Math.floor(_rampDat[i] + 0.5);
            _rampDat[i] /= FracFctr;
        }
    }
}
/*------------------------------------------------------------------------------------------------
------------------------------------------------------------------------------------------------*/
function BldRmp1(_Rmp, //[MAX_POINTS],
                 _InpRmp, //[NUM_ENDPOINTS],
                 nNumPoints)
{
    // for 3 point ramp; not to select the 4th point in min
    for(let e = nNumPoints; e < MAX_POINTS; e++)
        _Rmp[e] = 100000.0;

    _Rmp[0] = _InpRmp[0];
    _Rmp[1] = _InpRmp[1];
    for(let e = 1; e < nNumPoints - 1; e++)
        _Rmp[e + 1] = (_Rmp[0] * (nNumPoints - 1 - e) + _Rmp[1] * e)/(nNumPoints - 1);
}
