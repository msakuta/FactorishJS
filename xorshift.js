/// \brief Implementation of George Marsaglia's Xorshift Pseudo Random Number Generator.
///
/// Refer to the original paper: https://www.jstatsoft.org/article/view/v008i14
///
/// Period 2^32-1.
///
/// Javascript's implementation do not have distinction between integral and floating numbers,
/// so we must bitmask after each operation.
function Xor128(seed){
	this.x = 32463534242;
	if(seed){
		if(seed instanceof Array){
			for(var i = 0; i < seed.length; i++){
				this.x ^= ((seed[i] & 0xffffffff) >>> 0);
				this.nexti();
			}
		}
		else{
			this.x ^= ((seed & 0xffffffff) >>> 0);
			this.nexti();
		}
	}
	this.nexti();
}

Xor128.prototype.nexti = function(){
	// We must bitmask and logical shift to simulate 32bit unsigned integer's behavior.
	// The optimizer is likely to actually make it uint32 internally (hopefully).
	// T = (I + L^a)(I + R^b)(I + L^c)
	// a = 13, b = 17, c = 5
	var x1 = ((this.x ^ (this.x << 13)) & 0xffffffff) >>> 0;
	var x2 = ((x1 ^ (x1 >>> 17)) & 0xffffffff) >>> 0;
	return this.x = ((x2 ^ (x2 << 5)) & 0xffffffff) >>> 0; 
}

Xor128.prototype.next = function(){
	return this.nexti() / (0xffffffff >>> 0);
}
