package auth

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/base64"
	"errors"
	"fmt"
	"strconv"
	"strings"

	"golang.org/x/crypto/argon2"
)

const (
	MinPasswordBytes = 10
	MaxPasswordBytes = 1024
)

type Argon2idParams struct {
	Memory      uint32
	Iterations  uint32
	Parallelism uint8
	SaltLength  uint32
	KeyLength   uint32
}

func LaunchArgon2idParams() Argon2idParams {
	return Argon2idParams{Memory: 19 * 1024, Iterations: 2, Parallelism: 1, SaltLength: 16, KeyLength: 32}
}

type PasswordHasher struct {
	params Argon2idParams
}

func NewPasswordHasher(params Argon2idParams) PasswordHasher {
	return PasswordHasher{params: params}
}

func ValidatePassword(password string) error {
	size := len([]byte(password))
	if size < MinPasswordBytes || size > MaxPasswordBytes {
		return fmt.Errorf("password must contain between %d and %d bytes", MinPasswordBytes, MaxPasswordBytes)
	}
	return nil
}

func (hasher PasswordHasher) Hash(password string) (string, error) {
	if err := ValidatePassword(password); err != nil {
		return "", err
	}
	salt := make([]byte, hasher.params.SaltLength)
	if _, err := rand.Read(salt); err != nil {
		return "", fmt.Errorf("generate password salt: %w", err)
	}
	hash := argon2.IDKey([]byte(password), salt, hasher.params.Iterations, hasher.params.Memory, hasher.params.Parallelism, hasher.params.KeyLength)
	return fmt.Sprintf("$argon2id$v=19$m=%d,t=%d,p=%d$%s$%s", hasher.params.Memory, hasher.params.Iterations, hasher.params.Parallelism, base64.RawStdEncoding.EncodeToString(salt), base64.RawStdEncoding.EncodeToString(hash)), nil
}

func (hasher PasswordHasher) Verify(password, encoded string) (bool, error) {
	params, salt, expected, err := decodeArgon2id(encoded)
	if err != nil {
		return false, err
	}
	actual := argon2.IDKey([]byte(password), salt, params.Iterations, params.Memory, params.Parallelism, uint32(len(expected)))
	return subtle.ConstantTimeCompare(actual, expected) == 1, nil
}

func (hasher PasswordHasher) NeedsRehash(encoded string) bool {
	params, _, _, err := decodeArgon2id(encoded)
	if err != nil {
		return true
	}
	return params.Memory != hasher.params.Memory || params.Iterations != hasher.params.Iterations || params.Parallelism != hasher.params.Parallelism || params.KeyLength != hasher.params.KeyLength
}

func decodeArgon2id(encoded string) (Argon2idParams, []byte, []byte, error) {
	parts := strings.Split(encoded, "$")
	if len(parts) != 6 || parts[1] != "argon2id" || parts[2] != "v=19" {
		return Argon2idParams{}, nil, nil, errors.New("invalid password hash encoding")
	}
	var memory, iterations uint64
	var parallelism uint64
	for _, value := range strings.Split(parts[3], ",") {
		pair := strings.SplitN(value, "=", 2)
		if len(pair) != 2 {
			return Argon2idParams{}, nil, nil, errors.New("invalid password hash parameters")
		}
		parsed, err := strconv.ParseUint(pair[1], 10, 32)
		if err != nil {
			return Argon2idParams{}, nil, nil, errors.New("invalid password hash parameters")
		}
		switch pair[0] {
		case "m":
			memory = parsed
		case "t":
			iterations = parsed
		case "p":
			parallelism = parsed
		}
	}
	if memory == 0 || iterations == 0 || parallelism == 0 || parallelism > 255 {
		return Argon2idParams{}, nil, nil, errors.New("invalid password hash parameters")
	}
	salt, err := base64.RawStdEncoding.DecodeString(parts[4])
	if err != nil || len(salt) < 8 {
		return Argon2idParams{}, nil, nil, errors.New("invalid password hash salt")
	}
	hash, err := base64.RawStdEncoding.DecodeString(parts[5])
	if err != nil || len(hash) < 16 {
		return Argon2idParams{}, nil, nil, errors.New("invalid password hash value")
	}
	return Argon2idParams{Memory: uint32(memory), Iterations: uint32(iterations), Parallelism: uint8(parallelism), SaltLength: uint32(len(salt)), KeyLength: uint32(len(hash))}, salt, hash, nil
}
