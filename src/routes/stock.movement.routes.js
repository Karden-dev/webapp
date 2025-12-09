// src/routes/stock.movement.routes.js
const express = require('express');
const router = express.Router();
const movementController = require('../controllers/stock.movement.controller');
const authMiddleware = require('../middleware/auth.middleware');

// CORRECTION ICI : On utilise .verifyToken
router.use(authMiddleware.verifyToken);

// Enregistrer une vente rapide (POST /api/stock/movements/sale)
router.post('/sale', movementController.recordSale);

// Voir l'historique d'un produit (GET /api/stock/movements/product/:productId)
router.get('/product/:productId', movementController.getProductHistory);

module.exports = router;