// src/routes/shop.staff.routes.js
const express = require('express');
const router = express.Router();
const staffController = require('../controllers/shop.staff.controller');
const authMiddleware = require('../middleware/auth.middleware');

router.use(authMiddleware);

// Créer un employé (POST /api/staff)
router.post('/', staffController.createStaff);

// Lister les employés d'une boutique (GET /api/staff/shop/:shopId)
router.get('/shop/:shopId', staffController.getShopStaff);

module.exports = router;