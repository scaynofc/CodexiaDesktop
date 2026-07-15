//! Tauri commands - the thin `invoke()` surface the Presentation layer
//! calls. Each command dispatches to Desktop Services; commands never
//! contain business logic themselves.

/// Phase 1 smoke-test command only - proves the module wiring (main.rs ->
/// lib.rs -> commands) works end to end. Will be removed once Phase 2
/// adds the first real Desktop Services-backed command.
#[tauri::command]
pub fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn greet_includes_the_given_name() {
        assert_eq!(
            greet("Codexia"),
            "Hello, Codexia! You've been greeted from Rust!"
        );
    }

    #[test]
    fn greet_handles_an_empty_name() {
        assert_eq!(greet(""), "Hello, ! You've been greeted from Rust!");
    }
}
