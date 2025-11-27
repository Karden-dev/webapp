// src/app.js
require('dotenv').config();
const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const path = require('path');
const http = require('http');

// ============================================================
// 1. IMPORTS DES ROUTES
// ============================================================
// -- Modules Core --
const authRoutes = require('./routes/auth.routes');
const userRoutes = require('./routes/users.routes');
const shopRoutes = require('./routes/shops.routes');
// --- AJOUT POUR CORRIGER L'ERREUR 404 ---
const shopProductRoutes = require('./routes/shop.product.routes'); 

// -- Modules Opérationnels --
const orderRoutes = require('./routes/orders.routes');
const deliverymenRoutes = require('./routes/deliverymen.routes');
const riderRoutes = require('./routes/rider.routes.js');
const scheduleRoutes = require('./routes/schedule.routes');
const suivisRoutes = require('./routes/suivis.routes.js');
const returnsRoutes = require('./routes/returns.routes');

// -- Modules Finance & Reporting --
const cashRoutes = require('./routes/cash.routes');
const remittanceRoutes = require('./routes/remittances.routes');
const debtRoutes = require('./routes/debt.routes');
const reportsRoutes = require('./routes/reports.routes');
const dashboardRoutes = require('./routes/dashboard.routes');
const performanceRoutes = require('./routes/performance.routes');

// -- Modules IA & Communication --
const whatsappRoutes = require('./routes/whatsapp.routes');

// ============================================================
// 2. IMPORTS DES MODÈLES (DATA LAYER)
// ============================================================
const userModel = require('./models/user.model');
const shopModel = require('./models/shop.model');
const shopProspectModel = require('./models/shop.prospect.model'); // Nouveau modèle B2B
const orderModel = require('./models/order.model');
const riderModel = require('./models/rider.model');
const deliverymenModel = require('./controllers/deliverymen.controller'); // Note: Vérifier si c'est un modèle ou contrôleur, gardé tel quel par sécurité
const messageModel = require('./models/message.model.js');
// Initialisation du modèle produit (souvent fait implicitement via le contrôleur, mais bonne pratique)
const shopProductModel = require('./models/shop.product.model'); 

// -- Modèles Finance --
const cashModel = require('./models/cash.model');
const cashStatModel = require('./models/cash.stat.model');
const remittanceModel = require('./models/remittance.model');
const debtModel = require('./models/debt.model');
const ridersCashModel = require('./models/riderscash.model');

// -- Modèles Analytics --
const reportModel = require('./models/report.model');
const dashboardModel = require('./models/dashboard.model');
const performanceModel = require('./models/performance.model');
const scheduleModel = require('./models/schedule.model');

// -- Modèles Stock (si présents) --
const stockMovementModel = require('./models/stock.movement.model');
const stockRequestModel = require('./models/stock.request.model');

// ============================================================
// 3. IMPORTS DES SERVICES & SCRIPTS
// ============================================================
// -- Services Métier --
const cashService = require('./services/cash.service.js');
const cashClosingService = require('./services/cash.closing.service');
const remittanceService = require('./services/remittances.service.js');
const debtService = require('./services/debt.service.js');
const balanceService = require('./services/balance.service.js');

// -- Services Infrastructure --
const webSocketService = require('./services/websocket.service.js');
const firebaseService = require('./services/firebase.service.js');

// -- Services IA & Watchers --
const WhatsAppService = require('./services/whatsapp.service');
const AIService = require('./services/ai.service');
const AIWatcher = require('./scripts/aiAgentWatcher');
const archiveService = require('./scripts/archiveConversations');

// ============================================================
// 4. CONFIGURATION DE L'APPLICATION EXPRESS
// ============================================================
const app = express();
const port = process.env.PORT || 3000;

app.use(cors());

// --- Configuration Spécifique Webhook WhatsApp ---
// Capture le corps brut (rawBody) pour la vérification de signature
// Doit impérativement être placé AVANT les parseurs globaux
app.use('/api/whatsapp/webhook', express.raw({
    type: '*/*',
    limit: '5mb',
    verify: (req, res, buf) => {
        req.rawBody = buf;
        console.log("[Webhook Middleware] Raw body capturé.");
    }
}));

// --- Parseurs Globaux ---
app.use(express.json({ limit: '50mb' })); // Augmenté pour les images Base64
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// --- Fichiers Statiques ---
app.use(express.static(path.join(__dirname, '..', 'public')));

// ============================================================
// 5. CONFIGURATION BASE DE DONNÉES
// ============================================================
const dbConfig = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
};

let dbPool;

async function connectToDatabase() {
    try {
        dbPool = mysql.createPool(dbConfig);
        console.log('✅ Pool de connexions BDD créé.');
        const connection = await dbPool.getConnection();
        console.log('✅ Connexion BDD testée avec succès.');
        connection.release();
    } catch (error) {
        console.error('❌ Erreur critique de connexion BDD :', error);
        process.exit(1);
    }
}

// ============================================================
// 6. INITIALISATION & DÉMARRAGE SERVEUR
// ============================================================
async function startServer() {
    // 1. Connexion BDD
    await connectToDatabase();

    // 2. Initialisation des Modèles (Injection de dépendance)
    console.log('🔄 Initialisation des Modèles...');
    userModel.init(dbPool);
    shopModel.init(dbPool);
    shopProspectModel.init(dbPool);
    riderModel.init(dbPool);
    messageModel.init(dbPool);
    orderModel.init(dbPool, messageModel); // Dépendance croisée
    
    // Initialisation modèle produit
    shopProductModel.init(dbPool);
    
    // -- Modèles Finance & Stats --
    cashModel.init(dbPool);
    cashStatModel.init(dbPool);
    remittanceModel.init(dbPool);
    debtModel.init(dbPool);
    ridersCashModel.init(dbPool);
    dashboardModel.init(dbPool);
    reportModel.init(dbPool);
    performanceModel.init(dbPool);
    scheduleModel.init(dbPool);
    
    // -- Modèles Stock --
    if (stockMovementModel && stockMovementModel.init) stockMovementModel.init(dbPool);
    if (stockRequestModel && stockRequestModel.init) stockRequestModel.init(dbPool);

    // 3. Initialisation des Services
    console.log('🔄 Initialisation des Services...');
    cashService.init(dbPool);
    cashClosingService.init(dbPool);
    remittanceService.init(dbPool);
    debtService.init(dbPool);
    balanceService.init(dbPool);
    firebaseService.initialize();
    
    // -- Services IA --
    WhatsAppService.init(dbPool);
    AIService.init(dbPool);
    AIWatcher.init(dbPool);
    archiveService.init(dbPool);

    // 4. Enregistrement des Routes
    console.log('🔄 Enregistrement des Routes...');
    // -- Auth & Users --
    app.use('/api', authRoutes);
    app.use('/api/users', userRoutes);
    
    // -- Opérations --
    app.use('/api/shops', shopRoutes);
    
    // --- AJOUT POUR CORRIGER L'ERREUR 404 ---
    app.use('/api/products', shopProductRoutes); 
    
    app.use('/api/orders', orderRoutes);
    app.use('/api/deliverymen', deliverymenRoutes);
    app.use('/api/rider', riderRoutes);
    app.use('/api/schedule', scheduleRoutes);
    app.use('/api', suivisRoutes);
    app.use('/api/returns', returnsRoutes);

    // -- Finance --
    app.use('/api/cash', cashRoutes);
    app.use('/api/remittances', remittanceRoutes);
    app.use('/api/debts', debtRoutes);

    // -- Reporting --
    app.use('/api/reports', reportsRoutes);
    app.use('/api/dashboard', dashboardRoutes);
    app.use('/api/performance', performanceRoutes);

    // -- IA & Webhooks --
    app.use('/api/whatsapp', whatsappRoutes);

    // 5. Démarrage Serveur HTTP + WebSocket
    const server = http.createServer(app);
    webSocketService.initWebSocketServer(server);

    server.listen(port, () => {
        console.log(`🚀 SERVEUR WINK EXPRESS DÉMARRÉ sur le port ${port}`);
    });
}

// Lancement
startServer();
