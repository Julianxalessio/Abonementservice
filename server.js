require('dotenv').config();
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const session = require('express-session');
const path = require('path');

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const SESSION_SECRET = process.env.SESSION_SECRET || 'dein-geheimer-session-key-hier-ändern';
const DB_PATH = path.join(__dirname, 'database.db');

const db = new sqlite3.Database(DB_PATH, async (err) => {
    if (err) {
        console.error('Fehler beim Öffnen der Datenbank:', err.message);
        process.exit(1);
    }

    console.log(`Verbunden mit der SQLite-Datenbank: ${DB_PATH}`);

    try {
        await initDatabase();
        await seedDefaultUsers();
        startServer();
    } catch (initErr) {
        console.error('Fehler bei der Datenbank-Initialisierung:', initErr.message);
        process.exit(1);
    }
});

function run(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function onRun(err) {
            if (err) {
                reject(err);
                return;
            }
            resolve(this);
        });
    });
}

function get(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => {
            if (err) {
                reject(err);
                return;
            }
            resolve(row);
        });
    });
}

function all(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) {
                reject(err);
                return;
            }
            resolve(rows);
        });
    });
}

async function initDatabase() {
    await run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        email TEXT,
        is_admin INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    await run(`CREATE TABLE IF NOT EXISTS user_data (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        data_key TEXT NOT NULL,
        data_value TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
    )`);

    await run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_user_data_unique ON user_data(user_id, data_key)`);

    await run(`CREATE TABLE IF NOT EXISTS abos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        abo_name TEXT NOT NULL,
        gueltig_bis TEXT NOT NULL,
        status TEXT DEFAULT 'Aktiv',
        website TEXT,
        preis REAL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
    )`);
}

async function seedDefaultUsers() {
    const defaults = [
        {
            username: 'root',
            password: 'root',
            isAdmin: 1,
            aboName: 'Premium',
            gueltigBis: '2026-12-31',
            status: 'Aktiv'
        },
        {
            username: 'Julian',
            password: '!Jera160809!',
            isAdmin: 0
        }
    ];

    for (const defaultUser of defaults) {
        const hashedPassword = await bcrypt.hash(defaultUser.password, 10);

        await run(
            `INSERT OR IGNORE INTO users (username, password, email, is_admin) VALUES (?, ?, ?, ?)`,
            [defaultUser.username, hashedPassword, defaultUser.email, defaultUser.isAdmin || 0]
        );

        const user = await get('SELECT id FROM users WHERE username = ?', [defaultUser.username]);
        if (!user) {
            continue;
        }

        if (defaultUser.aboName) {
            await run(
                `INSERT OR IGNORE INTO abos (user_id, abo_name, gueltig_bis, status, website, preis)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [user.id, defaultUser.aboName, defaultUser.gueltigBis, defaultUser.status, '', 0]
            );

            await syncUserDataFromAbo(user.id, defaultUser.aboName, defaultUser.gueltigBis, defaultUser.status);
        }
    }
}

async function syncUserDataFromAbo(userId, aboName, gueltigBis, status) {
    await run(
        `INSERT INTO user_data (user_id, data_key, data_value) VALUES (?, ?, ?), (?, ?, ?), (?, ?, ?)
         ON CONFLICT(user_id, data_key) DO UPDATE SET data_value = excluded.data_value`,
        [
            userId, 'abonnement_typ', aboName,
            userId, 'gueltig_bis', toGermanDate(gueltigBis),
            userId, 'status', status
        ]
    );
}

async function syncUserDataFromLatestAbo(userId) {
    const latestAbo = await get(
        `SELECT abo_name, gueltig_bis, status
         FROM abos
         WHERE user_id = ?
         ORDER BY datetime(created_at) DESC, id DESC
         LIMIT 1`,
        [userId]
    );

    if (!latestAbo) {
        await run(
            `DELETE FROM user_data
             WHERE user_id = ? AND data_key IN (?, ?, ?)`,
            [userId, 'abonnement_typ', 'gueltig_bis', 'status']
        );
        return;
    }

    await syncUserDataFromAbo(userId, latestAbo.abo_name, latestAbo.gueltig_bis, latestAbo.status);
}

function toGermanDate(value) {
    if (!value) {
        return '';
    }

    if (/^\d{2}\.\d{2}\.\d{4}$/.test(value)) {
        return value;
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
        return value;
    }

    return parsed.toLocaleDateString('de-DE');
}

function requireAdmin(req, res, next) {
    if (!req.session.userId) {
        return res.status(401).json({
            success: false,
            message: 'Nicht angemeldet'
        });
    }

    get('SELECT is_admin FROM users WHERE id = ?', [req.session.userId])
        .then((user) => {
            if (!user || !user.is_admin) {
                return res.status(403).json({
                    success: false,
                    message: 'Keine Admin-Berechtigung'
                });
            }
            next();
        })
        .catch(() => {
            return res.status(500).json({
                success: false,
                message: 'Datenbankfehler'
            });
        });
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname)));

app.use(session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: false,
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000
    }
}));

app.get('/health', (req, res) => {
    res.json({
        success: true,
        status: 'ok',
        uptime: process.uptime()
    });
});

app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({
            success: false,
            message: 'Benutzername und Passwort erforderlich'
        });
    }

    try {
        const user = await get('SELECT * FROM users WHERE username = ?', [username]);

        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'Benutzername oder Passwort falsch'
            });
        }

        const passwordMatch = await bcrypt.compare(password, user.password);

        if (!passwordMatch) {
            return res.status(401).json({
                success: false,
                message: 'Benutzername oder Passwort falsch'
            });
        }

        req.session.userId = user.id;
        req.session.username = user.username;

        return res.json({
            success: true,
            message: 'Login erfolgreich',
            redirect: '/dashboard.html'
        });
    } catch (err) {
        return res.status(500).json({
            success: false,
            message: 'Datenbankfehler'
        });
    }
});

app.get('/api/user-data', async (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({
            success: false,
            message: 'Nicht angemeldet'
        });
    }

    try {
        const user = await get(
            'SELECT id, username, email, is_admin, created_at FROM users WHERE id = ?',
            [req.session.userId]
        );

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'Benutzer nicht gefunden'
            });
        }

        const data = await all(
            'SELECT data_key, data_value FROM user_data WHERE user_id = ? ORDER BY data_key',
            [req.session.userId]
        );

        const abos = await all(
            `SELECT id, abo_name, gueltig_bis, status, website, preis, created_at
             FROM abos
             WHERE user_id = ?
             ORDER BY datetime(created_at) DESC, id DESC`,
            [req.session.userId]
        );

        return res.json({
            success: true,
            user,
            data,
            abos
        });
    } catch (err) {
        return res.status(500).json({
            success: false,
            message: 'Datenbankfehler'
        });
    }
});

app.get('/api/abos', async (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({
            success: false,
            message: 'Nicht angemeldet'
        });
    }

    try {
        const abos = await all(
            `SELECT id, abo_name, gueltig_bis, status, website, preis, created_at
             FROM abos
             WHERE user_id = ?
             ORDER BY datetime(created_at) DESC, id DESC`,
            [req.session.userId]
        );

        return res.json({
            success: true,
            abos
        });
    } catch (err) {
        return res.status(500).json({
            success: false,
            message: 'Datenbankfehler'
        });
    }
});

app.post('/api/abos', async (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({
            success: false,
            message: 'Nicht angemeldet'
        });
    }

    const {
        abo_name: rawAboName,
        gueltig_bis: rawGueltigBis,
        status: rawStatus,
        website: rawWebsite,
        preis: rawPreis
    } = req.body;

    const aboName = typeof rawAboName === 'string' ? rawAboName.trim() : '';
    const gueltigBis = typeof rawGueltigBis === 'string' ? rawGueltigBis.trim() : '';
    const statusValues = new Set(['Aktiv', 'Pausiert', 'Gekündigt']);
    const status = statusValues.has(rawStatus) ? rawStatus : 'Aktiv';
    const website = typeof rawWebsite === 'string' ? rawWebsite.trim() : '';

    if (!aboName || !gueltigBis) {
        return res.status(400).json({
            success: false,
            message: 'Abo-Name und Gültig-bis sind erforderlich'
        });
    }

    let preis = null;
    if (rawPreis !== undefined && rawPreis !== null && rawPreis !== '') {
        preis = Number(rawPreis);
        if (Number.isNaN(preis)) {
            return res.status(400).json({
                success: false,
                message: 'Preis muss eine gültige Zahl sein'
            });
        }
    }

    try {
        const insertResult = await run(
            `INSERT INTO abos (user_id, abo_name, gueltig_bis, status, website, preis)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [req.session.userId, aboName, gueltigBis, status, website || null, preis]
        );

        await syncUserDataFromAbo(req.session.userId, aboName, gueltigBis, status);

        const abo = await get(
            `SELECT id, abo_name, gueltig_bis, status, website, preis, created_at
             FROM abos
             WHERE id = ?`,
            [insertResult.lastID]
        );

        return res.status(201).json({
            success: true,
            message: 'Abonnement erfolgreich erstellt',
            abo
        });
    } catch (err) {
        if (err.message && err.message.includes('UNIQUE constraint failed')) {
            return res.status(409).json({
                success: false,
                message: 'Dieses Abonnement existiert bereits für den Benutzer'
            });
        }

        return res.status(500).json({
            success: false,
            message: 'Datenbankfehler beim Erstellen des Abonnements'
        });
    }
});

app.delete('/api/abos/:id', async (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({
            success: false,
            message: 'Nicht angemeldet'
        });
    }

    const aboId = Number(req.params.id);
    if (!Number.isInteger(aboId) || aboId <= 0) {
        return res.status(400).json({
            success: false,
            message: 'Ungültige Abonnement-ID'
        });
    }

    try {
        const existingAbo = await get(
            'SELECT id FROM abos WHERE id = ? AND user_id = ?',
            [aboId, req.session.userId]
        );

        if (!existingAbo) {
            return res.status(404).json({
                success: false,
                message: 'Abonnement nicht gefunden'
            });
        }

        await run('DELETE FROM abos WHERE id = ? AND user_id = ?', [aboId, req.session.userId]);
        await syncUserDataFromLatestAbo(req.session.userId);

        return res.json({
            success: true,
            message: 'Abonnement erfolgreich gelöscht'
        });
    } catch (err) {
        return res.status(500).json({
            success: false,
            message: 'Datenbankfehler beim Löschen des Abonnements'
        });
    }
});

app.get('/api/admin/users', requireAdmin, async (req, res) => {
    try {
        const users = await all(
            `SELECT id, username, email, is_admin, created_at
             FROM users
             ORDER BY created_at DESC`
        );

        return res.json({
            success: true,
            users
        });
    } catch (err) {
        return res.status(500).json({
            success: false,
            message: 'Datenbankfehler'
        });
    }
});

app.post('/api/admin/users', requireAdmin, async (req, res) => {
    const {
        username: rawUsername,
        password: rawPassword,
        email: rawEmail,
        is_admin: rawIsAdmin
    } = req.body;

    const username = typeof rawUsername === 'string' ? rawUsername.trim() : '';
    const password = typeof rawPassword === 'string' ? rawPassword.trim() : '';
    const email = typeof rawEmail === 'string' ? rawEmail.trim() : '';
    const isAdmin = rawIsAdmin ? 1 : 0;

    if (!username || !password) {
        return res.status(400).json({
            success: false,
            message: 'Benutzername und Passwort sind erforderlich'
        });
    }

    if (username.length < 3) {
        return res.status(400).json({
            success: false,
            message: 'Benutzername muss mindestens 3 Zeichen lang sein'
        });
    }

    if (password.length < 4) {
        return res.status(400).json({
            success: false,
            message: 'Passwort muss mindestens 4 Zeichen lang sein'
        });
    }

    try {
        const existingUser = await get(
            'SELECT id FROM users WHERE username = ?',
            [username]
        );

        if (existingUser) {
            return res.status(409).json({
                success: false,
                message: 'Benutzername existiert bereits'
            });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const insertResult = await run(
            `INSERT INTO users (username, password, email, is_admin)
             VALUES (?, ?, ?, ?)`,
            [username, hashedPassword, email || null, isAdmin]
        );

        const newUser = await get(
            'SELECT id, username, email, is_admin, created_at FROM users WHERE id = ?',
            [insertResult.lastID]
        );

        return res.status(201).json({
            success: true,
            message: 'Benutzer erfolgreich erstellt',
            user: newUser
        });
    } catch (err) {
        return res.status(500).json({
            success: false,
            message: 'Datenbankfehler beim Erstellen des Benutzers'
        });
    }
});

app.post('/api/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).json({
                success: false,
                message: 'Logout fehlgeschlagen'
            });
        }

        return res.json({
            success: true,
            message: 'Erfolgreich abgemeldet'
        });
    });
});

function startServer() {
    app.listen(PORT, HOST, () => {
        console.log(`Server läuft auf http://${HOST}:${PORT}`);
        console.log('Testbenutzer: root / root');
    });
}

function shutdown() {
    db.close((err) => {
        if (err) {
            console.error('Fehler beim Schließen der Datenbank:', err.message);
        }

        console.log('Datenbankverbindung geschlossen.');
        process.exit(0);
    });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);