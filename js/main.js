import init, { FactorishState } from "../pkg/factorish_js.js";

window.onload = async function(){
    await init();
    let sim = new FactorishState(updateInventory);

    const canvas = document.getElementById('canvas');
    const canvasSize = canvas.getBoundingClientRect();
    const ctx = canvas.getContext('2d');
    const container = document.getElementById('container2');
    const containerRect = container.getBoundingClientRect();
    const inventoryElem = document.getElementById('inventory2');

    const infoElem = document.createElement('div');
    infoElem.style.position = 'absolute';
    infoElem.style.backgroundColor = '#ffff7f';
    infoElem.style.border = '1px solid #00f';
    container.appendChild(infoElem);

    const selectedInventory = null;
    const selectedInventoryItem = null;

    const tilesize = 32;
    const objViewSize = tilesize / 2; // View size is slightly greater than hit detection radius
    const tableMargin = 10.;
    const miniMapSize = 200;
    const miniMapElem = document.createElement('div');
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
    miniMapElem.style.left = (canvasSize.right - containerRect.left + tableMargin) + 'px';
    miniMapElem.style.top = (canvasSize.top - containerRect.top) + 'px';
    const mrect = miniMapElem.getBoundingClientRect();

    infoElem.style.left = (canvasSize.right + tableMargin) + 'px';
    infoElem.style.top = (mrect.bottom - containerRect.top + tableMargin) + 'px';
    infoElem.style.width = miniMapSize + 'px';
    infoElem.style.height = (canvasSize.height - mrect.height - tableMargin) + 'px';
    infoElem.style.textAlign = 'left';

    var toolDefs = sim.tool_defs();
    var toolElems = [];
    var toolOverlays = [];
    var toolCursorElem;
    // Tool bar
    var toolBarElem = document.createElement('div');
    toolBarElem.style.borderStyle = 'solid';
    toolBarElem.style.borderWidth = '1px';
    toolBarElem.style.borderColor = 'red';
    toolBarElem.style.position = 'relative';
    toolBarElem.margin = '3px';
    toolBarElem.style.left = '50%';
    toolBarElem.style.width = ((toolDefs.length + 1) * tilesize + 8) + 'px';
    toolBarElem.style.height = (tilesize + 8) + 'px';
    container.appendChild(toolBarElem);
    var toolBarCanvases = [];
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

        var toolElem = document.createElement("canvas");
        toolElems.push(toolElem);
        toolElem.width = 32;
        toolElem.height = 32;
        toolElem.style.left = '0px';
        toolElem.style.top = '0px';
        toolElem.style.width = '31px';
        toolElem.style.height = '31px';
        toolElem.style.position = 'absolute';
        toolElem.style.textAlign = 'center';
        toolElem.onmousedown = function(e){
            var currentTool = toolElems.indexOf(this);
            var state = sim.select_tool(currentTool);
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
            toolCursorElem.style.display = state ? 'block' : 'none';
        }
        toolElem.onmouseenter = function(e){
            var idx = toolElems.indexOf(this);
            if(idx < 0 || toolDefs.length <= idx)
                return;
            var tool = toolDefs[idx];
            // var r = this.getBoundingClientRect();
            // var cr = container.getBoundingClientRect();
            // toolTip.style.left = (r.left - cr.left) + 'px';
            // toolTip.style.top = (r.bottom - cr.top) + 'px';
            // toolTip.style.display = 'block';
            // var desc = tool.prototype.toolDesc();
            // if(0 < desc.length)
            //     desc = '<br>' + desc;
            // toolTip.innerHTML = '<b>' + tool.prototype.name + '</b>' + desc;
        };
        toolElem.onmouseleave = function(e){
            // toolTip.style.display = 'none';
        };
        toolContainer.appendChild(toolElem);
        toolBarCanvases.push(toolElem);
        toolContainer.appendChild(overlay);
        toolBarElem.appendChild(toolContainer);
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

    sim.render_init(canvas, infoElem);

    updateToolBarImage();

    function updateToolBarImage(){
        for(var i = 0; i < toolBarCanvases.length; i++){
            var canvasElem = toolBarCanvases[i];
            var context = canvasElem.getContext('2d');
            sim.render_tool(i, context);
        }
    }

    function rotate(){
        var newRotation = sim.rotate_tool();
        updateToolBarImage();
    }

    function updateToolBar(){
        var inventory = sim.tool_inventory();
        for(var i = 0; i < inventory.length; i++)
            toolOverlays[i].innerHTML = inventory[i];
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

    function updateInventory(inventory){
        updateInventoryInt(playerInventoryElem, sim, false, inventory);
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

    function updateInventoryInt(elem, owner, icons, inventory){
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

        for(var i in inventory){
            var [name, v] = inventory[i];
            var div;
            if(icons){
                div = generateItemImage(name, true, v);
            }
            else{
                div = document.createElement('div');
                div.appendChild(generateItemImage(name));
                var text = document.createElement('span');
                text.innerHTML = v + ' ' + name;
                div.appendChild(text);
                div.style.textAlign = 'left';
            }
            if(selectedInventory === owner && selectedInventoryItem === name)
                div.style.backgroundColor = '#00ffff';
            div.setAttribute('class', 'noselect');
            div.itemName = name;
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

    inventoryElem.style.display = 'none';

    const playerElem = document.createElement('div');
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

    const playerInventoryElem = document.createElement('div');
    playerInventoryElem.style.position = 'relative';
    playerInventoryElem.style.overflowY = 'scroll';
    playerInventoryElem.style.width = '100%';
    playerInventoryElem.style.height = '100%';
    playerInventoryElem.style.textAlign = 'left';
    playerElem.appendChild(playerInventoryElem);

    canvas.addEventListener("mousedown", function(evt){
        sim.mouse_down([evt.offsetX, evt.offsetY], evt.button);
        updateToolBar();
        evt.stopPropagation();
        evt.preventDefault();
        return false;
    });
    canvas.addEventListener("contextmenu", function(evt){
        evt.preventDefault();
    });
    canvas.addEventListener("mousemove", function(evt){
        sim.mouse_move([evt.offsetX, evt.offsetY]);
    });

    canvas.addEventListener("mouseleave", function(evt){
        sim.mouse_leave([evt.offsetX, evt.offsetY]);
    });

    function onKeyDown(event){
        if(sim.on_key_down(event.keyCode))
            updateToolBarImage();
    }
    window.addEventListener( 'keydown', onKeyDown, false );

    updateToolBar();

    updateInventory(sim.get_player_inventory());

    window.setInterval(function(){
        sim.simulate(0.05);
        let result = sim.render(ctx);
        // console.log(result);
    }, 50);
    // simulate()
}
