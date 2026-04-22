//! OS keychain integration via the `keyring` crate. The Electron build
//! used `keytar`; the API the renderer sees (`window.idex.keychain.get/set`)
//! is identical.
//!
//! Service / namespace keys are owned by `@idex/types`'s
//! `KEYCHAIN_SERVICE` constant ("com.devvcore.idex"). We accept the
//! account key as a free string so adding a new secret only touches
//! TS — the Rust binary doesn't need a recompile.

use keyring::Entry;

const SERVICE: &str = "com.devvcore.idex";

#[tauri::command]
pub fn keychain_get(key: String) -> Result<Option<String>, String> {
    let entry = Entry::new(SERVICE, &key).map_err(|e| e.to_string())?;
    match entry.get_password() {
        Ok(value) => Ok(Some(value)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub fn keychain_set(key: String, value: String) -> Result<bool, String> {
    let entry = Entry::new(SERVICE, &key).map_err(|e| e.to_string())?;
    entry.set_password(&value).map_err(|e| e.to_string())?;
    Ok(true)
}
