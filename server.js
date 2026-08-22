require("dotenv").config();
const express = require("express");
const axios = require("axios");
const faq = require("./data/faq.json");
const tracking = require("./data/tracking.json");
const vehicles = require("./data/vehicles.json");

const app = express();
app.use(express.json());

const {
  WHATSAPP_TOKEN,
  WHATSAPP_PHONE_NUMBER_ID,
  WHATSAPP_VERIFY_TOKEN,
  PORT = 3000,
} = process.env;

// Sessions en mémoire : garde l'état de la conversation par numéro client.
// ⚠️ En production, remplace ça par une vraie base (Redis, Postgres...) —
// sinon tout se réinitialise à chaque redémarrage du serveur.
const sessions = {};

// ---------------------------------------------------------------------
// 1) VÉRIFICATION DU WEBHOOK (obligatoire pour que Meta accepte de le connecter)
// ---------------------------------------------------------------------
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === WHATSAPP_VERIFY_TOKEN) {
    console.log("Webhook vérifié avec succès.");
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

// ---------------------------------------------------------------------
// 2) RÉCEPTION DES MESSAGES
// ---------------------------------------------------------------------
app.post("/webhook", async (req, res) => {
  // On répond tout de suite à Meta pour éviter les timeouts/renvois.
  res.sendStatus(200);

  try {
    const entry = req.body.entry?.[0];
    const change = entry?.changes?.[0];
    const message = change?.value?.messages?.[0];
    if (!message) return; // ex: accusés de lecture, pas un vrai message entrant

    const from = message.from; // numéro du client
    const text = (message.text?.body || message.interactive?.button_reply?.title || "").trim();

    await routeMessage(from, text);
  } catch (err) {
    console.error("Erreur de traitement du webhook :", err);
  }
});

// ---------------------------------------------------------------------
// 3) ROUTEUR D'INTENTION
// ---------------------------------------------------------------------
async function routeMessage(from, text) {
  const session = sessions[from] || { step: null };
  const lower = text.toLowerCase();

  // Si l'utilisateur est déjà dans un flux (réservation en cours), on continue ce flux
  if (session.step && session.step.startsWith("booking_")) {
    return handleBookingFlow(from, text, session);
  }
  if (session.step === "awaiting_tracking_number") {
    return handleTrackingLookup(from, text, session);
  }

  // Sinon, détection de l'intention à partir du texte
  if (/suivi|colis|livraison|bordereau|track/.test(lower)) {
    sessions[from] = { step: "awaiting_tracking_number" };
    return sendText(from,
      "Bien sûr ! Peux-tu me donner ton numéro de bordereau (ex : JR2026001) ?");
  }

  if (/lou|véhicule|voiture|réserv|location/.test(lower)) {
    sessions[from] = { step: "booking_category" };
    const list = vehicles
      .filter(v => v.disponible)
      .map(v => `• ${v.categorie} — ${v.modele} (${v.tarif_jour})`)
      .join("\n");
    return sendText(from,
      `Voici les véhicules disponibles actuellement :\n\n${list}\n\nQuelle catégorie t'intéresse ?`);
  }

  if (/horaire|ouvert/.test(lower)) return sendText(from, faq.horaires);
  if (/zone|couvr|dolisie|nkayi|brazzaville/.test(lower)) return sendText(from, faq.zones);
  if (/paiement|payer|mobile money/.test(lower)) return sendText(from, faq.paiement);
  if (/document|permis|papier/.test(lower)) return sendText(from, faq.documents_location);
  if (/tarif.*transport|prix.*transport/.test(lower)) return sendText(from, faq.tarifs_transport);
  if (/tarif.*location|prix.*location/.test(lower)) return sendText(from, faq.tarifs_location);

  // Rien reconnu → menu d'accueil
  return sendText(from,
    "Bonjour, bienvenue chez JR NKOKOLO 👋\n\n" +
    "Je peux t'aider pour :\n" +
    "1️⃣ Suivre une livraison (écris \"suivi\")\n" +
    "2️⃣ Louer un véhicule (écris \"location\")\n" +
    "3️⃣ Infos horaires, zones, tarifs, paiement, documents\n\n" +
    "Dis-moi ce dont tu as besoin, ou écris \"agent\" pour parler à quelqu'un directement.");
}

// ---------------------------------------------------------------------
// 4) FLUX SUIVI DE LIVRAISON
// ---------------------------------------------------------------------
async function handleTrackingLookup(from, text, session) {
  const code = text.toUpperCase().replace(/\s/g, "");
  const info = tracking[code];

  delete sessions[from]; // fin du flux, retour au menu au prochain message

  if (!info) {
    return sendText(from,
      `Je ne retrouve pas de bordereau "${text}". Vérifie le numéro, ou écris "agent" pour qu'on t'aide directement.`);
  }

  return sendText(from,
    `📦 Bordereau ${code}\nStatut : ${info.statut}\n${info.etape}\n${info.eta}`);
}

// ---------------------------------------------------------------------
// 5) FLUX RÉSERVATION VÉHICULE (petite machine à états)
// ---------------------------------------------------------------------
async function handleBookingFlow(from, text, session) {
  if (session.step === "booking_category") {
    const match = vehicles.find(v =>
      v.disponible && (v.categorie.toLowerCase().includes(text.toLowerCase()) ||
        v.modele.toLowerCase().includes(text.toLowerCase())));

    if (!match) {
      return sendText(from, "Je ne trouve pas ce véhicule dans les disponibilités. Peux-tu réessayer (ex : SUV, Berline, 4x4) ?");
    }

    session.vehicule = match;
    session.step = "booking_dates";
    sessions[from] = session;
    return sendText(from,
      `Top, le ${match.modele} (${match.tarif_jour}) est disponible.\nPour quelles dates souhaites-tu le réserver ? (ex : du 25 au 28 août)`);
  }

  if (session.step === "booking_dates") {
    session.dates = text;
    session.step = "booking_name";
    sessions[from] = session;
    return sendText(from, "Merci. Peux-tu me donner ton nom complet pour la pré-réservation ?");
  }

  if (session.step === "booking_name") {
    session.nom = text;
    delete sessions[from];

    // 👉 Ici, en production : enregistrer la pré-réservation dans ta base
    // et notifier un agent JR NKOKOLO (email, Slack, autre WhatsApp interne...)
    console.log("Nouvelle pré-réservation :", {
      client: from, nom: session.nom, vehicule: session.vehicule.modele, dates: session.dates,
    });

    return sendText(from,
      `Récapitulatif de ta pré-réservation :\n` +
      `👤 ${session.nom}\n🚗 ${session.vehicule.modele} (${session.vehicule.tarif_jour})\n📅 ${session.dates}\n\n` +
      `Un agent JR NKOKOLO va te recontacter pour confirmer (pièces à fournir : identité + permis) et finaliser le paiement.`);
  }
}

// ---------------------------------------------------------------------
// 6) ENVOI DE MESSAGE VIA L'API WHATSAPP CLOUD
// ---------------------------------------------------------------------
async function sendText(to, body) {
  try {
    await axios.post(
      `https://graph.facebook.com/v20.0/${WHATSAPP_PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body },
      },
      { headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` } }
    );
  } catch (err) {
    console.error("Erreur d'envoi WhatsApp :", err.response?.data || err.message);
  }
}

app.listen(PORT, () => console.log(`Serveur JR NKOKOLO WhatsApp bot lancé sur le port ${PORT}`));
