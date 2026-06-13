use serde::{Deserialize, Serialize};
use std::path::PathBuf;

const DEFAULT_API_BASE_URL: &str = "http://localhost:9000";
const CONFIG_DIR_NAME: &str = "CloudFlow Pro";
const CONFIG_FILE_NAME: &str = "desktop-config.json";

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DesktopConfigFile {
    api_base_url: Option<String>,
    ws_base_url: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct DesktopRuntimeConfig {
    api_base_url: String,
    ws_base_url: Option<String>,
    config_path: String,
    source: String,
}

fn normalize_base_url(value: Option<String>) -> Option<String> {
    value
        .map(|item| item.trim().trim_end_matches('/').to_string())
        .filter(|item| !item.is_empty())
}

fn config_path() -> Result<PathBuf, String> {
    let appdata = std::env::var_os("APPDATA")
        .ok_or_else(|| "Cannot locate Windows APPDATA directory".to_string())?;
    Ok(PathBuf::from(appdata)
        .join(CONFIG_DIR_NAME)
        .join(CONFIG_FILE_NAME))
}

#[tauri::command]
fn load_desktop_config() -> Result<DesktopRuntimeConfig, String> {
    let path = config_path()?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|err| format!("Failed to create desktop config directory: {err}"))?;
    }

    let fallback = || DesktopRuntimeConfig {
        api_base_url: DEFAULT_API_BASE_URL.to_string(),
        ws_base_url: None,
        config_path: path.to_string_lossy().to_string(),
        source: "default".to_string(),
    };

    let content = match std::fs::read_to_string(&path) {
        Ok(content) => content,
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => return Ok(fallback()),
        Err(err) => return Err(format!("Failed to read desktop config file: {err}")),
    };

    let file: DesktopConfigFile =
        serde_json::from_str(&content).map_err(|err| format!("Invalid desktop config JSON: {err}"))?;

    Ok(DesktopRuntimeConfig {
        api_base_url: normalize_base_url(file.api_base_url)
            .unwrap_or_else(|| DEFAULT_API_BASE_URL.to_string()),
        ws_base_url: normalize_base_url(file.ws_base_url),
        config_path: path.to_string_lossy().to_string(),
        source: "file".to_string(),
    })
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![load_desktop_config])
        .run(tauri::generate_context!())
        .expect("failed to run CloudFlow Pro desktop app");
}
