// src/routes/shops.routes.js
const express = require('express');
const router = express.Router();
const shopController = require('../controllers/shops.controller'); 
const authMiddleware = require('../middleware/auth.middleware');

// ============================================================
// ROUTES PUBLIQUES (LECTURE & LOGIN)
// ============================================================
// Ces routes sont accessibles sans token (ou le token est géré dans le contrôleur si besoin)
// Cela permet d'éviter les erreurs 403 lors du chargement des listes déroulantes

// Login spécifique App Mobile Marchand
router.post('/login', shopController.merchantLogin);

// Récupérer les boutiques (avec filtres : search, status)
router.get('/', shopController.findAll);

// Récupérer les statistiques globales
router.get('/stats', shopController.getStats);

// Récupérer une boutique par ID
router.get('/:id', shopController.findOne);


// ============================================================
// ROUTES PROTÉGÉES (ACTIONS D'ÉCRITURE)
// ============================================================
// Le middleware vérifie le token Admin pour toutes les routes ci-dessous

router.use(authMiddleware.verifyToken);

// Mise à jour du code PIN (Fonctionnalité ajoutée)
router.put('/:shopId/pin', shopController.updateShopPin);

// Créer une nouvelle boutique
router.post('/', shopController.create);

// Mettre à jour une boutique (Infos générales)
router.put('/:id', shopController.update);

// Changer le statut (Actif/Inactif)
router.put('/:id/status', shopController.updateStatus);

module.exports = router;