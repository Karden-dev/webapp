// src/scripts/campagneRelanceSpeciale.js
require('dotenv').config(); // Charge les variables d'environnement (.env)
const mysql = require('mysql2/promise');
const WhatsAppService = require('../services/whatsapp.service');

// Configuration DB (nécessaire car le service WhatsApp loggue en base)
const dbConfig = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
};

// --- DONNÉES NETTOYÉES ---
const prospects = [
    { name: "Jeanne Ngo lemdjou", phone: "656777515", article: "Spray pour la croissance des cheveux pour hommes et femmes", prix: "15,000 FCFA" },
    { name: "Divine Chenwi", phone: "678256764", article: "Gel Wave Cheveux", prix: "15 000 CFA" },
    { name: "Bachir assana mahamat", phone: "237694600035", article: "Stylo Blanchissant pour les Dents", prix: "15,000 FCFA" },
    { name: "Saffe hermann", phone: "695570020", article: "Gel Wave Cheveux", prix: "15 000 CFA" },
    { name: "Florence nana", phone: "676762876", article: "Stylo blanchissant pour les dents", prix: "15,000 CFA" },
    { name: "Wilfried Walker", phone: "+237675346835", article: "Gel Wave Cheveux Professionnel", prix: "15 000 FCFA" },
    { name: "Jean Nathan tomdieu", phone: "677661755", article: "Aspirateur Auriculaire Hygiénique", prix: "15 000 CFA" },
    { name: "Tchamako Herman", phone: "659847279", article: "Gel Wave Cheveux Professionnel", prix: "15 000 FCFA" },
    { name: "Alphonse Alphonse", phone: "699969915", article: "Lance-pierre avec laser - Precision", prix: "15 000 FCFA" },
    { name: "Adeline Ndoumbe", phone: "656235314", article: "Sérum Anti-Imperfections", prix: "15,000 CFA" },
    { name: "Remos Efang", phone: "650829699", article: "Lance-pierre avec laser - Precision", prix: "15 000 FCFA" },
    { name: "Arsène Nicaise Ayong", phone: "695475914", article: "Lance-pierre avec laser - Precision", prix: "15 000 FCFA" },
    { name: "Gervais", phone: "699221055", article: "Aspirateur Auriculaire Hygiénique", prix: "15 000 CFA" },
    { name: "Levit Skinner", phone: "670654866", article: "Lance-pierre avec laser - Precision", prix: "15 000 FCFA" },
    { name: "Beltus Nkeng", phone: "678149772", article: "Gel Wave Cheveux", prix: "15 000 CFA" },
    { name: "Mvondo", phone: "698081629", article: "Gel Wave Cheveux", prix: "15 000 CFA" },
    { name: "EDINGUÈLÈ SALOMON", phone: "650497940", article: "Gel Wave Cheveux", prix: "15 000 CFA" },
    { name: "Christèle", phone: "690914612", article: "Sérum Anti-Imperfections", prix: "15,000 CFA" },
    { name: "Habou garba", phone: "691000614", article: "Pompe de Transfert de Forage", prix: "15 000 FCFA" },
    { name: "Guoho Sandio jules berlain", phone: "693880533", article: "Lance-pierre avec laser", prix: "15 000 FCFA" }, // Note: J'ai pris le premier numéro
    { name: "ABDOUL KARIMOU NANA", phone: "+237694956337", article: "Aspirateur Auriculaire - Nettoyage Sécurisé", prix: "15 000 FCFA" },
    { name: "Kassa Alberto léon", phone: "673135119", article: "Lance-pierre avec laser", prix: "15 000 FCFA" },
    { name: "Mbutah Magellan", phone: "671724719", article: "Gel Wave Cheveux", prix: "15 000 CFA" },
    { name: "Saidou amadou", phone: "673529557", article: "Lunette pliables Anti-Lumière Bleue", prix: "15 000 FCFA" },
    { name: "Faustin Tienga", phone: "+237671517051", article: "Lunette pliables Anti-Lumière Bleue", prix: "15 000 FCFA" },
    { name: "Beunang", phone: "650048855", article: "Lance-pierre avec laser - Precision", prix: "15 000 FCFA" },
    { name: "Wafo tappa Claude Alexis", phone: "691107544", article: "Lance-pierre avec laser - Precision", prix: "15 000 FCFA" },
    { name: "Emmanuel Tobika", phone: "+237691751657", article: "Lance-pierre avec laser - Precision", prix: "15 000 FCFA" },
    { name: "Gaiwe bello", phone: "699787682", article: "Lance-pierre avec laser - Precision", prix: "15 000 FCFA" },
    { name: "Dieunedort wouotchouang", phone: "656934590", article: "Pompe de Transfert de Forage", prix: "15 000 FCFA" },
    { name: "Djatta Siewe Philippe", phone: "670484198", article: "Pompe de Transfert de Forage", prix: "15 000 FCFA" },
    { name: "Nabil Ismaël", phone: "+237699202172", article: "Lance-pierre avec laser - Precision", prix: "15 000 FCFA" },
    { name: "Mbah John", phone: "679728997", article: "Lance-pierre avec laser - Precision", prix: "15 000 FCFA" },
    { name: "zanga aristide aristide zanga", phone: "237692726142", article: "Stylo Blanchissant pour les Dents", prix: "15,000 FCFA" },
    { name: "Dorance kenang", phone: "695005161", article: "Sérum Anti-Imperfections", prix: "15,000 CFA" },
    { name: "STEPHANOV", phone: "671107873", article: "Aspirateur Auriculaire - Nettoyage Sécurisé", prix: "15 000 FCFA" },
    { name: "Louis kaptio", phone: "699925322", article: "Aspirateur Auriculaire - Nettoyage Sécurisé", prix: "15 000 FCFA" },
    { name: "Aye olinga Gaston", phone: "695133675", article: "Stylo Blanchissant pour les Dents", prix: "15,000 FCFA" },
    { name: "Bebbey", phone: "67020094", article: "Stylo Blanchissant pour les Dents", prix: "15,000 FCFA" }, // Attention: Numéro court, à vérifier
    { name: "Evra Maga", phone: "+237658949999", article: "Sérum Anti-Imperfections", prix: "15,000 CFA" },
    { name: "Joseph Steve", phone: "651155120", article: "Aspirateur Auriculaire - Nettoyage Sécurisé", prix: "15 000 FCFA" },
    { name: "Manga Zanga", phone: "672727633", article: "Stylo Blanchissant pour les Dents", prix: "15,000 FCFA" },
    { name: "Chrisphore Zarathoustra", phone: "+237693486716", article: "Gel Wave Cheveux", prix: "15 000 CFA" },
    { name: "VOULA ASSAKO Serge Gautier", phone: "696565444", article: "Gel Wave Cheveux", prix: "15 000 CFA" },
    { name: "Melle", phone: "687090915", article: "Sérum Anti-Imperfections", prix: "15,000 CFA" },
    { name: "Etoundi", phone: "698050034", article: "Lunette pliables Anti-Lumière Bleue", prix: "15 000 FCFA" },
    { name: "Robert Nyosse", phone: "699879024", article: "Aspirateur Auriculaire - Nettoyage Sécurisé", prix: "15 000 FCFA" },
    { name: "Souleymanou", phone: "672201901", article: "Phare LED Moto Haute Performance (3 Lentilles)", prix: "15 000 FCFA" },
    { name: "Hermann", phone: "672483152", article: "Gel Wave Cheveux Professionnel", prix: "15 000 FCFA" },
    { name: "Prince Doh 1", phone: "672311979", article: "Lance-pierre avec laser - Precision", prix: "15 000 FCFA" },
    { name: "Enonga guy", phone: "695462359", article: "Lance-pierre avec laser - Precision", prix: "15 000 FCFA" },
    { name: "Mustapha Billyblack", phone: "676615335", article: "Phare LED Moto Haute Performance (3 Lentilles)", prix: "15 000 FCFA" },
    { name: "Nana", phone: "652346769", article: "Gel Wave Cheveux Professionnel", prix: "15 000 FCFA" },
    { name: "Iya Daouda", phone: "655044757", article: "Aspirateur Auriculaire Hygiénique", prix: "15 000 CFA" },
    { name: "Farouk", phone: "699989475", article: "Phare LED Moto Haute Performance (3 Lentilles)", prix: "15 000 FCFA" },
    { name: "Elvis fopa", phone: "696676744", article: "Gel Wave Cheveux Professionnel", prix: "15 000 FCFA" },
    { name: "Collins", phone: "677866622", article: "Phare LED Moto Haute Performance (3 Lentilles)", prix: "15 000 FCFA" },
    { name: "SAMA NGWAAH BENJAMIN FORKWA", phone: "677895844", article: "Pompe de Transfert de Forage", prix: "15 000 FCFA" },
    { name: "Elvis Ajeh", phone: "677848670", article: "Pompe de Transfert de Forage", prix: "15 000 FCFA" },
    { name: "Donal", phone: "698109988", article: "Stylo blanchissant pour les dents", prix: "15,000 CFA" },
    { name: "Ymele kemaka anicet", phone: "675383189", article: "Pompe de Transfert de Forage", prix: "15 000 FCFA" },
    { name: "Libam", phone: "659882512", article: "Lance-pierre avec laser - Precision", prix: "15 000 FCFA" },
    { name: "Jacques Teuma", phone: "679708008", article: "Lance-pierre avec laser - Precision", prix: "15 000 FCFA" },
    { name: "Marie Djuissie", phone: "695396916", article: "Sérum Anti-Imperfections", prix: "15,000 CFA" },
    { name: "Tama", phone: "670933793", article: "Lance-pierre avec laser - Precision", prix: "15 000 FCFA" },
    { name: "Cyrille", phone: "694537739", article: "Gel Wave Cheveux Professionnel", prix: "15 000 FCFA" }
];

// Helper pour une pause
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function runCampaign() {
    let connection;
    try {
        console.log('🔌 Connexion à la base de données...');
        connection = await mysql.createConnection(dbConfig);
        
        // Initialiser le service WhatsApp avec la connexion DB
        WhatsAppService.init(connection);
        
        console.log(`🚀 Démarrage de la campagne pour ${prospects.length} prospects...`);

        for (let i = 0; i < prospects.length; i++) {
            const p = prospects[i];
            
            // Construction du message personnalisé
            // Note : J'ai supprimé le mot "montant" en doublon dans votre template original
            const message = `Bonjour ${p.name} !

J'espère que vous allez bien.

Depuis j'essaye de vous joindre suite à votre commande d'un *${p.article}* d'un montant de *${p.prix}*.

J'aimerais savoir si c'est possible de vous livrer aujourd'hui ?`;

            console.log(`📨 [${i + 1}/${prospects.length}] Envoi à ${p.name} (${p.phone})...`);
            
            try {
                // Envoi via le service existant (gère le formatage du numéro et le log en DB)
                // On utilise un 'model' fictif 'campaign-script' pour tracer l'usage dans la table history
                await WhatsAppService.sendText(p.phone, message, 'campaign-script');
                console.log(`✅ Message envoyé.`);
            } catch (err) {
                console.error(`❌ Échec pour ${p.name}: ${err.message}`);
            }

            // Pause de 5 secondes entre chaque message pour sécurité
            if (i < prospects.length - 1) {
                await sleep(5000); 
            }
        }

        console.log('🏁 Campagne terminée.');

    } catch (error) {
        console.error('❌ Erreur critique :', error);
    } finally {
        if (connection) {
            await connection.end();
            console.log('🔌 Connexion DB fermée.');
        }
    }
}

runCampaign();