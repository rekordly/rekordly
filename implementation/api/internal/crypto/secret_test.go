package crypto

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestEncryptDecryptSecret(t *testing.T) {
	key := "my-very-secure-master-encryption-key"
	plaintext := "sk_live_1234567890abcdef"

	enc, err := EncryptSecret(plaintext, key)
	require.NoError(t, err)
	require.NotEmpty(t, enc)
	require.NotEqual(t, plaintext, enc)

	dec, err := DecryptSecret(enc, key)
	require.NoError(t, err)
	require.Equal(t, plaintext, dec)

	// Wrong key fails
	_, err = DecryptSecret(enc, "wrong-key")
	require.Error(t, err)

	// Corrupted ciphertext fails
	_, err = DecryptSecret("badhex", key)
	require.Error(t, err)

	// Empty key fails
	_, err = EncryptSecret(plaintext, "")
	require.ErrorIs(t, err, ErrEmptyKey)
}

func TestMaskSecret(t *testing.T) {
	require.Equal(t, "••••cdef", MaskSecret("sk_live_1234567890abcdef"))
	require.Equal(t, "••••", MaskSecret("123"))
	require.Equal(t, "", MaskSecret(""))
}
