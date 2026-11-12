package catalogue

import (
	"encoding/json"
	"time"
)

type ActorType string

const (
	ActorUser      ActorType = "user"
	ActorGuest     ActorType = "guest"
	ActorService   ActorType = "service"
	ActorProvider  ActorType = "provider"
	ActorAdmin     ActorType = "admin"
	ActorMigration ActorType = "migration"
)

type ActorRef struct {
	Type ActorType `json:"type"`
	ID   string    `json:"id"`
}

type SubjectRef struct {
	Type string `json:"type"` // personal | business | account
	ID   string `json:"id"`
}

type AggregateRef struct {
	Type    string `json:"type"`
	ID      string `json:"id"`
	Version string `json:"version"`
}

type EventMetadata struct {
	Schema int `json:"schema"`
}

// CommandEnvelope is the canonical typed command envelope from Blueprint 18 §4.
// Actor, role, plan, and workspace ownership are always resolved server-side.
type CommandEnvelope struct {
	CommandType     string          `json:"command_type"`
	CommandVersion  int             `json:"command_version"`
	IdempotencyKey  string          `json:"idempotency_key"`
	ActorUserID     int64           `json:"actor_user_id"`
	WorkspaceID     int64           `json:"workspace_id"`
	ExpectedVersion string          `json:"expected_version,omitempty"`
	ClientCommandID string          `json:"client_command_id,omitempty"`
	Payload         json.RawMessage `json:"payload"`
}

// EventEnvelope is the canonical typed event envelope from Blueprint 18 §6.
type EventEnvelope struct {
	EventID       string          `json:"event_id"`
	EventType     string          `json:"event_type"`
	EventVersion  int             `json:"event_version"`
	OccurredAt    time.Time       `json:"occurred_at"`
	RecordedAt    time.Time       `json:"recorded_at"`
	Actor         ActorRef        `json:"actor"`
	Subject       SubjectRef      `json:"subject"`
	Aggregate     AggregateRef    `json:"aggregate"`
	CommandID     string          `json:"command_id,omitempty"`
	CorrelationID string          `json:"correlation_id,omitempty"`
	CausationID   string          `json:"causation_id,omitempty"`
	Payload       json.RawMessage `json:"payload"`
	Metadata      EventMetadata   `json:"metadata"`
}
