// src/routes/stock.movement.routes.js
const express = require('express');
const router = express.Router();
const movementController = require('../controllers/stock.movement.controller');
const authMiddleware = require('../middleware/auth.middleware');

router.use(authMiddleware.verifyToken);

// Enregistrer une vente
router.post('/sale', movementController.recordSale);

// Historique d'un produit spécifique
router.get('/product/:productId', movementController.getProductHistory);

// --- NOUVEAU : Journal Global de la Boutique ---
// URL: /api/stock/movements/shop/12?type=sale&start_date=2023-01-01
router.get('/shop/:shopId', movementController.getShopJournal);

module.exports = router;