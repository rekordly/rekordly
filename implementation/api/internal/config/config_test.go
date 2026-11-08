package config

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestValidateDatabaseEnvironmentAllowsComposeHost(t *testing.T) {
	require.NoError(t, validateDatabaseEnvironment(
		"local",
		"postgres://rekordly:local@rekordly-postgres:5432/rekordly?sslmode=disable",
	))
}

func TestValidateDatabaseEnvironmentRejectsRemoteHostForLocal(t *testing.T) {
	err := validateDatabaseEnvironment(
		"local",
		"postgres://user:secret@production.example.neon.tech/rekordly?sslmode=require",
	)
	require.ErrorContains(t, err, "not an approved local database host")
}

func TestValidateDatabaseEnvironmentAllowsRemoteHostForProduction(t *testing.T) {
	require.NoError(t, validateDatabaseEnvironment(
		"production",
		"postgres://user:secret@production.example.neon.tech/rekordly?sslmode=require",
	))
}
