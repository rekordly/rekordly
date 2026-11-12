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

type DeepSeekProvider struct {
	apiKey     string
	model      string
	baseURL    string
	httpClient *http.Client
}

func NewDeepSeekProvider(apiKey, model string, timeout time.Duration) *DeepSeekProvider {
	if strings.TrimSpace(model) == "" {
		model = "deepseek-chat"
	}
	if timeout <= 0 {
		timeout = 45 * time.Second
	}
	return &DeepSeekProvider{
		apiKey:     strings.TrimSpace(apiKey),
		model:      strings.TrimSpace(model),
		baseURL:    "https://api.deepseek.com/v1/chat/completions",
		httpClient: &http.Client{Timeout: timeout},
	}
}

func (d *DeepSeekProvider) Name() string       { return "deepseek" }
func (d *DeepSeekProvider) Model() string      { return d.model }
func (d *DeepSeekProvider) IsConfigured() bool { return d.apiKey != "" }

func (d *DeepSeekProvider) ParseMoneyDraft(ctx context.Context, req ParseMoneyDraftRequest) (StructuredDraftResponse, error) {
	start := time.Now()
	if !d.IsConfigured() {
		return StructuredDraftResponse{
			Meta: ProviderMetadata{Provider: d.Name(), Model: d.model, FailureClass: FailureUnavailable},
		}, &ProviderError{Provider: d.Name(), Class: FailureUnavailable, Retryable: true, Message: "deepseek api key is not configured"}
	}

	maxTokens := req.MaxOutputTokens
	if maxTokens <= 0 {
		maxTokens = 1500
	}

	bodyObj := map[string]any{
		"model":       d.model,
		"temperature": 0.1,
		"max_tokens":  maxTokens,
		"response_format": map[string]string{
			"type": "json_object",
		},
		"messages": []map[string]string{
			{"role": "system", "content": SystemInstructions},
			{"role": "user", "content": buildUserPayloadJSON(req)},
		},
	}
	bodyBytes, err := json.Marshal(bodyObj)
	if err != nil {
		return StructuredDraftResponse{}, err
	}

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, d.baseURL, bytes.NewReader(bodyBytes))
	if err != nil {
		return StructuredDraftResponse{}, err
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Authorization", "Bearer "+d.apiKey)

	resp, err := d.httpClient.Do(httpReq)
	if err != nil {
		cls := ClassifyError(err)
		if cls == FailureUnavailable {
			cls = FailureTimeout
		}
		return StructuredDraftResponse{
			Meta: ProviderMetadata{Provider: d.Name(), Model: d.model, LatencyMs: elapsedMs(start), FailureClass: cls},
		}, &ProviderError{Provider: d.Name(), Class: cls, Retryable: cls != FailureContextCancelled, Message: "deepseek request failed"}
	}
	defer resp.Body.Close()

	respBytes, err := io.ReadAll(io.LimitReader(resp.Body, 256*1024))
	if err != nil {
		return StructuredDraftResponse{
			Meta: ProviderMetadata{Provider: d.Name(), Model: d.model, LatencyMs: elapsedMs(start), FailureClass: FailureUnavailable},
		}, &ProviderError{Provider: d.Name(), Class: FailureUnavailable, Retryable: true, Message: "failed reading deepseek response"}
	}

	if resp.StatusCode != http.StatusOK {
		cls, retryable := classifyHTTPStatus(resp.StatusCode)
		return StructuredDraftResponse{
			Meta: ProviderMetadata{Provider: d.Name(), Model: d.model, LatencyMs: elapsedMs(start), FailureClass: cls},
		}, &ProviderError{Provider: d.Name(), Class: cls, Retryable: retryable, Message: "deepseek returned non-200 status"}
	}

	var dsResp struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
		Usage struct {
			PromptTokens     int `json:"prompt_tokens"`
			CompletionTokens int `json:"completion_tokens"`
		} `json:"usage"`
	}
	if err := json.Unmarshal(respBytes, &dsResp); err != nil || len(dsResp.Choices) == 0 {
		return StructuredDraftResponse{
			Meta: ProviderMetadata{Provider: d.Name(), Model: d.model, LatencyMs: elapsedMs(start), FailureClass: FailureInvalidOutput},
		}, &ProviderError{Provider: d.Name(), Class: FailureInvalidOutput, Retryable: false, Message: "deepseek response missing choice"}
	}

	rawText := dsResp.Choices[0].Message.Content
	parsed, parseErr := ParseStrictDraftJSON(rawText)
	meta := ProviderMetadata{
		Provider:        d.Name(),
		Model:           d.model,
		LatencyMs:       elapsedMs(start),
		InputTokens:     dsResp.Usage.PromptTokens,
		OutputTokens:    dsResp.Usage.CompletionTokens,
		StructuredValid: parseErr == nil,
		FailureClass:    ClassifyError(parseErr),
	}
	parsed.Meta = meta
	if parseErr != nil {
		return parsed, parseErr
	}
	return parsed, nil
}
