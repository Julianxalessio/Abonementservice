# 🎫 Abonnementsverwaltung mit sicherem Login

Ein vollständiges Web-Anwendungssystem mit Benutzer-Authentifizierung, verschlüsselter Passwort-Speicherung und Datenbank-Anbindung.

Dies installiert alle benötigten Pakete:
- `express` - Webserver-Framework
- `express-session` - Session-Verwaltung
- `bcrypt` - Passwort-Verschlüsselung
- `sqlite3` - Datenbank

#### Schritt 3: Server starten

```bash
# Im Vordergrund (zum Testen):
npm start

# Im Hintergrund mit PM2 (empfohlen für Produktion):
sudo npm install -g pm2
pm2 start server.js --name "abonnement-app"
pm2 startup  # Auto-Start beim Systemstart
pm2 save     # Konfiguration speichern
```

#### Schritt 4: Firewall konfigurieren (optional)

```bash
# Port 3000 freigeben
sudo ufw allow 3000/tcp
sudo ufw status
```



### PM2 für Auto-Restart und Logging

```bash
# PM2 global installieren
sudo npm install -g pm2

# App mit PM2 starten
pm2 start server.js --name abonnement-app --env production

# Beim Systemstart automatisch starten
pm2 startup
pm2 save

# Nützliche PM2-Befehle:
pm2 list              # Laufende Prozesse anzeigen
pm2 logs              # Logs anzeigen
pm2 restart all       # Alle Apps neu starten
pm2 stop all          # Alle Apps stoppen
pm2 delete all        # Alle Apps entfernen
```

- [ ] **Session-Secret ändern** (siehe `.env` oben)

### Datenbank neu erstellen

Lösche die Datei `database.db` und starte den Server neu.

## 📝 API-Endpunkte

### POST `/api/login`
Login mit Benutzername und Passwort

**Request:**
```json
{
  "username": "testuser",
  "password": "test123"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Login erfolgreich",
  "redirect": "/dashboard.html"
}
```

### GET `/api/user-data`
Abrufen der Benutzerdaten (nur für angemeldete Benutzer)

**Response:**
```json
{
  "success": true,
  "user": {
    "username": "testuser",
    "email": "test@example.com",
    "created_at": "2026-03-04"
  },
  "data": [
    {"data_key": "abonnement_typ", "data_value": "Premium"},
    {"data_key": "gueltig_bis", "data_value": "31.12.2026"}
  ]
}
```

### POST `/api/logout`
Abmelden und Session beenden

## 📚 Weiterführende Ressourcen

- [Express.js Dokumentation](https://expressjs.com/)
- [bcrypt Dokumentation](https://www.npmjs.com/package/bcrypt)
- [SQLite Dokumentation](https://www.sqlite.org/docs.html)
- [Node.js Security Best Practices](https://nodejs.org/en/docs/guides/security/)

## 📄 Lizenz

Dieses Projekt ist frei nutzbar für private und kommerzielle Zwecke.

---

**Viel Erfolg mit deiner Abonnementsverwaltung! 🚀**
