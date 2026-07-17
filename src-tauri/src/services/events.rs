//! Owns Log Center's behavior: fetching CodexiaCore's derived system-event
//! log. Deliberately thin - same reasoning as `services::metrics`/
//! `services::runtime`: events only change as a side effect of a task
//! running or a provider call failing, so there's no independent-of-
//! Desktop event source to poll for. See
//! docs/adr/012-log-center-derived-events.md.

use crate::core_bridge::{BridgeError, CoreHttpClient, SystemEvent};

/// What Core Bridge exposes for fetching events - a trait (not the
/// concrete `CoreHttpClient`) so `fetch_events` can be tested with a
/// scripted fake, mirroring `services::metrics`'s `MetricsFetcher`.
pub trait EventsFetcher: Send + Sync {
    fn get_events(
        &self,
        limit: u32,
    ) -> impl std::future::Future<Output = Result<Vec<SystemEvent>, BridgeError>> + Send;
}

impl EventsFetcher for CoreHttpClient {
    async fn get_events(&self, limit: u32) -> Result<Vec<SystemEvent>, BridgeError> {
        CoreHttpClient::get_events(self, limit).await
    }
}

impl<F: EventsFetcher> EventsFetcher for std::sync::Arc<F> {
    async fn get_events(&self, limit: u32) -> Result<Vec<SystemEvent>, BridgeError> {
        F::get_events(self, limit).await
    }
}

/// Fetches the current event log - called on Log Center's mount and by
/// its "Refresh" button, always a fresh round trip.
pub async fn fetch_events<F: EventsFetcher>(
    fetcher: &F,
    limit: u32,
) -> Result<Vec<SystemEvent>, BridgeError> {
    fetcher.get_events(limit).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core_bridge::{SystemEventSource, SystemEventType};
    use std::collections::HashMap;

    fn event() -> SystemEvent {
        SystemEvent {
            timestamp: "2026-07-17T00:00:00+00:00".to_string(),
            event_type: SystemEventType::Error,
            source: SystemEventSource::Provider,
            message: "openrouter/model-a failed (rate_limit)".to_string(),
            task_id: None,
            metadata: HashMap::new(),
        }
    }

    struct ScriptedFetcher {
        response: Result<Vec<SystemEvent>, BridgeError>,
    }

    impl EventsFetcher for ScriptedFetcher {
        async fn get_events(&self, _limit: u32) -> Result<Vec<SystemEvent>, BridgeError> {
            self.response.clone()
        }
    }

    #[tokio::test]
    async fn fetch_events_returns_whatever_the_fetcher_provides() {
        let fetcher = ScriptedFetcher {
            response: Ok(vec![event()]),
        };

        let result = fetch_events(&fetcher, 100).await.unwrap();

        assert_eq!(result.len(), 1);
        assert_eq!(result[0].source, SystemEventSource::Provider);
    }

    #[tokio::test]
    async fn fetch_events_propagates_a_transport_error() {
        let fetcher = ScriptedFetcher {
            response: Err(BridgeError::ConnectionRefused),
        };

        let result = fetch_events(&fetcher, 100).await;

        assert_eq!(result, Err(BridgeError::ConnectionRefused));
    }
}
