package crypto

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"io"
	"strings"
	"sync"
)

const (
	// CiphertextVersionPrefix marks all v1 AES-GCM ciphertexts.
	CiphertextVersionPrefix = "v1:"
	// MinKeyLength is the minimum byte length required for DATA_ENCRYPTION_KEY.
	MinKeyLength = 32
	// LocalDevDefaultKey is the explicit local-dev-only encryption key used by config.Load()
	// when ENVIRONMENT=local and DATA_ENCRYPTION_KEY is not set.
	LocalDevDefaultKey = "rekordly-local-dev-only-data-encryption-key-32b"
	// LegacyDefaultKey is the pre-corrections dev key accepted only by DecryptLegacySecret.
	LegacyDefaultKey = "rekordly-default-storefront-encryption-secret-key-32b"
)

var (
	ErrInvalidCiphertext = errors.New("invalid ciphertext")
	ErrEmptyKey          = errors.New("encryption key cannot be empty")
	ErrKeyTooShort       = errors.New("encryption key must be at least 32 bytes")
)

var (
	keyMu         sync.RWMutex
	configuredKey string
)

// SetKey configures the process-wide data encryption key from config.Config.
func SetKey(key string) error {
	trimmed := strings.TrimSpace(key)
	if trimmed == "" {
		return ErrEmptyKey
	}
	if len(trimmed) < MinKeyLength {
		return ErrKeyTooShort
	}
	keyMu.Lock()
	configuredKey = trimmed
	keyMu.Unlock()
	return nil
}

// ActiveKey returns the configured data encryption key.
func ActiveKey() string {
	keyMu.RLock()
	k := configuredKey
	keyMu.RUnlock()
	return k
}

// Encrypt encrypts using the configured DATA_ENCRYPTION_KEY.
func Encrypt(plaintext string) (string, error) {
	return EncryptSecret(plaintext, ActiveKey())
}

// Decrypt decrypts using the configured DATA_ENCRYPTION_KEY.
func Decrypt(ciphertext string) (string, error) {
	return DecryptSecret(ciphertext, ActiveKey())
}

// deriveKey derives a 32-byte key from a secret string using SHA-256.
func deriveKey(key string) []byte {
	h := sha256.Sum256([]byte(key))
	return h[:]
}

func validateKey(key string) (string, error) {
	trimmed := strings.TrimSpace(key)
	if trimmed == "" {
		return "", ErrEmptyKey
	}
	if len(trimmed) < MinKeyLength {
		return "", ErrKeyTooShort
	}
	return trimmed, nil
}

// EncryptSecret encrypts a plaintext string using AES-GCM and returns "v1:<hex(nonce+ciphertext)>".
func EncryptSecret(plaintext string, key string) (string, error) {
	validKey, err := validateKey(key)
	if err != nil {
		return "", err
	}
	if plaintext == "" {
		return "", nil
	}

	block, err := aes.NewCipher(deriveKey(validKey))
	if err != nil {
		return "", err
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}

	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", err
	}

	ciphertext := gcm.Seal(nonce, nonce, []byte(plaintext), nil)
	return CiphertextVersionPrefix + hex.EncodeToString(ciphertext), nil
}

// DecryptSecret decrypts a "v1:"-prefixed hex-encoded ciphertext (nonce + ciphertext) using AES-GCM.
// Unprefixed or unknown-version ciphertexts are rejected with ErrInvalidCiphertext.
func DecryptSecret(ciphertext string, key string) (string, error) {
	validKey, err := validateKey(key)
	if err != nil {
		return "", err
	}
	if ciphertext == "" {
		return "", nil
	}
	if !strings.HasPrefix(ciphertext, CiphertextVersionPrefix) {
		return "", ErrInvalidCiphertext
	}
	return decryptRawHex(strings.TrimPrefix(ciphertext, CiphertextVersionPrefix), validKey)
}

// DecryptLegacySecret decrypts either a "v1:"-prefixed or legacy unprefixed hex ciphertext using oldKey.
// Used only by the one-off re-encryption migration utility for local dev rows created before v1: prefixing.
func DecryptLegacySecret(ciphertext string, oldKey string) (string, error) {
	validKey, err := validateKey(oldKey)
	if err != nil {
		return "", err
	}
	if ciphertext == "" {
		return "", nil
	}
	rawHex := strings.TrimPrefix(ciphertext, CiphertextVersionPrefix)
	return decryptRawHex(rawHex, validKey)
}

func decryptRawHex(ciphertextHex string, validKey string) (string, error) {
	data, err := hex.DecodeString(ciphertextHex)
	if err != nil {
		return "", ErrInvalidCiphertext
	}

	block, err := aes.NewCipher(deriveKey(validKey))
	if err != nil {
		return "", err
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}

	nonceSize := gcm.NonceSize()
	if len(data) < nonceSize {
		return "", ErrInvalidCiphertext
	}

	nonce, ciphertext := data[:nonceSize], data[nonceSize:]
	plaintext, err := gcm.Open(nil, nonce, ciphertext, nil)
	if err != nil {
		return "", ErrInvalidCiphertext
	}

	return string(plaintext), nil
}

// MaskSecret returns a masked representation showing only the last 4 characters.
// For example: "••••1234". If the secret is shorter than 4 characters, returns "••••".
func MaskSecret(secret string) string {
	s := strings.TrimSpace(secret)
	if len(s) == 0 {
		return ""
	}
	if len(s) <= 4 {
		return "••••"
	}
	return "••••" + s[len(s)-4:]
}
