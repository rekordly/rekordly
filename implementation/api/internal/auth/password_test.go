package auth

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestPasswordHasherRoundTrip(t *testing.T) {
	hasher := NewPasswordHasher(LaunchArgon2idParams())
	encoded, err := hasher.Hash("correct horse battery staple")
	require.NoError(t, err)
	require.NotContains(t, encoded, "correct horse")
	require.True(t, hasher.NeedsRehash(encoded) == false)

	valid, err := hasher.Verify("correct horse battery staple", encoded)
	require.NoError(t, err)
	require.True(t, valid)

	valid, err = hasher.Verify("wrong password", encoded)
	require.NoError(t, err)
	require.False(t, valid)
}

func TestPasswordLengthBoundaries(t *testing.T) {
	require.Error(t, ValidatePassword("short"))
	require.NoError(t, ValidatePassword("ten-bytes!"))
	require.Error(t, ValidatePassword(string(make([]byte, MaxPasswordBytes+1))))
}

func TestMalformedHashIsRejected(t *testing.T) {
	hasher := NewPasswordHasher(LaunchArgon2idParams())
	valid, err := hasher.Verify("any password", "$argon2id$broken")
	require.Error(t, err)
	require.False(t, valid)
}
