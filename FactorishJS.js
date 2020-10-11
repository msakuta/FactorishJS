var Conveyor = new (function(){
'use strict';
var container;
var table;
var xsize;
var ysize;
var viewPortWidth;
var viewPortHeight;
var board;
var tileElems;
var scrollPos = [0, 0];
var selectedTile = null;
var selectedCoords = null;
var cursorElem;
var cursorGhostElem;
var messageElem;
var debugText;
var infoElem;
var inventoryElem;
var inventoryIcons = false;
var inventoryTarget = null;
var playerElem;
var playerInventoryElem;
var playerInventoryIcons = false;
var tableMargin = 20;
var miniMapSize = 200;
var miniMapElem;
var miniMapCursorElem;
var recipeTarget = null;
var simstep = 0;
var autosave_frame = 0;

// Constants
var tilesize = 32;
var objsize = tilesize / 3;
var objViewSize = tilesize / 2; // View size is slightly greater than hit detection radius
var textType = isIE() ? "Text" : "text/plain";
var cursorZIndex = 900;
var windowZIndex = 1000;
var tooltipZIndex = 10000;

var toolBarElem;
var toolElems = [];
var toolOverlays = [];
var toolCursorElem;

// Placeholder object for player
var player = {inventory: {}};
var selectedInventory = null;
var selectedInventoryItem = null;

player.serialize = function(){
	return {inventory: this.inventory};
}

player.deserialize = function(obj){
	if(obj){
		this.inventory = obj.inventory || {};
	}
}

/// @returns Amount of items actually moved
player.addItem = function(item){
	var ret = Math.min(item.amount || 1, this.inventoryCapacity() - this.inventoryVolume());
	if(0 < ret){
		if(!(item.type in this.inventory))
			this.inventory[item.type] = ret;
		else
			this.inventory[item.type] += ret;
		updatePlayer();
		return ret;
	}
	else
		return 0;
};

player.removeItem = function(itemType, amount){
	amount = amount || 1;
	this.inventory[itemType] -= amount;
	if(this.inventory[itemType] <= 0)
		delete this.inventory[itemType];
	updatePlayer();
};

player.inventoryVolume = function(){
	var ret = 0;
	for(var k in this.inventory){
		ret += this.inventory[k];
	}
	return ret;
};

// The player has rather large inventory space
player.inventoryCapacity = function(){
	return 500;
}

function isIE(){
	var ua = window.navigator.userAgent;
	var msie = ua.indexOf('MSIE ');
	var trident = ua.indexOf('Trident/');
	return msie > 0 || trident > 0;
}

/// Mix fields of source into target.
/// This can be used like a dirty multiple inheritance.
function mixin(target, source){
	for(var k in source){
		target[k] = source[k];
	}
	return target;
}

/// Custom inheritance function that prevents the super class's constructor
/// from being called on inehritance.
/// Also assigns constructor property of the subclass properly.
/// @param subclass The constructor of subclass that should be inherit base
/// @param base The constructor of the base class which subclass's prototype should point to.
/// @param methods Optional argument for a table containing methods to define for subclass.
///                The table is mixed-in to subclass, so it won't be a base class of subclass.
function inherit(subclass,base,methods,addMixin){
	// If the browser or ECMAScript supports Object.create, use it
	// (but don't remember to redirect constructor pointer to subclass)
	if(Object.create){
		subclass.prototype = Object.create(base.prototype);
	}
	else{
		var sub = function(){};
		sub.prototype = base.prototype;
		subclass.prototype = new sub;
	}
	if(methods)
		mixin(subclass.prototype, methods);
	if(addMixin)
		mixin(subclass.prototype, addMixin);
	subclass.prototype.constructor = subclass;
}

function Structure(){
	this.tile = null;
	this.rotation = 0;
}

/// Serializes this object into a JSON object.
/// It is required to override this function correctly for all subclasses.
/// In order to make it hard to forget overriding, the method is inserted right after the constructor.
Structure.prototype.serialize = function(){
	return {type: this.name, rotation: this.rotation};
};

/// Deserializes this object from a JSON object.
/// It is inverse operation of serialize, so always make it symmetric.
Structure.prototype.deserialize = function(obj){
	this.rotation = obj.rotation || 0;
}

Structure.prototype.toolDesc = function(){
	return "";
};

Structure.prototype.desc = function(){
	return "";
};

/// Function to build DOM elements for graphics of this structure.
/// Called only once on construction, so if you want to animate the graphics, use frameProc.
/// The second argument is true only if it's about to render toolbar button.
Structure.prototype.draw = function(tileElem, isToolBar){
	if(this.symbol instanceof Array){
		tileElem.innerHTML = this.symbol[this.rotation];
	}
	else{
		tileElem.innerHTML = this.symbol;
	}
};

/// Function to respond when an object is on it.
/// Do nothing by default.
Structure.prototype.objectResponse = function(tile, o){};

/// Function that is called for every tile every simulation step.
Structure.prototype.frameProc = function(){};

/// Returns whether this structure can convey items on it.
/// Default is false.
Structure.prototype.movable = function(){
	return false;
};

// Default is unable to input or output items.
Structure.prototype.input = function(){return false};
Structure.prototype.output = function(){return false};

/// @brief returns connection bitfield which can influence the appearance from this structure.
///
/// When the structure is placed or removed, adjacent structures indicated with this function will
/// also be updated.
///
/// @returns Available connections to adjacent cells in a bitfield, 0 - left, 1 - top, 2 - right, 3 - bottom.
Structure.prototype.connection = function(){return 0};

Structure.prototype.getSize = function(){
	return [1, 1];
};

Structure.prototype.rotate = function(){
	this.rotation = (this.rotation + 1) % 4;
	updateTile(this.tile);
};

// Transport belt
function TransportBelt(){}
inherit(TransportBelt, Structure, {
	name: "Transport Belt",
	symbol: ["&lt;", "^", "&gt;", "V"],

	toolDesc: function(){
		return 'Transports items on ground';
	},

	draw: function(tileElem){
		var imgElem = document.createElement('div');
		imgElem.style.position = 'absolute';
		imgElem.style.left = '0px';
		imgElem.style.top = '0px';
		imgElem.style.width = tilesize + 'px';
		imgElem.style.height = tilesize + 'px';
		imgElem.style.backgroundImage = 'url("img/transport.png")';
		imgElem.style.backgroundPosition = (simstep) % 32 + 'px 0';
		imgElem.style.transform = 'rotate(' + (this.rotation * 90 + 180) + 'deg)';
		imgElem.style.borderStyle = 'none';
		tileElem.appendChild(imgElem);
		this.imgElem = imgElem;
	},

	objectResponse: function(tile, o){
		var vx = [-1, 0, 1, 0][this.rotation];
		var vy = [0, -1, 0, 1][this.rotation];
		var ax = this.rotation % 2 === 1 ? Math.floor((o.x) / tilesize) * tilesize + tilesize / 2 : o.x;
		var ay = this.rotation % 2 === 0 ? Math.floor((o.y) / tilesize) * tilesize + tilesize / 2 : o.y;
		var newx = Math.min(xsize * tilesize, Math.max(0, ax + vx));
		var newy = Math.min(ysize * tilesize, Math.max(0, ay + vy));
		var idx = board.indexOf(tile);
		if(!movableTile(newx, newy) || hitCheck(newx, newy, o))
			return;
		o.x = newx;
		o.y = newy;
		positionObject(o);
	},

	frameProc: function(){
		var imgElem = this.imgElem;
		imgElem.style.backgroundPosition = simstep % 32 + 'px 0';
	},

	movable: function(tile){
		return true;
	},
});


function Splitter(){
	TransportBelt.call(this);
	this.direction = false;
}
inherit(Splitter, TransportBelt, {
	name: "Splitter",

	objectResponse: function(tile, o){
		var vx = [-1, 0, 1, 0][this.rotation];
		var vy = [0, -1, 0, 1][this.rotation];
		var ax = this.rotation % 2 === 1 ? Math.floor((o.x) / tilesize) * tilesize + tilesize / 2 : o.x;
		var ay = this.rotation % 2 === 0 ? Math.floor((o.y) / tilesize) * tilesize + tilesize / 2 : o.y;
		var idx = board.indexOf(this.tile);
		var tx = idx % ysize;
		var ty = Math.floor(idx / ysize);
		var halftilesize = tilesize / 2;
		var postdirection = false;
		if(this.rotation % 2 === 0){
			// Detect the point where the item passes over the mid point of this entity.
			if((Math.floor((ax + halftilesize) / tilesize) !== Math.floor((ax + vx + halftilesize) / tilesize))){
				ay = (ty + this.direction) * tilesize + tilesize / 2;
				postdirection = true; // Signal to switch direction
			}
		}
		else if((Math.floor((ay + halftilesize) / tilesize) !== Math.floor((ay + vy + halftilesize) / tilesize))){
			ax = (tx + this.direction) * tilesize + tilesize / 2;
			postdirection = true; // Signal to switch direction
		}

		function tryMove(ax, ay){
			var newx = Math.min(xsize * tilesize, Math.max(0, ax + vx));
			var newy = Math.min(ysize * tilesize, Math.max(0, ay + vy));
			if(movableTile(newx, newy) && !hitCheck(newx, newy, o)){
				o.x = newx;
				o.y = newy;
				positionObject(o);
				return true;
			}
			else
				return false;
		}

		if(tryMove(ax, ay)){
			// Alternate direction if an item passed over the splitter
			if(postdirection){
				this.direction = (this.direction + 1) % 2;
			}
			return;
		}

		function checkMovable(ax, ay, tx, ty, tryMove){
			var objx = ax - Math.floor(ax / tilesize) * tilesize;
			if(tilesize / 4 < objx && objx < tilesize * 3 / 4){
				var objSide = Math.floor(ay / tilesize) - ty;
				var newy = (ty + !objSide) * tilesize + tilesize / 2;
				tryMove(ax, newy);
			}
		}

		if(this.rotation % 2 === 0){
			checkMovable(ax, ay, tx, ty, function(x, y){ return tryMove(x, y); });
		}
		else{
			checkMovable(ay, ax, ty, tx, function(x, y){ return tryMove(y, x); });
		}
	},

	draw: function(tileElem, isToolBar){
		var rot = this.rotation ? this.rotation : 0;
		var height = isToolBar ? tilesize : tilesize * 2;
		var transform = 'rotate(' + (rot * 90 + 180) + 'deg)';
		if(!isToolBar && rot % 2 !== 0)
			transform = 'translate(50%, -25%) ' + transform;
		var imgElem = document.createElement('div');
		imgElem.style.position = 'absolute';
		imgElem.style.left = '0px';
		imgElem.style.top = '0px';
		imgElem.style.width = tilesize + 'px';
		imgElem.style.height = height + 'px';
		imgElem.style.backgroundImage = 'url("img/transport.png")';
		imgElem.style.backgroundPosition = (simstep) % 32 + 'px 0';
		imgElem.style.transform = transform;
		imgElem.style.borderStyle = 'none';
		imgElem.style.zIndex = 1;
		tileElem.appendChild(imgElem);
		this.beltImgElem = imgElem;

		imgElem = document.createElement('div');
		imgElem.style.position = 'absolute';
		imgElem.style.left = '0px';
		imgElem.style.top = '0px';
		imgElem.style.width = tilesize + 'px';
		imgElem.style.height = height + 'px';
		imgElem.style.backgroundImage = 'url("img/splitter.png")';
		imgElem.style.backgroundPosition = '0px 0';
		imgElem.style.transform = transform;
		imgElem.style.borderStyle = 'none';
		imgElem.style.zIndex = 2;
		tileElem.appendChild(imgElem);
		this.imgElem = imgElem;
	},

	frameProc: function(){
		var imgElem = this.beltImgElem;
		imgElem.style.backgroundPosition = simstep % 32 + 'px 0';
	},

	getSize: function(){
		return this.rotation % 2 === 0 ? [1, 2] : [2, 1];
	},

	rotate: function(){
		// Can only do 180 degrees turn
		this.rotation = (this.rotation + 2) % 4;
		updateTile(this.tile);
	}
});


// Inserter
function Inserter(){
	this.cooldown = 0;
}
inherit(Inserter, Structure, {
	name: "Inserter",
	symbol: ["&lt;<br>I", "^<br>I", "&gt;<br>I", "V<br>I"],

	serialize: function(){
		var ret = Structure.prototype.serialize.call(this);
		ret.cooldown = this.cooldown;
		return ret;
	},

	deserialize: function(obj){
		Structure.prototype.deserialize.call(this, obj);
		this.cooldown = obj.cooldown;
	},

	toolDesc: function(){
		return 'Picks items from one side and puts on the other side<br>in the direction indicated by an arrow.<br>Costs no energy to operate.';
	},

	draw: function(tileElem){
		var baseElem = document.createElement('img');
		baseElem.src = 'img/inserter-base.png';
		baseElem.style.left = '0px';
		baseElem.style.top = '0px';
		baseElem.style.position = 'absolute';
		tileElem.appendChild(baseElem);
		var directionElem = document.createElement('img');
		directionElem.src = 'img/direction.png';
		directionElem.style.transform = 'rotate(' + (this.rotation * 90) + 'deg)';
		directionElem.style.position = 'relative';
		tileElem.appendChild(directionElem);
	},

	frameProc: function(){
		if(this.cooldown < 1)
			this.cooldown = 0;
		else
			this.cooldown--;

		if(0 < this.cooldown)
			return;
		var idx = board.indexOf(this.tile);
		var tx = idx % ysize;
		var ty = Math.floor(idx / ysize);

		var vx = [-1, 0, 1, 0][this.rotation];
		var vy = [0, -1, 0, 1][this.rotation];
		var sx = tx - vx;
		var sy = ty - vy;
		var sourceTile = board[sx + sy * ysize];
		var dx = tx + vx;
		var dy = ty + vy;
		var destTile = board[dx + dy * ysize];

		// If the source is a producer and destination is a transport belt, put a product into the belt.
		if(sourceTile.structure && sourceTile.structure.output){
//						if(sourceTile.structure.output.call(sourceTile, dx, dy)){
			if(sourceTile.structure.output(dx, dy)){
				this.cooldown = 10;
				return;
			}
		}

		// If the destination is a destroyer, put the object into the destroyer and cosume it.
		var scope = this;
		findItem(sx, sy, function(o){
			var ret = destTile.structure && destTile.structure.input(o);
			if(ret)
				scope.cooldown = 10;
			return ret;
		}, true);
	}
});

/// Abstract class for structures that can contain items
function Container(){
	Structure.call(this);
	this.inventory = {};
}
inherit(Container, Structure);

Container.prototype.serialize = function(){
	var ret = Structure.prototype.serialize.call(this);
	// The inventory is just an object with item name as a key and item count as a value,
	// so it can be converted to JSON without filtering.
	ret.inventory = this.inventory; 
	return ret;
}

Container.prototype.deserialize = function(obj){
	Structure.prototype.deserialize.call(this, obj);
	this.inventory = obj.inventory;
}

/// Print contents of inventory
Container.prototype.desc = function(tile){
	var ret = "Items:<br>";
	for(var i in this.inventory)
		ret += getHTML(generateItemImage(i, true, this.inventory[i]), true);
	return ret;
};

Container.prototype.input = function(o){
	return this.addItem(o);
};

Container.prototype.output = function(dx, dy){
	var firstItem = null;
	for(var i in this.inventory)
		firstItem = i;
	if(!firstItem)
		return false;
	if(newObject(dx, dy, firstItem)){
		if(--this.inventory[firstItem] === 0)
			delete this.inventory[firstItem];
		return true;
	}
	return false;
};

/// Kind of mix-in with player (inventory holder)
Container.prototype.addItem = player.addItem;

Container.prototype.removeItem = player.removeItem;

Container.prototype.inventoryVolume = player.inventoryVolume;

// Default is a capacity at 100 items
Container.prototype.inventoryCapacity = function(){
	return 100;
};

function Chest(){
	Container.call(this);
}
inherit(Chest, Container, {
	name: "Chest",
	symbol: 'C',

	toolDesc: function(){
		return 'Can store 100 items.<br>Use inserters to automatically store/retrieve items.';
	},

	draw: function(tileElem){
		var imgElem = document.createElement('img');
		imgElem.src = 'img/chest.png';
		imgElem.style.left = '0px';
		imgElem.style.top = '0px';
		imgElem.style.position = 'absolute';
		tileElem.appendChild(imgElem);
	},
});

/// A mixin class for adding common methods for all fuel-burning machines, not necessarily in a derived relationship.
function Burner(){
	;
}

Burner.prototype.addFuelAlarm = function(tileElem){
	// Build electricity alarm icon no matter whether electricity is provided or not,
	// because the situation can change afterwards (and we want flickering animation).
	var alarmElem = document.createElement('img');
	alarmElem.src = 'img/fuel-alarm.png';
	alarmElem.style.left = '0px';
	alarmElem.style.top = '0px';
	alarmElem.style.position = 'absolute';
	alarmElem.style.display = 'none';
	tileElem.appendChild(alarmElem);
	this.alarmElem = alarmElem;
}

Burner.prototype.updateFuelAlarm = function(){
	var alarmElem = this.alarmElem;
	if(alarmElem)
		alarmElem.style.display = this.power !== 0 || simstep % 32 < 16 ? 'none' : 'block';
}

// Ore Mine
function OreMine(){
	Container.call(this);
	this.cooldown = 0;
	this.recipe = null;
	this.power = 0;
	this.maxPower = 0;
}
inherit(OreMine, Container, {
	name: "Ore Mine",
	symbol: ["&lt;<br>Mi", "^<br>Mi", "&gt;<br>Mi", "V<br>Mi"],

	serialize: function(){
		var ret = Container.prototype.serialize.call(this);
		ret.cooldown = this.cooldown;
		ret.recipe = this.recipe; // A bit cheaty that you can rewrite save file to get any recipe you want
		ret.power = this.power;
		ret.maxPower = this.maxPower;
		return ret;
	},

	deserialize: function(obj){
		Container.prototype.deserialize.call(this, obj);
		this.cooldown = obj.cooldown;
		this.recipe = obj.recipe;
		this.power = obj.power;
		this.maxPower = obj.maxPower;
	},

	toolDesc: function(){
		return 'Mines ores and puts them to adjacent ground<br>or a structure in the direction indicated by an arrow.<br>Requires coal ores to operate.';
	},

	draw: function(tileElem, isToolBar){
		var imgElem = document.createElement('img');
		imgElem.src = 'img/mine.png';
		imgElem.style.left = '0px';
		imgElem.style.top = '0px';
		imgElem.style.position = 'absolute';
		tileElem.appendChild(imgElem);
		var directionElem = document.createElement('img');
		directionElem.src = 'img/direction.png';
		directionElem.style.transform = 'rotate(' + (this.rotation * 90) + 'deg)';
		directionElem.style.position = 'relative';
		tileElem.appendChild(directionElem);

		// Alarm icon is not necessary in toolbar icons.
		if(!isToolBar){
			this.addFuelAlarm(tileElem);
		}
	},

	desc: function(tile){
		var ret = ""
		// Progress bar
		if(this.recipe){
			ret += "Progress: " + ((this.recipe.time - this.cooldown) / this.recipe.time * 100).toFixed(0) + "%<br>" +
				"<div style='position: relative; width: 100px; height: 10px; background-color: #001f1f; margin: 2px; border: 1px solid #3f3f3f'>" +
				"<div style='position: absolute; width: " + (this.recipe.time - this.cooldown) / this.recipe.time * 100 + "px; height: 10px; background-color: #ff00ff'></div></div>" +
				"Power: <div style='position: relative; width: 100px; height: 10px; background-color: #001f1f; margin: 2px; border: 1px solid #3f3f3f'>" +
				"<div style='position: absolute; width: " + (this.maxPower ? (this.power) / this.maxPower * 100 : 0) + "px; height: 10px; background-color: #ff00ff'></div></div>" +
				"Expected output: " + (tile.ironOre ? tile.ironOre : tile.copperOre ? tile.copperOre : tile.coalOre) + "<br>" +
				getHTML(generateItemImage("time", true, this.recipe.time), true) + "<br>" +
				"Outputs: <br>" +
				getHTML(generateItemImage(this.recipe.output, true, 1), true) + "<br>";
		}
		return ret;
	},

	frameProc: function(){
		this.updateFuelAlarm();

		if(this.recipe === null){
			if(0 < this.tile.ironOre){
				this.recipe = {time: 80, powerCost: 0.1, output: 'Iron Ore'};
				this.cooldown = this.recipe.time;
			}
			else if(0 < this.tile.copperOre){
				this.recipe = { time: 80, powerCost: 0.1, output: 'Copper Ore' };
				this.cooldown = this.recipe.time;
			}
			else if (0 < this.tile.coalOre){
				this.recipe = { time: 80, powerCost: 0.1, output: 'Coal Ore' };
				this.cooldown = this.recipe.time;
			}
		}

		if(this.recipe){
			// First, check if we need to refill the energy buffer in order to continue the current work.
			if("Coal Ore" in this.inventory){
				var coalPower = 100;
				// Refill the energy from the fuel
				if(this.power < this.recipe.powerCost){
					this.power += coalPower;
					this.maxPower = this.power;
					this.removeItem("Coal Ore");
				}
			}

			// Proceed only if we have sufficient energy in the buffer.
			var progress = Math.min(this.power / this.recipe.powerCost, 1);
			if(this.cooldown < progress)
				this.cooldown = 0;
			else{
				this.cooldown -= progress;
				this.power -= progress * this.recipe.powerCost;
			}
		}

		var idx = board.indexOf(this.tile);
		var tx = idx % ysize;
		var ty = Math.floor(idx / ysize);
		var vx = [-1, 0, 1, 0][this.rotation];
		var vy = [0, -1, 0, 1][this.rotation];
		var dx = tx + vx;
		var dy = ty + vy;
		var destTile = board[dx + dy * ysize];

		// Ore mine can output minerals without inserters
		this.output(dx, dy);
	},

	/// Accept only combustible materials
	addItem: function(o){
		if(o.type === 'Coal Ore')
			return Container.prototype.addItem.call(this, o);
		else
			return 0;
	},

	output: function(dx, dy){
		if(0 < this.cooldown || this.recipe === null || this.power < this.recipe.powerCost)
			return false;
		var oreType = this.recipe.output === 'Iron Ore' ? 'ironOre' : this.recipe.output === 'Copper Ore' ? 'copperOre' : 'coalOre';
		var amount = this.tile[oreType];
		if(!amount){
			this.recipe = null;
			return false; // Exhausted
		}
		if(newObject(dx, dy, this.recipe.output)){
			this.cooldown = this.recipe.time;
			this.tile[oreType]--;
			return true;
		}
		else
			return false;
	},

	inventoryCapacity: function(){
		return 1;
	}
}, Burner.prototype);

// The base class for all factory classes, which produces something
// out from ingredients
function Factory(){
	Container.call(this);
	this.cooldown = 0;
	this.consumeCooldown = 0;
	this.recipe = null;
	this.processing = false;
	this.power = 0;
	this.maxPower = 0;
}
inherit(Factory, Container, {
	serialize: function(){
		var ret = Container.prototype.serialize.call(this);
		ret.coodown = this.cooldown;
		ret.consumeCooldown = this.consumeCooldown;
		ret.recipe = this.recipe; // A bit cheaty that you can rewrite save file to get any recipe you want
		ret.processing = this.processing;
		ret.power = this.power;
		ret.maxPower = this.maxPower;
		return ret;
	},

	deserialize: function(obj){
		Container.prototype.deserialize.call(this, obj);
		this.cooldown = obj.cooldown;
		this.consumeCooldown = obj.consumeCooldown;
		this.recipe = obj.recipe;
		this.processing = obj.processing;
		this.power = obj.power;
		this.maxPower = obj.maxPower;
	},

	desc: function(tile){
		var ret;
		var powerStr = this.isBurner() && this.power !== undefined ? "Power: <div style='position: relative; width: 100px; height: 10px; background-color: #001f1f; margin: 2px; border: 1px solid #3f3f3f'>" +
				"<div style='position: absolute; width: " + (this.maxPower ? (this.power) / this.maxPower * 100 : 0) + "px; height: 10px; background-color: #ff00ff'></div></div>" : "";
		if(!this.recipe){
			ret = "<div style='position: relative; width: 100px; height: 10px; background-color: #001f1f; margin: 2px; border: 1px solid #3f3f3f'></div>";
			ret += powerStr;
			ret += "Recipe:<br>&nbsp;None<br>";
		}
		else{
			// Progress bar
			ret = "<div style='position: relative; width: 100px; height: 10px; background-color: #001f1f; margin: 2px; border: 1px solid #3f3f3f'>" +
				"<div style='position: absolute; width: " + (this.recipe.time - this.cooldown) / this.recipe.time * 100 + "px; height: 10px; background-color: #00ffff'></div></div>";
			ret += powerStr;
			ret += "Recipe: " + recipeDraw(this.recipe);
		}

		return ret + Container.prototype.desc.call(this);
	},

	frameProc: function(tile){
		if(this.recipe){
			// If the recipe requires power to process..
			if(this.isBurner() && this.recipe.powerCost){
				// First, check if we need to refill the energy buffer in order to continue the current work.
				if("Coal Ore" in this.inventory){
					var coalPower = 100;
					// Refill the energy from the fuel
					if(this.power < this.recipe.powerCost){
						this.power += coalPower;
						this.maxPower = this.power;
						this.removeItem("Coal Ore");
					}
				}
			}

			if(this.processing){
				// Proceed only if we have sufficient energy in the buffer.
				var progress = this.isBurner() && this.power !== undefined && this.recipe.powerCost !== undefined ?
					Math.min(this.power / this.recipe.powerCost, 1) : 1;

				if(this.progressCallback)
					progress = this.progressCallback(progress);

				if(this.cooldown < progress){
					this.processing = false;
					this.cooldown = 0;
					for(var k in this.recipe.output){
						this.inventory[k] = (this.inventory[k] || 0) + this.recipe.output[k];
						if(inventoryTarget === this && inventoryElem.style.display !== 'none')
							updateInventory();
					}
				}
				else if(0 < progress){
					this.cooldown -= progress;
					if(this.power !== undefined && this.recipe.powerCost !== undefined)
						this.power -= progress * this.recipe.powerCost;
				}
			}
			else{
				var good = true;
				for(var k in this.recipe.input){
					if(this.inventory[k] && this.recipe.input[k] <= this.inventory[k])
						;
					else{
						good = false;
						break;
					}
				}

				if(good){
					for(var k in this.recipe.input){
						this.inventory[k] -= this.recipe.input[k];
						if(this.inventory[k] === 0)
							delete this.inventory[k];
					}
					this.processing = true;
					this.cooldown = this.recipe.time;
				}
				return true;
			}
		}
	},

	input: function(o){
		if(this.isBurner() && o.type === "Coal Ore" && !this.inventory["Coal Ore"])
			return Container.prototype.input.call(this, o);
		if(!this.recipe)
			return false;
		if(!(o.type in this.recipe.input))
			return false;
		if(0 < this.cooldown)
			return false;
		return Container.prototype.input.call(this, o);
	},

	output: function(dx, dy){
		for(var k in this.inventory){
			if(this.recipe && this.recipe.input[k])
				continue;
			if(this.isBurner() && k === "Coal Ore") // Do not spit fuel if this factory needs one
				continue;
			if(newObject(dx, dy, k)){
				if(--this.inventory[k] === 0)
					delete this.inventory[k];
				return true;
			}
		}
		return false;
	},

	/// Burner factories consume combustible materials to gain power to process the recipe.
	isBurner: function(){return false;}
});

// Furnace
function Furnace(){
	Factory.call(this);
}
inherit(Furnace, Factory, {
	name: "Furnace",
	symbol: 'F',

	toolDesc: function(){
		return 'Smelts metal ores into metal bars.<br>Requires coal ores to operate.';
	},

	frameProc: function(tile){
		this.updateFuelAlarm();
		// Clear inactive recipe
		if(this.recipe && this.processing === false && (function(){
			for(var i in this.recipe.input)
				if(!this.inventory[i])
					return true;
			return false;
		}).call(this))
			this.recipe = null;
		var ret = Factory.prototype.frameProc.call(this, tile);
		if(this.recipe && this.processing && 0 < this.power)
			this.elem.style.backgroundPositionX = ((Math.floor(simstep / 2) % 2 + 1) * 32) + 'px';
		else
			this.elem.style.backgroundPositionX = '0px';
		return ret;
	},

	input: function(o){
		if(o.type === 'Iron Ore')
			this.recipe = {
				input: {'Iron Ore': 1},
				output: {'Iron Plate': 1},
				powerCost: 0.5,
				time: 20,
			};
		else if(o.type === 'Copper Ore')
			this.recipe = {
				input: {'Copper Ore': 1},
				output: {'Copper Plate': 1},
				powerCost: 0.5,
				time: 20,
			};
		return Factory.prototype.input.call(this, o);
	},

	draw: function(tileElem, isToolBar){
		var imgElem = document.createElement('div');
		imgElem.style.backgroundImage = 'url("img/furnace.png")';
		imgElem.style.left = '0px';
		imgElem.style.top = '0px';
		imgElem.style.width = '32px';
		imgElem.style.height = '32px';
		imgElem.style.position = 'absolute';
		tileElem.appendChild(imgElem);
		if(!isToolBar){
			this.addFuelAlarm(tileElem);
		}
		this.elem = imgElem;
	},

	isBurner: function(){return true;}
}, Burner.prototype);

// Assembler
function Assembler(){
	Factory.call(this);
	this.electricity = 0;
	this.maxElectricity = 0.02;
}
inherit(Assembler, Factory, {
	name: "Assembler",
	symbol: 'A',

	serialize: function(){
		var ret = Factory.prototype.serialize.call(this);
		ret.electricity = this.electricity;
		ret.maxElectricity = this.maxElectricity;
		return ret;
	},

	deserialize: function(obj){
		Factory.prototype.deserialize.call(this, obj);
		this.electricity = obj.electricity;
		this.maxElectricity = obj.maxElectricity;
	},

	toolDesc: function(){
		return 'Assembles items from ingredients with recipes.<br>Set a recipe in the inventory GUI to operate.<br>Requires electricity to operate.';
	},

	desc: function(){
		var str = "Electricity: <div style='position: relative; width: 100px; height: 10px; background-color: #001f1f; margin: 2px; border: 1px solid #3f3f3f'>" +
			"<div style='position: absolute; width: " + (this.electricity / this.maxElectricity) * 100 + "px; height: 10px; background-color: #ffff00'></div></div>";
		str += Factory.prototype.desc.call(this);
		return str;
	},

	draw: function(tileElem, isToolBar){
		var imgElem = document.createElement('img');
		imgElem.src = 'img/assembler.png';
		imgElem.style.left = '0px';
		imgElem.style.top = '0px';
		imgElem.style.position = 'absolute';
		tileElem.appendChild(imgElem);

		// Alarm icon is not necessary in toolbar icons.
		if(!isToolBar){
			// Build electricity alarm icon no matter whether electricity is provided or not,
			// because the situation can change afterwards (and we want flickering animation).
			var alarmElem = document.createElement('img');
			alarmElem.src = 'img/electricity-alarm.png';
			alarmElem.style.left = '0px';
			alarmElem.style.top = '0px';
			alarmElem.style.position = 'absolute';
			alarmElem.style.display = 'none';
			tileElem.appendChild(alarmElem);
			this.alarmElem = alarmElem;
		}
	},

	frameProc: function(){
		var alarmElem = this.alarmElem;
		if(alarmElem)
			alarmElem.style.display = this.electricity !== 0 || simstep % 32 < 16 ? 'none' : 'block';
		Factory.prototype.frameProc.call(this);
	},

	progressCallback: function(progress){
		progress = Math.min(progress, this.electricity / this.maxElectricity);
		this.electricity -= progress * this.maxElectricity;
		return progress;
	},

	recipes: function(){
		return [
			{
				input: {'Iron Plate': 1},
				output: {'Gear': 1},
				time: 20,
			},
			{
				input: {'Iron Plate': 1, 'Gear': 1},
				output: {'Transport Belt': 1},
				time: 20,
			},
			{
				input: {'Transport Belt': 2, 'Gear': 2},
				output: {'Splitter': 1},
				time: 40,
			},
			{
				input: {'Iron Plate': 5},
				output: {'Steel Plate': 1},
				time: 30,
			},
			{
				input: {'Iron Plate': 5},
				output: {'Chest': 1},
				time: 60,
			},
			{
				input: {'Iron Plate': 1, 'Gear': 1, 'Circuit': 1},
				output: {'Inserter': 1},
				time: 100,
			},
			{
				input: {'Iron Plate': 10, 'Gear': 5, 'Circuit': 3},
				output: {'Ore Mine': 1},
				time: 100,
			},
			{
				input: {'Copper Plate': 1},
				output: {'Copper Wire': 2},
				time: 20,
			},
			{
				input: {'Iron Plate': 1, 'Copper Wire': 3},
				output: {'Circuit': 1},
				time: 20,
			},
			{
				input: {'Iron Plate': 5, 'Gear': 5, 'Circuit': 3},
				output: {'Assembler': 1},
				time: 120,
			},
			{
				input: {'Iron Plate': 2},
				output: {'Pipe': 1},
				time: 20,
			},
			{
				input: {'Iron Plate': 5, 'Copper Plate': 5},
				output: {'Boiler': 1},
				time: 20,
			},
			{
				input: {'Iron Plate': 5, 'Gear': 5, 'Copper Plate': 5},
				output: {'SteamEngine': 1},
				time: 20,
			},
		]
	},
});

function FluidBox(inputEnable, outputEnable, filter, connectTo){
	this.type = '';
	this.amount = 0;
	this.maxAmount = 10;
	this.inputEnable = inputEnable !== undefined ? inputEnable : true;
	this.outputEnable = outputEnable !== undefined ? outputEnable : true;
	this.connectTo = connectTo || [0,1,2,3];
	this.filter = filter; // permits undefined
}

FluidBox.prototype.serialize = function(){
	return {
		type: this.type,
		amount: this.amount,
		maxAmount: this.maxAmount,
		inputEnable: this.inputEnable,
		outputEnable: this.outputEnable,
		connectTo: this.connectTo,
		filter: this.filter,
	};
}

FluidBox.prototype.deserialize = function(obj){
	this.type = obj.type;
	this.amount = obj.amount;
	this.maxAmount = obj.maxAmount;
	this.inputEnable = obj.inputEnable;
	this.outputEnable = obj.outputEnable;
	this.connectTo = obj.connectTo;
	this.filter = obj.filter;
}

FluidBox.prototype.freeCapacity = function(){
	return this.maxAmount - this.amount;
}

function FluidContainer(){
	Structure.call(this);
	this.fluidBox = [new FluidBox()];
}
inherit(FluidContainer, Structure, {
	serialize: function(){
		var ret = Structure.prototype.serialize.call(this);
		ret.fluidBox = [];
		for(var i = 0; i < this.fluidBox.length; i++){
			var fluidBox = this.fluidBox[i];
			ret.fluidBox.push(fluidBox.serialize());
		}
		return ret;
	},

	deserialize: function(obj){
		Structure.prototype.deserialize.call(this, obj);
		if(obj.fluidBox === undefined)
			return;
		this.fluidBox = [];
		for(var i = 0; i < obj.fluidBox.length; i++){
			var fluidBoxObj = obj.fluidBox[i];
			var fluidBox = new FluidBox();
			fluidBox.deserialize(fluidBoxObj);
			this.fluidBox.push(fluidBox);
		}
	},

	desc: function(tile){
		var ret = '';
		for(var n = 0; n < this.fluidBox.length; n++){
			var fluidBox = this.fluidBox[n];
			ret += (fluidBox.type ? fluidBox.type : "Fluid") + " amount: " + fluidBox.amount.toFixed(1) + "/" + fluidBox.maxAmount.toFixed(1) + '<br>';
		}
		return ret + Structure.prototype.desc.call(this);
	},

	draw: function(tileElem, isToolBar){
		if(!isToolBar){
			// Build fluid amount bar element for contained fluid boxes, which can dynamically change height in frameProc.
			var fluidAmountElem = document.createElement('div');
			fluidAmountElem.style.backgroundColor = '#007f00';
			fluidAmountElem.style.left = '26px';
			fluidAmountElem.style.top = '2px';
			fluidAmountElem.style.width = '4px';
			fluidAmountElem.style.position = 'absolute';
			tileElem.appendChild(fluidAmountElem);
			this.fluidAmountElem = fluidAmountElem;

			// Build fluid flow direction arrow for contained fluid boxes.
			var flowDirectionElem = document.createElement('img');
			flowDirectionElem.src = 'img/flow-direction.png';
			flowDirectionElem.style.left = '8px';
			flowDirectionElem.style.top = '8px';
			flowDirectionElem.style.position = 'relative';
			var showFluidAmount = document.getElementById('showFluidAmount');
			flowDirectionElem.style.display = showFluidAmount.checked ? 'block' : 'none'; // To prevent flickering when unchecked
			tileElem.appendChild(flowDirectionElem);
			this.flowDirectionElem = flowDirectionElem;
		}
	},

	frameProc: function(){
		var idx = board.indexOf(this.tile);
		if(idx < 0)
			return;
		var thisPos = [idx % ysize, Math.floor(idx / ysize)];
		var relDir = [[-1,0], [0,-1], [1,0], [0,1]];
		var biggestFlowIdx = -1;
		var biggestFlowAmount = 1e-3; // At least this amount of flow is required for displaying flow direction
		for(var n = 0; n < this.fluidBox.length; n++){
			var thisFluidBox = this.fluidBox[n];
			// In an unlikely event, a fluid box without either input or output ports has nothing to do
			if(thisFluidBox.amount === 0 || !thisFluidBox.inputEnable && !thisFluidBox.outputEnable)
				continue;
			for(var i = 0; i < thisFluidBox.connectTo.length; i++){
				var thisRelDir = (thisFluidBox.connectTo[i] + this.rotation) % 4;
				var pos = [thisPos[0] + relDir[thisRelDir][0], thisPos[1] + relDir[thisRelDir][1]];
				if(pos[0] < 0 || xsize <= pos[0] || pos[1] < 0 || ysize <= pos[1])
					continue;
				var nextTile = board[pos[0] + pos[1] * ysize];
				if(!nextTile.structure || !(nextTile.structure instanceof FluidContainer))
					continue;
				var nextStruct = nextTile.structure;
				for(var j = 0; j < nextStruct.fluidBox.length; j++){
					var nextFluidBox = nextStruct.fluidBox[j];
					// Different types of fluids won't mix
					if(!nextFluidBox || !(nextFluidBox instanceof FluidBox) ||
						0 < nextFluidBox.amount && nextFluidBox.type !== thisFluidBox.type)
						continue;
					var pressure = nextFluidBox.amount - thisFluidBox.amount;
					var flow = pressure * 0.1;
					// Check input/output valve state
					if(flow < 0 ? !thisFluidBox.outputEnable || !nextFluidBox.inputEnable || nextFluidBox.filter && nextFluidBox.filter !== thisFluidBox.type:
						!thisFluidBox.inputEnable || !nextFluidBox.outputEnable && thisFluidBox.filter !== nextFluidBox.type)
						continue;
					nextFluidBox.amount -= flow;
					thisFluidBox.amount += flow;
					nextFluidBox.type = thisFluidBox.type;
					if(Math.abs(biggestFlowAmount) < Math.abs(flow)){
						biggestFlowAmount = flow;
						biggestFlowIdx = i;
					}
				}
			}
		}
		if(this.fluidAmountElem && 0 < this.fluidBox.length){
			var showFluidAmount = document.getElementById('showFluidAmount');
			if(showFluidAmount && showFluidAmount.checked){
				var barHeight = 26 * this.fluidBox[0].amount / this.fluidBox[0].maxAmount;
				this.fluidAmountElem.style.display = 'block';
				this.fluidAmountElem.style.height = barHeight + 'px';
				this.fluidAmountElem.style.top = (28 - barHeight) + 'px';
				// Change the bar color according to the type of the fluid.
				this.fluidAmountElem.style.backgroundColor = this.fluidBox[0].type === 'Water' ? '#007f7f' : '#7f7f7f';

				if(0 <= biggestFlowIdx){
					var rotation = biggestFlowIdx;
					// Invert the direction of the arrow if the flow goes outward
					if(0 < biggestFlowAmount)
						rotation = (rotation + 2) % 4;
					var scale = 1;
					if(Math.abs(biggestFlowAmount) < 0.01)
						scale = 0.5;
					else if(Math.abs(biggestFlowAmount) < 0.1)
						scale = 0.75;
					this.flowDirectionElem.style.display = 'block';
					this.flowDirectionElem.style.transform = 'scale(' + scale + ',' + scale
					 + ') rotate(' + (rotation * 90) + 'deg)';
				}
				else
					this.flowDirectionElem.style.display = 'none';
			}
			else{
				this.fluidAmountElem.style.display = 'none';
				this.flowDirectionElem.style.display = 'none';
			}
		}
	},

	connection: function(){
		function hasFluidBox(x,y){
			if(x < 0 || xsize <= x || y < 0 || ysize <= y)
				return null;
			var tile = tileAt(x, y);
			if(tile.structure && tile.structure.fluidBox)
				return tile.structure;
			return null;
		}

		// Fluid containers connect to other containers
		var xy = coordOfTile(this.tile);
		if(!xy)
			return 0;
		var x = xy[0];
		var y = xy[1];
		var l = !!hasFluidBox(x - 1, y);
		var t = !!hasFluidBox(x, y - 1);
		var r = !!hasFluidBox(x + 1, y);
		var b = !!hasFluidBox(x, y + 1);
		return l | (t << 1) | (r << 2) | (b << 3);
	},

})

function WaterWell(){
	FluidContainer.call(this);
}
inherit(WaterWell, FluidContainer, {
	name: "Water Well",
	symbol: 'W',

	toolDesc: function(){
		return 'Pumps underground water at a fixed rate of 0.01 units per tick.';
	},

	draw: function(tileElem, isToolBar){
		var imgElem = document.createElement('img');
		imgElem.src = 'img/waterwell.png';
		imgElem.style.left = '0px';
		imgElem.style.top = '0px';
		imgElem.style.position = 'absolute';
		tileElem.appendChild(imgElem);
		FluidContainer.prototype.draw.call(this, tileElem, isToolBar);
	},

	frameProc: function(){
		var delta = 0.01;
		// If the well has fluid other than water, clear it
		if(this.fluidBox[0].type !== 'Water'){
			this.fluidBox[0].type = 'Water';
			this.fluidBox[0].amount = 0;
		}
		this.fluidBox[0].amount = Math.min(this.fluidBox[0].maxAmount, this.fluidBox[0].amount + 0.1);
		FluidContainer.prototype.frameProc.call(this);
	}
})

function Boiler(){
	FluidContainer.call(this);
	this.fluidBox = [
		new FluidBox(true, false, "Water"),
		new FluidBox(false, true)  // Additional fluid box for steam output
	];
	this.inventory = {};
	this.power = 0;
	this.maxPower = 0;
}
inherit(Boiler, FluidContainer, {
	name: "Boiler",
	symbol: 'B',
}, Burner.prototype)
mixin(Boiler.prototype, Factory.prototype);

Boiler.prototype.serialize = function(){
	return mixin(FluidContainer.prototype.serialize.call(this),
		Factory.prototype.serialize.call(this));
}

Boiler.prototype.deserialize = function(obj){
	FluidContainer.prototype.deserialize.call(this, obj);
	Factory.prototype.deserialize.call(this, obj);
}

Boiler.prototype.toolDesc = function(){
	return 'Burns coal ores and use the generated heat to convert water into steam.';
}

Boiler.prototype.desc = function(){
	var str = FluidContainer.prototype.desc.call(this);
	str += '<br>' + Factory.prototype.desc.call(this);
	return str;
}

Boiler.prototype.draw = function(tileElem, isToolBar){
	var imgElem = document.createElement('div');
	imgElem.style.backgroundImage = 'url(img/boiler.png)';
	imgElem.style.left = '0px';
	imgElem.style.top = '0px';
	imgElem.style.width = '32px';
	imgElem.style.height = '32px';
	imgElem.style.position = 'absolute';
	tileElem.appendChild(imgElem);
	if(!isToolBar){
		this.addFuelAlarm(tileElem);
	}
	this.elem = imgElem;
	FluidContainer.prototype.draw.call(this, tileElem, isToolBar);
};

Boiler.prototype.frameProc = function(tile){
	this.updateFuelAlarm();
	this.recipe = {
		input: {},
		output: {},
		powerCost: 0.1,
		time: 20,
	};
	FluidContainer.prototype.frameProc.call(this, tile);
	var ret = Factory.prototype.frameProc.call(this, tile);
	if(this.recipe && this.processing && 0 < this.power)
		this.elem.style.backgroundPositionX = ((Math.floor(simstep / 2) % 2 + 1) * 32) + 'px';
	else
		this.elem.style.backgroundPositionX = '0px';
	return ret;
}

Boiler.prototype.isBurner = function(){return true;}

Boiler.prototype.inventoryCapacity = function(){
	return 1;
}

Boiler.prototype.progressCallback = function(progress){
	var fluidPerProgess = 0.1;
	progress = Math.min(this.fluidBox[1].freeCapacity() / fluidPerProgess, Math.min(this.fluidBox[0].amount / fluidPerProgess, progress));
	this.fluidBox[0].amount -= progress * fluidPerProgess;
	this.fluidBox[1].type = "Steam";
	this.fluidBox[1].amount += progress * fluidPerProgess;
	return progress;
}

// FluidContainer.connection is overridden by Structure.connection, which we do not want to happen.
Boiler.prototype.connection = FluidContainer.prototype.connection;

function Pipe(){
	FluidContainer.call(this);
}
inherit(Pipe, FluidContainer, {
	name: "Pipe",
	symbol: 'B',

	toolDesc: function(){
		return 'Conveys fluid such as water or steam.';
	},

	draw: function(tileElem, isToolBar){
		var imgElem = document.createElement('div');
		imgElem.style.backgroundImage = 'url(img/pipe.png)';
		if(this.tile){
			var value = this.connection();
			imgElem.style.backgroundPosition = -(value % 4 * 32) + 'px ' + -(Math.floor(value / 4) * 32) + 'px';
		}
		else
			imgElem.style.backgroundPosition = '96px 96px';
		// imgElem.style.transform = 'rotate(' + (this.rotation * 90 + 180) + 'deg)';
		imgElem.style.left = '0px';
		imgElem.style.top = '0px';
		imgElem.style.width = '32px';
		imgElem.style.height = '32px';
		imgElem.style.position = 'absolute';
		tileElem.appendChild(imgElem);
		FluidContainer.prototype.draw.call(this, tileElem, isToolBar);
	},

	frameProc: function(){
		FluidContainer.prototype.frameProc.call(this);
	}
})

function SteamEngine(){
	FluidContainer.call(this);
	this.power = 0;
	this.maxPower = 10;
	this.fluidBox[0].filter = 'Steam';
}
inherit(SteamEngine, FluidContainer, {
	name: "SteamEngine",
	symbol: 'E',

	serialize: function(){
		var ret = FluidContainer.prototype.serialize.call(this);
		ret.power = this.power;
		ret.maxPower = this.maxPower;
		return ret;
	},

	deserialize: function(obj){
		FluidContainer.prototype.deserialize.call(this, obj);
		this.power = obj.power;
		this.maxPower = obj.maxPower;
	},

	toolDesc: function(){
		return 'Consumes steam and transmits electricity within a range of 3 tiles.';
	},

	desc: function(){
		var str = FluidContainer.prototype.desc.call(this);
		var powerStr = "Power: <div style='position: relative; width: 100px; height: 10px; background-color: #001f1f; margin: 2px; border: 1px solid #3f3f3f'>" +
				"<div style='position: absolute; width: " + (this.maxPower ? (this.power) / this.maxPower * 100 : 0) + "px; height: 10px; background-color: #ff00ff'></div></div>";
		return str + powerStr;
	},

	draw: function(tileElem, isToolBar){
		var imgElem = document.createElement('img');
		imgElem.src = 'img/steam-engine.png';
		imgElem.style.left = '0px';
		imgElem.style.top = '0px';
		imgElem.style.position = 'absolute';
		tileElem.appendChild(imgElem);
		FluidContainer.prototype.draw.call(this, tileElem, isToolBar);
	},

	frameProc: function(tile){
		FluidContainer.prototype.frameProc.call(this, tile);
		if(this.fluidBox[0].type === 'Steam' && 0 < this.fluidBox[0].amount){
			var spendingSpeed = 0.1;
			var powerPerSteam = 1.;
			var spent = Math.min(this.fluidBox[0].amount, Math.min((this.maxPower - this.power) / powerPerSteam, spendingSpeed));
			this.power += spent * powerPerSteam;
			this.fluidBox[0].amount -= spent;
		}

		// If this engine has power in the buffer (capacitor)
		if(0 < this.power){
			var pdrange = 3; // Power distribution range

			var idx = board.indexOf(this.tile);
			if(idx < 0)
				return;
			var thisPos = [idx % ysize, Math.floor(idx / ysize)];

			for(var y = Math.max(0, thisPos[1] - pdrange); y <= Math.min(ysize-1, thisPos[1] + pdrange); y++)
			for(var x = Math.max(0, thisPos[0] - pdrange); x <= Math.min(xsize-1, thisPos[0] + pdrange); x++){
				var tile = tileAt(x, y);
				if(tile.structure && tile.structure.maxElectricity){
					var distributed = Math.min(this.maxPower, tile.structure.maxElectricity - tile.structure.electricity);
					tile.structure.electricity += distributed;
					this.power -= distributed;
				}
			}
		}
	},
})

var toolDefs = [
	TransportBelt,
	Inserter,
	Splitter,
	Chest,
	OreMine,
	Furnace,
	Assembler,
	WaterWell,
	Boiler,
	Pipe,
	SteamEngine,
];

/// A reverse map that can look up structure constructor from its type name.
var structureMap = {};
for(var i in toolDefs){
	structureMap[toolDefs[i].prototype.name] = toolDefs[i];
}

var currentTool = -1;
var currentRotation = 0;

var objects = [];

function coordOfTile(tile){
	var idx = board.indexOf(tile);
	if(0 <= idx)
		return [ idx % ysize, Math.floor(idx / ysize)];
	else
		return null;
}

function tileAt(x, y){
	if(x instanceof Array){
		y = x[1];
		x = x[0];
	}
	return board[x + y * xsize];
}


function iterateTiles(func){
	for(var iy = 0; iy < ysize; iy++){
		for(var ix = 0; ix < ysize; ix++){
			func(ix, iy);
		}
	}
}

function rotate(){
	if(0 <= currentTool){
		currentRotation = (currentRotation + 1) % 4;
		for(var i = 0; i < toolDefs.length; i++){
			toolDefs[i].prototype.rotation = currentRotation;
			updateTool(i);
		}
		updateCursorGhost();
	}
	else if(selectedCoords !== null){
		var tile = board[selectedCoords[0] + selectedCoords[1] * ysize];
		if(tile.structure){
			tile.structure.rotate();
		}
	}
}

/// Searches through all dropped items matching position sx and sy in
/// the world and check with proc functon passed by the caller.
/// if proc returns nonzero, the item is considered consumed and
/// disappear from the ground.
function findItem(sx, sy, proc, single){
	for(var j = 0; j < objects.length;){
		var o = objects[j];
		var otx = Math.floor(o.x / tilesize);
		var oty = Math.floor(o.y / tilesize);
		if(otx === sx && oty === sy && proc(o)){
			table.removeChild(o.elem);
			objects.splice(j, 1);
			if(single)
				return;
		}
		else{
			// If we happend to successfully find the object and remove
			// it from object list, incrementing j would skip one extra item.
			j++;
		}
	}
}

function recipeDraw(recipe, onclick){
	var ret = "";
	ret += "<div class='recipe-box'"
		+ (onclick ? " onclick='" + onclick + "'" : "") + ">";
	ret += "<span style='display: inline-block; margin: 1px'>" +
		getHTML(generateItemImage("time", true, recipe.time), true) + "</span>";
	ret += "<span style='display: inline-block; width: 50%'>";
	for(var k in recipe.input)
		ret += getHTML(generateItemImage(k, true, recipe.input[k]), true);
	ret += "</span><img src='img/rightarrow.png' style='width: 20px; height: 32px'><span style='display: inline-block; width: 10%'>";
	for(var k in recipe.output)
		ret += getHTML(generateItemImage(k, true, recipe.output[k]), true);
	ret += "</span></div>";
	return ret;
}

/// Convert a HTML element to string.
/// If deep === true, descendants are serialized, too.
function getHTML(who, deep){
	var div = document.createElement('div');
	div.appendChild(who.cloneNode(false));
	var txt = div.innerHTML;
	if(deep){
		var ax = txt.indexOf('>')+1;
		txt= txt.substring(0, ax)+who.innerHTML+ txt.substring(ax);
	}
	return txt;
}

function recipeSelectClick(i){
	if(!recipeTarget)
		return;
	var recipes = recipeTarget.recipes();
	recipeTarget.recipe = recipes[i];
	recipeTarget.cooldown = 0;
	recipeTarget.processing = false;
	var recipeSelector = document.getElementById('recipeSelector');
	recipeSelector.style.display = "none";
}
this.recipeSelectClick = recipeSelectClick;

function showInventory(tile){
	var inventoryContent = document.getElementById('inventoryContent');
	if(inventoryElem.style.display !== "none"){
		inventoryElem.style.display = "none";
		return;
	}
	else if(tile.structure && tile.structure.inventory){
		inventoryElem.style.display = "block";
		bringToTop(inventoryElem);
		inventoryTarget = tile.structure;
		var recipeSelectButtonElem = document.getElementById('recipeSelectButton');
		recipeSelectButtonElem.style.display = !inventoryTarget.recipes ? "none" : "block";
		toolTip.style.display = "none"; // Hide the tool tip for "Click to oepn inventory"
		updateInventory();
	}
	else{
		inventoryContent.innerHTML = "";
	}
}

function hideInventory(){
	var inventory = document.getElementById('inventory');
	inventory.style.display = "none";
}
this.hideInventory = hideInventory;

function showRecipeSelect(tile){
	var recipeSelector = document.getElementById('recipeSelector');
	var recipeSelectorContent = document.getElementById('recipeSelectorContent');
	if(recipeSelector.style.display !== "none"){
		recipeSelector.style.display = "none";
		return;
	}
	else if(tile.structure && tile.structure.recipes){
		recipeSelector.style.display = "block";
		bringToTop(recipeSelector);
		recipeTarget = tile.structure;
		var text = "";
		var recipes = tile.structure.recipes();
		for(var i = 0; i < recipes.length; i++)
			text += recipeDraw(recipes[i], "Conveyor.recipeSelectClick(" + i + ")");
		recipeSelectorContent.innerHTML = text;
	}
	else{
		recipeTarget = null;
		recipeSelectorContent.innerHTML = "No recipes available";
	}
}

function hideRecipeSelect(){
	var recipeSelector = document.getElementById('recipeSelector');
	recipeSelector.style.display = "none";
}
this.hideRecipeSelect = hideRecipeSelect;

function onKeyDown(event){
	// "R" key rotates the tile
	if(event.keyCode === 82){
		rotate();
	}
	else if(event.keyCode === 37){ // Left arrow
		if(0 < scrollPos[0]){
			scrollPos[0]--;
			updateAllTiles();
		}
	}
	else if(event.keyCode === 38){ // Up arrow
		if(0 < scrollPos[1]){
			scrollPos[1]--;
			updateAllTiles();
		}
	}
	else if(event.keyCode === 39){ // Right arrow
		if(scrollPos[0] + 1 < xsize - viewPortWidth){
			scrollPos[0]++;
			updateAllTiles();
		}
	}
	else if(event.keyCode === 40){ // Down arrow
		if(scrollPos[1] + 1 < ysize - viewPortHeight){
			scrollPos[1]++;
			updateAllTiles();
		}
	}
}

/// An array of window elements which holds order of z indices.
var windowOrder = [];

/// Bring a window to the top on the other windows.
function bringToTop(elem){
	var oldIdx = windowOrder.indexOf(elem);
	if(0 <= oldIdx && oldIdx < windowOrder.length - 1){
		windowOrder.splice(oldIdx, 1);
		windowOrder.push(elem);
		for(var i = 0; i < windowOrder.length; i++)
			windowOrder[i].style.zIndex = i + windowZIndex;
	}
	var mousecaptorElem = document.getElementById('mousecaptor');
	mousecaptorElem.style.zIndex = i + windowZIndex; // The mouse capture element comes on top of all other windows
}

var toolTip;

window.addEventListener("load", function(){
	window.addEventListener( 'keydown', onKeyDown, false );

	// Set element style to initialize invisible element.
	// CSS value won't be returned by JavaScript property access, so we
	// need to write the initial value from the code.
	var recipeSelector = document.getElementById('recipeSelector');
	recipeSelector.style.display = "none";

	toolTip = document.createElement('dim');
	toolTip.setAttribute('id', 'tooltip');
	toolTip.setAttribute('class', 'noselect');
	toolTip.innerHTML = 'hello there';
	toolTip.style.zIndex = tooltipZIndex; // Usually comes on top of all the other elements
	toolTip.style.display = 'none'; // Initially invisible
	var containerElem = document.getElementById('container');
	containerElem.appendChild(toolTip);

	viewPortWidth = 16;
	viewPortHeight = 12;

	if(typeof(Storage) !== "undefined"){
		deserialize(localStorage.getItem("FactorishJSGameSave"));
	}
	else{
		generateBoard();
	}

	// Shared event handler for window headers
	function dragWindowMouseDown(evt,elem,pos){
		pos = [evt.screenX, evt.screenY];
		bringToTop(elem);
		var mousecaptorElem = document.getElementById('mousecaptor');
		mousecaptorElem.style.display = 'block';

		// Dragging moves windows
		function mousemove(evt){
			if(!pos)
				return;
			var containerElem = document.getElementById('container');
			var cr = containerElem.getBoundingClientRect();
			var rel = [evt.screenX - pos[0], evt.screenY - pos[1]];
			pos = [evt.screenX, evt.screenY];
			var r = elem.getBoundingClientRect();
			var left = elem.style.left !== '' ? parseInt(elem.style.left) : (cr.left + cr.right) / 2;
			var top = elem.style.top !== '' ? parseInt(elem.style.top) : (cr.top + cr.bottom) / 2;
			elem.style.left = (left + rel[0]) + 'px';
			elem.style.top = (top + rel[1]) + 'px';
		}
		
		mousecaptorElem.addEventListener('mousemove', mousemove);
		mousecaptorElem.addEventListener('mouseup', function(evt){
			// Stop dragging a window
			elem = null;
			this.removeEventListener('mousemove', mousemove);
			this.style.display = 'none';
		});
	}

	// Place a window element at the center of the container, assumes the windows have margin set in the middle.
	function placeCenter(elem){
		var containerElem = document.getElementById('container');
		var cr = containerElem.getBoundingClientRect();
		elem.style.left = ((cr.left + cr.right) / 2) + 'px';
		elem.style.top = ((cr.top + cr.bottom) / 2) + 'px';
	}

	var inventoryDragStart = null;

	var inventoryTitleElem = document.getElementById('inventoryTitle');

	placeCenter(inventoryElem);
	windowOrder.push(inventoryElem);

	inventoryTitleElem.addEventListener('mousedown', function(evt){
		dragWindowMouseDown(evt, inventoryElem, inventoryDragStart);
	});

	var recipeSelectorDragStart = null;

	var recipeSelectorTitle = document.getElementById('recipeSelectorTitle');
	var recipeSelector = document.getElementById('recipeSelector');
	if(recipeSelectorTitle && recipeSelector){
		placeCenter(recipeSelector);
		windowOrder.push(recipeSelector);
		recipeSelectorTitle.addEventListener('mousedown', function(evt){
			dragWindowMouseDown(evt, recipeSelector, recipeSelectorDragStart);
		})
	}

	// Set animation update function
	window.setInterval(function(){
		run();
	}, 50);
})

window.addEventListener('resize', onSize);

function getTileElem(x, y){
	return tileElems[x + y * viewPortWidth];
}

/// Update single tile graphics to match internal data
function updateTile(tile){
	var idx = board.indexOf(tile);
	var c = idx % ysize - scrollPos[0];
	var r = Math.floor(idx / ysize) - scrollPos[1];
	var tileElem = getTileElem(c, r);
	if(!tileElem)
		return;
	tileElem.style.backgroundImage = 'url("img/dirt.png")';
	tileElem.style.transform = '';
	tileElem.style.backgroundColor = 'rgb(' + (255 - tile.ironOre * 255 / 100).toFixed() + ',' +
		(255 - tile.ironOre * 255 / 100 / 2).toFixed() + ',255)';
	// Remove the children first, because old nodes may be present
	while(tileElem.firstChild)
		tileElem.removeChild(tileElem.firstChild);
	if(tile.ironOre){
		var oreElem = document.createElement('div');
		oreElem.style.backgroundImage = 'url("img/iron.png")';
		oreElem.style.backgroundPosition = '-' + Math.min(3, Math.floor(tile.ironOre / 100)) * 32 + 'px 0';
		oreElem.style.position = 'absolute';
		oreElem.style.width = tilesize + 'px';
		oreElem.style.height = tilesize + 'px';
		tileElem.appendChild(oreElem);
	}
	else if(tile.copperOre){
		var oreElem = document.createElement('div');
		oreElem.style.backgroundImage = 'url("img/copper.png")';
		oreElem.style.backgroundPosition = '-' + Math.min(3, Math.floor(tile.copperOre / 100)) * 32 + 'px 0';
		oreElem.style.position = 'absolute';
		oreElem.style.width = tilesize + 'px';
		oreElem.style.height = tilesize + 'px';
		tileElem.appendChild(oreElem);
	}
	else if (tile.coalOre) {
		var oreElem = document.createElement('div');
		oreElem.style.backgroundImage = 'url("img/coal.png")';
		oreElem.style.backgroundPosition = '-' + Math.min(3, Math.floor(tile.coalOre / 100)) * 32 + 'px 0';
		oreElem.style.position = 'absolute';
		oreElem.style.width = tilesize + 'px';
		oreElem.style.height = tilesize + 'px';
		tileElem.appendChild(oreElem);
	}

	// The only child of tile element is the tile text.
	if(tile.structure === null)
		/*tileElem.innerHTML = ""*/;
	else{
		tile.structure.draw(tileElem, false);
	}
}

function updateAllTiles(){
	for(var iy = 0; iy < viewPortHeight; iy++){
		for(var ix = 0; ix < viewPortWidth; ix++)
			updateTile(board[(ix + scrollPos[0]) + (iy + scrollPos[1]) * ysize]);
	}
	for(var i = 0; i < objects.length; i++)
		positionObject(objects[i]);
	updateMiniMapPos();
}

function updateMiniMapPos(){
	miniMapCursorElem.style.left = (scrollPos[0] * miniMapSize / xsize) + 'px';
	miniMapCursorElem.style.top = (scrollPos[1] * miniMapSize / ysize) + 'px';
}

function updateTool(tool){
	if(0 <= tool && tool < toolElems.length){
		// Remove the children first, because old nodes may be present
		while(toolElems[tool].firstChild)
			toolElems[tool].removeChild(toolElems[tool].firstChild);
		toolDefs[tool].prototype.draw.call(toolDefs[tool].prototype, toolElems[tool], true);
	}
}

function harvest(tile){
	if(tile.structure){
		if(tile.structure.miniMapSymbol){
			miniMapElem.removeChild(tile.structure.miniMapSymbol);
			tile.structure.miniMapSymbol = null;
		}
		if(tile.structure.inventory){
			for(var i in tile.structure.inventory){
				var v = tile.structure.inventory[i];
				if(i in player.inventory)
					player.inventory[i] += v;
				else
					player.inventory[i] = v;
			}
		}
		if(tile.structure.name in player.inventory)
			player.inventory[tile.structure.name]++;
		else
			player.inventory[tile.structure.name] = 1;
		tile.structure = null;
		updatePlayer();
	}
	else{
		var idx = board.indexOf(tile);
		var x = idx % ysize;
		var y = Math.floor(idx / ysize);
		findItem(x, y, function(o){
			if(o.type in player.inventory)
				player.inventory[o.type] += 1;
			else
				player.inventory[o.type] = 1;
			updatePlayer();
			return true;
		});
	}
}

/// Add a structure symbol (blue square) on the minimap at the top right with
/// coordinates (c, r)
function addMinimapSymbol(c, r, tile){
	var symbol = tile.structure.miniMapSymbol = document.createElement('div');
	symbol.style.backgroundColor = '#0000ff';
	symbol.style.width = Math.ceil(miniMapSize / xsize) + 'px';
	symbol.style.height = Math.ceil(miniMapSize / ysize) + 'px';
	symbol.style.left = Math.floor(c * miniMapSize / xsize) + 'px';
	symbol.style.top = Math.floor(r * miniMapSize / ysize) + 'px';
	symbol.style.position = 'absolute';
	miniMapElem.appendChild(symbol);
}

function updateCursorGhost(){
	if(!cursorGhostElem)
		return;
	// Remove the previous content first
	while(cursorGhostElem.firstChild)
		cursorGhostElem.removeChild(cursorGhostElem.firstChild);
	if(0 <= currentTool)
		toolDefs[currentTool].prototype.draw.call(toolDefs[currentTool].prototype, cursorGhostElem, true);
}

function createElements(){
	// First, change the width of the body element to fit everything in the game inside it.
	var body = document.getElementsByTagName("body")[0];
	body.style.width = (tableMargin + viewPortWidth * tilesize + tableMargin + miniMapSize + tableMargin) + 'px';

	tileElems = new Array(viewPortWidth * viewPortHeight);

	// The containers are nested so that the inner container can be easily
	// discarded to recreate the whole game.
	var outerContainer = document.getElementById("container");
	if(container)
		outerContainer.removeChild(container);
	container = document.createElement("div");
	outerContainer.appendChild(container);
	if(toolCursorElem)
		toolCursorElem = null;

	table = document.createElement("div");
	table.style.borderStyle = 'solid';
	table.style.borderWidth = '1px';
	table.style.borderColor = 'red';
	table.style.position = 'relative';
	table.style.left = '50%';
	table.style.width = (viewPortWidth * tilesize) + 'px';
	table.style.height = (viewPortHeight * tilesize) + 'px';

	// Tile cursor
	cursorElem = document.createElement('div');
	cursorElem.style.border = '2px blue solid';
	cursorElem.style.pointerEvents = 'none';
	cursorElem.style.display = 'none';
	cursorElem.style.zIndex = cursorZIndex;
	table.appendChild(cursorElem);
	// Cursor ghost is a container for a preview of which structure will be built.
	cursorGhostElem = document.createElement('div');
	cursorGhostElem.style.opacity = 0.5;
	cursorElem.appendChild(cursorGhostElem);

	messageElem = document.createElement('div');
	container.appendChild(messageElem);
	messageElem.style.fontFamily = 'Sans-serif';
	messageElem.style.fontSize = '20pt';
	messageElem.style.position = 'relative';
	messageElem.style.color = 'red';

	container.appendChild(table);
	for(var iy = 0; iy < viewPortHeight; iy++){
		for(var ix = 0; ix < viewPortWidth; ix++){
			var tileElem = document.createElement("div");
			tileElems[ix + iy * viewPortWidth] = tileElem;
			tileElem.innerHTML = "";
			tileElem.style.width = '32px';
			tileElem.style.height = '32px';
			tileElem.style.position = 'absolute';
			tileElem.style.top = (tilesize * iy) + 'px';
			tileElem.style.left = (tilesize * ix) + 'px';
			tileElem.onmousedown = function(e){
				var idx = tileElems.indexOf(this);
				var c = idx % viewPortWidth + scrollPos[0];
				var r = Math.floor(idx / viewPortWidth) + scrollPos[1];
				var tile = board[c + r * ysize];
				var connection = tile.structure ? tile.structure.connection() : 0;

				if(e.button !== 0){
					harvest(tile);
				}
				else if(0 <= currentTool && currentTool < toolDefs.length){
					var tool = toolDefs[currentTool];

					// Prevent resetting structure's progress and inventory if
					// the user clicks on a structure with the same tool type.
					// But update the rotation.
					if(tile.structure && tool.prototype.name === tile.structure.name){
						tile.structure.rotation = currentRotation;
						updateTile(tile);
						return;
					}

					if(!(tool.prototype.name in player.inventory) || !player.inventory[tool.prototype.name])
						return;
					harvest(tile);
					// The tile and the structure built on it should be different
					// object, because it would force us to recreate and replace existing tile object
					// everytime structure is built on it.
					tile.structure = new tool;
					tile.structure.tile = board[c + r * ysize];
					tile.structure.rotation = currentRotation;
					addMinimapSymbol(c, r, tile);
					if(--player.inventory[tool.prototype.name] === 0)
						delete player.inventory[tool.prototype.name];
					updatePlayer();
					connection |= tile.structure.connection();
				}
				else{
					// If mouse button is clicked without any tool selected, try to open it (WIP).
					showInventory(tile);
				}
				updateTile(tile);
				for(var i = 0; i < 4; i++){
					if(connection & (1 << i)){
						var x = c + [-1,0,1,0][i];
						var y = r + [0,-1,0,1][i];
						var tile2 = tileAt(x, y);
						if(tile2)
							updateTile(tile2);
					}
				}
				return false;
			}

			// Prevent context menu from right clicking on the tile
			tileElem.oncontextmenu = function(e){
				e.preventDefault();
			}

			tileElem.onmousemove = function(){
				selectTile(this);
			}
			table.appendChild(tileElem);

			// Disable text selection
			tileElem.setAttribute("class", "noselect");
		}
	}
	// Set the margin after contents are initialized
	table.style.marginLeft = (-(table.getBoundingClientRect().width + miniMapSize + tableMargin) / 2) + 'px';

	var containerRect = container.getBoundingClientRect();
	var tableRect = table.getBoundingClientRect();

	function selectTool(idx){
		// Selecting the same tool twice means deselecting
		if(currentTool === idx)
			idx = -1;
		for(var i = 0; i < toolElems.length; i++)
			toolElems[i].style.backgroundColor = '#ffffff';
		if(0 <= idx && idx < toolElems.length)
			toolElems[idx].style.backgroundColor = '#00ffff';
		currentTool = idx;
		if(0 <= currentTool){
			if(!toolCursorElem){
				toolCursorElem = document.createElement('div');
				toolCursorElem.style.border = '2px blue solid';
				toolCursorElem.style.pointerEvents = 'none';
				toolBarElem.appendChild(toolCursorElem);
			}
			toolCursorElem.style.position = 'absolute';
			toolCursorElem.style.top = '4px';
			toolCursorElem.style.left = (tilesize * currentTool + 4) + 'px';
			toolCursorElem.style.width = '30px';
			toolCursorElem.style.height = '30px';
			toolCursorElem.style.display = 'block';
		}
		else{
			if(toolCursorElem)
				toolCursorElem.style.display = 'none';
		}
		updateCursorGhost();
	}

	// Reset the state before initializing toolbar elements
	toolElems = [];
	toolOverlays = [];
	currentTool = -1;
	currentRotation = 0;

	// Tool bar
	toolBarElem = document.createElement('div');
	toolBarElem.style.borderStyle = 'solid';
	toolBarElem.style.borderWidth = '1px';
	toolBarElem.style.borderColor = 'red';
	toolBarElem.style.position = 'relative';
	toolBarElem.margin = '3px';
	toolBarElem.style.left = '50%';
	toolBarElem.style.width = ((toolDefs.length + 1) * tilesize + 8) + 'px';
	toolBarElem.style.height = (tilesize + 8) + 'px';
	container.appendChild(toolBarElem);
	for(var i = 0; i < toolDefs.length; i++){
		var toolContainer = document.createElement('span');
		toolContainer.style.position = 'absolute';
		toolContainer.style.display = 'inline-block';
		toolContainer.style.width = '31px';
		toolContainer.style.height = '31px';
		toolContainer.style.top = '4px';
		toolContainer.style.left = (32.0 * i + 4) + 'px';
		toolContainer.style.border = '1px black solid';

		// Overlay for item count
		var overlay = document.createElement('div');
		toolOverlays.push(overlay);
		overlay.setAttribute('class', 'overlay noselect');
		overlay.innerHTML = '0';

		var toolElem = document.createElement("div");
		toolElems.push(toolElem);
		toolElem.style.width = '31px';
		toolElem.style.height = '31px';
		toolElem.style.position = 'absolute';
		toolElem.style.textAlign = 'center';
		toolElem.onmousedown = function(e){
			selectTool(toolElems.indexOf(this));
		}
		toolElem.onmouseenter = function(e){
			var idx = toolElems.indexOf(this);
			if(idx < 0 || toolDefs.length <= idx)
				return;
			var tool = toolDefs[idx];
			var r = this.getBoundingClientRect();
			var cr = container.getBoundingClientRect();
			toolTip.style.left = (r.left - cr.left) + 'px';
			toolTip.style.top = (r.bottom - cr.top) + 'px';
			toolTip.style.display = 'block';
			var desc = tool.prototype.toolDesc();
			if(0 < desc.length)
				desc = '<br>' + desc;
			toolTip.innerHTML = '<b>' + tool.prototype.name + '</b>' + desc;
		};
		toolElem.onmouseleave = function(e){
			toolTip.style.display = 'none';
		};

		// Note that toolElem is not the direct child of toolBarElem.
		// toolContainer has inserted in between the parent and child in order to
		// display overlay text for item count.
		toolContainer.appendChild(toolElem);
		toolContainer.appendChild(overlay);
		toolBarElem.appendChild(toolContainer);

		// Disable text selection
		toolElem.setAttribute("class", "noselect");
		toolDefs[i].prototype.draw(toolElem, true);
	}
	var rotateButton = document.createElement('div');
	rotateButton.style.width = '31px';
	rotateButton.style.height = '31px';
	rotateButton.style.position = 'relative';
	rotateButton.style.top = '4px';
	rotateButton.style.left = (32.0 * i + 4) + 'px';
	rotateButton.style.border = '1px blue solid';
	rotateButton.style.backgroundImage = 'url("img/rotate.png")';
	rotateButton.onmousedown = function(e){
		rotate();
	}
	toolBarElem.appendChild(rotateButton);

	// Set the margin after contents are initialized
	toolBarElem.style.marginLeft = (-(toolBarElem.getBoundingClientRect().width + miniMapSize + tableMargin) / 2) + 'px';

	selectTool(-1);

	infoElem = document.createElement('div');
	infoElem.style.position = 'absolute';
	infoElem.style.backgroundColor = '#ffff7f';
	infoElem.style.border = '1px solid #00f';
	container.appendChild(infoElem);

	miniMapElem = document.createElement('div');
	miniMapElem.style.position = 'absolute';
	miniMapElem.style.border = '1px solid #000';
	miniMapElem.onclick = function(evt){
		var rect = this.getBoundingClientRect();
		scrollPos[0] = Math.min(xsize - viewPortWidth - 1, Math.max(0, Math.floor((evt.clientX - rect.left) / rect.width * xsize - viewPortWidth / 2.)));
		scrollPos[1] = Math.min(ysize - viewPortHeight - 1, Math.max(0, Math.floor((evt.clientY - rect.top) / rect.height * ysize - viewPortHeight / 2.)));
		updateAllTiles();
	};
	container.appendChild(miniMapElem);
	miniMapElem.style.width = miniMapSize + 'px';
	miniMapElem.style.height = miniMapSize + 'px';
	miniMapCursorElem = document.createElement('div');
	miniMapCursorElem.style.backgroundColor = '#ccffff';
	miniMapCursorElem.style.position = 'absolute';
	miniMapCursorElem.style.border = '1px solid #000';
	miniMapElem.appendChild(miniMapCursorElem);

	inventoryElem = document.getElementById('inventory');
	inventoryElem.ondragover = function(ev){
		var ok = false;
		for(var i = 0; i < ev.dataTransfer.types.length; i++){
			if(ev.dataTransfer.types[i].toUpperCase() === textType.toUpperCase())
				ok = true;
		}
		if(ok){
			ev.preventDefault();
			// Set the dropEffect to move
			ev.dataTransfer.dropEffect = "move";
		}
	}
	inventoryElem.ondrop = function(ev){
		ev.preventDefault();
		var data = JSON.parse(ev.dataTransfer.getData(textType));
		if(inventoryTarget && inventoryTarget.inventory && data.fromPlayer){
			var fromInventory = player.inventory;
			// The amount could have changed during dragging, so we'll query current value
			// from the source inventory.
			var movedAmount = inventoryTarget.addItem({type: data.type, amount: fromInventory[data.type]});
			if(0 < movedAmount){
				player.removeItem(data.type, movedAmount);
				updatePlayer();
			}
		}
	}
	inventoryElem.style.display = 'none';

	var inventoryContentElem = document.getElementById('inventoryContent');
	inventoryContentElem.onclick = function(){
		if(inventoryTarget && inventoryTarget.inventory && selectedInventory && selectedInventory !== inventoryTarget){
			moveItem(selectedInventory, inventoryTarget, selectedInventoryItem);
		}
	};

	var inventoryListElem = document.getElementById('inventoryList');
	inventoryListElem.style.border = '1px solid #afafaf';
	inventoryListElem.onclick = function(){
		inventoryIcons = false;
		inventoryListElem.style.border = '1px solid #afafaf';
		inventoryIconsElem.style.border = '';
		updateInventory();
	};

	var inventoryIconsElem = document.getElementById('inventoryIcons');
	inventoryIconsElem.onclick = function(){
		inventoryIcons = true;
		inventoryListElem.style.border = '';
		inventoryIconsElem.style.border = '1px solid #afafaf';
		updateInventory();
	};

	var recipeSelectButtonElem = document.getElementById('recipeSelectButton');
	recipeSelectButtonElem.onclick = function(){showRecipeSelect(inventoryTarget.tile)};

	playerElem = document.createElement('div');
	playerElem.style.overflow = 'visible';
	playerElem.style.borderStyle = 'solid';
	playerElem.style.borderWidth = '1px';
	playerElem.style.border = '1px solid #00f';
	playerElem.style.backgroundColor = '#ffff7f';
	playerElem.style.position = 'relative';
	playerElem.style.margin = '3px';
	playerElem.style.left = '50%';
	playerElem.style.width = (320) + 'px';
	playerElem.style.height = (160) + 'px';
	container.appendChild(playerElem);
	playerElem.style.marginLeft = (-(playerElem.getBoundingClientRect().width + miniMapSize + tableMargin) / 2) + 'px';

	var listElem = document.createElement('img');
	listElem.style.position = 'absolute';
	listElem.style.left = '-35px';
	listElem.style.top = '0px';
	listElem.style.width = '32px';
	listElem.style.height = '32px';
	listElem.style.border = '1px solid #afafaf';
	listElem.src = 'img/list.png';
	listElem.setAttribute('draggable', 'false');
	listElem.onclick = function(){
		playerInventoryIcons = false;
		listElem.style.border = '1px solid #afafaf';
		iconsElem.style.border = '';
		updatePlayer();
	};
	playerElem.appendChild(listElem);

	var iconsElem = document.createElement('img');
	iconsElem.style.position = 'absolute';
	iconsElem.style.left = '-35px';
	iconsElem.style.top = '32px';
	iconsElem.style.width = '32px';
	iconsElem.style.height = '32px';
	iconsElem.src = 'img/icons.png';
	iconsElem.setAttribute('draggable', 'false');
	iconsElem.onclick = function(){
		playerInventoryIcons = true;
		listElem.style.border = '';
		iconsElem.style.border = '1px solid #afafaf';
		updatePlayer();
	};
	playerElem.appendChild(iconsElem);

	playerInventoryElem = document.createElement('div');
	playerInventoryElem.style.position = 'relative';
	playerInventoryElem.style.overflowY = 'scroll';
	playerInventoryElem.style.width = '100%';
	playerInventoryElem.style.height = '100%';
	playerInventoryElem.style.textAlign = 'left';
	playerInventoryElem.ondragover = function(ev){
		var ok = false;
		for(var i = 0; i < ev.dataTransfer.types.length; i++){
			if(ev.dataTransfer.types[i].toUpperCase() === textType.toUpperCase())
				ok = true;
		}
		if(ok){
			ev.preventDefault();
			// Set the dropEffect to move
			ev.dataTransfer.dropEffect = "move";
		}
	}
	playerInventoryElem.ondrop = function(ev){
		ev.preventDefault();
		var data = JSON.parse(ev.dataTransfer.getData(textType));
		if(!data.fromPlayer && inventoryTarget && inventoryTarget.inventory){
			moveItem(inventoryTarget, player, data.type);
		}
	}
	playerInventoryElem.onclick = function(){onInventoryClick(player)};
	playerElem.appendChild(playerInventoryElem);

	onSize();

	debugText = document.createElement('div');
	container.appendChild(debugText);
}

function onSize(){
	var tableRect = table.getBoundingClientRect();

	miniMapElem.style.left = (tableRect.right + tableMargin) + 'px';
	miniMapElem.style.top = '0px';
	miniMapElem.style.left = (tableRect.right + tableMargin) + 'px';
	var mrect = miniMapElem.getBoundingClientRect();
	updateMiniMapPos();

	var rect = infoElem.getBoundingClientRect();
	infoElem.style.left = (tableRect.right + tableMargin) + 'px';
	infoElem.style.top = (mrect.height + tableMargin) + 'px';
	infoElem.style.width = miniMapSize + 'px';
	infoElem.style.height = (container.getBoundingClientRect().height - mrect.height - tableMargin) + 'px';
	infoElem.style.textAlign = 'left';
}

function updateInfo(){
	if(!selectedCoords){
		infoElem.innerHTML = 'Empty tile';
		return;
	}
	if(xsize <= selectedCoords[0] && ysize <= selectedCoords[1])
		return;
	var tile = board[selectedCoords[0] + selectedCoords[1] * ysize];
	if(!tile || !tile.structure){
		infoElem.innerHTML = 'Empty tile<br>' +
			'Iron Ore: ' + tile.ironOre + '<br>' +
			'Copper Ore: ' + tile.copperOre + '<br>' +
			'Coal Ore: ' + tile.coalOre;
		return;
	}
	infoElem.innerHTML = 'Type: ' + tile.structure.name + '<br>' +
		(tile.structure.desc ? tile.structure.desc(tile) : "");
}

function generateItemImage(i, iconSize, count){
	var img = document.createElement('div');
	var imageFile = getImageFile(i);
	img.style.backgroundImage = 'url(' + (imageFile instanceof Array ?
		imageFile[0] : imageFile) + ')';
	var size = iconSize ? 32 : objViewSize;
	img.style.width = size + 'px';
	img.style.height = size + 'px';
	img.style.display = 'inline-block';
	if(imageFile instanceof Array)
		img.style.backgroundSize = size * imageFile[1] + 'px ' + size + 'px';
	else
		img.style.backgroundSize = size + 'px ' + size + 'px';
	img.setAttribute('draggable', 'false');
	if(iconSize && count){
		var container = document.createElement('span');
		container.style.position = 'relative';
		container.style.display = 'inline-block';
		container.style.width = size + 'px';
		container.style.height = size + 'px';
		container.appendChild(img);
		var overlay = document.createElement('div');
		overlay.setAttribute('class', 'overlay noselect');
		overlay.innerHTML = count;
		container.appendChild(overlay);
		return container;
	}
	return img;
}

function updateInventoryInt(elem, owner, icons){
	// Local function to update DOM elements based on selection
	function updateInventorySelection(elem, owner){
		for(var i = 0; i < elem.children.length; i++){
			var celem = elem.children[i];
			celem.style.backgroundColor = owner === selectedInventory &&
				celem.itemName === selectedInventoryItem ? "#00ffff" : "";
		}
	}

	// Clear the elements first
	while(elem.firstChild)
		elem.removeChild(elem.firstChild);

	for(var i in owner.inventory){
		var v = owner.inventory[i];
		var div;
		if(icons){
			div = generateItemImage(i, true, v);
		}
		else{
			div = document.createElement('div');
			div.appendChild(generateItemImage(i));
			var text = document.createElement('span');
			text.innerHTML = v + ' ' + i;
			div.appendChild(text);
			div.style.textAlign = 'left';
		}
		if(selectedInventory === owner && selectedInventoryItem === i)
			div.style.backgroundColor = '#00ffff';
		div.setAttribute('class', 'noselect');
		div.itemName = i;
		div.itemAmount = v;
		div.onclick = function(){
			if(selectedInventory !== owner || selectedInventoryItem !== this.itemName){
				selectedInventory = owner;
				selectedInventoryItem = this.itemName;
			}
			else{
				selectedInventory = null;
				selectedInventoryItem = null;
			}
			updateInventorySelection(playerInventoryElem, player);
			if(inventoryTarget && inventoryTarget.inventory)
				updateInventorySelection(document.getElementById('inventoryContent'), inventoryTarget);
		};
		div.setAttribute('draggable', 'true');
		div.ondragstart = function(ev){
			console.log("dragStart");
			ev.dataTransfer.dropEffect = 'move';
			// Encode information to determine item to drop into a JSON
			ev.dataTransfer.setData(textType, JSON.stringify(
				{type: ev.target.itemName, fromPlayer: owner === player}));
		};
		elem.appendChild(div);
	}
}

function updatePlayer(){
	// Note that item count text is decoupled from toolElems, so you don't need to update the text
	// when updateTool() is called.  Instead, we want to update whenever the player's inventory has
	// changed, potentially changing the item count.
	if(player.inventory){
		for(var i in toolDefs){
			var name = toolDefs[i].prototype.name;
			var count = 0;
			if(name in player.inventory){
				count = player.inventory[name];
			}
			toolOverlays[i].innerHTML = count;
		}
	}

	updateInventoryInt(playerInventoryElem, player, playerInventoryIcons);
}

function updateInventory(){
	if(inventoryElem.style.display === 'none')
		return;
	if(inventoryTarget && inventoryTarget.inventory){
		updateInventoryInt(document.getElementById('inventoryContent'), inventoryTarget, inventoryIcons);

		var usedAmount = inventoryTarget.inventoryVolume();
		var capacity = inventoryTarget.inventoryCapacity();

		var inventoryTitle = document.getElementById('inventoryTitle');
		inventoryTitle.innerHTML = inventoryTarget.name + ' Inventory (' + usedAmount + '/' + capacity + ')';
	}
}

function onInventoryClick(inventoryOwner){
	// Update only if the selected inventory is the other one from destination.
	if(selectedInventory && inventoryOwner !== selectedInventory){
		moveItem(selectedInventory, inventoryOwner, selectedInventoryItem);
	}
}

function moveItem(src, dest, type){
	if(!(type in src.inventory))
		return;
	// The amount could be changed during dragging, so we'll query current value
	// from the source inventory.
	var movedAmount = dest.addItem({type: type, amount: src.inventory[type]});
	if(0 < movedAmount){
		src.removeItem(type, movedAmount);
		// We'd better update both inventory windows.
		updatePlayer();
		updateInventory();
	}
}

function selectTile(sel){
	if(sel === selectedTile)
		return;
	selectedTile = sel;
	var idx = tileElems.indexOf(sel);
	var vx = idx % viewPortWidth;
	var vy = Math.floor(idx / viewPortWidth);
	var ix = vx + scrollPos[0];
	var iy = vy + scrollPos[1];
	selectedCoords = [ix, iy];
	if(ix < xsize && iy < ysize){
		cursorElem.style.display = 'block';
		cursorElem.style.position = 'absolute';
		cursorElem.style.top = (tilesize * vy) + 'px';
		cursorElem.style.left = (tilesize * vx) + 'px';
		cursorElem.style.width = '30px';
		cursorElem.style.height = '30px';

		// Show tooltip to hint the player that he can open the inventory
		// by clicking, but only when it's available.
		var tile = tileAt(ix, iy);
		if(currentTool < 0 && inventoryElem.style.display === 'none' && tile.structure && tile.structure.inventory !== undefined){
			var cr = table.getBoundingClientRect();
			var r = sel.getBoundingClientRect();
			toolTip.style.left = (r.left - cr.left) + 'px';
			toolTip.style.top = (r.bottom - cr.top) + 'px';
			toolTip.style.display = 'block';
			var desc = "Click to open inventory";
			if(0 < desc.length)
				desc = '<br>' + desc;
			toolTip.innerHTML = '<b>' + tile.structure.name + '</b>' + desc;
			sel.onmouseleave = function(){
				toolTip.style.display = 'none';
				this.onmouseleave = null;
			}
		}
		else
			toolTip.style.display = 'none';

		updateInfo();
		updateInventory();
	}
}

function generateBoard(){
	createElements();

	var sizeStr = document.getElementById("sizeSelect").value;
	xsize = ysize = parseInt(sizeStr); // We don't support non-square world shape yet
	board = new Array(xsize * ysize);

	for(var i = 0; i < xsize * ysize; i++)
		board[i] = newblock(i);

	scrollPos[0] = Math.max(0, Math.floor((xsize - viewPortWidth) / 2.));
	scrollPos[1] = Math.max(0, Math.floor((ysize - viewPortHeight) / 2.));
	miniMapElem.style.width = miniMapSize + 'px';
	miniMapElem.style.height = miniMapSize + 'px';
	miniMapCursorElem.style.width = ((viewPortWidth + 1) * miniMapSize / xsize - 1) + 'px';
	miniMapCursorElem.style.height = ((viewPortHeight + 1) * miniMapSize / ysize - 1) + 'px';
	updateAllTiles();

	// Initial inventory of player
	player.inventory['Transport Belt'] = 20;
	player.inventory['Inserter'] = 10;
	player.inventory['Chest'] = 10;
	player.inventory['Ore Mine'] = 5;
	player.inventory['Furnace'] = 3;
	player.inventory['Assembler'] = 3;
	player.inventory['Coal Ore'] = 20;
	player.inventory['Water Well'] = 3;
	player.inventory['Boiler'] = 3;
	player.inventory['SteamEngine'] = 3;
	player.inventory['Pipe'] = 10;
	player.inventory['Splitter'] = 5;
	updatePlayer();
}
this.generateBoard = generateBoard;

function Tile(){
	this.structure = null;
	this.ironOre = 0;
	this.copperOre = 0;
	this.coalOre = 0;
}

Tile.prototype.serialize = function(){
	var ret = {}
	if(this.structure){
		ret.structure = {type: this.structure.name};
		ret.structure = this.structure.serialize();
	}
	var names = ["ironOre", "copperOre", "coalOre"];
	for(var i in names){
		var name = names[i];
		if(this[name])
			ret[name] = this[name];
	}
	return ret;
}

Tile.prototype.deserialize = function(obj){
	this.structure = null;
	if(obj.structure && obj.structure.type){
		var constructor = structureMap[obj.structure.type];
		if(constructor){
			this.structure = new constructor;
			this.structure.tile = this;
			this.structure.deserialize(obj.structure);
		}
	}
	this.ironOre = obj.ironOre || 0;
	this.copperOre = obj.copperOre || 0;
	this.coalOre = obj.coalOre || 0;
}


function newblock(i){
	var x = i % ysize;
	var y = Math.floor(i / ysize);
	var obj = new Tile();
	var iron = Math.max(0, (perlin_noise_pixel(x, y, 8) * 4000 - 3000).toFixed())
	var copper = Math.max(0, (perlin_noise_pixel(x, y, 9) * 4000 - 3000).toFixed())
	var coal = Math.max(0, (perlin_noise_pixel(x, y, 10) * 2000 - 1500).toFixed())

	// Find and pick the maximum amounts in ore candidates
	var oreAmts = [iron, copper, coal]
	var oreTypes = ['ironOre', 'copperOre', 'coalOre']
	var maxi = -1
	for(var i = 0; i < oreAmts.length; i++){
		if(oreAmts[i] <= 0)
			continue
		if(maxi < 0 || oreAmts[maxi] < oreAmts[i]){
			maxi = i
		}
	}
	if(0 <= maxi)
		obj[oreTypes[maxi]] = oreAmts[maxi]
	return obj;
}

var serialNo = 0;

function findStructure(tx, ty){
	// Scan from negative side to find potential structure that is covering
	// this tile.  The starting negative offset should be the largest size
	// of all structures.
	for(var ix = -1; ix <= 0; ix++){
		for(var iy = -1; iy <= 0; iy++){
			if(xsize <= tx + ix || ysize <= ty + iy)
				continue;
			var istruct = board[(tx + ix) + (ty + iy) * ysize].structure;
			if(istruct){
				var issize = istruct.getSize();
				if(0 < ix + issize[0] && 0 < iy + issize[1])
					return istruct;
			}
		}
	}
	return null;
}

/// Check whether given tile allow objects on it, e.g. transport belts
function movableTile(x, y){
	var tx = Math.floor(x / tilesize);
	var ty = Math.floor(y / tilesize);
	if(tx < 0 || xsize < tx || ty < 0 || ysize < ty || isNaN(tx) || isNaN(ty))
		return false;
	// Ojects should not be placed on an empty tile
	var struct = findStructure(tx, ty);
	if(!struct)
		return false;
	return struct.movable();
}

/// Check whether given coordinates hits some object
function hitCheck(x, y, ignore){
	for(var j = 0; j < objects.length; j++){
		var jo = objects[j];
		if(ignore === jo)
			continue;
		if(Math.abs(x - jo.x) < objsize && Math.abs(y - jo.y) < objsize)
			return true;
	}
	return false;
}

/// A class representing dropped item on the ground (not the items in an inventory)
function DropItem(c, r, type){
	this.id = serialNo++;
	this.type = type;
	this.x = c * tilesize + tilesize / 2;
	this.y = r * tilesize + tilesize / 2;
}

DropItem.prototype.serialize = function(){
	return {
		id: this.id,
		type: this.type,
		x: this.x,
		y: this.y,
	};
}

DropItem.prototype.deserialize = function(obj){
	this.id = obj.id;
	this.type = obj.type;
	this.x = obj.x;
	this.y = obj.y;
}

DropItem.prototype.addElem = function(){
	this.elem = document.createElement('div');
	var file = getImageFile(this.type);
	if(file){
		this.elem.style.backgroundImage = 'url("' + (file instanceof Array ? file[0] : file) + '")';
	}
	else
		this.elem.innerHTML = type;
	this.elem.style.backgroundSize = objViewSize * (file instanceof Array ? file[1] : 1) + 'px ' + objViewSize + 'px';
	// Debug graphic for bounding box
//			this.elem.style.border = '1px solid';
	this.elem.style.width = objViewSize + 'px';
	this.elem.style.height = objViewSize + 'px';
	this.elem.style.position = 'absolute';
	// Disable mouse events since we don't want an object to catch mouse event when
	// we're adding a structure to a tile.
	this.elem.style.pointerEvents = 'none';
	this.elem.setAttribute('class', 'noselect');
	// Dropped items have always 5 z-index
	this.elem.style.zIndex = 5;
	positionObject(this);
	table.appendChild(this.elem);
}

/// Insert an object on the board.  It could fail if there's already some object at the position.
function newObject(c, r, type){
	var obj = new DropItem(c, r, type);
	if(0 <= c && c < xsize && 0 <= r && r < ysize && board[c + r * ysize].structure && !board[c + r * ysize].structure.movable()){
		return board[c + r * ysize].structure.input(obj);
	}
	if(hitCheck(obj.x, obj.y))
		return false;
	obj.addElem();
	objects.push(obj);
	return true;
}

function getImageFile(type){
	switch(type){
	case 'time':
		return 'img/time.png';
	case 'Iron Ore':
		return 'img/ore.png';
	case 'Iron Plate':
		return 'img/metal.png';
	case 'Steel Plate':
		return 'img/steel-plate.png';
	case 'Copper Ore':
		return 'img/copper-ore.png';
	case 'Copper Plate':
		return 'img/copper-plate.png';
	case 'Coal Ore':
		return 'img/coal-ore.png';
	case 'Gear':
		return 'img/gear.png';
	case 'Copper Wire':
		return 'img/copper-wire.png';
	case 'Circuit':
		return 'img/circuit.png';
	case 'Transport Belt':
		return 'img/transport.png';
	case 'Splitter':
		return 'img/splitter.png';
	case 'Inserter':
		return 'img/inserter-base.png';
	case 'Chest':
		return 'img/chest.png';
	case 'Ore Mine':
		return "img/mine.png";
	case 'Furnace':
		return ["img/furnace.png", 3];
	case 'Assembler':
		return "img/assembler.png";
	case 'Water Well':
		return "img/waterwell.png";
	case 'Boiler':
		return ["img/boiler.png", 3];
	case 'Pipe':
		return "img/pipe-item.png";
	case 'SteamEngine':
		return "img/steam-engine.png";
	default:
		return "";
	}
}

function positionObject(obj){
	var vx = obj.x - scrollPos[0] * tilesize;
	var vy = obj.y - scrollPos[1] * tilesize;
	if(vx < 0 || viewPortWidth * tilesize < vx || vy < 0 || viewPortHeight * tilesize < vy){
		obj.elem.style.display = 'none';
		return;
	}
	obj.elem.style.display = 'block';
	obj.elem.style.left = (vx - objViewSize / 2) + 'px';
	obj.elem.style.top = (vy - objViewSize / 2) + 'px';
}

var serialize = this.serialize = function serialize(){
	var saveData = {
		simstep: simstep,
		xsize: xsize, ysize: ysize,
		scrollPos: scrollPos,
		serialNo: serialNo,
	};
	var objectsData = [];
	for(var i = 0; i < objects.length; i++){
		objectsData.push(objects[i].serialize());
	}
	saveData.objects = objectsData;
	var tiles = [];
	for(var x = 0; x < xsize; x++){
		for(var y = 0; y < ysize; y++){
			var v = board[y + x * ysize];
			tiles.push(v.serialize());
		}
	}
	saveData.tiles = tiles;
	saveData.player = player.serialize();
	return JSON.stringify(saveData);
}

var deserialize = this.deserialize = function deserialize(stream){
	var data = JSON.parse(stream);
	if(data !== null){
		simstep = data.simstep;
		autosave_frame = simstep;
		xsize = data.xsize;
		ysize = data.ysize;
		scrollPos = data.scrollPos;
		serialNo = data.serialNo || 0;
		objects = [];
		for(var i = 0; i < data.objects.length; i++){
			var object = new DropItem();
			object.deserialize(data.objects[i]);
			objects.push(object);
		}
		board = [];
		var tiles = data.tiles || data.cells;
		for(var i = 0; i < tiles.length; i++){
			var c = tiles[i];
			if(!c)
				continue;
			var tile = new Tile();
			tile.deserialize(c);
			board.push(tile);
		}
		player.deserialize(data.player);
		createElements();

		// Create elements for objects since they are always reserved regardless of whether the item
		// is visible in the viewport.  Also it must happen after createElements().
		for(var i = 0; i < objects.length; i++)
			objects[i].addElem();

		// Create minimap symbols for existing structures since they are not automatically added
		// in updateAllTiles().
		for(var x = 0; x < xsize; x++){
			for(var y = 0; y < ysize; y++){
				var tile = tileAt(x, y);
				if(tile.structure)
					addMinimapSymbol(x, y, tile);
			}
		}

		miniMapElem.style.width = miniMapSize + 'px';
		miniMapElem.style.height = miniMapSize + 'px';
		miniMapCursorElem.style.width = ((viewPortWidth + 1) * miniMapSize / xsize - 1) + 'px';
		miniMapCursorElem.style.height = ((viewPortHeight + 1) * miniMapSize / ysize - 1) + 'px';
		updateAllTiles();

		updatePlayer();
	}
	else{
		generateBoard();
	}
}

/// Simulation step function
function run(){
	// Iterate all floating objects to update
	for(var i = 0; i < objects.length; i++){
		var o = objects[i];

		// Obtain coordinates and tile at the position
		var tx = Math.floor(o.x / tilesize);
		var ty = Math.floor(o.y / tilesize);
		var tile = board[tx + ty * ysize];
		var struct = findStructure(tx, ty);
		if(struct)
			struct.objectResponse(tile, o);
	}

	for(var ty = 0; ty < ysize; ty++){
		for(var tx = 0; tx < xsize; tx++){
			var tile = board[tx + ty * ysize];
			if(tile.structure)
				tile.structure.frameProc(tile);
		}
	}

	updateInfo();

	simstep++;

	if(autosave_frame + 100 < simstep){

		// Check for localStorage
		if(typeof(Storage) !== "undefined"){
			var serialData = serialize();
			localStorage.setItem("FactorishJSGameSave", serialData);
			//this.onAutoSave(serialData);
			var autoSaveElem = document.getElementById("autoSaveText");
			if(autoSaveElem){
				autoSaveElem.value = serialData;
			}
		}

		autosave_frame += 100;
	}
}

})();
