// An extension for Okteta hex editor that provides definitions of basic data chunks that an AVI file is composed of.
//
// Based on the following specifications:
// http://www.alexander-noe.com/video/documentation/avi.pdf
// http://www.the-labs.com/Video/odmlff2-avidef.pdf


//==========================================================================|
// Utility functions                                                        |
//__________________________________________________________________________|

function fourCCToDword(fourCC) {
	if (fourCC.length != 4)
		throw "FourCC must have exactly 4 characters"

	return (
		fourCC.charCodeAt(3) * 0x1000000 +
		fourCC.charCodeAt(2) * 0x10000 +
		fourCC.charCodeAt(1) * 0x100 +
		fourCC.charCodeAt(0)
	);
}

function mergeDicts(dict1Fields, dict2Fields) {
	var result = {};

	for (var field_name in dict1Fields)
		result[field_name] = dict1Fields[field_name];

	for (var field_name in dict2Fields) {
		if (field_name in result)
			throw "Dicts to be merged overlap (field name: " + field_name + ")"

		result[field_name] = dict2Fields[field_name];
	}

	return result;
}

function paddingToAlign(size, alignment) {
	if (size < 0)
		throw "Size must be greater of equal to zero (got " + size + ")"

	if (alignment <= 0)
		throw "Alignment must be greater than zero (got " + alignment + ")"

	return size % alignment == 0 ? 0 : alignment - size % alignment
}

function withDynamicDataArray(chunkConstructor) {
	return chunkConstructor({data: array(
		char(),
		function () {
			var SIZEOF_CHUNK_HEADER  = 8

			// ASSUMPTION: listChunk has 4 children and chunk has 3
			if (this.parent.childCount == 4)
				return this.parent.dwSize.value - 4;
			else if (this.parent.childCount == 3)
				return this.parent.dwSize.value;
			else
				throw "Invalid chunk type. listChunk() or chunk() required"
		}
	)})
}

function createFourCCEnum(values) {
	result = {}
	for (var i = 0; i < values.length; ++i)
		result[values[i]] = fourCCToDword(values[i]);

	return result
}

//==========================================================================|
// Basic structures                                                         |
//__________________________________________________________________________|

var FourCCEnum = createFourCCEnum([
	// List headers
	"LIST",
	"RIFF",
	"JUNK",

	// Lists
	"AVI ",
	"AVIX",
	"strl",
	"movi",
	"rec ",
	"hdrl",
	"odml",
	"INFO",

	// Chunks
	"avih",
	"strh",
	"strf",
	"strd",
	"strn",
	"idx1",
	"vprp",
	"dmlh",

	// Stream types
	"vids",
	"auds",
	"txts",

	// Codecs
	"DIVX",
	"FMP4",

	// Index elements
	// TODO: 00/01 corresponds to the stream index. There can be more than two streams in file
	"00db", // Uncompressed video frame
	"00dc", // Compressed video frame
	"00wb", // Palette change
	"00wc", // Audio data
	"01db",
	"01dc",
	"01wb",
	"01wc"
])

function fourCC() {
	return enumeration("fourCC", uint32(), FourCCEnum);
}

function listChunk(fields) {
	return struct(mergeDicts(
		{
			dwList:   fourCC(),
			dwSize:   uint32(),
			dwFourCC: fourCC()
		},
		fields
	))
}

function chunk(fields) {
	return struct(mergeDicts(
		{
			dwFourCC: fourCC(),
			dwSize:   uint32()
		},
		fields
	))
}

function avihChunk() {
	return chunk({
		dwMicroSecPerFrame:    uint32(),
		dwMaxBytesPerSec:      uint32(),
		dwPaddingGranularity:  uint32(),
		AVIF_HAS_INDEX:        bitfield('bool', 1),
		AVIF_MUSTUSEINDEX:     bitfield('bool', 1),
		AVIF_ISINTERLEAVED:    bitfield('bool', 1),
		AVIF_WASCAPTUREFILE:   bitfield('bool', 1),
		AVIF_COPYRIGHTED:      bitfield('bool', 1),
		AVIF_TRUSTCKTYPE:      bitfield('bool', 1),
		padding:               bitfield('unsigned', 26),
		dwTotalFrames:         uint32(),
		dwInitialFrames:       uint32(),
		dwStreams:             uint32(),
		dwSuggestedBufferSize: uint32(),
		dwWidth:               uint32(),
		dwHeight:              uint32(),
		dwReserved:            array(uint32(), 4)
	})
}

function strhChunk() {
	return chunk({
		fccType:                fourCC(),
		fccHandler:             fourCC(),
		AVISF_DISABLED:         bitfield("bool", 1),
		AVISF_VIDEO_PALCHANGES: bitfield("bool", 1),
		padding:                bitfield("unsigned", 30),
		wPriority:              uint16(),
		wLanguage:              uint16(),
		dwInitialFrames:        uint32(),
		dwScale:                uint32(),
		dwRate:                 uint32(),
		dwStart:                uint32(),
		dwLength:               uint32(),
		dwSuggestedBufferSize:  uint32(),
		dwQuality:              uint32(),
		dwSampleSize:           uint32(),
		rcFrame:                array(uint16(), 4)
	})
}

function BITMAPINFOHEADER() {
	// NOTE: Size does not include palette and padding
	var SIZEOF_BITMAPINFOHEADER = 9 * 4 + 2 * 2;

	return {
		biSize:          uint32(),
		biWidth:         uint32(),
		biHeight:        uint32(),
		biPlanes:        uint16(),
		biBitCount:      uint16(),
		biCompression:   fourCC(),
		biSizeImage:     uint32(),
		biXPelsPerMeter: uint32(),
		biYPelsPerMeter: uint32(),
		biClrUsed:       uint32(),
		biClrImportant:  uint32(),
		palette:         array(char(), function () { return this.parent.biSize.value - SIZEOF_BITMAPINFOHEADER }),
		padding:         array(char(), function () { return paddingToAlign(this.parent.biSize.value, 4) })
	}
}

function WAVEFORMATEX() {
	return {
		wFormatTag:      uint16(),
		nChannels:       uint16(),
		nSamplesPerSec:  uint32(),
		nAvgBytesPerSec: uint32(),
		nBlockAlign:     uint16(),
		wBitsPerSample:  uint16(),
		cbSize:          uint16()
	}
}

function MPEGLAYER3WAVEFORMAT() {
	return {
		wfx:             struct(WAVEFORMATEX()),
		wID:             uint16(),
		fdwFlags:        uint32(),
		nBlockSize:      uint16(),
		nFramesPerBlock: uint16(),
		nCodecDelay:     uint16()
	}
}

function AVIINDEXENTRY() {
	return {
		ckid:           fourCC(),
		AVIIF_KEYFRAME: bitfield('bool', 1),
		AVIIF_LIST:     bitfield('bool', 1),
		AVIIF_FISTPART: bitfield('bool', 1),
		AVIIF_LASTPART: bitfield('bool', 1),
		AVIIF_NOTIME:   bitfield('bool', 1),
		padding:        bitfield('unsigned', 27),
		dwChunkOffset:  uint32(),
		dwChunkLength:  uint32()
	}
}

function idx1Chunk() {
	return chunk({index_entry: array(
		struct(AVIINDEXENTRY()),
		function () {
			var SIZEOF_AVIINDEXENTRY = 16

			return this.parent.dwSize.value / SIZEOF_AVIINDEXENTRY
		}
	)})
}

function _avisuperindex_entry() {
	return {
		qwOffset:   int64(),
		dwSize:     uint32(),
		dwDuration: uint32()
	}
}

function AVISUPERINDEX() {
	return {
		wLongsPerEntry: uint16(), // 4
		bIndexSubType:  uint8(),  // [AVI_INDEX_2FIELD | 0]
		bIndexType:     uint8(),  // AVI_INDEX_OF_INDEXES
		nEntriesInUse:  uint32(),
		dwChunkID:      uint32(),
		dwReserved:     array(uint32(), 3),
		aIndex:         array(struct(_avisuperindex_entry()), 4)
	}
}

function _avistdindex_entry() {
	return {
		dwOffset: uint32(),
		dwSize:   uint32()
	}
}

function AVISTDINDEX() {
	return {
		wLongsPerEntry: uint16(), // 2
		bIndexSubType:  uint8(),  // 0
		bIndexType:     uint8(),  // AVI_INDEX_OF_CHUNKS
		nEntriesInUse:  uint32(),
		dwChunkID:      uint32(),
		qwBaseOffset:   int64(),
		dwReserved3:    uint32(),
		aIndex:         array(struct(_avisuperindex_entry()), 4)
	}
}

function VIDEO_FIELD_DESC() {
	return {
		CompressedBMHeight:   uint32(),
		CompressedBMWidth:    uint32(),
		ValidBMHeight:        uint32(),
		ValidBMWidth:         uint32(),
		ValidBMXOffset:       uint32(),
		ValidBMYOffset:       uint32(),
		VideoXOffsetInT:      uint32(),
		VideoYValidStartLine: uint32()
	}
}

function VideoPropHeader() {
	return {
		VideoFormatToken:      uint32(),
		VideoStandard:         uint32(),
		dwVerticalRefreshRate: uint32(),
		dwHTotalInT:           uint32(),
		dwVTotalInLines:       uint32(),
		dwFrameAspectRatio:    uint32(),
		dwFrameWidthInPixels:  uint32(),
		dwFrameHeightInPixels: uint32(),
		nbFieldPerFrame:       uint32(),
		FieldInfo:             array(struct(VIDEO_FIELD_DESC()), function () { return this.parent.nbFieldPerFrame.value; })
	}
}

function ODMLExtendedAVIHeader() {
	return {
		dwTotalFrames: uint32()
	}
}

//==========================================================================|
// Layout construction kit                                                  |
//__________________________________________________________________________|

function DMLHJunk() {
	return listChunk({
		data: union({
			dmlh: chunk(ODMLExtendedAVIHeader()),
			junk: withDynamicDataArray(chunk)
		})
	})
}

var BIT_TYPES = {
	'JUNK':                 {label: 'JUNK', constructor: function () { return withDynamicDataArray(chunk) }},
	'vprp':                 {label: 'vprp', constructor: function () { return chunk(VideoPropHeader()) }},
	'BITMAPINFOHEADER':     {label: 'strf', constructor: function () { return chunk(BITMAPINFOHEADER()) }},
	'WAVEFORMATEX':         {label: 'strf', constructor: function () { return chunk(WAVEFORMATEX()) }},
	'MPEGLAYER3WAVEFORMAT': {label: 'strf', constructor: function () { return chunk(MPEGLAYER3WAVEFORMAT()) }}
}

function strlList(bits) {
	var result = {
		strh: strhChunk()
	}

	for (var i = 0; i < bits.length; ++i)
	{
		if (!(bits[i] in BIT_TYPES))
			throw "Invalid CHUNK/LIST a strl LIST: " + bits[i];

		var bitType = BIT_TYPES[bits[i]]

		if (bitType.label in result)
			throw "Duplicate CHUNK/LIST in a strl LIST: " + bits[i];

		result[bitType.label] = bitType.constructor();
	}

	return listChunk(result)
}

function genericAVI(streams) {
	var hdrl = {
		avih: avihChunk()
	}

	for (var streamLabel in streams)
		hdrl[streamLabel] = strlList(streams[streamLabel]);

	hdrl['JUNK'] = DMLHJunk()

	return listChunk({
		hdrl: listChunk(hdrl),
		INFO: withDynamicDataArray(listChunk),
		JUNK: withDynamicDataArray(chunk),
		movi: withDynamicDataArray(listChunk),
		// FIXME: Index won't be placed correctly because of array length limitation
		idx1: idx1Chunk()
	})
}

//==========================================================================|
// Entry point                                                              |
//__________________________________________________________________________|

function init() {
	var structure = union({
		'Example file layouts': union({
			'AVI (audio)': genericAVI({
				'strl (video)': ['BITMAPINFOHEADER', 'JUNK'],
				'strl (audio)': ['WAVEFORMATEX', 'JUNK']
			}),
			'AVI (MP3)': genericAVI({
				'strl (video)': ['BITMAPINFOHEADER', 'JUNK'],
				'strl (audio)': ['MPEGLAYER3WAVEFORMAT', 'JUNK']
			}),
			'AVI (vprp + audio)': genericAVI({
				'strl (video)': ['BITMAPINFOHEADER', 'JUNK', 'vprp'],
				'strl (audio)': ['WAVEFORMATEX', 'JUNK']
			}),
			'AVI (vprp + MP3)': genericAVI({
				'strl (video)': ['BITMAPINFOHEADER', 'JUNK', 'vprp'],
				'strl (audio)': ['MPEGLAYER3WAVEFORMAT', 'JUNK']
			}),
			'AVI (vprp)': genericAVI({
				'strl (video)': ['BITMAPINFOHEADER', 'JUNK', 'vprp']
			}),
		}),
		'Basic structures': union({
			'LIST':                        withDynamicDataArray(listChunk),
			'CHUNK':                       withDynamicDataArray(chunk),
			'avih':                        avihChunk(),
			'strh':                        strhChunk(),
			'strf (BITMAPINFOHEADER)':     chunk(BITMAPINFOHEADER()),
			'strf (WAVEFORMATEX)':         chunk(WAVEFORMATEX()),
			'strf (MPEGLAYER3WAVEFORMAT)': chunk(MPEGLAYER3WAVEFORMAT()),
			'AVIINDEXENTRY':               struct(AVIINDEXENTRY()),
			'idx1 (AVIOLDINDEX)':          idx1Chunk(),
			'indx (AVISUPERINDEX)':        chunk(AVISUPERINDEX()),
			'indx (AVISTDINDEX)':          chunk(AVISTDINDEX()),
			'VideoPropHeader':             chunk(VideoPropHeader()),
			'ODMLExtendedAVIHeader':       chunk(ODMLExtendedAVIHeader())
		})
	})

	return structure;
}
