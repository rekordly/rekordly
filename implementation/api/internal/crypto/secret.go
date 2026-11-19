package crypto

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"io"
	"os"
	"strings"
)

var (
	ErrInvalidCiphertext = errors.New("invalid ciphertext")
	ErrEmptyKey          = errors.New("encryption key cannot be empty")
)

func defaultKey() string {
	if k := os.Getenv("SECRET_KEY"); k != "" {
		return k
	}
	if k := os.Getenv("JWT_SIGNING_SECRET"); k != "" {
		return k
	}
	return "rekordly-default-storefront-encryption-secret-key-32b"
}

// Encrypt encrypts using the environment secret key.
func Encrypt(plaintext string) (string, error) {
	return EncryptSecret(plaintext, defaultKey())
}

// Decrypt decrypts using the environment secret key.
func Decrypt(ciphertext string) (string, error) {
	return DecryptSecret(ciphertext, defaultKey())
}

// deriveKey derives a 32-byte key from a secret string using SHA-256.
func deriveKey(key string) []byte {
	h := sha256.Sum256([]byte(key))
	return h[:]
}

// EncryptSecret encrypts a plaintext string using AES-GCM and returns a hex-encoded string (nonce + ciphertext).
func EncryptSecret(plaintext string, key string) (string, error) {
	if strings.TrimSpace(key) == "" {
		return "", ErrEmptyKey
	}
	if plaintext == "" {
		return "", nil
	}

	block, err := aes.NewCipher(deriveKey(key))
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
	return hex.EncodeToString(ciphertext), nil
}

// DecryptSecret decrypts a hex-encoded ciphertext (nonce + ciphertext) using AES-GCM.
func DecryptSecret(ciphertextHex string, key string) (string, error) {
	if strings.TrimSpace(key) == "" {
		return "", ErrEmptyKey
	}
	if ciphertextHex == "" {
		return "", nil
	}

	data, err := hex.DecodeString(ciphertextHex)
	if err != nil {
		return "", ErrInvalidCiphertext
	}

	block, err := aes.NewCipher(deriveKey(key))
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
