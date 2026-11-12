package ai_test

import (
	"context"
	"testing"
	"time"

	"github.com/rekordly/rekordly-api/internal/ai"
	"github.com/stretchr/testify/require"
)

type stubProvider struct {
	name       string
	configured bool
	calls      int
	fn         func(ctx context.Context, req ai.ParseMoneyDraftRequest) (ai.StructuredDraftResponse, error)
}

func (s *stubProvider) Name() string       { return s.name }
func (s *stubProvider) Model() string      { return s.name + "-test-model" }
func (s *stubProvider) IsConfigured() bool { return s.configured }
func (s *stubProvider) ParseMoneyDraft(ctx context.Context, req ai.ParseMoneyDraftRequest) (ai.StructuredDraftResponse, error) {
	s.calls++
	return s.fn(ctx, req)
}

func TestOrchestrator_PrimarySuccessDoesNotCallFallback(t *testing.T) {
	primary := &stubProvider{
		name:       "gemini",
		configured: true,
		fn: func(ctx context.Context, req ai.ParseMoneyDraftRequest) (ai.StructuredDraftResponse, error) {
			return ai.StructuredDraftResponse{
				SchemaVersion: ai.SchemaVersionV1,
				Records: []ai.DraftRecord{{
					Scope: "personal", Direction: "money_out", Purpose: "personal_expense",
					AmountMajor: "2500", Currency: "NGN", EffectiveDate: "2026-11-10", Description: "Lunch",
				}},
			}, nil
		},
	}
	fallback := &stubProvider{name: "deepseek", configured: true}
	orch := ai.NewOrchestrator(primary, fallback, 5*time.Second, 2000, 1500)

	res, err := orch.Parse(context.Background(), ai.ParseMoneyDraftRequest{Narration: "Spent 2500 on lunch"})
	require.NoError(t, err)
	require.Equal(t, 1, primary.calls)
	require.Equal(t, 0, fallback.calls)
	require.Len(t, res.Response.Records, 1)
}

func TestOrchestrator_BoundedFallbackOnTransientFailure(t *testing.T) {
	primary := &stubProvider{
		name:       "gemini",
		configured: true,
		fn: func(ctx context.Context, req ai.ParseMoneyDraftRequest) (ai.StructuredDraftResponse, error) {
			return ai.StructuredDraftResponse{Meta: ai.ProviderMetadata{Provider: "gemini", FailureClass: ai.FailureRateLimited}},
				&ai.ProviderError{Provider: "gemini", Class: ai.FailureRateLimited, Retryable: true, Message: "429"}
		},
	}
	fallback := &stubProvider{
		name:       "deepseek",
		configured: true,
		fn: func(ctx context.Context, req ai.ParseMoneyDraftRequest) (ai.StructuredDraftResponse, error) {
			return ai.StructuredDraftResponse{
				SchemaVersion: ai.SchemaVersionV1,
				Records: []ai.DraftRecord{{
					Scope: "business", Direction: "money_out", Purpose: "business_direct_expense",
					AmountMajor: "8500", Currency: "NGN", EffectiveDate: "2026-11-10", Description: "Fuel",
				}},
				Meta: ai.ProviderMetadata{Provider: "deepseek", StructuredValid: true},
			}, nil
		},
	}
	orch := ai.NewOrchestrator(primary, fallback, 5*time.Second, 2000, 1500)
	res, err := orch.Parse(context.Background(), ai.ParseMoneyDraftRequest{Narration: "Fuel 8500"})
	require.NoError(t, err)
	require.Equal(t, 1, primary.calls)
	require.Equal(t, 1, fallback.calls)
	require.True(t, res.Attempts[1].Meta.IsFallback)
}

func TestStrictDraftJSON_RejectsPromptInjectionExtraFields(t *testing.T) {
	bad := `{"schema_version":"money-draft.v1","execute_sql":"DROP TABLE ledger_entries","records":[]}`
	_, err := ai.ParseStrictDraftJSON(bad)
	require.Error(t, err)
	require.Equal(t, ai.FailureInvalidOutput, ai.ClassifyError(err))

	_, err = ai.SanitizePromptInput("   ", 100)
	require.Error(t, err)

	_, err = ai.SanitizePromptInput("12345678901", 10)
	require.Error(t, err)
	require.Equal(t, ai.FailureInputTooLarge, ai.ClassifyError(err))
}
