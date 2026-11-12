package finance

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/csv"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"path/filepath"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/rekordly/rekordly-api/internal/db"
)

var (
	ErrImportFileUnsupported      = errors.New("IMPORT_FILE_UNSUPPORTED")
	ErrImportLimitExceeded        = errors.New("IMPORT_LIMIT_EXCEEDED")
	ErrImportEncodingUnsupported  = errors.New("IMPORT_ENCODING_UNSUPPORTED")
	ErrImportMappingInvalid       = errors.New("IMPORT_MAPPING_INVALID")
	ErrImportReconciliationFailed = errors.New("IMPORT_RECONCILIATION_FAILED")
)

const (
	maxImportBytes   = 2 * 1024 * 1024 // 2 MB
	maxImportRows    = 2000
	maxImportCols    = 40
	maxImportCellLen = 500
)

type CreateImportInput struct {
	Filename        string `json:"filename" binding:"required"`
	MimeType        string `json:"mime_type"`
	CSVContent      string `json:"csv_content" binding:"required"`
	TargetAccountID *int64 `json:"target_account_id"`
	DefaultCurrency string `json:"default_currency"`
}

type ImportUploadResult struct {
	Batch      db.ImportBatch `json:"batch"`
	File       db.ImportFile  `json:"file"`
	Headers    []string       `json:"headers"`
	SampleRows [][]string     `json:"sample_rows"`
	Delimiter  string         `json:"delimiter"`
}

type ImportColumnMapping struct {
	DateColumn        string `json:"date_column" binding:"required"`
	DescriptionColumn string `json:"description_column" binding:"required"`
	AmountColumn      string `json:"amount_column"`
	DebitColumn       string `json:"debit_column"`
	CreditColumn      string `json:"credit_column"`
	CurrencyColumn    string `json:"currency_column"`
	ExternalIDColumn  string `json:"external_id_column"`
	BalanceColumn     string `json:"balance_column"`
	ReferenceColumn   string `json:"reference_column"`
	DateFormat        string `json:"date_format"`       // YYYY-MM-DD, DD/MM/YYYY, MM/DD/YYYY
	DecimalSeparator  string `json:"decimal_separator"` // . or ,
	SignConvention    string `json:"sign_convention"`   // signed, debit_credit, inverted
	TargetAccountID   int64  `json:"target_account_id" binding:"required"`
	DefaultCurrency   string `json:"default_currency"`
	SaveProfileName   string `json:"save_profile_name"`
}

type ImportMappingPreviewRow struct {
	RowNumber     int    `json:"row_number"`
	EffectiveDate string `json:"effective_date"`
	Description   string `json:"description"`
	Direction     string `json:"direction"`
	AmountMinor   string `json:"amount_minor"`
	Currency      string `json:"currency"`
	Valid         bool   `json:"valid"`
	Error         string `json:"error,omitempty"`
}

type ImportMappingResult struct {
	Batch   db.ImportBatch            `json:"batch"`
	Preview []ImportMappingPreviewRow `json:"preview"`
}

type ImportBatchDetail struct {
	Batch          db.ImportBatch           `json:"batch"`
	Headers        []string                 `json:"headers"`
	Reconciliation *db.ImportReconciliation `json:"reconciliation,omitempty"`
}

type UpdateImportRowInput struct {
	EffectiveDate  *string `json:"effective_date"`
	Description    *string `json:"description"`
	Direction      *string `json:"direction"`
	Purpose        *string `json:"purpose"`
	AccountID      *int64  `json:"account_id"`
	CategoryID     *int64  `json:"category_id"`
	CounterpartyID *int64  `json:"counterparty_id"`
	State          *string `json:"state"` // draft_ready, excluded, matched
}

type BulkImportRowActionInput struct {
	RowIDs     []int64 `json:"row_ids" binding:"required"`
	Action     string  `json:"action" binding:"required"` // exclude, include, set_category, set_account
	CategoryID *int64  `json:"category_id"`
	AccountID  *int64  `json:"account_id"`
}

type ImportUndoResult struct {
	Preview        bool     `json:"preview"`
	EligibleCount  int      `json:"eligible_count"`
	BlockedCount   int      `json:"blocked_count"`
	ReversedCount  int      `json:"reversed_count"`
	UnlinkedCount  int      `json:"unlinked_count"`
	BlockedReasons []string `json:"blocked_reasons,omitempty"`
}

// NeutralizeCSVFormula protects spreadsheet exports from CSV formula injection (=, +, -, @, tab, CR).
func NeutralizeCSVFormula(cell string) string {
	if cell == "" {
		return ""
	}
	switch cell[0] {
	case '=', '+', '-', '@', '\t', '\r':
		return "'" + cell
	}
	return cell
}

func (s *Service) CreateImportBatch(ctx context.Context, workspaceID, userID int64, in CreateImportInput) (ImportUploadResult, error) {
	ext := strings.ToLower(filepath.Ext(strings.TrimSpace(in.Filename)))
	if ext != ".csv" {
		return ImportUploadResult{}, ErrImportFileUnsupported
	}
	rawBytes := []byte(in.CSVContent)
	if len(rawBytes) == 0 {
		return ImportUploadResult{}, ErrImportFileUnsupported
	}
	if len(rawBytes) > maxImportBytes {
		return ImportUploadResult{}, ErrImportLimitExceeded
	}
	if !utf8.Valid(rawBytes) {
		return ImportUploadResult{}, ErrImportEncodingUnsupported
	}
	// Strip UTF-8 BOM if present
	rawText := strings.TrimPrefix(in.CSVContent, "\xEF\xBB\xBF")

	delim := detectCSVDelimiter(rawText)
	headers, rows, err := parseCSVBounded(rawText, delim)
	if err != nil {
		return ImportUploadResult{}, err
	}

	if in.TargetAccountID != nil {
		acc, err := s.queries.GetMoneyAccountByID(ctx, db.GetMoneyAccountByIDParams{ID: *in.TargetAccountID, WorkspaceID: workspaceID})
		if isNoRows(err) || !acc.IsActive {
			return ImportUploadResult{}, ErrForbiddenAccount
		}
		if err != nil {
			return ImportUploadResult{}, err
		}
	}

	var wsCurrency string
	if err := s.pool.QueryRow(ctx, `SELECT base_currency FROM workspaces WHERE id = $1`, workspaceID).Scan(&wsCurrency); err != nil {
		return ImportUploadResult{}, err
	}
	currency := strings.ToUpper(strings.TrimSpace(in.DefaultCurrency))
	if len(currency) != 3 {
		currency = wsCurrency
	}

	sum := sha256.Sum256(rawBytes)
	hashHex := hex.EncodeToString(sum[:])
	safeName := filepath.Base(strings.TrimSpace(in.Filename))
	storageKey := fmt.Sprintf("private/imports/ws-%d/%s-%s", workspaceID, hashHex[:12], safeName)

	fileRow, err := s.queries.CreateImportFile(ctx, db.CreateImportFileParams{
		WorkspaceID:      workspaceID,
		UploadedByUserID: pgtype.Int8{Int64: userID, Valid: true},
		OriginalFilename: safeName,
		MimeType:         "text/csv",
		ByteSize:         int64(len(rawBytes)),
		Sha256Hash:       hashHex,
		Encoding:         "utf-8",
		Delimiter:        string(delim),
		StorageKey:       storageKey,
		RawCsvText:       rawText,
	})
	if err != nil {
		return ImportUploadResult{}, err
	}

	var targetAcc pgtype.Int8
	if in.TargetAccountID != nil {
		targetAcc = pgtype.Int8{Int64: *in.TargetAccountID, Valid: true}
	}
	batch, err := s.queries.CreateImportBatch(ctx, db.CreateImportBatchParams{
		WorkspaceID:     workspaceID,
		ImportFileID:    fileRow.ID,
		TargetAccountID: targetAcc,
		DefaultCurrency: currency,
		CreatedByUserID: pgtype.Int8{Int64: userID, Valid: true},
	})
	if err != nil {
		return ImportUploadResult{}, err
	}

	sample := rows
	if len(sample) > 5 {
		sample = sample[:5]
	}
	return ImportUploadResult{
		Batch:      batch,
		File:       fileRow,
		Headers:    headers,
		SampleRows: sample,
		Delimiter:  string(delim),
	}, nil
}

func (s *Service) ListImportBatches(ctx context.Context, workspaceID int64) ([]db.ImportBatch, error) {
	return s.queries.ListImportBatches(ctx, db.ListImportBatchesParams{WorkspaceID: workspaceID, Limit: 50})
}

func (s *Service) GetImportBatch(ctx context.Context, workspaceID, batchID int64) (ImportBatchDetail, error) {
	batch, err := s.queries.GetImportBatchByID(ctx, db.GetImportBatchByIDParams{ID: batchID, WorkspaceID: workspaceID})
	if isNoRows(err) {
		return ImportBatchDetail{}, ErrNotFound
	}
	if err != nil {
		return ImportBatchDetail{}, err
	}
	fileRow, err := s.queries.GetImportFileByID(ctx, db.GetImportFileByIDParams{ID: batch.ImportFileID, WorkspaceID: workspaceID})
	if err != nil {
		return ImportBatchDetail{}, err
	}
	delim := rune(',')
	if len(fileRow.Delimiter) > 0 {
		delim = rune(fileRow.Delimiter[0])
	}
	headers, _, _ := parseCSVBounded(fileRow.RawCsvText, delim)
	var reconPtr *db.ImportReconciliation
	if recon, rErr := s.queries.GetLatestImportReconciliation(ctx, db.GetLatestImportReconciliationParams{BatchID: batch.ID, WorkspaceID: workspaceID}); rErr == nil {
		reconPtr = &recon
	}
	return ImportBatchDetail{Batch: batch, Headers: headers, Reconciliation: reconPtr}, nil
}

func (s *Service) SetImportMapping(ctx context.Context, workspaceID, batchID int64, m ImportColumnMapping) (ImportMappingResult, error) {
	batch, err := s.queries.GetImportBatchByID(ctx, db.GetImportBatchByIDParams{ID: batchID, WorkspaceID: workspaceID})
	if isNoRows(err) {
		return ImportMappingResult{}, ErrNotFound
	}
	if err != nil {
		return ImportMappingResult{}, err
	}

	if strings.TrimSpace(m.DateColumn) == "" || strings.TrimSpace(m.DescriptionColumn) == "" {
		return ImportMappingResult{}, ErrImportMappingInvalid
	}
	if strings.TrimSpace(m.AmountColumn) == "" && (strings.TrimSpace(m.DebitColumn) == "" || strings.TrimSpace(m.CreditColumn) == "") {
		return ImportMappingResult{}, ErrImportMappingInvalid
	}
	if m.DateFormat == "" {
		m.DateFormat = "YYYY-MM-DD"
	}
	if m.DecimalSeparator == "" {
		m.DecimalSeparator = "."
	}
	if m.SignConvention == "" {
		if m.AmountColumn == "" {
			m.SignConvention = "debit_credit"
		} else {
			m.SignConvention = "signed"
		}
	}

	acc, err := s.queries.GetMoneyAccountByID(ctx, db.GetMoneyAccountByIDParams{ID: m.TargetAccountID, WorkspaceID: workspaceID})
	if isNoRows(err) || !acc.IsActive {
		return ImportMappingResult{}, ErrForbiddenAccount
	}
	if err != nil {
		return ImportMappingResult{}, err
	}
	currency := strings.ToUpper(strings.TrimSpace(m.DefaultCurrency))
	if len(currency) != 3 {
		currency = acc.Currency
	}

	mapBytes, _ := json.Marshal(m)
	profName := strings.TrimSpace(m.SaveProfileName)
	if profName == "" {
		profName = fmt.Sprintf("Batch #%d mapping", batch.ID)
	}
	prof, err := s.queries.CreateImportMappingProfile(ctx, db.CreateImportMappingProfileParams{
		WorkspaceID:      workspaceID,
		Name:             profName,
		MappingJson:      mapBytes,
		DateFormat:       m.DateFormat,
		DecimalSeparator: m.DecimalSeparator,
		SignConvention:   m.SignConvention,
		DefaultCurrency:  currency,
		DefaultAccountID: pgtype.Int8{Int64: acc.ID, Valid: true},
	})
	if err != nil {
		return ImportMappingResult{}, err
	}

	updatedBatch, err := s.queries.UpdateImportBatchMapping(ctx, db.UpdateImportBatchMappingParams{
		ID:               batch.ID,
		WorkspaceID:      workspaceID,
		MappingProfileID: pgtype.Int8{Int64: prof.ID, Valid: true},
		TargetAccountID:  pgtype.Int8{Int64: acc.ID, Valid: true},
		DefaultCurrency:  currency,
	})
	if err != nil {
		return ImportMappingResult{}, err
	}

	fileRow, err := s.queries.GetImportFileByID(ctx, db.GetImportFileByIDParams{ID: batch.ImportFileID, WorkspaceID: workspaceID})
	if err != nil {
		return ImportMappingResult{}, err
	}
	delim := rune(',')
	if len(fileRow.Delimiter) > 0 {
		delim = rune(fileRow.Delimiter[0])
	}
	headers, rows, err := parseCSVBounded(fileRow.RawCsvText, delim)
	if err != nil {
		return ImportMappingResult{}, err
	}
	colIdx := buildHeaderIndex(headers)

	limit := len(rows)
	if limit > 10 {
		limit = 10
	}
	preview := make([]ImportMappingPreviewRow, 0, limit)
	for i := 0; i < limit; i++ {
		parsed := normalizeCSVRow(i+1, rows[i], colIdx, m, currency)
		p := ImportMappingPreviewRow{
			RowNumber:   i + 1,
			Description: parsed.Description,
			Direction:   parsed.Direction,
			AmountMinor: strconv.FormatInt(parsed.AmountMinor, 10),
			Currency:    parsed.Currency,
			Valid:       parsed.ErrCode == "",
			Error:       parsed.ErrMsg,
		}
		if parsed.HasDate {
			p.EffectiveDate = parsed.Date.Format("2006-01-02")
		}
		preview = append(preview, p)
	}
	return ImportMappingResult{Batch: updatedBatch, Preview: preview}, nil
}

func (s *Service) AnalyzeImportBatch(ctx context.Context, workspaceID, batchID int64) (ImportBatchDetail, error) {
	batch, err := s.queries.GetImportBatchByID(ctx, db.GetImportBatchByIDParams{ID: batchID, WorkspaceID: workspaceID})
	if isNoRows(err) {
		return ImportBatchDetail{}, ErrNotFound
	}
	if err != nil {
		return ImportBatchDetail{}, err
	}
	if !batch.MappingProfileID.Valid || !batch.TargetAccountID.Valid {
		return ImportBatchDetail{}, ErrImportMappingInvalid
	}

	var mapping ImportColumnMapping
	var rawMapBytes []byte
	if err := s.pool.QueryRow(ctx, `SELECT mapping_json FROM import_mapping_profiles WHERE id = $1 AND workspace_id = $2`,
		batch.MappingProfileID.Int64, workspaceID).Scan(&rawMapBytes); err != nil {
		return ImportBatchDetail{}, err
	}
	if err := json.Unmarshal(rawMapBytes, &mapping); err != nil {
		return ImportBatchDetail{}, ErrImportMappingInvalid
	}

	fileRow, err := s.queries.GetImportFileByID(ctx, db.GetImportFileByIDParams{ID: batch.ImportFileID, WorkspaceID: workspaceID})
	if err != nil {
		return ImportBatchDetail{}, err
	}
	delim := rune(',')
	if len(fileRow.Delimiter) > 0 {
		delim = rune(fileRow.Delimiter[0])
	}
	headers, rows, err := parseCSVBounded(fileRow.RawCsvText, delim)
	if err != nil {
		return ImportBatchDetail{}, err
	}
	colIdx := buildHeaderIndex(headers)

	// Clear unposted previous analysis rows if re-analyzing before confirmation.
	_ = s.queries.DeleteImportRowsByBatch(ctx, db.DeleteImportRowsByBatchParams{BatchID: batch.ID, WorkspaceID: workspaceID})

	seenBatchFP := make(map[string]bool)
	var validCnt, dupCnt, matchCnt, invalidCnt, exclCnt int32

	for i, r := range rows {
		n := normalizeCSVRow(i+1, r, colIdx, mapping, batch.DefaultCurrency)
		rawObj := make(map[string]string, len(headers))
		for idx, h := range headers {
			if idx < len(r) {
				rawObj[h] = r[idx]
			}
		}
		rawJSON, _ := json.Marshal(rawObj)

		fpInput := fmt.Sprintf("%d|%s|%s|%d|%s|%s",
			batch.TargetAccountID.Int64, n.DateStr, n.Currency, n.SignedMinor, strings.ToLower(n.Description), n.ExternalID)
		fpSum := sha256.Sum256([]byte(fpInput))
		fp := hex.EncodeToString(fpSum[:])

		state := "draft_ready"
		errCode := n.ErrCode
		errMsg := n.ErrMsg
		var probableTxID int64

		if errCode != "" {
			state = "invalid"
			invalidCnt++
		} else if seenBatchFP[fp] {
			state = "duplicate_exact"
			dupCnt++
		} else if n.ExternalID != "" {
			if _, dErr := s.queries.CheckExistingExternalTxID(ctx, db.CheckExistingExternalTxIDParams{
				WorkspaceID:  workspaceID,
				ExternalTxID: n.ExternalID,
			}); dErr == nil {
				state = "duplicate_exact"
				dupCnt++
			}
		}
		if state == "draft_ready" {
			if _, dErr := s.queries.CheckExistingImportFingerprint(ctx, db.CheckExistingImportFingerprintParams{
				WorkspaceID:    workspaceID,
				RowFingerprint: fp,
			}); dErr == nil {
				state = "duplicate_exact"
				dupCnt++
			}
		}
		seenBatchFP[fp] = true

		// Check probable match against existing money_transactions on same account + date + amount.
		if state == "draft_ready" && n.HasDate {
			var existingID int64
			mErr := s.pool.QueryRow(ctx, `
				SELECT id FROM money_transactions
				WHERE workspace_id = $1 AND money_account_id = $2 AND status = 'posted'
				  AND amount_minor = $3 AND direction = $4
				  AND effective_date BETWEEN ($5::date - interval '2 days') AND ($5::date + interval '2 days')
				LIMIT 1`,
				workspaceID, batch.TargetAccountID.Int64, n.AmountMinor, n.Direction, n.Date.Format("2006-01-02")).Scan(&existingID)
			if mErr == nil && existingID > 0 {
				state = "match_suggested"
				probableTxID = existingID
				matchCnt++
			} else {
				validCnt++
			}
		}

		var effDate pgtype.Date
		if n.HasDate {
			effDate = pgtype.Date{Time: n.Date, Valid: true}
		}

		rowRec, cErr := s.queries.CreateImportRow(ctx, db.CreateImportRowParams{
			BatchID:           batch.ID,
			WorkspaceID:       workspaceID,
			RowNumber:         int32(i + 1),
			RowFingerprint:    fp,
			ExternalTxID:      n.ExternalID,
			RawData:           rawJSON,
			EffectiveDate:     effDate,
			Description:       n.Description,
			AmountMinor:       n.AmountMinor,
			SignedAmountMinor: n.SignedMinor,
			Currency:          n.Currency,
			CurrencyExponent:  int16(CurrencyExponent(n.Currency)),
			Direction:         n.Direction,
			AccountID:         batch.TargetAccountID,
			State:             state,
			ErrorCode:         errCode,
			ErrorMessage:      errMsg,
			SuggestionSource:  "rule",
		})
		if cErr != nil {
			return ImportBatchDetail{}, cErr
		}
		if probableTxID > 0 {
			_, _ = s.queries.CreateImportRowMatch(ctx, db.CreateImportRowMatchParams{
				ImportRowID:     rowRec.ID,
				WorkspaceID:     workspaceID,
				MatchKind:       "probable_match",
				MatchedTable:    "money_transactions",
				MatchedID:       probableTxID,
				ConfidenceLabel: "high",
				Reason:          "Matching account, direction, amount, and date within 2 days",
				Status:          "suggested",
			})
		}
	}

	totalRows := int32(len(rows))
	updatedBatch, err := s.queries.UpdateImportBatchCounts(ctx, db.UpdateImportBatchCountsParams{
		ID:             batch.ID,
		WorkspaceID:    workspaceID,
		Status:         "ready",
		TotalRows:      totalRows,
		ValidCount:     validCnt,
		DuplicateCount: dupCnt,
		MatchCount:     matchCnt,
		InvalidCount:   invalidCnt,
		ExcludedCount:  exclCnt,
		PostedCount:    0,
		FailedCount:    0,
	})
	if err != nil {
		return ImportBatchDetail{}, err
	}
	recon, _ := s.recomputeImportReconciliation(ctx, workspaceID, updatedBatch)
	return ImportBatchDetail{Batch: updatedBatch, Headers: headers, Reconciliation: &recon}, nil
}

func (s *Service) ListImportRows(ctx context.Context, workspaceID, batchID int64, stateFilter string, afterID int64, limit int32) ([]db.ImportRow, error) {
	if limit <= 0 || limit > 100 {
		limit = 50
	}
	var sf pgtype.Text
	if strings.TrimSpace(stateFilter) != "" && stateFilter != "all" {
		sf = pgtype.Text{String: strings.TrimSpace(stateFilter), Valid: true}
	}
	return s.queries.ListImportRowsByBatch(ctx, db.ListImportRowsByBatchParams{
		BatchID:     batchID,
		WorkspaceID: workspaceID,
		StateFilter: sf,
		ID:          afterID,
		Limit:       limit,
	})
}

func (s *Service) UpdateImportRow(ctx context.Context, workspaceID, batchID, rowID int64, in UpdateImportRowInput) (db.ImportRow, error) {
	row, err := s.queries.GetImportRowByID(ctx, db.GetImportRowByIDParams{ID: rowID, BatchID: batchID, WorkspaceID: workspaceID})
	if isNoRows(err) {
		return db.ImportRow{}, ErrNotFound
	}
	if err != nil {
		return db.ImportRow{}, err
	}
	if row.State == "posted" {
		return db.ImportRow{}, errors.New("posted import row cannot be edited")
	}

	effDate := row.EffectiveDate
	if in.EffectiveDate != nil {
		dt, err := parseDateStrict(*in.EffectiveDate)
		if err != nil {
			return db.ImportRow{}, err
		}
		effDate = pgtype.Date{Time: dt, Valid: true}
	}
	desc := row.Description
	if in.Description != nil {
		desc = strings.TrimSpace(*in.Description)
	}
	dir := row.Direction
	if in.Direction != nil && (*in.Direction == "money_in" || *in.Direction == "money_out" || *in.Direction == "transfer") {
		dir = *in.Direction
	}
	purpose := row.Purpose
	if in.Purpose != nil {
		purpose = strings.TrimSpace(*in.Purpose)
	}
	accID := row.AccountID
	if in.AccountID != nil {
		acc, err := s.queries.GetMoneyAccountByID(ctx, db.GetMoneyAccountByIDParams{ID: *in.AccountID, WorkspaceID: workspaceID})
		if isNoRows(err) || !acc.IsActive {
			return db.ImportRow{}, ErrForbiddenAccount
		}
		accID = pgtype.Int8{Int64: acc.ID, Valid: true}
	}
	catID := row.CategoryID
	if in.CategoryID != nil {
		cat, err := s.queries.GetCategoryByID(ctx, db.GetCategoryByIDParams{ID: *in.CategoryID, WorkspaceID: workspaceID})
		if isNoRows(err) || !cat.IsActive {
			return db.ImportRow{}, ErrForbiddenCategory
		}
		catID = pgtype.Int8{Int64: cat.ID, Valid: true}
	}
	cpID := row.CounterpartyID
	if in.CounterpartyID != nil {
		cpID = pgtype.Int8{Int64: *in.CounterpartyID, Valid: true}
	}

	state := row.State
	if in.State != nil {
		switch *in.State {
		case "draft_ready", "excluded", "matched":
			state = *in.State
		}
	} else if state == "invalid" && effDate.Valid && row.AmountMinor > 0 && accID.Valid {
		state = "draft_ready"
	}

	updated, err := s.queries.UpdateImportRow(ctx, db.UpdateImportRowParams{
		ID:             row.ID,
		BatchID:        batchID,
		WorkspaceID:    workspaceID,
		EffectiveDate:  effDate,
		Description:    desc,
		Direction:      dir,
		Purpose:        purpose,
		AccountID:      accID,
		CategoryID:     catID,
		CounterpartyID: cpID,
		State:          state,
	})
	if err != nil {
		return db.ImportRow{}, err
	}
	_, _ = s.refreshBatchCounts(ctx, workspaceID, batchID)
	return updated, nil
}

func (s *Service) BulkUpdateImportRows(ctx context.Context, workspaceID, batchID int64, in BulkImportRowActionInput) (int, error) {
	count := 0
	for _, rid := range in.RowIDs {
		switch in.Action {
		case "exclude":
			sVal := "excluded"
			if _, err := s.UpdateImportRow(ctx, workspaceID, batchID, rid, UpdateImportRowInput{State: &sVal}); err == nil {
				count++
			}
		case "include":
			sVal := "draft_ready"
			if _, err := s.UpdateImportRow(ctx, workspaceID, batchID, rid, UpdateImportRowInput{State: &sVal}); err == nil {
				count++
			}
		case "set_category":
			if in.CategoryID != nil {
				if _, err := s.UpdateImportRow(ctx, workspaceID, batchID, rid, UpdateImportRowInput{CategoryID: in.CategoryID}); err == nil {
					count++
				}
			}
		case "set_account":
			if in.AccountID != nil {
				if _, err := s.UpdateImportRow(ctx, workspaceID, batchID, rid, UpdateImportRowInput{AccountID: in.AccountID}); err == nil {
					count++
				}
			}
		}
	}
	return count, nil
}

// ConfirmImportBatch posts eligible draft_ready rows idempotently via CreateTransaction.
func (s *Service) ConfirmImportBatch(ctx context.Context, workspaceID, userID, batchID int64, rowIDs []int64) (ImportBatchDetail, error) {
	batch, err := s.queries.GetImportBatchByID(ctx, db.GetImportBatchByIDParams{ID: batchID, WorkspaceID: workspaceID})
	if isNoRows(err) {
		return ImportBatchDetail{}, ErrNotFound
	}
	if err != nil {
		return ImportBatchDetail{}, err
	}

	allRows, err := s.queries.ListAllImportRowsByBatch(ctx, db.ListAllImportRowsByBatchParams{BatchID: batch.ID, WorkspaceID: workspaceID})
	if err != nil {
		return ImportBatchDetail{}, err
	}

	filterSet := make(map[int64]bool, len(rowIDs))
	for _, id := range rowIDs {
		filterSet[id] = true
	}

	for _, r := range allRows {
		if len(filterSet) > 0 && !filterSet[r.ID] {
			continue
		}
		if r.State != "draft_ready" && r.State != "failed" {
			continue
		}
		idempKey := fmt.Sprintf("import-row-%d-%d-%d", workspaceID, batch.ID, r.ID)
		if _, rErr := s.queries.GetImportRowResultByIdemp(ctx, db.GetImportRowResultByIdempParams{
			WorkspaceID:    workspaceID,
			IdempotencyKey: idempKey,
		}); rErr == nil {
			// Already posted previously -> mark posted idempotently without duplicating.
			_, _ = s.queries.UpdateImportRowState(ctx, db.UpdateImportRowStateParams{
				ID: r.ID, BatchID: batch.ID, WorkspaceID: workspaceID, State: "posted",
			})
			continue
		}

		if !r.EffectiveDate.Valid || !r.AccountID.Valid || r.AmountMinor <= 0 {
			_, _ = s.queries.UpdateImportRowState(ctx, db.UpdateImportRowStateParams{
				ID: r.ID, BatchID: batch.ID, WorkspaceID: workspaceID, State: "failed",
				ErrorCode: "IMPORT_ROW_INVALID", ErrorMessage: "missing date, account, or positive amount",
			})
			continue
		}

		var catID *int64
		if r.CategoryID.Valid {
			catID = &r.CategoryID.Int64
		}
		dir := r.Direction
		if dir == "transfer" {
			dir = "money_out" // unpaired transfer row falls back unless paired; paired transfers use CreateTransaction transfer
		}

		txDetail, tErr := s.CreateTransaction(ctx, workspaceID, userID, CreateTransactionInput{
			Direction:      dir,
			Status:         "posted",
			AmountMinor:    r.AmountMinor,
			Currency:       r.Currency,
			EffectiveDate:  r.EffectiveDate.Time.Format("2006-01-02"),
			MoneyAccountID: r.AccountID.Int64,
			CategoryID:     catID,
			Purpose:        r.Purpose,
			Notes:          r.Description,
			Reference:      fmt.Sprintf("import-b%d-r%d", batch.ID, r.RowNumber),
			IdempotencyKey: idempKey,
		})
		if tErr != nil {
			_, _ = s.queries.UpdateImportRowState(ctx, db.UpdateImportRowStateParams{
				ID: r.ID, BatchID: batch.ID, WorkspaceID: workspaceID, State: "failed",
				ErrorCode: "IMPORT_POST_FAILED", ErrorMessage: tErr.Error(),
			})
			continue
		}

		_, _ = s.queries.CreateImportRowResult(ctx, db.CreateImportRowResultParams{
			ImportRowID:    r.ID,
			BatchID:        batch.ID,
			WorkspaceID:    workspaceID,
			IdempotencyKey: idempKey,
			Action:         "posted",
			TargetType:     "money_transaction",
			TargetID:       txDetail.Transaction.ID,
		})
		_, _ = s.queries.UpdateImportRowState(ctx, db.UpdateImportRowStateParams{
			ID: r.ID, BatchID: batch.ID, WorkspaceID: workspaceID, State: "posted",
		})
	}

	updatedBatch, err := s.refreshBatchCounts(ctx, workspaceID, batch.ID)
	if err != nil {
		return ImportBatchDetail{}, err
	}
	recon, _ := s.recomputeImportReconciliation(ctx, workspaceID, updatedBatch)
	return ImportBatchDetail{Batch: updatedBatch, Reconciliation: &recon}, nil
}

// UndoImportBatch previews or reverses eligible posted import records via VoidTransaction.
func (s *Service) UndoImportBatch(ctx context.Context, workspaceID, userID, batchID int64, preview bool) (ImportUndoResult, error) {
	batch, err := s.queries.GetImportBatchByID(ctx, db.GetImportBatchByIDParams{ID: batchID, WorkspaceID: workspaceID})
	if isNoRows(err) {
		return ImportUndoResult{}, ErrNotFound
	}
	if err != nil {
		return ImportUndoResult{}, err
	}
	results, err := s.queries.ListImportRowResultsByBatch(ctx, db.ListImportRowResultsByBatchParams{BatchID: batch.ID, WorkspaceID: workspaceID})
	if err != nil {
		return ImportUndoResult{}, err
	}

	out := ImportUndoResult{Preview: preview}
	for _, res := range results {
		if res.Action != "posted" || res.TargetType != "money_transaction" {
			continue
		}
		tx, tErr := s.queries.GetMoneyTransactionByID(ctx, db.GetMoneyTransactionByIDParams{ID: res.TargetID, WorkspaceID: workspaceID})
		if tErr != nil || tx.Status != "posted" {
			out.BlockedCount++
			out.BlockedReasons = append(out.BlockedReasons, fmt.Sprintf("tx #%d already voided or unavailable", res.TargetID))
			continue
		}
		// Check locked period
		var locked bool
		_ = s.pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM accounting_periods WHERE workspace_id = $1 AND status IN ('closed','locked') AND $2::date BETWEEN start_date AND end_date)`,
			workspaceID, tx.EffectiveDate.Time.Format("2006-01-02")).Scan(&locked)
		if locked {
			out.BlockedCount++
			out.BlockedReasons = append(out.BlockedReasons, fmt.Sprintf("tx #%d falls in closed/locked period", res.TargetID))
			continue
		}
		out.EligibleCount++
		if !preview {
			if _, vErr := s.VoidTransaction(ctx, workspaceID, userID, res.TargetID, fmt.Sprintf("Undo import batch #%d", batch.ID)); vErr != nil {
				out.BlockedCount++
				out.BlockedReasons = append(out.BlockedReasons, fmt.Sprintf("tx #%d: %s", res.TargetID, vErr.Error()))
				continue
			}
			out.ReversedCount++
			_, _ = s.queries.UpdateImportRowState(ctx, db.UpdateImportRowStateParams{
				ID: res.ImportRowID, BatchID: batch.ID, WorkspaceID: workspaceID, State: "excluded",
			})
		}
	}

	if !preview && out.ReversedCount > 0 {
		_, _ = s.refreshBatchCounts(ctx, workspaceID, batch.ID)
	}
	return out, nil
}

func (s *Service) ExportImportBatchFailuresCSV(ctx context.Context, workspaceID, batchID int64) (string, error) {
	rows, err := s.queries.ListAllImportRowsByBatch(ctx, db.ListAllImportRowsByBatchParams{BatchID: batchID, WorkspaceID: workspaceID})
	if err != nil {
		return "", err
	}
	var buf bytes.Buffer
	w := csv.NewWriter(&buf)
	_ = w.Write([]string{"row_number", "effective_date", "description", "amount_minor", "currency", "state", "error_code", "error_message"})
	for _, r := range rows {
		if r.State != "invalid" && r.State != "failed" {
			continue
		}
		dateStr := ""
		if r.EffectiveDate.Valid {
			dateStr = r.EffectiveDate.Time.Format("2006-01-02")
		}
		_ = w.Write([]string{
			strconv.Itoa(int(r.RowNumber)),
			NeutralizeCSVFormula(dateStr),
			NeutralizeCSVFormula(r.Description),
			strconv.FormatInt(r.AmountMinor, 10),
			NeutralizeCSVFormula(r.Currency),
			NeutralizeCSVFormula(r.State),
			NeutralizeCSVFormula(r.ErrorCode),
			NeutralizeCSVFormula(r.ErrorMessage),
		})
	}
	w.Flush()
	return buf.String(), nil
}

func (s *Service) refreshBatchCounts(ctx context.Context, workspaceID, batchID int64) (db.ImportBatch, error) {
	rows, err := s.queries.ListAllImportRowsByBatch(ctx, db.ListAllImportRowsByBatchParams{BatchID: batchID, WorkspaceID: workspaceID})
	if err != nil {
		return db.ImportBatch{}, err
	}
	var valid, dup, match, inv, excl, posted, failed int32
	for _, r := range rows {
		switch r.State {
		case "draft_ready", "parsed":
			valid++
		case "duplicate_exact":
			dup++
		case "match_suggested":
			match++
		case "invalid":
			inv++
		case "excluded":
			excl++
		case "posted", "matched":
			posted++
		case "failed":
			failed++
		}
	}
	status := "ready"
	if posted > 0 && failed > 0 {
		status = "partially_failed"
	} else if posted > 0 && valid == 0 && inv == 0 && failed == 0 {
		status = "completed"
	}
	return s.queries.UpdateImportBatchCounts(ctx, db.UpdateImportBatchCountsParams{
		ID: batchID, WorkspaceID: workspaceID, Status: status,
		TotalRows: int32(len(rows)), ValidCount: valid, DuplicateCount: dup, MatchCount: match,
		InvalidCount: inv, ExcludedCount: excl, PostedCount: posted, FailedCount: failed,
	})
}

func (s *Service) recomputeImportReconciliation(ctx context.Context, workspaceID int64, batch db.ImportBatch) (db.ImportReconciliation, error) {
	rows, err := s.queries.ListAllImportRowsByBatch(ctx, db.ListAllImportRowsByBatchParams{BatchID: batch.ID, WorkspaceID: workspaceID})
	if err != nil {
		return db.ImportReconciliation{}, err
	}
	var postedCnt, matchedCnt, dupExclCnt, failedUnresCnt int32
	totals := make(map[string]int64)
	for _, r := range rows {
		switch r.State {
		case "posted":
			postedCnt++
			totals[r.Currency] += r.SignedAmountMinor
		case "matched":
			matchedCnt++
		case "duplicate_exact", "excluded":
			dupExclCnt++
		default:
			failedUnresCnt++
		}
	}
	reconciled := int32(len(rows)) == (postedCnt + matchedCnt + dupExclCnt + failedUnresCnt)
	totalsStr := make(map[string]string, len(totals))
	for c, v := range totals {
		totalsStr[c] = strconv.FormatInt(v, 10)
	}
	totalsJSON, _ := json.Marshal(totalsStr)
	return s.queries.CreateImportReconciliation(ctx, db.CreateImportReconciliationParams{
		BatchID:                batch.ID,
		WorkspaceID:            workspaceID,
		SourceRowCount:         int32(len(rows)),
		PostedCount:            postedCnt,
		MatchedCount:           matchedCnt,
		DuplicateExcludedCount: dupExclCnt,
		FailedUnresolvedCount:  failedUnresCnt,
		Reconciled:             reconciled,
		CurrencyTotals:         totalsJSON,
	})
}

func detectCSVDelimiter(raw string) rune {
	firstLine := raw
	if idx := strings.IndexAny(raw, "\r\n"); idx >= 0 {
		firstLine = raw[:idx]
	}
	if strings.Count(firstLine, ";") > strings.Count(firstLine, ",") {
		return ';'
	}
	if strings.Count(firstLine, "\t") > strings.Count(firstLine, ",") {
		return '\t'
	}
	return ','
}

func parseCSVBounded(raw string, delim rune) ([]string, [][]string, error) {
	r := csv.NewReader(strings.NewReader(raw))
	r.Comma = delim
	r.FieldsPerRecord = -1
	r.LazyQuotes = true
	headers, err := r.Read()
	if err != nil || len(headers) == 0 {
		return nil, nil, ErrImportFileUnsupported
	}
	if len(headers) > maxImportCols {
		return nil, nil, ErrImportLimitExceeded
	}
	for i := range headers {
		headers[i] = strings.TrimSpace(headers[i])
	}
	var rows [][]string
	for {
		rec, err := r.Read()
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			return nil, nil, ErrImportFileUnsupported
		}
		if len(rows) >= maxImportRows {
			return nil, nil, ErrImportLimitExceeded
		}
		for _, cell := range rec {
			if len([]rune(cell)) > maxImportCellLen {
				return nil, nil, ErrImportLimitExceeded
			}
		}
		rows = append(rows, rec)
	}
	if len(rows) == 0 {
		return nil, nil, ErrImportFileUnsupported
	}
	return headers, rows, nil
}

func buildHeaderIndex(headers []string) map[string]int {
	m := make(map[string]int, len(headers))
	for i, h := range headers {
		m[strings.ToLower(strings.TrimSpace(h))] = i
	}
	return m
}

type normalizedCSV struct {
	HasDate     bool
	Date        time.Time
	DateStr     string
	Description string
	AmountMinor int64
	SignedMinor int64
	Currency    string
	Direction   string
	ExternalID  string
	ErrCode     string
	ErrMsg      string
}

func normalizeCSVRow(rowNum int, row []string, idx map[string]int, m ImportColumnMapping, defaultCurr string) normalizedCSV {
	get := func(col string) string {
		if col == "" {
			return ""
		}
		if pos, ok := idx[strings.ToLower(strings.TrimSpace(col))]; ok && pos < len(row) {
			return strings.TrimSpace(row[pos])
		}
		return ""
	}
	out := normalizedCSV{
		Description: get(m.DescriptionColumn),
		ExternalID:  get(m.ExternalIDColumn),
		Currency:    strings.ToUpper(get(m.CurrencyColumn)),
		Direction:   "money_out",
	}
	if len(out.Currency) != 3 {
		out.Currency = defaultCurr
	}
	if out.Description == "" {
		out.Description = fmt.Sprintf("Imported row %d", rowNum)
	}
	out.DateStr = get(m.DateColumn)
	dt, err := parseCSVDate(out.DateStr, m.DateFormat)
	if err != nil {
		out.ErrCode = "IMPORT_ROW_INVALID"
		out.ErrMsg = "invalid date for format " + m.DateFormat
		return out
	}
	out.HasDate = true
	out.Date = dt

	exp := CurrencyExponent(out.Currency)
	if m.SignConvention == "debit_credit" || (m.AmountColumn == "" && (m.DebitColumn != "" || m.CreditColumn != "")) {
		debRaw := get(m.DebitColumn)
		credRaw := get(m.CreditColumn)
		if debRaw != "" && credRaw != "" && debRaw != "0" && credRaw != "0" {
			out.ErrCode = "IMPORT_ROW_INVALID"
			out.ErrMsg = "both debit and credit populated on one row"
			return out
		}
		if credRaw != "" && credRaw != "0" {
			amt, aErr := parseNormalizedDecimal(credRaw, m.DecimalSeparator, exp)
			if aErr != nil || amt <= 0 {
				out.ErrCode = "IMPORT_ROW_INVALID"
				out.ErrMsg = "invalid credit amount"
				return out
			}
			out.AmountMinor = amt
			out.SignedMinor = amt
			out.Direction = "money_in"
		} else {
			amt, aErr := parseNormalizedDecimal(debRaw, m.DecimalSeparator, exp)
			if aErr != nil || amt <= 0 {
				out.ErrCode = "IMPORT_ROW_INVALID"
				out.ErrMsg = "invalid debit amount"
				return out
			}
			out.AmountMinor = amt
			out.SignedMinor = -amt
			out.Direction = "money_out"
		}
		return out
	}

	rawAmt := get(m.AmountColumn)
	neg := strings.HasPrefix(rawAmt, "-")
	cleanAmt := strings.TrimPrefix(strings.TrimPrefix(rawAmt, "-"), "+")
	amt, aErr := parseNormalizedDecimal(cleanAmt, m.DecimalSeparator, exp)
	if aErr != nil || amt <= 0 {
		out.ErrCode = "IMPORT_ROW_INVALID"
		out.ErrMsg = "invalid or zero amount"
		return out
	}
	out.AmountMinor = amt
	isOut := neg
	if m.SignConvention == "inverted" {
		isOut = !neg
	}
	if isOut {
		out.Direction = "money_out"
		out.SignedMinor = -amt
	} else {
		out.Direction = "money_in"
		out.SignedMinor = amt
	}
	return out
}

func parseCSVDate(raw, format string) (time.Time, error) {
	raw = strings.TrimSpace(raw)
	switch format {
	case "DD/MM/YYYY":
		return time.Parse("02/01/2006", raw)
	case "MM/DD/YYYY":
		return time.Parse("01/02/2006", raw)
	default:
		return time.Parse("2006-01-02", raw)
	}
}

func parseNormalizedDecimal(raw, decSep string, exp int) (int64, error) {
	s := strings.TrimSpace(raw)
	if decSep == "," {
		s = strings.ReplaceAll(s, ".", "")
		s = strings.ReplaceAll(s, ",", ".")
	} else {
		s = strings.ReplaceAll(s, ",", "")
	}
	return ParseMajorToMinor(s, exp)
}
