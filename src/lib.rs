mod perlin_noise;
mod utils;

use wasm_bindgen::prelude::*;
use wasm_bindgen::JsCast;
use web_sys::{CanvasRenderingContext2d, HtmlCanvasElement, HtmlDivElement, HtmlImageElement};

#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(js_namespace = console)]
    fn log(s: &str);
}

macro_rules! console_log {
    ($fmt:expr, $($arg1:expr),*) => {
        log(&format!($fmt, $($arg1),+))
    };
    ($fmt:expr) => {
        log($fmt)
    }
}

// When the `wee_alloc` feature is enabled, use `wee_alloc` as the global
// allocator.
#[cfg(feature = "wee_alloc")]
#[global_allocator]
static ALLOC: wee_alloc::WeeAlloc = wee_alloc::WeeAlloc::INIT;

#[wasm_bindgen]
extern "C" {
    fn alert(s: &str);
}

#[wasm_bindgen]
pub fn greet() {
    alert("Hello, factorish-js!");
}

fn window() -> web_sys::Window {
    web_sys::window().expect("no global `window` exists")
}

#[allow(dead_code)]
fn request_animation_frame(f: &Closure<dyn FnMut()>) {
    window()
        .request_animation_frame(f.as_ref().unchecked_ref())
        .expect("should register `requestAnimationFrame` OK");
}

fn document() -> web_sys::Document {
    window()
        .document()
        .expect("should have a document on window")
}

fn body() -> web_sys::HtmlElement {
    document().body().expect("document should have a body")
}

#[derive(Copy, Clone)]
struct Cell {
    iron_ore: u32,
}

#[derive(Eq, PartialEq)]
struct Position {
    x: i32,
    y: i32,
}

enum Rotation {
    Left,
    Top,
    Right,
    Bottom,
}

impl Rotation {
    fn delta(&self) -> (i32, i32) {
        match self {
            Rotation::Left => (-1, 0),
            Rotation::Top => (0, -1),
            Rotation::Right => (1, 0),
            Rotation::Bottom => (0, 1),
        }
    }

    fn next(&mut self) {
        *self = match self {
            Rotation::Left => Rotation::Top,
            Rotation::Top => Rotation::Right,
            Rotation::Right => Rotation::Bottom,
            Rotation::Bottom => Rotation::Left,
        }
    }

    fn angle_deg(&self) -> i32 {
        match self {
            Rotation::Left => 180,
            Rotation::Top => 270,
            Rotation::Right => 00,
            Rotation::Bottom => 90,
        }
    }

    fn angle_rad(&self) -> f64 {
        self.angle_deg() as f64 * std::f64::consts::PI / 180.
    }
}

enum ItemResponse {
    Move(i32, i32),
}

trait Structure {
    fn name(&self) -> &str;
    fn position(&self) -> &Position;
    fn draw(
        &self,
        state: &FactorishState,
        context: &CanvasRenderingContext2d,
    ) -> Result<(), JsValue>;
    fn desc(&self, _state: &FactorishState) -> String {
        String::from("")
    }
    fn frame_proc(&mut self, _state: &mut FactorishState) {}
    fn movable(&self) -> bool {
        false
    }
    fn rotate(&mut self) -> Result<(), ()> {
        Err(())
    }
    /// Called every frame for each item that is on this structure.
    fn item_response(&mut self, _item: &DropItem) -> Result<ItemResponse, ()> {
        Err(())
    }
}

const tilesize: i32 = 32;
const tool_defs: [&str; 2] = ["img/transport.png", "img/mine.png"];

struct TransportBelt {
    position: Position,
    rotation: Rotation,
}

impl TransportBelt {
    fn new(x: i32, y: i32, rotation: Rotation) -> Self {
        TransportBelt {
            position: Position { x, y },
            rotation,
        }
    }
}

impl Structure for TransportBelt {
    fn name(&self) -> &str {
        "TransportBelt"
    }

    fn position(&self) -> &Position {
        &self.position
    }

    fn draw(
        &self,
        state: &FactorishState,
        context: &CanvasRenderingContext2d,
    ) -> Result<(), JsValue> {
        match state.image_belt.as_ref() {
            Some(img) => {
                let (x, y) = (self.position.x as f64 * 32., self.position.y as f64 * 32.);
                context.save();
                context.translate(x + 16., y + 16.)?;
                context.rotate(self.rotation.angle_rad())?;
                context.translate(-(x + 16.), -(y + 16.))?;
                for i in 0..2 {
                    context.draw_image_with_html_image_element_and_sw_and_sh_and_dx_and_dy_and_dw_and_dh(
                        img,
                        i as f64 * 32. - (state.sim_time * 16.) % 32.,
                        0.,
                        32.,
                        32.,
                        self.position.x as f64 * 32.,
                        self.position.y as f64 * 32.,
                        32.,
                        32.,
                    )?;
                }
                context.restore();
            }
            None => return Err(JsValue::from_str("belt image not available")),
        }

        Ok(())
    }

    fn movable(&self) -> bool {
        true
    }

    fn rotate(&mut self) -> Result<(), ()> {
        self.rotation.next();
        Ok(())
    }

    fn item_response(&mut self, item: &DropItem) -> Result<ItemResponse, ()> {
        let moved_x = item.x + self.rotation.delta().0;
        let moved_y = item.y + self.rotation.delta().1;
        Ok(ItemResponse::Move(moved_x, moved_y))
    }
}

struct OreMine {
    position: Position,
    rotation: Rotation,
    cooldown: f64,
}

impl OreMine {
    fn new(x: i32, y: i32, rotation: Rotation) -> Self {
        OreMine {
            position: Position { x, y },
            rotation,
            cooldown: 0.,
        }
    }
}

impl Structure for OreMine {
    fn name(&self) -> &str {
        "OreMine"
    }

    fn position(&self) -> &Position {
        &self.position
    }

    fn draw(
        &self,
        state: &FactorishState,
        context: &CanvasRenderingContext2d,
    ) -> Result<(), JsValue> {
        let (x, y) = (self.position.x as f64 * 32., self.position.y as f64 * 32.);
        match state.image_mine.as_ref() {
            Some(img) => {
                context.draw_image_with_html_image_element(img, x, y)?;
            }
            None => return Err(JsValue::from_str("mine image not available")),
        }

        match state.image_direction.as_ref() {
            Some(img) => {
                context.save();
                context.translate(x + 16., y + 16.)?;
                context.rotate(self.rotation.angle_rad())?;
                context.translate(-(x + 16. + 4.) + 16., -(y + 16. + 8.) + 16.)?;
                context.draw_image_with_html_image_element(img, x, y)?;
                context.restore();
            }
            None => return Err(JsValue::from_str("direction image not available")),
        }

        Ok(())
    }

    fn desc(&self, state: &FactorishState) -> String {
        let tile = &state.board
            [self.position.x as usize + self.position.y as usize * state.width as usize];
        if 0 < tile.iron_ore {
            let recipe_time = 80.;
            // Progress bar
            format!("{}{}{}{}",
                format!("Progress: {:.0}%<br>", (recipe_time - self.cooldown) / recipe_time * 100.),
                "<div style='position: relative; width: 100px; height: 10px; background-color: #001f1f; margin: 2px; border: 1px solid #3f3f3f'>",
                format!("<div style='position: absolute; width: {}px; height: 10px; background-color: #ff00ff'></div></div>",
                    (recipe_time - self.cooldown) / recipe_time * 100.),
                // "Power: <div style='position: relative; width: 100px; height: 10px; background-color: #001f1f; margin: 2px; border: 1px solid #3f3f3f'>" +
                // "<div style='position: absolute; width: " + (this.maxPower ? (this.power) / this.maxPower * 100 : 0) + "px; height: 10px; background-color: #ff00ff'></div></div>" +
                format!("Expected output: {}", tile.iron_ore))
        // getHTML(generateItemImage("time", true, this.recipe.time), true) + "<br>" +
        // "Outputs: <br>" +
        // getHTML(generateItemImage(this.recipe.output, true, 1), true) + "<br>";
        } else {
            String::from("Empty")
        }
    }

    fn frame_proc(&mut self, state: &mut FactorishState) {
        let otile = &state.tile_at(&[self.position.x, self.position.y]);
        if otile.is_none() {
            return;
        }
        let tile = otile.unwrap();
        let recipe_time = 80.;
        if 0 < tile.iron_ore {
            // First, check if we need to refill the energy buffer in order to continue the current work.
            // if("Coal Ore" in this.inventory){
            //     var coalPower = 100;
            //     // Refill the energy from the fuel
            //     if(this.power < this.recipe.powerCost){
            //         this.power += coalPower;
            //         this.maxPower = this.power;
            //         this.removeItem("Coal Ore");
            //     }
            // }

            // Proceed only if we have sufficient energy in the buffer.
            let progress = 1.; //Math.min(this.power / this.recipe.powerCost, 1);
            if self.cooldown < progress {
                self.cooldown = 0.;
                let (vx, vy) = self.rotation.delta();
                let dx = self.position.x + vx;
                let dy = self.position.y + vy;
                if !state.hit_check(dx, dy, None) {
                    // let dest_tile = state.board[dx as usize + dy as usize * state.width as usize];
                    if let Err(code) = state.new_object(dx, dy, ItemType::IronOre) {
                        console_log!("Failed to create object: {:?}", code);
                    } else {
                        if let Some(tile) = state.tile_at_mut(&[self.position.x, self.position.y]) {
                            self.cooldown = recipe_time;
                            tile.iron_ore -= 1;
                        }
                    }
                }
            } else {
                self.cooldown -= progress;
                // self.power -= progress * self.recipe.powerCost;
            }
        }
    }

    fn rotate(&mut self) -> Result<(), ()> {
        self.rotation.next();
        Ok(())
    }
}

enum ItemType {
    IronOre,
}

const objsize: i32 = 8;

struct DropItem {
    id: u32,
    type_: ItemType,
    x: i32,
    y: i32,
}

impl DropItem {
    fn new(serial_no: &mut u32, type_: ItemType, c: i32, r: i32) -> Self {
        let itilesize = tilesize as i32;
        let ret = DropItem {
            id: *serial_no,
            type_,
            x: c * itilesize + itilesize / 2,
            y: r * itilesize + itilesize / 2,
        };
        *serial_no += 1;
        ret
    }
}
#[wasm_bindgen]
pub struct FactorishState {
    delta_time: f64,
    sim_time: f64,
    width: u32,
    height: u32,
    viewport_width: f64,
    viewport_height: f64,
    board: Vec<Cell>,
    structures: Vec<Box<dyn Structure>>,
    drop_items: Vec<DropItem>,
    serial_no: u32,
    selected_tool: usize,

    // rendering states
    cursor: Option<[i32; 2]>,
    info_elem: Option<HtmlDivElement>,

    image_dirt: Option<HtmlImageElement>,
    image_ore: Option<HtmlImageElement>,
    image_belt: Option<HtmlImageElement>,
    image_mine: Option<HtmlImageElement>,
    image_direction: Option<HtmlImageElement>,
    image_iron_ore: Option<HtmlImageElement>,
}

#[derive(Debug)]
enum NewObjectErr {
    BlockedByStructure,
    BlockedByItem,
    OutOfMap,
}

#[derive(Debug)]
enum RotateErr {
    NotFound,
    NotSupported,
}

#[wasm_bindgen]
impl FactorishState {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Result<FactorishState, JsValue> {
        console_log!("FactorishState constructor");

        let width = 64;
        let height = 64;

        Ok(FactorishState {
            delta_time: 0.1,
            sim_time: 0.0,
            width,
            height,
            viewport_height: 0.,
            viewport_width: 0.,
            cursor: None,
            selected_tool: 0,
            info_elem: None,
            image_dirt: None,
            image_ore: None,
            image_belt: None,
            image_mine: None,
            image_direction: None,
            image_iron_ore: None,
            board: {
                let mut ret = vec![Cell { iron_ore: 0 }; (width * height) as usize];
                for y in 0..height {
                    for x in 0..width {
                        ret[(x + y * width) as usize].iron_ore = ((perlin_noise::perlin_noise_pixel(
                            x as f64, y as f64, 3,
                        ) - 0.5)
                            * 100.)
                            .max(0.)
                            as u32;
                    }
                }
                ret
            },
            structures: vec![
                Box::new(TransportBelt::new(10, 6, Rotation::Left)),
                Box::new(TransportBelt::new(11, 6, Rotation::Left)),
                Box::new(TransportBelt::new(12, 6, Rotation::Left)),
                Box::new(OreMine::new(12, 7, Rotation::Top)),
            ],
            drop_items: vec![],
            serial_no: 0,
        })
    }

    #[wasm_bindgen]
    pub fn simulate(&mut self, delta_time: f64) -> Result<(), JsValue> {
        // console_log!("simulating delta_time {}, {}", delta_time, self.sim_time);
        self.delta_time = delta_time;
        self.sim_time += delta_time;

        // This is silly way to avoid borrow checker that temporarily move the structures
        // away from self so that they do not claim mutable borrow twice, but it works.
        let mut structures = std::mem::take(&mut self.structures);
        for structure in &mut structures {
            structure.frame_proc(self);
        }
        // let mut drop_items = std::mem::take(&mut self.drop_items);
        for i in 0..self.drop_items.len() {
            let item = &self.drop_items[i];
            if 0 < item.x
                && item.x < self.width as i32 * tilesize
                && 0 < item.y
                && item.y < self.height as i32 * tilesize
            {
                if let Some(ItemResponse::Move(moved_x, moved_y)) = structures
                    .iter_mut()
                    .find(|s| s.position().x == item.x / 32 && s.position().y == item.y / 32)
                    .and_then(|structure| structure.item_response(item).ok())
                {
                    if self.hit_check(moved_x, moved_y, Some(item.id)) {
                        continue;
                    }
                    let item = &mut self.drop_items[i];
                    item.x = moved_x;
                    item.y = moved_y;
                }
            }
        }
        self.structures = structures;
        // self.drop_items = drop_items;
        self.update_info();
        Ok(())
    }

    fn tile_at(&self, tile: &[i32]) -> Option<Cell> {
        if 0 <= tile[0]
            && tile[0] < self.width as i32
            && 0 <= tile[1]
            && tile[1] < self.height as i32
        {
            Some(self.board[tile[0] as usize + tile[1] as usize * self.width as usize])
        } else {
            None
        }
    }

    fn tile_at_mut(&mut self, tile: &[i32]) -> Option<&mut Cell> {
        if 0 <= tile[0]
            && tile[0] < self.width as i32
            && 0 <= tile[1]
            && tile[1] < self.height as i32
        {
            Some(&mut self.board[tile[0] as usize + tile[1] as usize * self.width as usize])
        } else {
            None
        }
    }

    /// Look up a structure at a given tile coordinates
    fn find_structure_tile(&self, tile: &[i32]) -> Option<&dyn Structure> {
        self.structures
            .iter()
            .find(|s| s.position().x == tile[0] && s.position().y == tile[1])
            .map(|s| s.as_ref())
    }

    /// Dirty hack to enable modifying a structure in an array.
    /// Instead of returning mutable reference, return an index into the array, so the
    /// caller can directly reference the structure from array `self.structures[idx]`.
    ///
    /// Because mutable version of find_structure_tile doesn't work.
    fn find_structure_tile_idx(&self, tile: &[i32]) -> Option<usize> {
        self.structures
            .iter()
            .enumerate()
            .find(|(_, s)| s.position().x == tile[0] && s.position().y == tile[1])
            .map(|(idx, _)| idx)
    }

    // fn find_structure_tile_mut<'a>(&'a mut self, tile: &[i32]) -> Option<&'a mut dyn Structure> {
    //     self.structures
    //         .iter_mut()
    //         .find(|s| s.position().x == tile[0] && s.position().y == tile[1])
    //         .map(|s| s.as_mut())
    // }

    fn find_structure(&self, pos: &[f64]) -> Option<&dyn Structure> {
        self.find_structure_tile(&[(pos[0] / 32.) as i32, (pos[1] / 32.) as i32])
    }

    fn update_info(&self) {
        if let Some(cursor) = self.cursor {
            if let Some(ref elem) = self.info_elem {
                if cursor[0] < self.width as i32 && cursor[1] < self.height as i32 {
                    elem.set_inner_html(
                        &if let Some(structure) = self.find_structure_tile(&cursor) {
                            format!(r#"Type: {}<br>{}"#, structure.name(), structure.desc(&self))
                        } else {
                            format!(
                                r#"Empty tile<br>
                                Iron Ore: {}<br>"#,
                                self.board
                                    [cursor[0] as usize + cursor[1] as usize * self.width as usize]
                                    .iron_ore,
                            )
                        },
                    );
                } else {
                    elem.set_inner_html("");
                }
            }
        }
    }

    /// Check whether given coordinates hits some object
    fn hit_check(&self, x: i32, y: i32, ignore: Option<u32>) -> bool {
        for item in &self.drop_items {
            if let Some(ignore_id) = ignore {
                if ignore_id == item.id {
                    continue;
                }
            }
            if (x - item.x).abs() < objsize && (y - item.y).abs() < objsize {
                return true;
            }
        }
        false
    }

    fn rotate(&mut self) -> Result<(), RotateErr> {
        if let Some(ref cursor) = self.cursor {
            if let Some(idx) = self.find_structure_tile_idx(cursor) {
                return Ok(self.structures[idx]
                    .rotate()
                    .map_err(|()| RotateErr::NotSupported)?);
            }
        }
        Err(RotateErr::NotFound)
    }

    /// Insert an object on the board.  It could fail if there's already some object at the position.
    fn new_object(&mut self, c: i32, r: i32, type_: ItemType) -> Result<(), NewObjectErr> {
        let obj = DropItem::new(&mut self.serial_no, type_, c, r);
        if 0 <= c && c < self.width as i32 && 0 <= r && r < self.height as i32 {
            if let Some(stru) = self.find_structure_tile(&[c, r]) {
                if !stru.movable() {
                    return Err(NewObjectErr::BlockedByStructure);
                }
            }
            // return board[c + r * ysize].structure.input(obj);
            if self.hit_check(obj.x, obj.y, Some(obj.id)) {
                return Err(NewObjectErr::BlockedByItem);
            }
            // obj.addElem();
            self.drop_items.push(obj);
            return Ok(());
        }
        Err(NewObjectErr::OutOfMap)
    }

    pub fn mouse_down(&mut self, pos: &[f64], button: i32) -> Result<(), JsValue> {
        if pos.len() < 2 {
            return Err(JsValue::from_str("position must have 2 elements"));
        }
        let cursor = Position {
            x: (pos[0] / 32.) as i32,
            y: (pos[1] / 32.) as i32,
        };
        if button == 0 {
            self.structures.push(match self.selected_tool {
                0 => Box::new(TransportBelt::new(cursor.x, cursor.y, Rotation::Left)),
                _ => Box::new(OreMine::new(cursor.x, cursor.y, Rotation::Left)),
            });
        } else if let Some(index) = self
            .structures
            .iter()
            .enumerate()
            .find(|(_, structure)| structure.position() == &cursor)
            .map(|item| item.0)
        {
            self.structures.remove(index);
        }
        console_log!("clicked: {}, {}", cursor.x, cursor.y);
        self.update_info();
        Ok(())
    }

    pub fn mouse_move(&mut self, pos: &[f64]) -> Result<(), JsValue> {
        if pos.len() < 2 {
            return Err(JsValue::from_str("position must have 2 elements"));
        }
        let cursor = [(pos[0] / 32.) as i32, (pos[1] / 32.) as i32];
        self.cursor = Some(cursor);
        console_log!("cursor: {}, {}", cursor[0], cursor[1]);
        self.update_info();
        Ok(())
    }

    pub fn mouse_leave(&mut self) -> Result<(), JsValue> {
        self.cursor = None;
        if let Some(ref elem) = self.info_elem {
            elem.set_inner_html("");
        }
        console_log!("mouse_leave");
        Ok(())
    }

    pub fn on_key_down(&mut self, key_code: i32) -> Result<(), JsValue> {
        if key_code == 82 {
            self.rotate()
                .map_err(|err| JsValue::from(format!("Rotate failed: {:?}", err)))?;
        }
        Ok(())
    }

    pub fn render_init(
        &mut self,
        canvas: HtmlCanvasElement,
        info_elem: HtmlDivElement,
    ) -> Result<(), JsValue> {
        self.viewport_width = canvas.width() as f64;
        self.viewport_height = canvas.height() as f64;
        self.info_elem = Some(info_elem);
        let load_image = |path| -> Result<_, JsValue> {
            let img = HtmlImageElement::new()?;
            img.set_attribute("src", path)?;
            img.style().set_property("display", "none")?;
            body().append_child(&img)?;
            Ok(img)
        };
        self.image_dirt = Some(load_image("img/dirt.png")?);
        self.image_ore = Some(load_image("img/iron.png")?);
        self.image_belt = Some(load_image("img/transport.png")?);
        self.image_mine = Some(load_image("img/mine.png")?);
        self.image_direction = Some(load_image("img/direction.png")?);
        self.image_iron_ore = Some(load_image("img/ore.png")?);
        Ok(())
    }

    pub fn tool_defs(&self) -> Result<js_sys::Array, JsValue> {
        Ok(tool_defs
            .iter()
            .map(|tool| JsValue::from_str(*tool))
            .collect::<js_sys::Array>())
    }

    pub fn selected_tool(&self) -> JsValue {
        JsValue::from(self.selected_tool as f64)
    }

    pub fn select_tool(&mut self, tool: usize) {
        self.selected_tool = tool;
    }

    #[wasm_bindgen]
    pub fn render(&self, context: CanvasRenderingContext2d) -> Result<(), JsValue> {
        use std::f64;

        context.clear_rect(0., 0., self.viewport_width, self.viewport_height);

        match self.image_dirt.as_ref().zip(self.image_ore.as_ref()) {
            Some((img, img_ore)) => {
                for y in 0..self.viewport_height as u32 / 32 {
                    for x in 0..self.viewport_width as u32 / 32 {
                        context.draw_image_with_html_image_element(
                            img,
                            x as f64 * 32.,
                            y as f64 * 32.,
                        )?;
                        let ore = self.board[(x + y * self.width) as usize].iron_ore;
                        if 0 < ore {
                            let idx = (ore / 10).min(3);
                            // console_log!("x: {}, y: {}, idx: {}, ore: {}", x, y, idx, ore);
                            context.draw_image_with_html_image_element_and_sw_and_sh_and_dx_and_dy_and_dw_and_dh(
                                img_ore, (idx * 32) as f64, 0., 32., 32., x as f64 * 32., y as f64 * 32., 32., 32.)?;
                        }
                    }
                }
                // console_log!(
                //     "iron ore: {}",
                //     self.board.iter().fold(0, |accum, val| accum + val.iron_ore)
                // );
            }
            _ => {
                return Err(JsValue::from_str("image not available"));
            }
        }

        for structure in &self.structures {
            structure.draw(&self, &context)?;
        }

        for item in &self.drop_items {
            if let Some(ref img_iron_ore) = self.image_iron_ore {
                context.draw_image_with_html_image_element(
                    img_iron_ore,
                    item.x as f64 - 8.,
                    item.y as f64 - 8.,
                )?;
            }
        }

        if let Some(ref cursor) = self.cursor {
            context.set_stroke_style(&JsValue::from_str("blue"));
            context.set_line_width(2.);
            context.stroke_rect((cursor[0] * 32) as f64, (cursor[1] * 32) as f64, 32., 32.);
        }

        Ok(())
    }
}
