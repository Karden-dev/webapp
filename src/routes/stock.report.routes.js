// src/routes/stock.report.routes.js
const express = require('express');
const router = express.Router();
const reportController = require('../controllers/stock.report.controller');
const authMiddleware = require('../middleware/auth.middleware');

// Sécurisation : Seuls les utilisateurs connectés peuvent accéder aux rapports
router.use(authMiddleware.verifyToken);

// --- ROUTES ---

// Récupérer l'état de stock complet (Bilan des flux)
// URL: GET /api/stock/reports/inventory/:shopId
router.get('/inventory/:shopId', reportController.getInventoryReport);

module.exports = router;