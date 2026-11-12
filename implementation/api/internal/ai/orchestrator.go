package ai

import (
	"context"
	"time"
)

// Orchestrator routes money-draft parsing to the configured default provider and
// falls back to the secondary provider ONLY for allowed transient/provider failures.
// It never calls both providers automatically on every request and bounds repair attempts to 1.
type Orchestrator struct {
	primary         MoneyDraftProvider
	fallback        MoneyDraftProvider
	timeout         time.Duration
	maxInputChars   int
	maxOutputTokens int
	allowRepair     bool
}

func NewOrchestrator(primary, fallback MoneyDraftProvider, timeout time.Duration, maxInputChars, maxOutputTokens int) *Orchestrator {
	if timeout <= 0 {
		timeout = 45 * time.Second
	}
	if maxInputChars <= 0 {
		maxInputChars = 2000
	}
	if maxOutputTokens <= 0 {
		maxOutputTokens = 1500
	}
	return &Orchestrator{
		primary:         primary,
		fallback:        fallback,
		timeout:         timeout,
		maxInputChars:   maxInputChars,
		maxOutputTokens: maxOutputTokens,
		allowRepair:     true,
	}
}

type AttemptTrace struct {
	Meta ProviderMetadata
}

type OrchestratorResult struct {
	Response StructuredDraftResponse
	Attempts []AttemptTrace
}

func (o *Orchestrator) Parse(ctx context.Context, req ParseMoneyDraftRequest) (OrchestratorResult, error) {
	cleaned, err := SanitizePromptInput(req.Narration, o.maxInputChars)
	if err != nil {
		return OrchestratorResult{}, err
	}
	req.Narration = cleaned
	req.MaxOutputTokens = o.maxOutputTokens

	callCtx, cancel := context.WithTimeout(ctx, o.timeout)
	defer cancel()

	var attempts []AttemptTrace
	if o.primary != nil && o.primary.IsConfigured() {
		resp, pErr := o.callWithSingleRepair(callCtx, o.primary, req, false, &attempts)
		if pErr == nil {
			return OrchestratorResult{Response: resp, Attempts: attempts}, nil
		}
		if !isFallbackEligible(pErr) || o.fallback == nil || !o.fallback.IsConfigured() || callCtx.Err() != nil {
			return OrchestratorResult{Response: resp, Attempts: attempts}, pErr
		}
	}

	if o.fallback != nil && o.fallback.IsConfigured() {
		resp, fErr := o.callWithSingleRepair(callCtx, o.fallback, req, true, &attempts)
		return OrchestratorResult{Response: resp, Attempts: attempts}, fErr
	}

	return OrchestratorResult{}, &ProviderError{
		Provider:  "orchestrator",
		Class:     FailureUnavailable,
		Retryable: true,
		Message:   "no ai provider is configured",
	}
}

func (o *Orchestrator) callWithSingleRepair(
	ctx context.Context,
	provider MoneyDraftProvider,
	req ParseMoneyDraftRequest,
	isFallback bool,
	attempts *[]AttemptTrace,
) (StructuredDraftResponse, error) {
	resp, err := provider.ParseMoneyDraft(ctx, req)
	resp.Meta.IsFallback = isFallback
	*attempts = append(*attempts, AttemptTrace{Meta: resp.Meta})
	if err == nil {
		return resp, nil
	}
	// At most ONE bounded schema-repair attempt when output failed strict JSON validation.
	if o.allowRepair && ClassifyError(err) == FailureInvalidOutput && ctx.Err() == nil {
		repairReq := req
		repairReq.RepairHint = "Previous response failed strict money-draft.v1 JSON schema validation. Return ONLY valid JSON with schema_version='money-draft.v1' and records array."
		resp2, err2 := provider.ParseMoneyDraft(ctx, repairReq)
		resp2.Meta.IsFallback = isFallback
		*attempts = append(*attempts, AttemptTrace{Meta: resp2.Meta})
		return resp2, err2
	}
	return resp, err
}

func isFallbackEligible(err error) bool {
	cls := ClassifyError(err)
	return cls == FailureTimeout || cls == FailureRateLimited || cls == FailureUpstream5xx || cls == FailureUnavailable
}
