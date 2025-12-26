// src/models/stock.report.model.js

let dbConnection;

// Initialisation de la connexion (Appelée par app.js)
const init = (connection) => {
    dbConnection = connection;
};

const getInventoryReportData = async (shopId) => {
    if (!dbConnection) throw new Error("Erreur: La base de données n'est pas initialisée dans stock.report.model");

    const query = `
        SELECT 
            p.id,
            p.reference,
            p.name,
            p.variant,
            -- Somme des entrées (Positif)
            COALESCE(SUM(CASE WHEN m.quantity > 0 THEN m.quantity ELSE 0 END), 0) as total_entries,
            -- Somme des sorties (Négatif)
            COALESCE(SUM(CASE WHEN m.quantity < 0 THEN m.quantity ELSE 0 END), 0) as total_exits
        FROM shop_products p
        LEFT JOIN stock_movements m ON p.id = m.product_id
        WHERE p.shop_id = ?
        GROUP BY p.id
        ORDER BY p.name ASC, p.variant ASC
    `;

    const [rows] = await dbConnection.execute(query, [shopId]);
    return rows;
};

module.exports = {
    init,
    getInventoryReportData
};