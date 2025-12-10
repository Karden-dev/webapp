// src/models/shop.product.model.js
const moment = require('moment');

let dbConnection;

const init = (connection) => {
    dbConnection = connection;
};

// --- LOGIQUE SKU INTELLIGENTE ---
// Génère une référence parent-enfant (Ex: KARD-121223-001-RED)
const generateSmartReference = async (shopId, shopName, productName, variantName) => {
    // 1. Nettoyage du nom de boutique (Trigramme)
    let cleanShopName = "UNK";
    if (shopName && typeof shopName === 'string') {
        cleanShopName = shopName.replace(/[^a-zA-Z0-9]/g, '').substring(0, 3).toUpperCase();
    }
    
    // 2. Chercher si un produit avec le MEME NOM existe déjà pour cette boutique (le Parent)
    // On ignore la casse et les espaces superflus
    const parentQuery = `SELECT reference FROM shop_products WHERE shop_id = ? AND TRIM(UPPER(name)) = TRIM(UPPER(?)) LIMIT 1`;
    const [existing] = await dbConnection.execute(parentQuery, [shopId, productName]);

    let baseRef;

    if (existing.length > 0) {
        // CAS A : Le parent existe déjà. On récupère sa base.
        // On suppose que la référence est structurée (SHOP-DATE-SEQ-VAR)
        const fullRef = existing[0].reference;
        const parts = fullRef.split('-');
        
        // On reconstruit la base (SHOP-DATE-SEQ)
        // Si l'ancienne ref a au moins 3 parties, on garde les 3 premières
        if (parts.length >= 3) {
            baseRef = `${parts[0]}-${parts[1]}-${parts[2]}`;
        } else {
            // Fallback si l'ancienne ref était mal formée, on la garde telle quelle comme base
            baseRef = fullRef;
        }
    } else {
        // CAS B : C'est un tout nouveau produit. On génère une nouvelle séquence.
        const dateStr = moment().format('DDMMYY');
        const prefix = `${cleanShopName}-${dateStr}-`;
        
        // Trouver la dernière séquence du jour pour ce shop et ce préfixe
        const seqQuery = `SELECT reference FROM shop_products WHERE reference LIKE ? ORDER BY id DESC LIMIT 1`;
        const [rows] = await dbConnection.execute(seqQuery, [`${prefix}%`]);
        
        let sequence = 1;
        if (rows.length > 0) {
            const lastRef = rows[0].reference;
            const parts = lastRef.split('-');
            // Vérif format SHOP-DATE-SEQ...
            if (parts.length >= 3 && !isNaN(parts[2])) {
                sequence = parseInt(parts[2]) + 1;
            }
        }
        baseRef = `${prefix}${sequence.toString().padStart(3, '0')}`;
    }

    // 3. Ajouter le code variante (ex: ROUGE -> RGE)
    let variantCode = "STD"; // Standard par défaut
    if (variantName && variantName.trim().length > 0) {
        // On prend les 3 premières lettres alphanumériques en majuscule
        const cleanVar = variantName.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
        if (cleanVar.length > 0) {
            variantCode = cleanVar.substring(0, 3);
        }
    }

    return `${baseRef}-${variantCode}`;
};

const create = async (data) => {
    const { shop_id, shop_name, name, variant, alert_threshold, cost_price, selling_price, image_url } = data;
    
    // Validation basique
    const safeAlert = parseInt(alert_threshold) || 5;
    const safeCost = parseFloat(cost_price) || 0;
    const safeSelling = parseFloat(selling_price) || 0;
    // Si pas d'image, on met NULL
    const safeImage = (image_url && image_url.length > 0) ? image_url : null;

    // Génération de la référence intelligente
    const reference = await generateSmartReference(shop_id, shop_name, name, variant);
    
    const query = `
        INSERT INTO shop_products 
        (shop_id, reference, name, variant, quantity, alert_threshold, cost_price, selling_price, image_url, created_at)
        VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?, NOW())
    `;
    
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
    
    // On retourne l'ID et la REF générée (utile pour l'affichage immédiat)
    return { id: result.insertId, reference: reference };
};

const findByShop = async (shopId) => {
    const query = `SELECT * FROM shop_products WHERE shop_id = ? AND is_active = 1 ORDER BY name ASC`;
    const [rows] = await dbConnection.execute(query, [shopId]);
    return rows;
};

const update = async (id, data) => {
    const { name, variant, alert_threshold, cost_price, selling_price, image_url } = data;

    const safeAlert = parseInt(alert_threshold) || 5;
    const safeCost = parseFloat(cost_price) || 0;
    const safeSelling = parseFloat(selling_price) || 0;
    
    // Pour l'image : si undefined (pas envoyée), on ne touche pas à la colonne.
    // Si null ou string, on met à jour.
    let imageClause = "";
    let params = [name, variant, safeAlert, safeCost, safeSelling];

    if (image_url !== undefined) {
        imageClause = ", image_url = ?";
        params.push(image_url);
    }

    params.push(id);

    const query = `
        UPDATE shop_products 
        SET name = ?, variant = ?, alert_threshold = ?, cost_price = ?, selling_price = ? ${imageClause}
        WHERE id = ?
    `;
    const [result] = await dbConnection.execute(query, params);
    return result;
};

// Mise à jour rapide de la quantité (utilisé par les mouvements de stock)
const updateQuantity = async (id, quantityChange, connection) => {
    // Si une connexion transactionnelle est fournie, on l'utilise, sinon celle par défaut
    const conn = connection || dbConnection;
    const query = `UPDATE shop_products SET quantity = quantity + ? WHERE id = ?`;
    await conn.execute(query, [quantityChange, id]);
};

module.exports = {
    init,
    create,
    findByShop,
    update,
    updateQuantity
};