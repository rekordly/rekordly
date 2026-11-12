package ai

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"time"
)

type GeminiProvider struct {
	apiKey     string
	model      string
	baseURL    string
	httpClient *http.Client
}

func NewGeminiProvider(apiKey, model string, timeout time.Duration) *GeminiProvider {
	if strings.TrimSpace(model) == "" {
		model = "gemini-2.5-flash"
	}
	if timeout <= 0 {
		timeout = 45 * time.Second
	}
	return &GeminiProvider{
		apiKey:     strings.TrimSpace(apiKey),
		model:      strings.TrimSpace(model),
		baseURL:    "https://generativelanguage.googleapis.com/v1beta/models",
		httpClient: &http.Client{Timeout: timeout},
	}
}

func (g *GeminiProvider) Name() string       { return "gemini" }
func (g *GeminiProvider) Model() string      { return g.model }
func (g *GeminiProvider) IsConfigured() bool { return g.apiKey != "" }

func (g *GeminiProvider) ParseMoneyDraft(ctx context.Context, req ParseMoneyDraftRequest) (StructuredDraftResponse, error) {
	start := time.Now()
	if !g.IsConfigured() {
		return StructuredDraftResponse{
			Meta: ProviderMetadata{Provider: g.Name(), Model: g.model, FailureClass: FailureUnavailable},
		}, &ProviderError{Provider: g.Name(), Class: FailureUnavailable, Retryable: true, Message: "gemini api key is not configured"}
	}

	maxTokens := req.MaxOutputTokens
	if maxTokens <= 0 {
		maxTokens = 1500
	}

	bodyObj := map[string]any{
		"systemInstruction": map[string]any{
			"parts": []map[string]string{{"text": SystemInstructions}},
		},
		"contents": []map[string]any{
			{
				"role": "user",
				"parts": []map[string]string{
					{"text": buildUserPayloadJSON(req)},
				},
			},
		},
		"generationConfig": map[string]any{
			"temperature":      0.1,
			"maxOutputTokens":  maxTokens,
			"responseMimeType": "application/json",
		},
	}
	bodyBytes, err := json.Marshal(bodyObj)
	if err != nil {
		return StructuredDraftResponse{}, err
	}

	endpoint := strings.TrimRight(g.baseURL, "/") + "/" + g.model + ":generateContent?key=" + g.apiKey
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(bodyBytes))
	if err != nil {
		return StructuredDraftResponse{}, err
	}
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := g.httpClient.Do(httpReq)
	if err != nil {
		cls := ClassifyError(err)
		if cls == FailureUnavailable {
			cls = FailureTimeout
		}
		return StructuredDraftResponse{
			Meta: ProviderMetadata{Provider: g.Name(), Model: g.model, LatencyMs: elapsedMs(start), FailureClass: cls},
		}, &ProviderError{Provider: g.Name(), Class: cls, Retryable: cls != FailureContextCancelled, Message: "gemini request failed"}
	}
	defer resp.Body.Close()

	respBytes, err := io.ReadAll(io.LimitReader(resp.Body, 256*1024))
	if err != nil {
		return StructuredDraftResponse{
			Meta: ProviderMetadata{Provider: g.Name(), Model: g.model, LatencyMs: elapsedMs(start), FailureClass: FailureUnavailable},
		}, &ProviderError{Provider: g.Name(), Class: FailureUnavailable, Retryable: true, Message: "failed reading gemini response"}
	}

	if resp.StatusCode != http.StatusOK {
		cls, retryable := classifyHTTPStatus(resp.StatusCode)
		return StructuredDraftResponse{
			Meta: ProviderMetadata{Provider: g.Name(), Model: g.model, LatencyMs: elapsedMs(start), FailureClass: cls},
		}, &ProviderError{Provider: g.Name(), Class: cls, Retryable: retryable, Message: "gemini returned non-200 status"}
	}

	var gemResp struct {
		Candidates []struct {
			Content struct {
				Parts []struct {
					Text string `json:"text"`
				} `json:"parts"`
			} `json:"content"`
		} `json:"candidates"`
		UsageMetadata struct {
			PromptTokenCount     int `json:"promptTokenCount"`
			CandidatesTokenCount int `json:"candidatesTokenCount"`
		} `json:"usageMetadata"`
	}
	if err := json.Unmarshal(respBytes, &gemResp); err != nil || len(gemResp.Candidates) == 0 || len(gemResp.Candidates[0].Content.Parts) == 0 {
		return StructuredDraftResponse{
			Meta: ProviderMetadata{Provider: g.Name(), Model: g.model, LatencyMs: elapsedMs(start), FailureClass: FailureInvalidOutput},
		}, &ProviderError{Provider: g.Name(), Class: FailureInvalidOutput, Retryable: false, Message: "gemini response missing candidate content"}
	}

	rawText := gemResp.Candidates[0].Content.Parts[0].Text
	parsed, parseErr := ParseStrictDraftJSON(rawText)
	meta := ProviderMetadata{
		Provider:        g.Name(),
		Model:           g.model,
		LatencyMs:       elapsedMs(start),
		InputTokens:     gemResp.UsageMetadata.PromptTokenCount,
		OutputTokens:    gemResp.UsageMetadata.CandidatesTokenCount,
		StructuredValid: parseErr == nil,
		FailureClass:    ClassifyError(parseErr),
	}
	parsed.Meta = meta
	if parseErr != nil {
		return parsed, parseErr
	}
	return parsed, nil
}

func classifyHTTPStatus(code int) (FailureClass, bool) {
	switch {
	case code == http.StatusTooManyRequests:
		return FailureRateLimited, true
	case code >= 500 && code < 600:
		return FailureUpstream5xx, true
	case code == http.StatusUnauthorized || code == http.StatusForbidden:
		return FailureAuthFailed, false
	default:
		return FailureUnavailable, false
	}
}
