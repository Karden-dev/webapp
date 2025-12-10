// src/middleware/upload.middleware.js
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Fonction utilitaire pour s'assurer que le dossier de destination existe
const ensureDir = (dirPath) => {
    if (!fs.existsSync(dirPath)){
        fs.mkdirSync(dirPath, { recursive: true });
    }
};

// Configuration du stockage
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        let uploadPath = 'public/uploads/others'; // Dossier par défaut

        // Redirection intelligente selon le nom du champ dans le formulaire
        if (file.fieldname === 'proof_image') {
            uploadPath = 'public/uploads/proofs';
        } else if (file.fieldname === 'product_image') {
            uploadPath = 'public/uploads/products';
        }

        // Création du dossier si nécessaire
        ensureDir(uploadPath);
        
        cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
        // Génération d'un nom unique : TIMESTAMP-RANDOM.EXT
        // Ex: 1715698523-4859201.jpg
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

// Filtre pour n'accepter que les images
const fileFilter = (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
        cb(null, true);
    } else {
        cb(new Error('Format non supporté. Seules les images sont autorisées !'), false);
    }
};

// Initialisation de l'upload avec une limite de 5MB
const upload = multer({ 
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB max
    fileFilter: fileFilter
});

module.exports = upload;