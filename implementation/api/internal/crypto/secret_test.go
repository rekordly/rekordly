package crypto

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/hex"
	"io"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestEncryptDecryptSecret(t *testing.T) {
	key := "my-very-secure-master-encryption-key-32b"
	plaintext := "sk_live_1234567890abcdef"

	enc, err := EncryptSecret(plaintext, key)
	require.NoError(t, err)
	require.NotEmpty(t, enc)
	require.NotEqual(t, plaintext, enc)
	require.True(t, strings.HasPrefix(enc, "v1:"), "all new ciphertexts must be prefixed with v1:")

	dec, err := DecryptSecret(enc, key)
	require.NoError(t, err)
	require.Equal(t, plaintext, dec)

	// Unprefixed legacy ciphertext is rejected by normal DecryptSecret
	rawHex := strings.TrimPrefix(enc, "v1:")
	_, err = DecryptSecret(rawHex, key)
	require.ErrorIs(t, err, ErrInvalidCiphertext)

	// DecryptLegacySecret accepts both unprefixed legacy hex and v1: ciphertexts
	legacyDec, err := DecryptLegacySecret(rawHex, key)
	require.NoError(t, err)
	require.Equal(t, plaintext, legacyDec)

	// Wrong key fails
	_, err = DecryptSecret(enc, "another-32-byte-wrong-encryption-key!!")
	require.Error(t, err)

	// Short key fails (< 32 bytes)
	_, err = EncryptSecret(plaintext, "too-short-key")
	require.ErrorIs(t, err, ErrKeyTooShort)
	_, err = DecryptSecret(enc, "too-short-key")
	require.ErrorIs(t, err, ErrKeyTooShort)
	require.ErrorIs(t, SetKey("too-short-key"), ErrKeyTooShort)

	// Corrupted ciphertext fails
	_, err = DecryptSecret("v1:badhex", key)
	require.Error(t, err)

	// Empty key fails
	_, err = EncryptSecret(plaintext, "")
	require.ErrorIs(t, err, ErrEmptyKey)
	require.ErrorIs(t, SetKey(""), ErrEmptyKey)

	// SetKey / Encrypt / Decrypt round-trip
	require.NoError(t, SetKey(key))
	encActive, err := Encrypt(plaintext)
	require.NoError(t, err)
	require.True(t, strings.HasPrefix(encActive, "v1:"))
	decActive, err := Decrypt(encActive)
	require.NoError(t, err)
	require.Equal(t, plaintext, decActive)
}

func encryptLegacyUnprefixedForTest(t *testing.T, plaintext, key string) string {
	t.Helper()
	block, err := aes.NewCipher(deriveKey(key))
	require.NoError(t, err)
	gcm, err := cipher.NewGCM(block)
	require.NoError(t, err)
	nonce := make([]byte, gcm.NonceSize())
	_, err = io.ReadFull(rand.Reader, nonce)
	require.NoError(t, err)
	return hex.EncodeToString(gcm.Seal(nonce, nonce, []byte(plaintext), nil))
}

func TestLegacyMigrationDecryptAndReencrypt(t *testing.T) {
	oldKey := LegacyDefaultKey
	newKey := "new-dedicated-production-data-encryption-key-32b"
	secret := "SUB_ACCT_LEGACY_9988"

	legacyCipher := encryptLegacyUnprefixedForTest(t, secret, oldKey)
	require.False(t, strings.HasPrefix(legacyCipher, "v1:"))

	// Normal DecryptSecret rejects legacy unprefixed ciphertext
	_, err := DecryptSecret(legacyCipher, oldKey)
	require.ErrorIs(t, err, ErrInvalidCiphertext)

	// One-off migration path decrypts with oldKey and re-encrypts with newKey + v1:
	plain, err := DecryptLegacySecret(legacyCipher, oldKey)
	require.NoError(t, err)
	require.Equal(t, secret, plain)

	v1Cipher, err := EncryptSecret(plain, newKey)
	require.NoError(t, err)
	require.True(t, strings.HasPrefix(v1Cipher, "v1:"))

	recovered, err := DecryptSecret(v1Cipher, newKey)
	require.NoError(t, err)
	require.Equal(t, secret, recovered)
}

func TestMaskSecret(t *testing.T) {
	require.Equal(t, "••••cdef", MaskSecret("sk_live_1234567890abcdef"))
	require.Equal(t, "••••", MaskSecret("123"))
	require.Equal(t, "", MaskSecret(""))
}
