package auth

import (
	"crypto/rand"
	"encoding/hex"
	"net/http"
	"strings"
	"sync"
	"time"

	"golang.org/x/crypto/bcrypt"
	"progit.io/progit/internal/database"
)

const SessionCookieName = "progit_session"

type Session struct {
	Token     string
	UserID    int64
	Username  string
	CreatedAt time.Time
	ExpiresAt time.Time
}

var (
	sessions   = make(map[string]*Session)
	sessionsMu sync.RWMutex
)

// HashPassword hashes a raw password using bcrypt.
func HashPassword(password string) (string, error) {
	bytes, err := bcrypt.GenerateFromPassword([]byte(password), 12)
	return string(bytes), err
}

// CheckPassword checks if password matches the bcrypt hash.
func CheckPassword(password, hash string) bool {
	err := bcrypt.CompareHashAndPassword([]byte(hash), []byte(password))
	return err == nil
}

// CreateSession generates a new 32-byte cryptographically secure session token.
func CreateSession(userID int64, username string) (*Session, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return nil, err
	}
	token := hex.EncodeToString(b)
	now := time.Now()
	expires := now.Add(7 * 24 * time.Hour)
	sess := &Session{
		Token:     token,
		UserID:    userID,
		Username:  username,
		CreatedAt: now,
		ExpiresAt: expires,
	}

	sessionsMu.Lock()
	sessions[token] = sess
	sessionsMu.Unlock()

	// Persist to SQLite so container restarts preserve login sessions
	_ = database.SaveDBSession(token, userID, username, now, expires)

	return sess, nil
}

// GetSession returns the active session for a given token.
func GetSession(token string) *Session {
	sessionsMu.RLock()
	sess, ok := sessions[token]
	sessionsMu.RUnlock()

	if ok && !time.Now().After(sess.ExpiresAt) {
		return sess
	}

	// Fallback to SQLite DB if not in memory (e.g. after container/service restart)
	dbSess, err := database.GetDBSession(token)
	if err == nil && dbSess != nil && time.Now().Before(dbSess.ExpiresAt) {
		sess = &Session{
			Token:     dbSess.Token,
			UserID:    dbSess.UserID,
			Username:  dbSess.Username,
			CreatedAt: dbSess.CreatedAt,
			ExpiresAt: dbSess.ExpiresAt,
		}
		sessionsMu.Lock()
		sessions[token] = sess
		sessionsMu.Unlock()
		return sess
	}

	return nil
}

// DeleteSession destroys the session in memory and database.
func DeleteSession(token string) {
	sessionsMu.Lock()
	delete(sessions, token)
	sessionsMu.Unlock()

	_ = database.DeleteDBSession(token)
}

// CountActiveSessions returns the number of unexpired active sessions.
func CountActiveSessions() int {
	sessionsMu.RLock()
	defer sessionsMu.RUnlock()
	now := time.Now()
	count := 0
	for _, s := range sessions {
		if now.Before(s.ExpiresAt) {
			count++
		}
	}
	return count
}

// AuthenticateRequest extracts the user from Session Cookie or Bearer Token.
func AuthenticateRequest(r *http.Request) *database.User {
	// 1. Try Bearer token (PAT or session token)
	authHeader := r.Header.Get("Authorization")
	if strings.HasPrefix(authHeader, "Bearer ") {
		token := strings.TrimPrefix(authHeader, "Bearer ")
		user, err := database.GetUserByAccessToken(token)
		if err == nil && user != nil && user.IsActive {
			return user
		}
		if sess := GetSession(token); sess != nil {
			if user, err := database.GetUserByID(sess.UserID); err == nil && user != nil && user.IsActive {
				return user
			}
		}
	}

	// 2. Try session cookie
	cookie, err := r.Cookie(SessionCookieName)
	if err == nil && cookie.Value != "" {
		sess := GetSession(cookie.Value)
		if sess != nil {
			user, err := database.GetUserByID(sess.UserID)
			if err == nil && user != nil && user.IsActive {
				return user
			}
		}
	}

	return nil
}

