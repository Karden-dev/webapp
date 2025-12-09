// src/models/stock.movement.model.js
let dbConnection;

const init = (connection) => {
    dbConnection = connection;
};

// Enregistrer une VENTE (Sortie directe depuis l'app marchand)
const recordSale = async (shopId, productId, quantity, staffId) => {
    const connection = await dbConnection.getConnection();
    try {
        await connection.beginTransaction();

        // 1. Vérifier Stock dispo
        const [prodRows] = await connection.execute('SELECT quantity FROM shop_products WHERE id = ?', [productId]);
        const currentStock = prodRows[0].quantity;
        
        // On autorise le stock négatif ? Disons non pour l'instant pour être propre
        // if (currentStock < quantity) throw new Error("Stock insuffisant");

        // 2. Décrémenter Stock
        await connection.execute('UPDATE shop_products SET quantity = quantity - ? WHERE id = ?', [quantity, productId]);

        // 3. Journaliser
        const newStock = currentStock - quantity;
        const query = `
            INSERT INTO stock_movements 
            (shop_id, product_id, type, quantity, stock_before, stock_after, performed_by_staff_id, created_at)
            VALUES (?, ?, 'sale', ?, ?, ?, ?, NOW())
        `;
        // Note: quantity stockée en négatif pour une sortie ? Ou on utilise le type 'sale' pour savoir.
        // Convention comptable : Mieux vaut stocker -1 dans quantity si c'est une sortie.
        await connection.execute(query, [shopId, productId, -quantity, currentStock, newStock, staffId]);

        await connection.commit();
        return newStock;
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
};

const getHistoryByProduct = async (productId) => {
    const query = `
        SELECT m.*, u.name as admin_name, s.name as staff_name 
        FROM stock_movements m
        LEFT JOIN users u ON m.performed_by_user_id = u.id
        LEFT JOIN shop_staff s ON m.performed_by_staff_id = s.id
        WHERE m.product_id = ?
        ORDER BY m.created_at DESC
    `;
    const [rows] = await dbConnection.execute(query, [productId]);
    return rows;
};

module.exports = {
    init,
    recordSale,
    getHistoryByProduct
};