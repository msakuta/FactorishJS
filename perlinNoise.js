(function(){
'use strict';

function makeCRCTable(){
	var c;
	var crcTable = [];
	for (var n = 0; n < 256; n++) {
		c = n;
		for (var k = 0; k < 8; k++) {
		c = ((c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1));
		}
		crcTable[n] = c;
	}
	return crcTable;
}
var crcTable = makeCRCTable();

var crc32_gp = function(str) {
	var table = crcTable || (crcTable = makeCRCTable());
	var crc = 0 ^ (-1);

	for (var i = 0; i < str.length; i++) {
		var val = str[i];
		for(var j = 0; j < 4; j++)
			crc = (crc >>> 8) ^ table[(crc ^ (val >> j)) & 0xFF];
	}

	return (crc ^ (-1)) >>> 0;
};

function noise_pixel(x, y, bit){
	// Use CRC32 to distribute influence of input vector [x, y] uniformly
	// to the RNG state vector.
	var seed = crc32_gp([Math.floor(x), Math.floor(y), bit]);
	var rs = new Xor128(seed);
	return rs.next();
}

window.perlin_noise_pixel = function(x, y, bit){
	var ret = 0, i;
	var sum = 0., maxv = 0., f = 1.;
	var persistence = 0.5;
	for(i = 2; 0 <= i; i--){
		var cell = 1 << i;
		var a00, a01, a10, a11, fx, fy;
		a00 = noise_pixel(x / cell, y / cell, bit);
		a01 = noise_pixel(x / cell, y / cell + 1, bit);
		a10 = noise_pixel(x / cell + 1, y / cell, bit);
		a11 = noise_pixel(x / cell + 1, y / cell + 1, bit);
		fx = (x % cell) / cell;
		fy = (y % cell) / cell;
		sum += ((a00 * (1. - fx) + a10 * fx) * (1. - fy)
			+ (a01 * (1. - fx) + a11 * fx) * fy) * f;
		maxv += f;
		f *= persistence;
	}
	return sum / maxv;
}
})();
