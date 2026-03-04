#!/bin/bash
echo "=== Server-Status prüfen ==="
echo ""

echo "1. Läuft Node.js?"
ps aux | grep node | grep -v grep

echo ""
echo "2. Lauscht etwas auf Port 3000?"
ss -tlnp | grep :3000 || netstat -tlnp | grep :3000

echo ""
echo "3. Teste localhost:3000"
curl -s http://localhost:3000/health || echo "Server antwortet nicht lokal"

echo ""
echo "4. Teste 0.0.0.0:3000"
curl -s http://0.0.0.0:3000/health || echo "Server antwortet nicht auf 0.0.0.0"

echo ""
echo "5. PM2 Status (falls verwendet)"
pm2 list 2>/dev/null || echo "PM2 nicht installiert oder keine Prozesse"

echo ""
echo "6. Letzte Zeilen aus dem Server-Log"
tail -20 server.log 2>/dev/null || echo "Keine server.log gefunden"
