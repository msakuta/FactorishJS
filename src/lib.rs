mod utils;

use wasm_bindgen::prelude::*;
use wasm_bindgen::JsCast;
use web_sys::{HtmlCanvasElement, CanvasRenderingContext2d, ImageBitmap};
use std::cell::RefCell;
use std::rc::Rc;

#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(js_namespace = console)]
    unsafe fn log(s: &str);
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
extern {
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

#[wasm_bindgen]
struct FactorishState{
    delta_time: f64,
    sim_time: f64,
    height: f64,
    width: f64,
    image: Option<ImageBitmap>,
    // vertex_shader: Option<WebGlShader>,
    // shader_program: Option<WebGlProgram>,
}

#[wasm_bindgen]
impl FactorishState {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Result<FactorishState, JsValue> {
        console_log!("FactorishState constructor");

        Ok(FactorishState{delta_time: 0.1, sim_time: 0.0,
            height: 0.,
            width: 0.,
            image: None,
            })
    }

    #[wasm_bindgen]
    pub fn simulate(&mut self, delta_time: f64) {
        console_log!("simulating delta_time {}, {}", delta_time, self.sim_time);
        self.delta_time = delta_time;
        self.sim_time += delta_time;
    }

    #[wasm_bindgen]
    pub fn render_init(&mut self, canvas: HtmlCanvasElement, img: ImageBitmap) -> Result<(), JsValue> {
        self.width = canvas.width() as f64;
        self.height = canvas.height() as f64;
        self.image = Some(img);
        Ok(())
    }

    #[wasm_bindgen]
    pub fn render(&self, context: CanvasRenderingContext2d) -> Result<(), JsValue> {
        use std::f64;

        context.clear_rect(0., 0., self.width, self.height);

        match self.image.as_ref() {
            Some(img) => {
                console_log!("width: {}", self.width);
                for y in 0..self.height as u32 / 32 {
                    for x in 0..self.width as u32 / 32 {
                        context.draw_image_with_image_bitmap(img, x as f64 * 32., y as f64 * 32.)?;
                    }
                }
            }
            None => {
                return Err(JsValue::from_str("image not available"));
            }
        }
        Ok(())
    }
}
