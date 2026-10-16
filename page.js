"use strict";
// Page de test des lots 2.3 et 2.4 : aucune donnée n'est envoyée (voir la règle CSP dans index.html).
// Lecteur intégré (BarcodeDetector) quand il gère qr_code ; sinon bibliothèque ZXing (global ZXing).

const $ = (id) => document.getElementById(id);
const video = $("video");
const NOM_ZXING = "ZXing 0.23.0";

// État de la page
const etat = {
  https: window.isSecureContext,
  gum: !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia),
  bd: "BarcodeDetector" in window,
  zxing: typeof window.ZXing === "object", // la bibliothèque s'est-elle chargée ?
  formats: null,        // liste renvoyée par getSupportedFormats, ou null
  qr: false,            // le lecteur intégré gère-t-il qr_code ?
  lecteur: null,        // "intégré", NOM_ZXING ou null
  flux: null,           // flux de la caméra en cours
  session: 0,           // numéro de démarrage : empêche deux boucles de lecture en même temps
  tOuverture: null,     // ms, du clic à la première image
  tLecture: null,       // ms, de la première image à la première lecture
  nb: 0,                // lectures réussies
  tentatives: 0,        // tentatives de décodage
  dureeTotale: 0,       // ms cumulées des tentatives (pour la moyenne)
};

// --- Système et navigateur, tirés de navigator.userAgent ---
function systeme(ua) {
  let m;
  if ((m = ua.match(/Android\s([\d.]+)/))) return "Android " + m[1];
  if ((m = ua.match(/(iPhone|iPad|iPod).*? OS (\d+(?:_\d+)*)/))) return "iOS/iPadOS " + m[2].replace(/_/g, ".") + " (" + m[1] + ")";
  // Les iPad récents se présentent comme un Mac : on les reconnaît à l'écran tactile
  if (/Macintosh/.test(ua)) return navigator.maxTouchPoints > 1 ? "iPadOS (se présente comme macOS)" : "macOS";
  if ((m = ua.match(/Windows NT ([\d.]+)/))) return "Windows (NT " + m[1] + ")";
  if (/CrOS/.test(ua)) return "ChromeOS";
  if (/Linux/.test(ua)) return "Linux";
  return "inconnu";
}
function navigateur(ua) {
  // L'ordre compte : Edge, Opera et Samsung Internet contiennent aussi « Chrome »
  const regles = [
    [/SamsungBrowser\/([\d.]+)/, "Samsung Internet"], [/EdgA?\/([\d.]+)/, "Edge"],
    [/EdgiOS\/([\d.]+)/, "Edge (iOS)"], [/OPR\/([\d.]+)/, "Opera"],
    [/FxiOS\/([\d.]+)/, "Firefox (iOS)"], [/Firefox\/([\d.]+)/, "Firefox"],
    [/CriOS\/([\d.]+)/, "Chrome (iOS)"], [/Chrome\/([\d.]+)/, "Chrome"],
    [/Version\/([\d.]+).*Safari/, "Safari"],
  ];
  for (const [re, nom] of regles) { const m = ua.match(re); if (m) return nom + " " + m[1]; }
  return "inconnu";
}

// Affiche oui / non en couleur (textContent : jamais de HTML injecté)
function ouiNon(id, valeur) {
  const el = $(id);
  el.textContent = valeur ? "oui" : "non";
  el.className = valeur ? "ok" : "non";
}
const ms = (v) => (v === null ? "—" : Math.round(v) + " ms");
const moyenne = () => (etat.tentatives ? etat.dureeTotale / etat.tentatives : null);

// --- Résumé à copier ---
function majResume() {
  const ua = navigator.userAgent;
  const lignes = [
    "Test caméra QR — " + new Date().toISOString(),
    "Système : " + systeme(ua),
    "Navigateur : " + navigateur(ua),
    "HTTPS (isSecureContext) : " + (etat.https ? "oui" : "non"),
    "getUserMedia : " + (etat.gum ? "oui" : "non"),
    "BarcodeDetector : " + (etat.bd ? "oui" : "non"),
    "qr_code pris en charge : " + (etat.qr ? "oui" : "non"),
    "Bibliothèque ZXing chargée : " + (etat.zxing ? "oui" : "non"),
    "Forcer la bibliothèque : " + ($("forcer").checked ? "oui" : "non"),
    "Lecteur utilisé : " + (etat.lecteur || "aucun"),
    "Caméra obtenue : " + $("cameraObtenue").textContent,
    "Ouverture de la caméra : " + ms(etat.tOuverture),
    "Première lecture : " + (etat.tLecture === null ? "non lu" : ms(etat.tLecture)),
    "Durée moyenne d'une tentative : " + ms(moyenne()) + " (" + etat.tentatives + " tentatives)",
    "Erreur : " + ($("erreur").textContent || "aucune"),
    "userAgent : " + ua,
  ];
  $("resume").value = lignes.join("\n");
}

// --- Diagnostic au chargement ---
async function diagnostic() {
  const ua = navigator.userAgent;
  $("systeme").textContent = systeme(ua);
  $("navigateur").textContent = navigateur(ua);
  ouiNon("https", etat.https);
  ouiNon("gum", etat.gum);
  ouiNon("bd", etat.bd);
  if (etat.bd) {
    try {
      etat.formats = await BarcodeDetector.getSupportedFormats();
      $("formats").textContent = etat.formats.length ? etat.formats.join(", ") : "(aucun)";
      etat.qr = etat.formats.includes("qr_code");
    } catch (e) {
      $("formats").textContent = "erreur : " + e.message;
    }
  } else {
    $("formats").textContent = "—";
  }
  ouiNon("qr", etat.qr);
  ouiNon("zxing", etat.zxing);
  if (!etat.gum) erreur(etat.https ? "getUserMedia indisponible dans ce navigateur."
                                  : "getUserMedia indisponible : la page doit être en HTTPS.");
  majResume();
}

function erreur(message) { $("erreur").textContent = message; majResume(); }

// Traduit les erreurs de getUserMedia en français
function messageCamera(e) {
  switch (e.name) {
    case "NotAllowedError":
    case "SecurityError": return "Permission refusée : autorisez la caméra dans les réglages du navigateur.";
    case "NotFoundError":
    case "OverconstrainedError": return "Aucune caméra trouvée.";
    case "NotReadableError":
    case "AbortError": return "Caméra déjà utilisée par une autre application.";
    default: return "Erreur inattendue de la caméra : " + e.name + " (" + e.message + ")";
  }
}

// Ouvre la caméra arrière en 1280×720 si possible ; sinon, repli sans résolution demandée
async function ouvrirCamera() {
  const arriere = { facingMode: { ideal: "environment" } };
  try {
    return await navigator.mediaDevices.getUserMedia({ video: { ...arriere, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
  } catch (e) {
    if (e.name !== "OverconstrainedError") throw e;
    return await navigator.mediaDevices.getUserMedia({ video: arriere, audio: false });
  }
}

// Attend que la vidéo affiche sa première image
function premiereImage() {
  return new Promise((ok) => {
    if ("requestVideoFrameCallback" in video) video.requestVideoFrameCallback(() => ok());
    else if (video.readyState >= 2) ok();
    else video.addEventListener("loadeddata", () => ok(), { once: true });
  });
}

// --- Les deux lecteurs : chacun renvoie le texte lu, ou null si aucun QR dans l'image ---

// Lecteur intégré du navigateur
function lecteurIntegre() {
  const detecteur = new BarcodeDetector({ formats: ["qr_code"] });
  return async () => {
    const codes = await detecteur.detect(video);
    return codes.length ? codes[0].rawValue : null;
  };
}

// Bibliothèque ZXing : on copie l'image de la vidéo dans un canvas, puis on la décode
function lecteurZXing() {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true }); // lectures fréquentes de pixels
  const lecteur = new ZXing.QRCodeReader();
  return async () => {
    if (!video.videoWidth) return null; // image pas encore prête
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0);
    const image = new ZXing.BinaryBitmap(new ZXing.HybridBinarizer(new ZXing.HTMLCanvasElementLuminanceSource(canvas)));
    try {
      return lecteur.decode(image).getText();
    } catch (e) {
      // Ces trois erreurs veulent dire « pas de QR lisible dans cette image » : on réessaiera
      if (e instanceof ZXing.NotFoundException || e instanceof ZXing.ChecksumException || e instanceof ZXing.FormatException) return null;
      throw e; // toute autre erreur est un vrai problème
    }
  };
}

// --- Démarrer la caméra ---
async function demarrer() {
  erreur("");
  if (!etat.gum) { diagnostic(); return; }
  $("demarrer").disabled = true;
  $("forcer").disabled = true;
  etat.tOuverture = etat.tLecture = etat.lecteur = null;
  etat.nb = etat.tentatives = etat.dureeTotale = 0;
  for (const id of ["tOuverture", "tLecture", "texteLu", "tMoyenne", "lecteur"]) $(id).textContent = "—";
  $("nbLectures").textContent = "0";
  const session = ++etat.session;
  const t0 = performance.now();
  try {
    etat.flux = await ouvrirCamera();
  } catch (e) {
    erreur(messageCamera(e));
    $("demarrer").disabled = $("forcer").disabled = false;
    return;
  }
  const piste = etat.flux.getVideoTracks()[0];
  const reglages = piste && piste.getSettings ? piste.getSettings() : {};
  $("cameraObtenue").textContent = (reglages.facingMode || "non indiqué par le navigateur") +
    (reglages.width ? " — " + reglages.width + "×" + reglages.height : "");
  video.srcObject = etat.flux;
  try { await video.play(); } catch (e) { erreur("La vidéo ne démarre pas : " + e.message); }
  await premiereImage();
  etat.tOuverture = performance.now() - t0;
  $("tOuverture").textContent = ms(etat.tOuverture);
  $("arreter").disabled = false;

  // Choix du lecteur : intégré s'il gère qr_code (sauf si on force la bibliothèque), sinon ZXing
  let decoder = null;
  if (etat.qr && !$("forcer").checked) { etat.lecteur = "intégré"; decoder = lecteurIntegre(); }
  else if (etat.zxing) { etat.lecteur = NOM_ZXING; decoder = lecteurZXing(); }
  else erreur("Aucun lecteur : pas de lecteur intégré pour qr_code, et la bibliothèque ZXing ne s'est pas chargée.");
  $("lecteur").textContent = etat.lecteur || "aucun";
  if (decoder) lire(decoder, session, performance.now());
  majResume();
}

// --- Lecture en continu : une tentative à la fois, environ toutes les 150 ms ---
async function lire(decoder, session, tDebut) {
  if (session !== etat.session || !etat.flux) return; // caméra arrêtée ou redémarrée
  const t = performance.now();
  try {
    const texte = await decoder();
    if (session !== etat.session) return;
    etat.tentatives++;
    etat.dureeTotale += performance.now() - t;
    $("tMoyenne").textContent = ms(moyenne()) + " (" + etat.tentatives + " tentatives)";
    if (texte !== null) {
      if (etat.tLecture === null) {
        etat.tLecture = performance.now() - tDebut;
        $("tLecture").textContent = ms(etat.tLecture);
      }
      etat.nb++;
      $("nbLectures").textContent = String(etat.nb);
      $("texteLu").textContent = texte; // textContent : le contenu du QR n'est jamais interprété comme du HTML
      majResume();
    }
  } catch (e) {
    // Lecteur intégré : image pas encore prête, on réessaie. ZXing : erreur inattendue, on l'affiche.
    if (etat.lecteur === NOM_ZXING) erreur("Erreur de la bibliothèque : " + e.message);
  }
  setTimeout(() => lire(decoder, session, tDebut), 150);
}

// --- Arrêter la caméra ---
function arreter() {
  etat.session++; // arrête la boucle de lecture
  if (etat.flux) etat.flux.getTracks().forEach((p) => p.stop());
  etat.flux = null;
  video.srcObject = null;
  $("arreter").disabled = true;
  $("demarrer").disabled = $("forcer").disabled = false;
  majResume();
}

// --- Copier le résumé ---
async function copier() {
  majResume();
  try {
    await navigator.clipboard.writeText($("resume").value);
    $("copieEtat").textContent = "Résumé copié.";
  } catch (e) {
    $("resume").select();
    $("copieEtat").textContent = "Copie automatique impossible : le texte est sélectionné, copiez-le à la main.";
  }
}

$("demarrer").addEventListener("click", demarrer);
$("arreter").addEventListener("click", arreter);
$("copier").addEventListener("click", copier);
$("forcer").addEventListener("change", majResume);
// Page passée en arrière-plan : on coupe la caméra pour ne pas la laisser allumée
document.addEventListener("visibilitychange", () => { if (document.hidden && etat.flux) arreter(); });
diagnostic();
