// src/routes/shop.product.routes.js
const express = require('express');
const router = express.Router();
const productController = require('../controllers/shop.product.controller');
const authMiddleware = require('../middleware/auth.middleware');

// Routes protégées (Token requis)
// CORRECTION ICI : On passe la fonction spécifique 'verifyToken' et non l'objet entier
router.use(authMiddleware.verifyToken);

// Créer un produit (POST /api/products)
router.post('/', productController.createProduct);

// Récupérer le catalogue d'une boutique (GET /api/products/shop/:shopId)
router.get('/shop/:shopId', productController.getShopProducts);

// Mettre à jour un produit (PUT /api/products/:id)
router.put('/:id', productController.updateProduct);

module.exports = router;