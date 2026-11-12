package storage

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"
)

var ErrInvalidPDF = errors.New("generated artifact failed PDF validation")

type DocumentSnapshot struct {
	DocumentType        string `json:"document_type"`
	DocumentNumber      string `json:"document_number"`
	DocumentDate        string `json:"document_date"`
	Status              string `json:"status"`
	Version             int32  `json:"version"`
	SenderName          string `json:"sender_name"`
	RecipientName       string `json:"recipient_name"`
	Currency            string `json:"currency"`
	SubtotalDisplay     string `json:"subtotal_display"`
	TaxDisplay          string `json:"tax_display"`
	TotalDisplay        string `json:"total_display"`
	PaymentState        string `json:"payment_state"`
	DisclosureText      string `json:"disclosure_text"`
	RenderSchemaVersion string `json:"render_schema_version"`
	Lines               []struct {
		Description string `json:"description"`
		Quantity    string `json:"quantity"`
		Amount      string `json:"amount"`
	} `json:"lines"`
}

// GenerateDocumentPDF renders a deterministic, isolated, valid PDF 1.4 binary from an immutable snapshot
// with zero external network calls or mutable live-table lookups.
func GenerateDocumentPDF(snap DocumentSnapshot) ([]byte, string, int, error) {
	lines := []string{
		fmt.Sprintf("%s %s (v%d)", strings.ToUpper(snap.DocumentType), snap.DocumentNumber, snap.Version),
		fmt.Sprintf("From: %s", sanitizePDFText(snap.SenderName)),
		fmt.Sprintf("To: %s", sanitizePDFText(snap.RecipientName)),
		fmt.Sprintf("Date: %s   Status: %s   Payment: %s", snap.DocumentDate, snap.Status, snap.PaymentState),
		"------------------------------------------------------------",
	}
	for _, l := range snap.Lines {
		lines = append(lines, fmt.Sprintf("%s  x%s  %s", sanitizePDFText(l.Description), l.Quantity, l.Amount))
	}
	lines = append(lines,
		"------------------------------------------------------------",
		fmt.Sprintf("Subtotal: %s %s", snap.Currency, snap.SubtotalDisplay),
		fmt.Sprintf("Tax:      %s %s", snap.Currency, snap.TaxDisplay),
		fmt.Sprintf("Total:    %s %s", snap.Currency, snap.TotalDisplay),
		fmt.Sprintf("Schema: %s | %s", snap.RenderSchemaVersion, sanitizePDFText(snap.DisclosureText)),
	)

	// Paginate at 42 lines per page so long documents produce valid multi-page PDFs.
	const linesPerPage = 42
	var pages [][]string
	for i := 0; i < len(lines); i += linesPerPage {
		end := i + linesPerPage
		if end > len(lines) {
			end = len(lines)
		}
		pages = append(pages, lines[i:end])
	}
	if len(pages) == 0 {
		pages = append(pages, []string{"Empty document"})
	}

	var buf bytes.Buffer
	buf.WriteString("%PDF-1.4\n")
	offsets := []int{0}

	writeObj := func(objNum int, body string) {
		offsets = append(offsets, buf.Len())
		fmt.Fprintf(&buf, "%d 0 obj\n%s\nendobj\n", objNum, body)
	}

	// 1: Catalog, 2: Pages, 3: Helvetica Font, then per page (contentObj, pageObj)
	pageCount := len(pages)
	kidRefs := make([]string, 0, pageCount)
	for i := 0; i < pageCount; i++ {
		pageObjNum := 4 + i*2 + 1
		kidRefs = append(kidRefs, fmt.Sprintf("%d 0 R", pageObjNum))
	}

	writeObj(1, "<< /Type /Catalog /Pages 2 0 R >>")
	writeObj(2, fmt.Sprintf("<< /Type /Pages /Kids [%s] /Count %d >>", strings.Join(kidRefs, " "), pageCount))
	writeObj(3, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")

	for i, pgLines := range pages {
		var stream bytes.Buffer
		stream.WriteString("BT\n/F1 10 Tf\n50 760 Td\n14 TL\n")
		for idx, ln := range pgLines {
			if idx > 0 {
				stream.WriteString("T*\n")
			}
			fmt.Fprintf(&stream, "(%s) Tj\n", escapePDFString(ln))
		}
		stream.WriteString("ET\n")

		contentObjNum := 4 + i*2
		pageObjNum := contentObjNum + 1
		writeObj(contentObjNum, fmt.Sprintf("<< /Length %d >>\nstream\n%sendstream", stream.Len(), stream.String()))
		writeObj(pageObjNum, fmt.Sprintf("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents %d 0 R >>", contentObjNum))
	}

	xrefPos := buf.Len()
	fmt.Fprintf(&buf, "xref\n0 %d\n0000000000 65535 f \n", len(offsets))
	for _, off := range offsets[1:] {
		fmt.Fprintf(&buf, "%010d 00000 n \n", off)
	}
	fmt.Fprintf(&buf, "trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n", len(offsets), xrefPos)

	pdfBytes := buf.Bytes()
	if !bytes.HasPrefix(pdfBytes, []byte("%PDF-1.4")) || !bytes.Contains(pdfBytes, []byte("%%EOF")) {
		return nil, "", 0, ErrInvalidPDF
	}
	sum := sha256.Sum256(pdfBytes)
	return pdfBytes, hex.EncodeToString(sum[:]), pageCount, nil
}

func sanitizePDFText(s string) string {
	s = strings.ReplaceAll(s, "\r", " ")
	s = strings.ReplaceAll(s, "\n", " ")
	return strings.TrimSpace(s)
}

func escapePDFString(s string) string {
	s = strings.ReplaceAll(s, "\\", "\\\\")
	s = strings.ReplaceAll(s, "(", "\\(")
	s = strings.ReplaceAll(s, ")", "\\)")
	return s
}
