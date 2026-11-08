package migrations

import "embed"

// Files contains the ordered SQL migrations compiled into the migration binary.
//
//go:embed *.sql
var Files embed.FS
