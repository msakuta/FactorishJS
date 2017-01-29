var Conveyor = new (function(){
'use strict';
var container;
var table;
var size;
var viewPortWidth;
var viewPortHeight;
var board;
var tileElems;
var scrollPos = [0, 0];
var selectedTile = null;
var selectedCoords = null;
var cursorElem;
var messageElem;
var debugText;
var infoElem;
var inventoryElem;
var inventoryIcons = false;
var inventoryTarget = null;
var playerElem;
var playerInventoryElem;
var playerInventoryIcons = false;
var miniMapSize = 150;
var miniMapElem;
var miniMapCursorElem;
var recipeTarget = null;

// Constants
var tilesize = 32;
var objsize = tilesize / 3;
var objViewSize = tilesize / 2; // View size is slightly greater than hit detection radius
var textType = isIE() ? "Text" : "text/plain";

var toolBarElem;
var toolElems = [];
var toolCursorElem;

// Placeholder object for player
var player = {inventory: {}};
var selectedInventory = null;
var selectedInventoryItem = null;

/// @returns Amount of items actually moved
player.addItem = function(item){
	var ret = Math.min(item.amount || 1, this.inventoryCapacity() - this.inventoryVolume());
	if(0 < ret){
		if(!(item.type in this.inventory))
			this.inventory[item.type] = ret;
		else
			this.inventory[item.type] += ret;
		if(inventoryTarget === this && inventoryElem.style.display !== 'none')
			updateInventory();
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
	if(inventoryTarget === this && inventoryElem.style.display !== 'none')
		updateInventory();
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
}

/// Custom inheritance function that prevents the super class's constructor
/// from being called on inehritance.
/// Also assigns constructor property of the subclass properly.
/// @param subclass The constructor of subclass that should be inherit base
/// @param base The constructor of the base class which subclass's prototype should point to.
/// @param methods Optional argument for a table containing methods to define for subclass.
///                The table is mixed-in to subclass, so it won't be a base class of subclass.
function inherit(subclass,base,methods){
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
	subclass.prototype.constructor = subclass;
}

function Structure(){
	this.tile = null;
}

Structure.prototype.desc = function(){
	return "";
};

Structure.prototype.draw = function(tileElem){
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

// Transport belt
function TransportBelt(){}
inherit(TransportBelt, Structure, {
	name: "Transport Belt",
	symbol: ["&lt;", "^", "&gt;", "V"],

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
		var newx = Math.min(size * tilesize, Math.max(0, o.x + vx));
		var newy = Math.min(size * tilesize, Math.max(0, o.y + vy));
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

// Inserter
function Inserter(){
	this.cooldown = 0;
}
inherit(Inserter, Structure, {
	name: "Inserter",
	symbol: ["&lt;<br>I", "^<br>I", "&gt;<br>I", "V<br>I"],

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
		var tx = idx % size;
		var ty = Math.floor(idx / size);

		var vx = [-1, 0, 1, 0][this.rotation];
		var vy = [0, -1, 0, 1][this.rotation];
		var sx = tx - vx;
		var sy = ty - vy;
		var sourceTile = board[sx + sy * size];
		var dx = tx + vx;
		var dy = ty + vy;
		var destTile = board[dx + dy * size];

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

	draw: function(tileElem){
		var imgElem = document.createElement('img');
		imgElem.src = 'img/chest.png';
		imgElem.style.left = '0px';
		imgElem.style.top = '0px';
		imgElem.style.position = 'absolute';
		tileElem.appendChild(imgElem);
	},
});

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

	draw: function(tileElem){
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
		var tx = idx % size;
		var ty = Math.floor(idx / size);
		var vx = [-1, 0, 1, 0][this.rotation];
		var vy = [0, -1, 0, 1][this.rotation];
		var dx = tx + vx;
		var dy = ty + vy;
		var destTile = board[dx + dy * size];

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
});

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
				var progress = this.isBurner() && this.power !== undefined && this.recipe.powerCost !== undefined ? Math.min(this.power / this.recipe.powerCost, 1) : 1;

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
				else{
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

	frameProc: function(tile){
		// Clear inactive recipe
		if(this.recipe && this.processing === false && (function(){
			for(var i in this.recipe.input)
				if(!this.inventory[i])
					return true;
			return false;
		}).call(this))
			this.recipe = null;
		return Factory.prototype.frameProc.call(this, tile);
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

	draw: function(tileElem){
		var imgElem = document.createElement('img');
		imgElem.src = 'img/furnace.png';
		imgElem.style.left = '0px';
		imgElem.style.top = '0px';
		imgElem.style.position = 'absolute';
		tileElem.appendChild(imgElem);
	},

	isBurner: function(){return true;}
});

// Assembler
function Assembler(){
	Factory.call(this);
	this.electricity = 0;
	this.maxElectricity = 0.02;
}
inherit(Assembler, Factory, {
	name: "Assembler",
	symbol: 'A',

	desc: function(){
		var str = "Electricity: <div style='position: relative; width: 100px; height: 10px; background-color: #001f1f; margin: 2px; border: 1px solid #3f3f3f'>" +
			"<div style='position: absolute; width: " + (this.electricity / this.maxElectricity) * 100 + "px; height: 10px; background-color: #ffff00'></div></div>";
		str += Factory.prototype.desc.call(this);
		return str;
	},

	draw: function(tileElem){
		var imgElem = document.createElement('img');
		imgElem.src = 'img/assembler.png';
		imgElem.style.left = '0px';
		imgElem.style.top = '0px';
		imgElem.style.position = 'absolute';
		tileElem.appendChild(imgElem);
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

FluidBox.prototype.freeCapacity = function(){
	return this.maxAmount - this.amount;
}

function FluidContainer(){
	Structure.call(this);
	this.fluidBox = [new FluidBox()];
}
inherit(FluidContainer, Structure, {
	desc: function(tile){
		var ret = '';
		for(var n = 0; n < this.fluidBox.length; n++){
			var fluidBox = this.fluidBox[n];
			ret += (fluidBox.type ? fluidBox.type : "Fluid") + " amount: " + fluidBox.amount.toFixed(1) + "/" + fluidBox.maxAmount.toFixed(1) + '<br>';
		}
		return ret + Structure.prototype.desc.call(this);
	},

	frameProc: function(){
		var idx = board.indexOf(this.tile);
		if(idx < 0)
			return;
		var thisPos = [idx % size, Math.floor(idx / size)];
		var relDir = [[-1,0], [0,-1], [1,0], [0,1]];
		for(var n = 0; n < this.fluidBox.length; n++){
			var thisFluidBox = this.fluidBox[n];
			// In an unlikely event, a fluid box without either input or output ports has nothing to do
			if(thisFluidBox.amount === 0 || !thisFluidBox.inputEnable && !thisFluidBox.outputEnable)
				continue;
			for(var i = 0; i < thisFluidBox.connectTo.length; i++){
				var thisRelDir = (thisFluidBox.connectTo[i] + this.rotation) % 4;
				var pos = [thisPos[0] + relDir[thisRelDir][0], thisPos[1] + relDir[thisRelDir][1]];
				if(pos[0] < 0 || size <= pos[0] || pos[1] < 0 || size <= pos[1])
					continue;
				var nextTile = board[pos[0] + pos[1] * size];
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
					var flow = pressure * 0.01;
					// Check input/output valve state
					if(flow < 0 ? !thisFluidBox.outputEnable || !nextFluidBox.inputEnable || nextFluidBox.filter && nextFluidBox.filter !== thisFluidBox.type:
						!thisFluidBox.inputEnable || !nextFluidBox.outputEnable && thisFluidBox.filter !== nextFluidBox.type)
						continue;
					nextFluidBox.amount -= flow;
					thisFluidBox.amount += flow;
					nextFluidBox.type = thisFluidBox.type;
				}
			}
		}
	}
})

function WaterWell(){
	FluidContainer.call(this);
}
inherit(WaterWell, FluidContainer, {
	name: "Water Well",
	symbol: 'W',

	draw: function(tileElem){
		var imgElem = document.createElement('img');
		imgElem.src = 'img/waterwell.png';
		imgElem.style.left = '0px';
		imgElem.style.top = '0px';
		imgElem.style.position = 'absolute';
		tileElem.appendChild(imgElem);
	},

	frameProc: function(){
		var delta = 0.01;
		// If the well has fluid other than water, clear it
		if(this.fluidBox[0].type !== 'Water'){
			this.fluidBox[0].type = 'Water';
			this.fluidBox[0].amount = 0;
		}
		this.fluidBox[0].amount = Math.min(this.fluidBox[0].maxAmount, this.fluidBox[0].amount + 0.01);
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
})
mixin(Boiler.prototype, Factory.prototype);

Boiler.prototype.desc = function(){
	var str = FluidContainer.prototype.desc.call(this);
	str += '<br>' + Factory.prototype.desc.call(this);
	return str;
}

Boiler.prototype.draw = function(tileElem){
	var imgElem = document.createElement('img');
	imgElem.src = 'img/boiler.png';
	imgElem.style.left = '0px';
	imgElem.style.top = '0px';
	imgElem.style.position = 'absolute';
	tileElem.appendChild(imgElem);
};

Boiler.prototype.frameProc = function(tile){
	this.recipe = {
		input: {},
		output: {},
		powerCost: 0.1,
		time: 20,
	};
	FluidContainer.prototype.frameProc.call(this, tile);
	Factory.prototype.frameProc.call(this, tile);
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

function Pipe(){
	FluidContainer.call(this);
	this.amount = 0;
}
inherit(Pipe, FluidContainer, {
	name: "Pipe",
	symbol: 'B',

	draw: function(tileElem){
		var imgElem = document.createElement('img');
		imgElem.src = 'img/pipe.png';
		imgElem.style.left = '0px';
		imgElem.style.top = '0px';
		imgElem.style.width = '32px';
		imgElem.style.height = '32px';
		imgElem.style.position = 'absolute';
		tileElem.appendChild(imgElem);
	},

	frameProc: function(){
		FluidContainer.prototype.frameProc.call(this);
	}
})

function SteamEngine(){
	FluidContainer.call(this);
	this.power = 0;
	this.maxPower = 100;
	this.fluidBox[0].filter = 'Steam';
}
inherit(SteamEngine, FluidContainer, {
	name: "SteamEngine",
	symbol: 'E',

	desc: function(){
		var str = FluidContainer.prototype.desc.call(this);
		var powerStr = "Power: <div style='position: relative; width: 100px; height: 10px; background-color: #001f1f; margin: 2px; border: 1px solid #3f3f3f'>" +
				"<div style='position: absolute; width: " + (this.maxPower ? (this.power) / this.maxPower * 100 : 0) + "px; height: 10px; background-color: #ff00ff'></div></div>";
		return str + powerStr;
	},

	draw: function(tileElem){
		var imgElem = document.createElement('img');
		imgElem.src = 'img/steam-engine.png';
		imgElem.style.left = '0px';
		imgElem.style.top = '0px';
		imgElem.style.position = 'absolute';
		tileElem.appendChild(imgElem);
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
			var thisPos = [idx % size, Math.floor(idx / size)];

			for(var y = Math.max(0, thisPos[1] - pdrange); y <= Math.min(size-1, thisPos[1] + pdrange); y++)
			for(var x = Math.max(0, thisPos[0] - pdrange); x <= Math.min(size-1, thisPos[0] + pdrange); x++){
				var tile = board[x + y * size];
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
	Chest,
	OreMine,
	Furnace,
	Assembler,
	WaterWell,
	Boiler,
	Pipe,
	SteamEngine,
];

var currentTool = -1;
var currentRotation = 0;

var objects = [];

function iterateTiles(func){
	for(var iy = 0; iy < size; iy++){
		for(var ix = 0; ix < size; ix++){
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
	}
	else if(selectedCoords !== null){
		var tile = board[selectedCoords[0] + selectedCoords[1] * size];
		if(tile.structure){
			tile.structure.rotation = (tile.structure.rotation + 1) % 4;
			updateTile(tile);
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
	ret += "<span style='display: inline-block; width: 30%'>";
	for(var k in recipe.input)
		ret += getHTML(generateItemImage(k, true, recipe.input[k]), true);
	ret += "</span><img src='img/rightarrow.png' style='width: 20px; height: 32px'><span style='display: inline-block; width: 30%'>";
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
		inventoryTarget = tile.structure;
		var recipeSelectButtonElem = document.getElementById('recipeSelectButton');
		recipeSelectButtonElem.style.display = !inventoryTarget.recipes ? "none" : "block";
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
		if(scrollPos[0] + 1 < size - viewPortWidth){
			scrollPos[0]++;
			updateAllTiles();
		}
	}
	else if(event.keyCode === 40){ // Down arrow
		if(scrollPos[1] + 1 < size - viewPortHeight){
			scrollPos[1]++;
			updateAllTiles();
		}
	}
}

window.onload = function(){
	window.addEventListener( 'keydown', onKeyDown, false );

	// Set element style to initialize invisible element.
	// CSS value won't be returned by JavaScript property access, so we
	// need to write the initial value from the code.
	var recipeSelector = document.getElementById('recipeSelector');
	recipeSelector.style.display = "none";

	viewPortWidth = 16;
	viewPortHeight = 12;

	generateBoard();


	// Set animation update function
	window.setInterval(function(){
		run();
	}, 50);
}

window.addEventListener('resize', onSize);

function getTileElem(x, y){
	return tileElems[x + y * viewPortWidth];
}

/// Update single tile graphics to match internal data
function updateTile(tile){
	var idx = board.indexOf(tile);
	var c = idx % size - scrollPos[0];
	var r = Math.floor(idx / size) - scrollPos[1];
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
		tile.structure.draw(tileElem);
	}
}

function updateAllTiles(){
	for(var iy = 0; iy < viewPortHeight; iy++){
		for(var ix = 0; ix < viewPortWidth; ix++)
			updateTile(board[(ix + scrollPos[0]) + (iy + scrollPos[1]) * size]);
	}
	for(var i = 0; i < objects.length; i++)
		positionObject(objects[i]);
	updateMiniMapPos();
}

function updateMiniMapPos(){
	miniMapCursorElem.style.left = (scrollPos[0] * miniMapSize / size) + 'px';
	miniMapCursorElem.style.top = (scrollPos[1] * miniMapSize / size) + 'px';
}

function updateTool(tool){
	if(0 <= tool && tool < toolElems.length){
		// Remove the children first, because old nodes may be present
		while(toolElems[tool].firstChild)
			toolElems[tool].removeChild(toolElems[tool].firstChild);
		toolDefs[tool].prototype.draw.call(toolDefs[tool].prototype, toolElems[tool]);
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
		var x = idx % size;
		var y = Math.floor(idx / size);
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

function createElements(){
	tileElems = new Array(viewPortWidth * viewPortHeight);

	// The containers are nested so that the inner container can be easily
	// discarded to recreate the whole game.
	var outerContainer = document.getElementById("container");
	if(container)
		outerContainer.removeChild(container);
	container = document.createElement("div");
	outerContainer.appendChild(container);
	if(cursorElem)
		cursorElem = null;
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
				var tile = board[c + r * size];

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
					tile.structure.tile = board[c + r * size];
					tile.structure.rotation = currentRotation;
					var symbol = tile.structure.miniMapSymbol = document.createElement('div');
					symbol.style.backgroundColor = '#0000ff';
					symbol.style.width = Math.ceil(miniMapSize / size) + 'px';
					symbol.style.height = Math.ceil(miniMapSize / size) + 'px';
					symbol.style.left = Math.floor(c * miniMapSize / size) + 'px';
					symbol.style.top = Math.floor(r * miniMapSize / size) + 'px';
					symbol.style.position = 'absolute';
					miniMapElem.appendChild(symbol);
					if(--player.inventory[tool.prototype.name] === 0)
						delete player.inventory[tool.prototype.name];
					updatePlayer();
				}
				else{
					// If mouse button is clicked without any tool selected, try to open it (WIP).
					showInventory(tile);
				}
				updateTile(tile);
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
	table.style.marginLeft = (-table.getBoundingClientRect().width / 2) + 'px';

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
		else if(toolCursorElem)
			toolCursorElem.style.display = 'none';
	}

	// Reset the state before initializing toolbar elements
	toolElems = [];
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
		var toolElem = document.createElement("div");
		toolElems.push(toolElem);
		toolElem.style.width = '31px';
		toolElem.style.height = '31px';
		toolElem.style.position = 'absolute';
		toolElem.style.top = '4px';
		toolElem.style.left = (32.0 * i + 4) + 'px';
		toolElem.style.border = '1px black solid';
		toolElem.style.textAlign = 'center';
		toolElem.onmousedown = function(e){
			selectTool(toolElems.indexOf(this));
		}
		toolBarElem.appendChild(toolElem);
		// Disable text selection
		toolElem.setAttribute("class", "noselect");
		toolDefs[i].prototype.draw(toolElem);
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
	toolBarElem.style.marginLeft = (-toolBarElem.getBoundingClientRect().width / 2) + 'px';

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
		scrollPos[0] = Math.min(size - viewPortWidth - 1, Math.max(0, Math.floor((evt.clientX - rect.left) / rect.width * size - viewPortWidth / 2.)));
		scrollPos[1] = Math.min(size - viewPortHeight - 1, Math.max(0, Math.floor((evt.clientY - rect.top) / rect.height * size - viewPortHeight / 2.)));
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
	playerElem.style.marginLeft = (-playerElem.getBoundingClientRect().width / 2) + 'px';

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

	miniMapElem.style.left = (tableRect.right + 20) + 'px';
	miniMapElem.style.top = '0px';
	miniMapElem.style.left = (tableRect.right + 20) + 'px';
	var mrect = miniMapElem.getBoundingClientRect();
	updateMiniMapPos();

	var rect = infoElem.getBoundingClientRect();
	infoElem.style.left = (tableRect.right + 20) + 'px';
	infoElem.style.top = (mrect.height + 20) + 'px';
	infoElem.style.width = '150px';
	infoElem.style.height = (tableRect.height - mrect.height - 20) + 'px';
	infoElem.style.textAlign = 'left';
}

function updateInfo(){
	if(!selectedCoords){
		infoElem.innerHTML = 'Empty tile';
		return;
	}
	if(size <= selectedCoords[0] && size <= selectedCoords[1])
		return;
	var tile = board[selectedCoords[0] + selectedCoords[1] * size];
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
	var img = document.createElement('img');
	img.src = getImageFile(i);
	var size = iconSize ? 32 : objViewSize;
	img.style.width = size + 'px';
	img.style.height = size + 'px';
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
	selectedTile = sel;
	var idx = tileElems.indexOf(sel);
	var vx = idx % viewPortWidth;
	var vy = Math.floor(idx / viewPortWidth);
	var ix = vx + scrollPos[0];
	var iy = vy + scrollPos[1];
	selectedCoords = [ix, iy];
	if(ix < size && iy < size){
		if(!cursorElem){
			cursorElem = document.createElement('div');
			cursorElem.style.border = '2px blue solid';
			cursorElem.style.pointerEvents = 'none';
			table.appendChild(cursorElem);
		}
		cursorElem.style.position = 'absolute';
		cursorElem.style.top = (tilesize * vy) + 'px';
		cursorElem.style.left = (tilesize * vx) + 'px';
		cursorElem.style.width = '30px';
		cursorElem.style.height = '30px';
		updateInfo();
		updateInventory();
	}
}

function generateBoard(){
	createElements();

	var sizeStr = document.getElementById("sizeSelect").value;
	size = parseInt(sizeStr);
	board = new Array(size * size);

	for(var i = 0; i < size * size; i++)
		board[i] = newblock(i);

	scrollPos[0] = Math.max(0, Math.floor((size - viewPortWidth) / 2.));
	scrollPos[1] = Math.max(0, Math.floor((size - viewPortHeight) / 2.));
	miniMapElem.style.width = miniMapSize + 'px';
	miniMapElem.style.height = miniMapSize + 'px';
	miniMapCursorElem.style.width = ((viewPortWidth + 1) * miniMapSize / size - 1) + 'px';
	miniMapCursorElem.style.height = ((viewPortHeight + 1) * miniMapSize / size - 1) + 'px';
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
	updatePlayer();
}
this.generateBoard = generateBoard;

function newblock(i){
	var x = i % size;
	var y = Math.floor(i / size);
	var obj = {
		structure: null,
		ironOre: 0,
		copperOre: 0,
		coalOre: 0,
	};
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

/// Check whether given tile allow objects on it, e.g. transport belts
function movableTile(x, y){
	var tx = Math.floor(x / tilesize);
	var ty = Math.floor(y / tilesize);
	if(tx < 0 || size < tx || ty < 0 || size < ty || isNaN(tx) || isNaN(ty))
		return false;
	// Ojects should not be placed on an empty tile
	if(!board[tx + ty * size].structure)
		return false;
	return board[tx + ty * size].structure.movable();
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

/// Insert an object on the board.  It could fail if there's already some object at the position.
function newObject(c, r, type){
	var obj = {id: serialNo++, type: type, x: c * tilesize + tilesize / 2, y: r * tilesize + tilesize / 2};
	if(0 <= c && c < size && 0 <= r && r < size && board[c + r * size].structure && !board[c + r * size].structure.movable()){
		return board[c + r * size].structure.input(obj);
	}
	if(hitCheck(obj.x, obj.y))
		return false;
	obj.elem = document.createElement('div');
	var file = getImageFile(type);
	if(file)
		obj.elem.style.backgroundImage = 'url("' + file + '")';
	else
		obj.elem.innerHTML = type;
	obj.elem.style.backgroundSize = objViewSize + 'px ' + objViewSize + 'px';
	// Debug graphic for bounding box
//			obj.elem.style.border = '1px solid';
	obj.elem.style.width = objViewSize + 'px';
	obj.elem.style.height = objViewSize + 'px';
	obj.elem.style.position = 'absolute';
	// Disable mouse events since we don't want an object to catch mouse event when
	// we're adding a structure to a tile.
	obj.elem.style.pointerEvents = 'none';
	obj.elem.setAttribute('class', 'noselect');
	positionObject(obj);
	table.appendChild(obj.elem);
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
	case 'Inserter':
		return 'img/inserter-base.png';
	case 'Chest':
		return 'img/chest.png';
	case 'Ore Mine':
		return "img/mine.png";
	case 'Furnace':
		return "img/furnace.png";
	case 'Assembler':
		return "img/assembler.png";
	case 'Water Well':
		return "img/waterwell.png";
	case 'Boiler':
		return "img/boiler.png";
	case 'Pipe':
		return "img/pipe.png";
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

var simstep = 0;

/// Simulation step function
function run(){
	// Iterate all floating objects to update
	for(var i = 0; i < objects.length; i++){
		var o = objects[i];

		// Obtain coordinates and tile at the position
		var tx = Math.floor(o.x / tilesize);
		var ty = Math.floor(o.y / tilesize);
		var tile = board[tx + ty * size];
		if(tile.structure)
			tile.structure.objectResponse(tile, o);
	}

	for(var ty = 0; ty < size; ty++){
		for(var tx = 0; tx < size; tx++){
			var tile = board[tx + ty * size];
			if(tile.structure)
				tile.structure.frameProc(tile);
		}
	}

	updateInfo();

	simstep++;
}

})();
