// src/controllers/shop.staff.controller.js
const staffModel = require('../models/shop.staff.model');

const createStaff = async (req, res) => {
    try {
        const { shop_id, name, pin, role } = req.body;
        
        if (!shop_id || !name || !pin) {
            return res.status(400).json({ message: "Champs obligatoires manquants." });
        }

        const staffId = await staffModel.create(req.body);
        res.status(201).json({ message: "Employé créé avec succès.", id: staffId });
    } catch (error) {
        console.error("Erreur createStaff:", error);
        res.status(500).json({ message: "Erreur création employé." });
    }
};

const getShopStaff = async (req, res) => {
    try {
        const { shopId } = req.params;
        const staffList = await staffModel.findByShop(shopId);
        res.json(staffList);
    } catch (error) {
        console.error("Erreur getShopStaff:", error);
        res.status(500).json({ message: "Erreur récupération employés." });
    }
};

module.exports = {
    createStaff,
    getShopStaff
};