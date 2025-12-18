// src/models/stock.movement.model.js

let dbConnection;

const init = (connection) => {
    dbConnection = connection;
};

const create = async (data) => {
    if (!dbConnection) throw new Error("DB non initialisée");

    const { 
        shop_id, product_id, type, quantity, 
        stock_before, stock_after, 
        related_request_id, related_order_id, 
        performed_by_user_id, performed_by_staff_id, 
        comment 
    } = data;

    const query = `
        INSERT INTO stock_movements 
        (shop_id, product_id, type, quantity, stock_before, stock_after, related_request_id, related_order_id, performed_by_user_id, performed_by_staff_id, comment, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
    `;

    const [result] = await dbConnection.execute(query, [
        shop_id, product_id, type, quantity, 
        stock_before || 0, stock_after || 0, 
        related_request_id || null, related_order_id || null, 
        performed_by_user_id || null, performed_by_staff_id || null,
        comment || null
    ]);
    
    return result.insertId;
};

const getHistoryByProduct = async (productId) => {
    if (!dbConnection) throw new Error("DB non initialisée");
    const query = `SELECT * FROM stock_movements WHERE product_id = ? ORDER BY created_at DESC LIMIT 50`;
    const [rows] = await dbConnection.execute(query, [productId]);
    return rows;
};

// --- NOUVEAU : JOURNAL GLOBAL AVEC FILTRES ---
const findByShop = async (shopId, filters = {}) => {
    if (!dbConnection) throw new Error("DB non initialisée");

    let query = `
        SELECT 
            m.*, 
            p.name as product_name, 
            p.variant as variant_name, 
            p.reference as product_ref,
            p.image_url as product_image
        FROM stock_movements m
        JOIN shop_products p ON m.product_id = p.id
        WHERE m.shop_id = ?
    `;
    
    const params = [shopId];

    // Filtre par Date
    if (filters.startDate) {
        query += ` AND m.created_at >= ?`;
        params.push(filters.startDate);
    }
    if (filters.endDate) {
        query += ` AND m.created_at <= ?`;
        params.push(filters.endDate); // Pensez à ajouter 23:59:59 côté front/controller
    }

    // Filtre par Type (Entrée, Vente, Perte...)
    if (filters.type && filters.type !== 'all') {
        query += ` AND m.type = ?`;
        params.push(filters.type);
    }

    // Filtre par Produit (Recherche textuelle)
    if (filters.search) {
        query += ` AND (p.name LIKE ? OR p.reference LIKE ?)`;
        params.push(`%${filters.search}%`, `%${filters.search}%`);
    }

    query += ` ORDER BY m.created_at DESC LIMIT 100`; // Limite par sécurité

    const [rows] = await dbConnection.execute(query, params);
    return rows;
};

module.exports = {
    init,
    create,
    getHistoryByProduct,
    findByShop
};