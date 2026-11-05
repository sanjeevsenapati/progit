package auth

import (
	"os"
	"testing"

	"progit.io/progit/internal/config"
	"progit.io/progit/internal/database"
)

func TestSessionPersistence(t *testing.T) {
	tmpDB := "/tmp/progit-auth-test.db"
	defer os.Remove(tmpDB)

	cfg := &config.Config{
		Database: config.DatabaseConfig{
			Type: "sqlite",
			Path: tmpDB,
		},
	}
	if err := database.Init(cfg); err != nil {
		t.Fatalf("Init db failed: %v", err)
	}

	user, err := database.CreateUser("persisted_user", "persisted@example.com", "hash", "Persisted User", false)
	if err != nil {
		t.Fatalf("CreateUser failed: %v", err)
	}

	sess, err := CreateSession(user.ID, user.Username)
	if err != nil {
		t.Fatalf("CreateSession failed: %v", err)
	}

	// 1. Verify in-memory session works
	found := GetSession(sess.Token)
	if found == nil || found.Username != "persisted_user" {
		t.Fatalf("Expected session in memory, got %v", found)
	}

	// 2. Clear in-memory sessions cache (simulating server restart)
	sessionsMu.Lock()
	sessions = make(map[string]*Session)
	sessionsMu.Unlock()

	// 3. Verify session is restored from SQLite DB
	recovered := GetSession(sess.Token)
	if recovered == nil {
		t.Fatalf("Expected session recovered from SQLite, got nil")
	}
	if recovered.Username != "persisted_user" || recovered.UserID != user.ID {
		t.Fatalf("Recovered session mismatch: %+v", recovered)
	}

	// 4. Verify DeleteSession deletes from both memory and DB
	DeleteSession(sess.Token)
	if GetSession(sess.Token) != nil {
		t.Fatalf("Expected session deleted, but still found")
	}
}
