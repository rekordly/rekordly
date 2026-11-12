package storage_test

import (
	"bytes"
	"fmt"
	"testing"

	"github.com/rekordly/rekordly-api/internal/storage"
	"github.com/stretchr/testify/require"
)

func TestGenerateDocumentPDF_ValidAndMultiPage(t *testing.T) {
	snap := storage.DocumentSnapshot{
		DocumentType:        "invoice",
		DocumentNumber:      "INV-2026-001",
		DocumentDate:        "2026-11-12",
		Status:              "issued",
		Version:             1,
		SenderName:          "Rekordly Store (Ltd)",
		RecipientName:       "Ada Lovelace",
		Currency:            "NGN",
		SubtotalDisplay:     "10000.00",
		TaxDisplay:          "750.00",
		TotalDisplay:        "10750.00",
		PaymentState:        "unpaid",
		DisclosureText:      "Immutable snapshot",
		RenderSchemaVersion: "pdf-snapshot.v1",
	}
	for i := 1; i <= 60; i++ {
		snap.Lines = append(snap.Lines, struct {
			Description string `json:"description"`
			Quantity    string `json:"quantity"`
			Amount      string `json:"amount"`
		}{Description: fmt.Sprintf("Line item %d", i), Quantity: "1", Amount: "100.00"})
	}

	pdfBytes, hash, pageCount, err := storage.GenerateDocumentPDF(snap)
	require.NoError(t, err)
	require.True(t, bytes.HasPrefix(pdfBytes, []byte("%PDF-1.4")))
	require.True(t, bytes.Contains(pdfBytes, []byte("%%EOF")))
	require.Equal(t, 2, pageCount)
	require.Len(t, hash, 64)
}
