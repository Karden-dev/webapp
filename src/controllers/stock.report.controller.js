// src/controllers/stock.report.controller.js
const stockReportModel = require('../models/stock.report.model');

// Génère le Bilan des Flux
const getInventoryReport = async (req, res) => {
    try {
        const { shopId } = req.params;

        if (!shopId) {
            return res.status(400).json({ message: "ID boutique manquant." });
        }

        // Appel au modèle (qui a la connexion DB)
        const rows = await stockReportModel.getInventoryReportData(shopId);

        // Formatage des données
        const reportData = rows.map(row => {
            const entries = parseInt(row.total_entries);
            const exits = Math.abs(parseInt(row.total_exits));
            
            // Stock Final = Entrées - Sorties (car Stock Initial = 0 ici)
            const finalStock = entries - exits;

            return {
                reference: row.reference || '-',
                name: row.name,
                variant: row.variant || '',
                initial_stock: 0,
                entries: entries,
                exits: exits,
                final_stock: finalStock
            };
        });

        res.json(reportData);

    } catch (error) {
        console.error("Erreur getInventoryReport:", error);
        res.status(500).json({ message: "Erreur serveur lors du rapport." });
    }
};

module.exports = {
    getInventoryReport
};