#!/bin/bash

# Deployment-Script für Ubuntu Linux
# Dieses Script automatisiert die Installation auf einem Ubuntu Server

set -e

echo "🚀 Abonnementsverwaltung - Ubuntu Deployment"
echo "============================================"
echo ""

# Prüfen ob als Root ausgeführt
if [ "$EUID" -eq 0 ]; then 
    echo "⚠️  Bitte nicht als root ausführen!"
    echo "Verwende: bash deploy-ubuntu.sh"
    exit 1
fi

# Farben für Ausgabe
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Schritt 1: System aktualisieren
echo -e "${YELLOW}📦 Schritt 1: System aktualisieren...${NC}"
sudo apt update && sudo apt upgrade -y

# Schritt 2: Node.js prüfen/installieren
echo -e "${YELLOW}📦 Schritt 2: Node.js prüfen...${NC}"
if ! command -v node &> /dev/null; then
    echo "Node.js nicht gefunden. Installiere Node.js..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt install -y nodejs build-essential
else
    echo -e "${GREEN}✓ Node.js ist bereits installiert: $(node --version)${NC}"
fi

# Schritt 3: NPM-Pakete installieren
echo -e "${YELLOW}📦 Schritt 3: NPM-Pakete installieren...${NC}"
npm install

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Fehler beim Installieren der NPM-Pakete${NC}"
    exit 1
fi

# Schritt 4: PM2 installieren
echo -e "${YELLOW}📦 Schritt 4: PM2 Process Manager installieren...${NC}"
if ! command -v pm2 &> /dev/null; then
    sudo npm install -g pm2
    echo -e "${GREEN}✓ PM2 installiert${NC}"
else
    echo -e "${GREEN}✓ PM2 ist bereits installiert${NC}"
fi

# Schritt 5: .env Datei erstellen (falls nicht vorhanden)
echo -e "${YELLOW}🔧 Schritt 5: Umgebungsvariablen konfigurieren...${NC}"
if [ ! -f .env ]; then
    echo "Erstelle .env Datei..."
    SESSION_SECRET=$(openssl rand -base64 32)
    cat > .env << EOF
NODE_ENV=production
PORT=3000
SESSION_SECRET=$SESSION_SECRET
EOF
    echo -e "${GREEN}✓ .env Datei erstellt mit zufälligem Session-Secret${NC}"
else
    echo -e "${GREEN}✓ .env Datei existiert bereits${NC}"
fi

# Schritt 6: Berechtigungen setzen
echo -e "${YELLOW}🔒 Schritt 6: Berechtigungen setzen...${NC}"
chmod 600 .env 2>/dev/null || true
echo -e "${GREEN}✓ Berechtigungen gesetzt${NC}"

# Schritt 7: Firewall konfigurieren
echo -e "${YELLOW}🔥 Schritt 7: Firewall konfigurieren...${NC}"
if command -v ufw &> /dev/null; then
    UFW_STATUS=$(sudo ufw status | head -n 1)
    if [[ "$UFW_STATUS" == *"active"* ]]; then
        sudo ufw allow 3000/tcp >/dev/null
        echo -e "${GREEN}✓ Port 3000 in UFW geöffnet${NC}"
    else
        echo -e "${YELLOW}ℹ️ UFW ist nicht aktiv - überspringe UFW-Regel${NC}"
    fi
else
    echo -e "${YELLOW}ℹ️ UFW ist nicht installiert - überspringe UFW-Regel${NC}"
fi

# Schritt 8: App mit PM2 starten
echo -e "${YELLOW}🚀 Schritt 8: Anwendung starten...${NC}"
read -p "App jetzt mit PM2 starten? (j/n): " -n 1 -r
echo
if [[ $REPLY =~ ^[Jj]$ ]]; then
    pm2 stop abonnement-app 2>/dev/null || true
    pm2 delete abonnement-app 2>/dev/null || true
    pm2 start server.js --name abonnement-app --env production --update-env
    pm2 save

    sleep 2
    if pm2 pid abonnement-app >/dev/null; then
        echo -e "${GREEN}✓ PM2 Prozess läuft${NC}"
    else
        echo -e "${RED}❌ PM2 Prozess konnte nicht gestartet werden${NC}"
        echo "Logs prüfen mit: pm2 logs abonnement-app --lines 100"
        exit 1
    fi

    if command -v curl &> /dev/null; then
        if curl -fsS http://127.0.0.1:3000/health >/dev/null; then
            echo -e "${GREEN}✓ Health-Check erfolgreich (/health)${NC}"
        else
            echo -e "${YELLOW}⚠️ Health-Check fehlgeschlagen. Prüfe Logs:${NC} pm2 logs abonnement-app --lines 100"
        fi
    fi
    
    # Auto-Start beim Systemstart
    read -p "Auto-Start beim Systemstart aktivieren? (j/n): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Jj]$ ]]; then
        pm2 startup
        echo -e "${YELLOW}Führe den oben angezeigten Befehl aus (falls angezeigt)${NC}"
    fi
    
    echo -e "${GREEN}✓ App gestartet${NC}"
fi

# Nginx-Installation anbieten
echo ""
echo -e "${YELLOW}🌐 Nginx Reverse Proxy${NC}"
read -p "Soll Nginx als Reverse Proxy installiert werden? (j/n): " -n 1 -r
echo
if [[ $REPLY =~ ^[Jj]$ ]]; then
    sudo apt install -y nginx
    
    echo ""
    echo "Nginx wurde installiert."
    echo "Erstelle eine Konfigurationsdatei unter:"
    echo "/etc/nginx/sites-available/abonnement"
    echo ""
    echo "Siehe README.md für die Konfiguration."
fi

# Zusammenfassung
echo ""
echo -e "${GREEN}✅ Installation abgeschlossen!${NC}"
echo ""
echo "Deine Anwendung läuft auf:"
echo "  → http://localhost:3000"
echo "  → http://$(hostname -I | awk '{print $1}'):3000"
echo ""
echo "Nützliche Befehle:"
echo "  pm2 list              - Laufende Prozesse anzeigen"
echo "  pm2 logs              - Logs anzeigen"
echo "  pm2 restart all       - App neu starten"
echo "  pm2 stop all          - App stoppen"
echo "  curl http://127.0.0.1:3000/health - Lokalen Health-Check"
echo ""
echo -e "${YELLOW}Wichtig für Cloud-Server:${NC}"
echo "  Falls extern weiterhin Timeout auf :3000 kommt, öffne Port 3000 auch"
echo "  in der Cloud-Sicherheitsgruppe (z. B. OCI Security List / NSG)."
echo ""
echo "Weitere Informationen in der README.md"
echo ""
