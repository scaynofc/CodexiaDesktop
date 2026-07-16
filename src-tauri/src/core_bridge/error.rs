//! Core Bridge's only "logic": classifying *what kind* of transport failure
//! occurred. Deciding what to *do* about a failure (retry, back off, show
//! Disconnected) is Desktop Services' job, not this layer's.

use std::fmt;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum BridgeError {
    /// Could not open a connection at all (Core not running, wrong port, ...).
    ConnectionRefused,
    /// The request was sent but no response arrived in time.
    Timeout,
    /// A response arrived but wasn't HTTP 200.
    UnexpectedStatus(u16),
    /// The response body didn't deserialize into the expected shape.
    DecodeFailure(String),
}

impl fmt::Display for BridgeError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            BridgeError::ConnectionRefused => write!(f, "connection refused"),
            BridgeError::Timeout => write!(f, "request timed out"),
            BridgeError::UnexpectedStatus(code) => write!(f, "unexpected status {code}"),
            BridgeError::DecodeFailure(reason) => write!(f, "decode failure: {reason}"),
        }
    }
}

impl From<reqwest::Error> for BridgeError {
    fn from(error: reqwest::Error) -> Self {
        if error.is_timeout() {
            BridgeError::Timeout
        } else if error.is_connect() {
            BridgeError::ConnectionRefused
        } else if error.is_decode() {
            BridgeError::DecodeFailure(error.to_string())
        } else if let Some(status) = error.status() {
            BridgeError::UnexpectedStatus(status.as_u16())
        } else {
            BridgeError::ConnectionRefused
        }
    }
}
