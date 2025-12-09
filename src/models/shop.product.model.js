// src/models/shop.product.model.js
const moment = require('moment');

let dbConnection;

const init = (connection) => {
    dbConnection = connection;
};

// Utilitaire : Génère une référence unique (EX: SHOP-DATE-SEQ)
const generateReference = async (shopId, shopName) => {
    // CORRECTION : Sécurisation du nom de la boutique pour éviter le crash
    let safeName = "UNK"; // Par défaut "UNK" (Unknown) si pas de nom
    if (shopName && typeof shopName === 'string' && shopName.trim().length > 0) {
        safeName = shopName.trim();
    }

    // On prend les 3 premières lettres en majuscule
    const trigram = safeName.substring(0, 3).toUpperCase();
    const dateStr = moment().format('DDMMYY');
    
    // On cherche le dernier produit créé aujourd'hui avec ce préfixe
    const query = `SELECT reference FROM shop_products WHERE reference LIKE ? ORDER BY id DESC LIMIT 1`;
    // Note: Le caractère % est le wildcard SQL pour "tout ce qui suit"
    const [rows] = await dbConnection.execute(query, [`${trigram}-${dateStr}-%`]);
    
    let sequence = 1;
    if (rows.length > 0) {
        const lastRef = rows[0].reference;
        const parts = lastRef.split('-');
        // On s'assure que le format est bien TRIGRAM-DATE-SEQ avant de parser
        if (parts.length === 3 && !isNaN(parts[2])) {
            sequence = parseInt(parts[2]) + 1;
        }
    }
    
    // Format 001, 002, etc.
    const seqStr = sequence.toString().padStart(3, '0');
    return `${trigram}-${dateStr}-${seqStr}`;
};

const create = async (data) => {
    const { shop_id, shop_name, name, variant, alert_threshold, cost_price, selling_price, image_url } = data;
    
    // CORRECTION : Validation et nettoyage des données avant insertion
    // 1. Prix et Seuil : On s'assure que ce sont des nombres, sinon 0 ou défaut
    const safeAlert = parseInt(alert_threshold) || 5;
    const safeCost = parseFloat(cost_price) || 0;
    const safeSelling = parseFloat(selling_price) || 0;
    
    // 2. Image : Si chaîne vide ou undefined, on force NULL pour la base de données
    const safeImage = (image_url && image_url.length > 0) ? image_url : null;

    // 3. Génération de la référence (Sécurisée)
    const reference = await generateReference(shop_id, shop_name);
    
    // 4. Insertion
    const query = `
        INSERT INTO shop_products 
        (shop_id, reference, name, variant, quantity, alert_threshold, cost_price, selling_price, image_url, created_at)
        VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?, NOW())
    `;
    // Note: Stock initial forcé à 0.
    
    const [result] = await dbConnection.execute(query, [
        shop_id, 
        reference, 
        name, 
        variant, 
        safeAlert, 
        safeCost, 
        safeSelling, 
        safeImage
    ]);
    return result.insertId;
};

const findByShop = async (shopId) => {
    const query = `SELECT * FROM shop_products WHERE shop_id = ? AND is_active = 1 ORDER BY name ASC`;
    const [rows] = await dbConnection.execute(query, [shopId]);
    return rows;
};

const update = async (id, data) => {
    const { name, variant, alert_threshold, cost_price, selling_price, image_url } = data;

    // Nettoyage des données pour l'update aussi
    const safeAlert = parseInt(alert_threshold) || 5;
    const safeCost = parseFloat(cost_price) || 0;
    const safeSelling = parseFloat(selling_price) || 0;
    // Pour l'image, si elle n'est pas fournie dans l'update (undefined), on ne la change pas (logique gérée par le SQL dynamique ou le contrôleur).
    // Ici la requête écrase tout, donc il faut s'assurer d'envoyer l'ancienne image si pas de nouvelle.
    // On suppose que le contrôleur gère ça ou que 'image_url' contient la bonne valeur (nouvelle ou ancienne).
    const safeImage = (image_url && image_url.length > 0) ? image_url : null;

    const query = `
        UPDATE shop_products 
        SET name = ?, variant = ?, alert_threshold = ?, cost_price = ?, selling_price = ?, image_url = ? 
        WHERE id = ?
    `;
    const [result] = await dbConnection.execute(query, [
        name, 
        variant, 
        safeAlert, 
        safeCost, 
        safeSelling, 
        safeImage, 
        id
    ]);
    return result;
};

// Fonction interne pour mettre à jour la quantité (appelée par StockRequest ou StockMovement)
const updateQuantity = async (id, quantityChange, connection) => {
    // quantityChange peut être positif (entrée) ou négatif (sortie)
    const query = `UPDATE shop_products SET quantity = quantity + ? WHERE id = ?`;
    await connection.execute(query, [quantityChange, id]);
};

module.exports = {
    init,
    create,
    findByShop,
    update,
    updateQuantity
};