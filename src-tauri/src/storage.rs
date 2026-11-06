use crate::{engine::validate_config, model::Config};
use std::{
    fs::{self, File},
    io::{Read, Write},
    path::{Path, PathBuf},
};
use tempfile::NamedTempFile;

pub struct Store {
    pub directory: PathBuf,
}

impl Store {
    pub fn load(&self) -> Result<Config, String> {
        self.load_path(&self.directory.join("config.json"))
    }
    pub fn load_backup(&self) -> Result<Config, String> {
        self.load_path(&self.directory.join("config.json.bak"))
    }
    fn load_path(&self, path: &Path) -> Result<Config, String> {
        let file = File::open(path).map_err(|_| "STORAGE_UNAVAILABLE")?;
        if file.metadata().map_err(|_| "STORAGE_UNAVAILABLE")?.len() > 1_048_576 {
            return Err("FILE_TOO_LARGE".into());
        }
        let mut content = String::new();
        file.take(1_048_577)
            .read_to_string(&mut content)
            .map_err(|_| "INVALID_STATE")?;
        let config: Config = serde_json::from_str(&content).map_err(|_| "INVALID_STATE")?;
        validate_config(&config)?;
        Ok(config)
    }
    pub fn exists(&self) -> bool {
        self.directory.join("config.json").exists()
    }
    pub fn save(&self, config: &Config, expected_revision: Option<u64>) -> Result<(), String> {
        validate_config(config)?;
        fs::create_dir_all(&self.directory).map_err(|_| "STORAGE_UNAVAILABLE")?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(&self.directory, fs::Permissions::from_mode(0o700))
                .map_err(|_| "STORAGE_UNAVAILABLE")?;
        }
        if self.exists() {
            let old = self.load()?;
            if expected_revision.is_some_and(|r| r != old.revision) {
                return Err("REVISION_CONFLICT".into());
            }
            self.write_atomic(
                "config.json.bak",
                &serde_json::to_vec_pretty(&old).map_err(|_| "INVALID_STATE")?,
            )?;
        }
        self.write_atomic(
            "config.json",
            &serde_json::to_vec_pretty(config).map_err(|_| "INVALID_STATE")?,
        )
    }
    pub fn recover(&self, config: &Config) -> Result<(), String> {
        validate_config(config)?;
        self.write_atomic(
            "config.json",
            &serde_json::to_vec_pretty(config).map_err(|_| "INVALID_STATE")?,
        )
    }
    pub fn write_atomic(&self, name: &str, data: &[u8]) -> Result<(), String> {
        fs::create_dir_all(&self.directory).map_err(|_| "STORAGE_UNAVAILABLE")?;
        let mut file = NamedTempFile::new_in(&self.directory).map_err(|_| "STORAGE_UNAVAILABLE")?;
        file.write_all(data).map_err(|_| "STORAGE_UNAVAILABLE")?;
        file.as_file()
            .sync_all()
            .map_err(|_| "STORAGE_UNAVAILABLE")?;
        file.persist(self.directory.join(name))
            .map_err(|_| "STORAGE_UNAVAILABLE")?;
        File::open(&self.directory)
            .and_then(|f| f.sync_all())
            .map_err(|_| "STORAGE_UNAVAILABLE")?;
        Ok(())
    }
    pub fn claim_notification(&self, id: &str) -> Result<bool, String> {
        let path = self.directory.join("notifications.json");
        let mut ids: Vec<String> = if path.exists() {
            let bytes = fs::read(&path).map_err(|_| "STORAGE_UNAVAILABLE")?;
            if bytes.len() > 65536 {
                return Err("INVALID_STATE".into());
            }
            serde_json::from_slice(&bytes).map_err(|_| "INVALID_STATE")?
        } else {
            Vec::new()
        };
        if ids.iter().any(|v| v == id) {
            return Ok(false);
        }
        ids.push(id.into());
        if ids.len() > 128 {
            ids.drain(0..ids.len() - 128);
        }
        self.write_atomic(
            "notifications.json",
            &serde_json::to_vec(&ids).map_err(|_| "INVALID_STATE")?,
        )?;
        Ok(true)
    }
    pub fn reset(&self) -> Result<(), String> {
        for name in ["config.json", "config.json.bak", "notifications.json"] {
            let path = self.directory.join(name);
            if path.exists() {
                fs::remove_file(path).map_err(|_| "STORAGE_UNAVAILABLE")?;
            }
        }
        Ok(())
    }
}
