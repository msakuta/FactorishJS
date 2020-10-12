mod perlin_noise;
mod utils;

use wasm_bindgen::prelude::*;
use wasm_bindgen::JsCast;
use web_sys::{CanvasRenderingContext2d, HtmlCanvasElement, HtmlImageElement, ImageBitmap};

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

trait Structure {
    fn draw(
        &self,
        state: &FactorishState,
        context: &CanvasRenderingContext2d,
    ) -> Result<(), JsValue>;
}

struct TransportBelt {
    x: i32,
    y: i32,
}

impl Structure for TransportBelt {
    fn draw(
        &self,
        state: &FactorishState,
        context: &CanvasRenderingContext2d,
    ) -> Result<(), JsValue> {
        match state.image_belt.as_ref() {
            Some(img) => {
                for i in 0..2 {
                    context.draw_image_with_html_image_element_and_sw_and_sh_and_dx_and_dy_and_dw_and_dh(
                        img,
                        i as f64 * 32. - (state.sim_time * 16.) % 32.,
                        0.,
                        32.,
                        32.,
                        self.x as f64 * 32.,
                        self.y as f64 * 32.,
                        32.,
                        32.,
                    )?;
                }
            }
            None => return Err(JsValue::from_str("belt image not available")),
        }

        Ok(())
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
    structures: Vec<TransportBelt>,

    // rendering states
    cursor: [i32; 2],

    image: Option<ImageBitmap>,
    image_ore: Option<HtmlImageElement>,
    image_belt: Option<HtmlImageElement>,
    // vertex_shader: Option<WebGlShader>,
    // shader_program: Option<WebGlProgram>,
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
            cursor: [0; 2],
            image: None,
            image_ore: None,
            image_belt: None,
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
                TransportBelt { x: 10, y: 5 },
                TransportBelt { x: 11, y: 5 },
                TransportBelt { x: 12, y: 5 },
            ],
        })
    }

    #[wasm_bindgen]
    pub fn simulate(&mut self, delta_time: f64) {
        // console_log!("simulating delta_time {}, {}", delta_time, self.sim_time);
        self.delta_time = delta_time;
        self.sim_time += delta_time;
    }

    #[wasm_bindgen]
    pub fn mouse_move(&mut self, pos: &[f64]) -> Result<(), JsValue> {
        if pos.len() < 2 {
            return Err(JsValue::from_str("position must have 2 elements"));
        }
        self.cursor = [(pos[0] / 32.) as i32, (pos[1] / 32.) as i32];
        console_log!(
            "mouse_move: {}, {}, cursor: {}, {}",
            pos[0],
            pos[1],
            self.cursor[0],
            self.cursor[1]
        );
        Ok(())
    }

    #[wasm_bindgen]
    pub fn render_init(
        &mut self,
        canvas: HtmlCanvasElement,
        img: ImageBitmap,
    ) -> Result<(), JsValue> {
        self.viewport_width = canvas.width() as f64;
        self.viewport_height = canvas.height() as f64;
        self.image = Some(img);
        let load_image = |path| -> Result<_, JsValue> {
            let img = HtmlImageElement::new()?;
            img.set_attribute("src", path)?;
            img.style().set_property("display", "none")?;
            body().append_child(&img)?;
            Ok(img)
        };
        self.image_ore = Some(load_image("img/iron.png")?);
        self.image_belt = Some(load_image("img/transport.png")?);
        Ok(())
    }

    #[wasm_bindgen]
    pub fn render(&self, context: CanvasRenderingContext2d) -> Result<(), JsValue> {
        use std::f64;

        context.clear_rect(0., 0., self.viewport_width, self.viewport_height);

        match self.image.as_ref().zip(self.image_ore.as_ref()) {
            Some((img, img_ore)) => {
                for y in 0..self.viewport_height as u32 / 32 {
                    for x in 0..self.viewport_width as u32 / 32 {
                        context.draw_image_with_image_bitmap(
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

        context.set_stroke_style(&JsValue::from_str("blue"));
        context.set_line_width(2.);
        context.stroke_rect(
            (self.cursor[0] * 32) as f64,
            (self.cursor[1] * 32) as f64,
            32.,
            32.,
        );

        Ok(())
    }
}
